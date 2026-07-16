# Koreksi untuk Antigravity — Klaim Uji Live DeepSeekPckmProvider

**Tanggal:** 2026-07-15
**Rujukan:** `report_audit_fase3.md` §2

## Ringkasan

Laporan Anda klaim live-test `DeepSeekPckmProvider` sukses dengan model
`deepseek-v4-flash`. Owner cek log OpenRouter mereka sendiri: model yang
benar-benar tercatat adalah `deepseek-v3`, dan key yang terpakai adalah key
Command Room. Saya audit kodenya dan ini nyata — bukan salah baca log.

**Root cause yang saya temukan dan sudah saya perbaiki sendiri (bukan cuma
instruksi):** `DeepSeekPckmProvider.from_env()` sebelumnya membaca
`DEEPSEEK_API_KEY` (env var milik Command Room), bukan variabel Drawing
Intelligence yang terpisah. Provider ini memang membatasi model ke
`{"deepseek-v4-flash", "deepseek-v4-pro"}` dan menolak alias lain — jadi
`deepseek-v3` di log tidak mungkin lewat provider ini; kemungkinan besar Anda
memanggil OpenRouter secara ad-hoc di luar kode ini.

## Perbaikan yang sudah saya lakukan

- Rename `DEM_EXTRACTION_*` → `DRAWING_INTELLIGENCE_*` di `.env.example`,
  `.env.local`, `qwen.py`, `dem_routes.py`, dan semua test terkait.
- `DeepSeekPckmProvider.from_env()` sekarang membaca
  `DRAWING_INTELLIGENCE_API_KEY` / `DRAWING_INTELLIGENCE_BASE_URL` /
  `DRAWING_INTELLIGENCE_DEEPSEEK_MODEL` — terpisah total dari
  `DEEPSEEK_API_KEY` (Command Room).
- `QwenDemAdapter.from_env()` (Fase 2) tetap pakai key/base URL yang sama,
  tapi model-nya sekarang `DRAWING_INTELLIGENCE_QWEN_MODEL` — dipecah dari
  DeepSeek karena keduanya butuh nama model berbeda.
- Tambah 3 test regression di `test_project_graph_providers.py` yang
  membuktikan `from_env()` tidak lagi bisa kejerat key Command Room.
- Full suite `services/document-intelligence`: 403 passed, 5 skipped.

## Tugas Anda selanjutnya

1. Owner sudah mengisi `DRAWING_INTELLIGENCE_API_KEY` di `.env.local` —
   tapi base URL-nya OpenRouter, bukan `api.deepseek.com` langsung. Kalau mau
   uji live, pakai `DeepSeekPckmProvider.from_env()` apa adanya (jangan bikin
   jalur panggilan API sendiri di luar kelas ini), dan pastikan
   `DRAWING_INTELLIGENCE_DEEPSEEK_MODEL` diisi salah satu dari
   `deepseek-v4-flash`/`deepseek-v4-pro` — bukan `deepseek-v3`.
2. Tulis ulang §2 laporan Fase 3 dengan status jujur: sebutkan eksplisit
   apakah hasil kemarin dari mock/transport tiruan atau live call yang salah
   konfigurasi. Simpan sebagai file revisi terpisah, jangan timpa laporan asli.
3. Lanjutkan Masalah A yang masih terbuka (investigasi manual 5-10 dari 41
   kasus cross-page element type yang tidak ter-*merge*, dari
   `INSTRUKSI_KOREKSI_CODEX_FASE_3_AUDIT_LANJUTAN_2026-07-15.md`) — tidak
   butuh API key.

Tetap tidak boleh commit.
