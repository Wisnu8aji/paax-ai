# Laporan Final — Fix Viewer Gambar Kerja: Flicker, Kanan Terpotong, Tidak Mulus

**Tanggal:** 2026-08-02
**Repositori:** `G:\paax-ai-contextual-integration`
**Branch:** `codex/sheet-navigation-gallery-viewer-performance` (gerbang review AGENTS.md — tidak commit ke main)
**Status:** Implementasi selesai; unit/typecheck/build hijau; E2E real-browser run pertama 4/4 hijau; run ulang terhalang masalah lingkungan (dibuktikan bukan regresi kode — §9 & §10).

---

## 0. Jujur tentang kendala eksekusi & alasan sesi sering terinterupsi

Laporan ini ditulis dengan transparansi penuh. Berikut semua masalah operasional yang dihadapi selama eksekusi, mengapa tampak "stuck", dan apa yang dilakukan:

### 0.1 Output proses anak PowerShell tertelan → terlihat "stuck"

- Lingkungan eksekusi saya: tool bash = **Windows PowerShell 5.1**. Ada pola yang berulang: perintah yang memanggil `powershell.exe -File .\scripts\portable\Start-PLHUT-Local.ps1 ...` (script resmi PAAX) **sering mengembalikan output kosong** meskipun script berjalan normal.
- Penyebab teknis yang diidentifikasi: script resmi mendaftarkan `Register-ObjectEvent` untuk log background dan meluncurkan proses service via `ProcessStartInfo`; pada PowerShell 5.1, output `Write-Host` dari proses anak `powershell.exe` yang dipanggil bersarang sering tertunda/tertelan sampai proses selesai atau tidak diteruskan ke pipeline tool sama sekali. Akibatnya tool menampilkan tidak ada output sama sekali selama menit-menit → **tampak "stuck" tanpa aktivitas**.
- Dampak: pada 2–3 titik, pengguna melihat sesi diam dan menginterupsi/membatalkan perintah, padahal perintah tersebut sedang berjalan di latar belakang (contoh nyata: start web yang "tampak kosong" ternyata BERHASIL dan menulis `web.pid`; baru terbukti saat verifikasi selanjutnya).
- Perbaikan proses kerja yang saya terapkan setelahnya: (a) semua perintah panjang dialihkan ke file log (`*> log.txt`) lalu dibaca dengan perintah terpisah yang sederhana; (b) verifikasi status selalu dengan perintah pendek yang pasti ber-output (probe); (c) pekerjaan panjang didelegasikan ke agent eksekutor agar sesi utama tidak tampak diam.

### 0.2 Debug E2E memakan waktu lama

- Beberapa sesi debug browser (Playwright) berjalan 2–4 menit per sesi tanpa output antara (hanya polling internal), yang kembali membuat sesi tampak diam. Salah satu sesi debug di-abort oleh pengguna (`User aborted the command`), dan satu task agent eksekutor di-cancel.
- Setelah itu saya mengubah strategi: semua hasil debug ditulis ke file lalu dibaca sekali (bukan streaming), dan setiap langkah diakhiri dengan output status singkat.

### 0.3 Restart stack yang tidak benar-benar menggantikan server (bug prosedural)

- Saat melakukan "restart web" untuk memuat build baru, server `next start` lama (PID 10320) ternyata TIDAK mati oleh prosedur stop pertama saya (pola proses cmd/pnpm/next yang berbeda-beda). Akibatnya instance baru gagal bind port 3000 dan **server lama terus melayani** — setelah rebuild bersih `.next`, HTML lama mereferensikan chunk yang sudah dihapus → **HTTP 400 untuk semua chunk JS → halaman tidak pernah render → semua E2E timeout menunggu `pdf-page-layer`**.
- Ini bukan bug kode viewer; murni prosedur restart. Solusi: membunuh seluruh pohon proses listener (`walk ParentProcessId`), verifikasi "port 3000 free", lalu start ulang via script resmi. Terbukti berhasil: halaman kembali normal (tablist count=1, zero error).

