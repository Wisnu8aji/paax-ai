# PAAX Drawing Intelligence — PCKM v3 Final Implementation Report

**Tanggal:** 21 Juli 2026  
**Basis kerja:** `paax-ai-main-di-generic-arete-timeline-2026-07-21.zip`  
**Ruang lingkup:** Drawing Intelligence, Construction Intelligence Graph/PCKM v3, konflik antarlembar, rekonstruksi instance fisik, Measurement Facts, Core Engine calculation bridge, frontend review, dan kontrak Command Room Arete.  
**Mode verifikasi:** tanpa live AI provider key.

---

## 1. Ringkasan eksekutif

Gelombang ini menutup perubahan arsitektur terbesar Drawing Intelligence sejak awal proyek. Sistem tidak lagi berhenti pada DEM per halaman atau daftar label mentah. Jalur final sekarang adalah:

```text
PDF/DWG/raster
→ modality routing dan native geometry
→ DEM evidence per halaman
→ sheet/zone identity
→ vocabulary, legend, schedule, notation, detail, dan callout linking
→ Construction Intelligence Graph / PCKM v3
→ Physical Instance Reconstruction
→ Measurement Facts
→ conflict and authority gate
→ Civil Work Item untuk user
→ Core Engine untuk perhitungan final
→ Command Room/Arete dengan konteks terarah
```

Hasil PLHUT 88 halaman:

- halaman dianalisis: **88/88**;
- benchmark teknis: **20/20 PASS**;
- benchmark human delivery: **10/10 PASS**;
- executable phase gate: **20/20 PASS**;
- node graph v3: **448**;
- edge graph v3: **421**;
- instance fisik terkonfirmasi engine: **128**;
- item dengan jumlah terkonfirmasi: **19**;
- item siap dihitung Core Engine: **3**;
- live AI calls: **0**.

Status produksi tetap **conditional**. Pilot PLHUT dan seluruh gate implementasi lulus, tetapi klaim universal membutuhkan ground truth object-level serta proyek independen kedua.

---

## 2. Evolusi arsitektur dari awal proyek

### Tahap awal — DEM per halaman

DEM menyimpan apa yang dibaca pada tiap lembar, termasuk teks, bbox, elemen, dimensi, tabel, dan evidence. DEM tetap dipertahankan sebagai sumber observasi immutable. Kekurangannya: data lintas halaman belum otomatis menjadi satu objek konstruksi yang matang.

### Tahap kedua — PCKM awal

PCKM awal menghubungkan node dan edge lintas lembar. Namun identity resolution, summary views, physical count authority, serta hubungan denah–schedule–detail belum cukup matang. Akibatnya Command Room menerima data yang terlalu teknis atau terlalu konservatif.

### Tahap ketiga — PCKM Query View

Query View mengurangi payload dan memberikan konteks terarah kepada Command Room. Ini menyelesaikan pemborosan token, tetapi belum menyelesaikan pertanyaan mendasar: apakah beberapa representasi benar-benar beberapa objek fisik, bagaimana mengatasi konflik ukuran, dan kapan angka boleh menjadi final.

### Tahap final gelombang ini — Construction Intelligence Graph/PCKM v3

PCKM v3 mempunyai node dan relasi bertipe untuk:

- Document dan Sheet;
- level/spatial scope;
- Definition dari schedule, legend, detail, dan notasi;
- Representation pada denah/potongan/detail;
- Physical Element;
- Measurement Fact;
- Civil Work Item;
- Conflict dan reviewer decision.

Graphify tetap dipakai sebagai indeks source code untuk developer. Graph proyek dibangun khusus oleh Drawing Intelligence dan tidak memakai `graphify-out` saat runtime.

---

## 3. Jumlah fisik dan authority

### Masalah lama

Jumlah DEM lama pada Lantai 2 adalah K1A=12, K2=3, dan K3=2. Audit PDF vektor menunjukkan hasil aktual berbeda. Menjumlahkan DEM dan native text juga tidak sah karena dapat menduplikasi representasi yang sama.

### Implementasi baru

Physical Instance Reconstruction Engine:

