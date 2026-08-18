# Instruksi AGY — Phase 11D Live AI, Agentic, Review, and Handoff

Gunakan **Gemini 3.6 Flash High Thinking** pada percakapan AGY yang sama.
Kerjakan hanya **Phase 11D**. Jangan memulai Phase 11E.

## Titik kerja

- Worktree: `G:\paax-ai-contextual-integration`
- Branch: `codex/contextual-intelligence-integration`
- Base/local/remote:
  `caa8d6e9ac2bd36820066476c830a51e77724917`
- Process-local env source:
  `G:\paax-ai-main\.env.local`
- Provider: OpenRouter
- Model: `deepseek/deepseek-v4-flash`
- Final AI ledger:
  `report/report_drawing_intelligence/PAAX_AI_FEATURE_FINAL_LEDGER.json`

## Secret/provider rules

- Muat `DRAWING_INTELLIGENCE_API_KEY` hanya ke environment proses.
- Jangan menyalin `.env.local` ke worktree.
- Jangan mencetak, menyimpan, meng-hash, screenshot, atau commit key/token.
- Jangan memakai `DEEPSEEK_API_KEY` Command Room sebagai substitusi.
- Jangan mengganti model bila DeepSeek V4 Flash gagal.
- Jangan menjalankan raw drawing-to-JSON extraction.

## Budget Phase 11

Budget ini terpisah dari Phase 10C:

- maksimal 15 live provider calls **per fitur AI**;
- setiap fitur memiliki counter sendiri;
- retry, timeout, malformed, auth/provider error tetap dihitung;
- attempt ke-16 ditolak sebelum network;
- berhenti lebih awal saat acceptance terbukti;
- jangan menghabiskan call tanpa alasan;
- semua call dicatat non-secret.

## Inventaris dinamis

Graphify ulang seluruh entrypoint AI. Minimal tujuh fitur Phase 11A:

1. `sheet_classification_fallback`;
2. `discipline_ambiguity_resolution`;
3. `evidence_binding_suggestion`;
4. `review_explanation_router`;
5. `deterministic_rejection_fallback`;
6. `command_room_router`;
7. `agentic_planner_governance`.

Tambahkan fitur aktual lain bila Graphify membuktikannya. Jangan mengarang
fitur yang tidak ada.

## Kasus AI per fitur

Untuk setiap fitur aktual, buktikan secara proporsional:

- valid/high-confidence;
- ambiguous;
- invalid/out-of-range;
- provider error atau malformed output;
- deterministic rejection;
- manual/rule-based fallback.

Kasus failure boleh memakai transport fixture deterministik untuk memaksa
timeout/malformed tanpa membocorkan key; final success path setiap fitur yang
memang provider-backed harus memiliki minimal satu live DeepSeek response.

Setiap live record minimal menyimpan:

- model/provider;
- feature/case/attempt;
- prompt version;
- provenance non-secret;
- latency;
- tokens/cost bila benar-benar dikembalikan;
- proposal;
- schema parse;
- deterministic validation;
- approval requirement;
- outcome/reason;
- fallback;
- numeric-authority decision.

Null wajib digunakan bila token/cost tidak tersedia—jangan mengarang.

## Aturan Emas AI

- Rule/engine tetap fast-path.
- AI hanya menerima teks+koordinat terstruktur, bukan piksel mentah.
- AI hanya mengusulkan klasifikasi, binding, planning, atau explanation.
- Output AI wajib schema-validated dan deterministic-validated.
- Tidak ada auto-commit ke input engine.
- Human approval wajib untuk perubahan input.
- Core Engine satu-satunya pembuat angka final.
- Hallucination, unknown evidence, unit/dimension invalid, stale context, atau
  numeric proposal dari AI harus ditolak.

## Agentic system

Buktikan dengan state/audit nyata:

- mission creation dan project context binding;
- planner output tervalidasi;
- tool allowlist/scope;
- idempotency;
- step/cost/token/tool budget;
- retry dan backoff;
- approval sebelum tindakan material;
- pause/resume/recovery;
- event/audit replay;
- stale/mismatched context rejection;
- agent tidak dapat melewati review atau Core Engine;
- final quantity hanya dari verified engine receipt.

## Review dan handoff

Gunakan data PLHUT/artifact nyata:

- source evidence navigation;
- correction/rejection/approval;
- conflict/needs_review/blocked reason;
- unit/dimension/provenance;
- individual dan bulk selection;
- RBAC;
- server-side revalidation;
- stale receipt/fingerprint rejection;
- handoff hanya untuk item eligible;
- review mengubah input terstruktur, bukan angka final.

## Browser/service proof

Gunakan real local stack bila UI/endpoint diperlukan. Dilarang memakai route
interception sebagai final proof. Buktikan:

- Command Room routing/fallback;
- agentic mission dan tool execution;
- review queue;
- handoff;
- manual fallback saat provider failure;
- console/network bersih.

## Gate

- live ledger validator dan counter test;
- fail-closed attempt-16 test;
- relevant DI/Command Room/agentic/review/handoff tests;
- real service/browser proof yang relevan;
- no-numeric-authority scan;
- security/secret scan;
- update Super Big Plan dan Feedback1 final matrix hanya dari hasil aktual;
- `tsc --noEmit` dan Next build bila web berubah;
- `graphify update .`;
- `git diff --check`;
- cleanup services/ports/temp artifacts;
- commit/push dan local/remote reconciliation.

Jika defect muncul, jangan menurunkan test. Gunakan `CHANGES_REQUIRED` agar Root
membuat correction round.

## Feedback

Tulis:

`G:\paax-ai-contextual-integration\PHASE_11D_LIVE_AI_AGENTIC_REVIEW_HANDOFF_FEEDBACK.md`

Kontrak:

```text
PHASE:
STATUS:
MODEL:
WORKTREE:
BRANCH:
BASE COMMIT:
IMPLEMENTATION/REPORT COMMIT:
FEEDBACK COMMIT:
POST-FEEDBACK HEAD/REMOTE:
GRAPHIFY AI INVENTORY:
LIVE CALLS PER FEATURE:
BUDGET/ATTEMPT-16 GATE:
DEEPSEEK MODEL/ROUTE:
VALID/AMBIGUOUS/INVALID CASES:
MALFORMED/ERROR/FALLBACK:
DETERMINISTIC VALIDATION:
NO-NUMERIC-AUTHORITY:
COMMAND ROOM:
AGENTIC MISSION/TOOLS:
APPROVAL/IDEMPOTENCY/BUDGET/RECOVERY:
REVIEW QUEUE:
SELECTION/RBAC/HANDOFF:
REAL SERVICE/BROWSER:
LEDGER/MATRIX UPDATES:
TEST/TYPECHECK/BUILD:
SECRET/SECURITY SCAN:
PROCESS CLEANUP:
REMAINING CONCERNS:
NEXT RECOMMENDED ACTION:
EXECUTOR QUOTA STATUS:
```

Gunakan `DONE` hanya jika seluruh gate Phase 11D hijau. Setelah feedback,
berhenti dan jangan memulai Phase 11E.
