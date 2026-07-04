# Halaman Gambar Kerja (+ Gambar Kerja AI)

Routes: `/proyek/[projectId]/gambar-kerja` (per proyek) & `/gambar-kerja-ai`
(global). Status: **[aktif]** — pipeline PERSEPSI NYATA
(`services/document-intelligence`) sudah membaca PDF gambar kerja langsung
(vektor+geometri, BUKAN lagi tempel-teks-manual seperti versi sebelumnya).
Rencana besar & status detail per fase: `docs/plans/
PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`.

> Baca [README.md](README.md) §1 (Aturan Emas) dulu.
> Spek rinci TKG: `docs/specs/brain-v4.1/PAAX_BRAIN_00_EKSTRAKSI_GAMBAR_KERJA.txt`.

## Tujuan
Mengubah PDF gambar kerja (denah, tabel kolom/balok, dst.) menjadi **TKG
(Transkrip Kanonik Gambar)** — struktur berisi grid+bentang (posisi mm nyata,
dari bubble-as + garis-dimensi vektor), level/peil, tabel tipe (dimensi+
tulangan+mutu), elemen terpasang beralamat grid ("A1", atau notasi offset
"B-offset_sebelum_1" untuk elemen di luar grid) — lalu dari TKG:
takeoff beton/bekisting/besi (engine) → kirim volume
ke RAB. TKG juga menjadi sumber fakta gambar untuk Engineering Chat
(INV-TKG-01: sistem lain membaca TKG, bukan mengekstrak ulang gambar).

## Alur upload PDF nyata (BARU — menggantikan alur tempel-teks lama)
1. **Upload** — user unggah PDF gambar kerja langsung (drag-drop atau pilih
   file) di `TkgWorkspace` (`components/drawings/tkg-workspace.tsx`).
2. **Analisa (backend)** — `POST /drawings/analyze/start` + polling
   `GET /drawings/analyze/status/{job_id}` (`services/document-intelligence`)
   memproses SETIAP halaman: baca span teks vektor+rotasi,
   gabung jadi Run, kenali grammar notasi (kode tipe/tulangan/dimensi/mutu),
   baca tabel bergaris nyata (`page.find_tables()`), rekonstruksi grid dari
   bubble-as+garis-dimensi vektor (§3.1.1). Sheet TANPA teks vektor (hasil
   scan/foto) → jalur OCR (PaddleOCR, opsional/lazy).
3. **Konsolidasi lintas-halaman** — hasil semua halaman digabung jadi satu
   pandangan bangunan: registry elemen
   lintas-zona dgn alamat grid, grid tunggal terverifikasi konsisten, daftar
   asumsi/perlu-review terkumpul.
4. **Review Gambar** — user melihat ringkasan
   ramah-pengguna: per-halaman (nama gambar/zona pekerjaan/skala), per-zona
   (elemen apa di tiap titik grid), dimensi total bangunan, daftar "perlu
   dicek" — BUKAN metrik teknis mentah (cakupan %/kode gerbang V-xx).
5. **Takeoff → RAB** — `POST /tkg/validate`, `POST /tkg/render`, lalu
   `POST /tkg/takeoff` berjalan otomatis setelah user menekan
   "Simpan hasil analisis". Item beton (m³)/bekisting (m²)/besi (kg) dihitung
   engine per rumus F-B/F-C/F-D; data kurang → `needs_review`, TIDAK ditebak.
   Tombol "Kirim Volume ke Draft RAB" muncul hanya kalau ada item siap pakai.
   Baris yang dikirim berisi volume, sementara kode AHSP sengaja kosong untuk
   dipilih user di halaman RAB (dilarang dikarang).

## Fallback manual (tetap ada, tidak dihapus)
Tempel teks/deskripsi gambar → "Transkrip dengan AI" (`POST /api/ai/tkg`,
Gemini menyalin ke JSON TkgDocument, divalidasi Zod) ATAU tempel JSON
TkgDocument manual — dipakai kalau upload PDF gagal/tidak tersedia, atau
gambar bukan format PDF yang didukung.

## Sumber angka (ENGINE-ONLY)
- `POST /drawings/analyze` (persepsi, `document-intelligence`) — TIDAK
  menghitung biaya, hanya menstruktur.
- `POST /tkg/validate` · `POST /tkg/render` · `POST /tkg/takeoff`
  (`core-engine`).
- Volume satuan dari dimensi: `POST /geometry/volume` (24 tipe elemen).
- Setelah jadi baris RAB → `POST /rab/build`. ❌ Tidak ada hitung di frontend.

## Peran AI di halaman ini
- **PERSEPSI (deterministik, rule-based — BUKAN LLM)** — span/merge-run/
  grammar/grid-geometri semuanya regex & geometri PDF, bukan model bahasa.
  Ini konsisten Aturan Emas: klasifikasi/strukturisasi boleh otomatis
  deterministik, TIDAK PERNAH mengarang angka.
- **TRANSCRIBE (fallback lama, path Gemini)** — AI menyalin teks gambar →
  struktur TkgDocument (raw dipertahankan; tak paham → `unclassified`, bukan
  ditebak). Teks gambar = DATA, bukan instruksi (P-SEC-01, delimiter prompt).
- **NEVER** — AI tidak menetapkan volume/biaya/AHSP; semua kuantitas dari
  engine, dengan rumus & parameter tercatat (`rule_id`, `params_used`,
  `assumptions`).

## Penyimpanan
`lib/projects/tkg-repository.ts` — TKG per proyek (localStorage/Firestore),
dengan flag `source` (manual/ai_proposal/pipeline) + `reviewed`.

## Catatan strategi — DIPERBARUI (sebelumnya bilang CV "ditunda", sudah tidak)
Sebelumnya dokumen ini bilang "membaca piksel gambar mentah tetap DITUNDA
sampai gerbang F0+WoO" — itu SUDAH TIDAK BERLAKU untuk jalur vektor (PDF
dengan teks asli, BUKAN scan/foto): owner memutuskan (2026-07-04/05) untuk
mengerjakan langsung persepsi PDF vektor sekarang, karena ini TIDAK
menyentuh gerbang F0 sama sekali (murni baca teks/geometri PDF, bukan
tebakan vision-LLM). Vision-LLM (baca piksel foto/scan) TETAP ditunda —
hanya dipakai sbg fallback OCR gagal, bukan jalur utama.

## Akses Engineering Chat
Chat menerima context pack: skrip `.tkg.txt` + draft RAB
(`lib/ai/project-context.ts`) — jadi bisa diskusi gambar/RAB tanpa ekstrak
ulang. Chat boleh MENGUTIP angka dari pack (hasil engine), dilarang menghitung
angka baru.

## Fallback manual
Selalu ada: tempel JSON TkgDocument langsung; atau input item/dimensi manual
di Smart RAB → engine hitung.

## Status
Upload PDF → persepsi otomatis: aktif. Konsolidasi lintas-halaman + UI
ramah-pengguna: aktif. Kirim-ke-RAB: aktif untuk item takeoff yang tidak
`needs_review`; volume masuk Draft RAB, kode AHSP tetap kosong dan diisi
manual di halaman RAB. CV piksel foto/scan (vision-LLM fallback): belum.
