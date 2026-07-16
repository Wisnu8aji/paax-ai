# SPEC Gelombang A — Kebenaran Data Spasial (2026-07-16) [FINAL — ratifikasi Fable 2026-07-16]

> Spec implementasi untuk roadmap Master Plan §5 Gelombang A item 2-3.
> Basis bukti: FABLE_R1 §4b-4d + scorecard baseline 1/8. Item 1 (benchmark) SUDAH ada:
> `services/db/tests/run_pckm_benchmark.py` + GT seed. Ratifikasi selesai — eksekusi berjalan.

## A2 — Kebijakan occurrence per disiplin (perbaiki gerbang yang membunuh struktur)

**File**: `services/document-intelligence/app/project_graph/cross_sheet_resolver.py`
(`_source_context` L327-339; blok occurrence L681-726) + `page_patch.py` (cek kategori
"grids" masuk facts).

**Kebijakan baru (menggantikan wajib level+ruang universal):**
1. `level` WAJIB untuk semua occurrence (sumber: judul sheet → pemetaan elevasi → fallback).
2. `space` WAJIB hanya untuk disiplin `architecture`; untuk `mep` dipakai bila ada
   (mayoritas gambar MEP melabeli ruang); untuk `structure` OPSIONAL.
3. `structure` tanpa space → locator = **grid axis terdekat** dari bbox label (fakta kategori
   "grids" — 10/halaman tersedia di fixture); identitas konteks = `(level.key, "grid:"+grid_key)`;
   bila grid tak ada → `(level.key, "sheet:"+sheet_id)` dengan status `needs_review`.
4. Halaman SCHEDULE (judul mengandung TABEL/SCHEDULE, atau ada fakta kategori "tables"):
   TIDAK menghasilkan occurrence — label di sana = sumber DEFINISIONAL (dimensi/material per
   tipe; jalur HAS_DIMENSION dari reference sudah ada, dipertahankan).
5. Halaman POTONGAN/TAMPAK (judul POTONGAN/TAMPAK/SECTION/ELEVATION): TIDAK menghasilkan
   occurrence BARU dan TIDAK membuat identitas level dari teks elevasi terdekat; mereka
   menjadi sumber pemetaan elevasi→lantai (lihat A3) dan konfirmasi silang (fase lanjut).

**Test acuan manual (wajib, nilai dihitung tangan dari fixture):**
- hal.43 "DENAH KOLOM LANTAI 2" → muncul occurrence struktur di Lantai 2: K1A (12 label),
  K2 (3), K3 (2) dengan locator grid; `occurrence_count` = jumlah konteks distinct, dan
  properti label-count per konteks = angka di atas.
- hal.51 "TABEL BALOK LANTAI 1 & SLOOF" → 0 occurrence dari halaman ini.
- hal.54 "POTONGAN - B" → 0 occurrence baru; 0 level baru dari elevasi.
- Fixture penuh: structure element_occurrence dari 1 → >0 signifikan (angka pasti dikunci
  saat implementasi, dengan penjelasan); GT2/GT4 scorecard → PASS.

## A3 — Kanonisasi level penuh (hapus pseudo-level)

**Modul baru**: `services/document-intelligence/app/project_graph/level_canonicalizer.py`,
dipanggil di `synthesis.py` SEBELUM cross-sheet occurrence binding (pre-pass yang
menghasilkan peta kanonis untuk dipakai `_source_context`).

**Tahapan (tangga rule → Flash → Pro, sesuai §13 plan kanonik):**
1. **Klasifikasi kandidat level** (deterministik):
   - `FLOOR_NAME`: pola Lantai/LT/Level/Floor/Story + N, Atap/Roof, Dasar/Ground/Basement.
   - `ELEVATION`: pola peil `[EL.]? ±N.NNN` / `+N.NNN` / `-N.NNN`.
   - `NUMBER_NOISE`: angka polos (3000, 2000) → DITOLAK sebagai identitas level
     (kemungkinan dimensi salah kategori; catat ke missing_information/audit).
2. **Panen pemetaan eksplisit** dari seluruh teks sheet: pola `EL. <elev> <FLOOR_NAME>`
   (bukti hal.54: "EL. ±0.000 LANTAI 1", "EL. +4.400 LANTAI 2", "EL. +8.300 LANTAI ATAP")
   → peta elevasi→lantai proyek, deterministik, ber-evidence.
3. **Aplikasi peta**: sumber ber-ELEVATION di-re-key ke lantai kanonis; elevasi < -0.5 tanpa
   peta → strata `Substruktur`; elevasi tak terpetakan lain → status `ambiguous` (JANGAN tebak).
4. **Alias lintas bahasa** (deterministik dulu): kamus statis per-proyek + global
   (Main Floor/Ground Floor→Lantai 1, First/1st Floor→Lantai 1 ATAU 2 — TIDAK di kamus
   global karena konvensi US/UK beda → wajib jalur AI/review). Sisa kasus →
   **DeepSeek Flash** proposal (key Drawing Intelligence), tervalidasi terhadap daftar level
   FLOOR_NAME yang ada, hasil `merge`/`possibly_same`/`keep_separate` + audit penuh
   (pola provider eskalasi yang SUDAH live-verified dipakai ulang).