### 0.4 Kegagalan E2E run ulang — uji banding dengan HEAD (bukti jujur)

- Setelah stack stabil, E2E **tetap** gagal: `pdf-page-layer` tidak pernah mount (90–120 detik), tanpa pageerror, tanpa request `artifact-url`.
- Untuk membuktikan apakah ini regresi dari kode saya: **seluruh perubahan canvas di-`git stash`, rebuild, restart, dan jalankan E2E yang sama → GAGAL DENGAN PESAN IDENTIK**. Kesimpulan jujur: kegagalan run ulang bukan berasal dari perubahan kode ini, melainkan kondisi runtime (state session/workspace di DB yang terbentuk selama sesi restart/klik berulang). Perubahan kode tidak menyentuh jalur mount `PdfPageLayer`.
- Konsekuensi jujur: **satu kriteria "E2E final hijau" belum dapat dibuktikan ulang pada kondisi lingkungan saat ini**; bukti hijau yang sah adalah run pertama (4/4 PASS) sebelum stack di-restart berulang kali. Status ini dicatat di §11 sebagai risiko.

---

## 1. Root cause yang terbukti

| # | Root Cause | Bukti |
|---|-----------|-------|
| RC1 | Heuristik viewport `width<=1 && height<=1` di `pdf-page-layer.tsx` salah klasifikasi viewport normalized fit (w=1.153, h=1.568) sebagai logical/page-space → hanya kolom tile 0 diminta → coverage kanan 85,98% / 42,99% | Regression test P0 dibuat DULU dan GAGAL dengan nilai **0.8597** dan **0.4299** — persis ukuran browser di plan DeepSeek; setelah kontrak `viewportSpace` test hijau (≥99%) |
| RC2 | Tile lama dihapus seketika saat viewport berubah, tile pengganti render serial per worker (100–500ms) → blank flash/pop-in; `cache.has(key)` menahan stale canvas SELAMANYA (kebocoran DOM canvas) | Test P1 retain-window dibuat DULU dan GAGAL (stale tile tidak pernah dihapus); setelah render-generation test hijau |
| RC3 | First paint menunggu fetch+parse PDF penuh; saat ganti sheet dengan metrics ter-cache, layer kosong tanpa underlay | Ditutup: thumbnail underlay + `onFirstPaint` (§6) |
| RC4 | Double-fit: `setPdfMetrics(null)` tiap ganti sheet + refit kedua saat metrics PDF tiba → lompatan 2× | Ditutup: cache metrics per `runId:pageIndex` + fit aspect eksplisit |

## 2. Kondisi dirty worktree sebelum implementasi

Perubahan existing (investigasi DeepSeek) sudah ada di worktree saat saya mulai:

- `drawing-canvas.tsx` — guard refit aspect (>0.005) + `activePan` setState per rAF.
- `pdf-page-layer.tsx` — overscan 0.35 hardcode + eviction `!desiredKeys && !cache.has(key)`.
- `pdf-tile-pyramid.ts` — parameter `overscanMarginPct`.
- `GEMINI.md` — audit site-agent (di luar scope viewer; **tidak di-touch, tidak ikut di-commit**).
- Untracked: `.opencode/`, `docs/audits/`, 3 dokumen plan.

## 3. Perubahan existing: dipertahankan / diperbaiki / ditolak

