# PROMPT CODEX — Task R4: Golden-Anchor Document-Intelligence + Eval Per-Skill AI-Assist

> Ditulis Claude, 2026-07-07, reasoning tinggi. Bagian dari
> `docs/prompts/PAAX_CODEX_ROADMAP_10_TASKS_NON_UI_2026-07-07.md` (Task 4).
> **Mandiri** — tidak bergantung task lain, boleh branch baru dari `main`
> kapan saja. Referensi rezim testing: `docs/specs/brain-v4.1/
> PAAX_BRAIN_03_SKILL_API_PIPELINE_DATA.txt` §6 (T-01–T-08), dirujuk
> `CLAUDE.md` §2.

---

## 0. Konteks — apa yang SUDAH ada vs yang HILANG (verifikasi dulu)

`services/core-engine/tests/` **SUDAH PUNYA** golden-anchor PLHUT yang
matang: `test_plhut_golden.py`, `test_plhut_anchor.py`,
`test_plhut_hsp_golden.py`, `test_plhut_rab_golden.py`,
`test_plhut_surakarta_pricebook.py` — semua dengan nilai acuan dihitung
manual dari `GAMBAR KERJA PLHUT SURAKARTA.pdf` asli. **BACA file-file ini
dulu** sebagai pola/gaya yang harus diikuti (komentar berisi rujukan
halaman PDF + perhitungan manual eksplisit).

`services/document-intelligence/tests/fixtures/perception/
plhut_spans.json` + `_generate_plhut_spans.py` **SUDAH ADA** (span teks
PLHUT nyata, hasil ekstraksi PyMuPDF) tapi **TIDAK ADA test yang memakainya
sebagai golden snapshot pipeline penuh** (consolidate → work-items) —
inilah gap yang task ini tutup. Yang ADA baru test unit terpisah
(`test_perception_assemble.py`, `test_tkg_builder.py`) yang memakai fixture
itu untuk kasus sempit, BUKAN snapshot menyeluruh yang di-diff eksplisit
tiap perubahan pipeline.

**Ingatan ATURAN owner (WAJIB dipatuhi)**: PLHUT = kunci uji di `tests/`,
**JANGAN PERNAH** ditanam jadi logika/template produksi (`CLAUDE.md` implisit
+ memory owner "PLHUT = fixture bukan template" — pipeline harus tetap
general ke gambar APAPUN, PLHUT hanya alat ukur regresi).

---

## 1. Scope task ini

### 1.1 Golden snapshot document-intelligence (BARU)

`tests/test_golden_plhut_pipeline.py` — muat `plhut_spans.json`, jalankan
pipeline **PENUH** yang benar-benar dipakai produksi:
`assemble` (atau titik masuk setara dari spans yang sudah diekstrak —
VERIFIKASI dulu fungsi mana yang menerima span-level fixture ini, cek
`_generate_plhut_spans.py` untuk tahu format persis & test yang sudah
memakainya) → `consolidate_document()` → `build_work_items()`. Simpan
**snapshot hasil** (jumlah elemen per kategori, jumlah `perlu_review` vs
`dihitung` vs `belum_didukung`, total assumption/warning) sebagai
fixture JSON baru `tests/fixtures/perception/plhut_golden_snapshot.json`.
Test membandingkan hasil pipeline SAAT INI byte-demi-byte (atau
field-demi-field terstruktur, lebih baik dari raw diff) dengan snapshot
itu — **kalau berbeda, test GAGAL dengan pesan jelas field mana yang
berubah** (bukan hanya "assert equal" polos — buat diff terstruktur,
mis. pakai `deepdiff` KALAU sudah ada di dependency, ATAU tulis komparator
manual per-field kalau tidak ingin dependency baru — putuskan sendiri,
laporkan pilihan & alasannya).

**Kapan snapshot BOLEH diperbarui**: HANYA kalau perubahan pipeline
disengaja & sudah direview manusia (mis. Task R1 menambah bridging
kategori baru yang mengubah jumlah `dihitung`) — regenerasi snapshot lewat
skrip `tests/fixtures/perception/_regenerate_golden_snapshot.py` (baru,
pola sama `_generate_plhut_spans.py`) yang WAJIB dijalankan manual, TIDAK
otomatis dalam test run biasa.

### 1.2 Eval harness per-skill AI-assist (BARU)

Skrip `scripts/eval/eval_ai_assist.py` (baru, folder `scripts/eval/` di
root repo) — mengukur akurasi tiap modul di
`services/document-intelligence/app/perception/ai_assist/` (8 modul:
`dimension_assist`, `zone_assist`, `wall_assist`, `roof_frame_assist`,
`kusen_assist`, `mep_assist`, `kuda_kuda_assist`, `arsitektur_area_assist`)
terhadap **set kasus berlabel** (`scripts/eval/cases/<modul>.json` — buat
minimal 8-12 kasus per modul: campuran kasus BENAR sepenuhnya, kasus
HALUSINASI yang harus ditolak [pola sama test adversarial yang sudah ada
per modul, mis. `test_kuda_kuda_assist_rejects_standard_weight_when_not_
sourced_from_text`], kasus AMBIGU/rentang-invalid yang harus ditolak).

