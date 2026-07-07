# PROMPT CODEX — Task R13: Ekspansi Harga Regional Multi-Wilayah + Versioning Price Book

> Ditulis Claude, 2026-07-07, reasoning tinggi. Bagian dari
> `docs/prompts/PAAX_CODEX_ROADMAP_10_TASKS_NON_UI_2026-07-07.md` (Task 13).
> **Mandiri** — tidak bergantung task lain.
>
> **PENTING (operasional)**: SEGERA `git add` + commit file prompt ini
> di AWAL branch task SEBELUM menulis kode — insiden 2026-07-07
> membuktikan file prompt tak-ter-commit bisa hilang saat checkout/
> cleanup branch berikutnya.

---

## 0. Konteks — gap versioning yang SUDAH SETENGAH ADA tapi tidak dipakai

`scripts/harga/extract_harga.py::build_price_book` (baca fungsi ini penuh
dulu) **SUDAH** menulis field `effective_date` ke output JSON price book
(default `"2026-06-28"`, baris ~522 — VERIFIKASI ulang, bisa berubah).
TAPI `services/core-engine/app/rab/loader.py::load_data` (baca §1-71,
sudah dikutip penuh di bawah) **SAMA SEKALI TIDAK MEMBACA field itu** —
loader hanya mengindeks price book by `region_code` (baris 63:
`code = raw.get("region_code") or f.stem`), dan **kalau 2 file JSON punya
`region_code` SAMA, yang terakhir dimuat (urutan `sorted(glob)` alfabetis
by nama file) MENIMPA yang sebelumnya di dict `store.regions[code]`** —
tidak ada mekanisme pilih-berdasar-tanggal sama sekali. Ini gap nyata:
**RAB lama yang sudah dihitung dengan harga periode lama TIDAK BISA
dihitung ulang dengan harga periode itu** kalau ada revisi harga baru
untuk wilayah yang sama — versi lama akan hilang/tertimpa.

```python
def load_data(base: Path | None = None) -> DataStore:
    ...
    for f in sorted(harga_dir.glob("*.json")):
        raw = json.loads(f.read_text(encoding="utf-8"))
        resources = raw.get("resources")
        if not isinstance(resources, list):
            continue
        code = raw.get("region_code") or f.stem
        store.region_names[code] = raw.get("region", code)
        book: Dict[str, ResourcePrice] = {}
        for r in resources:
            rp = ResourcePrice(**r)
            book[rp.code] = rp
        store.regions[code] = book  # <- MENIMPA versi sebelumnya!
    return store
```

---

## 1. Scope task ini

### 1.1 Engine: `DataStore` menyimpan MULTI-VERSI per region_code

Ubah `store.regions` dari `Dict[str, Dict[str, ResourcePrice]]` menjadi
`Dict[str, list[PriceBookVersion]]` — `PriceBookVersion` (dataclass/Pydantic
baru di `app/rab/models.py`): `{effective_date: str, resources: Dict[str,
ResourcePrice], source_file: str}`. `load_data` TIDAK LAGI menimpa —
setiap file JSON dengan `region_code` yang sama jadi ENTRI TERPISAH di list,
diurutkan by `effective_date` ASCENDING.

`DataStore.price_book(region_code: str, as_of_date: str | None = None) ->
Dict[str, ResourcePrice]` — kalau `as_of_date=None` (default, JAGA
BACKWARD COMPATIBILITY untuk semua caller lama yang tidak tahu soal
versioning), kembalikan versi **TERBARU** (`effective_date` maksimum).
Kalau `as_of_date` diisi, kembalikan versi dengan `effective_date` **≤
as_of_date TERBESAR** (versi yang berlaku pada tanggal itu — pola umum
"as-of" versioning). Kalau tidak ada versi yang berlaku pada tanggal itu
(semua versi lebih baru dari `as_of_date`) → `KeyError` jelas, pesan
sebutkan tanggal termuda yang tersedia.

**Endpoint yang terpengaruh** — VERIFIKASI SEMUA pemanggil
`store.price_book(...)` di `app/main.py`/`app/rab/rab.py`/dsb (grep
`price_book(` di seluruh `services/core-engine/app`), tambahkan parameter
opsional `as_of_date` di `RABLineInput`/request body yang relevan HANYA
kalau memang dibutuhkan alur RAB tersimpan (JANGAN ubah endpoint yang
tidak perlu — kalau ragu endpoint mana yang butuh, laporkan alih-alih
menebak).

### 1.2 Extractor: generalisasi format sumber SHSD

`scripts/harga/extract_harga.py` sekarang HANYA teruji utk 1 format XLSX
spesifik (`Daftar harga bahan dan upah.xlsx`, Semarang). Generalisasi:
- Parameter CLI baru `--format` (`auto` default, atau nama profil parser
  spesifik) — `auto` mencoba deteksi header kolom (nama/satuan/harga)
  secara fleksibel (bukan posisi kolom hardcode) kalau kolom yang sudah
  dikenal (`parse_harga_sheet`, VERIFIKASI struktur exact yang diasumsikan
  sekarang) tidak cocok.
