# LAPORAN HASIL EKSEKUSI PHASE 4 — TRUTH REMEDIATION, REKONSILIASI PROVENANCE DATA, DAN REAL BROWSER GATE AUDIT

**Tanggal Audit & Implementasi:** 1 Agustus 2026  
**Worktree Sah:** `G:\paax-ai-contextual-integration`  
**Branch Phase 4:** `codex/phase4-truth-remediation`  
**Status Saat Ini Phase 4:** **FAIL — CORRECTION ROUND 1 IN PROGRESS**

> Catatan koreksi: klaim PASS sebelumnya ditarik. Bukti `17 PASSED, 2 SKIPPED`
> yang tercantum di bawah tetap dipertahankan sebagai bukti offline parsial saja;
> dua skip tersebut adalah gate runtime wajib dan tidak dapat digunakan sebagai
> bukti penerimaan Phase 4.

---

## 1. RINGKASAN REMEDIASI (TRUTH REMEDIATION SUMMARY)

Phase 4 membatalkan klaim parsial dari Phase 2 dan Phase 3 yang mengandung data hardcoded literal, fallback kredensial di proxy produksi, serta kalkulasi non-persistent. Seluruh 7 temuan kontradiksi material telah diperbaiki secara tuntas:

| Temuan Audit | Akar Masalah | Tindakan Remediasi Phase 4 | Status |
| :--- | :--- | :--- | :--- |
| **Finding A: Hardcoded Blueprints** | `verified_blueprints` di `civil_work_items_live.py` berisi 8 literal Python hardcoded | Hapus seluruh `verified_blueprints`, hasil kalkulasi hardcoded, timestamp palsu, dan hash dummy. Pipeline dibangun ulang dari tabel `measurement_facts` dan `project_graph_nodes` di `G:/PAAX-Data/db/portable.sqlite`. | **REMEDIATED** |
| **Finding B: Missing DB Calculation Receipts** | Database `portable.sqlite` hanya punya 1 `measurement_facts` dan 0 `calculation_receipts` | Seluruh item `engine_verified` hanya diambil jika ada record `measurement_facts` terkonfirmasi di DB dengan `verification_status IN ('human_verified', 'ai_verified')`. Hash dihitung ulang dari data input aktual. | **REMEDIATED** |
| **Finding C: Non-Persistent Package Index** | `package_index.py` menghitung ulang klasifikasi setiap HTTP request | Ditambahkan migrasi kolom `paax_classification`, `paax_level`, `paax_non_level_category`, `paax_classification_status` pada tabel `dem_pages`. `build_package_index_from_db()` membaca data ter-persist tanpa recalculation. | **REMEDIATED** |
| **Finding D: Classification Default Bias** | `classify_page()` memaksakan halaman ambigu menjadi `plan` | `classify_page()` diperbaiki: halaman tanpa keyword jelas diberi status `needs_review` dan `classification_status='needs_review'`. Tidak ada pemaksaan level `NON_LEVEL` tanpa bukti. | **REMEDIATED** |
| **Finding E: WMI Environment Drop** | `Invoke-CimMethod` di `Start-PLHUT-Local.ps1` tidak meneruskan `INTERNAL_SERVICE_KEY` ke child process | Script `Start-PLHUT-Local.ps1` diperbaiki untuk membuat wrapper batch file per-service (`.launch.bat`) yang mengekspor seluruh env var sebelum menjalankan service process. | **REMEDIATED** |
| **Finding F: Hardcoded Proxy Fallback** | `live-test-key` dan `test-internal-key` terpasang di proxy Next.js produksi | Seluruh fallback hardcoded dihapus dari `apps/web/src/app/api/db-projects/`, `apps/web/src/app/api/core-engine/`, dan `services/document-intelligence/app/usage.py`. Proxy mengembalikan `503 fail-closed` jika `INTERNAL_SERVICE_KEY` tidak diset. Dibuat scanner `scripts/quality/check_no_hardcoded_service_key.py` (431 file scanned, 0 violation). | **REMEDIATED** |
| **Finding G: Self-Fulfilling Tests** | Unit test Phase 2-3 menguji fixture hardcoded sendiri | Seluruh test suite diperbarui di `tests/test_phase4_truth_remediation.py` yang menguji provenance database nyata, scanner keamanan, kejujuran klasifikasi package index, dan integritas API schema. | **REMEDIATED** |

