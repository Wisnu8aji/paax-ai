# PAAX Workspace Redesign — Implementation Plan

> Pure visual / mock-data redesign of `apps/web`. No commits during this pass (per user).
> Spec: `docs/superpowers/specs/2026-06-25-paax-workspace-redesign-design.md`.

**Goal:** Restyle all 12 workspace screens + app shell to the `PAAX Workspace.dc.html` design, using a CSS-token design system + shared React components, with mock data only.

**Architecture:** CSS variables + `data-theme` (light/dark/grey) in `globals.css`; `next/font` for Hanken Grotesk + JetBrains Mono; a theme provider; rebuilt shell (icon-rail + nav-panel + topbar); shared `components/ui/*` primitives; all screen content from `lib/mock/workspace.ts`.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind v4, TypeScript strict.

## Global Constraints (must hold every stage)
- **NEVER touch:** `services/core-engine/**`, `data/**`, `packages/schemas/**`,
  `apps/web/src/app/rab-tester/page.tsx`, `apps/web/src/lib/engine.ts`,
  `apps/web/src/lib/core-engine-client.ts`, `apps/web/src/lib/document-intelligence-client.ts`,
  API routes/connectivity, exports, `package.json` scripts, package structure, `.env*`,
  `next.config.ts`, `postcss.config.mjs`, `turbo.json`, CI (`.github/**`), private data.
- No new dependencies. No network/engine calls in redesigned screens.
- Mocked RAB numbers carry a visible "data contoh / placeholder" note (golden rule #1).
- Default theme = light.

---

### Stage 1 — Foundation: tokens, fonts, theme provider
**Create:** `apps/web/src/components/theme/theme-provider.tsx`
**Modify:** `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`
**Must not touch:** any `paax-*` consumer logic beyond restyle; no config files.
**Work:** port `:root` + `[data-theme="dark"]` + `[data-theme="grey"]` vars + keyframes; load fonts via `next/font`; provider sets `data-theme` from `localStorage["paax-theme"]` (default light); remove hardcoded `className="dark"` and the Inter `<link>`.
**Risk:** Medium (global styles, hydration).
**Validate:** `cd apps/web && pnpm exec tsc --noEmit`; app boots; toggling theme persists.
**Rollback:** `git checkout -- apps/web/src/app/globals.css apps/web/src/app/layout.tsx && rm apps/web/src/components/theme/theme-provider.tsx`.

### Stage 2 — App shell
**Create:** `apps/web/src/components/app-shell/icon-rail.tsx`, `nav-panel.tsx`
**Modify:** `apps/web/src/app/(dashboard)/layout.tsx`, `components/app-shell/topbar.tsx`, `components/app-shell/project-switcher.tsx`; replace use of `sidebar.tsx`.
**Must not touch:** route segments; project-switcher behavior/localStorage keys.
**Work:** compose rail + collapsible nav-panel + topbar; active link via `usePathname()`; project-module links target active project else `/proyek`.
**Risk:** Medium (layout wrapper for every page).
**Validate:** `tsc --noEmit`; every route renders inside shell; nav highlights correctly.
**Rollback:** restore `(dashboard)/layout.tsx`, `topbar.tsx`, `project-switcher.tsx`; delete new files; `sidebar.tsx` left intact as fallback.

### Stage 3 — Shared UI primitives
**Create:** `apps/web/src/components/ui/{card,stat-card,badge,button,progress-bar,drawer,modal,empty-state}.tsx`
**Risk:** Low (additive, no consumers yet).
**Validate:** `tsc --noEmit`.
**Rollback:** `rm -rf apps/web/src/components/ui`.

### Stage 4 — Mock workspace data
**Create:** `apps/web/src/lib/mock/workspace.ts` (typed: projects, dashStats, quickActions, warnings, drawingSummary, ahspRows, files, reports, members, notifications, etc.).
**Risk:** Low (data only).
**Validate:** `tsc --noEmit`.
**Rollback:** `rm apps/web/src/lib/mock/workspace.ts`.

### Stage 5 — 12 screen restyles (mock data)
**Modify:** `(dashboard)/page.tsx`, `dashboard/page.tsx`, `proyek/page.tsx`, `gambar-kerja-ai/page.tsx`, `database-ahsp/page.tsx`, `files/page.tsx`, `laporan/page.tsx`, `kolaborasi/page.tsx`, `pengaturan/page.tsx`, `proyek/[projectId]/layout.tsx`, `proyek/[projectId]/page.tsx`, `proyek/[projectId]/rab/page.tsx` (+ placeholder note), `…/schedule/page.tsx`, `…/chat/page.tsx`, `…/site-agent/page.tsx`, `…/gambar-kerja/page.tsx`.
**Must not touch:** `rab-tester/page.tsx`, engine clients. Keep any existing `CoreEngineAPI`/doc-intel imports in place if a page currently calls them — replace presentation only; if removing a broken call, render mock instead (do not delete client files).
**Risk:** Medium-High (most files). Per-screen isolation keeps blast radius small.
**Validate:** `tsc --noEmit`; `pnpm lint`; each route visually matches design.
**Rollback:** per-file `git checkout -- <path>`.

### Stage 6 — Overlays / drawers / modals
**Create:** `apps/web/src/components/app-shell/overlays/{notifications-drawer,apps-drawer,billing-drawer,account-menu,new-project-modal,upload-drawer}.tsx`; wire triggers in rail/topbar/screens.
**Risk:** Medium.
**Validate:** `tsc --noEmit`; open/close via Esc + backdrop; focus trap; body scroll lock.
**Rollback:** `rm -rf apps/web/src/components/app-shell/overlays` + revert trigger wiring.

### Stage 7 — Responsive behavior
**Modify:** shell + screens (Tailwind responsive utilities; nav-panel collapse on small screens; grid → stack).
**Risk:** Low-Medium.
**Validate:** resize 1440/1024/768/375; no horizontal scroll; shell collapses.
**Rollback:** revert touched files.

### Stage 8 — Accessibility
**Modify:** shell + overlays + screens (aria-labels on icon buttons, roles, focus-visible, dialog semantics, alt text, keyboard nav).
**Risk:** Low.
**Validate:** keyboard-only nav of shell + one drawer + modal; `tsc`/`lint`.
**Rollback:** revert touched files.

### Stage 9 — Testing & validation
**Run (no commit):**
- `git diff --name-only`
- `pnpm test` (core-engine + schemas — must stay green, proves engine untouched)
- `cd apps/web && pnpm exec tsc --noEmit`
- `cd apps/web && pnpm lint`
- Playwright smoke (enabled MCP): 12 routes load, nav works, theme toggle persists, one drawer + new-project modal open/close.

### Stage 10 — Final review
Classify the diff (UI-only / mock / config / test / risky); confirm no protected path touched; report safe-to-keep verdict. No commit.

## Self-review
- Spec coverage: stages 1-8 cover every spec section (4 design system, 5 shell, 6 primitives, 7 screens, 8 data, 9 states, plus responsive/a11y). ✓
- No placeholders: file paths exact; rollback per stage. ✓
- Type consistency: primitives (Stage 3) consumed by screens (Stage 5) and overlays (Stage 6). ✓
