# Plan Perbaikan — Viewer Gambar Kerja: Flicker, Kanan Terpotong, Hilang Saat Pan

**Tanggal:** 2026-08-02
**Repositori:** `G:\paax-ai-contextual-integration`
**Branch aktif:** `codex/sheet-navigation-gallery-viewer-performance`
**Status analisa:** `SELESAI — berbasis testing web real (Playwright headless) terhadap stack resmi`
**Komit runtime terverifikasi:** `5c26706a` (6/6 health endpoint OK, artifact PDF canonical 25.795.295 byte `%PDF-`, thumbnail nyata)

---

## 1. Ringkasan Eksekutif

Gejala yang dilaporkan pengguna — *review gambar kerja dari sheet utama: viewer berkedip-kedip, bagian kanan terpotong/hilang, tidak mulus saat pan kiri-kanan* — **terkonfirmasi ter-reproduksi** di browser nyata (headless Chromium, viewport 1440×900, stack resmi 6 service). Empat akar masalah ditemukan, satu di antaranya **bug logika deterministik** yang membuat sisi kanan halaman **permanen kosong**:

| # | Akar Masalah | Efek Terukur di Browser | Prioritas |
|---|--------------|--------------------------|-----------|
| RC1 | Heuristik viewport `width<=1 && height<=1` salah klasifikasi (bug deterministik) | Saat fit zoom (45%): hanya **1 tile canvas** ter-render, cakupan **85,98% lebar** → sisi kanan ~14% blank; pan tidak bisa memunculkannya; baru pulih bila zoom ≥ ~70% | **KRITIS** |
| RC2 | Churn tile lifecycle: tile dihapus seketika saat viewport berubah, tile baru render sekuensial di worker (ratusan ms/tile) | Blank-flash antar tile saat zoom step; pop-in bertahap | **TINGGI** |
| RC3 | First-paint lambat: fetch+parse PDF 25MB di worker sebelum apa pun tampil (~54 dtk di headless) | "Loading original PDF…" lama, lalu satu tile blur muncul | **SEDANG** |
| RC4 | Double-fit + reset `pdfMetrics=null` tiap ganti sheet → viewport melompat 2× | Flicker setiap navigasi antar sheet | **SEDANG** |

---

## 2. Evidence Testing Web Real (Playwright)

Stack dijalankan sesuai `PANDUAN_INSTALASI_DAN_MENJALANKAN_SEMUA_SERVER_PAAX.md` (Start-PLHUT-Local, build production, 6/6 health OK). Flow: buka `/drawing-intelligence?projectId=PLHUT-SURAKARTA` → klik sheet `p.1` di navigator.

### 2.1. Status muat PDF
- `artifact-url` POST → HTTP 200, token OK.
- `artifact?token=…` GET → HTTP 200, **25.795.295 byte**, content-type PDF.
- Tidak ada console error / pageerror. PdfPageLayer menampilkan `Loading original PDF…` selama **±54 detik** (headless) sebelum metrics tiba — tanpa placeholder progresif.

### 2.2. Kondisi fit zoom (default saat buka sheet) — BUG RC1
```
container : 722 × 694 px
page div  : 1400 × 989,9 px (aspect PDF 1191:842)  transform: translate(48px,125.7px) scale(0.447143)
viewport  : w = 722/0.447/1400 = 1.153   h = 694/0.447/990 = 1.568   → w>1 && h>1
heuristic : width<=1 && height<=1 → FALSE → memakai cabang LOGICAL (salah)
tile      : 1 canvas — left 0%, top 0%, width 85.9782%, height 100%, bitmap 512×421, density 0.5
```
Artinya `PdfTilePyramid.visibleTiles` menerima viewport yang dianggap ~1,15×1,57 **poin PDF** → kolom tile kanan (yang dimulai di x=512px) tidak pernah diminta → **14% kanan halaman tanpa tile**, dan seluruh halaman macet di tile low-res density 0.5.

### 2.3. Perilaku pan & zoom (state fit)
```
START    n=1 tile  maxRight=85.98%   zoom 45%
PAN→ (geser 200px, lepas) n tetap 1, maxRight tetap 85.98%   ← kanan tak pernah muncul, blur permanen
WHEEL+  zoom 50% → n=3, maxRight 85.98%
WHEEL+  zoom 56% → n=4, maxRight 85.98%
WHEEL+  zoom 63% → n=5, maxRight 85.98%   ← masih cabang LOGICAL (h masih >1)
```
Sisi kanan **tidak recoverable** lewat pan maupun zoom sampai h≤1 (~zoom 70%). Di zoom 100% (Ctrl+1) branch berbalik NORMALIZED → **7 tile lengkap** → terbukti bug-nya di klasifikasi viewport, bukan di renderer.

