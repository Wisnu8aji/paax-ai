# PAAX Workspace Redesign — Design Spec

**Date:** 2026-06-25
**Status:** Approved for planning (implementation not started)
**Scope owner:** apps/web (frontend only)
**Source design:** Claude Design project "PAAX AI UI Redesign" (`e732735b-fa49-49b3-8f43-fc21d6512045`), file `PAAX Workspace.dc.html`

## 1. Summary

Implement the `PAAX Workspace.dc.html` redesign across the existing Next.js app (`apps/web`)
as a **pure visual redesign**. All 12 workspace screens, the app shell (icon rail + nav panel +
topbar), the overlays (drawers/modals), and a 3-theme token system are ported into the app.

This is **front-end only**. The deterministic calculation engine and its data are **not touched**.
All redesigned screens render from **mock/presentational data** in this phase (per explicit
decision). The existing live deterministic path (`rab-tester`) is preserved unchanged.

## 2. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Screen scope | **All 12 screens** in one pass |
| 2 | Styling approach | **CSS tokens in `globals.css` + shared React components**; Tailwind utilities for layout |
| 3 | Data wiring | **Mock everything** (including RAB) for this phase; no new backend/engine calls |
| 4 | Project modules routing | RAB / Schedule / Chat / Site / Gambar stay **project-scoped** under `proyek/[projectId]/…` (existing structure, unchanged) |
| 5 | Theme default | **light**; `dark` and `grey` selectable and persisted |

## 3. Golden-rule & protection constraints (must hold)

These are hard constraints inherited from `CLAUDE.md` and prior agreement. Any change touching
them stops for explicit approval.

- **Do NOT modify**: `services/core-engine/**`, `data/ahsp/**`, `data/harga-satuan/**`,
  `packages/schemas/**`, any API route, env vars, build config, or package structure.
- **Keep intact, do not delete**: `apps/web/src/app/rab-tester/page.tsx`,
  `apps/web/src/lib/engine.ts`, `apps/web/src/lib/core-engine-client.ts`,
  `apps/web/src/lib/document-intelligence-client.ts`. The live deterministic path stays available.
