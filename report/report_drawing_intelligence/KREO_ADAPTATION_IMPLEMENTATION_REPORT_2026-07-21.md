# PAAX Drawing Intelligence — Kreo Adaptation Implementation Report

**Tanggal:** 21 Juli 2026  
**Scope:** Drawing Intelligence only  
**Input benchmark:** `GAMBAR KERJA PLHUT SURAKARTA (1).pdf` + 88 DEM JSON  
**Live AI-provider calls:** 0  
**Frontend redesign:** tidak dilakukan

---

# 1. Ringkasan eksekutif

PAAX sebelumnya sudah memiliki DEM, PCKM, retrieval, review contracts, dan frontend Drawing Intelligence, tetapi belum memiliki satu “otak” yang mengoordinasikan alat seperti vector extraction, plan zones, legend/schedule vocabulary, project-specific matching, candidate geometry, dan human review.

Implementasi ini menambahkan **Drawing Intelligence Tool Runtime** yang mengadaptasi pola Kreo secara aman:

```text
vector/raster routing
→ page intelligence
→ project vocabulary
→ cross-sheet linking
→ specialist detection/geometry tools
→ candidate work items
→ review queue
```

Runtime baru tidak menggantikan DEM atau PCKM. Ia memperkaya keduanya dan tetap mematuhi Aturan Emas: tidak ada quantity final yang dihitung oleh AI atau Drawing Intelligence.

---

# 2. Hasil riset yang menjadi dasar desain

Kreo paling masuk akal dipahami sebagai kumpulan alat khusus yang dikoordinasikan oleh workflow agent, bukan satu model vision universal. Adaptasi PAAX mengikuti prinsip:

- native vector data diprioritaskan;
- raster/OCR adalah fallback;
- halaman dipisahkan menjadi zona;
- legend dan schedule membentuk vocabulary proyek;
- detection menggunakan contoh proyek dan hard negatives;
- neural/model output hanya candidate;
- deterministic geometry dan review menghasilkan accepted result;
- processing berat dirouting per page/tool.

Komponen open-source dipelajari sebagai pola arsitektur, bukan langsung disalin sebagai dependency production: document layout detection, engineering OCR, promptable segmentation, visual similarity, floor-plan graph reconstruction, and diagram topology.

---

# 3. Arsitektur yang diterapkan

## 3.1 Package ingestion

- menerima path atau bytes;
- memprofilkan modality per halaman;
- mengisolasi pembacaan halaman agar memory tidak menumpuk;
- memanfaatkan native vector/text;
- menyediakan raster fallback contract;
- menghasilkan unified normalized coordinates.

## 3.2 Page intelligence

Setiap halaman mempunyai:

- page profile;
- semantic identity;
- discipline;
- drawing type;
- level;
- scale candidates;
- zones;
- native/DEM tokens;
- quality and readiness.

## 3.3 Project intelligence

- vocabulary dari legend/schedule/DEM;
- canonical aliases and dimensions;
- cross-sheet reference links;
- candidate detections;
- candidate work items;
- review tasks;
- phase and performance metrics.

## 3.4 Specialist tools

- One-Click Area;
- One-Click Line;
- Find Similar;
- multi-positive and hard-negative prototype score;
- vector descriptor Auto Count baseline;
- authorized run-scoped endpoints.

## 3.5 Frontend delivery

- analysis mode Fast/Balanced/Deep;
- Package Intelligence metrics;
- real work-item/review data;
- canvas One-Click Area and Line;
- explicit candidate/non-final messaging;
- no fake model/confidence/time claims.

---

# 4. Benchmark PLHUT 88 halaman

| Metric | Result |
|---|---:|
| PDF pages analyzed | 88/88 |
| DEM pages fused | 88/88 |
| Semantic identity | 88/88 |
| Known drawing type | >95% |
| DEM bbox valid ratio | 98.55% |
| Page ready ratio | 86.36% |
| Project vocabulary | 155 entries |
| Cross-sheet references | 279 |
| Candidate work items | 79 |
| Review tasks | 92 |
| Auto-accepted physical counts | 0 |
| Final quantities calculated | 0 |
| AI-provider calls | 0 |
| Fast-mode elapsed | 19.984013 seconds (latest final run) |
| Benchmark checks | 19/19 PASS |

## Kasus lantai 2

