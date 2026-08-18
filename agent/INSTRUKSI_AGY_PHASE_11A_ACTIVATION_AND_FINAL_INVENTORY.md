# Instruksi AGY — Phase 11A Activation Gate and Final Inventory

Gunakan **Gemini 3.6 Flash High Thinking** pada percakapan AGY yang sama.
Kerjakan hanya **Phase 11A: activation gate, evidence inventory, dan final test
manifest**. Jangan menjalankan Phase 11B+ atau live provider calls.

## Titik kerja

- Worktree: `G:\paax-ai-contextual-integration`
- Branch: `codex/contextual-intelligence-integration`
- Base/local/remote:
  `4c777ffd1f6b43476fe4e3ad9a9923350d3d79dd`
- Feedback utama: `G:\REVISI\feedback 1.docx`
- Mandatory terminal-phase rule:
  `G:\paax-ai-main\agent\ATURAN_KHUSUS_RECOVERY_0303_DAN_PHASE_11_FINAL_ACCEPTANCE.md`
- Super Big Plan:
  `G:\paax-ai-main\docs\superpowers\plans\2026-07-26-di-feedback-audit-e2e-pr-handoff.md`

## Aturan mutlak

1. Baca penuh `AGENTS.md`, aturan Root–AGY, mandatory terminal-phase rule,
   Super Big Plan, dan seluruh feedback final Phase 04C sampai Phase 10C.
2. Gunakan Graphify sebelum membaca source luas.
3. Phase 11 bukan fase menambah fitur. Phase 11A hanya membangun inventaris dan
   gate yang menentukan test selanjutnya.
4. Jangan menjalankan live DeepSeek/OpenRouter pada Phase 11A.
5. Jangan menjalankan raw drawing-to-JSON extraction.
6. Jangan mengubah rumus, angka, atau otoritas Core Engine.
7. Jangan mengklaim final PASS pada Phase 11A.
8. Jangan membuka PR atau merge `main` pada subfase ini.

## Activation gate

Verifikasi berdasarkan file feedback, Git, dan remote—not summary percakapan:

- Phase 04C, 05, 06, 07, 08;
- Phase 09A, 09B, 09C, 09D, 09E;
- Phase 10A, 10B, 10C;
- setiap correction round;
- implementation commit, feedback commit, dan remote reconciliation;
- tidak ada branch/worktree conflict;
- tidak ada blocker material yang masih terbuka.

Phase 07 live-provider concern harus direkonsiliasi dengan bukti live DeepSeek
V4 Flash Phase 10C, bukan dibiarkan sebagai status lama yang kontradiktif.

Jika ada fase/feedback/commit yang hilang atau tidak konsisten, berhenti dengan
`CHANGES_REQUIRED`; jangan melanjutkan inventaris sebagai PASS.

## Inventaris final

Buat inventaris lengkap yang menghubungkan:

- requirement/fase;
- implementation commit;
- feedback artifact;
- test command;
- automated artifact;
- browser/service artifact;
- real-data provenance;
- current status;
- limitation;
- subfase Phase 11 yang akan memverifikasi ulang.

Minimal mencakup 16 domain pada Bagian 6 mandatory rule:

1. viewer/range/lazy loading/cache/performance;
2. original image quality dan zoom;
3. sheet navigator/order/views;
4. multi-axis sheet classification;
5. DEM/PCKM candidate coverage;
6. quantity/capability classification;
7. fact/unit/dimension/evidence/conflict;
8. typed engine request/receipt/fingerprint;
9. authoritative quantity dan stale rejection;
10. AI-assist/deterministic validation/human approval;
11. agentic runtime/tools/idempotency/budget/recovery;
12. review/correction/approval/audit trail;
13. selection/RBAC/server handoff;
14. no production dummy/mock fallback;
15. security/schema parity/Command Room;
16. desktop/mobile/accessibility/console/network/cleanup.

## Feedback 1 inventory

