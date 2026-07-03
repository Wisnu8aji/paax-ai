# PROMPT CODEX — Commit & PR: UI Premium Redesign Medium Grey (2026-07-03)

> Konteks: Claude sudah selesai mengimplementasikan & memverifikasi rombak
> besar UI/UX workspace (spek owner: `G:\Design\prompt\PAAX_PLAN_SESI_DESAIN_PREMIUM_2026-07-03.txt`):
> tema **Medium Grey** default + glassmorphism, logo/wordmark SVG dari brand
> sheet PAAX, konsolidasi sidebar (rail = tool global + gear; panel = konteks
> kerja; nol menu ganda), dashboard bisnis dengan chart SVG (KPI, donut status,
> bar progres, kolom RAB, ring health), Engineering Chat premium (riwayat +
> Project Percakapan lokal, tombol + konektor GDrive/Gmail "segera", lampiran,
> Thinking…/Thinking more…/Thinking almost done… berkedip), hapus halaman
> Uji RAB, `/pengaturan` jadi redirect ke dialog terpusat.
> Verifikasi HIJAU: `tsc --noEmit` OK · vitest **30 passed (10 file)** ·
> `pnpm build` sukses (route `/rab-tester` hilang) · uji interaktif browser
> (tema 3 arah, dialog kaca, chat kirim+riwayat, menu +, redirect pengaturan).
> Aturan Emas aman: chart hanya MENAMPILKAN metadata/cache engine; komentar
> penegasan ada di `dashboard-charts.tsx` & `dashboard/page.tsx`.
> Tugasmu HANYA commit + push + buka draft PR. **JANGAN mengubah kode.**

## Aturan keras

1. **DILARANG** `git add .` / `git add -A`. Tambahkan file satu per satu sesuai daftar.
2. **DILARANG** commit `.claude/`, `skills-lock.json`, `excel_extracted.txt`, `pdf_extracted.txt`.
3. **DILARANG** merge. PR dibuka sebagai **draft**, menunggu review owner + Claude.
4. **DILARANG** push ke `main`.
5. Jika guardrail merah → STOP, tulis laporan, jangan commit.

## Toolchain (PATH non-interaktif)

```powershell
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"
```

## Langkah

### 1. Branch

Working tree sudah di branch `feat/ui-premium-redesign` (dibuat Claude dari
`main`). Pastikan: `git branch --show-current` → `feat/ui-premium-redesign`.
Catatan: dua penghapusan (`rab-tester/page.tsx`, `sidebar.tsx`) sudah ter-stage.

### 2. Guardrail (wajib hijau sebelum commit)

```powershell
cd apps/web
pnpm exec tsc --noEmit -p tsconfig.json
pnpm test          # ekspektasi: 10 file, 30 test pass
pnpm build         # ekspektasi: sukses, TANPA route /rab-tester
```

### 3. Stage file (persis daftar ini)

```
git add apps/web/.env.example
git add "apps/web/src/app/(dashboard)/dashboard/page.tsx"
git add "apps/web/src/app/(dashboard)/pengaturan/page.tsx"
git add "apps/web/src/app/(dashboard)/proyek/[projectId]/chat/page.tsx"
git add apps/web/src/app/globals.css
git add apps/web/src/components/app-shell/icon-rail.tsx
git add apps/web/src/components/app-shell/nav-panel.tsx
git add apps/web/src/components/app-shell/route-prefetch-routes.ts
git add apps/web/src/components/app-shell/settings-dialog.tsx
git add apps/web/src/components/app-shell/topbar.tsx
git add apps/web/src/components/drawings/drawing-intelligence-workspace.tsx
git add apps/web/src/components/rab/s-curve-chart.tsx
git add apps/web/src/components/theme/theme-provider.tsx
git add apps/web/src/components/ui/drawer.tsx
git add apps/web/src/components/ui/modal.tsx
git add apps/web/src/lib/format.ts
git add apps/web/src/lib/mock/workspace.ts
git add apps/web/src/components/brand/paax-logo.tsx
git add apps/web/src/components/charts/dashboard-charts.tsx
git add apps/web/src/lib/chat/chat-history.ts
git add docs/ai-map/STATE.md
git add docs/prompts/PAAX_CODEX_PROMPT_UI_PREMIUM_REDESIGN.md
```

(Penghapusan `apps/web/src/app/rab-tester/page.tsx` dan
`apps/web/src/components/app-shell/sidebar.tsx` sudah ter-stage otomatis.)

### 4. Commit (boleh dipecah 2 jika mau: feat UI + docs)

```
feat(web): premium redesign medium grey — glass shell, dashboard charts, chat history

- Tema default Medium Grey (#A6A6AA) + token gold/bronze & palet chart dari brand sheet
- Glassmorphism: nav panel, topbar, modal, drawer, settings dialog, KPI card, dropdown
- Logo & wordmark PAAX SVG (components/brand/paax-logo.tsx) menggantikan teks rail
- Konsolidasi nav: rail = File/AHSP/Laporan/Kolaborasi + gear; panel = Workspace + Modul;
  hapus sidebar.tsx legacy (dead code) & semua menu ganda Pengaturan/Notifikasi
- Dashboard bisnis: 4 KPI glass + donut status + bar progres + kolom nilai RAB + ring
  health + warning — semua chart display-only atas metadata/cache engine (Aturan Emas)
- Engineering Chat: riwayat & Project Percakapan (localStorage), tombol + (GDrive/Gmail
  segera, tambah file/foto), lampiran chip, Thinking bertingkat berkedip ala Claude
- Hapus halaman Uji RAB (v0.6); /pengaturan → redirect dialog terpusat
- drawing-intelligence-workspace.tsx (43 titik legacy indigo/paax-*) di-port ke Card/Button/StatusPill + token gold; halaman /gambar-kerja-ai & /proyek/:id/gambar-kerja nol kelas legacy
- tabular-nums untuk semua angka; kurva S recolor token bronze

Verifikasi: tsc OK · vitest 30 · build sukses · uji interaktif browser
Spek: G:\Design\prompt\PAAX_PLAN_SESI_DESAIN_PREMIUM_2026-07-03.txt
```

### 5. Push + Draft PR

```
git push -u origin feat/ui-premium-redesign
gh pr create --draft --base main --title "feat(web): UI premium redesign — medium grey glass workspace" --body "<ringkas dari pesan commit; sebutkan verifikasi hijau + patuh Aturan Emas>"
```

### 6. Laporan

Tulis: hasil guardrail, SHA commit, URL PR. Jangan merge.
