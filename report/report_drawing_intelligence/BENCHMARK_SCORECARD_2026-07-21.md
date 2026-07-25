# Benchmark Scorecard — 2026-07-21

Runner v0 (baseline + F2-F6/F8 guards). Hasil: **14/14 PASS**.
Ground truth: `BENCHMARK_GROUND_TRUTH_SEED_2026-07-16.md`.

| GT | Query | Ekspektasi | Hasil | Catatan | Latensi |
|---|---|---|---|---|---|
| GT2 | `Lantai 2` | Elemen di Lantai 2 termasuk STRUKTUR | **PASS** | occ total=5, occ struktur=3 (wajib >0: K1A/K2/K3/lintel ada di hal.43,48) | 362ms |
| GT4 | `Lantai 2` | Kolom L2 (K1A/K2/K3) muncul sbg occurrence | **PASS** | kode kolom terlihat=['K1A', 'K2', 'K3'], occ struktur=3 | 10ms |
| GT6 | `K1` | Dimensi K1 400x400 terjangkau dari query K1 | **PASS** | node dimensi 400x400 di hasil: ['400x400 mm'] | 162ms |
| GT8 | `struktur lantai 2` | Frasa alami disiplin+lokasi tidak nol | **PASS** | occ=11, wrong_discipline=[], wrong_level=[] | 94ms |
| GT9 | `berapa volume beton lantai 2` | Pertanyaan kalkulasi ditolak/diarahkan | **PASS** | status=calculation_required, tanpa penanda calculation_required -> sukses-kosong menyesatkan | 17ms |
| GT14 | `konflik dimensi` | Konflik hal.81 terjangkau | **PASS** | node conflict di hasil=1 (1 konflik nyata hal.81 ada di graf) | 24ms |
| GT16 | `Lantai 3` | Level tak ada -> nol jujur | **PASS** | nodes=0 (wajib 0 untuk Lantai 3) | 15ms |
| GT17 | `Main Floor` | Alias semantik level dikenali | **PASS** | hasil mengandung Lantai 1? ya | 126ms |
| GT20 | `struktur lantai 2` | Semantik cardinality D11 terlihat di notes | **PASS** | D11 note hadir=ya | 10ms |
| GT23 | `balok lintel di lantai mana saja` | Lintel grounded dan occurrence lintel terlihat | **PASS** | data_status=grounded, occurrence lintel=6 | 125ms |
| GT18 | `K1 lantai 2` | Entity+level hanya K1 pada Lantai 2 | **PASS** | occ=1, wrong_entity=[] | 27ms |
| GT19 | `mep lantai 2` | Discipline valid tanpa match -> empty | **PASS** | data_status=empty, nodes=1 | 23ms |
| GT21 | `berapa kebutuhan besi K1 parser failure` | Parser error kalkulasi tetap refusal/not_ready | **PASS** | status=not_ready, data_status=not_ready, notes=['occurrence_count = jumlah kelompok konteks tercatat pada gambar, bukan jumlah fisik terpasang', 'parser: calculation_refusal_not_ready', 'parser_error: RuntimeError'] | 14ms |
| GT22 | `berapa kebutuhan besi K1 no seed` | Refusal kalkulasi tidak melakukan graph seed search | **PASS** | status=calculation_required, nodes=0 | 16ms |
