# Command Room v1.5 + Phase 1-10 Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Integrate every file-level change from Command Room Chat v1.5 commit \`6469c89b\` into the Phase 1-10 worker workspace while preserving the worker runtime, deterministic engineering boundaries, local work, and test evidence.

**Architecture:** Treat v1.5 as an incoming contract layer for chat parts, attachments, conversations, queues, artifacts, runtime control, and event streams. Keep Phase 1-10 operational execution behind the existing Work/gateway/tool-executor path; the Chat path receives v1.5 general capabilities and event envelopes while retaining Phase 10 evidence/claim validation and memory persistence. Apply the v1.5 database/API deltas only after the existing workspace is backed up and base-equivalence has been verified; resolve the two non-equivalent files (\`chat/route.ts\` and dashboard \`page.tsx\`) manually against their contracts and tests.

**Tech Stack:** Next.js/React, TypeScript, Zod, Vitest, pnpm, Python FastAPI, SQLAlchemy, Alembic, pytest, Graphify, Git.

**Spec:** User dispatch \`MERGE V1.5 + PHASE 1-10 — JADIKAN SATU (Luna)\` and runtime authorization file \`D:\\PAAX-Orchestration\\00_projects\\2026-08-17-command-room-worker-full-ai-agent\\05_OWNER_AUTHORIZATION_RUNTIME.md\`.

## Global Constraints

- Preserve all Phase 1-10 folders and files; do not delete or move existing runtime code.
- Import every path reported by v1.5 commit \`6469c89b\` (the verified \`git diff-tree\` audit currently reports 42 paths, despite the dispatch summary saying 43), including modified files, not only the files listed as missing in the dispatch.
- Deterministic RAB/BoQ/schedule/quantity outputs remain owned by \`services/core-engine\`; Chat/LLM/TypeScript may propose or explain but may not compute final engineering numbers.
- Keep Zod schemas in \`packages/schemas\` and Pydantic schemas in \`services/db\` synchronized whenever the merge changes a shared contract.
- Keep attachment and chat events provenance-safe; do not expose prompts, credentials, or raw tool results to clients.
- Preserve all pre-existing tracked and untracked worker changes; do not overwrite, delete, or silently discard them.
- Work on branch \`merge/command-room-v15-phase1-10-20260818\`; do not commit directly to \`master\` and do not merge the PR locally.
- Run the requested build/test commands and refresh Graphify for every changed module before claiming completion.

---

### Task 1: Establish a recoverable merge baseline

**Files:**
- Create/copy: \`apps/web/src/app/api/command-room-backup-phase10/\`
- Create/copy: \`apps/web/src/components/command-room-backup-phase10/\`
- Create/copy: \`apps/web/src/lib/chat-backup-phase10/\`
- Modify: Git branch/history only; preserve all pre-existing workspace files.

**Interfaces:**
- Consumes: Current worker state at \`9f1208a\` plus the existing dirty tracked/untracked changes.
- Produces: A branch-local checkpoint and three explicit backups from which the pre-merge state can be restored.

- [ ] **Step 1: Verify backup targets are absent or identical recoverable backups.**

Run:

~~~powershell
$targets = @(
  'apps/web/src/app/api/command-room-backup-phase10',
  'apps/web/src/components/command-room-backup-phase10',
  'apps/web/src/lib/chat-backup-phase10'
)
foreach ($target in $targets) {
  [pscustomobject]@{ Path=$target; Exists=(Test-Path -LiteralPath $target) }
}
~~~

Expected: no target exists before the copy; if a target exists, compare its file hashes with the current source and stop before overwriting it.

- [ ] **Step 2: Copy the three current Command Room areas without changing source files.**

Run from \`D:\\paax-ai-command-room-worker\`:

~~~powershell
Copy-Item -LiteralPath 'apps/web/src/app/api/command-room' -Destination 'apps/web/src/app/api/command-room-backup-phase10' -Recurse
Copy-Item -LiteralPath 'apps/web/src/components/command-room' -Destination 'apps/web/src/components/command-room-backup-phase10' -Recurse
Copy-Item -LiteralPath 'apps/web/src/lib/chat' -Destination 'apps/web/src/lib/chat-backup-phase10' -Recurse
~~~

Expected: each backup contains the same relative file set and SHA-256 hashes as its source immediately before merge.

- [ ] **Step 3: Record a checkpoint commit for existing local work.**

Run:

~~~powershell
git add -A
git commit -m "chore: checkpoint pre-existing command room worker state"
~~~

Expected: the branch contains the pre-existing tracked changes, generated evidence, and requested backups; no pre-existing file is lost. This checkpoint is intentionally separate from the v1.5 integration commit.

### Task 2: Import the v1.5 file set and database contract

**Files:**
- Add/update every path listed in commit \`6469c89b\`, including:
  \`apps/web/e2e/fixtures/command-room-chat-v15.csv\`,
  \`apps/web/src/app/(dashboard)/command-room/page.tsx\`,
  all v1.5 \`artifacts/\`, \`attachments/\`, \`chat/\`, and \`conversations/\` routes,
  \`apps/web/src/components/command-room/ChatPartsRenderer.tsx\`,
  all v1.5 \`apps/web/src/lib/chat/*\` contracts/reducer/tests,
  and \`services/db/alembic/versions/0040_command_room_chat_v15_parts.py\` plus \`0041_command_room_chat_queue.py\`.
- Modify only after comparison: \`services/db/src/paax_db/main.py\`, \`models.py\`, \`schemas.py\`, and their v1.5 tests.

**Interfaces:**
- Consumes: Clean v1.5 worktree \`D:\\paax-ai-worktrees\\command-room-chat-v1-5\` at \`6469c89b\` and the Phase 1-10 checkpoint.
- Produces: v1.5 routes/contracts/migrations present in the worker without removing Phase 1-10 folders or services.

- [ ] **Step 1: Verify the complete incoming file list against the v1.5 commit.**

Run:

~~~powershell
git -C D:\\paax-ai-worktrees\\command-room-chat-v1-5 diff-tree --no-commit-id --name-status -r 6469c89b
~~~

Expected: 42 changed paths in this repository, including modified existing files; use this output as the source-of-truth list and report the dispatch's 43-versus-42 discrepancy rather than inventing a path.

- [ ] **Step 2: Copy all v1.5 paths that are new or base-equivalent.**

For every \`A\` path and every modified path whose current worker content equals \`6469c89b^\` content, copy the v1.5 file to the same worker-relative path, creating parent directories first. This includes the two Alembic migrations, DB models/schemas/main, v1.5 tests, attachment/artifact/conversation routes, chat event/vision/general/runtime modules, \`ChatPartsRenderer\`, chat contracts/reducer, fixture, and history/store updates.

Expected: all such files match v1.5 byte-for-byte; Phase 1-10-only paths outside the incoming list remain present.

- [ ] **Step 3: Verify DB migration ordering and schema alignment before testing.**

Run:

~~~powershell
Select-String -LiteralPath 'services/db/alembic/versions/0040_command_room_chat_v15_parts.py','services/db/alembic/versions/0041_command_room_chat_queue.py' -Pattern 'revision|down_revision'
Select-String -LiteralPath 'services/db/src/paax_db/models.py','services/db/src/paax_db/schemas.py' -Pattern 'Chat|Queue|Attachment|Artifact|Conversation|Message'
~~~

Expected: \`0040\` points to the existing head and \`0041\` points to \`0040\`; ORM/Pydantic names used by the v1.5 routes exist and no Phase 1-10 model is removed.

### Task 3: Integrate \`chat/route.ts\` without losing Phase 1-10 execution

**Files:**
- Modify: \`apps/web/src/app/api/command-room/chat/route.ts\`
- Modify if required by compiler/tests: \`apps/web/src/app/api/command-room/chat/tools.ts\`, \`context.ts\`, \`connector-permissions.ts\`, \`route.test.ts\`, \`apps/web/src/app/api/command-room/work/route.ts\`, and its route test
- Read-only references: \`services/ai-orchestrator/src/index.ts\`, \`services/ai-orchestrator/src/agent/tool-executor.ts\`, \`apps/web/src/app/api/command-room/work/route.ts\`, \`apps/web/src/app/api/command-room/work/tools.ts\`

**Interfaces:**
- Consumes: v1.5 \`ChatEventStream\`, \`runtime-control\`, \`general-tools\`, \`vision-router\`, attachment contract, and current Phase 1-10 work/evidence/tool contracts.
- Produces: \`POST /api/command-room/chat\` accepting v1.5 \`turnId\`/attachments/conversation fields, emitting ordered v1.5 event parts, and preserving current \`mode: "work"\`, gateway handoff, deterministic claim validation, memory persistence, stop/steer behavior, and legacy clients.

- [ ] **Step 1: Write/extend contract tests for the combined request/event boundary before implementation edits.**

Cover these concrete assertions in the existing route test or adjacent contract test:

~~~ts
// Chat accepts v1.5 fields while retaining legacy defaults.
expect(parseChatRequest({ messages: [], attachments: [], mode: "chat" }).success).toBe(true);
// Work still routes to the Phase 1-10 work handler and never uses general chat tools.
expect(await post({ mode: "work", ...workRequest })).toEmitWorkEvents();
// Chat events contain conversationId/turnId/runtimeId and never expose tool result payloads.
expect(chatEvents.every((event) => event.type !== "tool.result" || !("result" in event))).toBe(true);
~~~

Run the narrow route/contract tests and record the current failure shape before editing:

~~~powershell
pnpm --dir apps/web test -- src/app/api/command-room/chat/route.test.ts
~~~

- [ ] **Step 2: Keep the current Phase 1-10 Work branch intact.**

Retain \`handleWorkPost\`, \`parseWorkRequest\`, \`buildWorkMessages\`, \`WorkEventEmitter\`, approval resolution, work tool registry, and the gateway/runtime handoff. Do not route operational Drawing/RAB/Schedule calls through the v1.5 general Chat registry.

The helper must be internal to the Chat route because Next route modules reject extra exports. In legacy mode, \`work/route.ts\` must delegate to \`POST\` from Chat before consuming the request body; update the Work route test to assert that delegation rather than importing a non-handler export.

- [ ] **Step 3: Merge v1.5 Chat request fields and event lifecycle into the Chat branch.**

Retain the current model/key resolution and evidence pipeline, then add:

~~~ts
turnId: z.string().optional(),
attachments: z.array(attachmentRequestSchema).max(4).default([]),
const conversationId = requestedConversationId?.trim() || \`conversation-\${crypto.randomUUID()}\`;
const turnId = requestedTurnId?.trim() || runId?.trim() || crypto.randomUUID();
const chatEvents = new ChatEventStream(eventEnvelope, enqueueEvent);
~~~

Use \`chatEvents.turnStarted\`, \`source.added\`, \`assistant.interim\`, \`tool.started\`, \`tool.completed\`/\`tool.failed\`, \`turn.interrupted\`/\`turn.failed\`, and \`done\`; route legacy \`sendEvent\` calls through \`ChatEventStream.fromLegacy\` so existing clients remain readable while new clients receive the v1.5 contract.

- [ ] **Step 4: Combine capabilities with an explicit boundary.**

For \`mode: "chat"\`, process attachments through \`analyzeChatAttachments\` and use \`createGeneralChatToolRegistry\`; pass attachment observations as cited context and preserve \`verifyAndComposeClaims\` plus \`persistConversationSummary\`. For \`mode: "work"\`, preserve the Phase 1-10 operational registry and deterministic result receipts. \`projectId\` may scope memory/context but must not make Chat silently execute operational RAB/Schedule/Drawing tools.

- [ ] **Step 5: Verify route tests and TypeScript before moving on.**

Run:

~~~powershell
pnpm --dir apps/web test -- src/app/api/command-room/chat/route.test.ts
pnpm --dir apps/web exec tsc --noEmit
~~~

Expected: no route contract regression, no missing v1.5 imports, and no Phase 1-10 tool/gateway type regression.

### Task 4: Reconcile dashboard UI and renderer with both contracts

**Files:**
- Modify: \`apps/web/src/app/(dashboard)/command-room/page.tsx\`
- Add: \`apps/web/src/components/command-room/ChatPartsRenderer.tsx\`
- Modify: \`apps/web/src/components/command-room/RunStatus.tsx\`
- Use: \`apps/web/src/lib/chat/command-room-chat-reducer.ts\`, \`command-room-chat-contract.ts\`, \`attachment-contract.ts\`, \`chat-run-store.ts\`

**Interfaces:**
- Consumes: v1.5 event-part/reducer/attachment contracts and existing Phase 1-10 Command Room UI state.
- Produces: a page that renders v1.5 parts and attachments while retaining Phase 1-10 work/run/approval status and truthful runtime states.

- [ ] **Step 1: Compare page imports and state transitions against current command-room components.**

Run:

~~~powershell
Select-String -LiteralPath 'apps/web/src/app/(dashboard)/command-room/page.tsx' -Pattern 'ChatPartsRenderer|RunStatus|useChat|attachments|mode|work|approval|stream'
Select-String -LiteralPath 'apps/web/src/components/command-room/ChatPartsRenderer.tsx' -Pattern 'export|type|function|const'
~~~

Expected: every imported symbol resolves to a worker file, and Work-only status components stay available.

- [ ] **Step 2: Preserve user-visible fallback paths.**

Ensure a failed/abstained attachment or AI stream remains readable as an error/status part with a manual retry or normal text composer path; do not make AI success a prerequisite for sending a message.

- [ ] **Step 3: Verify UI contract tests and compile.**

Run:

~~~powershell
pnpm --dir apps/web test -- src/lib/chat src/components/command-room
pnpm --dir apps/web exec tsc --noEmit
~~~

Expected: v1.5 part/attachment/reducer tests and existing Command Room tests pass without UI import or state type errors.

### Task 5: Verify persistence/API and refresh module graphs

**Files:**
- Verify: \`services/db/src/paax_db/main.py\`, \`models.py\`, \`schemas.py\`
- Verify: \`services/db/alembic/versions/0040_command_room_chat_v15_parts.py\`, \`0041_command_room_chat_queue.py\`
- Verify: \`apps/web/src/app/api/command-room/artifacts/**\`, \`attachments/**\`, \`conversations/**\`, \`chat/control/route.ts\`
- Refresh generated: \`apps/web/graphify-out/\`, \`services/db/graphify-out/\`, \`services/ai-orchestrator/graphify-out/\` as applicable

**Interfaces:**
- Consumes: combined API schemas and migrations.
- Produces: import-clean route modules, migration-chain evidence, and fresh Graphify maps for changed modules.

- [ ] **Step 1: Run focused Python DB tests and import checks.**

~~~powershell
python -m pytest services/db/tests/test_command_room_memory.py services/db/tests/test_contextual_evidence_foundation.py -q
python -m compileall services/db/src/paax_db
~~~

Expected: both tests pass and Python compilation reports no syntax/import error.

- [ ] **Step 2: Refresh affected Graphify graphs after all source edits.**

For each existing module graph, run from the module directory:

~~~powershell
graphify . --code-only --no-viz
graphify cluster-only . --no-viz
~~~

Use \`graphify query\`/\`path\` after refresh to confirm the chat route reaches \`ChatEventStream\`, general tools, conversation routes, and the Work/gateway boundary. Record any graph health warning in the merge report.

- [ ] **Step 3: Audit import paths and missing v1.5 files.**

~~~powershell
$source='D:\\paax-ai-worktrees\\command-room-chat-v1-5'
$worker='D:\\paax-ai-command-room-worker'
git -C $source diff-tree --no-commit-id --name-only -r 6469c89b | ForEach-Object {
  $target = Join-Path $worker $_
  if (-not (Test-Path -LiteralPath $target)) { Write-Output "MISSING $_" }
}
~~~

Expected: no v1.5 path is missing; only backup paths are intentionally additional.

### Task 6: Run the complete verification matrix and write the merge report

**Files:**
- Create: \`docs/ai-map/MERGE_REPORT.md\`
- Modify only if required by failing verification: combined source/test files from Tasks 2–5.

**Interfaces:**
- Consumes: test/build output, v1.5 file audit, backup/checkpoint evidence, Git status, and Graphify freshness.
- Produces: a concise evidence report with exact commands, pass/fail counts, known limitations, and commit/branch identifiers.

- [ ] **Step 1: Run the user-requested full commands exactly.**

~~~powershell
pnpm --filter @paax/ai-orchestrator build
pnpm --dir apps/web exec tsc --noEmit
$env:METERING_ENABLED='0'; pnpm --filter @paax/ai-orchestrator test
pnpm --dir apps/web test
~~~

Expected: every command exits 0. If a command fails, use systematic debugging: capture the full error, trace the boundary/root cause, add or update a focused regression test, make one minimal fix, and rerun the failed command before continuing.

- [ ] **Step 2: Audit requirements line by line.**

Confirm in the report: all 42 v1.5 commit paths present (with the dispatch's 43-file discrepancy explicitly recorded), three backups preserved, all Phase 1-10 directories still present, route split retains Work/runtime/tool executor and v1.5 Chat events/attachments/conversations, migrations are ordered, TypeScript/Python tests pass, and no secret values are printed or committed.

- [ ] **Step 3: Commit the merge result and verify clean status.**

~~~powershell
git add -A
git commit -m "merge: command room chat v1.5 with phase 1-10 worker"
git status --short
git diff --stat HEAD^ HEAD
~~~

Expected: commit succeeds, \`git status --short\` is empty, and the commit contains the merge report plus all intended source/test/migration changes. Do not delete or reset files to make status clean.

- [ ] **Step 4: Push the branch and stop at the PR review gate.**

~~~powershell
git push -u origin merge/command-room-v15-phase1-10-20260818
~~~

Expected: branch is published for owner/Claude review. Do not merge it into \`master\` locally; report the branch, commit SHA, test evidence, and any push/PR blocker.