1. memilih lembar count-source utama;
2. mengecualikan legend, schedule, detail, dan title block dari count;
3. memakai native vector/text sebagai authority pada PDF vektor;
4. memakai DEM sebagai semantic corroboration dan audit kualitas model;
5. melakukan deduplikasi berbasis posisi/bbox;
6. menghubungkan instance ke level dan definisi;
7. memberi authority hanya setelah seluruh constraint lolos;
8. membatalkan auto-confirm ketika ada konflik aktif.

Hasil Lantai 2:

| Item | Jumlah fisik | Dimensi | Tinggi | Status |
|---|---:|---|---|---|
| K1A | 8 unit | 400 × 400 mm | Belum tersedia | Terkonfirmasi sistem |
| K2 | 4 unit | 250 × 600 mm | 3900 mm | Siap dihitung Core Engine |
| K3 | 5 unit | 250 × 400 mm | Belum tersedia | Terkonfirmasi sistem |

Perbedaan DEM-versus-native dicatat sebagai `model_quality_audit_not_drawing_conflict`, sehingga user tidak dibebani konflik yang sebenarnya berasal dari kualitas ekstraksi model.

---

## 4. Konflik antarlembar dan peran user

Conflict resolver membandingkan definisi dari denah, schedule, detail, potongan, revisi, dan lembar lain. Bila satu lembar berbeda:

- item menjadi **Data rancu**;
- seluruh halaman sumber ditandai;
- tiap nilai dan sumber ditampilkan berdampingan;
- user dapat membuka lembar;
- user dapat memilih sumber yang berlaku;
- user dapat memasukkan ukuran/jumlah/tinggi koreksi;
- user dapat approve atau meminta reupload;
- evidence asli tidak dihapus;
- review ledger menyimpan event berversi dan replay seluruh keputusan.

Mutation-style test memastikan dua konflik pada item yang sama dapat diselesaikan berurutan tanpa keputusan pertama hilang.

Review queue user sekarang hanya berisi keputusan yang benar-benar memerlukan manusia. Enrichment teknis non-kritis dipisahkan menjadi technical audit queue.

Ringkasan human delivery:

- item pekerjaan siap tampil: **64**;
- perlu klarifikasi: **5**;
- noise audit disembunyikan: **4**;
- review task user: **5**;
- batch review: **2**;
- readiness rata-rata: **85/100**.

---

## 5. Definisi lintas lembar, notasi, dan detail

Sistem menghubungkan:

```text
denah ↔ schedule ↔ potongan ↔ detail ↔ legend ↔ daftar singkatan/notasi ↔ revisi
```

Contoh K2 Lantai 2:

- jumlah bersumber dari **DENAH KOLOM LANTAI 2**;
- dimensi 250 × 600 mm bersumber dari **TABEL KOLOM**;
- tinggi 3,9 m bersumber dari bentang elevasi **Lantai 2 → Atap** pada potongan;
- seluruh fakta membawa evidence refs dan source page indices.

Vocabulary proyek: **142 entri**.  
Cross-sheet references: **436**.  
Evidence refs yang dipulihkan secara sah: **166**.

---

## 6. Elevasi dan tinggi efektif

Spatial resolver memisahkan datum level dari tinggi elemen. Datum PLHUT yang diselesaikan:

```text
Lantai 1 : ±0,000 m
Lantai 2 : +4,400 m
Atap     : +8,300 m
Nok atap : +11,097 m
```

Tinggi K2 Lantai 2 ditentukan dari posisi label K2 dalam bentang potongan Lantai 2–Atap, bukan ditebak dari nama lantai. Hasilnya **3.900 mm** dengan evidence pada halaman potongan.

---

## 7. Measurement Facts dan Core Engine

Drawing Intelligence tidak menghitung volume. Ia membentuk Measurement Facts terotorisasi:

- verified count = 4 unit;
- width = 250 mm;
- depth = 600 mm;
- height = 3.900 mm.

Core Engine menjalankan:

```text
0,250 × 0,600 × 3,900 × 4 = 2,340 m³
```

Calculation ID: `584db01d56f272cc5352ff29`  
Engine version: `0.6.0`  
Result: **2.340 m³**  
Status: `complete`

Calculation result dipersist dan muncul kembali setelah refresh. Bila input berubah atau konflik dibuka kembali, hasil dapat ditandai stale dan harus dihitung ulang.

---

## 8. Frontend

Desain utama tidak dirombak. Fitur ditambahkan pada komponen yang sudah ada:

