# PROMPT CODEX — Commit & PR: Engine D3 Besi Lanjutan + BBS (2026-07-02)

> Konteks: Claude selesai mengimplementasikan irisan D3 brain v4.1 di engine:
> F-D02 penuh (kait + lewatan), F-D04 pinggang, F-D06 waste_mode, F-D08 BBS,
> + mirror Zod + 8 test anchor manual. Verifikasi HIJAU: pytest 134, jest 11,
> vitest 25, tsc OK, build OK. Tugasmu HANYA commit + push + draft PR.
> **JANGAN mengubah kode/rumus/angka acuan (Aturan Emas §1 + §9 CLAUDE.md).**

## ⚠️ URUTAN — jalankan SETELAH `PAAX_CODEX_PROMPT_UI_OVERHAUL.md` selesai

Prompt UI membuat branch `feat/ui-workspace-premium` dan meng-commit file UI.
Perubahan engine D3 (daftar di bawah) sengaja TIDAK ikut di sana dan masih
uncommitted. Setelah prompt UI selesai (sudah push + PR):

```
git checkout docs/brain-v4.1-alignment
git checkout -b feat/engine-rebar-bbs
```

(File engine yang masih modified akan ikut pindah — itu memang yang mau
di-commit di sini. Kalau checkout ditolak karena konflik, STOP dan lapor.)

## Aturan keras

1. **DILARANG** `git add .` / `git add -A` — tambah file satu per satu.
2. **DILARANG** commit `.claude/`, `skills-lock.json`.
3. PR = **draft**, **DILARANG merge**, dilarang push ke `main`/branch docs.
4. Guardrail merah → STOP + lapor, jangan commit.

## Toolchain

```powershell
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"
```

## Guardrail (wajib hijau sebelum commit)

```powershell
cd services/core-engine ; $env:PYTHONUTF8=1
python -m pytest -q                    # ekspektasi: 134 passed
cd ../.. ; pnpm run test:schemas       # 11 passed
pnpm --filter "@paax/schemas" build    # sukses
cd apps/web ; pnpm exec tsc --noEmit -p tsconfig.json ; pnpm test   # 25 passed
```

## Commit 1 — engine + schema

Pesan (persis):

```
feat(engine): rebar hooks, laps, side bars & BBS takeoff (F-D02/D04/D06-D08)
```

File:
- `services/core-engine/app/tkg/params.py`
- `services/core-engine/app/tkg/takeoff.py`
- `services/core-engine/tests/test_tkg.py`
- `packages/schemas/src/index.ts`

## Commit 2 — dokumentasi

Pesan (persis):

```
docs: mark brain D3 slice done (STATE, BRAIN_ALIGNMENT) + Codex prompt
```

File:
- `docs/BRAIN_ALIGNMENT.md`
- `docs/ai-map/STATE.md` (diff tersisa = bagian D3 saja; bagian UI sudah
  ter-commit di branch UI)
- `docs/prompts/PAAX_CODEX_PROMPT_ENGINE_D3.md`
- `report/REPORT_ENGINE_D3_CODEX_2026-07-02.md` (tulis: apa yang di-commit,
  hasil guardrail, URL PR)

## Tugas C2 (opsional, mekanis) — contoh requests.http

Tambah di `services/core-engine/requests.http` satu contoh `POST /tkg/takeoff`
dengan `params` baru:

```json
{ "tinggi_per_lantai_m": 3.5, "k_hook_utama": 12, "n_ld": 40,
  "l_stock_m": 12, "waste_mode": "bbs" }
```

Body dokumen sama dengan contoh takeoff yang sudah ada. Beri komentar anchor:
K1 (8D16, 3.5 m, kait 12d) → pokok per instance 49.0421 kg (lihat
`tests/test_tkg.py` docstring "Anchor D3"). Bila menambah ini, ikutkan
`requests.http` di Commit 1.

## Push + draft PR

```
git push -u origin feat/engine-rebar-bbs
gh pr create --draft --base docs/brain-v4.1-alignment \
  --title "feat(engine): rebar hooks/laps + BBS takeoff (brain D3, F-D02/D04/D06-D08)" \
  --body "<ringkasan di bawah>"
```

Isi body PR: ringkasan (kait k_hook_utama×d per ujung; lewatan n_lap =
ceil(L_bat/l_stock)−1 dgn lap = n_ld×d; lewatan dibutuhkan tanpa n_ld →
needs_review, bukan diabaikan; pinggang F-D04; waste_mode param|bbs dengan
guard AP-16 di validator; BBS F-D08: marks + kebutuhan stok + waste nyata per
diameter, batang > stok dipecah, elemen review tidak menyumbang potongan;
mirror Zod BbsResultSchema + param baru), hasil guardrail, catatan "semua
anchor dihitung manual (docstring test)", footer
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
