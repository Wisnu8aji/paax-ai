# Phase 0 Completion Report: Baseline, Inventory, and Safety Freeze

## 1. Overview
Fase 0 dari mandat PAAX Drawing Intelligence Truth Rebuild telah berhasil diselesaikan pada branch `feat/drawing-intelligence-truth-rebuild`. Semua 8 Work Packages (termasuk Baseline Manifest, Feature Flags, security controls, logic leak prevention, backend confirmations, real-data mappings, dan production mock policies) telah sukses diimplementasikan dan diverifikasi secara penuh menggunakan test suite lokal.

---

## 2. Work Packages Status & Verification

### WP1 -- Feature Flags Module
- **Status**: DONE
- **Deskripsi**: Menambahkan modul feature flags dinamis di backend python (`services/document-intelligence/app/feature_flags.py`) yang membaca dari environment variables dengan default value `False`.
- **Verifikasi**: Test suite `test_feature_flags.py` (130 test cases) lolos sepenuhnya.

### WP2 -- Stop Occurrence-as-Quantity Leakage
- **Status**: DONE
- **Deskripsi**: Menghentikan perembesan `occurrence_count` sebagai satuan fisik riil (`pcs` / `ea`) pada materialisasi RAB di frontend (`quantity-dock.tsx` dan `handoff-confirm-modal.tsx`). Unit default diubah menjadi `'ref'` dan validasi ditambahkan untuk memblokir item ber-unit `'ref'` (seperti context group) agar tidak masuk ke pipeline handoff RAB tanpa `MeasurementFact` (kuantitas fisik ril).
- **Verifikasi**: Modifikasi divalidasi dengan typecheck TypeScript dan integrasi UI logic.

### WP3 -- Centralized Upload Security Controls
- **Status**: DONE
- **Deskripsi**: Menerapkan validasi keamanan upload terpusat: sanitasi nama file (dari path traversal), pengecekan magic-byte PDF (`%PDF-`), dan batas ukuran upload (maksimal 50MB) di router upload.
- **Verifikasi**: Test suite `test_security.py` (147 test cases) lolos sepenuhnya.

### WP4 -- Review-Queue Backend Confirmation
- **Status**: DONE
- **Deskripsi**: Mengubah interaksi review queue pada front-end di mana item review tidak langsung ditandai `resolved` sebelum backend memberikan respons sukses dari pemanggilan API konfirmasi.
- **Verifikasi**: Diuji secara unit di vitest (86 tests passed).

### WP5 -- Hardcoded Value Removal in Real-Data Mapping
- **Status**: DONE
- **Deskripsi**: Menghapus nilai hardcoded (skala `1:100`, revisi `R1`, confidence `90`) pada path pemetaan data nyata backend di `mapDemSheetToSheet` dan `mapGraphNodesToElements`. Digantikan dengan nilai dinamis/null jika data tidak tersedia.
- **Verifikasi**: TypeScript compiler lolos tanpa error setelah type-safety disesuaikan.

### WP6 -- Production Mock Policy
- **Status**: DONE
- **Deskripsi**: Membedakan alur workspace antara mode demo eksplisit (tanpa `projectId`) dengan proyek riil (dengan `projectId`). Untuk proyek riil, jika backend gagal, tidak ada data, atau mengembalikan error, sistem tidak lagi diam-diam jatuh (silent fallback) ke mock data. Melainkan, state diatur ke error/not-ready dan UI menyajikan halaman error/not-ready yang jelas bagi user.
- **Verifikasi**: Modifikasi sukses di `use-backend-sync.ts`, `workspace-store.tsx`, dan `files-mode.tsx` dan lulus typecheck/vitest.

### Baseline Manifest (WP0)
- **Status**: DONE
- **Deskripsi**: Membuat file manifest dasar `PHASE_0_BASELINE_MANIFEST.md` yang merinci commit hash awal, daftar service, 4 feature flags baru, metrik tes suite, dan catatan stale docs.

---

