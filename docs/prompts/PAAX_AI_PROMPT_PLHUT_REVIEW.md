# PROMPT SAYA — Commit & PR: Review PLHUT + Triage UI + Data Surakarta (2026-07-03)

> Saya selesai me-review & MEMPERBAIKI hasil sesi PLHUT-mu (rincian:
> `report/REVIEW_SAYA_PLHUT_2026-07-03.md`) + membangun Triage UI + data
> harga Surakarta. Guardrail HIJAU: pytest 193, schemas 11+build, tsc,
> vitest 30, build. Tugasmu HANYA commit + push + draft PR di branch aktif
> `task/brain-v4.1-tkg-implementation`. **JANGAN ubah kode/angka acuan.**

## Aturan keras
1. DILARANG `git add .`/`-A`; stage eksplisit sesuai daftar.
2. DILARANG stage: `.saya/`, `skills-lock.json`, `excel_extracted.txt`,
   `pdf_extracted.txt` (data proyek mentah — jangan masuk repo).
3. **HAPUS** `scratch_extract.py` (digantikan `services/core-engine/scripts/
   extract_harga_surakarta.py`) — ikutkan penghapusan bila file terlanjur
   ter-track; kalau untracked cukup hapus dari disk.
4. PR **draft**, JANGAN merge, jangan push ke main.

## Guardrail dulu (wajib hijau)
```powershell
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"
cd services/core-engine ; $env:PYTHONUTF8=1 ; python -m pytest -q   # 193
cd ../.. ; pnpm run test:schemas ; pnpm --filter "@paax/schemas" build
cd apps/web ; pnpm exec tsc --noEmit -p tsconfig.json ; pnpm test    # 30
```

## Commit 1 — `fix(engine): harden PLHUT modules — SMKK rules, reuse_form, MEP validation`
- `services/core-engine/app/tkg/params.py`
- `services/core-engine/app/tkg/takeoff.py`
- `services/core-engine/app/takeoff/smkk.py`
- `services/core-engine/app/takeoff/mep_advanced.py`
- `services/core-engine/app/takeoff/models.py`
- `services/core-engine/app/main.py`
- `services/core-engine/tests/test_plhut_anchor.py`
- `packages/schemas/src/index.ts`
- `services/document-intelligence/app/api/pdf_routes.py`

## Commit 2 — `feat(web): interactive triage review panel for needs_review items`
- `apps/web/src/components/review/triage-panel.tsx` (baru)
- `apps/web/src/components/drawings/tkg-workspace.tsx`

## Commit 3 — `feat(data): Surakarta price book extractor from PLHUT RAB`
- `services/core-engine/scripts/extract_harga_surakarta.py` (baru)
  (output `surakarta.json` ada di `G:\paax-data` — DI LUAR repo, jangan commit)

## Commit 4 — `docs: PLHUT session reports + Saya critical review`
- `report/ANALISIS_PLHUT_DAN_TASK_LANJUTAN.md`
- `report/PROMPT_UNTUK_SAYA.md`
- `report/REPORT_PLHUT_SAYA_SESSION.md`
- `report/REVIEW_SAYA_PLHUT_2026-07-03.md`
- `docs/prompts/PAAX_SAYA_PROMPT_PLHUT_REVIEW.md`
- `report/REPORT_PLHUT_COMMIT_SAYA_2026-07-03.md` (tulis: hasil guardrail + URL PR)

## Push + PR
```
git push -u origin task/brain-v4.1-tkg-implementation
gh pr create --draft --base main \
  --title "feat: brain v4.1 TKG implementation + PLHUT hardening (SMKK/MEP/reuse_form/triage UI)" \
  --body "<ringkas dari report/REVIEW_SAYA_PLHUT_2026-07-03.md §1-2 + hasil guardrail>"
```
Catatan body PR: sebutkan bahwa branch ini memuat batch engine brain v4.1 +
sesi PLHUT + perbaikan review Saya; stack PR lama (#20/#21/#22) di-supersede
sebagian oleh branch ini — keputusan merge di owner.
