# Instruksi AGY — Phase 11B Offline, Engine, Schema, and Security Gates

Gunakan **Gemini 3.6 Flash High Thinking** pada percakapan AGY yang sama.
Kerjakan hanya **Phase 11B**. Jangan menjalankan browser real-stack Phase 11C
atau live AI Phase 11D.

## Titik kerja

- Worktree: `G:\paax-ai-contextual-integration`
- Branch: `codex/contextual-intelligence-integration`
- Base/local/remote:
  `4b8640a23accf813577684168e2e8827b8321919`
- Mandatory rule:
  `G:\paax-ai-main\agent\ATURAN_KHUSUS_RECOVERY_0303_DAN_PHASE_11_FINAL_ACCEPTANCE.md`
- Phase 11A feedback:
  `PHASE_11A_ACTIVATION_FINAL_INVENTORY_FEEDBACK.md`

## Scope

Jalankan seluruh gate offline dan service-contract yang diwajibkan. Jangan
mengurangi suite untuk memperoleh PASS:

1. full Document Intelligence pytest;
2. full Core Engine pytest;
3. manual calculation anchors untuk setiap fungsi perhitungan relevan;
4. DB/project API tests;
5. AI orchestrator dan agentic offline tests;
6. schema Zod/Pydantic parity tests;
7. package/schema builds;
8. seluruh relevant web Vitest;
9. `tsc --noEmit`;
10. Next production build;
11. no-dummy/mock production import scan;
12. secret/security/RBAC/fail-closed scan;
13. Command Room protection/regression tests;
14. offline Feedback 1 matrix dan seluruh Phase 11 validators.

## Aturan Emas dan anchors

- Setiap angka final wajib berasal dari Python Core Engine.
- Test anchor harus menyebut input, rumus/manual reference, expected value,
  unit, dimension, tolerance, dan actual result.
- Fail bila TypeScript/frontend/LLM menghasilkan angka final.
- Fail bila unit/dimension salah, receipt tidak cocok, provenance hilang,
  request fingerprint stale, atau response tidak endpoint-specific.
- AI/agent boleh mengubah input terstruktur lalu memanggil engine, tetapi tidak
  boleh menulis output numeric final.

## Security/no-dummy

Scan harus mencakup:

- production imports ke mock/demo/sample workspace;
- synthetic fallback yang dapat muncul sebagai data nyata;
- hardcoded service/API keys;
- `.env.local`, SQLite/runtime DB, logs, PID, trace, build cache dalam Git;
- auth/RBAC fail-open;
- schema mismatch Zod/Pydantic;
- protected Command Room files dan routing/fallback;
- server-side handoff/review authority;
- dangerous AI auto-approval atau numeric authority.

Jangan menampilkan nilai secret. Gunakan environment hanya jika sebuah offline
test membutuhkan nama variabel; Phase 11B tidak boleh membuat live provider
call.

## Perlakuan kegagalan

Phase 11 adalah acceptance, bukan cara menyembunyikan defect:

- simpan command, exit code, failing test, dan root category;
- jangan menghapus/skipping test atau menurunkan assertion;
- bila defect produk ditemukan, jangan memperluas menjadi fitur baru;
- tulis `CHANGES_REQUIRED` agar Root membuat correction round terpisah;
- perbaikan test harness/report yang jelas dan tidak mengubah perilaku produk
  boleh dilakukan dengan TDD serta harus dijelaskan.

## Artifact

Update hanya dengan hasil aktual:

- `SUPER_BIG_PLAN_FINAL_ACCEPTANCE.md`;
- `FEEDBACK1_FINAL_ACCEPTANCE_MATRIX.json`;
- `PAAX_AI_FEATURE_FINAL_LEDGER.json` hanya pada evidence offline; live counters
  tetap 0;
- report engine authority, schema/security, dan suite manifest bila diperlukan.

Jangan menandai requirement browser/live AI sebagai PASS pada Phase 11B.

## Verifikasi dan hygiene

- catat setiap command dan hasil;
- jalankan `graphify update .`;
- jalankan `git diff --check`;
- scan staged files dan reports untuk secret;
- pastikan port 3000/8000/8001/8002 bersih;
- commit/push hanya bila gate konsisten;
- local HEAD harus sama dengan remote.

## Feedback

Tulis:

`G:\paax-ai-contextual-integration\PHASE_11B_OFFLINE_ENGINE_SCHEMA_SECURITY_FEEDBACK.md`

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
DOCUMENT INTELLIGENCE SUITE:
CORE ENGINE SUITE:
MANUAL ENGINE ANCHORS:
DB/PROJECT API SUITE:
AI ORCHESTRATOR/AGENTIC OFFLINE SUITE:
SCHEMA PARITY/BUILD:
WEB VITEST:
TSC/NEXT BUILD:
NO-DUMMY SCAN:
SECURITY/RBAC/SECRET SCAN:
COMMAND ROOM REGRESSION:
FEEDBACK1/PHASE11 VALIDATORS:
MATRIX/REPORT UPDATES:
LIVE PROVIDER CALLS:
PROCESS CLEANUP:
REMAINING CONCERNS:
NEXT RECOMMENDED ACTION:
QUOTA STATUS:
```

`LIVE PROVIDER CALLS` wajib tetap `0`. Gunakan `DONE` hanya jika seluruh gate
Phase 11B hijau. Setelah feedback, berhenti dan jangan memulai Phase 11C.
