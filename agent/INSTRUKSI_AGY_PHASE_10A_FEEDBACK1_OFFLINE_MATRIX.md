# Instruksi AGY — Phase 10A Feedback 1 Offline Matrix

Gunakan **Gemini 3.6 Flash High Thinking** sebagai executor dalam percakapan AGY
yang sama. Kerjakan hanya **Phase 10A / Task 1: Offline matrix and fixture
integrity**. Jangan memulai Phase 10B, 10C, atau Phase 11.

## Titik kerja

- Worktree: `G:\paax-ai-contextual-integration`
- Branch: `codex/contextual-intelligence-integration`
- Base commit: `fe1e02b7cf516d521324de15e44f761028072f1e`
- Remote branch sebelum fase:
  `origin/codex/contextual-intelligence-integration`
- Sumber feedback utama: `G:\REVISI\feedback 1.docx`
- Plan:
  `G:\paax-ai-main\docs\superpowers\plans\2026-07-26-di-feedback-audit-e2e-pr-handoff.md`

Phase 09E sudah selesai dan direkonsiliasi. Jangan mengubah ulang bukti atau
implementasi Phase 09E kecuali sebuah test Phase 10A membuktikan defect nyata;
jika itu terjadi, laporkan `CHANGES_REQUIRED` sebelum memperluas scope.

## Aturan wajib

1. Baca penuh:
   - `G:\paax-ai-main\AGENTS.md`;
   - `G:\paax-ai-main\agent\ATURAN_KERJA_ROOT_AGY_DAN_MONITOR_SLEEP.md`;
   - `G:\paax-ai-main\agent\ATURAN_KHUSUS_RECOVERY_0303_DAN_PHASE_11_FINAL_ACCEPTANCE.md`;
   - plan Phase 10 di atas.
2. Gunakan Graphify sebelum penelusuran source.
3. Gunakan TDD: buat test/matrix validator merah dahulu, lalu implementasi
   minimum hingga hijau.
4. Core Engine tetap satu-satunya otoritas angka final. AI/frontend tidak boleh
   menghitung.
5. Jangan memakai dummy/mock/sample sebagai bukti produksi.
6. Jangan menjalankan provider AI, browser E2E, atau service real-stack pada
   Phase 10A. Semua validasi fase ini offline dan network-disabled.
7. Jangan membaca atau menampilkan secret.
8. Jangan merge ke `main` dan jangan membuka PR final pada fase ini.

## Scope file

Implementasikan sesuai plan:

- Create `scripts/quality/feedback1_matrix.py`
- Create `scripts/quality/feedback1_matrix.json`
- Create `scripts/quality/run_feedback1_offline.ps1`
- Create
  `services/document-intelligence/tests/test_feedback1_offline_contracts.py`
- Create `services/core-engine/tests/test_feedback1_engine_authority.py`
- Create
  `apps/web/src/components/drawing-intelligence/workspace/__tests__/feedback1-ui-contracts.test.tsx`

Perubahan file tambahan hanya boleh dilakukan jika diperlukan langsung untuk
menjalankan test/runner Phase 10A dan harus dijelaskan dalam feedback.

## Audit Word dan matriks

1. Baca seluruh paragraf dan tabel `G:\REVISI\feedback 1.docx`; jangan hanya
   membaca cuplikan atau teks hasil percakapan.
2. Pertahankan identitas P2 sampai P62 berdasarkan sumber Word. Jika sebuah
   requirement berada di tabel atau struktur Word yang tidak cocok dengan
   asumsi nomor paragraf, catat mapping aktual secara eksplisit; jangan
   mengarang isi kosong.
3. Setiap entry minimal memiliki:
   - `paragraph`;
   - `requirement`;
   - `command`;
   - `artifact`;
   - `status`;
   - `limitation`.
4. Validator wajib fail-closed untuk:
   - P2-P62 tidak lengkap;
   - paragraph duplikat;
   - command/artifact kosong;
   - status selesai tanpa evidence;
   - limitation yang wajib tetapi hilang;
   - evidence path yang tidak ada.