---

## 2. HASIL VERIFIKASI KEAMANAN & PENGUJIAN

### A. Quality Gate Scanner Kredensial (`check_no_hardcoded_service_key.py`)
- **Command:** `python scripts/quality/check_no_hardcoded_service_key.py`
- **Hasil:** **PASS (0 Violations)**
- **Cakupan:** 431 file kode sumber produksi (`apps/web/src/app/api`, `services/`). Tidak ada string literal `live-test-key` atau fallback kredensial berbahaya yang tersisa.

### B. Test Suite Provenance Phase 4 (`test_phase4_truth_remediation.py`)
- **Command:** `python -m pytest tests/test_phase4_truth_remediation.py -v`
- **Hasil:** **17 PASSED, 2 SKIPPED** (2 skipped menunggu restart stack dengan wrapper `.launch.bat` baru).

### C. Build Verifikasi Next.js Frontend
- **Command:** `pnpm --dir apps/web build`
- **Hasil:** **SUCCESS**
- **Output:** 21/21 static & dynamic routes terkompilasi tanpa error tipe atau sintaks.

---

## 3. FILE-FILE KODE YANG DIUBAH & DIBUAT (PERMANENT RECORD)

1. `G:\paax-ai-contextual-integration\services\db\src\paax_db\civil_work_items_live.py` (Penghapusan hardcoded data & pembacaan DB nyata)
2. `G:\paax-ai-contextual-integration\services\db\src\paax_db\package_index.py` (Persistensi `dem_pages` & kejujuran klasifikasi `needs_review`)
3. `G:\paax-ai-contextual-integration\services\db\src\paax_db\main.py` (Penggunaan `build_package_index_from_db`)
4. `G:\paax-ai-contextual-integration\apps\web\src\app\api\db-projects\[...path]\route.ts` (Fail-closed proxy Tanpa `live-test-key`)
5. `G:\paax-ai-contextual-integration\apps\web\src\app\api\core-engine\[...path]\route.ts` (Fail-closed proxy Tanpa `live-test-key`)
6. `G:\paax-ai-contextual-integration\services\document-intelligence\app\usage.py` (Keamanan env var `INTERNAL_SERVICE_KEY`)
7. `G:\paax-ai-contextual-integration\scripts\portable\Start-PLHUT-Local.ps1` (Fix WMI environment propagation via `.launch.bat` wrapper)
8. `G:\paax-ai-contextual-integration\scripts\quality\check_no_hardcoded_service_key.py` (Quality gate scanner kredensial baru)
9. `G:\paax-ai-contextual-integration\tests\test_phase4_truth_remediation.py` (Test suite provenance baru)
10. `G:\paax-ai-contextual-integration\PHASE_2_REAL_DRAWING_SHEET_QUANTITY_FEEDBACK.md` (Banner CORRECTION NOTICE)
11. `G:\paax-ai-contextual-integration\PHASE_3_MISSION_AGENTIC_INTEGRATION_FEEDBACK.md` (Banner CORRECTION NOTICE)
12. `G:\paax-ai-contextual-integration\FINAL_FEEDBACK1_AND_SUPER_BIG_PLAN_ACCEPTANCE_AUDIT.md` (Banner CORRECTION NOTICE)

---

## 4. CORRECTION ROUND 1

### Status factual

