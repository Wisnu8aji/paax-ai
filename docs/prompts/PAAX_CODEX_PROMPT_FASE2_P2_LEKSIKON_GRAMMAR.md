# PROMPT CODEX — FASE 2 · PAKET P2: Leksikon & Grammar Notasi Struktur (brain-00 §2)

> ## ⚠️ STATUS: HISTORIS / SUPERSEDED (2026-07-04 malam)
> Owner memutuskan Claude mengerjakan paket ini LANGSUNG (bukan via Codex).
> **SUDAH DIIMPLEMENTASIKAN** di `services/document-intelligence/app/perception/
> {lexicon/,grammar/,params.py}`, 37 test hijau, semua anchor tabel §4 lolos.
> **JANGAN jalankan prompt ini via Codex.** Lihat status nyata di
> `docs/plans/PAAX_FASE2_PERSEPSI_PLAN_2026-07-04.md` §Paket F2-P2. Dipertahankan
> di sini sbg spek historis/referensi, bukan instruksi aktif.

> Ditulis Claude 2026-07-04 (rekonstruksi setelah insiden file hilang — lihat
> `docs/plans/PAAX_FASE2_PERSEPSI_PLAN_2026-07-04.md` §0.2). Rencana induk:
> `docs/plans/PAAX_FASE2_PERSEPSI_PLAN_2026-07-04.md`. Spek mengikat:
> `docs/specs/brain-v4.1/PAAX_BRAIN_00_EKSTRAKSI_GAMBAR_KERJA.txt` §2 (§2.1–§2.8)
> + §9 anti-pola. Boleh dikerjakan PARALEL dengan P1 (branch terpisah) —
> fungsi murni, tak butuh runtime P1.

**PENTING — cek dulu:** `find services/document-intelligence/app/perception -iname "*grammar*" -o -iname "*lexicon*"`.
Kalau sudah ada pekerjaan paket ini, JANGAN tulis ulang dari nol — rebase/lanjutkan.

---

## 0. Aturan mengikat (langgar = PR ditolak)

1. **AP-E-04 NO-GUESS.** String yang tak cocok grammar / kode di luar kamus
   tanpa legenda → kembalikan `None` (caller akan tandai UNCLASSIFIED + W-LEX).
   DILARANG menebak makna. Ini inti "NO-MISTAKE".
2. **INV-TKG-03 NO-SILENT-FIX.** Raw selalu ikut di hasil parse; normalisasi
   (typo, satuan) ditandai bendera, bukan diam-diam.
3. **§2.7 satuan lewat INFERENSI, bukan asumsi tetap.** Keputusan satuan
   dicatat sebagai assumption; ambigu → `W-UNIT` + needs_review.
4. **§0.1 fixture-bukan-template.** Grammar UMUM; tak boleh ada cabang khusus PLHUT.
5. **Fungsi MURNI** (pure): input string → output struktur/None. Tanpa efek
   samping, tanpa I/O, tanpa state global.
6. Gerbang review CLAUDE.md §9: branch → commit → **draft PR**, JANGAN auto-merge.

---

## 1. Tujuan paket

Implementasi leksikon + grammar notasi gambar struktur Indonesia (brain-00 §2)
sebagai library fungsi murni. Tiap fungsi mengubah 1 string terbaca menjadi
parse terstruktur ATAU `None`. Ini komponen paling menentukan kualitas
transkrip.

---

## 2. File yang DIBUAT

```
services/document-intelligence/app/perception/
  lexicon/
    __init__.py
    prefixes.py      # kamus prefiks §2.1 (+ perluasan via legenda)
    typo.py          # kamus ejaan/typo §2.8
    units.py         # inferensi satuan §2.7 (pakai dims_range)
  grammar/
    __init__.py
    rebar.py         # parse_rebar §2.2
    section.py       # parse_section §2.3
    mutu.py          # parse_mutu §2.4 (beton + profil baja)
    level.py         # parse_level §2.5
    type_code.py     # parse_type_code §2.1
    result.py        # dataclass hasil + kode W-* (W-LEX/W-UNIT/W-NUM)
  params.py          # dims_range + eval.tkg_grammar_min (registry, TIDAK hardcode)
services/document-intelligence/tests/
  test_grammar_rebar.py
  test_grammar_section_units.py
  test_grammar_type_code.py
  test_grammar_mutu_level.py
```

Jika P1 sudah membuat `app/perception/__init__.py`, reuse; jangan tabrakan.

---

## 3. Spesifikasi fungsi

Semua fungsi kembalikan objek hasil kecil (dataclass/pydantic) dengan field
`raw` dan (bila relevan) `warnings: list[str]` + `needs_review: bool`; ATAU
`None` bila string bukan milik kategori itu.

