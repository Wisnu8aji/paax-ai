# INSTRUKSI TERRA — PHASE 4 CR2A
## Portable Migration, Secure Six-Service Startup, dan Authenticated API Gate

Lanjutkan pekerjaan yang sama di `G:\paax-ai-contextual-integration`, branch `codex/phase4-truth-remediation`. Pertahankan seluruh perubahan dirty. Jangan reset/clean/rebase/amend atau membuang pekerjaan.

Kerjakan hanya fondasi CR2A berikut. Jangan mengerjakan browser/UI final sebelum fondasi ini hijau.

## 1. Selesaikan migration database portable secara non-destruktif

- Audit mekanisme schema/bootstrap portable existing dan status `alembic_version` database aktif.
- Jangan menjalankan migration aktif sebelum menguji salinan database yang representatif.
- Tentukan baseline resmi untuk database portable lama tanpa menganggap seluruh revision sudah diterapkan.
- Migration `0037_package_index_materialization` harus dapat dijalankan idempotent dari database PLHUT saat ini dan database baru.
- Jangan melakukan DDL dari getter/request handler.
- Update harus scoped oleh `project_id` dan `run_id` eksplisit.
- Pertahankan 88 `dem_pages`, project graph, evidence, measurement facts, mapping, dan workspace state.
- Tambahkan downgrade/rollback safety yang proporsional dan backup instruction pada panduan.
- Selaraskan model ORM, Pydantic, dan Zod/TypeScript contract dalam perubahan yang sama.
- Jalankan migration test pada temporary copy dan verifikasi row counts/checksum sebelum-sesudah.

## 2. Materialisasikan canonical package index

- Jalankan explicit materialization setelah migration, bukan ketika GET.
- Persist discipline, level, classification, status, confidence, evidence/source, rule version, dan review state.
- Correction/approval manusia tidak boleh ditimpa materialization ulang.
- Satu run PLHUT harus menghasilkan 88/88 entries dalam original order.
- Document-intelligence endpoint `/drawings/dem/{run_id}/index`, DB project endpoint, dan frontend contract harus menunjuk satu data canonical yang sama; tidak boleh ada dua index berbeda.
- Unknown/needs-review dilaporkan jujur.
- Tambahkan parity/integration tests yang membandingkan kedua boundary bila adapter sementara masih diperlukan.

## 3. Selesaikan launcher secure tanpa plaintext secret

- Gunakan `ProcessStartInfo`/supervisor dengan environment block in-memory.
- Secret tidak boleh muncul pada command line, `.bat/.cmd/.ps1` generated file, manifest, log, atau health response.
- Terapkan ACL user-only pada key file dan verifikasi secara test.
- Pastikan process benar-benar detached/stabil, working directory dan log per-service benar, PID ownership tervalidasi, dan stop script aman.
- Semua child harus menerima repo root, commit, data root, internal key, scopes, dan upstream URLs yang sama.
- Startup harus fail jika migration gagal atau authenticated dependency readiness gagal.
- Perbarui panduan startup sesuai jalur yang benar.

## 4. Hidupkan enam service dan perbaiki seluruh API gate

Urutan:

1. jalankan offline tests;
2. buat commit checkpoint CR2A agar runtime identity menunjuk commit nyata;
3. stop dan pastikan port bersih;
4. start melalui panduan;
5. verifikasi port `3000`, `8001`, `8081`, `8082`, `8083`, `8085`;
6. verifikasi repo/commit/data-root identity sama;
7. jalankan authenticated API acceptance tanpa skip.

Valid request wajib tepat `200`; test invalid/missing credential terpisah wajib fail closed.

Minimal endpoint melalui port 3000:

- `/api/health`;
- project list/detail;
- package index canonical;
- civil candidate ledger;
- source PDF/page/thumbnail;
- core-engine golden calculation;
- review queue/correction read;
- Mission runs read/empty-state;
- Handoff read/empty-state.

Server mati, timeout, 401/403/500 untuk valid identity, atau identity mismatch harus FAIL, bukan skip.

## 5. Receipt boundary tetap jujur

- Pertahankan `engine_verified_count=0` sampai persisted calculation receipt benar-benar tersedia.
- MeasurementFact human-approved tetap `measurement_verified`, bukan hasil engine.
- Jangan membuat angka/receipt sementara untuk membuat API test hijau.

## 6. Gate CR2A

CR2A hanya PASS jika:

- migration lulus pada copy dan database portable aktif tanpa kehilangan data;
- canonical package index 88/88 persistent dan endpoint konsisten;
- enam service hidup dari commit yang sama;
- tidak ada secret leak;
- authenticated API ledger seluruhnya 200;
- live tests zero skipped;
- offline test, migration test, schema parity, security scan, build/typecheck relevan, dan `graphify update .` hijau;
- commit CR2A dibuat. Jangan push/PR dulu bila pekerjaan Phase 4 masih tersisa.

Append laporan `PHASE_4_TRUTH_REMEDIATION_AND_REAL_BROWSER_FEEDBACK.md` dengan bagian `CORRECTION ROUND 2A` dan akhiri salah satu:

- `PHASE 4 CR2A PASS — READY FOR CR2B UI/AGENTIC/BROWSER`
- `PHASE 4 CR2A FAIL/BLOCKED — DO NOT CONTINUE`

Kirim ringkasan final kepada root lalu berhenti. Jangan merge.
