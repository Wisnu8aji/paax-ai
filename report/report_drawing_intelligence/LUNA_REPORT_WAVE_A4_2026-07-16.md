# Luna Report — Wave A4: DEM Evidence Integrity Gate v1

## Status verifikasi

Implementasi A4 selesai pada branch `feat/pckm-phase3-synthesis` tanpa commit
atau push. Perubahan A4 hanya menyentuh DEM transcription, PCKM page patch /
synthesis, schema mirror, dan test; `services/db` hanya dijalankan sebagai
suite read-only.

## Keputusan implementasi

Gate integritas dibuat deterministik dan read-only melalui:

- `services/document-intelligence/app/transcription/integrity.py`
  - `build_integrity_report(sheet)` mengembalikan `DemIntegrityReport` tanpa
    memutasi `DrawingEvidenceSheet`;
  - bbox menghitung `views`, `evidence`, dan seluruh `observations`, lalu
    mengklasifikasikan halaman sebagai `normalized`, `pixel_like`, atau `mixed`;
  - dangling refs dihitung dari `sheet_identity` dan `observations`; duplikat ID
    dihitung sebagai kemunculan setelah ID pertama dalam halaman;
  - completion konsisten bila `is_complete` sama dengan kondisi
    `sections_completed == sections_expected`;
  - halaman tanpa `evidence[]` diberi note `no_evidence`.
- `transcription/models.py` menambah `DemIntegrityCounts`,
  `DemIntegrityObservation`, dan `DemIntegrityReport`.
- `packages/schemas/src/index.ts` memiliki mirror Zod yang sama, dengan test
  parse kontrak A4.
- `build_sheet_patch(sheet, integrity_report=None)` menerima report opsional.
  Dengan report A4: observasi full-dangling tidak menghasilkan fact/node/edge;
  observasi partial-dangling tetap dikonsumsi dengan `verification_status`
  `ambiguous` dan status fact yang sama.
- `synthesize_project_graph()` membangun report internal untuk setiap sheet dan
  memakai gate secara default. Setiap quarantine dicatat satu-per-satu di
  `missing_information` dengan alasan `integrity: dangling evidence`.

Bbox tidak dinormalisasi dan nearest-value matching yang sudah ada tidak
diubah.

## Anchor fixture PLHUT 88 halaman

Report per halaman menghasilkan angka acuan yang diverifikasi:

| Metrik | Hasil |
|---|---:|
| Halaman | 88 |
| Total bbox | 7.004 |
| Bbox di luar kontrak 0–1 | 6.904 |
| Dangling refs | 839 pada 47 halaman |
| Kemunculan evidence ID duplikat setelah ID pertama | 33 |
| Halaman tanpa evidence | 15 |
| Observasi quarantine penuh | 774 |
| Observasi flagged parsial | 0 |

774 observasi quarantine tersebar pada 40 halaman yang memiliki observasi
dengan seluruh refs dangling; tujuh halaman lain dari 47 halaman dangling
hanya menyumbang refs pada metadata/identity. Pola quarantine per kategori:

| Kategori | Quarantine |
|---|---:|
| `texts` | 223 |
| `dimensions` | 217 |
| `element_labels` | 55 |
| `grids` | 74 |
| `symbols` | 57 |
| `spaces` | 27 |
| `levels` | 24 |
| `materials` | 23 |
| `notes` | 24 |
| `tables` | 14 |
| `patterns` | 13 |
| `geometry_descriptions` | 20 |
| `references` | 3 |

Perubahan graph yang dikunci ulang setelah quarantine:

- 185 element types, 34 merged types, 75 occurrences, 7 `possibly_same`,
  37 escalation candidates, 1 conflict;
- 3.407 nodes, 3.720 edges, 153 `HAS_DIMENSION` edges, 1.014
  `missing_information`;
- 774 node/edge pasangan page-patch hilang langsung karena observasi sumbernya
  dikarantina. Delta snapshot bersih dari A3 adalah -790 nodes dan -830 edges
  karena materialisasi alias/canonical downstream ikut berubah; occurrences
  berkurang 8 (83 → 75), sesuai label/kontext yang kehilangan seluruh bukti.

Level canonical A3 tetap terjaga: `Lantai 1`, `Lantai 2`, `Atap`,
`Substruktur`, dan `Lantai-Atap P +16.20` (review ambiguous). Anchor halaman
struktur L2 untuk `K1A/K2/K3`, schedule pages, konflik hal.81, serta source
pages J2/BV1/RB3 tetap dikunci.

### Discrepancy metadata completion

Kontrak tugas menyebut hal.42 sebagai index 41. Fixture yang benar-benar ada
menyimpan kontradiksi pada `page-0042.json`, dengan
`source.page_index=42`, `source.page_number=43`, `sections_expected=12`,
`sections_completed=9`, `is_complete=true`. Implementasi dan test mengikuti
metadata DEM aktual (`reports[42].completion_consistent is False`) dan tidak
mengarang hasil false pada index 41. Ini dicatat sebagai discrepancy fixture,
bukan disamarkan sebagai pass.

## Test sintetis A4

- full-dangling: tidak menjadi node/fact/edge dan menghasilkan missing
  information beralasan `integrity: dangling evidence`;
- partial-dangling: tetap menjadi node dengan status `ambiguous`;
- halaman normal: report bersih dan input DEM tidak berubah;
- bbox, duplicate ID, no-evidence, completion contradiction, dan agregat
  fixture mempunyai anchor test eksplisit.

## Hasil test dan benchmark

| Pemeriksaan | Hasil terakhir |
|---|---:|
| `pytest services/document-intelligence -q` | **429 passed, 5 skipped** |
| `pytest services/db -q` | **49 passed, 1 skipped** |
| `pnpm exec tsc --noEmit` di `packages/schemas` | **PASS** |
| `pnpm test` di `packages/schemas` | **28 passed** |
| PCKM benchmark runner | **8/8 PASS** |
| `graphify update .` | **5.964 nodes, 11.642 edges, 406 communities** |

GT2, GT4, GT16, dan GT17 tetap PASS bersama GT6, GT8, GT9, dan GT14.

Warning yang tersisa tidak terkait A4: deprecation `httpx`/Starlette dan
Pydantic pada suite DB, Paddle tanpa ccache, graph HTML dilewati karena lebih
dari 5.000 node, sepuluh sample JSON menghasilkan zero graph nodes, dan parser
SQL opsional belum terpasang.
