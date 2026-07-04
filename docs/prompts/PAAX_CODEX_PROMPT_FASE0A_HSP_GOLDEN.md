# PROMPT CODEX — Fase 0: Golden anchor RAB nyata PLHUT + price book Surakarta (2026-07-03)

> Konteks: **GERBANG-0a TUTUP** + **harga Surakarta NYATA terpasang** (roadmap
> `docs/plans/PAAX_ROADMAP_GAMBAR_KE_RAB_2026-07-03.md`, "data dulu, baru mata").
> Claude sudah **membangun & memverifikasi** fixture + 3 test golden anchor dari
> RAB manual NYATA `rab gedung plhut surakarta ALFA.xlsx`, dan membangun price
> book regional Surakarta dari data harga asli di file yang sama (owner-authorized
> 2026-07-03: "harga DKH/HSP/HARGA BAHAN itu harga asli Surakarta, pakai saja").
> Tugasmu: **verifikasi hijau + commit + draft PR**. **JANGAN ubah kode/engine/
> rumus/test/data.**
>
> Bukti terverifikasi Claude (jalankan ulang untuk pastikan):
> - **0a-1 HSP**: engine UMUM `app.rab.rab.compute_hsp()` reproduksi **32/32** HSP
>   profesional (baris F ALFA) via `(A+B+C)×(1+OP)` (CLAUDE.md §5).
> - **0a-2 RAB total**: engine UMUM `compute_rab()` reproduksi grand_total
>   **Rp 1.860.078.607** dengan deviasi **+0,0009%** (224 baris; 79 ber-AHS pakai
>   HSP dari koefisien, 145 direct/lump-sum pseudo-AHSP harga langsung).
> - **0b-parsial (harga Surakarta nyata)**: `data/harga-satuan/surakarta.json`
>   (112 resource, dari HARGA BAHAN + AHS asli) memuat via loader engine
>   (region `surakarta`); dipakai ulang, engine mereproduksi RAB PLHUT
>   **Rp 1.885.558.837 vs Rp 1.860.078.608 = +1,37%** (di dalam ±10%); deviasi
>   seluruhnya dari 5 inkonsistensi harga internal ALFA sendiri (tercatat, auditable).
> - Full suite core-engine: **238 passed** (198 lama + 40 baru).

## ⚠️ PRINSIP WAJIB §0.1 (roadmap) — PLHUT = FIXTURE UJI, BUKAN TEMPLATE
- Fixture PLHUT (koefisien/analisa/answer-key) hidup **HANYA** di
  `services/core-engine/tests/fixtures/plhut/`. DILARANG menyalin ke `data/ahsp/`
  sbg grounding sistem. DILARANG menambah logika di `app/` yang mengenali "ini PLHUT".
- **Harga = pengecualian yang sah**: `data/harga-satuan/surakarta.json` BOLEH ada
  di `data/` karena itu **harga regional Surakarta** (berlaku proyek Surakarta
  mana pun), BUKAN koefisien/struktur khas PLHUT. Yang diuji tetap engine UMUM.
  Brain AP-07/AP-15, INV-05.

## File yang SUDAH dibuat & diverifikasi Claude (JANGAN ubah isi)

**Fixture + generator PLHUT** (butuh ALFA.xlsx yg tak di repo — untuk provenans):
- `services/core-engine/tests/fixtures/plhut/ahs_golden.json` (32 analisa + 202 resource + expected_hsp)
- `services/core-engine/tests/fixtures/plhut/dkh_golden.json` (224 baris + grand_total)
- `services/core-engine/tests/fixtures/plhut/README.md`
- `services/core-engine/tests/fixtures/plhut/_generate_ahs_golden.py`
- `services/core-engine/tests/fixtures/plhut/_generate_dkh_golden.py`

**Price book Surakarta NYATA** (data sistem, bukan fixture — lihat §0.1 di atas):
- `data/harga-satuan/surakarta.json` (112 resource: upah/bahan/alat, harga asli 2024)
- `data/harga-satuan/_generate_surakarta_from_alfa.py` (regenerator + provenans)

**Test** (Claude tulis + verifikasi hijau):
- `services/core-engine/tests/test_plhut_hsp_golden.py` (34 test)
- `services/core-engine/tests/test_plhut_rab_golden.py` (3 test)
- `services/core-engine/tests/test_plhut_surakarta_pricebook.py` (3 test)

**Docs:**
- `docs/plans/PAAX_ROADMAP_GAMBAR_KE_RAB_2026-07-03.md`
- `docs/plans/PAAX_FASE0B_GAP_HARGA_2026-07-03.md` (status harga + sisa gap pemetaan resmi)
- `docs/prompts/PAAX_CODEX_PROMPT_FASE0A_HSP_GOLDEN.md` (file ini)
- `docs/ai-map/STATE.md` (diupdate)

## Toolchain
```powershell
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"
# python: C:\Users\Nothing\AppData\Local\Programs\Python\Python313\python.exe
```

## TUGAS
### 1. Branch dari `main`: `feat/fase0-plhut-golden-anchor`