### 2.4. Catatan pendukung
- Pan selama drag memakai CSS transform (`pageTransformRef`) → mulus; masalah muncul **setelah pointerup** (commit pan → viewport berubah → tile churn) dan saat wheel zoom.
- Semua test unit `pdf-page-layer.test.tsx` memakai viewport `w≤1,h≤1` → bug RC1 **tidak tercakup test** (blind spot).

---

## 3. Root Cause Analysis (Detail)

### RC1 — Heuristik viewport buggy (KRITIS)
`apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.tsx:179-183`
```ts
const logicalViewport: PdfLogicalViewport =
  viewport.width <= 1 && viewport.height <= 1
    ? toLogicalViewport(viewport as NormalizedViewport, metrics)
    : (viewport as PdfLogicalViewport);   // ← BUG: viewport >1 (zoom-out/fit) dianggap sudah logical
```
- `DrawingCanvas` (satu-satunya konsumen, `drawing-canvas.tsx:254-263,319-325`) **selalu** mengirim viewport ternormalisasi (fraksi 0..N terhadap baseW×baseH=1400×~990).
- Saat fit zoom pada container lebar, `w = clientWidth/zoom/1400 > 1` (terukur 1.153) dan/atau `h > 1` (terukur 1.568) — **kondisi normal, bukan pengecualian**.
- Konsekuensi di `pdf-tile-pyramid.ts:105-146`: viewport ~1 poin → `right = ceil(1.15×density) ≈ 2-5px` → hanya tile kolom 0 yang diminta; sisa halaman tak pernah dirender.
- Fix RC1 di §4.1 menghapus heuristik sama sekali (kontrak prop eksplisit), bukan menambah ambang.

### RC2 — Churn tile saat viewport berubah (TINGGI)
`pdf-page-layer.tsx:172-287`:
- Efek render mengeksekusi ulang pada **setiap perubahan objek `viewport`** (termasuk setiap langkah wheel-zoom dan setiap pointerup pan) tanpa debounce → `setPainted` menghapus tile di luar `desiredKeys` **seketika** (baris 198-208), padahal penggantinya belum siap.
- Render tile di worker **serial** per worker: `pdf-tile.worker.ts:226` `entry.chain = entry.chain.then(render)` → N tile × (100-500ms) = progresif pop-in, terlihat sebagai kedipan.
- Detail pass 125ms (`pdf-page-layer.tsx:276-282`) menambah swap resolusi (pop tajam).
- Fix RC2 di §4.2: debounce/coalesce viewport effect, retain-window untuk tile lama sampai pengganti siap, dan paralelisasi rantai render worker.

### RC3 — First-paint lambat (SEDANG)
- `fetchPdfBinary` (`pdf-binary-cache.ts:58-122`) fetch 25MB (instant di localhost, ±1-2 dtk) lalu `pool.open` → worker `pdfjs.getDocument` parse 25MB/88 halaman ±50 dtk di headless sebelum `document-ready` → selama itu UI hanya teks "Loading original PDF…".
- Fix RC3 di §4.3: paint overview tile (density 0.25) segera saat metrics tiba + placeholder thumbnail sebagai latar selama parse (bukan blocker).

### RC4 — Double-fit tiap navigasi sheet (SEDANG)
`drawing-canvas.tsx:106-117`:
- `setPdfMetrics(null)` + `fitSheet()` (pakai aspect dari thumbnail `mappedSheet.widthPx/heightPx`) → saat metrics PDF asli tiba, aspect berubah → `fitSheet()` kedua → viewport melompat → tile di-request ulang. Pada navigasi antar sheet beruntun (dari sheet utama/gallery) ini terlihat sebagai kedipan ganda.
- Fix RC4 di §4.4: pakai aspect PDF sejak awal bila tersedia, jangan reset pdfMetrics saat sheet berganti (tandai stale via `runId`), dan hanya refit sekali.

---

## 4. Desain Perbaikan

### 4.1. RC1 — Kontrak viewport eksplisit (hapus heuristik)
**File:** `pdf-page-layer.tsx`, `drawing-canvas.tsx`, `pdf-tile-pyramid.ts` (types), test terkait.

