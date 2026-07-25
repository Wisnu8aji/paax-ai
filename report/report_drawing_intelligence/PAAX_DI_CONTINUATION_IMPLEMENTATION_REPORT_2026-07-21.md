# PAAX Drawing Intelligence — Continuation Implementation Report

**Tanggal:** 21 Juli 2026  
**Basis:** paket Drawing Intelligence 20 fase sebelumnya  
**Scope:** kematangan data yang diterima user; RAB dan schedule tidak dikerjakan.

## Keputusan arsitektur

Data Drawing Intelligence sekarang dipisah menjadi dua lapisan:

1. **Technical Drawing Object** — DEM, primitive, detection, cross-reference, evidence, dan audit candidate.
2. **User Work Item** — nama teknis Indonesia, penjelasan sederhana, disiplin, lokasi, ukuran tertulis, jumlah label teramati, evidence, blocker, dan tindakan review.

Pemisahan ini mencegah frontend menampilkan JSON mentah sekaligus mempertahankan seluruh informasi teknis untuk audit.

## Perubahan utama

### 1. Human taxonomy dan user delivery
- Menambahkan taxonomy teknik sipil/arsitektur/MEP dalam bahasa Indonesia.
- Menambahkan plain-language description untuk pengguna non-teknis.
- Menghasilkan work item yang sesuai kontrak frontend.
- Menyediakan level label: Lantai 1, Lantai 2, Atap, Fondasi/Substruktur, dan Area Tapak.

### 2. Context-aware quality gate
- Kode tidak diblacklist secara global.
- Kategori diselesaikan menggunakan kode + disiplin + jenis lembar + definisi.
- K-01 tetap sah pada denah kolom, tetapi kemunculannya pada drainase menjadi audit noise.
- LT1, D-01, dan E27 tidak lagi membebani daftar user.
- Dimensi profil kusen 45×100 tidak lagi ditampilkan sebagai ukuran bukaan J1.

### 3. Review queue untuk manusia
- Review task teknis dikelompokkan menjadi batch masalah.
- Frontend menyediakan Terima klasifikasi dan Bukan item.
- Review ledger memakai version check agar state browser lama tidak menimpa keputusan baru.
- Canonical object-storage key dan legacy fallback diperbaiki.
- Accept classification tidak mengesahkan jumlah fisik.

### 4. Project memory
- Positive/negative project prototypes disimpan secara versioned.
- Registry menggunakan canonical storage path dan tetap dapat membaca path lama.
- Rejected candidate dapat dipakai sebagai hard-negative pada pencarian berikutnya.

### 5. Executable release goals
- Ditambahkan `scripts/verify_drawing_intelligence_user_ready.py`.
- Gate memeriksa 18 kontrak user-facing dan gagal dengan exit code non-zero bila tidak terpenuhi.

## Hasil 88 halaman

```text
Package benchmark        : 19/19 PASS
Human benchmark          : 10/10 PASS
User-ready gate          : 18/18 PASS
Item siap tampil         : 64
Perlu klarifikasi        : 5
Noise audit              : 4
Review task              : 76
Review batch             : 6
Average readiness score  : 85
Live AI API call         : 0
Accepted otomatis        : 0
```

## Regression testing

```text
Document Intelligence fast suite : 643 passed, 6 skipped, 2 deselected
PLHUT heavy benchmark tests       : 2 passed
Document Intelligence effective  : 645 passed, 6 skipped
Core Engine                      : 295 passed
Database                         : 156 passed, 1 skipped
Focused user-facing tests        : 30 passed
TypeScript/TSX syntax            : 213 files, 0 syntax errors
```

DB dijalankan per kelompok karena proses monolitik melewati batas eksekusi lingkungan. Seluruh file test tercakup; integration test PostgreSQL dilewati karena server lokal tidak tersedia. Full Vitest, `tsc --noEmit`, dan `pnpm build` belum dapat dijalankan karena `pnpm` tidak tersedia.

## Perubahan file terhadap ZIP basis

```text
File ditambahkan : 20
File diubah      : 17
File dihapus     : 0
```

Tidak ada file lama yang dihapus. Frontend visual tidak didesain ulang; perubahan berfokus pada kontrak data, inspector, dan review actions.

