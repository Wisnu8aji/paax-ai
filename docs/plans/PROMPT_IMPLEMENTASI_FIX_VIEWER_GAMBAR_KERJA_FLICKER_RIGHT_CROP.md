# Prompt Implementasi Perbaikan Viewer Gambar Kerja

Salin seluruh instruksi di bawah ini ke agen AI yang akan melakukan implementasi.

---

Anda bekerja sebagai senior frontend performance engineer pada repository:

`G:\paax-ai-contextual-integration`

Tugas Anda adalah menganalisis, menguji secara nyata, lalu mengimplementasikan perbaikan menyeluruh untuk viewer **Gambar Kerja**:

- Gambar berkedip ketika melakukan pan ke kiri atau kanan.
- Bagian kanan gambar kadang terpotong atau hilang.
- Gambar kadang terlihat kosong sesaat.
- Perpindahan sheet, pan, zoom, dan fit-to-screen tidak mulus.

Prioritas utama adalah tampilan yang benar dan interaksi yang sangat lancar. Penggunaan CPU, GPU, memori, atau beberapa Web Worker yang cukup tinggi diperbolehkan selama tetap bounded, tidak menyebabkan memory leak, dan meningkatkan kelancaran.

**Jangan membuat fitur battery-saver atau mode hemat daya pada PAAX.**

## Aturan dan referensi wajib

Baca terlebih dahulu:

`G:\paax-ai-contextual-integration\AGENTS.md`

`G:\paax-ai-contextual-integration\PANDUAN_INSTALASI_DAN_MENJALANKAN_SEMUA_SERVER_PAAX.md`

Gunakan plan DeepSeek sebagai referensi investigasi utama:

`G:\paax-ai-contextual-integration\docs\plans\2026-08-02-fix-gambar-kerja-viewer-flicker-cutoff.md`

Gunakan plan Antigravity hanya sebagai pembanding:

`G:\paax-ai-contextual-integration\docs\plans\REMEDIATION_PLAN_SHEET_REVIEW_CANVAS_FLICKER_AND_RIGHT_CROP.md`

Sebelum membaca source secara luas, WAJIB gunakan Graphify:

```powershell
graphify query "PDF drawing viewer flicker right crop viewport coordinate tile rendering worker pool pan zoom"
graphify explain "drawing canvas PDF tile rendering viewport"
graphify path "DrawingCanvas" "PdfPageLayer"
```

## Perlindungan worktree

Repository mungkin sudah memiliki perubahan yang belum di-commit. Sebelum mengubah kode:

- Jalankan `git status` dan `git diff`.
- Identifikasi perubahan yang sudah ada.
- Jangan menjalankan `git reset`, `git restore`, `git checkout --`, atau menghapus perubahan.
- Jangan menimpa pekerjaan pengguna.
- Jangan menganggap perubahan yang sudah ada otomatis benar.
- Periksa setiap perubahan terhadap akar masalah.
- Jangan commit atau push langsung ke `main`.
- Ikuti aturan branch dan PR dalam `AGENTS.md`.

## File utama

- `G:\paax-ai-contextual-integration\apps\web\src\components\drawing-intelligence\workspace\canvas\drawing-canvas.tsx`
- `G:\paax-ai-contextual-integration\apps\web\src\components\drawing-intelligence\workspace\canvas\pdf-page-layer.tsx`
- `G:\paax-ai-contextual-integration\apps\web\src\components\drawing-intelligence\workspace\canvas\pdf-tile-pyramid.ts`
- `G:\paax-ai-contextual-integration\apps\web\src\components\drawing-intelligence\workspace\canvas\pdf-tile-pool.ts`
- `G:\paax-ai-contextual-integration\apps\web\src\components\drawing-intelligence\workspace\canvas\pdf-tile.worker.ts`
- `G:\paax-ai-contextual-integration\apps\web\src\components\drawing-intelligence\workspace\canvas\pdf-binary-cache.ts`
- `G:\paax-ai-contextual-integration\apps\web\src\components\drawing-intelligence\workspace\canvas\performance-metrics.ts`
- `G:\paax-ai-contextual-integration\apps\web\src\components\drawing-intelligence\workspace\canvas\canvas-toolbar.tsx`

## File test