1. Baca seluruh `G:\REVISI\feedback 1.docx`, termasuk tabel.
2. Verifikasi P2-P62 terhadap matrix Phase 10.
3. Temukan requirement di luar P2-P62 jika memang ada.
4. Jangan mengubah status menjadi PASS hanya karena path artifact ada.
5. Setiap item harus mempunyai status:
   `verified_previous_phase`, `requires_retest`, `blocked`,
   `not_applicable_with_reason`, atau `failed`.

## Inventaris AI dinamis

Gunakan Graphify untuk menemukan semua entrypoint AI, tidak hanya lima fitur
Drawing Intelligence Phase 10C. Minimal inventaris:

- Drawing Intelligence AI-assist;
- ambiguity/classification/binding;
- review explanation/suggestion;
- Command Room routing/fallback;
- agentic planner, tool selection, approval, retry, budget, audit;
- manual fallback dan malformed/hallucination rejection.

Setiap fitur harus memiliki rencana kasus:

- valid;
- ambiguous;
- invalid;
- provider error/malformed;
- fallback.

Tetapkan budget Phase 11 terpisah **maksimal 15 live provider calls per fitur**.
Jangan membuat call pada Phase 11A. Siapkan fail-closed counter/manifest sehingga
attempt ke-16 tidak dapat dikirim. Retry/error/timeout tetap dihitung.

## Artifact Phase 11A

Buat atau inisialisasi secara jujur:

- `report/report_drawing_intelligence/SUPER_BIG_PLAN_FINAL_ACCEPTANCE.md`
- `report/report_drawing_intelligence/FEEDBACK1_FINAL_ACCEPTANCE_MATRIX.json`
- `report/report_drawing_intelligence/PAAX_AI_FEATURE_FINAL_LEDGER.json`
- `report/report_drawing_intelligence/VIEWER_IMAGE_QUALITY_FINAL_REPORT.md`

Artifact masih berstatus `IN_PROGRESS` dan tidak boleh berisi bukti test yang
belum dijalankan pada Phase 11.

Boleh menambah validator/manifest runner khusus final acceptance bila diperlukan,
tetapi jangan menambah fitur produk.

## Rencana subfase berikutnya

Hasil Phase 11A harus memecah sisa kerja menjadi:

- Phase 11B: offline/full service suites, engine anchors, schema, security;
- Phase 11C: real-stack browser desktop/mobile, viewer/image quality,
  performance, network/console;
- Phase 11D: seluruh AI live/failure/fallback + agentic/review/handoff;
- Phase 11E: Word re-audit, cross-matrix reconciliation, draft PR handoff,
  terminal decision.

Setiap subfase harus mempunyai command, data source, artifact, gate, cleanup,
dan kondisi berhenti.

## Verifikasi Phase 11A

- validator inventaris/matrix merah dahulu bila artifact hilang;
- validator hijau setelah coverage lengkap;
- tidak ada live network/provider call;
- `graphify update .`;
- `git diff --check`;
- scan secret/runtime DB/temp/log;
- port 3000/8000/8001/8002 tetap bersih;
- local/remote direkonsiliasi setelah commit/push.

## Commit dan feedback

Commit scoped Phase 11A, push branch yang sama, lalu tulis:

`G:\paax-ai-contextual-integration\PHASE_11A_ACTIVATION_FINAL_INVENTORY_FEEDBACK.md`

Feedback wajib memuat:

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
ACTIVATION GATE:
PHASE/COMMIT COVERAGE:
P2-P62 WORD COVERAGE:
EXTRA WORD REQUIREMENTS:
16-DOMAIN INVENTORY:
AI FEATURE INVENTORY:
PHASE 11 LIVE BUDGET MANIFEST:
RED/GREEN VALIDATOR EVIDENCE:
SECRET/SECURITY SCAN:
PROCESS CLEANUP:
REMAINING SUBPHASES:
REMAINING CONCERNS:
QUOTA STATUS:
```

Gunakan `DONE` hanya untuk Phase 11A, bukan final whole-system acceptance.
Setelah feedback, berhenti dan jangan memulai Phase 11B sendiri.