- **Route paths unchanged.** Screens are restyled in place; no route added, removed, or renamed.
- **Mocked RAB numbers are presentational only.** The redesigned RAB & BOQ screen must carry a
  visible "data contoh / placeholder" note so it never implies AI- or engine-computed figures
  (CLAUDE.md golden rule #1). Real numbers continue to come only from the engine via `rab-tester`.
- No secrets added; no `.env` changes.

## 4. Design system

### 4.1 Tokens & themes
Port verbatim into `apps/web/src/app/globals.css`:
- `:root` (light), `[data-theme="dark"]`, `[data-theme="grey"]` CSS-variable sets:
  backgrounds, borders, text, accent, status colors (ok/warn/dng), `--emboss`, `--emboss-sm`,
  rail colors, glass colors, and shadow tokens (`--shadow-card`, `--shadow-hover`, `--shadow-modal`).
- Keyframes: `paxfade`, `paxpulse`, `paxbounce`, `paxspin`.
- Base resets, scrollbar styling, `box-sizing`, font smoothing.

Tailwind v4 stays for layout utilities; it consumes the CSS variables. We do **not** rewrite tokens
into `@theme` in this phase (keeps fidelity with the source's `color-mix()` usage).

### 4.2 Typography
- **Hanken Grotesk** (400/500/600/700/800) — UI text.
- **JetBrains Mono** (400/500/600) — all numeric/monospace values.
- Loaded via `next/font/google` (self-hosted, no layout shift), exposed as CSS variables and set as
  the body font-family, replacing the current font setup.

### 4.3 Theme provider
`components/theme/theme-provider.tsx`:
- Client component; reads/writes `localStorage["paax-theme"]`, applies `data-theme` to the shell
  root element.
- Default `light`. Values: `light | dark | grey`.
- Exposes `useTheme()` (current theme + setter). Avoids hydration mismatch by applying the stored
  theme on mount; SSR renders `light`.
- Toggle surfaced in the account menu and in Pengaturan.

## 5. App shell

Rebuild the existing shell (`apps/web/src/app/(dashboard)/layout.tsx` and
`components/app-shell/*`) into three pieces:

- **`icon-rail.tsx`** — fixed dark rounded rail: PAAX logo (→ dashboard), General/Notifikasi/Apps/
  Billing icon buttons (open respective overlays), vertical "PAAX · WORKSPACE" label, account avatar
  at bottom (opens account menu). Active-state styling per design.
- **`nav-panel.tsx`** — white card panel: traffic-light dots, user header (avatar + name + email),
  grouped nav (`Workspace`: Dashboard, Proyek(3); `Modul Proyek`: Gambar Kerja AI, RAB & BOQ,
  Schedule & Skenario, Engineering Chat, Site Agent; `Lainnya`: File & Dokumen, Database AHSP,
  Laporan & Export, Kolaborasi(4), Pengaturan), AI-credits widget at bottom. Collapsible via topbar
  toggle (animated width/opacity). Active link derived from `usePathname()`.
- **`topbar.tsx`** — nav toggle, search input with ⌘K hint, "AI Ready" pulse pill, notifications
  bell (badge), account avatar.

Nav links: top-level items route to their pages; the 5 project-module items route to the
**active project** (`proyek/[activeProjectId]/<module>`) using the existing project-switcher/local
state; when no project is selected they route to `proyek` (project picker). Existing
`project-switcher.tsx` behavior preserved.

## 6. Shared UI primitives (`apps/web/src/components/ui/`)

Each encapsulates token usage so screens stay declarative:
- `Card` — elevated surface (border + `--shadow-card`), optional emboss variant.
- `StatCard` — label + mono value + sub + status dot.
- `Badge` / `StatusPill` — ok/warn/dng + neutral variants.
- `Button` — primary (accent) / secondary / ghost.
- `ProgressBar` — track + accent fill from a percentage.
- `Drawer` — right-side overlay; Esc + backdrop close; focus-trap; used by notifications,
  connected-apps, billing, account, upload.
- `Modal` — centered overlay (new-project); Esc + backdrop close; focus-trap.
- `EmptyState` — icon + message for empty lists.

## 7. Screens (all render from mock data)

Each maps to an existing route, restyled in place. Layouts follow the source design.

| Screen | Route (unchanged) | Key content |
|--------|-------------------|-------------|
| Dashboard | `(dashboard)/dashboard` | Hero portfolio value + delta, 3 stat cards, Quick Actions (4), Active Projects list, Critical Warnings |
| Proyek | `(dashboard)/proyek` | 4 summary stats + project cards grid (status, type, client, RAB value, progress, warnings/health) |
| Gambar Kerja AI | `(dashboard)/gambar-kerja-ai` | Service-status pill, 4 summary stats, upload/analysis layout |
| RAB & BOQ | `(dashboard)/proyek/[projectId]/rab` | BOQ/RAB tables, HSP breakdown UI, subtotal/PPN/total — **placeholder data + visible "data contoh" note** |
| Schedule & Skenario | `(dashboard)/proyek/[projectId]/schedule` | Schedule/scenario + S-curve visual (mock) |
| Engineering Chat | `(dashboard)/proyek/[projectId]/chat` | Chat thread + composer (mock messages) |
| Site Agent | `(dashboard)/proyek/[projectId]/site-agent` | Site log/progress UI (mock) |
| File & Dokumen | `(dashboard)/files` | File list + upload drawer |
| Database AHSP | `(dashboard)/database-ahsp` | AHSP table (mock rows) |
| Laporan & Export | `(dashboard)/laporan` | Report/export cards (mock) |
| Kolaborasi | `(dashboard)/kolaborasi` | Member/collaboration UI (mock) |
| Pengaturan | `(dashboard)/pengaturan` | Settings incl. theme switcher (light/dark/grey) |

`(dashboard)/proyek/[projectId]/page.tsx` (project overview) and
`proyek/[projectId]/gambar-kerja/page.tsx` are restyled to match but contain no new logic.

`rab-tester` is **not** in this table — left untouched.

## 8. Data flow

- All screen content imported from `apps/web/src/lib/mock/workspace.ts` (typed, single source,
  labelled presentational).
- Numbers formatted with existing `lib/format.ts`.
- No `fetch`, no engine/back-end calls added in redesigned screens. (`rab-tester` keeps its real
  calls.)
- Theme state via `theme-provider`; nav collapse + active-project via existing client state /
  local-storage helpers.

## 9. Error / empty / interaction states

- Lists with no data → `EmptyState`.
- Drawers/modals: closeable by Esc and backdrop click; focus trapped while open; body scroll locked.
- "AI Ready" / "Service Online" pills are static presentational indicators in this phase.

## 10. Testing & verification

- `pnpm test` (core-engine + schemas) stays green — must be unaffected (proof the engine is untouched).
- `cd apps/web && pnpm exec tsc --noEmit` passes (strict TS).
- `pnpm --filter @paax/web lint` passes.
- Playwright smoke (enabled MCP): shell renders; each of the 12 routes loads; nav navigation works;
  theme toggle switches light/dark/grey and persists across reload; one drawer + the new-project
  modal open/close via Esc.
- Manual visual check against the source design screenshots.

## 11. Out of scope (explicitly deferred)

- Any real back-end/engine wiring for the redesigned screens (RAB numbers stay mocked).
- Rebuilding the broken legacy v0.5 client routes.
- Changes to `services/**`, `data/**`, `packages/**`, CI, env, or build config.
- Retiring/merging the legacy engine client or the `rab-tester` page.

## 12. Risks & mitigations

- **Risk:** restyling project pages disturbs existing client wiring (e.g. `CoreEngineAPI` imports).
  **Mitigation:** keep imports/logic, replace only presentation; if a page's current calls are
  already broken against v0.6, leave the call sites intact (mock the rendered data) — do not delete.
- **Risk:** implying mocked RAB numbers are real.
  **Mitigation:** mandatory visible placeholder note on the RAB screen.
- **Risk:** font/token swap causes regressions elsewhere.
  **Mitigation:** tokens are additive in `globals.css`; verify `tsc`, lint, and Playwright smoke.