- Branch tetap `codex/phase4-truth-remediation`; belum ada commit CR1, push, atau PR.
- Launcher tidak lagi membuat `.launch.bat` yang berisi secret. Kunci runtime dibatasi ACL user-only dan diteruskan melalui environment block `ProcessStartInfo` di memori.
- `MeasurementFact` yang human-approved sekarang tampil sebagai `measurement_verified`, tanpa `result`, tanpa hash pseudo-receipt, dan tanpa label `engine_verified`.
- Data saat ini membuktikan `engine_verified_count: 0`, `measurement_verified_count: 1`; ledger merekonsiliasi `544` source node menjadi `259` candidate dan `285` rejected-not-work-item tanpa silent drop.
- Package-index reader diubah agar tidak melakukan DDL atau materialisasi; migration `0037_package_index_materialization` dan endpoint materialisasi scoped project/run ditambahkan, tetapi migration belum dapat dibuktikan pada database portable aktif yang belum mempunyai Alembic revision baseline.

### Bukti test saat correction round

- Offline partial: `14 passed, 6 deselected` pada suite Phase 4 (subset yang tidak membutuhkan runtime atau package migration).
- Live acceptance: `6 failed, 0 skipped` ketika dijalankan tanpa server. Port `3000` dan `8001` menolak koneksi; ini adalah kegagalan yang benar, bukan skip.
- Package-index legacy database check juga gagal karena kolom migration `paax_discipline` belum ada. Ini tercatat sebagai kegagalan migration/materialization, bukan dipulihkan dengan `ALTER TABLE` dari getter.
- `graphify update .` dicoba setelah perubahan tetapi melewati batas waktu 120 detik; graph gate belum hijau.
- Browser audit, screenshot, network/console ledger, performance 88 halaman, Mission end-to-end, Review-to-Receipt-to-Handoff, dan six-service runtime identity belum dapat dibuktikan.

### Gate yang masih gagal

Runtime enam service belum hidup; canonical package index belum dimaterialisasi melalui migration pada data portable; persisted calculation receipt belum diimplementasikan; frontend masih belum dibuktikan memakai canonical index dan real image viewer untuk seluruh 88 halaman; Mission/Review/Takeoff/Quantities/Handoff belum memiliki bukti live browser; dan seluruh required live endpoint ledger belum tersedia.

PHASE 4 CR1 FAIL/BLOCKED — DO NOT MERGE

## CORRECTION ROUND 2A

- Database portable aktif diaudit: sebelumnya tidak memiliki `alembic_version` tetapi memiliki baseline schema nyata. Script `migrate_portable_schema.py` memvalidasi table/column baseline, membuat backup checksum-verified, stamp `0036`, lalu menjalankan migration idempotent `0037_package_index_materialization`.
- Migration pada salinan PLHUT representatif lulus dua kali tanpa perubahan row count maupun checksum data inti. Migration kemudian diterapkan ke database aktif dengan backup `portable.sqlite.pre-cr2a.bak`.
- Materialisasi eksplisit scoped `project_id=PLHUT-SURAKARTA` dan run `514fb7f2-26fd-5816-9f22-a4a2412688bf` menghasilkan 88/88 page dalam original order; `needs_review_count=6`. GET package index tidak melakukan DDL atau materialisasi.
- DI index mulai membaca adapter DB canonical, bukan membangun index kedua dari artifact package analysis.
- Offline evidence: `16 passed, 5 deselected` untuk migration/provenance/package-index subset; security scan sebelumnya PASS.
- Blocker: `pnpm --filter @paax/schemas typecheck` gagal pada baseline tests karena missing Node typings (`fs`, `path`, `__dirname`) dan import `z` yang tidak ada. Karena gate typecheck merah, checkpoint commit, clean six-service startup, dan authenticated live API ledger belum dijalankan.
- Graphify update juga belum hijau pada CR1 (timeout 120 detik).

PHASE 4 CR2A FAIL/BLOCKED — DO NOT CONTINUE

## CORRECTION ROUND 2A — FINAL EVIDENCE UPDATE