- jumlah fisik terkonfirmasi dan authority;
- ukuran dan Measurement Facts;
- status matang/siap dihitung/Data rancu;
- kartu konflik per field;
- seluruh sumber halaman;
- tombol buka lembar;
- pilih sumber atau masukkan koreksi;
- approve/reject/reopen/request reupload;
- badge `Data rancu` pada navigator;
- tombol `Hitung volume`;
- persisted formula dan result.

Bahasa utama memakai terminologi teknik sipil, bukan nama field internal DEM/PCKM.

---

## 9. Command Room dan Arete

Command Room mengambil human-delivery/PCKM Query View, bukan 88 JSON mentah. Arete menerima:

- item pekerjaan;
- level;
- jumlah fisik dan authority;
- dimensi;
- calculation readiness/result;
- konflik dan missing facts;
- sumber lembar yang mudah dibaca.

Activity timeline tetap berupa ringkasan tindakan aktual dan reasoning summary yang aman; private chain-of-thought mentah tidak dipublikasikan. Offline Arete QA lulus **16/16**, tanpa live API call.

---

## 10. Hasil pengujian

| Area | Hasil |
|---|---:|
| Focused DI/API/review | 48 passed |
| Additional human/review | 10 passed |
| Document Intelligence remainder | 608 passed, 6 skipped |
| **Document Intelligence efektif** | **656 passed, 6 skipped** |
| Core Engine | 296 passed |
| Database | 156 passed, 1 skipped |
| PCKM DB benchmark | 14/14 PASS |
| Schemas Jest | 32 passed |
| AI Orchestrator Vitest | 54 passed |
| Web Vitest | 140 passed |
| Schemas typecheck | PASS |
| AI Orchestrator typecheck | PASS |
| Web `tsc --noEmit` | PASS |
| Technical 88-page benchmark | 20/20 PASS |
| Human delivery benchmark | 10/10 PASS |
| Arete offline QA | 16/16 PASS |
| Phase 1–20 executable gate | 20/20 PASS |

Build status:

- schemas build: PASS;
- types build: PASS;
- AI orchestrator build: PASS;
- web compile: PASS;
- web type validation: PASS;
- Next.js page-data collection: belum selesai pada environment ini; worker tertahan setelah compile/type validation.

PostgreSQL integration test yang memerlukan server nyata dilewati di lingkungan lokal. Migration/static DB gate dan seluruh test lain lulus.

---

## 11. Perubahan file

Perbedaan source final terhadap ZIP basis:

- file baru: **23**;
- file diubah: **21**;
- file dihapus: **0**.

### File baru

- `docs/PAAX_DRAWING_INTELLIGENCE_PCKM_V3_LOCAL_TESTING_GUIDE_2026-07-21.md`
- `docs/plans/drawing intelligence/PAAX_DRAWING_INTELLIGENCE_PCKM_V3_FINAL_IMPLEMENTATION_REPORT_2026-07-21.md`
- `report/report_drawing_intelligence/pckm_v3_final_2026-07-21/DRAWING_INTELLIGENCE_BENCHMARK_88P_2026-07-21.json`
- `report/report_drawing_intelligence/pckm_v3_final_2026-07-21/DRAWING_INTELLIGENCE_HUMAN_BENCHMARK_88P_2026-07-21.json`
- `report/report_drawing_intelligence/pckm_v3_final_2026-07-21/DRAWING_INTELLIGENCE_HUMAN_DELIVERY_88P_2026-07-21.json`
- `report/report_drawing_intelligence/pckm_v3_final_2026-07-21/DRAWING_INTELLIGENCE_PACKAGE_ANALYSIS_88P_2026-07-21.json`
- `report/report_drawing_intelligence/pckm_v3_final_2026-07-21/DRAWING_INTELLIGENCE_PAGE_SCORECARD_88P_2026-07-21.json`
- `report/report_drawing_intelligence/pckm_v3_final_2026-07-21/DRAWING_INTELLIGENCE_PAGE_SCORECARD_88P_2026-07-21.md`
- `report/report_drawing_intelligence/pckm_v3_final_2026-07-21/DRAWING_INTELLIGENCE_PHASE20_GATE_2026-07-21.json`
- `report/report_drawing_intelligence/pckm_v3_final_2026-07-21/DRAWING_INTELLIGENCE_PHASE20_GATE_2026-07-21.md`
- `report/report_drawing_intelligence/pckm_v3_final_2026-07-21/K2_L2_CORE_ENGINE_CALCULATION_2026-07-21.json`
- `report/report_drawing_intelligence/pckm_v3_final_2026-07-21/PAAX_DRAWING_INTELLIGENCE_PCKM_V3_FINAL_IMPLEMENTATION_REPORT_2026-07-21.md`
- `report/report_drawing_intelligence/pckm_v3_final_2026-07-21/PAAX_DRAWING_INTELLIGENCE_PCKM_V3_LOCAL_TESTING_GUIDE_2026-07-21.md`
- `report/report_drawing_intelligence/pckm_v3_final_2026-07-21/PAAX_PCKM_V3_FINAL_TEST_RESULTS_2026-07-21.json`
- `scripts/verify_drawing_intelligence_phase20.py`
- `scripts/verify_pckm_v3_final_package.py`
- `services/document-intelligence/app/drawing_intelligence/calculation_bridge.py`
- `services/document-intelligence/app/drawing_intelligence/construction_graph_v3.py`
- `services/document-intelligence/app/drawing_intelligence/definition_resolution.py`
- `services/document-intelligence/app/drawing_intelligence/measurement_resolution.py`
- `services/document-intelligence/app/drawing_intelligence/physical_instances.py`
- `services/document-intelligence/app/drawing_intelligence/spatial_resolution.py`
- `services/document-intelligence/tests/test_drawing_intelligence_review_ledger_v2.py`

