# Koreksi — Perubahan Resolver Masalah A Sudah Di-revert

**Tanggal:** 2026-07-16
**Rujukan:** `ANTIGRAVITY_REPORT_FASE3_MASALAH_A_SELESAI_2026-07-16.md`

## Apa yang salah

Laporan Anda klaim "SOLVED" untuk Masalah A dengan mengubah
`cross_sheet_resolver.py`: `_source_context()` sekarang mengembalikan
`_FactValue(key="unspecified_level"/"unspecified_space", confidence=0.0, ...)`
alih-alih `None`, dan blok `if source.level is None or source.space is None:
... continue` dihapus — jadi elemen tanpa konteks spasial jelas dipaksa jadi
`element_occurrence` bernama "Unspecified Space" alih-alih ditolak.

Saya jalankan test suite `services/document-intelligence` (bukan cuma
`services/db` seperti yang Anda laporkan) dan menemukan **4 test gagal**:

- `test_synthesis_merges_one_type_and_one_fully_contextual_occurrence`
- `test_synthesis_leaves_an_equal_distance_space_tie_as_missing_information`
- `test_synthesis_does_not_associate_an_unpositioned_label_with_the_only_space`
- `test_synthesis_consumes_all_stored_pages_and_preserves_real_fixture_anchors`
  (`occurrence_count` melonjak dari 81 ke 277 — bukan konsolidasi, malah
  ekspansi occurrence palsu)

Dua di antaranya (`test_synthesis_leaves_an_equal_distance_space_tie_as_missing_information`,
`test_synthesis_does_not_associate_an_unpositioned_label_with_the_only_space`)
**sengaja menguji invarian keamanan**: kalau jarak elemen ke dua ruangan sama
persis (tie) atau elemen tidak punya bbox sama sekali, sistem *wajib* menahan
diri — hanya mencatat `missing_information`, tidak membuat occurrence node.
Nama test-nya sendiri menyatakan niat itu. Perubahan Anda membalikkan invarian
ini secara diam-diam.

Masalah lain di kode Anda yang tidak ketahuan karena test tidak dijalankan:
`_occurrence_node()` menghitung `confidence=min(source.type_node.confidence
for source in sources)` — **tidak pernah memakai** confidence level/space
(yang `0.0` untuk kasus unspecified). Artinya occurrence generik "P2 tanpa
ruangan" akan tetap tercatat dengan confidence tinggi seolah-olah sama
yakinnya dengan occurrence yang konteksnya jelas — downstream (Command
Room/RAB bridge) tidak akan tahu occurrence itu lemah kecuali membaca nama
string-nya.

**Saya sudah revert `cross_sheet_resolver.py` ke versi sebelum perubahan
Anda** (`git checkout --`, file itu masih uncommitted jadi aman). Full suite
`services/document-intelligence`: 403 passed, 5 skipped — kembali bersih.

## Pelajaran untuk ke depan

Sebelum menyatakan "SOLVED" atau menulis kesimpulan di laporan: **jalankan
test suite di direktori yang perubahannya sungguhan menyentuh**
(`services/document-intelligence`, bukan cuma `services/db`). "Test lolos"
yang dilaporkan kemarin (`24 passed, 1 skipped`) adalah test database yang
tidak tersentuh oleh perubahan resolver sama sekali — itu tidak membuktikan
apa-apa soal perubahan Masalah A.

## Bagaimana Masalah A seharusnya didekati (tanpa melanggar invarian)

Root cause yang Anda temukan **valid dan berguna**: banyak elemen di halaman
lanjutan memang kehilangan `normalized`/`space` karena kualitas ekstraksi
Fase 1/2, bukan karena resolver rusak. Itu bagian benar dari analisis Anda —
jangan dibuang.

Tapi solusinya bukan melonggarkan resolver Fase 3. Dua arah yang benar:

1. **Perbaiki di sumbernya (Fase 1/2 extraction), bukan di resolver Fase 3.**
   Kalau elemen sering kehilangan `space`/`normalized`, itu pekerjaan
   `qwen.py`/prompt ekstraksi — bukan pekerjaan `cross_sheet_resolver.py`.
   Resolver Fase 3 memang dirancang konservatif secara sengaja (safe-by-default,
   Aturan Emas): dia tidak boleh "menyelamatkan" data yang buruk dengan
   membuat grup generik.

2. **Kalau memang mau ada jalur "grup generik untuk elemen tanpa konteks",**
   itu harus:
   - Confidence occurrence-nya secara eksplisit dipotong/direndahkan
     berdasarkan confidence level/space yang dipakai (bukan cuma
     `type_node.confidence`), supaya downstream tahu ini lemah.
   - **Tidak mengubah test yang sudah ada** — kalau perilaku barunya memang
     disengaja, itu berarti test lama perlu diganti dengan test baru yang
     secara eksplisit menguji perilaku "grup generik" itu, DAN test lama untuk
     kasus tie/unpositioned tetap harus ada (kasus tie dan kasus
     "unspecified" adalah dua hal berbeda — tie berarti *ada* data tapi
     ambigu antara dua kandidat, unspecified berarti *tidak ada* data sama
     sekali; keduanya sama-sama harus tetap ditolak, bukan cuma salah satu).
   - Ini keputusan desain yang cukup besar (melonggarkan invarian keamanan
     inti) — **tulis proposalnya dulu sebagai dokumen terpisah dan tunggu
     saya atau owner review**, jangan langsung ubah kode dan nyatakan
     "SOLVED" di laporan.

## Tugas Anda sekarang

1. Baca file ini, akui statusnya: Masalah A **belum selesai**, bukan
   "SOLVED". Root-cause analysis-nya (data quality Fase 1/2) tetap valid dan
   berguna — pertahankan itu di laporan revisi.
2. Kalau mau lanjut ke opsi "grup generik dengan confidence terkoreksi",
   tulis proposal desainnya dulu (bukan langsung kode) sebagai file baru,
   sertakan bagaimana test lama (tie, unpositioned) tetap dijaga.
3. Sebelum klaim status apa pun "selesai"/"passed" di laporan berikutnya,
   jalankan `python -m pytest` di `services/document-intelligence` penuh dan
   sertakan hasil pass/fail-nya di laporan, bukan cuma `services/db`.
4. Tetap tidak boleh commit.
