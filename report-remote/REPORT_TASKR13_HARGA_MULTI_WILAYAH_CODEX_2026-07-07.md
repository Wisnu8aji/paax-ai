# Report Task R13 — Ekspansi Harga Regional Multi-Wilayah + Versioning Price Book
**Tanggal:** 2026-07-07  
**Branch:** `feat/harga-multi-wilayah-versioning`  
**Commit:** `eced3de`  
**Author:** Codex (Antigravity)

---

## 1. Skema `PriceBookVersion` Final

Ditambahkan ke `services/core-engine/app/rab/models.py`:

```python
class PriceBookVersion(BaseModel):
    """Satu versi buku harga untuk satu wilayah pada tanggal tertentu."""
    effective_date: str       # ISO 8601: "2026-01-01"
    source_file: str          # Nama file JSON sumber
    resources: dict[str, ResourcePrice]  # keyed by resource code
```

### Perubahan `DataStore.regions`
- **Sebelum:** `Dict[str, Dict[str, ResourcePrice]]` — **tiap region hanya 1 versi, versi terbaru menimpa**
- **Sesudah:** `Dict[str, list[PriceBookVersion]]` — **semua versi disimpan, diurutkan by insertion (file sorted alphabetically)**

### `price_book()` as-of versioning logic:
- **Tanpa `as_of_date`:** Kembalikan versi dengan `effective_date` maksimum (terbaru) — **backward-compatible**
- **Dengan `as_of_date`:** Filter versi `≤ as_of_date`, kembalikan yang terbesar di antara versi valid
- **Tidak ada versi yang berlaku:** `KeyError` eksplisit menyebut tanggal versi tertua yang tersedia

---

## 2. Daftar Semua Caller `price_book(...)` yang Diverifikasi

| File | Endpoint | `as_of_date` Ditambahkan? | Alasan |
|------|----------|--------------------------|--------|
| `app/main.py:191` | `/rab/bind-prices` | ❌ Tidak | Endpoint utility, tidak butuh versioning |
| `app/main.py:204` | `/rab/coverage` | ❌ Tidak | Audit coverage, tidak butuh versioning |
| `app/main.py:215` | `/hsp` | ✅ Ya (`req.as_of_date`) | HSP bisa dihitung untuk RAB historis |
| `app/main.py:224` | `/rab/calculate` | ✅ Ya (`req.as_of_date`) | RAB historis butuh harga periode lama |
| `app/main.py:238` | `/rab/validate` | ✅ Ya (`req.as_of_date`) | Validasi RAB historis |
| `app/main.py:252` | `/rab/build` | ✅ Ya (`req.as_of_date`) | RAB bertingkat historis |
| `app/main.py:264` | `/rab/export/excel` | ✅ Ya (`req.as_of_date`) | Export Excel historis |
| `app/main.py:480` | `/s-curve` | ✅ Ya (`req.as_of_date`) | Kurva S berbasis harga historis |
| `app/main.py:510` | `/scenario/simulate` | ✅ Ya (`req.as_of_date`) | Simulasi skenario dengan harga lama |
| `app/demo.py:19` | Demo script | ❌ Tidak | Hanya demo lokal, tidak butuh versioning |

**Request models yang ditambahkan field `as_of_date: Optional[str] = None`:**
- `HSPRequest`
- `RABRequest`  
- `SCurveRequest`
- `ScenarioConfig` (di `app/scenario/models.py`)

---

## 3. Hasil Test Versioning + Multi-Format

### 3.1 Test Versioning (`test_price_book_versioning.py`)
```
tests/test_price_book_versioning.py::test_price_book_versioning PASSED  [100%]
============================= 1 passed in 0.69s ==============================
```

**Skenario yang diverifikasi:**
- ✅ 2 versi price book region SAMA → `store.regions["semarang"]` berisi 2 entri, bukan 1
- ✅ `price_book(code)` tanpa `as_of_date` → versi TERBARU (harga 1200)
- ✅ `price_book(code, as_of_date="2026-03-01")` → versi berlaku di tanggal itu (harga 1000 dari versi Jan)
- ✅ `price_book(code, as_of_date="2025-12-31")` → `KeyError` eksplisit

### 3.2 Test Multi-Format Extractor (Fixture Sintetis)
```
scripts/harga/tests/test_extract_harga_multi_format.py
  - test_format_semarang: Format asli Semarang → PASS
  - test_format_kedua_auto: Format kolom berbeda urutan → PASS  
  - test_format_tidak_dikenal: Kolom acak → ValueError eksplisit → PASS
```

### 3.3 Konfirmasi Tidak Ada Regresi Test PLHUT Lama
```
38 passed in 1.21s
  - test_rab.py: 11 passed
  - test_plhut_rab_golden.py: 3 passed
  - test_plhut_anchor.py: 11 passed
  - test_plhut_golden.py: 5 passed
  - test_scenario.py: 7 passed
  - test_price_book_versioning.py: 1 passed (baru)
```
**ZERO regresi pada test PLHUT/RAB yang sudah ada.**

---

## 4. Wilayah Kedua yang Diuji — Fixture SINTETIS

**Jujur: Wilayah kedua yang diuji adalah FIXTURE SINTETIS**, bukan data harga nyata.

Pertimbangan:
- Prompt melarang keras commit data harga nyata dari `G:\paax-data`/`G:\AHSP` ke repo
- Tidak ada sumber SHSD wilayah kedua yang tersedia di repo
- Fixture sintetis cukup untuk membuktikan generalisasi auto-detect kolom bekerja:
  - Format Semarang asli: kolom urutan `No | Uraian | ... | Satuan | Harga`
  - Format baru sintetis: kolom urutan `No | Nama Material | Harga Satuan | Ket | Satuan`

Kedua format berhasil di-parse oleh mekanisme `auto`-detect header.

---

## 5. Commit dan PR

- **Branch:** `feat/harga-multi-wilayah-versioning`
- **Commit:** `eced3de` — "feat(R13): multi-versi price book per region + --format auto + --supersede-check"
- **File yang berubah:** 7 files, 218 insertions, 26 deletions
- Status: PR draft, belum merge ke main

---

## 6. Fitur `--supersede-check` (CLI)

Contoh penggunaan:
```bash
python extract_harga.py --region Semarang --region-code semarang \
  --effective-date 2026-01-01 \
  --supersede-check
# ERROR: Region code 'semarang' dengan effective_date '2026-01-01' sudah ada di semarang_2026-01-01.json.
# gunakan tanggal berbeda atau hapus manual
```

Output price book sekarang menyertakan tanggal di nama file:
- **Sebelum:** `semarang.json` (selalu ditimpa)
- **Sesudah:** `semarang_2026-06-28.json` (koeksistensi multi-versi)
