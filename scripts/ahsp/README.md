# AHSP Extractor — Cipta Karya 2026

Mengekstrak tabel analisa AHSP dari PDF resmi **SE DJBK No. 47 Tahun 2026
(Lampiran VI — Bidang Cipta Karya)** menjadi dataset terstruktur sesuai schema
engine PAAX.

## ⚠️ Tata kelola data (PENTING)

Dataset AHSP+harga adalah **moat PAAX** — **jangan commit ke repo / GitHub**.
- **Kode** (script ini) → di repo.
- **Data** (PDF sumber + hasil) → **di luar repo**, mis. `G:\paax-data\`.
- Engine membaca data via env **`PAAX_DATA_DIR`** (lihat `services/core-engine/app/rab/loader.py`).
- Repo hanya menyimpan `data/ahsp/*.sample.json` (ilustratif, untuk demo/CI).

## Pakai

```bash
python scripts/ahsp/extract_ahsp.py --src "G:\AHSP" --out "G:\paax-data" --workers 8
```

Dependency: **PyMuPDF (fitz)** saja — sudah terpasang, tanpa Java/Ghostscript.

## Output (di `--out`, di luar repo)

| File | Isi |
|---|---|
| `ahsp/cipta-karya-2026.json` | Item AHSP (schema engine): `{code, name, unit, overhead_profit, components:[{resource_code, category, coefficient}]}` |
| `harga-satuan/_resources_catalog.json` + `.csv` | Katalog resource unik (tenaga/bahan/alat) + kode, **harga 0** → isi dari SHSD regional |
| `_audit/coverage.json` | Statistik + daftar item perlu review (tanpa satuan, header tersaring) |

## Catatan akurasi

- Sumber resmi hanya memuat **koefisien**; kolom harga **kosong** (HSD diisi per
  wilayah dari SHSD). Jadi output = koefisien + katalog resource (harga menyusul).
- Satuan tenaga = **OJ (Orang-Jam)**, bukan OH. Untuk durasi: 1 OH = 8 OJ.
- ~7% item tanpa satuan & sebagian resource bahan/alat tanpa kode resmi (diberi
  kode `M.GEN`/`E.GEN`) — tercatat di `coverage.json` untuk verifikasi manual.
- Hasil terbaik diverifikasi (anchor `2.2.2.4.4`): Pekerja L.01=0,1088;
  Tukang L.02=0,0544; Mandor L.04=0,0109. ✓
