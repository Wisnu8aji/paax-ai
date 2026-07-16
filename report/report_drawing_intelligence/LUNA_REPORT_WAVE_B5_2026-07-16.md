# LUNA Report Wave B5 — Retrieve v2 Plan-Driven

Tanggal: 2026-07-16  
Branch: `feat/pckm-phase3-synthesis`

## Ringkasan

SPEC B5 telah diimplementasikan pada jalur retrieval `services/db`. Endpoint
tetap backward-compatible: request eksplisit `use_intent=false` memakai perilaku
legacy, sedangkan default request baru adalah `use_intent=true` sesuai kontrak.
Tidak ada commit atau push.

## Perubahan per file

| File | Perubahan |
|---|---|
| `services/db/src/paax_db/project_graph_retrieval.py` | Dispatcher plan-driven; eksekusi level lewat `project_graph_summary_views` lalu fallback BFS scoped; entity lookup/numeric fact memakai seed entity dan allowlist relasi; seed `drawing_reference` yang cocok menjaga fakta dimensi GT6; kalkulasi short-circuit dengan `calculation_required`, guidance, dan `rab_bridge_available`; conflict/missing-data lookup; status/filter/notes/summary; pruning melindungi dimension/material/reference/sheet; audit seed memakai seed asli dan edge pasca-pruning tidak menggantung. |
| `services/db/src/paax_db/main.py` | Meneruskan `use_intent`, mengembalikan field v2, dan memakai `response_model_exclude_unset` agar payload legacy tetap ringkas. |
| `services/db/src/paax_db/schemas.py` | Menambah `use_intent` pada request serta `intent`, `applied_filters`, `data_status`, `notes`, `summary_view`, `guidance`, `rab_bridge_available`, dan `missing_information` pada response. |
| `packages/schemas/src/index.ts` | Menambah mirror Zod `ProjectGraphRetrievalRequestSchema` dan `ProjectGraphRetrievalResponseSchema`. |
| `services/db/tests/test_project_graph_retrieval.py` | Menambah fixture dan test untuk lima jalur intent, summary/fallback scope, dimensi+evidence, refusal kalkulasi, konflik, missing data, schema/API v2, serta dua bug audit. |

`services/document-intelligence` dan Command Room tidak disentuh oleh
implementasi B5; perubahan yang sudah ada di worktree area lain dipertahankan.

## Hasil verifikasi nyata

1. `python -m pytest -q` dari `services/db`

   ```text
   49 passed, 1 skipped, 3 warnings in 16.98s
   ```

2. `python tests/run_pckm_benchmark.py` dari `services/db`

   ```text
   GT2 PASS
   GT4 PASS
   GT6 PASS
   GT8 PASS
   GT9 PASS
   GT14 PASS
   GT16 PASS
   GT17 PASS
   TOTAL: 8/8 PASS
   ```

3. `pnpm exec tsc --noEmit` dari `packages/schemas`

   Exit code `0`, tanpa error.

4. `graphify update .` dari root repo

   Graph diperbarui: `5933 nodes`, `11567 edges`, `394 communities`.
   HTML dilewati otomatis karena graph melebihi batas 5000 node; ini bukan
   kegagalan update.

## Scorecard sebelum–sesudah

| Tahap | Hasil | Catatan |
|---|---:|---|
| Benchmark awal setelah jalur v2 pertama | 6/8 | GT6 belum menjangkau dimension; GT14 masih salah klasifikasi sebagai numeric fact. |
| Setelah prioritas conflict | 7/8 | GT14 lulus. |
| Setelah seed `drawing_reference` deterministik | **8/8** | GT6 lulus; GT2/GT4/GT16/GT17 tidak regresi. |

## Keraguan dan risiko

- Query konflik yang juga memuat kata numerik (`konflik dimensi`) diprioritaskan
  di dispatcher retrieval agar kontrak `CONFLICT_LOOKUP` tetap terpenuhi; ini
  menutup perbedaan prioritas parser B4 tanpa mengubah layanan lain.
- Default `use_intent=true` berarti request lama tanpa field tersebut masuk jalur
  v2; request yang perlu perilaku retrieval lama dapat mengirim
  `use_intent=false`. Field payload lama tetap dipertahankan.
- Pruning berbasis budget mempertahankan seed dan node fakta penting. Jika
  budget sangat kecil hingga seed tunggal sendiri melebihi budget, hasil tetap
  menjaga seed agar audit dan grounding tidak hilang.
- Tiga warning pytest berasal dari deprecation Pydantic/Starlette yang sudah
  ada; tidak ada error test.