### 3.1 `type_code.parse_type_code(s, legenda: dict[str,str] | None = None)` — §2.1
- Pola: `PREFIKS + indeks-angka + sufiks-huruf-opsional` (mis. `K1`, `K1A`, `PC3`).
- Kamus prefiks standar (kategori kanonik selaras `core-engine TypeKategori`):
  `P|PC|F`→pondasi_telapak · `SL`→sloof · `K`→kolom · `KP`→kolom_praktis ·
  `G`→balok(induk) · `B`→balok(anak) · `RB`→ring_balok ·
  `BL|LT|LATEI|LINTEL`→latei · `S`→plat · `TG`→tangga · `KD`→kuda_kuda ·
  `GD|GORDING`→gording · `IA`→ikatan_angin · `TS`→trekstang.
- **Sufiks huruf = varian BEDA** (K1A ≠ K1) — jangan disamakan (§2.1a).
- Prefiks DI LUAR kamus: cari di `legenda`; ada → pakai makna legenda + tandai
  `sumber="legenda"`; TIDAK ada legenda → `None` + (caller: W-LEX +
  needs_review) (§2.1b).
- Kode dengan titik/slash (`X.Y`, `1/2KD`) → simpan utuh apa adanya (§2.1c) —
  kembalikan hasil dengan `kode_raw` utuh, `kategori=None`, `needs_review=True`
  bila prefiks tak jelas.
- Field hasil: `{kode_raw, prefiks, indeks:int|None, sufiks:str|None, kategori|None, sumber}`.

### 3.2 `rebar.parse_rebar(s)` — §2.2
- **Pokok:** `<n>D<d>` / `<n>Ø<d>` (mis. `12D16`). `D`=ulir → `jenis="D"`;
  `Ø` atau `O` → `jenis="O"` (polos). Toleran spasi: `12 D16`, `12 D 16`.
- **Sebar/sengkang:** `D<d>-<s>` / `Ø<d>-<s>` (mis. `D10-150`; d,s dalam mm).
- Validasi kewajaran: `d ∈ dims_range["besi_d"]` (default 6..32), `s ∈ dims_range["besi_s"]`
  (default 50..400). Di luar rentang → hasil tetap dibuat TAPI
  `needs_review=True` + `W-NUM` (indikasi salah baca), bukan dibuang.
- Field: `{raw, kind:"pokok"|"sebar", n:int|None, d:float, s:float|None, jenis:"D"|"O", warnings, needs_review}`.
- Bukan rebar (mis. `12X16`, `400x400`) → `None`.

### 3.3 `section.parse_section(s)` + `units.infer_unit(...)` — §2.3, §2.7
- `parse_section`: `<b>x<h>` / `<b>/<h>` (mis. `400x400`, `250/600`); pelat
  `t=<..>`. Field: `{raw, b, h, t:None, satuan:None}` (satuan diisi oleh infer_unit).
- `infer_unit(nilai_atau_pasangan, kategori, dims_range)` §2.7 prosedur:
  (1) coba satuan default kelas (beton struktural = mm);
  (2) bila nilai di luar `dims_range[kategori]`, coba satuan alternatif (cm);
  (3) tepat satu satuan yang wajar → pakai + `assumption` dicatat;
  (4) dua-duanya wajar ATAU tak ada yang wajar → `W-UNIT` + needs_review.
- Contoh perilaku: `400x400`@kolom → mm (400mm wajar); `15x10`@latei → cm
  (15mm terlalu kecil untuk latei; 15cm wajar). Semua keputusan tercatat.

### 3.4 `mutu.parse_mutu(s)` — §2.4
- Beton: `fc' <n>` / `fc<n>` (MPa) → `{jenis:"fc", nilai}`; `K-<n>` / `K<n>` →
  `{jenis:"K", nilai}`. Simpan persis; padanan K↔fc' BUKAN urusan sini (engine F-B10).
- Profil baja (kembalikan kelas + dimensi mentah, jangan tafsir): `WF <h>x<b>x<tw>x<tf>`,
  kanal `C <h>x<b>x<c>x<t>`, siku `L <a>x<b>x<t>`, pipa `Ø<d>x<t>`, batang
  polos `Ø<d>`.
- Bukan mutu/profil → `None`.

### 3.5 `level.parse_level(s)` — §2.5
- `SFL ±x.xxx` / `EL ±..` / `PEIL ±..` / `±0.000` (satuan meter). Tanda `+`/`-`
  WAJIB terbaca & benar; `SFL.` dengan titik tetap dikenali. Field:
  `{raw, label, nilai_m}`.
- Bukan level → `None`.

### 3.6 `typo.normalize_typo(s)` — §2.8
- Normalisasi HANYA lewat kamus resmi (mis. trekstang/trexstang,
  lisplank/listplank, bouwplank/bowplank, aanstamping/anstamping). Kembalikan
  `{raw, normal, koreksi:bool}`. Kata di luar kamus → `normal==raw`,
  `koreksi=False` (tak diubah).

### 3.7 `params.py`
- `dims_range: dict[str, tuple[float,float]]` per kategori (mm): mis.
  `kolom:(150,1500)`, `balok:(150,1200)`, `latei:(80,300)`, `plat_t:(80,300)`,
  `besi_d:(6,32)`, `besi_s:(50,400)`, `bentang_as:(1000,12000)`. Sumber pada
  komentar (praktik SNI/QS umum). Bisa dioverride; TIDAK hardcode di dalam
  fungsi grammar.
