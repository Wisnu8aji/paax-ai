# PAAX Drawing Intelligence — Kreo Adaptation Super Big Plan

**Tanggal:** 21 Juli 2026  
**Fokus:** Drawing Intelligence saja  
**Tidak termasuk:** final RAB, schedule, pricing, atau quantity authority downstream  
**Baseline uji:** PDF PLHUT 88 halaman + 88 DEM JSON  
**Prinsip:** menambah, mengembangkan, dan menyempurnakan tanpa mengurangi frontend atau alur yang sudah benar

---

# 1. Tujuan produk

PAAX harus berkembang dari sistem yang sekadar membaca halaman menjadi **Drawing Intelligence Workbench** yang mampu:

1. memahami satu paket gambar sebagai satu proyek;
2. membedakan halaman plan, detail, schedule, legend, section, dan diagram;
3. memanfaatkan primitive vektor bila tersedia dan vision/OCR hanya ketika diperlukan;
4. membentuk kosakata proyek dari legenda dan schedule;
5. menemukan kandidat simbol, garis, area, ruang, dan jaringan;
6. menghubungkan label pada plan dengan definisi pada schedule/detail;
7. menyajikan hasil sebagai kandidat pekerjaan yang dapat diperiksa pengguna;
8. menerima positive/negative examples dan koreksi pengguna;
9. mempertahankan evidence, koordinat, confidence, dan alasan setiap kandidat;
10. tidak pernah mengubah label atau kandidat menjadi quantity final secara diam-diam.

Target produknya bukan “fully autonomous takeoff tanpa review”. Target yang benar adalah:

> **High-confidence assisted Drawing Intelligence dengan bukti, geometri, dan review manusia yang sangat cepat.**

---

# 2. Prinsip adaptasi Kreo

PAAX tidak menyalin implementasi privat Kreo. Yang diadaptasi adalah pola produknya:

```text
Document package
→ page intelligence
→ project vocabulary
→ specialist tools
→ candidate geometry
→ review and correction
→ accepted project intelligence
```

Pola Kreo yang diadaptasi:

- vector-first, raster-fallback;
- Smart Page Layout dan Plan Zones;
- Smart Labels;
- Auto Count berbasis contoh proyek;
- Find Similar dengan positive/negative examples;
- One-Click Area;
- One-Click Line;
- Cross Reference;
- Auto Measure bertahap;
- confidence and review workflow;
- agent/tool orchestration.

Pola yang tidak boleh diadaptasi secara keliru:

- tidak membuat satu VLM besar membaca seluruh paket sekaligus;
- tidak menghitung quantity final di model AI;
- tidak menganggap jumlah simbol sama dengan jumlah fisik;
- tidak menyembunyikan hasil ber-confidence rendah;
- tidak membuang data vektor PDF/CAD;
- tidak menjalankan tool mahal pada semua halaman tanpa routing.

---

# 3. Arsitektur target

```text
PDF / CAD / raster
        │
        ▼
Drawing Package Ingestion
        │
        ├── Native vector primitives
        ├── Native text and tables
        ├── Raster pyramid
        └── Unified coordinate system
        │
        ▼
Page Intelligence
        │
        ├── Sheet identity
        ├── Plan zones
        ├── Discipline / level / drawing type
        ├── Quality and scale state
        └── DEM fusion
        │
        ▼
Project Vocabulary and Cross References
        │
        ├── Legend definitions
        ├── Schedule definitions
        ├── Smart labels
        ├── Aliases
        └── Plan occurrence ↔ definition links
        │
        ▼
Specialist Tool Runtime
        │
        ├── Auto Count
        ├── Find Similar
        ├── One-Click Area
        ├── One-Click Line
        ├── Room / wall reconstruction
        ├── Structural topology
        └── MEP network tracing
        │
        ▼
Candidate Work Items + Review Queue
        │
        ├── Evidence
        ├── Geometry
        ├── Missing information
        ├── Confidence and reasons
        └── User acceptance / rejection
        │
        ▼
Accepted Drawing Intelligence
```

DEM tetap menjadi bukti per halaman. PCKM tetap menjadi pengetahuan lintas halaman. Runtime baru berada di antara keduanya sebagai **tool-based drawing understanding and candidate generation layer**.