5. Wajib mencakup rentang P9-P27, P28-P48, dan P49-P57.
6. Wajib ada explicit real-browser evidence placeholder/requirement untuk
   P2-P8 dan P59-P61; Phase 10A tidak boleh memalsukan bukti browser yang baru
   akan dijalankan pada Phase 10B.
7. Wajib ada Core Engine authority mapping untuk P5, P7, dan P60.
8. P62 wajib mendefinisikan ledger benchmark yang nantinya memuat model,
   feature, case, attempt, prompt version, token/cost bila tersedia, latency,
   proposal, deterministic validation, outcome, dan reason, dengan budget live
   diterapkan pada fase yang berwenang.

## Urutan TDD dan verifikasi

1. Tulis failing tests untuk kelengkapan/duplikasi/evidence/engine authority dan
   ledger P62.
2. Jalankan `python scripts/quality/feedback1_matrix.py --check` dalam kondisi
   merah yang diharapkan dan catat baseline tanpa mengubahnya menjadi fake
   pass.
3. Implementasikan matrix dan offline runner.
4. Offline runner harus menjalankan focused pytest, Vitest, schema/typecheck
   commands yang relevan dengan network disabled, serta mengembalikan nonzero
   saat mapping, command, artifact, atau gate hilang.
5. Jalankan semua focused tests Phase 10A dan offline runner sampai hijau.
6. Jalankan typecheck yang relevan bila test TS menyentuh kontrak TypeScript.
7. Jalankan `graphify update .` setelah perubahan source.
8. Jalankan `git diff --check`.
9. Pastikan tidak ada runtime DB, secret, build cache, atau artifact sementara
   yang ikut staged.

## Acceptance criteria

Phase 10A hanya boleh `DONE` jika:

- Word dibaca penuh termasuk tabel;
- P2-P62 terpetakan lossless tanpa duplikasi;
- validator fail-closed terbukti melalui tests;
- engine-authority mapping eksplisit;
- bukti browser/live-AI yang belum dijalankan berstatus jujur
  `pending`/`blocked`, bukan PASS;
- offline runner hijau dengan network disabled;
- semua test relevan dan typecheck yang diwajibkan hijau;
- local HEAD dan remote branch cocok setelah push;
- tidak ada secret atau artifact runtime ter-commit.

## Commit dan feedback final

Jika acceptance terpenuhi:

1. commit perubahan terkait dengan pesan
   `test(di): add Feedback 1 offline audit matrix`;
2. push ke branch remote yang sama;
3. rekonsiliasi SHA lokal dan remote;
4. tulis feedback final:
   `G:\paax-ai-contextual-integration\PHASE_10A_FEEDBACK1_OFFLINE_MATRIX_FEEDBACK.md`;
5. bila feedback di-commit terpisah, bedakan implementation commit dan feedback
   commit serta laporkan post-feedback HEAD/remote pada terminal agar tidak
   terjadi self-reference SHA.

Feedback final wajib memuat:

```text
PHASE:
STATUS:
MODEL:
WORKTREE:
BRANCH:
BASE COMMIT:
IMPLEMENTATION COMMIT:
FEEDBACK COMMIT:
POST-FEEDBACK HEAD/REMOTE:
WORD AUDIT EVIDENCE:
IMPLEMENTED:
RED TEST EVIDENCE:
GREEN TEST EVIDENCE:
TYPECHECK EVIDENCE:
MATRIX COVERAGE:
ENGINE AUTHORITY EVIDENCE:
NETWORK-DISABLED EVIDENCE:
SECURITY/SECRET SCAN:
PROCESS CLEANUP:
REMAINING CONCERNS:
NEXT RECOMMENDED ACTION:
QUOTA STATUS:
```

Gunakan `DONE` hanya jika semua gate terbukti. Gunakan `CHANGES_REQUIRED`,
`BLOCKED`, atau `QUOTA_EXHAUSTED` secara jujur bila sesuai. Setelah feedback
final, berhenti dan jangan memulai Phase 10B sendiri.