- `eval_tkg_grammar_min: float = 0.85` (dipakai P4 V-06).

---

## 4. TABEL GOLDEN ANCHOR (WAJIB jadi test — jangan ubah tanpa hitung ulang)

Format: `input → hasil` (atau `None`). Semua dari brain-00 §2.

**parse_rebar (`test_grammar_rebar.py`):**
| input | hasil |
|---|---|
| `12D16` | pokok n=12 d=16 jenis=D, needs_review=False |
| `10D16` | pokok n=10 d=16 D |
| `8D16` | pokok n=8 d=16 D |
| `12 D16` | pokok n=12 d=16 D (toleran spasi) |
| `12 D 16` | pokok n=12 d=16 D |
| `D10-150` | sebar d=10 s=150 D |
| `D10-300` | sebar d=10 s=300 D |
| `D16-150` | sebar d=16 s=150 D |
| `Ø10-150` | sebar d=10 s=150 jenis=O |
| `O10-150` | sebar d=10 s=150 jenis=O |
| `D40-150` | sebar d=40 → needs_review=True + W-NUM (d di luar 6..32) |
| `12X16` | None |
| `400x400` | None |
| `K1` | None |

**parse_section + infer_unit (`test_grammar_section_units.py`):**
| input, kategori | hasil |
|---|---|
| `400x400`, kolom | b=400 h=400 satuan=mm |
| `250x600`, kolom | b=250 h=600 mm |
| `250/600`, balok | b=250 h=600 mm |
| `15x10`, latei | b=15 h=10 satuan=cm (assumption dicatat) |
| `t=120`, plat | t=120 mm |
| `9999x9999`, kolom | W-UNIT + needs_review (di luar rentang mm & cm) |

**parse_type_code (`test_grammar_type_code.py`):**
| input (legenda) | hasil |
|---|---|
| `K1` | prefiks=K indeks=1 sufiks=None kategori=kolom |
| `K1A` | prefiks=K indeks=1 sufiks=A kategori=kolom (≠ K1) |
| `PC1` | prefiks=PC indeks=1 kategori=pondasi_telapak |
| `SL1` | prefiks=SL kategori=sloof |
| `B2` | prefiks=B kategori=balok |
| `KP1` | prefiks=KP kategori=kolom_praktis |
| `S1` | prefiks=S kategori=plat |
| `ZZ9` (tanpa legenda) | None (→ W-LEX + needs_review) |
| `ZZ9` (legenda {ZZ:"gording"}) | kategori dari legenda, sumber="legenda" |
| `1/2KD` | kode_raw utuh, needs_review=True |

Assert eksplisit: `parse_type_code("K1A").sufiks == "A"` dan hasilnya TIDAK
sama dengan `parse_type_code("K1")` (aturan varian §2.1a).

**parse_mutu + parse_level (`test_grammar_mutu_level.py`):**
| input | hasil |
|---|---|
| `fc' 25` | jenis=fc nilai=25 |
| `fc'25` | jenis=fc nilai=25 |
| `K-300` | jenis=K nilai=300 |
| `K300` | jenis=K nilai=300 |
| `WF 200x100x5.5x8` | kelas=WF dims=[200,100,5.5,8] |
| `SFL +0.000` | nilai_m=0.0 |
| `EL -1.500` | nilai_m=-1.5 |
| `±0.000` | nilai_m=0.0 |
| `POTONGAN A-A` | parse_level → None; parse_mutu → None |

---

## 5. Verifikasi sebelum commit

```powershell
cd G:\paax-ai-main\services\document-intelligence
$env:PYTHONUTF8=1
python -m pytest -q
```
Kriteria terima:
- Semua anchor tabel §4 hijau (≈50 kasus).
- Kasus di luar kamus/grammar BENAR jadi `None` (bukan tebakan).
- core-engine tetap hijau (tidak disentuh).
- Fungsi murni: tak ada I/O/network/state global di modul grammar.
- Lakmus §0.1: tak ada cabang khusus PLHUT.

---

## 6. Commit, PR, REPORT

- Branch: `feat/fase2-p2-leksikon-grammar` (dari `main`).
- Commit: `feat(perception): leksikon & grammar notasi struktur (brain-00 §2) — Fase 2 P2`.
- Push → **draft PR** ke `main`. JANGAN merge.
- **Commit dokumen non-kode terkait SEGERA** kalau ada — jangan biarkan untracked.
- Report → `report/REPORT_FASE2_P2_CODEX_2026-07-04.md`: langkah, output
  pytest, daftar file, SHA, URL PR, catatan kasus ambigu.

---

## 7. Yang TIDAK dikerjakan di P2
- Merge-run/span extraction → P1.
- Rekonstruksi grid/tabel/elemen, binding, assembler TkgDocument → P3.
- Validator V-01..V-10, metrik, renderer .tkg.txt, gerbang, endpoint → P4.
- OCR/PaddleOCR → P6.
Ragu batas paket → STOP & tanya. Jangan tambah cakupan diam-diam.
