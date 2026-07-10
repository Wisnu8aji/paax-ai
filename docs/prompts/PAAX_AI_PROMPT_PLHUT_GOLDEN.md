# PROMPT SAYA — Commit: Golden Anchor TKG PLHUT (2026-07-03, lanjutan PR #25)

> Saya menambahkan golden anchor dari GAMBAR KERJA PLHUT ASLI (grid nyata,
> hitungan kolom nyata dari denah, tabel kolom nyata; footplat tanpa tebal =
> bukti no-guess pada data nyata). pytest total **198 passed**. Tugasmu HANYA
> commit + push ke branch `task/brain-v4.1-tkg-implementation` (PR #25 sudah
> terbuka — commit ini otomatis masuk). **JANGAN ubah kode/angka.**

## Langkah
1. Guardrail: `cd services/core-engine ; $env:PYTHONUTF8=1 ; python -m pytest -q`
   → harus **198 passed**. Merah = STOP + lapor.
2. Commit (stage HANYA file ini — dilarang `git add .`):
   - `services/core-engine/tests/test_plhut_golden.py`
   - `docs/prompts/PAAX_SAYA_PROMPT_PLHUT_GOLDEN.md`

   Pesan (persis):
   ```
   test(engine): PLHUT golden anchors from real drawings (grid, kolom, no-guess footplat)
   ```
3. `git push` (branch sudah tracking origin). Jangan buka PR baru — sudah ada
   PR #25. Update report `report/REPORT_PLHUT_COMMIT_SAYA_2026-07-03.md`
   (tambah bagian "Golden Anchor") boleh digabung dalam commit yang sama.
4. TETAP dilarang: commit `excel_extracted.txt` / `pdf_extracted.txt` /
   `.saya/` / `skills-lock.json`.

## Catatan penting untuk owner (tulis juga di report):
Commit `790b2ee` (sesi batch sebelumnya) terlanjur men-track `.saya/skills/`
(35 file skill pihak ketiga) + `skills-lock.json` + `.saya/launch.json` —
melanggar aturan "jangan commit .saya/". JANGAN perbaiki sendiri tanpa
persetujuan owner (butuh `git rm -r --cached` + entri `.gitignore`); tunggu
keputusan di review PR #25.
