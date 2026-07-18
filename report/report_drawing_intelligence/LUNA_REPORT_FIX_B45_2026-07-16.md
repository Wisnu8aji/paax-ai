# Luna Report — Fix Review F2–F6/F8 B4/B5

**Tanggal:** 2026-07-16  
**Branch:** `feat/pckm-phase3-synthesis`  
**Scope:** `services/db`, `packages/schemas`, `services/db/tests`  
**Tidak disentuh:** `services/document-intelligence`, `ai-orchestrator`, `apps/web`.

## Bukti merah → hijau

Tes regression ditulis lebih dulu. Run RED awal menangkap **9 failure / 25 pass** pada subset intent+retrieval.

| Temuan | Bukti RED | Perbaikan dan GREEN |
|---|---|---|
| F6 | Anchor `material K1` masih `CALCULATION_REQUIRED`; `konflik dimensi` belum diputuskan parser. | Grammar memisahkan material dari calculation signal; precedence parser menjadi conflict sebelum numeric. Anchor material/beton menjadi lookup, kebutuhan besi menjadi calculation; subset final hijau. |
| F2 | `K1 lantai 2` mengembalikan `OCC-W1 / Jendela`. | Entity diterapkan pada summary path dan fallback BFS; tes memastikan hanya `K1` serta node relasinya. |
| F3 | `mep lantai 2` berstatus `grounded` karena node level tetap ada. | Status dihitung dari occurrence yang lolos filter, pasca-pruning; level tetap dapat dikirim sebagai konteks dengan status `empty` dan note. |
| F4 | Seed search terjadi pada refusal; parser exception jatuh ke legacy; API menghilangkan metadata saat `intent=None`. | Calculation refusal tidak memanggil seed/legacy dan guidance hanya memakai entity dari plan. Parser error kalkulasi menjadi `not_ready`; API tetap meneruskan `intent`, `data_status`, dan `notes`. |
| F5/D11 | Response/summary belum membawa semantik cardinality. | `notes[]` menegakkan kalimat D11 pada retrieval dan summary view; GET summary view juga dinormalisasi dan diberi note. Benchmark GT20 memeriksa note. |
| F8 | `summary_view` Pydantic masih `Dict[str, Any]`. | Ditambahkan model Pydantic penuh yang mirror struktur Zod, termasuk notes; response dan GET summary view memakai model tersebut. |

## Perubahan utama

- `project_graph_intent.py`: `_MATERIAL_TERMS`, `_CALCULATION_SIGNAL_TERMS`, `has_calculation_signal()`, dan precedence conflict → calculation → numeric.
- `project_graph_retrieval.py`: entity/discipline filtering pada level summary dan BFS, empty status berbasis occurrence, refusal fail-closed, D11 note, serta filtering summary payload.
- `schemas.py` dan `packages/schemas/src/index.ts`: parity `ProjectGraphSummaryView` dan `data_status=not_ready`.
- `main.py`: metadata intent tetap terlihat saat parser fallback/error; GET summary view memakai schema penuh + D11.
- `run_pckm_benchmark.py`: GT8 memvalidasi semua occurrence terhadap level dan discipline; GT18 entity+level; GT19 zero-match; GT20 D11; GT21 parser-error refusal; GT22 no graph seed search.

## Verifikasi akhir

| Perintah | Hasil |
|---|---:|
| `python -m pytest -q` dari `services/db` | **57 passed, 1 skipped, 3 warnings** |
| `PYTHONUTF8=1 python tests/run_pckm_benchmark.py` | **13/13 PASS** |
| `pnpm exec tsc --noEmit` dari `packages/schemas` | **exit 0** |
| `pnpm test -- --runInBand` dari `packages/schemas` | **28 passed** |
| `graphify update .` | **berhasil**, 6.075 nodes / 11.911 edges / 409 communities |

Benchmark scorecard regenerated di:
`report/report_drawing_intelligence/BENCHMARK_SCORECARD_2026-07-16.md`.

Catatan benchmark: working tree memiliki perubahan paralel A4 di doc-intel yang membuat constructor `LevelCanonicalization` meminta `provider_audits` sementara call-site belum mengisinya. Karena file doc-intel berada di luar scope, runner memakai compatibility shim lokal dengan default audit kosong; tidak ada file doc-intel yang diubah oleh pekerjaan ini.

Graphify memberi warning viz dilewati karena graph >5.000 node, serta 10 JSON dan 1 SQL tidak menghasilkan node. Warning tersebut tidak menghalangi update AST graph.

Tidak ada commit atau push dilakukan.
