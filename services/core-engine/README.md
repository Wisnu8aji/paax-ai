# PAAX Core Engine (v0.6)

Engine **deterministik** PAAX: menghitung **HSP**, **RAB**, dan **Kurva S** dari koefisien
AHSP (kerangka Permen PUPR No. 8/2023) × harga satuan regional.

> **Aturan emas:** engine yang **menghitung**, LLM (di service lain) hanya **menjelaskan**.
> Tidak ada LLM di jalur perhitungan. Semua angka **auditable** — setiap rupiah dapat ditelusuri
> ke koefisien dan harga sumbernya.

---

## 1. Overview

Service ini adalah satu-satunya sumber angka di PAAX. Diberi daftar `{kode AHSP, volume, durasi}`,
ia mengembalikan rincian HSP per item, RAB lengkap (subtotal, PPN, total, bobot %), dan Kurva S
rencana — semuanya dihitung murni dari data, tanpa template hasil dan tanpa LLM.

- **Input data:** file JSON di `data/ahsp/*.json` (koefisien) dan `data/harga-satuan/*.json` (harga per wilayah).
- **Output:** struktur Pydantic yang ketat (lihat §3), identik dengan skema Zod di `packages/schemas`.
- **Sifat:** deterministik & idempoten — input sama ⇒ output sama, pembulatan uang konsisten 2 desimal.

---

## 2. Rumus Perhitungan

### Harga Satuan Pekerjaan (HSP)

```
A (Bahan) = Σ (koef_bahan × harga_bahan)
B (Upah)  = Σ (koef_upah  × harga_upah)
C (Alat)  = Σ (koef_alat  × harga_alat)
Base      = A + B + C
HSP       = Base × (1 + overhead_profit)
```

`overhead_profit` adalah BUK (Biaya Umum & Keuntungan), default **0.10 (10%)**, maks. 15% per Permen.
Implementasi: [`app/rab/rab.py`](app/rab/rab.py) → `compute_hsp()`.

### Rencana Anggaran Biaya (RAB)

```
Harga Item (amount) = Volume × HSP
Subtotal            = Σ Harga Item
PPN                 = Subtotal × ppn_rate        (default 0.11 = 11%)
Total               = Subtotal + PPN
Bobot (%)           = Harga Item / Subtotal × 100
```

Implementasi: `compute_rab()`. Pembulatan via `money(x) = round(x + 1e-9, 2)` agar stabil.

### Kurva S

```
Bobot per hari item = bobot_item / durasi_item
daily[]             = distribusi bobot tiap item ke array harian (sesuai hari mulai)
planned per periode = Σ daily[d0:d1]              (mis. per 7 hari = mingguan)
cumulative          = akumulasi planned antar periode
```

- **mode `sequential`** (default): tiap item mulai setelah item sebelumnya selesai ⇒ `total_days = Σ durasi`.
- **mode `parallel`**: semua item mulai hari ke-0 ⇒ `total_days = max(durasi)`.
- Koreksi pembulatan: bila kumulatif akhir ≈ 100 (selisih < 0.5), titik akhir dipaksa **100.0**.

Implementasi: [`app/rab/schedule.py`](app/rab/schedule.py) → `build_s_curve()`.

---

## 3. Struktur Data ([`app/rab/models.py`](app/rab/models.py))

Pydantic v2. Harus selaras 1:1 dengan Zod di `packages/schemas/src/index.ts`.

| Model | Peran | Field utama |
| --- | --- | --- |
| `Category` | Enum kategori komponen | `"bahan" \| "upah" \| "alat"` |
| `Component` | Satu komponen dalam analisa (input/referensi) | `resource_code`, `category`, `coefficient` |
| `AHSPItem` | Satu item Analisa Harga Satuan Pekerjaan | `code`, `name`, `unit`, `bidang`, `source`, `overhead_profit`, `components[]` |
| `ResourcePrice` | Harga satuan sumber daya per wilayah | `code`, `name`, `category`, `unit`, `price` |
| `ComponentCost` | Rincian biaya satu komponen (output HSP) | `resource_code`, `resource_name`, `category`, `unit`, `coefficient`, `unit_price`, `subtotal` |
| `HSPBreakdown` | Rincian HSP yang dapat diaudit (output `compute_hsp`) | `bahan`, `upah`, `alat`, `base`, `overhead_profit`, `overhead_profit_value`, `hsp`, `components[]` |
| `RABLineInput` | Input satu baris RAB | `ahsp_code`, `volume`, `duration_days?`, `description?` |
| `RABLine` | Satu baris RAB hasil hitung | `ahsp_code`, `name`, `unit`, `volume`, `hsp`, `amount`, `weight_pct` |
| `RABResult` | Seluruh RAB | `region`, `region_code`, `lines[]`, `subtotal`, `ppn_rate`, `ppn`, `total` |
| `SCurvePoint` | Satu titik Kurva S | `period`, `day_start`, `day_end`, `planned_pct`, `cumulative_pct` |
| `SCurveResult` | Seluruh Kurva S | `total_days`, `period_days`, `mode`, `points[]` |

