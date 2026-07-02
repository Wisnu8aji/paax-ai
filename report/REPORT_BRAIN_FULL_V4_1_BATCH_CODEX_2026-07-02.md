# REPORT BRAIN FULL V4.1 BATCH - CODEX - 2026-07-02

Branch: `feat/brain-full-v4-1-batch`

## Ringkasan

Batch Brain v4.1 dijalankan sebagai irisan engine deterministik, schema/client mirror, UI display, dan workflow audit. Tidak ada angka final yang dihitung di frontend. Tidak ada AHSP, harga, koefisien, profil baja, atau volume missing yang dikarang. Data kurang menghasilkan `needs_review`, warning, atau missing list.

## Yang Dikerjakan

1. F0 data grounding:
   - Audit coverage AHSP/HSD via `GET /data/coverage`.
   - Output missing resources, coverage ratio, dan warnings.

2. Brain audit primitives:
   - ProjectContext, parameter snapshot, assumption ledger, BOE, QA numeric, confidence scoring.
   - Endpoint: `/brain/confidence`, `/brain/qa`, `/brain/boe`.

3. Takeoff finishing plus:
   - F-F06 pemadatan.
   - F-E04 sponningan/tali air.
   - F-E06 trigger kolom/ring praktis sebagai review.
   - F-G02 aanstamping, F-G04 keramik dinding basah, F-G09 plafon/list/rangka, F-G10 waterproofing.

4. Takeoff baja/atap:
   - Baja profil memakai `profile_table` dari request, bukan tabel profil palsu.
   - Atap detail: nok, lisplank, talang, gording, trekstang, ikatan angin, downpipe.

5. Kusen/railing/MEP dasar:
   - Schedule kusen/pintu/jendela, aksesoris, railing.
   - MEP point/route eksplisit; fallback pipa hanya bila parameter disetor.

6. TKG structure advanced:
   - F-C07 dinding beton 2 sisi dikurangi bukaan.
   - F-C08 kolom tempel mengurangi sisi tempel.
   - F-C09 bekisting tangga.
   - F-C10 perancah terpisah dengan anti double-count bila AHSP bekisting sudah include perancah.
   - F-B11 tangga beton memakai `volume_beton_m3` eksplisit; jika tidak ada tetap `needs_review`.
   - UI TKG menampilkan BBS marks, rekap diameter, dan total waste tanpa hitung ulang.

7. WBS/workitems:
   - WBS master D0-D15.
   - Completeness check, expansion element ke WorkItem, implied works.

8. AHSP mapping:
   - Lexical deterministic search, mapping, price binding, unit/included-content warnings.
   - Tidak mengarang AHSP/harga/koefisien.

9. Document intelligence F2:
   - Pipeline text/table/grid ke TKG draft dengan golden fixture.
   - Tetap lokal/deterministik, bukan CV ajaib.

10. Review/eval/export/chat:
   - Endpoint `/review/triage`, `/review/corrections`, `/eval/run`, `/export/boe`, `/export/bbs`.
   - Review priority = `impact_score * uncertainty_score`.
   - Correction log deterministic dan tidak memutasi RAB locked.
   - Eval tolerance pass/fail.
   - Export BOE/BBS JSON preserving fields exactly.
   - Engineering Chat context read-only: jawab dari context/engine; jika data tidak ada, sebut data missing; tidak melakukan aritmetika baru.
   - Review panel ringan di workspace TKG dari item `needs_review` engine.

## Anchor Manual Baru

- F-C07: dinding beton H=3, L=10, bukaan=2 -> 56 m2.
- F-C08: kolom b=0.3, h=0.4, L=3, n=2, sisi tempel=0.4 -> 6 m2.
- F-C09: tangga b=1.2, P=5, t=0.12, optrede=0.17, n=15, bordes=0.8 -> 11.06 m2.
- F-C10: perancah A_pelat=50 + A_balok=12 -> 62 m2 bila AHSP belum include perancah.
- F-B11: tangga `volume_beton_m3=2.4` -> 2.4 m3; detail kurang -> `needs_review`.
- Review priority: 0.9 * 0.5 -> 0.45.
- Eval: 100.02 vs 100 tolerance 0.05 -> pass; 100.2 vs 100 tolerance 0.05 -> fail.
- BOE export: 2 assumptions + 1 missing + 1 warning preserved.
- BBS export: marks, per_diameter, total_waste preserved.

## Guardrail Hasil

- Core engine: `182 passed, 1 warning`.
- Core import: `import-ok`.
- Document intelligence: `2 passed, 1 warning`; import `import-ok`.
- Schemas tests: `11 passed`.
- Schemas build: success.
- Web TypeScript: `tsc --noEmit` success.
- Web vitest: `10 passed`, `30 passed`.
- Web production build: success.
- `git diff --check`: exit 0; hanya warning normal CRLF working-copy Windows.

## Deferred

- BOE/BBS export XLSX belum dibuat. Endpoint JSON sudah tersedia dan menjaga payload persis; XLSX bisa menjadi slice lanjutan setelah format laporan final dikunci.
- Review queue UI saat ini display ringan dari `needs_review` engine. Integrasi penuh dengan persistent review storage/flywheel dataset masih slice lanjutan.

## Catatan Git

- File report lama di folder `report` sudah dihapus sesuai instruksi terbaru.
- File untracked yang tidak terkait tetap dibiarkan di luar commit.