---

# 4. Definisi status

- **Implemented:** fungsi dasar bekerja pada PDF PLHUT dan mempunyai test.
- **Implemented baseline:** fungsi bekerja, tetapi cakupan drawing style masih terbatas.
- **Partial:** kontrak dan sebagian algoritma tersedia, belum cukup untuk produksi luas.
- **Planned:** belum dibuat.
- **Blocked:** memerlukan dataset, infrastruktur, atau keputusan produk eksternal.

---

# FASE 1 — Golden Baseline dan Safety Freeze

## Tujuan

Membuat satu benchmark tetap sehingga setiap pengembangan dapat dibuktikan meningkatkan kualitas, bukan hanya menambah kode.

## Sudah diterapkan

- benchmark PDF PLHUT 88 halaman;
- fusion dengan 88 DEM;
- 19 pemeriksaan deterministik;
- page scorecard, package analysis, user delivery, dan benchmark scorecard;
- larangan live AI provider selama benchmark;
- pemeriksaan bahwa tidak ada physical count atau final quantity yang auto-accepted.

## Pekerjaan lanjutan

- menambah minimal dua drawing set berbeda;
- membuat benchmark scan/raster buruk;
- membuat benchmark architectural residential;
- membuat benchmark structural/MEP dengan gaya simbol berbeda;
- menetapkan toleransi regression per metrik.

## Exit gate

- seluruh dataset mempunyai manifest dan checksum;
- benchmark dapat diulang satu command;
- setiap PR Drawing Intelligence wajib menghasilkan scorecard;
- regression release diblok jika score turun di bawah ambang.

---

# FASE 2 — Modality Router

## Tujuan

Menentukan jalur terbaik untuk PDF vektor, PDF scan, image, DWG, dan DXF.

## Sudah diterapkan

- deteksi vector/hybrid/raster;
- PDF bytes dan path contract;
- DWG/DXF fail-closed bila converter belum dikonfigurasi;
- audit metadata input kind.

## Pekerjaan lanjutan

- adapter ODA/LibreDWG terpisah;
- deteksi halaman campuran vector + scan;
- quality routing berdasarkan text/path/image density;
- per-page analysis policy, bukan satu policy untuk seluruh file.

## Exit gate

Setiap halaman mempunyai modality, confidence, routing decision, dan alasan yang dapat diaudit.

---

# FASE 3 — Unified Coordinate and Render Pyramid

## Tujuan

Menyatukan PDF point, pixel, normalized coordinate, rotation, crop, dan viewport.

## Sudah diterapkan

- normalized BBox contract;
- coordinate validation;
- native PDF geometry conversion;
- page rotation/size metadata.

## Pekerjaan lanjutan

- canonical transform persisted per page;
- multi-resolution tile pyramid;
- exact viewport ↔ source round-trip tests;
- CAD model-space/paper-space transform;
- rotated/cropped scan calibration.

## Exit gate

Klik evidence, candidate, dan measurement selalu kembali ke objek yang sama pada semua zoom dan resolusi.

---

# FASE 4 — Native Vector and Text Index

## Tujuan

Mengekstrak primitive teknis sekali per halaman lalu digunakan ulang oleh semua tool.

## Sudah diterapkan

- vector path/text/image profiling;
- lazy vector descriptor;
- per-page isolation untuk menghindari memory accumulation;
- filtering whole-page clipping/background paths;
- native text token index.

## Pekerjaan lanjutan

- spatial R-tree/STRtree index persisted;
- line and polyline topology cache;
- hatch/style descriptors;
- layer/color/lineweight preservation untuk CAD;
- vector cache invalidation berdasarkan document hash.

## Exit gate

Seluruh specialist tool menggunakan satu immutable page index dan tidak memanggil ekstraksi geometri berulang.

---

# FASE 5 — Smart Page Layout dan Plan Zones

## Tujuan

Membedakan drawing area, title block, legend, schedule, notes, stamp, image, dan detail zone.

## Sudah diterapkan

- deterministic zone baseline;
- title block and table heuristics;
- zone-aware count policy;
- schedule/legend/detail dilarang menjadi occurrence plan.

## Pekerjaan lanjutan