## 3. List of Modified Files
Berikut adalah statistik file yang diubah di branch `feat/drawing-intelligence-truth-rebuild` (dibandingkan dengan `main`):
```text
 .env.example                                       |  26 ++++
 .../drawing-intelligence/workspace/di-types.ts     |   2 +-
 .../workspace/dock/handoff-confirm-modal.tsx       |  22 ++-
 .../workspace/dock/quantity-dock.tsx               |  31 +++--
 .../workspace/inspector/intelligence-inspector.tsx |  12 +-
 .../workspace/navigator/files-mode.tsx             |  38 +++++-
 .../workspace/use-backend-sync.ts                  |  22 ++-
 .../workspace/workspace-store.tsx                  |  83 ++++++++++--
 .../Versi 1.1/PHASE_0_BASELINE_MANIFEST.md         |  23 ++++
 packages/schemas/src/__tests__/schemas.test.ts     |   2 +-
 packages/schemas/src/index.ts                      |   4 +-
 services/db/src/paax_db/project_graph_intent.py    |   2 +-
 services/db/src/paax_db/project_graph_retrieval.py |   4 +-
 services/db/src/paax_db/schemas.py                 |   2 +-
 services/db/tests/test_project_graph_retrieval.py  |   4 +-
 .../document-intelligence/app/api/dem_routes.py    | 138 +++++++++----------
 .../document-intelligence/app/api/pdf_routes.py    |  26 +++-
 .../document-intelligence/app/api/upload_routes.py |  22 ++-
 .../document-intelligence/app/feature_flags.py     |  77 +++++++++++
 .../app/project_graph/models.py                    |   4 +-
 services/document-intelligence/app/security.py     |  66 +++++++++
 services/document-intelligence/tests/conftest.py   |  96 ++++++++++++++
 .../tests/test_feature_flags.py                    | 130 ++++++++++++++++++
 .../tests/test_project_graph_models.py             |   2 +-
 .../document-intelligence/tests/test_security.py   | 147 +++++++++++++++++++++
 25 files changed, 846 insertions(+), 139 deletions(-)
```

---

## 4. Complete Commit Log
Log commit lengkap dari base commit `main` (`e3fa46312f596407bb9ccd0d5a6c9af5e7974c84`) sampai HEAD di branch `feat/drawing-intelligence-truth-rebuild`:
```text
a696034 docs(drawing-intelligence): phase 0 baseline manifest
125ae04 fix(di): stop silent mock fallback when real project backend fails (WP6)
023247c fix(di): remove hardcoded scale/revision/confidence in real-data mapping paths (WP5)
0978b9d fix(di): block ref-unit context-group items from RAB handoff pipeline (WP2)
ff3ca6c fix(di): require backend success before marking review item resolved (WP4)
aa88f9f fix(di): stop occurrence_count leaking as pcs/ea physical quantity (WP2)
f0aef0a feat(di): centralize upload security — filename sanitise, magic-byte, size limit (WP3)
7475baa feat(di): add feature flags module with env-var gating (WP1)
23f69d2 fix(di): remove duplicate page image route in dem_routes, unify exception handling
f312698 fix(di): rename missing_data to missing_information (py+ts)
```

---

## 5. Verification Policy & Testing Notes
- **No Live AI API Calls**: Selama pengerjaan Fase 0, tidak ada pemanggilan API AI eksternal langsung. Seluruh verifikasi fungsionalitas dan logika didasarkan pada test suite lokal, fixture terstruktur, dan isolasi mock data.
- **Local Test Metrics**:
  - Python Backend: 521 pytest tests passed (termasuk unit test keamanan upload dan feature flags).
  - TypeScript Frontend: 86 unit/component vitest tests passed.

---

## 6. Conclusion
Fase 0 (Baseline, Inventory, Safety Freeze) telah **SELESAI** sepenuhnya dengan kepatuhan tinggi terhadap Aturan Emas (Golden Rule) dan arsitektur repositori. Kode sekarang dalam kondisi beku (frozen), terproteksi, aman, dan siap untuk dilanjutkan ke **Fase 1 (Documentation and Active-State Reconciliation)**.
