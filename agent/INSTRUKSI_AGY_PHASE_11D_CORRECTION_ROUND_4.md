# Instruksi AGY — Phase 11D Correction Round 4

## Identitas pekerjaan

- Phase: `11D`
- Correction round: `4`
- Worktree: `G:\paax-ai-contextual-integration`
- Branch: `codex/contextual-intelligence-integration`
- Base commit terverifikasi: `9c1ecee369443d259e5b25c83c533f5a0079c159`
- Executor utama: Gemini 3.6 Flash High Thinking melalui AGY
- Output feedback final:
  `G:\paax-ai-contextual-integration\PHASE_11D_LIVE_AI_AGENTIC_REVIEW_HANDOFF_FEEDBACK.md`

Phase 11D masih `CHANGES_REQUIRED`. Jangan memulai Phase 11E dan jangan
menyatakan seluruh final acceptance selesai.

## Kondisi awal yang wajib dipertahankan

Worktree memiliki partial work Correction Round 4 yang belum di-commit:

- `.gitignore`
- `apps/web/e2e/phase11d-real-runtime-acceptance.spec.ts`
- `scripts/live_test/start_paax_services.py`
- `scripts/live_test/run_phase11d_cr4_real_runtime_proof.py`
- `services/document-intelligence/tests/test_phase11d_real_runtime_evidence_validator.py`

Audit perubahan tersebut terlebih dahulu. Pertahankan bagian yang benar,
perbaiki bagian yang belum benar, dan jangan reset/checkout/delete membabi buta.
Tidak boleh menghapus perubahan pengguna atau melakukan history rewrite.

## Tujuan

Menghasilkan bukti runtime Phase 11D yang benar-benar berasal dari server PAAX
yang berjalan, bukan fingerprint buatan, test fixture, response interception,
fixed wait, atau klaim PASS yang bertentangan dengan evidence.

## Finding wajib ditutup

1. Evidence CR3 menyatakan `PASS` walaupun `stale_receipt_rejected=false` dan
   metadata anggaran masih saling bertentangan. Validator evidence harus
   fail-closed: satu gate wajib gagal berarti overall tidak boleh PASS.
2. Script CR3 membuat fingerprint dari string yang dikonstruksi sendiri seperti
   `core-engine-receipt:{project}:{run}` dan
   `handoff-receipt:{project}:{count}`. Ini bukan receipt server. Hapus pola
   tersebut dari jalur aktif. Fingerprint hanya boleh dihitung dari canonical
   non-secret payload/receipt yang benar-benar diterima dari endpoint server.
3. Bukti agentic belum menunjukkan receipt Core Engine yang nyata dan
   terkorrelasi dengan project/run/request/idempotency/provenance.
4. Bukti review-to-handoff hanya membaca GET queue/readiness. Harus ada aksi
   handoff server nyata untuk individual dan bulk, termasuk:
   - eligible success;
   - stale receipt rejection;
   - non-eligible rejection;
   - RBAC rejection;
   - korelasi receipt server yang dapat diaudit.
5. Playwright masih boleh lulus karena kontrol opsional dan fixed waits.
   Buat assertion ketat tanpa `page.route()`/response interception:
   - Command Room benar-benar mengirim POST;
   - SSE selesai;
   - jawaban assistant nyata tampil;
   - review/correction/select/bulk/handoff benar-benar dieksekusi;
   - status UI dan response server saling terkorrelasi.
6. Fallback Command Room sebelumnya hanya payload `modelAlias` invalid yang
   mendapat HTTP 400. Itu bukan provider outage. Uji kegagalan provider yang
   nyata dan terkontrol pada tingkat proses/runtime, lalu buktikan UI manual
   fallback tetap dapat menyelesaikan alur tanpa membuat fake success.
7. Dilarang ada hardcoded `test-internal-key`, default secret, localhost
   production fallback, `active-sheet-001`, atau fake success. Test harness
   boleh membuat key acak process-local dan menyuntikkannya hanya ke proses
   service yang diuji; jangan tulis nilainya ke report/log/commit.