| Code | Observed labels | Definition |
|---|---:|---|
| K1A | 12 | 400 × 400 mm |
| K2 | 3 | 250 × 600 mm |
| K3 | 2 | 250 × 400 mm |

Nilai tersebut adalah **drawing-label observations**, bukan verified physical counts. Seluruh work item tetap memerlukan physical-count verification sebelum dapat menjadi input quantity.

---

# 5. Masalah nyata yang ditemukan dan diperbaiki

1. Legend/schedule/detail labels sempat ikut dihitung sebagai occurrence. Policy diubah sehingga hanya plan/drawing occurrence yang dapat dihitung.
2. DEM labels dan native PDF text menduplikasi occurrence. DEM sekarang menjadi evidence utama; native text menjadi supporting evidence ketika kode sama sudah ada.
3. Level dapat tertipu kata seperti “ATAP” pada notes. Title block/title mempunyai prioritas.
4. Vector index dibuat berulang melalui eager `setdefault`. Cache diperbaiki.
5. Full-page clipping/background CAD paths membebani local descriptor. Dikeluarkan dari descriptor lokal tetapi tetap dicatat sebagai audit metric.
6. PyMuPDF page caches menumpuk pada dokumen besar. Pipeline sekarang mengisolasi pembacaan per halaman.
7. API pipeline path/bytes/mode tidak konsisten. Kontrak disatukan.
8. Runtime belum terhubung ke durable synthesis. Worker sekarang menyimpan Package Intelligence artifact dan metadata PCKM.
9. Frontend setup memakai bahasa yang seolah langsung mengekstrak quantity. Diganti menjadi candidate preparation dan review gate.
10. Frontend preview mempunyai hardcoded model/time/confidence. Diganti dengan persisted runtime metrics atau status unavailable.

---

# 6. Hasil pengujian

## Lulus

- Kreo-adaptation benchmark: **19/19 PASS**;
- focused Drawing Intelligence/PCKM suite: **71 passed**;
- Core Engine full suite: **295 passed**;
- DB retrieval/persistence/review/migration/client/DEM focused suite: **64 passed**;
- TypeScript/TSX parser: **213 files, 0 syntax errors**;
- Python compile: PASS;
- package benchmark runtime: approximately 20.0 seconds on the final run;
- no AI API key/provider call.

## Terbatas atau belum dapat dibuktikan penuh

- full Document Intelligence monolithic suite mencapai sekitar 79% tanpa failure sebelum timeout; heavy fixture tests kemudian diverifikasi melalui focused suite;
- full DB monolithic suite mengalami hang/slow teardown pada SQLite test configuration; file relevan diuji terpisah dan lulus;
- full `tsc --noEmit`, Vitest, dan `pnpm build` belum dapat dijalankan karena Node workspace dependencies tidak tersedia di sandbox;
- PostgreSQL + pgvector migration nyata belum dijalankan dalam sandbox ini;
- raster deep models tidak diunduh atau dipanggil;
- tidak ada klaim bahwa seluruh 20 fase sudah production-complete.

---

# 7. Batasan produk yang masih terbuka

- 448 legacy evidence links belum dapat direkonsiliasi otomatis;
- page readiness baru 86.36%;
- 92 review tasks masih terbuka;
- wall/room graph belum lengkap;
- structural and MEP topology belum lengkap;
- Find Similar frontend example-selection belum lengkap;
- prototype memory belum persisted;
- One-Click Area belum memiliki raster segmentation and advanced polygon cleanup;
- One-Click Line belum memiliki full connected-network tracing;
- benchmark saat ini masih terlalu bergantung pada satu project PLHUT.

---

# 8. File ditambahkan