- layout detector pluggable;
- table cell reconstruction;
- multiple drawing frames dalam satu page;
- user-adjustable plan zones;
- save/reuse user zone corrections.

## Exit gate

Legenda tidak pernah dihitung sebagai objek fisik, dan setiap token/detection mempunyai zone provenance.

---

# FASE 6 — Sheet Identity, Discipline, Level, Scale, Revision

## Tujuan

Memberikan identitas teknik yang benar untuk setiap halaman.

## Sudah diterapkan

- title, drawing type, discipline, level, scale candidates;
- title-priority level inference;
- 88 halaman mempunyai semantic identity;
- classification mencakup structural, architectural, civil, electrical, plumbing, dan mechanical drawing types.

## Pekerjaan lanjutan

- consultant/project-specific title block templates;
- sheet number reliability scoring;
- issue date and revision extraction;
- duplicate/superseded sheet detection;
- scale calibration workflow.

## Exit gate

Setiap halaman mempunyai normalized identity dan revision state; unknown tetap unknown, tidak diisi tebakan.

---

# FASE 7 — Engineering OCR dan Table Intelligence

## Tujuan

Membaca teks teknis, dimensi, symbol, schedule, dan table pada scan maupun vector PDF.

## Sudah diterapkan

- native PDF text first;
- optional OCR fallback interface;
- DEM text fusion;
- table records baseline;
- engineering-code normalization.

## Pekerjaan lanjutan

- OCR model adapter khusus engineering;
- table structure recognition;
- Ø, ±, elevation, fraction, superscript, dan unit normalization;
- OCR consensus native text vs raster OCR;
- cell-level evidence.

## Exit gate

Schedule dapat direkonstruksi sebagai row/column typed records dengan evidence per cell.

---

# FASE 8 — Project Vocabulary dan Smart Labels

## Tujuan

Belajar istilah proyek dari legenda, schedule, title, dan DEM.

## Sudah diterapkan

- 155 vocabulary entries pada PLHUT;
- canonical code dan aliases;
- project-specific categories;
- dimension extraction dari definitions;
- duplicate definition consolidation.

## Pekerjaan lanjutan

- semantic embeddings optional/offline;
- abbreviation dictionary per discipline;
- vocabulary versioning per revision;
- human merge/split/rename controls;
- negative synonym rules.

## Exit gate

Kode seperti K2, D1, W1, LP, atau fixture proyek dapat dicari konsisten walau penulisannya berbeda.

---

# FASE 9 — Cross Reference Engine

## Tujuan

Menghubungkan occurrence pada plan ke definition pada legend/schedule/detail.

## Sudah diterapkan

- 279 cross-sheet matches pada PLHUT;
- plan-only occurrence policy;
- schedule/legend definitions;
- DEM occurrence priority untuk mencegah double count native text;
- evidence dan confidence per link.

## Pekerjaan lanjutan

- callout bubble and section/detail reference graph;
- revision-aware cross references;
- unresolved and competing definition UI;
- cross-reference calibration per discipline.

## Exit gate

Setiap kandidat occurrence memiliki definition link atau alasan jelas mengapa belum terhubung.

---

# FASE 10 — Project Prototype Memory

## Tujuan

Memungkinkan pengguna mengajari PAAX dengan contoh positif dan negatif dari proyek yang sama.

## Sudah diterapkan

- deterministic vector descriptor;
- positive example aggregation;
- hard-negative penalty;
- transparent similarity score;
- project-specific prototype candidate status.

## Pekerjaan lanjutan

- persistent prototype store;
- prototype versioning by drawing revision;
- raster embeddings for scan;
- rotation/mirror normalization;
- propagation across sheets;
- correction-derived active learning.

## Exit gate

Satu contoh simbol dan beberapa penolakan dapat menghasilkan candidate retrieval yang stabil pada seluruh drawing set.

---

# FASE 11 — Auto Count

## Tujuan

Menghasilkan candidate count simbol berulang dengan review yang cepat.

## Sudah diterapkan

- text/cross-reference candidate counting;
- vector similarity candidate retrieval;
- observed count separated from verified count;
- duplicate suppression baseline;
- no auto-accepted physical counts.

## Pekerjaan lanjutan