---

## 4. Struktur File Data (`<repo-root>/data/`)

Lokasi default dihitung relatif terhadap repo root; override via env **`PAAX_DATA_DIR`**.

### `data/ahsp/*.json` — koefisien AHSP per bidang

```json
{
  "bidang": "Cipta Karya",
  "source": "DATA ILUSTRATIF — ganti dengan koefisien AHSP resmi sebelum produksi",
  "items": [
    {
      "code": "AHSP.CK.001",
      "name": "Pasangan dinding bata merah 1/2 batu, camp. 1 PC : 5 PP",
      "unit": "m2",
      "overhead_profit": 0.10,
      "components": [
        { "resource_code": "BTA.01", "category": "bahan", "coefficient": 70 },
        { "resource_code": "UPH.01", "category": "upah",  "coefficient": 0.30 }
      ]
    }
  ]
}
```

### `data/harga-satuan/*.json` — harga satuan per wilayah

```json
{
  "region": "Jawa Tengah",
  "region_code": "jateng",
  "currency": "IDR",
  "source": "DATA ILUSTRATIF — ganti dengan SHSD daerah / harga pasar resmi sebelum produksi",
  "resources": [
    { "code": "BTA.01", "name": "Bata merah",  "category": "bahan", "unit": "buah", "price": 800 },
    { "code": "UPH.01", "name": "Pekerja",     "category": "upah",  "unit": "OH",   "price": 110000 }
  ]
}
```

`bidang`/`source` dari file AHSP disuntikkan ke tiap item; `region`/`region_code` dipakai untuk
memilih price book. Loader memuat **semua** file `*.json` di kedua folder ([`app/rab/loader.py`](app/rab/loader.py)).

---

## 5. Diagram Alur

```
Input: RABLineInput[]   ({ ahsp_code, volume, duration_days? })
        │
        ▼
   loader.py     →  load AHSPItem + ResourcePrice dari data/ (PAAX_DATA_DIR)
        │            DataStore: ahsp{code→item}, regions{code→price_book}
        ▼
   rab.py        →  compute_hsp() per item
        │            A,B,C = Σ(koef × harga) ; HSP = (A+B+C)×(1+OHP)
        ▼
   rab.py        →  compute_rab()
        │            amount = volume × HSP ; subtotal/PPN/total ; bobot %
        ▼
   schedule.py   →  build_s_curve()
        │            distribusi bobot/hari → akumulasi per periode
        ▼
Output: RABResult + SCurveResult
```

---

## 6. API Endpoints ([`app/main.py`](app/main.py))

FastAPI, judul "PAAX Core Engine", versi `0.6.0`. CORS terbuka (ketatkan di produksi).
Dok interaktif: `http://localhost:8081/docs`.

| Method & Path | Body / Param | Response |
| --- | --- | --- |
| `GET /health` | — | `{ status, version, ahsp_items, regions[] }` |
| `GET /ahsp` | — | `[{ code, name, unit, bidang }, …]` |
| `GET /ahsp/{code}` | `code` (mis. `AHSP.CK.001`) | `AHSPItem` lengkap dengan `components[]` |
| `GET /regions` | — | `[{ code, name }, …]` |
| `POST /rab/hsp` | `{ ahsp_code, region_code }` | `HSPBreakdown` (A, B, C, base, overhead, HSP, components) |
| `POST /rab/calculate` | `{ region_code, ppn_rate, lines[] }` | `RABResult` (`lines[]` + subtotal + ppn + total) |
| `POST /schedule/s-curve` | `{ region_code, ppn_rate, period_days, mode, lines[] }` | `SCurveResult` (`total_days`, `period_days`, `mode`, `points[]`) |