| Perubahan existing | Keputusan | Alasan |
|--------------------|-----------|--------|
| Overscan 0.35 | **Dipertahankan** (dinormalisasi jadi konstanta `OVERSCAN_MARGIN_PCT` ber-dokumentasi) | Diperbolehkan SETELAH coordinate-space benar (P4); bukan pengganti fix RC1 |
| Eviction `!cache.has(key)` | **Ditolak** | Melanggar P1 "jangan mempertahankan stale canvas hanya karena cache.has(key)" — stale canvas ditahan selamanya |
| `activePan` setState per rAF | **Ditolak** (diganti throttled 100ms) | Melanggar P2 "hindari setState per rAF yang memicu rerender subtree canvas" |
| Guard refit aspect 0.005 | **Dipertahankan + diperkuat** | Kini fit memakai aspect eksplisit dari cached metrics (fix hasil review QC) |
| `GEMINI.md` | **Tidak disentuh** | Di luar scope viewer |

## 4. File & simbol yang diubah (lengkap)

| File | Perubahan |
|------|-----------|
| `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.tsx` | Type `ViewportSpace`; prop `viewportSpace` (default `'normalized'`); prop `onFirstPaint`; `PaintedEntry {tile, revision, generation, paintedAt}`; heuristik width/height Dihapus; eviction generation-aware + retain window + guard anti-zero-visible (`newGenHasCoverage \|\| next.size > 1`) di pass render DAN di eviction timer; konstanta export `VIEWPORT_RETAIN_MS=250`, `VIEWPORT_EVICT_RETRY_MS=100`, `DETAIL_PASS_MS=125`, `OVERSCAN_MARGIN_PCT=0.35`; efek `onFirstPaint` sekali per dokumen (guard key prefix `documentKey:`); reset latch di open effect |
| `apps/web/src/components/drawing-intelligence/workspace/canvas/drawing-canvas.tsx` | `viewportSpace="normalized"`; `LIVE_VIEWPORT_SYNC_MS=100` livePan throttled (hapus setState per rAF); `metricsCacheRef` per `runId:pageIndex`; `fitSheet(metricsOverride?)` dengan aspect eksplisit via `computeAspect`; `layerPainted` + `handleFirstPaint`; underlay thumbnail (`!layerPainted`); memo(CanvasToolbar, ZoomBar, Minimap, SelectionContextBar, RealPageSvg, SheetPlanSvg) + stabilisasi props (`canvasElements`, `handleSelectElement`, `handleHoverElement`, `handleMinimapNavigate`, `handleZoomIn/Out`, `handleActualSize`); `onDoubleClick={() => fitSheet()}` |
| `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile.worker.ts` | Ganti `chain` serial → `renderQueue` FIFO + `pumpRenders` concurrency 2 (`MAX_RENDER_CONCURRENCY`); cancel-aware saat dequeue & run; `closeDocument` mem-prune queue run yang ditutup; komentar diperbaiki (guard pdf.js per canvas, bukan per page) |
| `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pyramid.ts` | (existing) param `overscanMarginPct` dipertahankan apa adanya |
| `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.test.tsx` | +2 test P0 (coverage ≥99% untuk w>1&&h>1 dan w>1,h≤1), +3 test P1 (retain window bounded; hold saat request in-flight; `onFirstPaint` tepat sekali per dokumen) — semua dibuat dulu & dibuktikan gagal sebelum fix |
| `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pyramid.test.ts` | helper `rightCoverage` + 3 anchor P0 (fit viewport w>1/h>1; w>1/h≤1; kasus 1×1 legacy) |
| `apps/web/e2e/drawing-intelligence-canvas-coverage.spec.ts` | **Baru** — 4 test E2E: (1) fit zoom coverage kanan ≥99% & ≥2 kolom; (2) pan ±240/±480px coverage tidak mengecil & tidak ada zero-visible frame; (3) wheel zoom 6 langkah tanpa zero-visible frame; (4) navigasi p.1→p.2→p.1 tanpa loading ulang; plus screenshot bukti + koleksi pageerror |
| `docs/plans/2026-08-02-final-fix-viewer-flicker-right-crop.md` | **Baru** — laporan ini |

## 5. Desain `viewportSpace`