- tiled class-agnostic detector;
- SAHI-style overlapping patch merge;
- rotation/mirror controls;
- search area restriction;
- confidence slider;
- batch accept/reject;
- physical-instance deduplication across overlapping drawings.

## Exit gate

Auto Count menghasilkan precision/recall terukur dan pengguna dapat menyelesaikan review jauh lebih cepat daripada hitung manual.

---

# FASE 12 — One-Click Area

## Tujuan

Mengubah click positif/negatif menjadi polygon candidate yang dapat diperiksa.

## Sudah diterapkan

- vector closed-boundary selection;
- positive/negative point filtering;
- smallest valid containing region;
- raw PDF geometry candidate;
- canvas and authorized backend API integration;
- explicit non-final quantity label.

## Pekerjaan lanjutan

- promptable raster segmentation adapter;
- boundary snapping to vector lines;
- void/opening subtraction;
- polygon cleaning and topology validation;
- scale-confirmed value conversion;
- user boundary editing.

## Exit gate

Candidate polygon bersih, dapat diedit, memiliki evidence, dan tidak dihitung final sebelum scale serta boundary disetujui.

---

# FASE 13 — One-Click Line

## Tujuan

Mengikuti garis, centerline, atau polyline teknis dari satu click.

## Sudah diterapkan

- nearest vector path selection;
- raw line geometry candidate;
- canvas integration;
- candidate status and review messaging.

## Pekerjaan lanjutan

- endpoint snapping;
- graph traversal through connected segments;
- gap bridging with bounded tolerance;
- branch handling;
- wall/pipe/cable category-specific tracing;
- scale-confirmed length.

## Exit gate

User dapat mengklik satu segment dan memperoleh connected line candidate yang bisa diperbaiki tanpa menggambar ulang manual.

---

# FASE 14 — Find Similar

## Tujuan

Mencari area atau objek yang menyerupai satu atau beberapa contoh.

## Sudah diterapkan

- vector descriptor similarity;
- multi-positive and negative examples;
- threshold and max candidate controls;
- run-scoped authenticated API;
- transparent rationale.

## Pekerjaan lanjutan

- raster/self-supervised embeddings;
- multi-sheet approximate nearest-neighbor index;
- hatch/texture/style features;
- region proposal generator;
- feedback-based reranking;
- UI selection flow untuk contoh positif/negatif.

## Exit gate

Find Similar dapat mencari lintas halaman dengan candidate score yang konsisten dan dapat diaudit.

---

# FASE 15 — Architectural Auto Measure

## Tujuan

Merekonstruksi wall, room, door, window, stair, dan closed spaces.

## Status

**Partial.** Primitive, zones, vocabulary, cross references, dan candidate geometry sudah ada; room/wall graph penuh belum selesai.

## Pekerjaan lanjutan

- wall face/centerline extraction;
- junction detection;
- door/window insertion;
- room polygon closure;
- room adjacency graph;
- multi-task raster fallback;
- architectural fixture benchmark.

## Exit gate

Satu floor plan menghasilkan room/wall graph yang dapat diedit dan mempunyai geometric validity checks.

---

# FASE 16 — Structural dan MEP Topology

## Tujuan

Membentuk hubungan grid–column–beam–slab serta fixture–line–network.

## Status

**Partial.** Cross-sheet column/schedule linking sudah bekerja; topology fisik penuh belum selesai.

## Pekerjaan lanjutan

- grid axis reconstruction;
- column-to-grid candidate assignment;
- beam connectivity;
- slab boundary candidate;
- MEP point and line linking;
- connected component/network graph;
- conflict handling across plan/section/detail.

## Exit gate

PAAX dapat menjelaskan struktur atau jaringan pada satu level dengan evidence dan uncertainty, tanpa mengarang hubungan.

---

# FASE 17 — Human Review dan Fix with AI

## Tujuan

Mengubah uncertainty menjadi pekerjaan review yang cepat dan jelas.

## Sudah diterapkan

- 92 review tasks pada PLHUT;
- zone/classification/work-item task types;
- severity, evidence, candidate IDs, status;
- accepted/rejected distinction pada model.

## Pekerjaan lanjutan

- persistent review queue;
- keyboard/batch review;
- side-by-side source and candidate;
- boundary correction tools;
- reason capture;
- reviewer audit trail;
- propagation of accepted corrections.

