# PROMPT CODEX — Commit & PR: Engine Take-off Arsitektur/Tanah (2026-07-02)

> Konteks: Claude selesai mengimplementasikan irisan brain **D4 + §E + §F + §G**
> di engine — paket baru `app/takeoff/` (params §Z, tanah, dinding/finishing,
> arsitektur) + 3 endpoint + mirror Zod + requests.http + 13 test anchor manual.
> Verifikasi Claude HIJAU: pytest **147**, schemas jest **11** + build, web tsc
> OK + vitest **25** + build. Tugasmu HANYA commit + push + draft PR.
> **JANGAN mengubah kode/rumus/angka acuan (Aturan Emas §1 + §9 CLAUDE.md).**

---

## 0. Prasyarat & strategi branch

Kamu sekarang di branch `feat/engine-rebar-bbs` (D3 sudah commit + PR #22).
Pekerjaan take-off baru masih uncommitted DI ATAS branch itu. Buat branch anak
supaya PR-nya stacked bersih di atas #22:

```
git checkout feat/engine-rebar-bbs
git checkout -b feat/engine-takeoff-arsitektur
```

**Base PR = `feat/engine-rebar-bbs`** (BUKAN docs/brain-v4.1-alignment) — supaya
diff PR hanya menampilkan pekerjaan take-off baru, bukan ikut D3.
Kalau checkout ditolak karena konflik → STOP dan lapor.

## Aturan keras

1. **DILARANG** `git add .` / `git add -A` — stage file satu per satu sesuai daftar.
2. **DILARANG** men-stage: `.claude/`, `skills-lock.json`,
   `report/REPORT_UI_CODEX_2026-07-02.md` (itu milik PR #21, bukan branch ini).
3. PR = **draft**, **DILARANG merge**, dilarang push ke `main`/branch docs.
4. Guardrail merah → STOP + lapor, jangan commit.

## Toolchain (PATH non-interaktif)

```powershell
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"
```

---

## Task C1 — Guardrail (WAJIB hijau sebelum commit)

```powershell
cd services/core-engine ; $env:PYTHONUTF8=1
python -m pytest -q                                   # 147 passed
python -c "import app.main"                           # import OK (route /takeoff/* terdaftar)
cd ../.. ; pnpm run test:schemas                      # 11 passed
pnpm --filter "@paax/schemas" build                   # sukses
cd apps/web ; pnpm exec tsc --noEmit -p tsconfig.json ; pnpm test   # 25 passed
```

Kalau ada yang merah → STOP, tulis di report, jangan lanjut commit.

## Task C2 — Commit 1 (engine + schema)

Pesan commit (persis):

```
feat(engine): architectural & earthwork takeoff (brain §E/§F/§G, §Z params)
```

Stage file berikut (eksplisit, satu per satu):
- `services/core-engine/app/takeoff/__init__.py`
- `services/core-engine/app/takeoff/params.py`
- `services/core-engine/app/takeoff/models.py`
- `services/core-engine/app/takeoff/tanah.py`
- `services/core-engine/app/takeoff/dinding.py`
- `services/core-engine/app/takeoff/arsitektur.py`
- `services/core-engine/app/main.py`
- `services/core-engine/tests/test_takeoff.py`
- `services/core-engine/requests.http`
- `packages/schemas/src/index.ts`

> Catatan: JANGAN stage `services/core-engine/app/takeoff/__pycache__/` (folder
> cache). Kalau `.gitignore` belum mencakup `__pycache__/`, cukup jangan
> menstage-nya (jangan tambah aturan gitignore di PR ini).

## Task C3 — Commit 2 (dokumentasi)

Pesan commit (persis):

```
docs: mark brain §E/§F/§G takeoff slice done + Codex prompt
```

Stage file berikut:
- `docs/ai-map/STATE.md`
- `docs/BRAIN_ALIGNMENT.md`
- `docs/prompts/PAAX_CODEX_PROMPT_ENGINE_TAKEOFF.md`
- `report/REPORT_ENGINE_TAKEOFF_CODEX_2026-07-02.md`

Isi report (tulis sendiri sebelum commit): daftar commit + file, hasil
guardrail (angka pytest/jest/tsc/vitest), URL PR, catatan aman. JANGAN hapus
report lama (`REPORT_TKG_*`, `REPORT_ENGINE_D3_*`); biarkan `REPORT_UI_*`
untracked (tidak di-commit di branch ini).

## Task C4 — Push + draft PR

```
git push -u origin feat/engine-takeoff-arsitektur
gh pr create --draft --base feat/engine-rebar-bbs \
  --title "feat(engine): architectural & earthwork takeoff (brain §E/§F/§G)" \
  --body "<ringkasan di bawah>"
```

Isi body PR (ringkas, boleh disalin):

> Irisan brain v4.1 §E/§F/§G + parameter registry §Z (paket baru `app/takeoff/`).
> Semua deterministik, tanpa LLM di jalur hitung; data kurang → `needs_review`
> (bukan tebakan); faktor tanah default tercatat sebagai assumption (RULE-BOE).
>
> - **§F Tanah** (`tanah.py`): galian footplat (ruang kerja w_kerja) + galian
>   menerus (penampang trapesium), urugan kembali = gali − struktur tertanam,
>   urugan pasir/sirtu (V_padat + kebutuhan material × f_susut; anti-dobel bila
>   koef AHSP sudah padat), buangan = (gali − urugan) × f_gembur + ritase.
>   Disiplin BANK/GEMBUR/PADAT tidak dicampur.
> - **§E Finishing** (`dinding.py`): pasangan (deduksi bukaan all|threshold),
>   plester s_sisi, acian (butuh plester), cat × n_lapis, screed.
> - **§G subset** (`arsitektur.py`): pondasi batu belah (trapesium × L),
>   penutup lantai + plin (keliling − Σ lebar pintu), atap miring A/cos θ
>   (θ ∉ [0,90) → review).
> - **Params §Z** (`params.py`): TanahParams/DindingParams/ArsitekturParams —
>   dioverride per request, tercatat di `params_used`.
> - 3 endpoint `/takeoff/tanah|dinding|arsitektur`, mirror Zod
>   (`ManualTakeoffResultSchema` dkk), contoh `requests.http`.
> - **13 test anchor manual** (semua dihitung tangan di docstring
>   `tests/test_takeoff.py`); total pytest 147.
>
> Guardrail: pytest 147 · schemas jest 11 + build · web tsc + vitest 25 + build.

---

## Ringkasan anchor (untuk verifikasi cepat, JANGAN diubah)

| Item | Input | Hasil |
|---|---|---|
| Galian footplat FP1 | 1×1×d1.5, n4, w_kerja0.3 | 15,36 m³ bank |
| Urugan kembali FP1 | struktur 0,5/lubang ×4 | 13,36 m³ bank |
| Buangan FP1 | f_gembur 1,2, kap 4 | 2,4 m³ gembur, ritase 1 |
| Galian menerus GM1 | trapesium 0,6/0,8 × d1 × L20 | 14,0 m³ |
| Urugan pasir UP1 | a12 × t0,05, f_susut1,1 | 0,6 m³ padat (material 0,66) |
| Pasangan D1 (all) | 4×3 − (1,89+1,8+0,36) | 7,95 m² |
| Pasangan D1 (threshold 1,0) | lubang 0,36 tak dikurangi | 8,31 m² |
| Plester/acian D1 | 2 sisi × 7,95 | 15,9 m² |
| Pondasi batu PB1 | trap 0,3/0,6 × h0,7 × L20 | 6,3 m³ |
| Lantai/plin LT1 | 4×5, pintu 1,8 | 20 m² / plin 16,2 m |
| Atap miring AT1 | A100, θ30° | 115,4701 m² |
