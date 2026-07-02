# PROMPT CODEX — Commit & PR: UI Overhaul Workspace Premium (2026-07-02)

> Konteks: Claude sudah selesai mengimplementasikan & memverifikasi overhaul UI
> dashboard (font Outfit/Inter, tema gelap default, settings dialog terpusat 2
> kolom menggantikan 4 drawer). Semua verifikasi HIJAU: `tsc --noEmit` OK,
> vitest 25 passed, `pnpm build` sukses, dialog diuji visual di browser.
> Tugasmu HANYA commit + push + buka draft PR. **JANGAN mengubah kode.**

## Aturan keras

1. **DILARANG** `git add .` / `git add -A`. Tambahkan file satu per satu sesuai daftar di bawah.
2. **DILARANG** commit `.claude/`, `skills-lock.json`, atau file lain di luar daftar.
3. **DILARANG** merge. PR dibuka sebagai **draft**, menunggu review owner + Claude.
4. **DILARANG** push ke `main` atau ke `docs/brain-v4.1-alignment` langsung.
5. Jika guardrail (langkah 2) merah → STOP, tulis laporan, jangan commit.

## Toolchain (PATH non-interaktif)

```powershell
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"
```

## Langkah

### 1. Branch baru dari branch aktif

Working tree saat ini di `docs/brain-v4.1-alignment` dengan perubahan UI belum
ter-commit. Buat branch (perubahan ikut pindah):

```
git checkout -b feat/ui-workspace-premium
```

### 2. Guardrail (wajib hijau sebelum commit)

```powershell
cd apps/web
pnpm exec tsc --noEmit -p tsconfig.json
pnpm test          # ekspektasi: 8 file, 25 test pass
pnpm build         # ekspektasi: sukses
```

### 3. Commit 1 — tipografi & tema

Pesan (persis):

```
feat(web): premium typography & dark-default theme (Outfit/Inter)
```

File:
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/components/theme/theme-provider.tsx`
- `apps/web/src/components/ui/page-header.tsx`

(Catatan: `globals.css` juga memuat CSS `.pax-settings-*` untuk commit 2 —
tidak apa-apa, CSS belum terpakai sampai commit 2.)

### 4. Commit 2 — settings dialog terpusat

Pesan (persis):

```
feat(web): centered tabbed settings dialog replacing side drawers
```

File:
- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/app/(dashboard)/pengaturan/page.tsx`
- `apps/web/src/components/app-shell/shell-context.tsx`
- `apps/web/src/components/app-shell/settings-dialog.tsx` (baru)
- `apps/web/src/components/app-shell/overlays.tsx`
- `apps/web/src/components/app-shell/icon-rail.tsx`
- `apps/web/src/components/app-shell/topbar.tsx`
- `apps/web/src/components/ui/switch.tsx` (baru)
- `apps/web/src/components/ui/index.ts`

### 5. Commit 3 — dokumentasi

Pesan (persis):

```
docs: update STATE + add UI overhaul Codex prompt & report
```

File:
- `docs/ai-map/STATE.md`
- `docs/prompts/PAAX_CODEX_PROMPT_UI_OVERHAUL.md`
- `report/REPORT_UI_CODEX_2026-07-02.md` (tulis dulu: hapus report lama di
  folder itu, ringkas apa yang di-commit, hasil guardrail, URL PR)

### 6. Push + draft PR

```
git push -u origin feat/ui-workspace-premium
gh pr create --draft --base docs/brain-v4.1-alignment \
  --title "feat(web): premium workspace UI — Outfit/Inter, dark default, centered settings dialog" \
  --body "<isi ringkasan di bawah>"
```

Base = `docs/brain-v4.1-alignment` karena PR ini stacked di atas PR #20 (TKG).
Isi body PR: ringkasan perubahan (tipografi Outfit/Inter, tema default gelap,
SettingsDialog 2 kolom dengan 7 tab menggantikan drawer notif/apps/billing/
account, Switch component aksesibel, focus-visible + prefers-reduced-motion),
hasil verifikasi (tsc OK, vitest 25 pass, build sukses), catatan Aturan Emas
(UI hanya preferensi tampilan — tidak ada angka RAB/HSP dihitung di frontend),
dan footer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Ringkasan perubahan (untuk body PR)

- Font: Hanken Grotesk → **Inter** (body) + **Outfit** (display/judul); JetBrains Mono tetap untuk angka.
- Tema default `dark` (pilihan user di localStorage tetap dihormati; 3 tema tetap ada).
- **SettingsDialog** baru: dialog terpusat 2 kolom — menu kiri 7 kategori
  (Umum, Notifikasi, Personalisasi, Aplikasi, Tagihan, Penyimpanan, Akun) dengan
  ikon tipis; panel kanan berisi kontrol (6 toggle notifikasi, select bahasa/zona
  waktu, tema, kepadatan, daftar aplikasi, kredit AI, penyimpanan, akun).
  Preferensi disimpan lokal (`paax-prefs-v1`).
- Drawer notif/apps/billing/account **dihapus** dari `overlays.tsx`; ikon rail +
  topbar kini membuka dialog pada tab yang sesuai. Drawer `upload` + modal
  `newProject` tidak berubah.
- Rail: ikon stroke 1.5 + ikon gear Pengaturan baru; teks vertikal
  "PAAX · WORKSPACE" dan avatar BA dipertahankan.
- A11y: `role="switch"`/`tab`/`tabpanel`, focus-visible ring, `prefers-reduced-motion`.
