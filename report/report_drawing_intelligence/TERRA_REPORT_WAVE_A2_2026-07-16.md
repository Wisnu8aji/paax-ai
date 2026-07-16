# Terra Report — Wave A2: Kebijakan Occurrence per Disiplin

## Status verifikasi

Implementasi A2 dan seluruh test `services/document-intelligence` telah hijau.
Namun report ini **tidak menyatakan tugas sepenuhnya selesai** karena run penuh
`services/db` terakhir gagal saat collection akibat file eksternal untracked
`tests/test_project_graph_intent.py` yang mengimpor
`paax_db.project_graph_intent`, sementara modul itu tidak ada. File tersebut
bukan bagian A2 dan tidak diubah dalam pekerjaan ini.

## Keputusan: implementasi ulang bersih

Saya memilih `git checkout -- services/document-intelligence/app/project_graph/cross_sheet_resolver.py`
atas diff parsial, lalu membangun ulang dari test regresi. Alasannya:

- diff parsial masih dapat membuat occurrence fallback dari halaman POTONGAN
  bila tipe yang sama memiliki konteks denah;
- diff parsial tetap menahan MEP tanpa space, padahal space hanya wajib untuk
  architecture;
- perubahan produksi parsial belum memiliki test merah. Test baru membuktikan
  tiga gap tersebut sebelum implementasi: structure tanpa space, POTONGAN
  yang bocor sebagai occurrence kedua, dan MEP tanpa space.

## Perubahan per file

- `services/document-intelligence/app/project_graph/cross_sheet_resolver.py`
  - menambah gate occurrence deterministik untuk judul `TABEL`/`SCHEDULE`,
    fakta kategori `tables`, serta judul `POTONGAN`/`TAMPAK`/`SECTION`/`ELEVATION`;
    drawing reference dan `HAS_DIMENSION` tetap diproses sebelum gate;
  - mempertahankan mekanisme level yang ada (judul lalu level terdekat), tanpa
    kanonisasi elevasi A3;
  - architecture tetap membutuhkan level+space; MEP menggunakan space bila
    tersedia dan memakai konteks level+sheet bila tidak; structure memakai
    level+space bila tersedia, jika tidak memakai grid terdekat, lalu
    level+sheet bila grid tidak ada;
  - occurrence grid mendapat edge `ALIGNED_TO`; level tetap satu-satunya
    target `LOCATED_ON`;
  - fallback level+sheet memakai `verification_status="ambiguous"`, karena
    `needs_review` bukan nilai legal pada `ProjectGraphNode`;
  - menambah `label_count`, yaitu `len(sources)` label hasil ekstraksi yang
    tergabung dalam konteks yang sama. Ini metadata evidence, bukan kuantitas
    atau perhitungan takeoff.
- `services/document-intelligence/tests/test_project_graph_synthesis.py`
  - test sintetis grid structure, title schedule, fact `tables`, POTONGAN,
    MEP tanpa space, dan fallback structure tanpa grid.
- `services/document-intelligence/tests/test_project_graph_real_fixture.py`
  - mengunci anchor fixture baru dan memverifikasi halaman 43, 51, dan 54.

Tidak ada perubahan pada `packages/schemas`, skema Pydantic transcription,
atau Command Room.

## Anchor fixture dan justifikasi angka

Pengukuran langsung fixture 88 halaman menggunakan `len()` atas node/edge dan
sumber label distinct dalam konteks deterministik:

- Hal. 43, `DENAH KOLOM LANTAI 2`: `KOLOM K1A`, `KOLOM K2`, dan `KOLOM K3`
  masing-masing punya satu occurrence `Lantai 2 / Grid Line 4`, dengan
  `label_count` 12, 3, dan 2. Tidak ada space pada halaman tersebut; locator
  adalah fakta grid terdekat dari bbox label.
- Hal. 51 (`TABEL BALOK LANTAI 1 & SLOOF`) menghasilkan 0 occurrence.
- Hal. 54 (`POTONGAN - B`) menghasilkan 0 occurrence baru.
- Anchor snapshot setelah A2: 83 occurrence, 4.196 node, 4.549 edge,
  203 missing-information, 8 possibly-same, 42 escalation, dan 5 level
  yang direferensikan occurrence. Perubahan dibanding baseline lama berasal
  dari masuknya occurrence struktur denah kolom/balok (hal. 42–48) sekaligus
  hilangnya occurrence dari tabel/potongan.

## Hasil test dan benchmark

| Pemeriksaan | Sebelum | Sesudah / status terakhir |
|---|---:|---:|
| `services/document-intelligence` pytest | baseline sebelum diff parsial: 418 passed, 5 skipped; setelah diff parsial: 417 passed, 5 skipped, 1 failed | **424 passed, 5 skipped** |
| `services/db` pytest | **37 passed, 1 skipped** pada run awal | run penuh terakhir: **1 collection error** dari `tests/test_project_graph_intent.py` untracked, di luar A2 |
| PCKM benchmark | 1/8 PASS | **3/8 PASS**: GT2 PASS, GT4 PASS, GT16 PASS |

Benchmark yang masih FAIL: GT6, GT8, GT9, GT14, dan GT17. Itu berada di
jalur dimensi/retrieval/intent/alias, bukan scope A2.

`graphify update .` telah dijalankan dari root dan berhasil memperbarui graph
AST (5.859 node, 11.331 edge, 399 community).

## Risiko dan batasan

- Grid fixture saat ini memakai bbox label grid di tepi gambar; aturan A2
  memang meminta nilai grid terdekat, sehingga seluruh label halaman 43
  terikat ke `Grid Line 4`. Interseksi dua sumbu atau geometri axis penuh
  bukan scope A2.
- MEP tanpa space dipertahankan memakai konteks level+sheet dan berstatus
  `ambiguous` agar tidak terlihat sebagai binding ruang yang pasti. Kebijakan
  A2 hanya menetapkan bahwa space tidak wajib untuk MEP; bila identitas
  lebih rinci dibutuhkan, perlu keputusan domain lanjutan.
- A3 sengaja tidak dikerjakan: pseudo-level/elevasi tidak dikonversi atau
  digabung dalam perubahan ini.
- Error collection DB terakhir perlu ditangani oleh pemilik perubahan
  `test_project_graph_intent.py`/modul intent sebelum status repo penuh dapat
  dinyatakan hijau.
