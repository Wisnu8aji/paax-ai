# 🎯 PAAX AI — Drawing Intelligence Phase 2 Completion Report

> **Laporan Resmi Rekonsiliasi Model Bukti dan Ketertelusuran Spasial (Fase 2)**  
> **Status:** SELESAI (Completed)  
> **Target Branch:** `feat/drawing-intelligence-truth-rebuild`  
> **Tanggal:** 19 Juli 2026

---

## 1. Pendahuluan
Laporan ini disusun untuk mendokumentasikan penyelesaian **Fase 2: Evidence Truth Layer** dari cetak biru rekonstruksi Drawing Intelligence PAAX AI. Tujuan utama dari fase ini adalah menjamin seluruh fakta yang disajikan kepada Command Room dan UI dapat ditelusuri ke bukti gambar asli secara deterministik, tanpa menggunakan placeholder, data tiruan, atau melakukan perhitungan kuantitas/RAB di tingkat model bahasa (LLM) sesuai dengan Aturan Emas repositori.

Seluruh tugas Fase 2 telah diselesaikan secara tuntas dan diverifikasi melalui rangkaian commit mandiri serta pengujian unit pada repositori `feat/drawing-intelligence-truth-rebuild`.

---

## 2. Status Work Package Fase 2

Berikut adalah status detil dari lima unit kerja utama di bawah Fase 2:

### 2.1 Evidence Model v2 (Selesai)
* **Deskripsi:** Mengimplementasikan schema data evidence versi 2 pada model SQLAlchemy `ProjectGraphEvidence` di backend database.
* **Realisasi:** Menambahkan field-field terperinci untuk metadata ekstraksi spasial dan model persepsi: `revision_id`, `run_id`, `dem_page_id`, `view_id`, `zone_id`, `modality`, `raw_content`, `normalized_content`, `bbox_source`, `bbox_normalized`, `polygon_source`, `polygon_normalized`, `confidence`, `extractor`, dan `artifact_hash`.
* **Berkas Berubah:** 
  - [services/db/src/paax_db/models.py](file:///G:/paax-ai-main/services/db/src/paax_db/models.py)
  - [services/db/src/paax_db/project_graph_repository.py](file:///G:/paax-ai-main/services/db/src/paax_db/project_graph_repository.py)

### 2.2 Evidence Immutability (Selesai)
* **Deskripsi:** Menjamin bahwa record evidence bersifat *read-only* (immutable) setelah ditulis untuk mencegah modifikasi pasca-sintesis. Koreksi harus diwujudkan sebagai overlay / new snapshot.
* **Realisasi:** Menambahkan listener event SQLAlchemy `before_update` pada class `ProjectGraphEvidence` yang melempar pengecualian `ValueError` jika ada percobaan memodifikasi record evidence yang sudah ada di database.
* **Berkas Berubah:** 
  - [services/db/src/paax_db/models.py](file:///G:/paax-ai-main/services/db/src/paax_db/models.py)
  - [services/db/tests/test_project_graph_persistence.py](file:///G:/paax-ai-main/services/db/tests/test_project_graph_persistence.py) (menambahkan test case `test_project_graph_evidence_immutability`)

### 2.3 Rewrite Synthesis Persistence (Selesai)
* **Deskripsi:** Menulis ulang kode persistence tugas sintesis agar mengambil bukti asli dari DEM page result secara utuh, bukan placeholder.
* **Realisasi:** Menyimpan data evidence lengkap, memetakan level dan edge, serta mengeluarkan content-hash manifest yang unik.
* **Berkas Berubah:** 
  - Ditangani pada commit awal Fase 2 (`e1a3ed8`).

### 2.4 Evidence Foreign Keys (Selesai)
* **Deskripsi:** Memastikan integritas referensi antar snapshot, node, edge, dan evidence melalui constraints database relasional yang kuat.
* **Realisasi:** Migration `0015` mendefinisikan composite foreign key constraints (`fk_project_graph_evidence_snapshot_project`, `fk_node_evidence_node`, `fk_node_evidence_evidence`, `fk_edge_evidence_edge`, `fk_edge_evidence_evidence`) serta unique constraint `uq_project_graph_snapshots_id_project` untuk mencegah dangling references dan konflik evidence ID dalam snapshot yang sama.
* **Berkas Berubah:**
  - [services/db/alembic/versions/0015_evidence_model_v2.py](file:///G:/paax-ai-main/services/db/alembic/versions/0015_evidence_model_v2.py) (ditangani pada commit awal `9a1dd75`).

### 2.5 Evidence Citation Package (Selesai)
* **Deskripsi:** Memastikan tool `query_project_graph` di AI Orchestrator mengembalikan data sitasi yang kaya ke Command Room dan UI (termasuk bbox, raw_excerpt, status, source_modality) dengan tetap menjaga kompatibilitas ke belakang (backward compatibility).
* **Realisasi:** Mengubah mapper keluaran evidence pada executor tool `query_project_graph` dan menyesuaikan test unit vitest dengan struktur payload kaya yang baru.
* **Berkas Berubah:**
  - [services/ai-orchestrator/src/tools/query_project_graph.ts](file:///G:/paax-ai-main/services/ai-orchestrator/src/tools/query_project_graph.ts)
  - [services/ai-orchestrator/tests/tools/query_project_graph.test.ts](file:///G:/paax-ai-main/services/ai-orchestrator/tests/tools/query_project_graph.test.ts)

---

## 3. Bukti Pengujian Nyata (Test Verification)

Seluruh verifikasi unit kerja Fase 2 telah berhasil dijalankan secara lokal dengan hasil sukses 100%:

### 3.1 Verifikasi Uji DB Persistence & Immutability (`services/db`)
Jalur pengujian immutability database diverifikasi sukses menggunakan runner pytest:
```
platform win32 -- Python 3.13.13, pytest-9.1.1, pluggy-1.6.0
collected 6 items

tests/test_project_graph_persistence.py::test_project_graph_storage_migration_declares_all_immutable_snapshot_tables PASSED
tests/test_project_graph_persistence.py::test_activate_snapshot_supersedes_only_the_project_current_snapshot PASSED
tests/test_project_graph_persistence.py::test_persist_snapshot_graph_keeps_node_edge_alias_and_evidence_scoped_to_snapshot PASSED
tests/test_project_graph_persistence.py::test_build_and_activate_snapshot_writes_graph_before_it_becomes_current PASSED
tests/test_project_graph_persistence.py::test_project_graph_snapshot_api_is_project_scoped_and_returns_only_active_snapshot PASSED
tests/test_project_graph_persistence.py::test_project_graph_evidence_immutability PASSED

======================== 6 passed, 2 warnings in 2.44s ========================
```
Total keseluruhan unit test database (`pytest` global) juga sukses 100% (88 passed, 1 skipped dalam 36.15s).

### 3.2 Verifikasi Uji Orchestrator Citation (`services/ai-orchestrator`)
Unit test vitest untuk tool `query_project_graph` yang diperkaya berhasil diselesaikan:
```
 RUN  v4.1.9 G:/paax-ai-main/services/ai-orchestrator

 Test Files  1 passed (1)
      Tests  18 passed (18)
   Start at  05:00:28
   Duration  988ms
```
Total pengujian vitest global juga sukses 100% (50 passed dari 10 files dalam 3.25s).

### 3.3 Verifikasi Uji End-to-End / Roundtrip DEM $\rightarrow$ PCKM (`services/document-intelligence`)
Unit test `test_synthesis_task.py` berhasil memverifikasi roundtrip penyimpanan evidence kaya dari output parser halaman DEM ke PCKM database payload:
```
platform win32 -- Python 3.13.13, pytest-9.1.1, pluggy-1.6.0
collected 1 item

tests/test_synthesis_task.py::test_synthesize_and_post_snapshot_task_success PASSED

============================== 1 passed in 1.03s ==============================
```

---

## 4. Daftar File yang Diubah
Rincian file yang diubah sepanjang pengerjaan Fase 2:
1. [services/db/src/paax_db/models.py](file:///G:/paax-ai-main/services/db/src/paax_db/models.py)
2. [services/db/src/paax_db/project_graph_repository.py](file:///G:/paax-ai-main/services/db/src/paax_db/project_graph_repository.py)
3. [services/db/tests/test_project_graph_persistence.py](file:///G:/paax-ai-main/services/db/tests/test_project_graph_persistence.py)
4. [services/ai-orchestrator/src/tools/query_project_graph.ts](file:///G:/paax-ai-main/services/ai-orchestrator/src/tools/query_project_graph.ts)
5. [services/ai-orchestrator/tests/tools/query_project_graph.test.ts](file:///G:/paax-ai-main/services/ai-orchestrator/tests/tools/query_project_graph.test.ts)
6. [services/db/alembic/versions/0015_evidence_model_v2.py](file:///G:/paax-ai-main/services/db/alembic/versions/0015_evidence_model_v2.py)
7. [services/document-intelligence/app/project_graph/synthesis_task.py](file:///G:/paax-ai-main/services/document-intelligence/app/project_graph/synthesis_task.py)

---

## 5. Daftar Commit Fase 2
Berikut adalah daftar commit berurutan dari akhir Fase 1 (`8159359`) hingga HEAD:

1. `9a1dd75` Update project graph evidence schema to version 2 and add composite foreign key constraints
2. `e1a3ed8` Rewrite synthesis task persistence to extract complete evidence data, map levels and edges, and output content-hash manifest
3. `cb1b170` Implement project graph evidence immutability guard and persist schema version 2 fields
4. `c247bc9` Update query_project_graph tool and tests to support evidence citation package version 2

---

## 6. Kesimpulan

**FASE 2 (Evidence Truth Layer) dinyatakan SELESAI.**

Seluruh bukti spasial dan koordinat dari transkrip gambar kerja telah terhubung ke model PCKM v2 di tingkat database relasional, dilindungi oleh mekanisme immutability, dan disajikan secara lengkap ke Command Room AI Orchestrator. Repositori kini siap untuk melangkah ke **Fase 3: Canonical Coordinate System** untuk penyatuan sistem koordinat piksel-ke-milimeter.
