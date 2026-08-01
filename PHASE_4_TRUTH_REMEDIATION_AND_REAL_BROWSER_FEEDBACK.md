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