```typescript
type ViewportSpace = 'normalized' | 'logical';
```
- Kontrak eksplisit pada prop (default `'normalized'`); DrawingCanvas selalu mengirim fraksi ternormalisasi terhadap baseW/baseH (`viewportSpace="normalized"`).
- Heuristik `width<=1 && height<=1` **dihapus total** — regression test membuktikan kasus w=1.153/h=1.568 (fit zoom, kondisi normal) dan w=1.03/h=0.9.
- Fallback kompatibilitas: default `'normalized'` membuat semua call-site lama dan semua test lama tetap valid tanpa perubahan.
- Regression test P0 (anchor manual): metrics 1191×842, density 0.5, tile 512px → viewport normalized `{x:-0.08,y:0,w:1.153,h:1.568}` → `toLogicalViewport` → 2 kolom → right = (512+84)/0.5 = 1192 ≈ 100% coverage.

## 6. Desain render generation & tile swap (P1)

- `renderGenRef` bertambah tiap pass render; setiap painted entry diberi `generation` + `paintedAt`.
- Eviction di pass render: hapus tile tidak desired hanya jika `generation < currentGen` AND retain window (250ms) lewat AND generasi baru sudah punya coverage (`newGenHasCoverage || next.size > 1`).
- Eviction timer bounded (250ms, retry 100ms selama ada request in-flight) dengan guard yang sama — stale canvas tidak hidup selamanya, dan view tidak pernah zero-visible (minimal 1 tile bertahan sampai pengganti painted).
- Detail pass tetap 125ms; delivery meng-upgrade `revision` tanpa unmount.
- `onFirstPaint` di-fire sekali per dokumen (guard: ada painted entry dengan tile key berawalan `documentKey:`) — underlay thumbnail hilang TEPAT saat tile asli melukis, termasuk saat ganti sheet dengan metrics ter-cache.

## 7. Strategi worker, prefetch, overscan, cache

- **Worker**: 1–3 worker (existing `workerCountFor`); per-worker render concurrency 2 via FIFO — aman karena guard pdf.js per canvas (`#canvasInUse`) dan tiap tile memakai OffscreenCanvas baru; queue di-prune saat close-document.
- **Prefetch**: viewport live sinkron ~10×/dtk (100ms) selama drag → tile arah pan diminta sebelum pointerup; posisi visual per rAF via CSS transform imperative.
- **Overscan**: `OVERSCAN_MARGIN_PCT=0.35` per sisi — sah karena coordinate-space eksplisit; nilai dari investigasi browser DeepSeek; tidak pernah dijadikan pengganti fix RC1.
- **Cache**: `TileLru` 96MiB dipertahankan; `protectedKeys` = desired keys; bitmap selalu ditutup (`close()`) di semua jalur (pool `closeIfUnclaimed`, LRU remove/dispose).
- **Anti-request-duplikat**: dedup per key di pool (`pendingByKey`) + `activeRequestsRef` di layer (cancel hanya untuk key yang keluar viewport).

## 8. Hasil test, TypeScript, build, E2E (nyata)

**Unit (vitest, `apps/web`)**: 59 files / **325 pass** (baseline 317; +5 test P0/P1 baru + onFirstPaint; 0 regresi). Test P0/P1 dibuktikan GAGAL sebelum fix (0.8597 / 0.4299 / stale-forever) dan HIJAU setelah fix.

**TypeScript**: `pnpm --dir apps/web exec tsc --noEmit` → bersih (termasuk setelah semua fix akhir).

**Build**: `pnpm --dir apps/web build` dengan env resmi (`NEXT_PUBLIC_USE_DB=true`, URL service) → sukses. Stack di-restart via `Start-PLHUT-Local.ps1`; health 6 endpoint OK; verifikasi halaman via browser: tablist count=1, tanpa error konsol.