1. Tambah prop eksplisit `viewportSpace?: 'normalized' | 'logical'` (default `'normalized'`) di `PdfPageLayerProps`.
2. Hapus cabang heuristik; logika menjadi:
   ```ts
   const logicalViewport = viewportSpace === 'logical'
     ? (viewport as PdfLogicalViewport)
     : toLogicalViewport(viewport as NormalizedViewport, metrics);
   ```
3. `DrawingCanvas` menyerahkan `viewportSpace="normalized"` (explicit, no ambiguity).
4. Back-compat: jika prop tidak diberikan, default `'normalized'` — kontrak lama test (`w=1,h=1`) tetap berlaku; test lama tidak perlu diubah selain tambahan kasus baru.
5. **Regression test wajib baru** (unit, `pdf-page-layer.test.tsx`):
   - viewport `{x:-0.08, y:0, width:1.15, height:1.57, zoom:0.447, dpr:1}` pada metrics 1191×842 → **≥2 kolom tile**, cakupan kanan ≈ 100%.
   - viewport `width:1.03, height:0.9` (h>1 saja) → tetap full coverage.
   - viewport `width:1, height:1` (kasus lama) → tetap 1 tile awal (regresi).
   - pan kanan pada state fit → tile baru muncul di kanan (coverage meluas).

### 4.2. RC2 — Lifecycle tile anti-flicker
**File:** `pdf-page-layer.tsx`, `pdf-tile.worker.ts`, `pdf-tile-pool.ts`.

1. **Coalesce/debounce viewport effect** (~80-120ms rAF/settled) sehingga perubahan viewport cepat (wheel/pan) tidak memicu evict+request per frame.
2. **Retain-window eviction**: jangan hapus tile dari `painted` seketika; tandai `stale` dan hapus hanya setelah penggantinya sudah `cache.has` (painted swap) atau setelah timeout singkat (mis. 250ms tanpa penggantian) — menghilangkan blank-flash.
3. **Detail pass**: tetap 125ms, tapi jangan hapus low-res yang masih dibutuhkan; jadikan upgrade (sudah ada mekanisme revision) tanpa unmount.
4. **Paralelkan render worker**: ganti `entry.chain.then(render)` serial dengan concurrency kecil (mis. 2 per worker, antrean FIFO) — memangkas waktu pop-in beruntun. Hati-hati: tetap hormati `cancelled`/`close-document`.
5. Test unit: `pdf-tile-pool.test.ts` — verifikasi request terbatas saat viewport berubah cepat (coalesce), dan `pdf-tile.worker` tidak mencampur urutan page.

### 4.3. RC3 — First-paint lebih cepat
**File:** `pdf-page-layer.tsx`.

1. Saat `metrics` tiba, **segera paint overview tile density 0.25** (utuh, 1-2 tile) tanpa menunggu request selesai — hapus kondisi yang menahan paint sebelum tile detail.
2. Placeholder: selama `Loading original PDF…`, tampilkan `CanonicalSheetThumbnail` (sudah ada) sebagai latar agar tidak terlihat kosong (opsional, non-blocker).
3. Ukur & catat waktu open di `performance-metrics.ts` untuk baseline regresi (opsional, jangan jadi gate keras).

### 4.4. RC4 — Satu fit per sheet
**File:** `drawing-canvas.tsx`.

1. Jangan `setPdfMetrics(null)` saat `activeSheetId` berganti; simpan `pdfMetricsByRunId` (Map `runId → metrics`) agar sheet yang sama tidak refit dua kali saat dibuka ulang.
2. `fitSheet` sekali memakai aspect terbaik yang tersedia: metrics PDF (bila ada) → thumbnail → fallback 1.
3. Pertahankan `userAdjustedRef` guard yang ada (jangan refit jika user sudah zoom/pan manual).

---

## 5. Strategi Testing & Verifikasi

### 5.1. Unit (vitest) — wajib hijau sebelum commit
```powershell
pnpm --dir apps/web test pdf-page-layer pdf-tile-pool pdf-tile-pyramid
pnpm --dir apps/web test           # full suite (harapan 317+ nol regresi)
npx --dir apps/web tsc --noEmit    # typecheck bersih
```
- Anchor nilai acuan manual: metrics 1191×842, density grid 0.5/1/2/4, tile 512px → ekspektasi kolom tile pada viewport normalized `{x:-0.08,y:0,w:1.15,h:1.57}` = kolom 0 & 1.

