# Command Room Codex Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the PAAX Command Room frontend as a full-bleed Codex-style workspace while preserving all working backend and conversation behavior.

**Architecture:** Keep data/state orchestration in the route page, extract pure layout contracts and focused visual components, and move Command Room styling into a scoped stylesheet. Dashboard shell behavior is controlled by a small tested route-layout helper so other pages remain unchanged.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest, Lucide React, React Markdown, CSS custom properties.

## Global Constraints

- Frontend only; do not modify `apps/web/src/app/api/command-room/chat/route.ts` or backend services.
- Use Inter/system sans for every Command Room text role.
- Full-bleed `/command-room`: zero outer margin, zero outer radius, 100dvh, hidden outer rail.
- Preserve Lucent/High/Thinking On defaults and remove Speed from the model menu.
- Preserve all existing conversation, connector, branching, export, run-store, and project-context behavior.
- Use Lucide SVG icons, minimum 44px interaction targets, and `prefers-reduced-motion` support.

---

### Task 1: Test and implement full-bleed dashboard shell mode

**Files:**
- Create: `apps/web/src/components/app-shell/dashboard-shell-mode.test.ts`
- Create: `apps/web/src/components/app-shell/dashboard-shell-mode.ts`
- Modify: `apps/web/src/app/(dashboard)/layout.tsx`

**Interfaces:**
- Produces: `getDashboardShellMode(pathname: string): DashboardShellMode`.
- `DashboardShellMode` contains `isCommandRoom`, `showOuterRail`, `mainMargin`, `mainHeight`, `mainRadius`, and `mainBackground`.

- [ ] **Step 1: Write the failing shell-mode test**

```ts
expect(getDashboardShellMode('/command-room')).toMatchObject({
  isCommandRoom: true,
  showOuterRail: false,
  mainMargin: '0',
  mainHeight: '100dvh',
  mainRadius: '0',
});
expect(getDashboardShellMode('/dashboard').showOuterRail).toBe(true);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @paax/web test -- dashboard-shell-mode.test.ts`

Expected: FAIL because `dashboard-shell-mode` does not exist.

- [ ] **Step 3: Implement the pure shell-mode helper and consume it in layout**

The command route hides `<SideRail />`, removes the existing `18px 28px 0 0` margin and `34px` radius, and uses `100dvh`. Non-command routes preserve current values.

- [ ] **Step 4: Re-run the focused test and verify GREEN**

Run: `pnpm --filter @paax/web test -- dashboard-shell-mode.test.ts`

Expected: PASS.

### Task 2: Test Command Room presentation contracts

**Files:**
- Create: `apps/web/src/components/command-room/command-room-ui.test.ts`
- Create: `apps/web/src/components/command-room/command-room-ui.ts`

**Interfaces:**
- Produces: `clampComposerHeight(value: number): number` with inclusive limits `64..240`.
- Produces: `COMMAND_CONNECTORS` ordered as `gambarKerja`, `rab`, `jadwal`.
- Produces: `COMMAND_MODEL_MENU_ROWS` ordered as `model`, `effort`, `thinking`, `reset`; it must not contain `speed`.

- [ ] **Step 1: Write failing tests for composer clamp, connector order, and model rows**

```ts
expect(clampComposerHeight(20)).toBe(64);
expect(clampComposerHeight(180)).toBe(180);
expect(clampComposerHeight(500)).toBe(240);
expect(COMMAND_CONNECTORS.map((item) => item.id)).toEqual(['gambarKerja', 'rab', 'jadwal']);
expect(COMMAND_MODEL_MENU_ROWS).toEqual(['model', 'effort', 'thinking', 'reset']);
expect(COMMAND_MODEL_MENU_ROWS).not.toContain('speed');
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter @paax/web test -- command-room-ui.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure contracts**

Use immutable exported arrays and `Math.min(240, Math.max(64, value))`.

- [ ] **Step 4: Re-run and verify GREEN**

Run: `pnpm --filter @paax/web test -- command-room-ui.test.ts`

Expected: PASS.

### Task 3: Extend conversation behavior coverage before UI extraction

**Files:**
- Modify: `apps/web/src/lib/chat/chat-history.test.ts`
- Modify only if a failing test exposes a defect: `apps/web/src/lib/chat/chat-history.ts`

**Interfaces:** Existing functions `renameConversation`, `moveConversation`, `setConversationConnectors`, `branchConversation`, and `titleFromMessage`.

- [ ] **Step 1: Add tests for automatic title, connector persistence, move/rename, and branch copy**

Assertions must verify the branch title is `branch-<source title>`, messages are copied by value, and modifying the source connector object cannot mutate the branch.

- [ ] **Step 2: Run and verify tests expose any missing behavior**

Run: `pnpm --filter @paax/web test -- chat-history.test.ts`

Expected: existing correct behavior passes; any discovered defect fails with a specific assertion.

- [ ] **Step 3: Apply only the minimal behavior fix required by failing tests**

Do not change the storage key or stored schema.

- [ ] **Step 4: Re-run and verify GREEN**

Run: `pnpm --filter @paax/web test -- chat-history.test.ts`

Expected: PASS.

### Task 4: Build the scoped Codex visual system

**Files:**
- Create: `apps/web/src/components/command-room/command-room.css`
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/(dashboard)/command-room/page.tsx`

**Interfaces:** `.pax-command` and `cr-*` class names consumed by Command Room components.