### File diubah

- `apps/web/src/components/drawing-intelligence/drawing-intelligence-api.ts`
- `apps/web/src/components/drawing-intelligence/workspace/inspector/intelligence-inspector.tsx`
- `apps/web/src/components/drawing-intelligence/workspace/navigator/file-sheet-navigator.tsx`
- `report/report_drawing_intelligence/BENCHMARK_SCORECARD_2026-07-21.md`
- `report/report_drawing_intelligence/COMMAND_ROOM_ARETE_OFFLINE_QA_2026-07-21.json`
- `report/report_drawing_intelligence/COMMAND_ROOM_ARETE_OFFLINE_QA_2026-07-21.md`
- `scripts/run_drawing_intelligence_benchmark.py`
- `scripts/verify_arete_command_room_offline.py`
- `services/core-engine/app/calculation_boundary.py`
- `services/core-engine/tests/test_calculation_boundary.py`
- `services/document-intelligence/app/api/dem_routes.py`
- `services/document-intelligence/app/drawing_intelligence/benchmark.py`
- `services/document-intelligence/app/drawing_intelligence/cross_reference.py`
- `services/document-intelligence/app/drawing_intelligence/human_benchmark.py`
- `services/document-intelligence/app/drawing_intelligence/human_delivery.py`
- `services/document-intelligence/app/drawing_intelligence/models.py`
- `services/document-intelligence/app/drawing_intelligence/pipeline.py`
- `services/document-intelligence/app/drawing_intelligence/review_ledger.py`
- `services/document-intelligence/tests/test_dem_routes.py`
- `services/document-intelligence/tests/test_drawing_intelligence_human_delivery.py`
- `services/document-intelligence/tests/test_drawing_intelligence_kreo_runtime.py`

### File dihapus

- Tidak ada source yang dihapus.

Generated dependency, build output, cache, `.env`, database sementara, dan Graphify index tidak dimasukkan ke ZIP final.

---

## 12. Status fase 1–20

Executable gate melaporkan **20/20 PASS**. Ini berarti seluruh capability baseline yang ditentukan untuk pilot PLHUT tersedia dan lolos kriterianya.

Namun `production_status` tetap `CONDITIONAL` karena:

1. target precision 99% hanya berlaku pada subset auto-confirm yang terkalibrasi;
2. universal validation memerlukan ground truth object-level;
3. perlu minimal satu proyek independen non-PLHUT;
4. Next.js page-data build worker perlu ditutup pada lingkungan deployment;
5. PostgreSQL+pgvector CI nyata perlu dijalankan.

---

## 13. Keputusan akhir

```text
Siap menjadi source utama lanjutan       : YA
Siap digabung ke repository lokal        : YA
Siap diuji end-to-end dengan PLHUT        : YA
Fase implementasi pilot 1–20             : SELESAI / 20-20 PASS
Universal production release             : CONDITIONAL, belum final
```