### 5.2. E2E browser (stack nyata, sesuai PANDUAN)
Spec baru: `apps/web/e2e/drawing-intelligence-canvas-coverage.spec.ts`
1. Buka p.1 → tunggu `pdf-page-layer` → asersi **cakupan kanan ≥ 99%** & jumlah tile ≥ 2 pada fit zoom.
2. Pan kanan 200px → asersi coverage tidak mengecil, tidak ada gap baru.
3. Wheel zoom 3 step → sampel `canvas` count setiap 300ms → asersi **tidak ada jendela tile count = 0** (anti blank-flash), coverage kanan terjaga.
4. Navigasi p.1 → p.2 → p.1 → asersi tidak ada flash "Loading" kedua pada p.1 (cache metrics).
5. Screenshot bukti ke `e2e/results/`.
6. Jalankan: `pnpm --dir apps/web exec playwright test e2e/drawing-intelligence-canvas-coverage.spec.ts` (stack harus start dulu).

### 5.3. Verifikasi manual oleh owner
- Buka sheet utama → gambar tampil penuh (kanan sampai ujung) saat fit.
- Pan kiri-kanan mulus tanpa kedip; zoom-in/out tidak pernah blank total.
- Ganti sheet cepat → tidak ada kedip ganda.
- DevTools: tidak ada 4xx/5xx `artifact-url`/`artifact`/`thumbnail`; console bersih.

### 5.4. Ganti rugi (guardrail)
- Tetap: angka quantity tidak tersentuh (Aturan Emas); perubahan murni rendering viewer.
- Memory: LRU 96MB & `protectedKeys` dipertahankan; eviction hanya ditunda, tidak dihilangkan.

---

## 6. Urutan Eksekusi

1. Branch: lanjut di `codex/sheet-navigation-gallery-viewer-performance` (sudah ada, sesuai gerbang review AGENTS.md). **Tidak commit langsung ke main.**
2. RC1 (kontrak viewport + test) → jalankan unit → commit 1.
3. RC4 (fit-satu-kali) → unit + manual → commit 2.
4. RC2 (coalesce + retain-window + paralel worker) → unit → commit 3.
5. RC3 (overview dini + placeholder) → unit → commit 4.
6. Build production: `pnpm --dir apps/web build` → restart stack resmi (Stop→Start) → health 6 endpoint.
7. Jalankan E2E spec baru + spec lama (`feedback1`, `sheet-views`) → hijau.
8. Screenshot bukti; **push branch → buka PR → BERHENTI** (tunggu review owner + Claude; jangan merge sendiri).

## 7. Risiko & Mitigasi

| Risiko | Mitigasi |
|--------|----------|
| Paralel worker memicu race page/doc | Pertahankan `cancelled` set + `close-document` handling; concurrency ≤2/worker; test pool diperluas |
| Retain-window menahan memori | Window ≤250ms + batas byte LRU tetap; test memori tile-pool |
| Perubahan kontrak prop merusak test lama | Default `normalized`; semua test lama tetap pakai nilai yang sama |
| Build stale setelah edit frontend | Wajib `pnpm --dir apps/web build` + restart stack sebelum E2E (PANDUAN §6/§17) |
| PANDUAN mewajibkan worktree bersih untuk audit final | Kerjakan dari branch ini; `GEMINI.md`/`docs/audits/` yang sudah ada di worktree bukan bagian perubahan ini — tidak di-touch |

## 8. File yang Terkena Dampak

| File | Perubahan |
|------|-----------|
| `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.tsx` | viewportSpace prop; hapus heuristik; retain-window; overview dini; debounce |
| `apps/web/src/components/drawing-intelligence/workspace/canvas/drawing-canvas.tsx` | `viewportSpace="normalized"`; single-fit per runId (RC4) |
| `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile.worker.ts` | render concurrency (RC2) |
| `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pool.ts` | (opsional) dukung koalesce request |
| `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pyramid.ts` | (opsional) helper/type `viewportSpace`; test kolom tepi |
| `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.test.tsx` | kasus viewport w>1/h>1, pan, retain-window |
| `apps/web/e2e/drawing-intelligence-canvas-coverage.spec.ts` | **baru** — spec E2E coverage/flicker |
| `docs/plans/…` | salinan dokumen plan ini (saat eksekusi dimulai) |