8. Evidence lama yang salah harus ditandai superseded atau diganti sehingga
   tidak ada dua artefak aktif yang sama-sama mengklaim kebenaran berbeda.

## Aturan budget AI final

- Maksimal **5 network calls provider nyata per fitur AI**.
- Counter kumulatif dan tidak boleh direset oleh retry/restart.
- Attempt ke-6 wajib ditolak sebelum network (`network_sent=false`).
- Test engine deterministik tidak terkena batas ini.
- Jangan melakukan live call yang tidak diperlukan.
- Batas lama 15 panggilan tidak berlaku untuk acceptance aktif; dokumen historis
  boleh tetap historis tetapi tidak boleh dibaca validator sebagai aturan aktif.

## Aturan implementasi

1. Baca `AGENTS.md`, kedua dokumen aturan agent, Super Big Plan, feedback Phase
   11D, dan source yang relevan.
2. Jalankan `graphify query` sebelum penelusuran source. Gunakan TDD untuk setiap
   bugfix/fitur.
3. Core Engine adalah satu-satunya otoritas angka. AI hanya klasifikasi,
   ekstraksi, binding, proposal, atau penjelasan; tidak menghitung angka final
   dan tidak auto-commit input engine.
4. Gunakan data proyek dan artefak 88 halaman yang nyata. Jangan menyamarkan
   fixture/dummy sebagai bukti runtime. Ekstraksi penuh PDF ke JSON tidak perlu
   diulang.
5. Jika endpoint handoff nyata belum ada, implementasikan kontrak paling kecil
   yang production-ready, fail-closed, ber-RBAC, idempotent, dan memakai schema
   Zod/Pydantic yang selaras bila schema lintas bahasa berubah.
6. Jangan menyentuh atau menghapus Command Room protected files di luar
   perubahan minimum yang diperlukan.
7. Jangan menampilkan atau menulis API key/secret.

## Verification wajib

- Unit/regression test baru untuk validator evidence, receipt correlation,
  stale/non-eligible/RBAC rejection, budget cap 5, dan attempt 6 pre-network.
- Test relevan Python/TypeScript, `tsc --noEmit`, dan build yang terdampak.
- Jalankan real services dan Playwright browser test tanpa network interception.
- Buktikan Command Room, agentic mission sampai receipt Core Engine, review,
  correction, individual handoff, dan bulk handoff.
- Lakukan security/secret scan terarah.
- Jalankan `graphify update .` setelah perubahan.
- Bersihkan semua service/browser/proses yang dibuat oleh fase.
- Rekonsiliasi worktree, commit lokal, dan remote branch.

Jika bukti real runtime tidak dapat dipenuhi, tulis `CHANGES_REQUIRED` atau
`BLOCKED` dengan sebab nyata. Jangan membuat fingerprint/receipt pengganti dan
jangan mengklaim PASS.

## Git dan feedback

- Commit dan push hanya ke
  `codex/contextual-intelligence-integration`.
- Jangan merge ke `main`, rebase, amend, reset, atau history rewrite.
- Feedback final wajib memuat:
  `PHASE`, `STATUS`, `MODEL`, `WORKTREE`, `BRANCH`, `BASE COMMIT`,
  `FINAL COMMIT`, `REMOTE RECONCILIATION`, `IMPLEMENTED`, `TEST EVIDENCE`,
  `TYPECHECK/BUILD EVIDENCE`, `BROWSER EVIDENCE`, `REAL-DATA EVIDENCE`,
  `SECURITY/SECRET SCAN`, `PROCESS CLEANUP`, `REMAINING CONCERNS`,
  `NEXT RECOMMENDED ACTION`, dan `QUOTA STATUS`.

Berhenti setelah feedback final Phase 11D Correction Round 4 selesai. Jangan
memulai Phase 11E.
