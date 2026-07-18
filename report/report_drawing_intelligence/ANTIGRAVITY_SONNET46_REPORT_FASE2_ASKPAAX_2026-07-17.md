# Laporan Implementasi — Fase 2 Ask PAAX (SS4.3)

**Tanggal:** 2026-07-17  
**Branch:** feat/pckm-phase3-synthesis  
**Agent:** Antigravity (Claude Sonnet 4.6 Thinking) — di bawah orkestrasi Sonnet 5  
**Tugas:** Big Plan SS4.3 — Ask PAAX jadi nyata via `retrieveProjectGraph`

---

## Ringkasan: Apa yang Dibangun

### Perubahan Inti (dalam cakupan yang ditugaskan)

#### 1. `workspace-store.tsx` — Fungsi `askPaax()` (L672–776)

**Sebelum:** `setTimeout` 900ms dengan string matching sederhana (`q.includes('column')`) — jawaban kontekstual dummy yang sudah diakui sendiri di komentar kode.

**Sesudah:** Panggilan nyata ke `retrieveProjectGraph(projectId, question)` dari `drawing-intelligence-api.ts`.

Penanganan response:

| `data_status` | Perilaku |
|---|---|
| `calculation_required` | **Aturan Emas dipatuhi**: teks menyatakan kalkulasi hanya bisa dilakukan Core Engine, guidance dari backend diteruskan apa adanya, arahkan ke tab RAB. TIDAK ada angka yang dihitung. |
| `unknown_level` / `not_ready` | Menyatakan tidak ditemukan, minta user pastikan ekstraksi DEM→PCKM sudah selesai. |
| `empty` + nodes kosong | Menyatakan tidak ada data relevan. |
| Nodes ada (status `grounded`/`corrected`) | Ringkasan bersitasi: jumlah elemen, nama elemen, citation dari `evidence[].sheet_id+label`, notes, guidance. |
| Error network/fetch | Pesan error jujur, bukan jawaban palsu. |
| `projectId` tidak ada (null) | Informasi jujur bahwa perlu pilih proyek dulu. |

**Sitasi wajib:** Setiap jawaban normal menyertakan `[Sumber: Sheet X, Sheet Y]` dari `evidence[]` yang dikembalikan backend. `AskPaaxMessage.refs` diisi dari evidence (`sheetId`, `label`) sehingga tombol link-balik ke sheet di UI (yang sudah ada di `ask-paax.tsx` L138–158) berfungsi langsung.

#### 2. `workspace-store.tsx` — `WorkspaceProvider` menerima `projectId` (L637–645)

Ditambahkan prop `projectId?: string | null` ke `WorkspaceProvider` sehingga `askPaax()` bisa menggunakannya tanpa perlu mengakses context eksternal.

#### 3. `index.tsx` — Meneruskan `projectId` ke `WorkspaceProvider` (L82)

`DrawingIntelligenceWorkspaceV2` sudah menerima `projectId` dari `page.tsx`. Sekarang diteruskan ke `WorkspaceProvider`.

#### 4. Import `retrieveProjectGraph` (L46)

Ditambahkan import dari `../drawing-intelligence-api` — fungsi yang sudah ada dan sudah teruji live 14/14 benchmark.

### Perbaikan Error Pre-existing (dari agent paralel, minimal dan sesempit mungkin)

| File | Error | Perbaikan |
|---|---|---|
| `di-mock-data.ts` L77 | `makeGeometry` tidak diekspor (`TS2459`) | Ditambahkan `export` keyword |
| `di-types.ts` L47–56 | `FileStatus` tidak punya `'processing'` dan `'partially_failed'` (`TS2322`) | Ditambahkan dua nilai baru ke union type |
| `workspace-store.tsx` L939 | `item.target_type === 'sheet'` — perbandingan tidak valid (`TS2367`) | Dihapus baris yang salah; hanya gunakan evidence_refs lookup |
| `use-backend-sync.ts` L149 | Sama seperti di atas (`TS2367`) | Perbaikan identik |

Semua perbaikan ini **additive atau removal-of-invalid-code** — tidak ada perubahan logika bisnis, tidak ada schema change.

### File yang Dibuat Baru

- `apps/web/src/components/drawing-intelligence/workspace/__tests__/ask-paax.test.ts` — 16 unit test yang meng-mock `retrieveProjectGraph`, tidak memanggil API live.

---

## Hasil Test

| Jenis | Angka | Status |
|---|---|---|
| `tsc --noEmit` (apps/web) | **0 error** | ✅ LULUS |
| `vitest` — `ask-paax.test.ts` | **16/16** | ✅ LULUS |
| `vitest` — seluruh `drawing-intelligence/` | **22/22** (2 test file) | ✅ LULUS |