- `G:\paax-ai-contextual-integration\apps\web\src\components\drawing-intelligence\workspace\canvas\pdf-page-layer.test.tsx`
- `G:\paax-ai-contextual-integration\apps\web\src\components\drawing-intelligence\workspace\canvas\pdf-tile-pyramid.test.ts`
- `G:\paax-ai-contextual-integration\apps\web\src\components\drawing-intelligence\workspace\canvas\pdf-tile-pool.test.ts`
- `G:\paax-ai-contextual-integration\apps\web\src\components\drawing-intelligence\workspace\canvas\performance-metrics.test.ts`

Folder E2E:

`G:\paax-ai-contextual-integration\apps\web\e2e`

Buat pengujian berikut jika belum tersedia:

`G:\paax-ai-contextual-integration\apps\web\e2e\drawing-intelligence-canvas-coverage.spec.ts`

## Akar masalah prioritas P0

Investigasi sebelumnya menunjukkan viewport dari `DrawingCanvas` dapat menggunakan normalized coordinate space, tetapi `PdfPageLayer` menentukan jenis koordinat menggunakan heuristik nilai `width` dan `height`.

Contoh kondisi bermasalah:

- Viewport width sekitar `1.153`.
- Viewport height sekitar `1.568`.
- Viewport sebenarnya normalized.
- Karena nilainya lebih besar dari 1, viewport dapat salah dianggap sebagai logical/page-space.
- Tile selection kemudian hanya mencakup sekitar 85.98% lebar halaman.
- Sisi kanan halaman menjadi kosong atau terpotong.

Overscan tidak boleh digunakan sebagai pengganti perbaikan coordinate-space ini.

Implementasikan kontrak eksplisit, misalnya:

```typescript
type ViewportSpace = "normalized" | "logical";
```

`PdfPageLayer` harus menerima `viewportSpace` secara eksplisit. `DrawingCanvas` harus mengirim:

```tsx
viewportSpace="normalized"
```

Kurangi atau hilangkan ketergantungan terhadap heuristik `width`/`height`. Jika fallback kompatibilitas lama masih diperlukan, fallback harus eksplisit dan memiliki regression test.

## Urutan implementasi

### P0 — Viewport correctness

- Tambahkan `viewportSpace` eksplisit.
- Perbaiki konversi normalized viewport menjadi logical PDF page space.
- Tambahkan regression test yang gagal sebelum perbaikan.
- Test harus membuktikan coverage sisi kanan, bukan hanya jumlah tile.
- Coverage sisi kanan minimal 99%.
- Uji kasus width dan height viewport sama-sama lebih besar dari 1.

### P1 — Tile swap tanpa blank frame

Gunakan render generation:

- Tile generasi lama tetap terlihat sampai tile generasi baru siap.
- Swap dilakukan setelah generasi baru memiliki visible coverage yang cukup.
- Tile lama kemudian dibersihkan secara bounded.
- Jangan mempertahankan stale canvas hanya karena `cache.has(key)`.
- Jangan biarkan canvas lama hidup tanpa batas.
- Tidak boleh ada frame dengan zero visible tile selama pan, zoom, resize, atau perpindahan sheet.

### P2 — Pan yang mulus

- Gunakan CSS transform selama pointer drag.
- Hindari React `setState` pada setiap `pointermove` atau `requestAnimationFrame` apabila memicu rerender subtree canvas.
- Simpan posisi interaktif yang sangat sering berubah menggunakan ref atau jalur imperative.
- Sinkronkan state React pada batas yang tepat, misalnya setelah frame terjadwal atau `pointerup`.
- Prefetch tile ke arah pergerakan.
- Penggunaan beberapa worker diperbolehkan setelah diukur.
- Target pan-frame p95 maksimal sekitar 16.7 ms pada mesin pengujian normal.

### P3 — Single-fit dan page metrics

- Fit-to-screen tidak boleh dijalankan berulang ketika setiap worker selesai membuka PDF.
- Cache metrics harus menggunakan `documentKey/runId + pageIndex`.
- Pertimbangkan perbedaan ukuran halaman dan rotation.
- First meaningful paint jangan menunggu seluruh proses yang tidak diperlukan.
- Pertahankan thumbnail atau low-resolution underlay sampai tile resolusi utama siap.

### P4 — Worker dan rendering performa tinggi

- Penggunaan 2–3 worker atau lebih boleh dilakukan jika benchmark membuktikan peningkatan.
- Hindari render request duplikat untuk tile yang sama.
- Batalkan request generasi lama yang sudah tidak relevan.
- Prioritaskan tile yang terlihat, lalu tile di arah pan, kemudian overscan.
- Overscan boleh digunakan untuk kelancaran, tetapi hanya setelah coordinate-space benar.
- Tentukan besar overscan melalui real browser testing.
- Cache dan canvas DOM harus tetap memiliki batas untuk mencegah memory leak.
- Jangan menambahkan bleed 0.5px tanpa membuktikan adanya seam raster dan memastikan gambar tidak blur.