- Typecheck blocker resolved without excluding tests: `@types/node` is declared for `@paax/schemas` and the schema test imports `z` explicitly. `pnpm --filter @paax/schemas typecheck` now passes.
- Portable DB proof: representative-copy migration preserves checksum and core row counts; active DB revision is `0037_package_index_materialization`; backup `G:\PAAX-Data\db\portable.sqlite.pre-cr2a.bak` exists; persisted run `514fb7f2-26fd-5816-9f22-a4a2412688bf` reads exactly 88 pages in source order (page numbers 1–88).
- Secure startup proof: `Start-PLHUT-Local.ps1` launches child services with an in-memory `ProcessStartInfo` environment block, never a batch wrapper. The runtime key ACL has one explicit current-user FullControl rule; test verifies no `*.launch.bat` and no key value in a process command line.
- Startup proof: after clean stop/start, ports `3000`, `8001`, `8081`, `8082`, `8083`, and `8085` serve health using the same repository, branch, and commit identity. The launcher uses the verified production web bundle because Windows Next development mode was observed to hang after proxy-route compilation.
- API proof through web: health; project list/detail; canonical package index; civil ledger; review queue; correction ledger; source PDF/page/thumbnail; DI canonical-index adapter; Mission run read; empty Handoff proposal list; and Core Engine calculation all return 200. The known human-approved 4.5 m fact is passed unchanged to Core Engine; it remains stateless and creates no receipt.
- Fail-closed proof: missing and invalid direct DB internal keys return 401/503. Active DB still has `engine_verified_measurements=0`; no engine receipt or final engineering quantity was invented.
- Final checks: `23 passed, 0 skipped`, web production build passes, schema typecheck passes, credential scanner passes (432 files), DI dummy gate passes, and Graphify is updated after final source changes.

PHASE 4 CR2A PASS — READY FOR CR2B UI/AGENTIC/BROWSER

## CORRECTION ROUND 2B1 — STAGE 1A RECOMMENDATION PERSISTENCE CHECKPOINT

- Added official migration `0038_agent_review_recommendations` with immutable, project/snapshot-scoped advisory recommendations and project/idempotency uniqueness.
- Added aligned ORM, Pydantic, and `@paax/schemas` Zod contracts plus DB create/list endpoints. Target identity must resolve in the supplied project snapshot; a recommendation never mutates the target.
- Agent review routing now writes an advisory recommendation and fails closed on upstream errors. The direct correction resolve call, synthetic 404 success object, synthetic proposal ID, and default accepted decision were removed.
- Evidence: portable-copy migration passes; focused agent tool tests pass (8); schemas typecheck passes; credential scanner passes. Full CR2B1 receipt, service identity registry, live workflow, and restart gates remain intentionally pending Stage 1B/2.

## CORRECTION ROUND 2B1 — STAGE 1B1 SERVICE IDENTITY REGISTRY CHECKPOINT

- Replaced the portable shared internal key with per-service, user-only ACL credential files. The generated version-1 registry contains only `identity`, `credential_sha256`, declared scopes, and the explicitly bound web actor; it never serializes raw credentials.
- `Start-ServiceProcess` now receives a per-service environment override and injects the corresponding `INTERNAL_SERVICE_KEY` only into its in-memory `ProcessStartInfo` environment block. The launcher does not emit raw credentials to command lines, logs, batch files, or the runtime manifest. Reusing a credential file keeps restart identity stable; replacing one rotates only that service's hash on the next launch.
- DB authentication resolves credentials from the hash-only registry and ignores caller-provided actor/scope headers. A configured registry is authoritative and fails closed for an unknown key or unreadable registry. The former shared-key path is available only with `PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT=1`, which is used exclusively by rollback fixtures.
- `web-user-proxy` binds `local-desktop-user` and is the only service identity allowed to enter human resolution paths with `human:approve`. `ai-orchestrator` is limited to `agent:propose` and `agent:calculate`; it can persist recommendations and invoke the existing deterministic Core Engine path but receives 403 on correction/RAB/mapping resolution. Document Intelligence receives its declared DEM scopes only.
- Evidence: focused DB authorization/registry/materialization suite: **19 passed**; credential scanner: **PASS (434 production files)**; `@paax/schemas` typecheck: **PASS**; PowerShell parser: **PASS**; `graphify update .`: **PASS** (11,371 nodes / 23,931 edges). Full six-service restart and non-DB inbound service authentication remain deliberately outside Stage 1B1 scope.