5. **Audit trail**: setiap re-key/merge dicatat (aliases + properties.merged_from +
   evidence_refs); node level kanonis final menyimpan `elevation` sbg properti, bukan identitas.

**Test acuan manual:**
- `±0.000` & `Elevasi ±0.000` → Lantai 1 (7+2 occurrence pindah ke Lantai 1).
- `+4.400` → Lantai 2; `+8.300` → Atap; `3000`/`2000` ditolak (occurrence-nya → needs_review).
- `Lantai Atap P +16.20` TIDAK auto-merge dengan `Atap` (+8.300 ≠ +16.20) → `possibly_same`
  antrian review.
- `Main Floor` (kasus DEM nyata) → Lantai 1 via kamus/Flash + audit.
- Fixture penuh: level kanonis = **3-4 + kandidat ambigu** (bukan 12); GT1/GT17 → PASS.

## A4 — DEM Evidence Integrity Gate v1 (ditambahkan via Amendemen 1 pasca-audit Sol, angka diverifikasi Fable)

**Masalah terukur (fixture 88 hal):** 6.904/7.004 bbox (98,6%) di luar kontrak 0-1
(koordinat piksel); 839 evidence_refs menggantung di 47 halaman; 33 ID evidence duplikat
dalam halaman; 15 halaman tanpa evidence; kontradiksi completion (hal.42 is_complete=true
padahal sections 9/12). Parser saat ini hanya `model_validate` Pydantic.

**Modul baru**: `services/document-intelligence/app/transcription/integrity.py` —
`build_integrity_report(sheet: DrawingEvidenceSheet) -> DemIntegrityReport` (murni
deterministik):
1. **evidence_refs**: setiap ref wajib resolve ke evidence_id halaman itu. Observasi yang
   SEMUA ref-nya menggantung → masuk `quarantined_observations` (kategori+raw+alasan);
   sebagian menggantung → `flagged_observations`. TIDAK memutasi DEM (immutable).
2. **bbox / coordinate_space**: klasifikasi per halaman — `normalized` (semua 0-1),
   `pixel_like` (mayoritas >1), `mixed`. Simpan di report; bbox TIDAK diubah.
   (Catatan teknis: pencocokan nearest-value tetap sah dalam satu halaman karena skala
   konsisten; yang dilarang adalah memakai bbox lintas-halaman/overlay UI tanpa konversi.)
3. **evidence_id duplikat** dalam halaman → daftar + hitung.
4. **completion invariant**: is_complete konsisten dengan sections_completed vs expected;
   pelanggaran dicatat.
5. **halaman tanpa evidence** → status `no_evidence` (halaman cover/pemisah sah — bukan
   otomatis error, tapi observasi ber-ref di halaman itu pasti quarantined oleh aturan 1).

**Skema**: `DemIntegrityReport` Pydantic BARU di transcription/models.py + mirror Zod di
packages/schemas/src/index.ts DALAM PERUBAHAN YANG SAMA (aturan §2 CLAUDE.md).
Field: page_index, sheet_id, coordinate_space, counts (total_bbox, out_of_contract_bbox,
dangling_refs, duplicate_evidence_ids, quarantined_observation_count), quarantined_observations[],
flagged_observations[], completion_consistent, notes[].

**Integrasi synthesis (gate konsumsi)**: `page_patch.build_sheet_patch` menerima report
opsional; observasi quarantined TIDAK menjadi fact/node (dicatat ke missing_information
dengan alasan "integrity: dangling evidence"), flagged tetap masuk dengan
verification_status="ambiguous". `synthesize_project_graph` membangun report per sheet
secara internal (default ON).

**Test acuan manual (angka fixture terverifikasi):** report agregat 88 hal = 6.904/7.004
bbox out-of-contract; 839 dangling; 33 duplikat; 15 no_evidence; hal.42
completion_consistent=False. Test sintetis: observasi full-dangling → tidak jadi node +
tercatat; partial-dangling → node ambiguous. Anchor real-fixture (nodes/edges/
missing_information) dikunci ulang dengan justifikasi.

**Urutan**: A4 dieksekusi SETELAH A2+A3 (menyentuh page_patch/synthesis yang sama), dan
WAJIB hijau sebelum Gelombang B menyajikan data ke Command Room (keputusan D10).

## Batas Aturan Emas (berlaku kedua spec)
Tidak ada aritmatika kuantitas: semua count = len() distinct; tidak ada penjumlahan
dimensi; keputusan AI hanya klasifikasi/penyatuan identitas dengan validasi + audit +
status ambigu; tidak pernah auto-commit merge berisiko tanpa jejak.

## Urutan eksekusi & verifikasi
1. A2 dulu (data masuk graf) → 2. A3 (identitas benar) → 3. jalankan
   `run_pckm_benchmark.py` → target minimal 5/8 PASS setelah A2+A3 (GT2/4/16/17 + GT1 lewat
   endpoint overview belum ada — angka target final dikunci saat ratifikasi).
2. Setelah merah→hijau: `graphify update .`, pytest penuh dua direktori, update scorecard.