- **JANGAN korbankan validitas** — kalau format tidak dikenali, extractor
  HARUS gagal jelas ("format tidak dikenali, kolom X/Y/Z tidak ditemukan")
  BUKAN menghasilkan data salah diam-diam (konsisten prinsip
  `_numbers_compatible`/`_candidate_score` yang sudah ketat).
- Tambahkan 1 wilayah kedua sungguhan sebagai bukti generalisasi bekerja
  (pilih wilayah yang datanya TERSEDIA — CEK `G:\AHSP`/`G:\paax-data`
  kalau ada sumber SHSD wilayah lain; KALAU TIDAK ADA data sumber wilayah
  kedua yang bisa diakses, buat FIXTURE SINTETIS XLSX kecil dengan format
  SEDIKIT BERBEDA dari Semarang [urutan kolom beda, nama header beda] utk
  membuktikan generalisasi via test — JANGAN mengarang data harga nyata).

### 1.3 CLI: parameter `--effective-date` sudah ada, tambah `--supersede-check`

`scripts/harga/extract_harga.py` (CLI, baca `if __name__ == "__main__"`
atau `argparse` setup-nya) sudah punya `--effective-date` (dipakai
`extract_harga.py` command contoh di README `scripts/harga/README.md`).
Tambahkan flag `--supersede-check`: kalau diset, extractor CEK dulu apakah
sudah ada price book utk `region_code` yang SAMA dengan `effective_date`
yang SAMA PERSIS di `--out` — kalau ada, TOLAK overwrite (`exit 1`, pesan
jelas "gunakan tanggal berbeda atau hapus manual") — mencegah kecelakaan
menimpa versi historis yang sudah dipakai RAB tersimpan.

---

## 2. Test WAJIB

### 2.1 `services/core-engine/tests/test_price_book_versioning.py` (baru)
- 2 versi price book region SAMA (`effective_date` beda) dimuat dari 2
  file fixture → `store.regions[code]` berisi 2 entri, bukan 1.
- `price_book(code)` tanpa `as_of_date` → versi TERBARU.
- `price_book(code, as_of_date="<tanggal di antara 2 versi>")` → versi
  yang berlaku pada tanggal itu (versi LAMA, bukan terbaru).
- `price_book(code, as_of_date="<tanggal sebelum versi tertua>")` →
  `KeyError` jelas.
- **Regresi backward-compat**: semua test PLHUT/RAB yang sudah ada
  (`test_plhut_*`) yang memanggil `price_book` tanpa `as_of_date` TETAP
  LULUS tanpa modifikasi (jalankan full test suite, bukan cuma test baru).

### 2.2 `scripts/harga/tests/test_extract_harga_multi_format.py` (baru,
   fixture inline — pola sama `test_harga_extract.py` yang sudah ada,
   JANGAN pakai `G:\AHSP`/`G:\paax-data` di test)
- Fixture XLSX format Semarang (kolom asli) → tetap parse benar (regresi).
- Fixture XLSX format KEDUA (kolom berbeda urutan/nama) → parse benar via
  jalur `auto`-detect.
- Format tidak dikenal (kolom acak tidak masuk akal) → gagal jelas, BUKAN
  data kosong/salah diam-diam.
- `--supersede-check`: overwrite region+tanggal sama → ditolak; tanggal
  beda → diterima.

Jalankan SEMUA test core-engine setelah selesai (baseline 280 passed —
laporkan before/after).

---

## 3. Laporan WAJIB — `report-remote/`

Nama file baru: `report-remote/REPORT_TASKR13_HARGA_MULTI_WILAYAH_CODEX_<tanggal>.md`.
Isi wajib: (1) skema `PriceBookVersion` final, (2) daftar SEMUA caller
`price_book(...)` yang diverifikasi & mana yang diberi parameter
`as_of_date` baru (dengan alasan), (3) hasil test versioning +
multi-format, (4) apakah wilayah kedua yang diuji itu data SUNGGUHAN atau
fixture sintetis (JUJUR, jangan diklaim data asli kalau sebenarnya
sintetis), (5) commit + PR, (6) konfirmasi tidak ada regresi test PLHUT
lama.

---

## 4. Pembagian kerja & larangan

- Branch baru dari `main`: `feat/harga-multi-wilayah-versioning`.
- Commit tanpa `Co-Authored-By`/signature AI.
- PR draft, JANGAN self-merge.
- JANGAN sentuh `apps/web/**`.
- JANGAN commit data harga nyata dari `G:\paax-data`/`G:\AHSP` ke repo —
  hanya kode + fixture sintetis kecil di `tests/`.
- JANGAN ubah default behavior `price_book()` tanpa `as_of_date` (harus
  tetap versi terbaru — semua kode lama bergantung pada ini diam-diam).
