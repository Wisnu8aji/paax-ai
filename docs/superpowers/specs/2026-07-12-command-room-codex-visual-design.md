# PAAX Command Room Codex Visual Design

## Objective

Transform the existing PAAX Command Room frontend into a full-bleed Codex-style workspace while preserving the working chat backend, run store, conversation persistence, project context, and model routing.

The visual source of truth is `G:\Dashboard\Command room` plus the user's latest PAAX screenshot. The latest screenshot describes the current implementation, not the target. The target removes the visible top and right shell gaps and adopts the visual language of the Codex references throughout.

## Scope

Frontend only:

- Dashboard shell behavior for `/command-room`.
- Command Room sidebar, header, conversation stream, composer, menus, floating controls, project view, and side panel.
- Command Room typography, colors, spacing, radii, icons, and motion.
- Frontend interaction tests and visual verification.

Out of scope:

- `/api/command-room/chat` behavior and model provider routing.
- Core Engine, Document Intelligence, database schemas, and project repositories.
- Global redesign of non-Command-Room dashboard pages.

## Approved Direction

The Command Room must match Codex as a coherent application surface, not as a collection of isolated dark cards. It uses Inter/system sans everywhere, including conversation content. The previous Times New Roman treatment is removed.

The page is full-bleed at `100dvh` and fills the top, right, and bottom edges. The outer PAAX icon rail is hidden on `/command-room`; navigation remains available through the Command Room's own left sidebar. Other dashboard routes keep their existing shell.

## Design Tokens

The Command Room owns a scoped token set under `.pax-command`:

- `--cr-canvas: #181818` — main workspace.
- `--cr-sidebar: #121212` — left navigation.
- `--cr-surface: #222222` — active rows and floating controls.
- `--cr-surface-raised: #2b2b2b` — composer and menus.
- `--cr-surface-hover: #303030` — hover/pressed state.
- `--cr-text: #f5f5f5` — primary text.
- `--cr-text-muted: #a6a6a6` — secondary labels.
- `--cr-text-subtle: #737373` — metadata.
- `--cr-border: rgba(255,255,255,.10)` — deliberate separators only.
- `--cr-accent: #f26b38` — PAAX/Codex orange for active reasoning and status.
- Radius scale: `8px`, `12px`, `16px`, `22px`, and pills only for chips/floating controls.
- Type scale: 12px metadata, 13px labels, 14px controls, 15px body, 16px primary navigation, 20px section title.
- Motion: 160ms hover/press, 220ms menus, 280ms panels, using `cubic-bezier(.2,.8,.2,1)` and transform/opacity only.

No white outlines are used around controls. Borders appear only where Codex references use separation, such as the top bar, menu edge, or composer boundary.

## Layout

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Sidebar 272 │ Conversation title ···              model     panel toggle │
│             ├────────────────────────────────────────────────────────────┤
│ New task    │                                                            │
│ Search      │            readable conversation column                   │
│ Scheduled   │            max-width 820px                                 │
│ History     │                                                            │
│             │              ↓ / generating indicator                     │
│ Conversations                                                           │
│             │  [New project] [Gambar Kerja] [RAB] [Schedule]            │
│ Profile     │  ┌──────────────────────────────────────────────────────┐  │
│             │  │ Growing prompt area                                │  │
│             │  │ +  Ultra   Lucent · Thinking On · High  mic  send  │  │
│             │  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

Desktop uses a 272px sidebar and a fluid main area. The conversation column grows to 820px so the page feels wider than the current 760px layout while preserving readable line length. The optional right panel is 312px and overlays below 1180px instead of crushing the conversation.

At tablet widths the sidebar becomes 232px. Below 820px it becomes a temporary drawer and the main area uses full width. Touch targets stay at least 44px.

## Components

### CommandRoomShell

Owns full-bleed layout, left sidebar, main workspace, and optional right panel. It does not own chat state.

### CommandSidebar

Recreates the Codex navigation hierarchy: Home/Project segmented navigation, New task, Search, Scheduled, History, conversation groups, and profile. Rows use flat surfaces, no card outlines, 44px interaction targets, subtle hover, and action reveal.

### ConversationHeader

Shows the conversation title derived from the first prompt, the overflow menu, active model label, and right-panel toggle. The overflow menu contains pin, rename, archive, move to project, and open new branch. Branching keeps the copied history and prefixes the title with `branch-`.

### ConversationStream

Uses 15px Inter/system sans at 1.65 line-height. User prompts use a quiet raised bubble; assistant answers remain unboxed. Copy and export-to-TXT actions appear near each message. The timestamp sits on the opposite side and fades in when the message row is hovered or keyboard-focused.

### CommandComposer

Matches the rounded Codex composer reference. New Project sits above-left, and active connector chips flow to its right in the order Gambar Kerja, RAB, Schedule. The textarea grows upward from 64px to 240px and supports drag resizing between those limits. The plus icon rotates when its menu opens.

The model menu contains Model, Effort, Thinking, and Reset to default. There is no Speed row. Reset sets Lucent, High, Thinking On. The primary reasoning toggle reads Ultra when on and Standard when off.

### FloatingConversationControls

When the user scrolls upward, a circular down-arrow control appears. If generation is active, it becomes a compact animated generation indicator. Either control scrolls smoothly to the bottom/running response.

### TaskSummaryPanel

Slides from the right. Task lists active conversations; Summary lets the user select a conversation and produces the existing local summary. The panel toggle remains in the top-right header.

## Interaction and Motion

- Hover/press states never move surrounding layout.
- Menus scale from 0.98 and fade in over 180–220ms.
- Side panel translates 20px and fades over 260–280ms.
- The plus icon rotates 45 degrees when open and returns smoothly when closed.
- Composer height changes use a spring-like easing but remain directly adjustable by the user.
- Scroll controls fade/scale into place and remain interruptible.
- Running indicators may animate continuously; decorative elements may not.
- `prefers-reduced-motion: reduce` disables nonessential transitions and smooth scrolling.

## Accessibility

- All icon-only buttons have `aria-label` and visible focus treatment.
- Menus expose `aria-expanded`, `role=menu`, and `role=menuitem`.
- Touch targets are at least 44px even when the visible glyph is smaller.
- Normal text meets 4.5:1 contrast; metadata meets at least 3:1.
- Hover-revealed actions are also revealed by `:focus-within`.
- Side panel and menu layers use a documented z-index scale: header 20, float 30, menu 50, modal 80.

## Testing

- Unit-test the command-room shell mode so `/command-room` hides the outer rail and removes all shell margins/radii.
- Unit-test composer height clamping and default model display values.
- Extend conversation tests for automatic titles, connectors, rename, move, and branch copying.
- Run the Command Room-focused Vitest suite, full web test suite, and Next.js build.
- Verify at 1440×900, 1024×768, and 375×812, including reduced motion.

## Acceptance Criteria

- No top/right gap is visible around Command Room.
- No Times New Roman remains in Command Room.
- The palette, control shape, spacing, and menu treatment visibly match the Codex reference folder.
- Existing chat submission and streaming remain intact.
- New Project and all three connector states are visible in one horizontal flow when space permits.
- Model menu has no Speed row and reset returns Lucent/High/Thinking On.
- Scroll-to-bottom, generation indicator, copy, TXT export, timestamps, top menu, side panel, and branching remain usable.
- The UI uses no decorative white outlines around shapes.
- Motion is smooth, restrained, and reduced-motion compatible.

