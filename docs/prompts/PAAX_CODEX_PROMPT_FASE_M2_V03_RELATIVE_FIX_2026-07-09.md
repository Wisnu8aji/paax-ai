# PROMPT CODEX — Fase M-2: Perbaikan Kedua V-03 (posisi relatif, bukan absolut)

> Ditulis Claude, 2026-07-09. Ini KOREKSI atas Fase M di PR #31
> (`feat/v03-fix-ahsp-catalog-import`). Owner meminta saya audit mendalam
> karena laporan Codex terasa "terlalu cepat" untuk cakupan pekerjaannya —
> dan audit itu **menemukan bug nyata yang masih ada** di perbaikan V-03.
> Fase N (impor AHSP CK 2026, 10 batch) di PR yang sama sudah saya verifikasi
> independen SECARA PENUH dan **terbukti akurat 100%** (lihat §0.1) — TIDAK
> perlu disentuh lagi. Prompt ini HANYA soal V-03.

---

## 0. Konteks verifikasi saya (WAJIB dibaca supaya paham kenapa ini penting)

### 0.1 Yang SUDAH terbukti benar (tidak perlu dikerjakan ulang)

Saya jalankan ulang semua ini sendiri, bukan percaya laporan begitu saja:
- `data/ahsp/cipta-karya-2026.json` di repo **identik byte-per-byte**
  (`new == src` True di Python) dengan sumber `G:\paax-data\ahsp\
  cipta-karya-2026.json` — 2.542 item, tidak ada yang hilang/diubah.
- Cross-check resource_code: 2.429 kode unik dirujuk AHSP, **SEMUA** ada di
  `_resources_catalog.json` (0 tidak dikenal) — klaim Codex akurat.
- `python -m pytest -q` di `services/core-engine`: **249 passed** (persis
  klaim laporan). `pnpm vitest run` web: **46 passed** (persis). Semua test
  baru (`test_ahsp_import_2026.py`, `test_api.py`) memanggil fungsi
  sungguhan (`audit_data_coverage`, `bind_prices`, `compute_hsp`), bukan
  assert kosong/tautologis.
- **Fase N genuinely solid. Jangan diragukan lagi, jangan dikerjakan ulang.**

### 0.2 Yang TERBUKTI BERMASALAH — bug nyata di Fase M (V-03)

Perbaikan V-03 di PR #31 (`_axis_positions_m` + `_cek_v03` di `validate.py`)
membandingkan **posisi ABSOLUT** (`posisi_mm`) label yang overlap antar
sheet. Test yang ditambahkan Codex lolos KARENA kedua sheet di fixture-nya
kebetulan memakai `posisi_mm` absolut yang SUDAH konsisten (mis. axis "B"
sama-sama diberi nilai 3000 di kedua sheet). Tapi itu TIDAK MEWAKILI
bagaimana `posisi_mm` sungguhan dihasilkan pipeline gambar kerja.

**Bukti langsung dari kode**: `services/document-intelligence/app/
perception/vector/grid_geometry.py` baris 280:
```python
axes: list[GridAxis] = [GridAxis(label=ordered[0].label, posisi_mm=0.0)]
```
Setiap SHEET/HALAMAN merekonstruksi grid-nya **SENDIRI, independen**, dan
axis PERTAMA yang terdeteksi DI HALAMAN ITU selalu dijadikan posisi 0 —
BUKAN posisi 0 building/proyek yang sama. Jadi kalau sheet pondasi punya
axis A,B,C (A=0,B=3000,C=6500) dan sheet atap HANYA menampilkan axis B,C
(karena memang cuma itu yang digambar di halaman itu), rekonstruksi mandiri
utk sheet atap akan menjadikan **B=0** (bukan 3000!), C=3500 — sebab B
adalah axis pertama yang terdeteksi DI HALAMAN ATAP itu.

**Saya buktikan ini menghasilkan false-positive nyata di kode V-03 hasil
PR #31**, dengan skrip reproduksi berikut (jalankan sendiri, ini BUKAN
teori):

