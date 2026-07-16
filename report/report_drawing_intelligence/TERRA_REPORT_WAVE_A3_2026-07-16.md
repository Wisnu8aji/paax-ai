# Terra Report — Wave A3: Kanonisasi Level Penuh

## Status verifikasi

Implementasi A3 telah diverifikasi pada suite document-intelligence, suite DB
read-only, fixture PLHUT 88 halaman, dan benchmark PCKM. Tidak ada perubahan
ke `packages/schemas`, Command Room, ataupun source `services/db`.

## Keputusan: pre-pass deterministik sebelum binding occurrence

Saya menempatkan kanonisasi di antara `build_sheet_patch()` dan
`resolve_cross_sheet()`. Dengan demikian `_source_context()` menerima fakta
level yang sudah dire-key, bukan elevasi/angka mentah yang kebetulan terdekat
secara geometri.

- Pemetaan eksplisit dipanen dari seluruh fakta teks proyek dengan pola
  `EL. <elevasi> <nama lantai>`; bukti mapping ikut menjadi evidence source
  level kanonis.
- Datum 0.000 bertanda plus/minus dire-key ke `Lantai 1`; `+4.400` ke
  `Lantai 2`; `+8.300` ke `Atap`; elevasi kurang dari `-0.5` menjadi
  `Substruktur`.
- Angka polos (termasuk 3000 dan 2000) tidak dapat menjadi identitas level.
  Occurrence terkait memakai placeholder `Lantai Tidak Terpetakan`, berstatus
  `ambiguous`, dan menerima `missing_information` bertipe `NUMBER_NOISE`.
- `Main Floor` dan `Ground Floor` adalah alias statis `Lantai 1`. `First/1st
  Floor` sengaja tidak dimasukkan karena konvensi tidak tunggal.
- `Lantai-Atap P +16.20` dipertahankan sebagai kandidat ambigu dan memiliki
  `POSSIBLY_SAME_AS` deterministik ke `Atap`; tidak ada merge otomatis.
- Interface provider semantik tersedia sebagai hook opsional default `None`.
  Hook tersebut tidak dipanggil; semua hasil A3 pada run ini deterministik dan
  tanpa jaringan.

## Perubahan per file

- `services/document-intelligence/app/project_graph/level_canonicalizer.py`
  - modul baru untuk klasifikasi `FLOOR_NAME`, `ELEVATION`, dan
    `NUMBER_NOISE`, panen mapping `EL.`, alias statis, audit metadata, serta
    antrian pasangan review level;
  - menghasilkan salinan patch agar fakta ekstraksi asli tidak diubah.
- `services/document-intelligence/app/project_graph/synthesis.py`
  - memanggil pre-pass sebelum resolver cross-sheet;
  - mematerialkan node level kanonis dengan `aliases`, `merged_from`,
    `elevation`, source evidence, dan edge review deterministik.
- `services/document-intelligence/app/project_graph/cross_sheet_resolver.py`
  - memakai metadata fakta kanonis ketika membangun context; angka/noise dan
    elevasi belum terpetakan tidak dipakai sebagai identitas;
  - fallback yang berasal dari kandidat tertolak diberi status `ambiguous`.
- `services/document-intelligence/tests/test_project_graph_synthesis.py`
  - anchor sintetis tahap klasifikasi, mapping EL, datum plus/minus aktual,
    alias `Main Floor`, substruktur, angka noise, dan kandidat atap ambigu.
- `services/document-intelligence/tests/test_project_graph_real_fixture.py`
  - memperbarui anchor fixture lengkap dan mengunci lima level kanonis.

## Anchor fixture dan justifikasi angka

Pengukuran langsung fixture PLHUT 88 halaman sesudah A3:

- 83 occurrence tetap, 4.197 node, 4.550 edge, 260 missing-information,
  9 `possibly_same`, 42 escalation, dan 1 conflict.
- Lima level kanonis adalah `Lantai 1`, `Lantai 2`, `Atap`, `Substruktur`,
  serta kandidat `Lantai-Atap P +16.20`. Satu node `Lantai Tidak Terpetakan`
  masih ada sebagai placeholder review A2, bukan identitas kanonis.
- `Lantai 1`, `Lantai 2`, dan `Atap` menyimpan elevasi `0.000`, `+4.400`,
  dan `+8.300` sebagai properti. `Substruktur` menyimpan daftar datum negatif
  ber-evidence, termasuk `-1.300`.
- Kenaikan node dari anchor A2 (4.196 ke 4.197) berasal dari materialisasi
  metadata level kanonis; kenaikan edge satu berasal dari relasi review atap.
  Tidak ada aritmatika kuantitas atau takeoff dalam perubahan ini.

## Hasil test dan benchmark

| Pemeriksaan | Hasil terakhir |
|---|---:|
| `pytest services/document-intelligence -q` | **426 passed, 5 skipped** |
| `pytest services/db -q` | **49 passed, 1 skipped** |
| PCKM benchmark | **8/8 PASS** |

GT2, GT4, dan GT16 tetap PASS. GT17 `Main Floor` sekarang PASS; scorecard
terakhir juga menunjukkan GT6 PASS untuk dimensi K1 `400x400`.

`graphify update .` selesai: 5.933 node, 11.567 edge, 393 community. Graphify
melaporkan dua warning lingkungan yang tidak terkait A3: sepuluh file sumber
tanpa node dan parser SQL opsional tidak tersedia.

## Risiko dan batasan

- Elevasi positif tanpa mapping eksplisit tetap `ambiguous`; tidak dipetakan
  ke lantai terdekat secara spekulatif.
- Datum negatif yang berbeda tetap berada pada strata `Substruktur`; nilai
  elevasi disimpan sebagai evidence metadata dan bukan identitas baru.
- Hook provider belum menjalankan proposal apa pun. Integrasi panggilan live
  tetap task terpisah setelah gate yang sesuai.
- Placeholder A2 `Lantai Tidak Terpetakan` tidak dihapus oleh A3 karena
  menghapusnya akan mengubah kebijakan fallback occurrence di luar scope.