## Laporan Lengkap Akhir

### Tujuan Implementasi

Tujuan batch ini adalah membuat Brain v4.1 mulai hidup sebagai engine deterministik PAAX, bukan sekadar dokumen konsep. Fokusnya adalah membangun jalur kerja yang bisa diaudit: data AHSP/HSD dicek cakupannya, gambar kerja diarahkan menjadi TKG, quantity dihitung oleh engine, pekerjaan turunan dideteksi oleh rules, AHSP/mapping tidak dikarang, review manusia diberi queue, dan chat hanya membaca data yang sudah ada.

### Prinsip Yang Dijaga

- Frontend tidak menghitung angka final volume, biaya, jadwal, atau BBS.
- LLM/chat tidak dipakai di jalur hitung deterministik.
- AHSP, harga satuan, koefisien, profil baja, panjang pipa fallback, dan volume tangga tidak dibuat palsu.
- Bila data kurang, output menjadi `needs_review`, warning, missing resource, atau review task.
- Semua rumus baru punya anchor manual di test.
- Parameter/default yang memengaruhi hasil dicatat sebagai assumption atau `params_used`.
- Export BOE/BBS JSON menjaga payload persis, bukan merangkum ulang.

### Perubahan Engine

- `app/data_audit`: audit coverage AHSP/HSD wilayah.
- `app/brain`: ProjectContext, confidence, QA numeric, BOE.
- `app/takeoff`: perluasan tanah, dinding, arsitektur, baja, atap detail, kusen, railing, dan MEP.
- `app/tkg`: advanced takeoff struktur untuk dinding beton, kolom tempel, tangga, perancah, dan BBS.
- `app/workitems`: WBS D0-D15, completeness, expansion, implied works.
- `app/mapping`: deterministic AHSP search, mapping, price binding.
- `app/review`: review triage dan correction log.
- `app/eval`: eval harness minimal.
- `app/export/boe_exporter.py`: export BOE/BBS JSON.
- `services/document-intelligence/app/tkg`: builder text/table/grid ke TKG draft.

### Endpoint Baru/Diubah

- `GET /data/coverage`
- `POST /brain/confidence`
- `POST /brain/qa`
- `POST /brain/boe`
- `POST /takeoff/baja`
- `POST /takeoff/atap`
- `POST /takeoff/kusen`
- `POST /takeoff/mep`
- `GET /wbs/master`
- `POST /workitems/completeness`
- `POST /workitems/expand`
- `POST /workitems/implied`
- `POST /ahsp/search`
- `POST /ahsp/map`
- `POST /price/bind`
- `POST /review/triage`
- `POST /review/corrections`
- `POST /eval/run`
- `POST /export/boe`
- `POST /export/bbs`

### Perubahan Web dan Schema

- `packages/schemas/src/index.ts` diperluas untuk TKG advanced, manual takeoff, WBS/workitems, AHSP mapping, review, correction, eval, BOE export, dan BBS export.
- `apps/web/src/lib/engine.ts` menambah client typed untuk endpoint audit/review/eval/export baru.
- `TkgWorkspace` sekarang menampilkan BBS marks, rekap per diameter, total waste, dan review queue.
- `Engineering Chat` diperketat: jawab dari context/engine saja; jika data tidak ada, sebut data missing; tidak menghitung angka baru.
- `project-context.ts` bisa menerima BOE, warnings, dan review tasks sebagai context data.

### Test Evidence

- Core engine full test: `182 passed, 1 warning`.
- Document intelligence: `2 passed, 1 warning`.
- Import check core dan document-intelligence: `import-ok`.
- Schema tests: `11 passed`.
- Schema build: success.
- Web TypeScript: success.
- Web vitest: `30 passed`.
- Web production build: success.
- Diff whitespace check sebelum commit: clean.

### Status GitHub

- Branch: `feat/brain-full-v4-1-batch`.
- Draft PR: `https://github.com/Wisnu8aji/paax-ai/pull/24`.
- Base PR: `feat/engine-takeoff-arsitektur`.
- Commit utama batch: `4589e2920888a6942b1b230d0797e4e5c4824764`.
- Author commit: `Wisnu Setyo Aji <Ajiwisnu187@gmail.com>`.
- PR author: `Wisnu8aji`.

### Yang Sengaja Belum Dibuat

- Export BOE/BBS XLSX belum dibuat karena format final laporan belum dikunci. JSON sudah tersedia dan aman untuk audit.
- Review queue belum memakai persistent database/flywheel dataset; saat ini panel ringan dari hasil engine.
- Integrasi full harga real masih bergantung coverage HSD/AHSP. Engine sudah menolak mengarang data kosong.
- Vision/CV gambar kerja belum dibuat sebagai "CV ajaib"; document-intelligence saat ini deterministic text/table/grid to TKG.

### Urutan Review Yang Disarankan

1. Review PR base stack sebelumnya sampai `feat/engine-takeoff-arsitektur` stabil.
2. Review PR #24 dari atas ke bawah: data audit, brain primitives, takeoff, TKG advanced, WBS/workitems, AHSP mapping, document-intelligence, review/eval/export, web/chat.
3. Cocokkan anchor test dengan rumus Brain v4.1 sebelum merge.
4. Setelah merge, lanjut slice XLSX BOE/BBS dan persistent review/flywheel.