```python
from app.tkg.models import Grid, GridAxis, GridSpan, GridTotal, SheetMeta, TkgDocument, TkgSheet, ElementInstance
from app.tkg.validate import validate_tkg

sheet1 = TkgSheet(
    sheet_id='S01', jenis='denah', meta=SheetMeta(judul='DENAH PONDASI', nomor='S-01'),
    grid=Grid(
        sumbu_x=[GridAxis(label='A', posisi_mm=0.0), GridAxis(label='B', posisi_mm=3000.0), GridAxis(label='C', posisi_mm=6500.0)],
        sumbu_y=[GridAxis(label='1', posisi_mm=0.0), GridAxis(label='2', posisi_mm=4000.0)],
        bentang_x=[GridSpan(dari='A', ke='B', nilai=3000, unit='mm'), GridSpan(dari='B', ke='C', nilai=3500, unit='mm')],
        bentang_y=[GridSpan(dari='1', ke='2', nilai=4000, unit='mm')],
        total_x=GridTotal(dari='A', ke='C', nilai=6500, unit='mm'),
        total_y=GridTotal(dari='1', ke='2', nilai=4000, unit='mm'),
    ),
    elements=[ElementInstance(kode='PC1', alamat='A1', n=1)],
)
# Sheet 2: rekonstruksi MANDIRI per-halaman (persis grid_geometry.py baris 280) --
# B adalah axis PERTAMA yang terdeteksi di halaman INI, jadi posisi_mm=0.0, BUKAN 3000.
sheet2 = TkgSheet(
    sheet_id='S02', jenis='denah', meta=SheetMeta(judul='DENAH ATAP', nomor='S-02'),
    grid=Grid(
        sumbu_x=[GridAxis(label='B', posisi_mm=0.0), GridAxis(label='C', posisi_mm=3500.0)],
        sumbu_y=[GridAxis(label='1', posisi_mm=0.0), GridAxis(label='2', posisi_mm=4000.0)],
        bentang_x=[GridSpan(dari='B', ke='C', nilai=3500, unit='mm')],
        bentang_y=[GridSpan(dari='1', ke='2', nilai=4000, unit='mm')],
        total_x=GridTotal(dari='B', ke='C', nilai=3500, unit='mm'),
        total_y=GridTotal(dari='1', ke='2', nilai=4000, unit='mm'),
    ),
    elements=[ElementInstance(kode='KD1', alamat='B1', n=1)],
)
doc = TkgDocument(prj_id='P', rev_id='R0', sheets=[sheet1, sheet2])
r = validate_tkg(doc)
print(r.ok, r.gate_passed, [(i.code, i.subject, i.message) for i in r.issues])
```

