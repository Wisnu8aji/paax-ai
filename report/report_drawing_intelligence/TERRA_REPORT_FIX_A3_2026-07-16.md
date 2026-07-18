# TERRA Report — Fix A3 (F1, F7) — 2026-07-16

Scope terbatas pada `services/document-intelligence/app/project_graph/cross_sheet_resolver.py`
dan regresinya di `tests/test_project_graph_synthesis.py`. Tidak ada perubahan pada
`services/db`, `apps/web`, atau `packages/schemas` dari pekerjaan ini.

## F1 — qualified roof title

- **Merah:** `python -m pytest tests/test_project_graph_synthesis.py -q -k
  'qualified_roof_title or duplicate_ambiguous_level_facts'` gagal karena
  occurrence yang diharapkan pada `Lantai Atap P +16.20` tidak ada (jalur lama
  membuat occurrence `Atap`).
- **Hijau:** kandidat dari judul sekarang hanya memakai kandidat fakta level yang
  telah dikanonisasi bila judul memuat kualifier; fallback judul polos tetap
  tersedia. Qualified roof tetap menempel ke `Lantai Atap P +16.20` dengan
  status `ambiguous`, bukan `Atap` inferred.

## F7 — deduplikasi metadata review

- **Merah:** reproduksi dua fakta identik menghasilkan occurrence berstatus
  `cross_sheet_inferred`, bukan `ambiguous`.
- **Hijau:** deduplikasi menggabungkan aliases, nilai properties secara union
  konservatif, dan `requires_review` dengan OR. Reproduksi dua fakta qualified
  roof kini menghasilkan occurrence `ambiguous` serta mempertahankan
  `merged_from` pada node level.

## Verifikasi

- Target F1/F7: **2 passed**.
- `tests/test_project_graph_synthesis.py`: **32 passed**.
- `python -m pytest -q` dari `services/document-intelligence`: **431 passed,
  5 skipped, 2 warnings**. Baseline yang diberikan adalah 429 passed, 5 skipped;
  kenaikan dua test adalah regresi F1 dan F7 yang ditambahkan di sini.
- `graphify update .`: selesai; graph diperbarui.

Tidak ada perubahan anchor real-fixture; tidak ada benchmark `services/db` karena
scope tidak menyentuh database.