## Files added
- `docs/plans/drawing intelligence/PAAX_DI_CONTINUATION_GOALS_20_PHASES_2026-07-21.md`
- `report/report_drawing_intelligence/DRAWING_INTELLIGENCE_CONTINUATION_GOALS_2026-07-21.json`
- `report/report_drawing_intelligence/DRAWING_INTELLIGENCE_HUMAN_BENCHMARK_88P_2026-07-21.json`
- `report/report_drawing_intelligence/DRAWING_INTELLIGENCE_HUMAN_BENCHMARK_88P_CONTINUED_2026-07-21.json`
- `report/report_drawing_intelligence/DRAWING_INTELLIGENCE_HUMAN_DELIVERY_88P_2026-07-21.json`
- `report/report_drawing_intelligence/DRAWING_INTELLIGENCE_HUMAN_DELIVERY_88P_CONTINUED_2026-07-21.json`
- `report/report_drawing_intelligence/DRAWING_INTELLIGENCE_PACKAGE_ANALYSIS_88P_CONTINUED_2026-07-21.json`
- `report/report_drawing_intelligence/DRAWING_INTELLIGENCE_PACKAGE_BENCHMARK_88P_CONTINUED_2026-07-21.json`
- `report/report_drawing_intelligence/DRAWING_INTELLIGENCE_USER_READY_GATE_88P_2026-07-21.json`
- `report/report_drawing_intelligence/DRAWING_INTELLIGENCE_USER_READY_SCORECARD_88P_2026-07-21.md`
- `report/report_drawing_intelligence/PAAX_DI_CONTINUATION_IMPLEMENTATION_REPORT_2026-07-21.md`
- `scripts/verify_drawing_intelligence_user_ready.py`
- `services/document-intelligence/app/drawing_intelligence/human_benchmark.py`
- `services/document-intelligence/app/drawing_intelligence/human_delivery.py`
- `services/document-intelligence/app/drawing_intelligence/prototype_store.py`
- `services/document-intelligence/app/drawing_intelligence/review_ledger.py`
- `services/document-intelligence/app/drawing_intelligence/taxonomy.py`
- `services/document-intelligence/app/drawing_intelligence/topology.py`
- `services/document-intelligence/tests/test_drawing_intelligence_human_delivery.py`
- `services/document-intelligence/tests/test_drawing_intelligence_topology_memory.py`

## Files changed
- `apps/web/src/components/drawing-intelligence/drawing-intelligence-api.ts`
- `apps/web/src/components/drawing-intelligence/workspace/inspector/intelligence-inspector.tsx`
- `report/report_drawing_intelligence/DRAWING_INTELLIGENCE_BENCHMARK_88P_2026-07-21.json`
- `report/report_drawing_intelligence/DRAWING_INTELLIGENCE_PACKAGE_ANALYSIS_88P_2026-07-21.json`
- `report/report_drawing_intelligence/DRAWING_INTELLIGENCE_PAGE_SCORECARD_88P_2026-07-21.json`
- `report/report_drawing_intelligence/DRAWING_INTELLIGENCE_PAGE_SCORECARD_88P_2026-07-21.md`
- `services/document-intelligence/app/api/dem_routes.py`
- `services/document-intelligence/app/api/intelligence_routes.py`
- `services/document-intelligence/app/drawing_intelligence/cross_reference.py`
- `services/document-intelligence/app/drawing_intelligence/ingestion.py`
- `services/document-intelligence/app/drawing_intelligence/models.py`
- `services/document-intelligence/app/drawing_intelligence/page_profiler.py`
- `services/document-intelligence/app/drawing_intelligence/pipeline.py`
- `services/document-intelligence/app/drawing_intelligence/sheet_identity.py`
- `services/document-intelligence/app/drawing_intelligence/vocabulary.py`
- `services/document-intelligence/tests/test_dem_routes.py`
- `services/document-intelligence/tests/test_drawing_intelligence_routes.py`

## Batasan yang masih terbuka

1. Belum ada ground truth object-level manual untuk semua objek pada 88 halaman.
2. Belum ada benchmark proyek kedua yang berbeda dari PLHUT.
3. Raster OCR/layout masih baseline dan membutuhkan corpus scan teknik.
4. DWG/DXF memerlukan converter produksi yang benar-benar dikonfigurasi.
5. Multi-reviewer database locking belum menggantikan artifact-ledger baseline.
6. Full Node test/typecheck/build belum dijalankan pada lingkungan ini.
7. PostgreSQL/pgvector migration nyata tetap harus dijalankan melalui CI atau environment dengan service tersebut.

## Verdict

```text
Siap dipindahkan ke lokal                : YA
Siap untuk pilot review PLHUT            : YA
Data utama langsung dipahami user        : YA
Data mentah tetap tersedia untuk audit   : YA
Kuantitas fisik diterima otomatis        : TIDAK
Universal production-ready               : BELUM
```