**Hasil nyata saat saya jalankan (di kode PR #31 apa adanya)**:
```
ok= False gate_passed= False
E-GRID x:B  posisi S01 = 3 m berbeda dari S02 = 0 m (tol 0.5%)
E-GRID x:C  posisi S01 = 6.5 m berbeda dari S02 = 3.5 m (tol 0.5%)
```
Padahal kedua sheet ini **konsisten** (jarak B→C sama-sama 3500mm di
keduanya) — cuma beda titik nol acuan. Ini persis jenis kasus realistis yang
tadinya ingin diperbaiki di Fase M, dan **MASIH GAGAL** untuk data yang
dihasilkan pipeline gambar sungguhan (bukan cuma test fixture yang kebetulan
memakai frame absolut yang sama).

---

## 1. FASE M-2 (WAJIB) — Ganti perbandingan ABSOLUT jadi RELATIF

### 1.1 Spesifikasi perbaikan (sudah saya rancang & verifikasi manual, ikuti persis)

Masalahnya: posisi absolut antar sheet TIDAK bisa dibandingkan langsung
karena tiap sheet punya titik-nol sendiri (independen). Yang BISA
dibandingkan dengan sah adalah **JARAK RELATIF antar label yang sama-sama
muncul** di kedua sheet — itu invarian terhadap pilihan titik nol.

Ganti `_cek_v03` (dan/atau `_axis_positions_m` pemanggilnya) menjadi:

1. Untuk setiap pasangan sheet "denah", per keluarga sumbu (x lalu y):
   `shared = label yang ada di KEDUA peta posisi sheet itu`.
2. **Kalau `len(shared) < 2`** → tidak cukup titik bersama untuk menghitung
   jarak relatif apa pun → **JANGAN error** (tidak ada dasar simpulkan
   konflik ATAUPUN kecocokan — ini keterbatasan jujur, dokumentasikan di
   komentar kode, jangan diam-diam dianggap "aman").
3. **Kalau `len(shared) >= 2`**: pilih SATU label acuan `ref` dari `shared`
   secara deterministik (mis. `sorted(shared)[0]` — urutan string biasa,
   konsisten & mudah diverifikasi). Untuk setiap label lain `lbl` di
   `shared`, hitung:
   - `rel_a = pos_a[lbl] - pos_a[ref]` (posisi relatif thd `ref`, di sheet A)
   - `rel_b = pos_b[lbl] - pos_b[ref]` (posisi relatif thd `ref`, di sheet B)
   - Bandingkan `rel_a` vs `rel_b` dengan logika toleransi yang SAMA seperti
     sebelumnya (relatif thd `max(abs(rel_a), abs(rel_b), epsilon)`, plus
     lantai toleransi absolut kecil ~1mm/0.001m utk hindari div-by-zero saat
     `rel_a`/`rel_b` mendekati 0) → beda melebihi `params.tol_grid` → `E-GRID`
     (subject `f"{sumbu}:{lbl}"`, pesan sebut kedua sheet_id + nilai relatif).
4. Ini otomatis membuat pasangan label `(ref, ref)` selalu "cocok" (selisih
   0) — TIDAK perlu dibandingkan eksplisit, cukup loop `shared - {ref}`.

### 1.2 Anchor test WAJIB (semua harus lolos, hitung ulang sendiri sebelum assert)

1. **Test BARU dari skrip reproduksi saya di §0.2** — masukkan PERSIS
   sebagai test (nama mis.
   `test_v03_subset_dengan_anchor_independen_per_halaman_tidak_e_grid`,
   mencerminkan cara `grid_geometry.py` baris 280 sungguhan bekerja) →
   HARUS `gate_passed is True`, TIDAK ada `E-GRID`. Ini anchor PALING
   PENTING di prompt ini — kalau test ini tidak ada atau tidak lolos,
   Fase M-2 dianggap BELUM selesai, apa pun klaim laporannya.
2. **Test existing yang sudah lolos tetap harus lolos**:
   `test_v03_denah_subset_grid_pipeline_sah_tidak_menjadi_e_grid` (subset
   absolut konsisten) dan `test_v03_tetap_menangkap_konflik_posisi_grid_
   yang_sungguh_berbeda` (3 label bersama A,B,C; B beda 3000 vs 3500 tapi
   A dan C sama — dengan pendekatan relatif thd ref="A": rel(B) sheet1=3000,
   sheet2=3500 beda 14,3% → tetap `E-GRID` pada subject `x:B`; rel(C) sama →
   tidak dobel error di C). **Verifikasi hitungan ini sendiri sebelum
   assert**, jangan copy angka dari sini tanpa mengulang manual.
3. **Test baru untuk keterbatasan jujur** (belum ada): 2 sheet denah yang
   HANYA berbagi SATU label (mis. sheet1 A,B,C; sheet2 hanya C, ditambah
   D,E yang tidak ada di sheet1) dengan posisi C yang beda jauh secara
   absolut → assert **TIDAK ada E-GRID** (karena cuma 1 titik bersama, tidak
   ada jarak yang bisa dibandingkan) — ini BUKAN false-negative, ini batas
   matematis yang jujur (dengan 1 titik bersama, sistem manapun tidak bisa
   membedakan "beda titik-nol yang wajar" dari "benar-benar konflik").
   Dokumentasikan ini di komentar & di laporan akhir, JANGAN coba
   "mengakali" dengan menebak salah satu benar.
4. Semua test V-02/V-04/V-05/V-08 & Fase K/K-2 yang sudah lolos harus tetap
   lolos tanpa perubahan.

### 1.3 Batasan

- Jangan ubah `_cek_v02`, jangan bikin tolerance baru selain reuse
  `params.tol_grid` + lantai absolut kecil (boleh reuse 0.001m yang sudah
  ada di kode PR #31).
- Jangan ubah `grid_geometry.py` atau apa pun di `document-intelligence` —
  itu memang SUDAH BENAR berperilaku independen-per-halaman (itu bukan bug
  di sana, itu keterbatasan wajar sistem persepsi vektor per-halaman).
  Perbaikan HARUS di sisi `validate_tkg` (core-engine), yang harus
  mengakomodasi kenyataan itu, bukan sebaliknya.
- Jangan sentuh Fase N (`data/ahsp/cipta-karya-2026.json`, test AHSP) sama
  sekali — sudah diverifikasi solid, di luar cakupan prompt ini.

---

## 2. GERBANG REVIEW

```
git fetch origin
git log origin/main -3
```
Cek apakah PR #29/#30/#31 sudah merge. Branch dari base paling mutakhir yang
tersedia. Buat branch baru (mis. `fix/v03-relative-position-check`), buka PR
ke `main`, **JANGAN merge sendiri**.

---

## 3. Verifikasi WAJIB

```powershell
cd services/core-engine
python -m pytest -q
# harapan: SEMUA lolos, termasuk 3 test baru di §1.2 (naik dari 249).
# Jalankan KHUSUS skrip reproduksi §0.2 secara manual dulu SEBELUM
# menganggap selesai -- pastikan outputnya "True True []" (tidak ada issue
# E-GRID), bukan cuma lolos lewat assert yang mungkin salah tulis.

cd ../../apps/web
pnpm vitest run
pnpm tsc --noEmit
# harapan: tidak berubah, 46 passed -- fase ini tidak menyentuh frontend.

cd ../services/document-intelligence
python -m pytest -q
# harapan: tidak berubah (126 passed + 5 skipped) -- tidak disentuh.
```

---

## 4. Setelah selesai — laporkan ke owner

1. Branch + PR link.
2. Bukti skrip reproduksi §0.2 sekarang menghasilkan `ok=True gate_passed=True []`
   (tempel output aslinya, bukan cuma klaim "sudah benar").
3. Hasil ketiga anchor test §1.2 (nama test + pass/fail).
4. Angka test lengkap tiap service.
5. Konfirmasi eksplisit: Fase N (AHSP import) TIDAK disentuh sama sekali.
6. Kalau menemukan kasus lain yang meragukan (mis. bagaimana kalau ada 2
   sheet dgn label bersama TAPI beda satuan mm/cm/m tercampur, atau grid
   dengan sumbu diagonal) — laporkan sebagai temuan terbuka, JANGAN
   dipaksakan selesai kalau memang di luar cakupan spek ini.
