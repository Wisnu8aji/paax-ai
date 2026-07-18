# Sisa Pekerjaan — Drawing Intelligence & Command Room

**Tanggal:** 2026-07-17 (malam, setelah Gelombang 7 + perbaikan Command Room)
**Status Big Plan:** 17/17 item selesai. Dokumen ini murni daftar sisa/risiko yang jujur
diketahui, bukan pekerjaan yang gagal.

---

## 1. Belum diuji lewat klik langsung di browser

Semua verifikasi hari ini (Fase 0 sampai Gelombang 7) dilakukan lewat pytest, vitest,
`tsc --noEmit`, dan `curl` langsung ke API — **belum pernah** ada yang benar-benar membuka
UI di browser dan mengklik tombol satu per satu. Test otomatis membuktikan logika kode
benar; tidak membuktikan pengalaman visual/UX nyata (tombol kepencet, layout tidak rusak,
loading state terlihat wajar, dst).

**Perlu:** owner (atau sesi terpisah) mencoba langsung: buka Command Room, pilih proyek
PLHUT Surakarta, tanya beberapa pertanyaan; buka Drawing Intelligence workspace, lihat
Level Tree View baru, coba review queue, coba RAB Bridge sampai panel review.

## 2. Belum ada uji upload gambar kerja asli dari nol

Semua data yang dipakai hari ini (snapshot 3407 node/3720 edge) berasal dari fixture PLHUT
yang sudah lama tersintesis dan dimuat langsung ke database. **Belum pernah** diuji jalur
upload PDF baru sungguhan lewat `POST /drawings/dem/start` → ekstraksi → trigger sintesis
manual (`POST /drawings/dem/{run_id}/synthesize`) → snapshot baru — walau endpoint-endpoint
itu sendiri sudah dibangun dan diuji pytest (test_dem_synthesize_route.py) di Fase 0.

**Perlu:** uji end-to-end sekali dengan PDF gambar kerja nyata (boleh 1 halaman dulu) untuk
membuktikan pipa penuh, bukan cuma potongan-potongan yang diuji terpisah.

## 3. Desain revisi/lineage gambar — sengaja belum dikerjakan

Kalau gambar kerja diunggah ulang/direvisi SETELAH RAB draft sudah terisi dari RAB Bridge,
sistem belum punya cara menandai "baris RAB ini berbasis snapshot lama, perlu di-review
ulang." Ini keputusan sadar di Big Plan (§5.2.2, "desain sekarang, bangun setelah stabil")
— bukan terlewat, tapi tetap jadi risiko nyata begitu dipakai di proyek dengan revisi
gambar berkelanjutan. Perlu didesain sebelum dipakai produksi jangka panjang.

## 4. Fallback impor core-engine yang senyap (prioritas rendah)

Endpoint materialize RAB Bridge (`services/db/src/paax_db/main.py:857-863`) punya fallback:
kalau modul `services/core-engine` gagal di-import, sistem diam-diam menganggap semua item
"butuh asumsi tambahan" alih-alih menampilkan error jelas. Aman dari sisi Aturan Emas
(tidak pernah mengarang angka), tapi menyulitkan diagnosis kalau suatu saat konfigurasi
lingkungan berubah dan impor gagal — masalah konfigurasi akan terlihat seperti "data tidak
lengkap," bukan error server. Rekomendasi: tambah log warning eksplisit saat fallback aktif.

## 5. Infrastruktur live-test masih manual, belum permanen

Server yang dipakai untuk mencoba sistem malam ini (`services/db` dgn SQLite via
`scripts/live_test/serve_db_with_fixture.py`, web app dgn env var manual) adalah
infrastruktur uji coba, bukan setup produksi. Belum ada Postgres permanen, belum ada
proses deploy resmi. Kalau server ditutup, proyek PLHUT yang bisa dicoba sekarang akan
hilang sampai dimuat ulang manual.

---

## Yang SUDAH selesai (untuk konteks, bukan bagian sisa pekerjaan)

- 17/17 item Big Plan (Fase 0-3 + Gelombang 3-7): auto-sintesis manual-trigger, image
  render, list-sheets, wiring frontend V2 penuh (sheets/canvas/elements/review/handoff/
  analyze/ask-paax), AHSP mapping + materialize RAB Bridge, evidence traceability, unifikasi
  label RAB, quantity readiness sanity-check, Level Tree View V2, penghapusan V1 lama.
- Perbaikan Command Room: `projectId` proyek aktif sekarang benar-benar terkirim ke server
  (sebelumnya tidak pernah dikirim sama sekali — itu sebab utama Command Room selalu
  menjawab "data tidak tersedia" meski data sudah ada).
- Perbaikan koneksi proyek: proxy server baru (`/api/db-projects/`) supaya daftar proyek
  web app terbaca dari database nyata, bukan localStorage browser yang terputus dari sistem.

Detail lengkap tiap item ada di `AUDIT_BESAR_AKHIR_2026-07-17.md` dan 15 laporan per-agent
di folder yang sama.