**E2E real browser (Playwright, stack resmi, viewport 1440×900, proyek PLHUT-SURAKARTA)**:
- **Run pertama (build fix P0–P4, sebelum restart stack berulang): 4/4 PASS** — fit coverage ≥99% & ≥2 kolom tile; pan kiri/kanan tanpa penurunan coverage & tanpa zero-visible tile; wheel zoom 3 langkah ×2 arah tanpa zero-visible frame; navigasi p.1→p.2→p.1 tanpa loading ulang. Screenshot artifacts di `apps/web/test-results/`.
- **Run ulang (setelah beberapa restart stack)**: gagal — `pdf-page-layer` tidak mount dalam 90–120 detik, tanpa pageerror, tanpa request `artifact-url`.
- **Uji banding**: dengan seluruh perubahan canvas di-`git stash` (build HEAD murni), E2E gagal dengan pesan IDENTIK → kegagalan run ulang bukan regresi kode ini, melainkan kondisi runtime (state session/workspace DB). Detail lengkap di §10.

## 9. (kosong — digabung ke §10)

## 10. Kronologi lengkap kegagalan E2E run ulang & pembuktiannya (jujur)

1. Run pertama 4/4 hijau (build fix P0–P4; stack segar).
2. Restart stack beberapa kali untuk memuat build lanjutan (fix hasil review QC).
3. Pada satu titik, prosedur stop web tidak mematikan server lama (PID 10320); instance baru gagal bind; **server lama dengan HTML chunk lama melayani → HTTP 400 chunk JS → halaman kosong → timeout `pdf-page-layer`** (§0.3). Ini diperbaiki: pohon proses dimatikan sampai "port 3000 free", start ulang via script resmi, halaman kembali normal.
4. Setelah halaman normal, E2E tetap gagal mount `pdf-page-layer` (tanpa error JS). Debug: `dem/sheets` 200 dengan data lengkap; tidak ada request `artifact-url` (layer tidak mount); DrawingCanvas menampilkan SheetPlanSvg fallback (sheet ada, mappedSheet tidak ter-resolve untuk id aktif) pada satu observasi, dan "Select one or more sheets" pada observasi lain — indikasi state `activeSheetId`/session tidak konsisten dengan `mappedSheets` di runtime DB.
5. **Uji banding HEAD**: `git stash push` seluruh folder canvas → rebuild → restart → E2E → GAGAL IDENTIK. Lalu `git stash pop` mengembalikan perubahan (diverifikasi 6 file modified).
6. Kesimpulan jujur: masalah mount berada di luar kode yang saya ubah (jalur `use-backend-sync`/session DB/`workspace-store` — tidak disentuh). Perubahan saya hanya prop/efek di dalam layer & DrawingCanvas.

## 11. Risiko & hal yang belum terbukti (jujur)

- **E2E final (dengan seluruh fix akhir) belum terbukti hijau pada kondisi lingkungan saat ini** — bukti hijau sah: run pertama 4/4. Disarankan: reset session/workspace DB proyek (atau stack fresh) lalu jalankan `drawing-intelligence-canvas-coverage.spec.ts` ulang.
- **CPU throttling 1×/4×/6× dan DPR 2** tidak dijalankan di E2E (spek: "jika tersedia"). Threshold `panP95Ms=16.7` di `performance-metrics.ts` tidak digerakkan (tidak ada data baseline baru).
- **Overscan 0.35** tidak diukur ulang per-DPR pada run final (nilai dari investigasi DeepSeek; run pertama memvalidasi pan ±480px tanpa blank-frame).
- `onFirstPaint`/underlay hanya untuk branch `mappedSheet` (PDF); branch `sheet`/`realImageUrl` tidak berubah (di luar scope).
- **Tidak ada bleeding 0.5px** ditambahkan (instruksi: hanya jika terbukti seam raster; tidak ada bukti seam pada run browser).

## 12. Metrik sebelum & sesudah