Setiap kasus: `{"detail_texts": [...], "expected": "accept"|"reject",
"expected_fields": {...} | null}`. Skrip memanggil fungsi `suggest_*` modul
terkait dengan **fake/stub client** yang mengembalikan respons yang SUDAH
DITENTUKAN per kasus (BUKAN memanggil Gemini sungguhan — ini eval terhadap
LOGIKA VALIDASI, bukan benchmark kualitas model asli; benchmark model asli
di luar scope task ini, catat sebagai gap jujur di report).

Output: tabel per-modul (`accuracy = (accept_benar + reject_benar) /
total`), dicetak ke stdout + disimpan `scripts/eval/eval_report.json`
(artefak, bisa dibaca CI Task R9 nanti). **Terima**: akurasi validasi
100% terhadap kasus yang SUDAH lolos test unit modul (kalau ada modul yang
tidak 100%, itu bug nyata di validasi — LAPORKAN, jangan diam-diam
disesuaikan kasusnya supaya "lolos").

### 1.3 Property-based test geometri grid (BARU, opsional-tapi-diminta)

`tests/test_grid_geometry_properties.py` untuk `app/perception/vector/
grid_geometry.py` — pakai `hypothesis` (dependency BARU, harus ditambah ke
`pyproject.toml` `[tool.poetry.group.dev.dependencies]` atau setara — INI
SATU-SATUNYA dependency baru yang diizinkan task ini, karena property-based
testing untuk geometri (rekonstruksi grid dari titik-titik acak) sulit
dicover memadai dengan contoh manual saja). Sifat yang diuji (properties,
bukan contoh spesifik): (a) grid yang direkonstruksi dari N titik kolinear
dengan spasi seragam menghasilkan bentang yang jumlahnya = jarak
titik-pertama-ke-terakhir (dalam toleransi float); (b) titik yang di-shuffle
urutannya menghasilkan grid yang SAMA (urutan input tidak memengaruhi
hasil); (c) titik duplikat/sangat berdekatan (di bawah threshold toleransi)
tidak menghasilkan bentang nol/negatif.

**VERIFIKASI dulu** fungsi publik `grid_geometry.py` yang tepat untuk
di-property-test (baca file itu penuh sebelum menulis) — sesuaikan
property test ke kontrak fungsi yang BENAR-BENAR ada, jangan berandai.

---

## 2. Implementasi ringkas — struktur file

```
services/document-intelligence/tests/
  test_golden_plhut_pipeline.py          (baru, §1.1)
  test_grid_geometry_properties.py       (baru, §1.3)
  fixtures/perception/
    plhut_golden_snapshot.json           (baru, hasil generate)
    _regenerate_golden_snapshot.py       (baru)

scripts/eval/                             (baru, folder root)
  eval_ai_assist.py
  cases/
    dimension_assist.json
    zone_assist.json
    wall_assist.json
    roof_frame_assist.json
    kusen_assist.json
    mep_assist.json
    kuda_kuda_assist.json
    arsitektur_area_assist.json
  eval_report.json                        (artefak hasil run, boleh .gitignore
                                            kalau berubah tiap run — putuskan;
                                            kalau di-commit, cukup 1 versi contoh)
```

---

## 3. Test WAJIB tambahan

- `test_golden_plhut_pipeline.py`: pipeline penuh vs snapshot cocok persis
  (kondisi normal, tanpa AI-assist — `ai_client=None` supaya deterministik
  100% tanpa bergantung Gemini); DAN satu kasus dengan `NullAiAssistClient`
  eksplisit untuk membuktikan hasil identik dengan `ai_client=None`
  (regresi kontrak degradasi anggun).
- `eval_ai_assist.py` diverifikasi via `pytest` wrapper tipis
  (`tests/test_eval_harness_runs.py` di root atau di
  document-intelligence) yang menjalankan skrip sebagai subprocess/import
  dan assert exit code 0 + `eval_report.json` valid JSON dengan semua 8
  modul punya entri.
- Property test grid: minimal 3 property (§1.3 a/b/c), masing-masing
  jalan ≥100 contoh acak (`@given(...)`, `hypothesis.settings(max_examples=100)`).

Jalankan SEMUA test document-intelligence setelah selesai (baseline 272
passed, 5 skipped — laporkan angka before/after, termasuk berapa test baru
ditambahkan).

---

## 4. Laporan WAJIB — `report-remote/`

Nama file baru: `report-remote/REPORT_TASKR4_GOLDEN_EVAL_HARNESS_CODEX_<tanggal>.md`.
Isi wajib: (1) isi `plhut_golden_snapshot.json` (ringkas — jumlah per
kategori, JANGAN tempel seluruh JSON), (2) tabel akurasi 8 modul dari
`eval_report.json` — kalau ADA modul <100%, jelaskan detail kasus yang
gagal & apakah itu bug validasi nyata, (3) 3 property test grid + hasil
`hypothesis` run, (4) daftar commit + link PR, (5) konfirmasi
`hypothesis` adalah SATU-SATUNYA dependency baru dan sudah ditambahkan ke
`pyproject.toml` dengan benar (dev-only, tidak masuk runtime dependency
produksi).

---

## 5. Pembagian kerja & larangan

- Branch baru dari `main`: `feat/golden-eval-harness`.
- Commit tanpa `Co-Authored-By`/signature AI.
- PR draft, JANGAN self-merge.
- JANGAN sentuh `apps/web/**`.
- JANGAN jadikan PLHUT logika produksi — tetap murni fixture uji.
- JANGAN tambah dependency selain `hypothesis` (dev-only) tanpa alasan baru.