### 2. Guardrail (wajib hijau)
```powershell
cd services/core-engine
$env:PYTHONUTF8=1
python -m pytest -q          # harus 238 passed
python -m pytest tests/test_plhut_hsp_golden.py tests/test_plhut_rab_golden.py tests/test_plhut_surakarta_pricebook.py -q   # 40 passed
```
Juga cek loader memuat region baru:
```powershell
cd ../..
python -c "import sys; sys.path.insert(0,'services/core-engine'); from app.rab.loader import load_data; st=load_data(); print(list(st.regions.keys())); print(len(st.regions['surakarta']))"
# harus cetak: [..., 'surakarta']  dan  112
```
Merah → STOP, laporkan, jangan commit.

### 3. Stage (persis; JANGAN `git add .` / `-A`)
```
git add services/core-engine/tests/fixtures/plhut/ahs_golden.json
git add services/core-engine/tests/fixtures/plhut/dkh_golden.json
git add services/core-engine/tests/fixtures/plhut/README.md
git add services/core-engine/tests/fixtures/plhut/_generate_ahs_golden.py
git add services/core-engine/tests/fixtures/plhut/_generate_dkh_golden.py
git add services/core-engine/tests/test_plhut_hsp_golden.py
git add services/core-engine/tests/test_plhut_rab_golden.py
git add services/core-engine/tests/test_plhut_surakarta_pricebook.py
git add data/harga-satuan/surakarta.json
git add data/harga-satuan/_generate_surakarta_from_alfa.py
git add docs/plans/PAAX_ROADMAP_GAMBAR_KE_RAB_2026-07-03.md
git add docs/plans/PAAX_FASE0B_GAP_HARGA_2026-07-03.md
git add docs/prompts/PAAX_CODEX_PROMPT_FASE0A_HSP_GOLDEN.md
git add docs/ai-map/STATE.md
```
JANGAN commit `.claude/`, `skills-lock.json`, `excel_extracted.txt`, `pdf_extracted.txt`.
**PERHATIKAN**: `data/harga-satuan/surakarta.json` mungkin SUDAH ada di repo
(file lama placeholder tipis). Pastikan versi yang di-commit adalah versi BARU
Claude (112 resource, ada field `alfa_price_conflicts`) — cek isi sebelum `git add`.

### 4. Commit + draft PR (base `main`, JANGAN merge)
```
feat(engine): golden anchor RAB nyata PLHUT + harga Surakarta nyata (Fase 0)

- Fixture tests/fixtures/plhut/{ahs,dkh}_golden.json dari RAB manual PLHUT Surakarta 2024
- test_plhut_hsp_golden: engine compute_hsp() reproduksi 32/32 HSP profesional
- test_plhut_rab_golden: engine compute_rab() reproduksi grand_total Rp 1.860.078.607 (dev +0.0009%)
- data/harga-satuan/surakarta.json: price book Surakarta NYATA (112 resource, dari
  HARGA BAHAN ALFA, owner-authorized) -- grounding regional sistem, bukan fixture
- test_plhut_surakarta_pricebook: engine + price book Surakarta reproduksi RAB
  PLHUT dev +1.37% (seluruhnya dari 5 inkonsistensi harga internal ALFA, tercatat)
- Bukti matematika engine + harga nyata benar vs RAB profesional nyata
- Kode resource ALFA tak andal -> kunci resource lokal per-analisa (README)
- Prinsip §0.1: fixture PLHUT tetap di tests/; harga = grounding regional yang sah
- docs: roadmap gambar->RAB + status gap GERBANG-0b (harga selesai; sisa pemetaan resmi)

Verifikasi: pytest 238 passed (40 baru). Aturan Emas aman (engine hitung; test banding).
```
```
git push -u origin feat/fase0-plhut-golden-anchor
gh pr create --draft --base main --title "feat(engine): golden anchor RAB PLHUT + harga Surakarta nyata (Fase 0)" --body "<ringkas commit + verifikasi 238 passed + patuh §0.1>"
```

### 5. Laporan
Hasil guardrail (jumlah test), SHA, URL PR. Jangan merge.

## Status Fase 0 & langkah berikutnya (BUKAN tugas ini)
- **GERBANG-0a: TUTUP** ✅ (HSP + RAB total dari data nyata, terverifikasi).
- **Harga Surakarta: TERISI NYATA** ✅ (112 resource, coverage 100% utk lingkup PLHUT).
- **GERBANG-0b PENUH (katalog AHSP resmi 2.542 item): SISA GAP = PEMETAAN**, bukan
  lagi data harga — lihat `docs/plans/PAAX_FASE0B_GAP_HARGA_2026-07-03.md`:
  pencocokan nama persis resource Surakarta → kode resmi baru 21/112 (kategori
  upah masuk akal, bahan perlu pencocokan semantik SK-19); pemetaan 224 item DKH
  → kode ITEM AHSP resmi butuh konfirmasi owner per brain RULE-AHSP-01 (bukan
  ditebak). Ini pekerjaan lanjutan terpisah, opsional, tidak memblokir Fase 1/2.
