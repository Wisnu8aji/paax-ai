# DEM Phase 2 Task 1-8 Report

Status: DONE_WITH_CONCERNS

## Implementasi

Task 1 sampai 8 sudah diimplementasikan pada branch `feat/command-room-model-overhaul`.

- Data run dan page DEM, migrasi, schema, dan endpoint database.
- Klasifikasi kegagalan provider.
- Adapter Qwen dan mock provider.
- Renderer PDF halaman dan parser dengan satu repair pass.
- Klien HTTP database, loop halaman, idempotensi, retry, dan status run.
- Endpoint start/status DEM.
- Resume yang tidak membuat ulang atau memproses ulang halaman selesai.

## Verifikasi Otomatis

- `services/document-intelligence`: 327 passed, 5 skipped.
- `services/db`: 12 passed, 1 skipped.
- Resume test: 1 passed.

## Manual Fixture

Uji fixture PLHUT 88 halaman belum dijalankan karena `DEM_EXTRACTION_API_KEY` tidak tersedia di environment maupun `.env.local`.

Setelah key tersedia, jalankan service database dan document-intelligence, unggah `docs/plans/drawing intelligence/Gambar kerja/GAMBAR KERJA PLHUT SURAKARTA (1).pdf` ke `POST /drawings/dem/start`, lalu poll `GET /drawings/dem/{run_id}/status` sampai semua page terminal. Untuk verifikasi resume, jalankan kembali `process_document(..., resume=True)` dengan run yang sama dan periksa page complete tidak memanggil provider.

## Riwayat Sebelum Push

Branch berada 18 commit di depan remote tracking branch. Audit menemukan attribution dan nama tooling pada commit lama. Rewrite aman belum dijalankan karena worktree memiliki perubahan user yang belum di-commit dan utilitas rewrite riwayat tidak tersedia. Jangan push atau merge sebelum audit/rewrite ini diselesaikan.