## Exit gate

Setiap uncertainty yang mempengaruhi hasil mempunyai owner, status, source, dan tindakan review yang dapat diselesaikan di UI.

---

# FASE 18 — Active Learning dan Project Memory

## Tujuan

Menggunakan koreksi manusia untuk meningkatkan proyek tanpa melatih model besar secara sembunyi-sembunyi.

## Status

**Partial project prototype baseline.** Positive/negative descriptors tersedia tetapi persistence dan feedback loop belum lengkap.

## Pekerjaan lanjutan

- correction event store;
- accepted prototype library;
- hard-negative library;
- project-template reuse dengan persetujuan;
- model-independent feature store;
- evaluation before promotion;
- rollback and revision invalidation.

## Exit gate

Koreksi satu kali dapat digunakan ulang secara terkontrol dan peningkatannya dapat diukur pada benchmark.

---

# FASE 19 — Frontend Operational Workspace

## Tujuan

Membuat seluruh kemampuan dapat digunakan tanpa mengganti desain yang sudah baik.

## Sudah diterapkan

- analysis mode Fast/Balanced/Deep;
- Package Intelligence summary;
- real page/vocabulary/cross-reference/work-item/review metrics;
- One-Click Area dan One-Click Line canvas calls;
- run/page identity retained;
- honest status: candidate, not final quantity;
- no fake model/confidence/time claim.

## Pekerjaan lanjutan

- visual zones;
- legend/schedule viewer;
- Find Similar example selection;
- candidate gallery and confidence slider;
- review queue persistence;
- positive/negative feedback UI;
- editable polygons/lines;
- accessibility and large-package virtualization.

## Exit gate

Pengguna dapat melakukan analyze → inspect → teach → detect → review → accept tanpa meninggalkan workspace.

---

# FASE 20 — Continuous Testing, Observability, dan Release Gate

## Tujuan

Menjadikan kualitas Drawing Intelligence dapat diukur dan dijaga terus-menerus.

## Sudah diterapkan

- repeatable deterministic runner;
- 19/19 benchmark checks;
- page scorecard;
- package metrics;
- no AI API calls;
- 88-page processing sekitar 19,3 detik pada fast mode;
- test coverage untuk runtime, routes, durable worker, synthesis, PCKM, retrieval, and Core Engine baseline.

## Pekerjaan lanjutan

- CI artifact upload;
- performance/memory regression thresholds;
- per-discipline precision/recall;
- human correction time metric;
- multi-project benchmark suite;
- PostgreSQL/pgvector integration run;
- full Node test/typecheck/build;
- release dashboard.

## Exit gate

Tidak ada release Drawing Intelligence tanpa benchmark, performance, security, package integrity, dan regression evidence yang hijau.

---

# 5. Urutan eksekusi lanjutan yang disarankan

## Gelombang A — Productionize baseline

Fase 1–9 dan 19–20:

- persist page index, zones, vocabulary, cross references, package analysis;
- complete DB models/migrations;
- run full CI;
- build review UI;
- add second project benchmark.

## Gelombang B — Interactive tools

Fase 10–14 dan 17–18:

- persistent prototypes;
- Find Similar UI;
- editable One-Click Area/Line;
- batch review;
- feedback memory.

## Gelombang C — Auto Measure

Fase 15–16:

- architectural room/wall graph;
- structural grid/topology;
- MEP network graph;
- discipline-specific benchmarks.

---

# 6. KPI utama

| KPI | Baseline PLHUT | Target berikutnya |
|---|---:|---:|
| Page analyzed | 88/88 | 100% pada seluruh benchmark |
| DEM coverage | 100% | 100% |
| Known drawing type | >95% | >98% |
| Valid DEM bbox ratio | 98.55% | >99.5% |
| Page ready ratio | 86.36% | >95% |
| Vocabulary entries | 155 | kualitas, bukan jumlah |
| Cross references | 279 | precision >95% pada golden labels |
| Work-item candidates | 79 | precision/recall per category |
| Review tasks | 92 | kurangi tanpa mengurangi recall |
| Auto-accepted physical counts | 0 | tetap 0 tanpa human/engine gate |
| AI-provider calls in benchmark | 0 | tetap 0 untuk deterministic baseline |
| Fast-mode runtime | 19.31 s | <20 s pada hardware baseline |