- [ ] **Step 1: Add the approved design tokens and component classes**

Implement canvas/sidebar/surface/text/accent tokens, Inter typography, z-index scale, 44px targets, conversation measure, composer resize bounds, menu/panel motion, hover/focus reveal, and responsive breakpoints.

- [ ] **Step 2: Remove the old scoped Command Room style block from globals**

Keep global shell and non-Command-Room styles unchanged. Import `command-room.css` from the route page.

- [ ] **Step 3: Replace Times New Roman and tiny inline typography**

All conversation content becomes 15px Inter/system sans with 1.65 line height. Metadata remains at least 12px.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --filter @paax/web test -- command-room-ui.test.ts chat-history.test.ts`

Expected: PASS.

### Task 5: Extract and restyle the Command Room shell, sidebar, and header

**Files:**
- Create: `apps/web/src/components/command-room/CommandSidebar.tsx`
- Create: `apps/web/src/components/command-room/ConversationHeader.tsx`
- Modify: `apps/web/src/app/(dashboard)/command-room/page.tsx`

**Interfaces:**
- `CommandSidebar` receives conversations, active id, filter/search state, tab state, and callbacks; it owns no persistence.
- `ConversationHeader` receives active conversation/model and callbacks for menu, rename, pin, archive, move, branch, and side-panel toggle.

- [ ] **Step 1: Extract markup without changing callbacks or persistence**

Keep actions delegated to the page so behavior remains identical.

- [ ] **Step 2: Apply Codex hierarchy and interaction dimensions**

Use flat rows, subtle raised active state, a 272px desktop sidebar, a 44px top bar, and the reference overflow menu placement.

- [ ] **Step 3: Verify keyboard labels and focus reveal**

Every icon-only control has `aria-label`; rows reveal actions on hover and `focus-within`.

- [ ] **Step 4: Run web tests**

Run: `pnpm --filter @paax/web test`

Expected: PASS.

### Task 6: Extract and restyle messages, composer, and floating controls

**Files:**
- Create: `apps/web/src/components/command-room/ConversationStream.tsx`
- Create: `apps/web/src/components/command-room/CommandComposer.tsx`
- Create: `apps/web/src/components/command-room/FloatingConversationControls.tsx`
- Modify: `apps/web/src/app/(dashboard)/command-room/page.tsx`

**Interfaces:**
- Stream receives stored messages, pending runs, model name, copy/export callbacks, and stop callback.
- Composer receives draft/model/thinking/effort/project/connectors/attachments state and existing callbacks.
- Floating controls receive `visible`, `busy`, and `onScrollToBottom`.

- [ ] **Step 1: Extract message rendering and preserve ReactMarkdown/run status**

User messages remain raised bubbles; assistant messages remain unboxed. Copy/export and timestamp placement follow the spec.

- [ ] **Step 2: Extract composer and implement adjustable upward growth**

Use the tested `clampComposerHeight`, `resize: vertical`, `min-height: 64px`, and `max-height: 240px`. Render New Project followed by all connector chips.

- [ ] **Step 3: Rebuild the model menu**

Render Model, Effort, Thinking, Reset only. Ultra maps to thinking on; Standard maps to off. Reset maps to existing constants.

- [ ] **Step 4: Add plus rotation and floating-control transitions**

Use transform/opacity and honor reduced motion.

- [ ] **Step 5: Run the focused and full web tests**

Run: `pnpm --filter @paax/web test`

Expected: PASS.

### Task 7: Restyle the task/summary panel and project surfaces

**Files:**
- Create: `apps/web/src/components/command-room/TaskSummaryPanel.tsx`
- Modify: `apps/web/src/app/(dashboard)/command-room/page.tsx`
- Modify: `apps/web/src/components/command-room/command-room.css`

**Interfaces:** Panel receives conversations, active id, current tab, target id, summary callback, and selection callbacks.

- [ ] **Step 1: Extract the panel with existing summary logic unchanged**

- [ ] **Step 2: Apply 312px Codex panel geometry and responsive overlay behavior**

- [ ] **Step 3: Restyle Project view and create-project modal using the same token system**

Avoid card grids with decorative outlines; use quiet surfaces and meaningful separators.

- [ ] **Step 4: Run all web tests**

Run: `pnpm --filter @paax/web test`

Expected: PASS.

### Task 8: Verify build and visual acceptance

**Files:**
- Modify only if verification exposes a defect: files from Tasks 1–7.

- [ ] **Step 1: Run complete frontend tests**

Run: `pnpm --filter @paax/web test`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run production build**

Run: `pnpm --filter @paax/web build`

Expected: exit code 0.

- [ ] **Step 3: Verify local HTTP response**

Run: `Invoke-WebRequest http://127.0.0.1:3000/command-room -UseBasicParsing`

Expected: status 200.

- [ ] **Step 4: Verify visual checklist at desktop, tablet, and mobile**

Confirm full bleed, Codex palette, no Times New Roman, readable sizing, all connectors, model menu without Speed, adjustable composer, message actions/timestamps, floating controls, side panel, overflow menu, branching, and reduced motion.

- [ ] **Step 5: Review diff scope**

Run: `git diff -- apps/web/src/app/(dashboard)/layout.tsx apps/web/src/app/(dashboard)/command-room/page.tsx apps/web/src/app/globals.css apps/web/src/components/command-room apps/web/src/lib/chat/chat-history.test.ts`

Expected: frontend-only Command Room changes; no API/backend modifications.