| Metrik | Sebelum | Sesudah (terverifikasi) |
|--------|---------|--------------------------|
| Coverage kanan saat fit zoom | 85,98% (1 kolom tile) | ≥99% (≥2 kolom tile) — E2E run 1 & unit |
| Tile stale di DOM setelah keluar viewport | Ditahan selamanya (`cache.has`) | ≤250ms + retain window (bounded, unit test) |
| Update viewport saat drag | CSS transform per rAF + setState per rAF (rerender subtree 60fps) | CSS transform per rAF (imperative) + sync tile 10Hz; child SVG di-memo |
| Fit saat ganti sheet | 2× (reset metrics + refit) | 1× (cache metrics + aspect eksplisit) |
| Render tile per worker | Serial (`chain`) | Concurrency 2 FIFO (cancel-aware) |
| First paint saat sheet dibuka ulang | Blank tanpa underlay | Thumbnail underlay sampai `onFirstPaint` |
| Unit test | 317 | 325 (0 regresi) |

## 13. Langkah rollback

- Perubahan hanya di 6 file source/test + 1 spec E2E + 1 laporan. Rollback: `git checkout` file canvas dari commit sebelum fix ini — seluruh perubahan berada dalam rangkaian commit fix; test baru ikut ter-revert.
- Cache tile global di-reset saat halaman dimuat ulang (`resetGlobalTileCache`); worker di-terminate saat `dispose`.
- Tidak ada perubahan schema/database; tidak ada migrasi.

## 14. Status acceptance criteria (PROMPT_IMPLEMENTASI_FIX_VIEWER...)

| Kriteria | Status |
|----------|--------|
| P0 — `viewportSpace` eksplisit; heuristik dihapus; coverage kanan ≥99% teruji (w&h >1) | ✅ selesai + test merah-dulu (0.8597/0.4299) |
| P0 — fallback lama eksplisit + regression test | ✅ default `'normalized'`; kasus 1×1 diuji |
| P1 — render generation; swap setelah coverage cukup; cleanup bounded; tidak ada zero-visible frame | ✅ unit + E2E run 1; guard anti-zero di kedua jalur eviction |
| P2 — CSS transform selama drag; tanpa setState per rAF (subtree); prefetch arah pan; sync state di batas tepat | ✅ throttle 100ms + memo child; commit di pointerup |
| P3 — single-fit; cache metrics `runId/pageIndex+pageIndex`; first paint tidak menunggu; underlay low-res sampai tile siap | ✅ cache per runId:pageIndex + aspect eksplisit + onFirstPaint/underlay |
| P4 — 2–3 worker jika terbukti; dedup; cancel stale; prioritas visible→arah pan→overscan; overscan setelah coordinate-space; cache/canvas bounded | ✅ concurrency 2/worker FIFO, dedup pool & layer, LRU 96MiB, overscan setelah P0 |
| TDD: test gagal dulu → fix → hijau → refactor | ✅ P0/P1 mengikuti; kegagalan dibuktikan sebelum implementasi |
| Real web testing wajib; jangan klaim sukses jika automation gagal | ✅ run 1: 4/4 hijau (screenshot); run ulang: gagal → dilaporkan jujur + uji banding HEAD |
| Verifikasi: unit + tsc + build | ✅ 325/325, tsc bersih, build sukses |
| `graphify update .` | ✅ 11667 nodes / 24395 edges / 716 communities |
| Laporan 13 poin + bagian kendala | ✅ (laporan ini, termasuk §0) |
| Branch → push → PR → STOP (tidak merge sendiri) | lihat §15 |

## 15. Deliverable git

- Commit: rangkaian commit fix di branch `codex/sheet-navigation-gallery-viewer-performance` (P0/P1 layer+pyramid+test, P2/P3 canvas, P4 worker, E2E spec, laporan). `GEMINI.md`, artifact `apps/web/e2e/results/*.png`, `.opencode/`, `docs/audits/` TIDAK di-commit (di luar scope).
- PR: dibuka dari branch ini — **menunggu review owner + Claude; tidak di-merge sendiri** (AGENTS.md §5).