Contoh body `POST /rab/calculate`:

```json
{
  "region_code": "jateng",
  "ppn_rate": 0.11,
  "lines": [
    { "ahsp_code": "AHSP.CK.001", "volume": 120, "duration_days": 6 },
    { "ahsp_code": "AHSP.CK.002", "volume": 240, "duration_days": 8 }
  ]
}
```

Contoh body `POST /schedule/s-curve` menambah `period_days` (mis. `7`) dan `mode` (`"sequential"` | `"parallel"`).
Item tak dikenal / wilayah tak ada ⇒ `400` (KeyError) atau `404` (`GET /ahsp/{code}`).

---

## 7. Cara Menjalankan

### Install

```bash
cd services/core-engine
pip install -e ".[dev]"        # fastapi, uvicorn, pydantic>=2.6, pytest, httpx
```

### Test

```bash
python -m pytest -q
# Expected: 8 passed
```

### Demo

```bash
python -m app.demo
```

> **Windows:** konsol default (cp1252) tidak bisa mencetak karakter Kurva S (`█`, `—`).
> Jalankan dengan UTF-8 agar tidak `UnicodeEncodeError`:
> ```powershell
> $env:PYTHONUTF8=1; python -m app.demo
> ```
> ```bash
> PYTHONUTF8=1 python -m app.demo
> ```

### API Server

```bash
uvicorn app.main:app --reload --port 8081
# Swagger UI: http://localhost:8081/docs
```

---

## 8. Contoh Output Demo

Output aktual `PYTHONUTF8=1 python -m app.demo` (data **ILUSTRATIF**, wilayah `jateng`):

```
================================================================
PAAX Core Engine — Demo (data ILUSTRATIF)
================================================================

[1] Rincian HSP — AHSP.CK.001 (dinding bata 1/2 batu)
    Bahan (A) : Rp 81.770
    Upah  (B) : Rp 50.400
    Alat  (C) : Rp 0
    Base      : Rp 132.170
    Overhead+Profit (10%) : Rp 13.217
    HSP / m2 : Rp 145.387

[2] RAB (4 item)
    AHSP.CK.001  Pasangan dinding bata merah 1/2 ba    120.0 m2   HSP       Rp 145.387  =      Rp 17.446.440  (22.48%)
    AHSP.CK.002  Plesteran 1 PC : 3 PP, tebal 15 mm    240.0 m2   HSP        Rp 82.845  =      Rp 19.882.896  (25.62%)
    AHSP.CK.003  Beton mutu f'c = 14.5 MPa (setara      18.0 m3   HSP     Rp 1.335.076  =      Rp 24.031.359  (30.97%)
    AHSP.CK.004  Pemasangan lantai keramik 40x40 cm     85.0 m2   HSP       Rp 191.125  =      Rp 16.245.625  (20.93%)
                                                                                            Subtotal : Rp 77.606.320
                                                                                             PPN 11% : Rp 8.536.695
                                                                                           RAB TOTAL : Rp 86.143.015

[3] Kurva S (mingguan, sequential)
    Total durasi: 26 hari, 4 minggu
    Minggu  1 (hari  1-7 )  +25.68%  kum  25.68%  ████████████
    Minggu  2 (hari  8-14)  +22.42%  kum  48.10%  ████████████████████████
    Minggu  3 (hari 15-21)  +36.95%  kum  85.05%  ██████████████████████████████████████████
    Minggu  4 (hari 22-26)  +14.95%  kum 100.00%  ██████████████████████████████████████████████████
```

Verifikasi acuan (dihitung manual, lihat [`tests/test_rab.py`](tests/test_rab.py)):
`AHSP.CK.001` → Bahan 81.770 + Upah 50.400 = Base 132.170 → ×1.10 = **HSP 145.387**.

---

## 9. Catatan Data

Data di `data/` bersifat **ILUSTRATIF** untuk verifikasi engine. Sebelum produksi, ganti dengan:

- **Koefisien AHSP resmi:** Permen PUPR No. 8/2023 & SE DJBK terbaru.
- **Harga satuan:** SHSD daerah atau harga pasar resmi.

Engine tidak perlu diubah saat data diganti — cukup ganti isi `data/` (atau set `PAAX_DATA_DIR`).