## Test-driven development

Untuk setiap akar masalah:

1. Buat regression test yang gagal.
2. Pastikan kegagalannya benar-benar merepresentasikan bug.
3. Implementasikan perubahan terkecil yang benar.
4. Jalankan ulang test.
5. Refactor setelah test hijau.

Minimal skenario pengujian:

- DPR 1 dan DPR 2.
- Viewport 1440×900 dan viewport yang lebih kecil.
- Pan kiri dan kanan minimal 10 kali.
- Zoom berurutan.
- Fit-to-screen.
- Perpindahan sheet A → B → A.
- Halaman dengan ukuran atau rotation berbeda.
- CPU throttling 1×, 4×, dan 6× jika tersedia.
- Sisi kanan memiliki coverage minimal 99%.
- Tidak pernah terjadi zero-visible-tile frame.
- Tidak terdapat render request duplikat berlebihan.
- Worker, cache, canvas DOM, dan render generation tetap bounded.
- Tidak terdapat memory leak setelah navigasi dan pan berulang.

## Real web testing wajib

Jalankan semua server mengikuti:

`G:\paax-ai-contextual-integration\PANDUAN_INSTALASI_DAN_MENJALANKAN_SEMUA_SERVER_PAAX.md`

Gunakan Playwright atau browser automation untuk:

- Membuka sheet utama.
- Menjalankan review Gambar Kerja.
- Berpindah sheet.
- Melakukan pan kiri dan kanan.
- Melakukan zoom dan fit.
- Mengambil screenshot sebelum dan sesudah.
- Mengumpulkan console error.
- Mengukur frame duration dan long task.
- Mengukur visible tile count, canvas count, worker count, request count, cache, dan stale render generation.

Jangan menyatakan real browser testing berhasil jika browser automation gagal. Pisahkan secara jelas hasil real browser, unit/integration test, analisis statis, dan perhitungan deterministik.

## Verifikasi minimal

Jalankan dari `G:\paax-ai-contextual-integration`:

```powershell
pnpm --dir apps/web test -- src/components/drawing-intelligence/workspace/canvas/pdf-tile-pyramid.test.ts src/components/drawing-intelligence/workspace/canvas/pdf-page-layer.test.tsx src/components/drawing-intelligence/workspace/canvas/pdf-tile-pool.test.ts src/components/drawing-intelligence/workspace/canvas/performance-metrics.test.ts

pnpm --dir apps/web exec tsc --noEmit

pnpm --dir apps/web build
```

Jalankan E2E menggunakan prosedur dalam panduan instalasi. Setelah perubahan kode, jalankan:

```powershell
graphify update .
```

## Dokumentasi hasil

Buat atau perbarui laporan berikut:

`G:\paax-ai-contextual-integration\docs\plans\2026-08-02-final-fix-viewer-flicker-right-crop.md`

Laporan wajib memuat:

1. Root cause yang terbukti.
2. Kondisi dirty worktree sebelum implementasi.
3. Perubahan existing yang dipertahankan, diperbaiki, atau ditolak.
4. Daftar file dan simbol yang diubah.
5. Desain `viewportSpace`.
6. Desain render generation dan tile swap.
7. Strategi worker, prefetch, overscan, dan cache.
8. Hasil unit test, TypeScript, build, dan E2E.
9. Screenshot atau path artifact pengujian.
10. Metrik sebelum dan sesudah.
11. Risiko dan hal yang belum berhasil dibuktikan.
12. Langkah rollback.
13. Status setiap acceptance criterion.

## Hasil akhir

- Implementasikan perbaikannya, jangan hanya membuat saran.
- Prioritaskan kebenaran gambar dan kelancaran.
- Penggunaan CPU/GPU yang cukup berat diperbolehkan selama bounded dan tidak menyebabkan memory leak.
- Jangan membuat mode battery-saver atau pengaturan hemat daya PAAX.
- Jangan mengubah area di luar viewer tanpa bukti kebutuhan.
- Jangan mengklaim masalah selesai sebelum verifikasi berhasil.
- Ikuti branch, push, dan PR gate dalam `AGENTS.md`.
- Jangan merge PR sendiri.
- Jawaban akhir harus mencantumkan perubahan, hasil test nyata, kegagalan tersisa, path laporan, branch, commit, dan PR.
