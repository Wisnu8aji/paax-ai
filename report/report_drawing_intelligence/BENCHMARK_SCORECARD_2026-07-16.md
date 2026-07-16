# Benchmark Scorecard — 2026-07-16

Runner v0 (baseline). Hasil: **8/8 PASS**.
Ground truth: `BENCHMARK_GROUND_TRUTH_SEED_2026-07-16.md`.

| GT | Query | Ekspektasi | Hasil | Catatan | Latensi |
|---|---|---|---|---|---|
| GT2 | `Lantai 2` | Elemen di Lantai 2 termasuk STRUKTUR | **PASS** | occ total=36, occ struktur=15 (wajib >0: K1A/K2/K3/lintel ada di hal.43,48) | 185ms |
| GT4 | `Lantai 2` | Kolom L2 (K1A/K2/K3) muncul sbg occurrence | **PASS** | kode kolom terlihat=['K1A', 'K2', 'K3'], occ struktur=15 | 12ms |
| GT6 | `K1` | Dimensi K1 400x400 terjangkau dari query K1 | **PASS** | node dimensi 400x400 di hasil: ['400x400 mm'] | 69ms |
| GT8 | `struktur lantai 2` | Frasa alami disiplin+lokasi tidak nol | **PASS** | nodes=31 (frasa alami wajib tidak nol & scoped benar) | 111ms |
| GT9 | `berapa volume beton lantai 2` | Pertanyaan kalkulasi ditolak/diarahkan | **PASS** | status=calculation_required, tanpa penanda calculation_required -> sukses-kosong menyesatkan | 17ms |
| GT14 | `konflik dimensi` | Konflik hal.81 terjangkau | **PASS** | node conflict di hasil=1 (1 konflik nyata hal.81 ada di graf) | 26ms |
| GT16 | `Lantai 3` | Level tak ada -> nol jujur | **PASS** | nodes=0 (wajib 0 untuk Lantai 3) | 16ms |
| GT17 | `Main Floor` | Alias semantik level dikenali | **PASS** | hasil mengandung Lantai 1? ya | 65ms |