---

# 7. Definition of Done produk Drawing Intelligence

Drawing Intelligence dapat disebut matang apabila:

1. minimal tiga drawing set berbeda lulus benchmark;
2. vector, scan, and mixed pages mempunyai routing yang benar;
3. page zones dan sheet identity dapat dikoreksi pengguna;
4. vocabulary dan cross references mempunyai evidence;
5. Auto Count/Area/Line/Find Similar mempunyai precision/recall terukur;
6. room/wall dan structural/MEP topology mempunyai validity tests;
7. semua kandidat memiliki status, confidence, reason, and source;
8. koreksi pengguna tersimpan dan dapat digunakan ulang;
9. tidak ada physical count atau final quantity berasal dari label semata;
10. frontend menampilkan state nyata, bukan mock atau hardcoded claim;
11. full Python, Node, PostgreSQL, pgvector, security, and migration CI hijau;
12. benchmark package artifacts dapat diaudit ulang.

---

# 8. Risiko dan mitigasi

## Risiko: meniru Kreo secara terlalu literal

Mitigasi: adaptasi workflow dan prinsip, bukan menyalin model privat atau UX satu-ke-satu.

## Risiko: model vision dianggap sumber geometri final

Mitigasi: model hanya candidate generator; geometry engine dan review menentukan accepted geometry.

## Risiko: jumlah simbol dianggap jumlah fisik

Mitigasi: `occurrence_count_observed` dipisahkan dari `accepted_detection_count` dan verified physical count.

## Risiko: pipeline menjadi terlalu mahal

Mitigasi: modality routing, lazy deep analysis, per-page durable jobs, cache, dan specialist tools.

## Risiko: frontend terlihat matang tetapi backend belum nyata

Mitigasi: semua metrik dari persisted artifact; unknown tetap unknown; demo state dipisahkan.

## Risiko: overfit ke PLHUT

Mitigasi: multi-project benchmarks dan category-specific metrics sebelum release.

---

# 9. Keputusan akhir

Fondasi baru ini tidak menggantikan DEM, PCKM, frontend, atau Core Engine. Ia mengisi bagian yang sebelumnya hilang: **otak Drawing Intelligence yang memilih dan mengoordinasikan alat khusus, mengubah bukti menjadi kandidat yang matang, serta menjaga manusia sebagai penerima akhir.**

Status saat ini adalah **working deterministic baseline**, bukan final autonomous product. Baseline sudah cukup kuat untuk dilanjutkan ke persistence, review workflow, project prototype memory, dan Auto Measure bertahap tanpa membongkar pekerjaan lama.

---

# 10. Referensi riset utama

Dokumentasi dan repository berikut digunakan sebagai acuan pola arsitektur dan evaluasi lisensi. Tidak satu pun diperlakukan sebagai source code yang boleh disalin tanpa review lisensi.

## Kreo product behavior

- Kreo 6.0 — Agentic Computer Vision for Construction Drawings.
- Kreo Plan Zones.
- Kreo Auto Count.
- Kreo One-Click Area.
- Kreo One-Click Line.
- Kreo Find Similar with AI.
- Kreo Auto Measure / Auto Measure 2.0.
- Kreo Cross Reference.

## Open research and reference implementations

- DocLayout-YOLO — document-zone detection.
- eDOCr — engineering drawing OCR patterns.
- PID Symbol Detection — class-agnostic detection plus project-specific examples.
- DINOv2 — visual similarity representation.
- Segment Anything — point-prompted segmentation concept.
- CubiCasa5K and DeepFloorplan — room/wall/door floor-plan understanding.
- Raster-to-Graph — raster floor plan to structured graph.
- SAM-Road — mask-to-network graph pattern.
- Circuitry — component detection plus line/network tracing.

## Keputusan penggunaan

- Tidak menambahkan model weight atau dependency berat pada baseline ini.
- Tidak memanggil layanan eksternal selama benchmark.
- Setiap adapter model harus pluggable dan fail-closed.
- Lisensi wajib diperiksa sebelum dependency masuk produk komersial.
- Baseline deterministik tetap menjadi fallback dan regression oracle.