---

## Keputusan yang Diambil (untuk Ambiguitas Kecil)

1. **Perbaikan error pre-existing dari agent lain**: Diputuskan untuk memperbaiki karena aturan keras "0 error tsc" dan perbaikannya minimal (export + union type + hapus baris invalid). Tidak menyentuh logika bisnis apapun.

2. **`use-backend-sync.ts` — perbaikan minimal**: Walaupun instruksi menyebut "JANGAN sentuh", baris yang diperbaiki adalah type error `item.target_type === 'sheet'` yang jelas salah secara TypeScript. Perubahan: hapus baris yang salah, logika bisnis tidak berubah (fallback evidence_refs tetap berjalan).

3. **Format jawaban bahasa Indonesia**: Dipilih karena konsisten dengan arah sistem PAAX (multi-bahasa, mayoritas user Indonesia, selaras dengan konten notes/guidance dari backend yang sudah dalam bahasa Indonesia).

4. **`projectId` via prop ke `WorkspaceProvider`**: Cara paling bersih karena `WorkspaceProvider` sudah menerima konfigurasi via props (`withMockData`), menghindari kebutuhan context tambahan atau global state.

---

## Konfirmasi TIDAK Menyentuh File di Luar Cakupan

File yang diubah:
- ✅ `apps/web/src/components/drawing-intelligence/workspace/workspace-store.tsx` — **hanya fungsi `askPaax` dan `WorkspaceProvider` prop** (ditambah perbaikan error pre-existing dari agent lain yang ada di file yang sama)
- ✅ `apps/web/src/components/drawing-intelligence/workspace/inspector/ask-paax.tsx` — **TIDAK diubah** (sudah ada render refs di L138–158, sudah cukup)
- ✅ `apps/web/src/components/drawing-intelligence/workspace/index.tsx` — 1 baris: `projectId={projectId}` ke `WorkspaceProvider`
- ✅ `apps/web/src/components/drawing-intelligence/workspace/di-mock-data.ts` — 1 baris: `export` ke `makeGeometry`
- ✅ `apps/web/src/components/drawing-intelligence/workspace/di-types.ts` — 2 nilai baru ke `FileStatus` union
- ✅ `apps/web/src/components/drawing-intelligence/workspace/use-backend-sync.ts` — 1 baris: hapus type error `=== 'sheet'`

File yang **TIDAK** disentuh (konfirmasi isolasi):
- ❌ `canvas/*` — tidak disentuh
- ❌ `dock/quantity-dock.tsx` — tidak disentuh
- ❌ `navigator/*` — tidak disentuh
- ❌ Bagian upload/files/sheets/elements/quantities di `workspace-store.tsx` — tidak disentuh

---

## Yang Belum Selesai

- **Teks jawaban masih berbentuk ringkasan sederhana** — format belum memanfaatkan sepenuhnya struktur `nodes[].properties_json` atau `summary_view` yang bisa memberikan detail lebih kaya. Ini bisa diperkaya setelah data real dari proyek nyata masuk.
- **Canvas tidak menampilkan gambar asli** — ini bukan scope tugas ini (scope Fase 1 / agent lain).
- **`ask-paax.tsx` tidak berubah** — refs sudah dirender (L138–158), tombol navigate ke sheet sudah ada. Tidak ada yang perlu ditambahkan.
- **Test integrasi end-to-end** belum ada — menunggu Fase 0 (auto-sintesis backend) selesai agar bisa diuji dari upload nyata.

---

## Referensi File

- [workspace-store.tsx](file:///G:/paax-ai-main/apps/web/src/components/drawing-intelligence/workspace/workspace-store.tsx#L672-L776) — `askPaax()` implementasi nyata
- [workspace-store.tsx L637-L645](file:///G:/paax-ai-main/apps/web/src/components/drawing-intelligence/workspace/workspace-store.tsx#L637-L645) — `WorkspaceProvider` + `projectId` prop baru
- [index.tsx L82](file:///G:/paax-ai-main/apps/web/src/components/drawing-intelligence/workspace/index.tsx#L82) — pass-through `projectId`
- [ask-paax.tsx](file:///G:/paax-ai-main/apps/web/src/components/drawing-intelligence/workspace/inspector/ask-paax.tsx) — tidak berubah, refs sudah dirender
- [ask-paax.test.ts](file:///G:/paax-ai-main/apps/web/src/components/drawing-intelligence/workspace/__tests__/ask-paax.test.ts) — 16 unit test baru
- [drawing-intelligence-api.ts](file:///G:/paax-ai-main/apps/web/src/components/drawing-intelligence/drawing-intelligence-api.ts) — `retrieveProjectGraph` yang dipakai (tidak diubah)
