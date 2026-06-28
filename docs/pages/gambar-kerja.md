# Halaman Gambar Kerja (+ Gambar Kerja AI)

Routes: `/proyek/[projectId]/gambar-kerja` (per proyek) & `/gambar-kerja-ai`
(global). Status: **[sebagian]** UI ada; OCR/CV baca piksel gambar **[roadmap
v1.0, DITUNDA]**.

> Baca [README.md](README.md) §1 (Aturan Emas) dulu.

## Tujuan
Unggah/lihat gambar kerja; ke depan: ubah gambar → item terstruktur (BoQ) →
RAB. Saat ini jalur murah = input teks/tabel terstruktur, bukan baca piksel.

## Data yang ditampilkan
Daftar/preview gambar; hasil ekstraksi elemen (usulan) bila ada.

## Sumber angka (ENGINE-ONLY)
- Volume dari dimensi: `POST /geometry/volume` (19 tipe elemen).
- Setelah jadi item → `POST /rab/build`. ❌ Tidak ada hitung volume di frontend.

## Peran AI di halaman ini
- **PROPOSE** — dari teks/tabel deskripsi elemen → usul item (tipe, AHSP,
  dimensi). **Gemini Vision** bisa membaca gambar bersih untuk *mengusulkan*
  elemen — tetap engine yang menghitung. Akurasi terbatas → wajib verifikasi.
- **NEVER** — AI tidak menetapkan volume/biaya; hanya usul struktur.

## Catatan strategi (penting)
Membaca piksel gambar mentah (CV penuh) = bagian tersulit & termahal (~60–80%
akurat). **DITUNDA**: validasi nilai bisnis (Wizard-of-Oz) dulu sebelum bangun
CV. `services/document-intelligence` masih kerangka (stub).

## Akses Engineering Chat
READ daftar gambar & hasil ekstraksi; PROPOSE item ke RAB via konfirmasi.

## Fallback manual
User input item/dimensi manual (ketik/tabel) → engine hitung. Selalu tersedia.

## Status
UI: sebagian. Ekstraksi teks→item: lewat Smart RAB. CV gambar: v1.0 (ditunda).