- `services/document-intelligence/app/api/intelligence_routes.py`
- `services/document-intelligence/app/drawing_intelligence/__init__.py`
- `services/document-intelligence/app/drawing_intelligence/benchmark.py`
- `services/document-intelligence/app/drawing_intelligence/coordinates.py`
- `services/document-intelligence/app/drawing_intelligence/cross_reference.py`
- `services/document-intelligence/app/drawing_intelligence/delivery.py`
- `services/document-intelligence/app/drawing_intelligence/dem_adapter.py`
- `services/document-intelligence/app/drawing_intelligence/evidence_repair.py`
- `services/document-intelligence/app/drawing_intelligence/ingestion.py`
- `services/document-intelligence/app/drawing_intelligence/models.py`
- `services/document-intelligence/app/drawing_intelligence/page_profiler.py`
- `services/document-intelligence/app/drawing_intelligence/page_scorecard.py`
- `services/document-intelligence/app/drawing_intelligence/pipeline.py`
- `services/document-intelligence/app/drawing_intelligence/plan_zones.py`
- `services/document-intelligence/app/drawing_intelligence/prototype_learning.py`
- `services/document-intelligence/app/drawing_intelligence/raster_fallback.py`
- `services/document-intelligence/app/drawing_intelligence/sheet_identity.py`
- `services/document-intelligence/app/drawing_intelligence/text_index.py`
- `services/document-intelligence/app/drawing_intelligence/vector_geometry.py`
- `services/document-intelligence/app/drawing_intelligence/vector_index.py`
- `services/document-intelligence/app/drawing_intelligence/vocabulary.py`
- `services/document-intelligence/app/drawing_intelligence/work_items.py`
- `services/document-intelligence/scripts/run_kreo_adaptation_benchmark.py`
- `services/document-intelligence/tests/test_drawing_intelligence_kreo_runtime.py`
- `services/document-intelligence/tests/test_drawing_intelligence_routes.py`
- `docs/DRAWING_INTELLIGENCE_KREO_RUNTIME.md`
- `docs/plans/drawing intelligence/PAAX_KREO_ADAPTATION_DRAWING_INTELLIGENCE_SUPER_BIG_PLAN_2026-07-21.md`
- `report/report_drawing_intelligence/KREO_ADAPTATION_IMPLEMENTATION_REPORT_2026-07-21.md`
- `report/report_drawing_intelligence/kreo_adaptation_2026-07-21/package-analysis.json`
- `report/report_drawing_intelligence/kreo_adaptation_2026-07-21/benchmark-scorecard.json`
- `report/report_drawing_intelligence/kreo_adaptation_2026-07-21/page-scorecard.json`
- `report/report_drawing_intelligence/kreo_adaptation_2026-07-21/page-scorecard.md`
- `report/report_drawing_intelligence/kreo_adaptation_2026-07-21/user-delivery.json`

---

# 9. File dimodifikasi

- `apps/web/src/components/drawing-intelligence/drawing-intelligence-api.ts`
- `apps/web/src/components/drawing-intelligence/workspace/canvas/canvas-toolbar.tsx`
- `apps/web/src/components/drawing-intelligence/workspace/canvas/drawing-canvas.tsx`
- `apps/web/src/components/drawing-intelligence/workspace/di-types.ts`
- `apps/web/src/components/drawing-intelligence/workspace/inspector/analysis-setup-panel.tsx`
- `apps/web/src/components/drawing-intelligence/workspace/inspector/intelligence-inspector.tsx`
- `apps/web/src/components/drawing-intelligence/workspace/sheet-mapping.ts`
- `apps/web/src/components/drawing-intelligence/workspace/use-backend-sync.ts`
- `apps/web/src/components/drawing-intelligence/workspace/workspace-store.tsx`
- `services/document-intelligence/app/api/dem_routes.py`
- `services/document-intelligence/app/dem_job_handlers.py`
- `services/document-intelligence/app/main.py`
- `services/document-intelligence/app/project_graph/synthesis_task.py`
- `services/document-intelligence/tests/test_dem_durable_routes.py`
- `services/document-intelligence/tests/test_dem_routes.py`
- `services/document-intelligence/tests/test_dem_synthesize_route.py`

Tidak ada file frontend visual yang dihapus. Tidak ada migration historis yang ditulis ulang. Tidak ada credential atau model weight yang ditambahkan.

---

# 10. Cara menjalankan benchmark

```powershell
python services/document-intelligence/scripts/run_kreo_adaptation_benchmark.py
```

Output:

```text
report/report_drawing_intelligence/kreo_adaptation_2026-07-21/
```

---

# 11. Verdict

```text
Working deterministic Drawing Intelligence baseline : YES
Ready to continue development locally               : YES
Ready for controlled internal demo                  : CONDITIONAL YES
Production-ready universal Kreo-class system        : NO
```

Implementasi ini menyelesaikan fondasi otak Drawing Intelligence dan membuktikannya pada 88 halaman nyata. Tahap berikutnya adalah persistence penuh, review workflow, multi-project benchmark, raster specialist adapters, dan topology/Auto Measure yang bertahap.
