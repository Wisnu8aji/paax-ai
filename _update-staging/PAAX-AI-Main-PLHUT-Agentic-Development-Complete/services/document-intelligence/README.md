# PAAX Document Intelligence

FastAPI service (Lapis 2A — Persepsi). Membaca PDF/Excel gambar kerja, mengekstrak
elemen & dimensi (vektor PDF via PyMuPDF, fallback OCR PaddleOCR/NVIDIA untuk
raster), menyusun TKG (Transkrip Kanonik Gambar), dan menjembatani hasilnya ke
`services/core-engine` untuk perhitungan (service ini **tidak pernah** menghitung
volume/harga sendiri — lihat `CLAUDE.md`/`AGENTS.md` §1).

## Endpoint (`app/main.py`, semua butuh auth kecuali `/health`)

| Router | Path | Fungsi |
| --- | --- | --- |
| Health | `GET /health` | Status service + provider AI aktif (nvidia/gemini) |
| Upload | `POST /upload` | Upload file mentah |
| PDF | `POST /pdf/process` | Ekstraksi PDF (span, tabel, grid) |
| Excel | `POST /excel/process` | Ekstraksi Excel |
| Drawing | `POST /drawings/analyze`, `/analyze/start` + `GET /analyze/status/{job_id}`, `POST /classify`, `/extract`, `/verify`, `/boq-preview` | Pipeline analisa gambar (sinkron & async job) |
| TKG | `POST /tkg/build`, `/tkg/work-items` | Bangun TKG + kelompokkan jadi work item siap RAB |

## AI-assist (Lapisan 2A, fallback paralel — lihat `CLAUDE.md` §1.1)

`app/perception/ai_assist/client.py` (Gemini) dan
`app/perception/ocr/nvidia_vision_extractor.py` (NVIDIA — OCR/layout/reasoning
gambar) — dua provider tersedia paralel, dipilih via env var yang tersedia.
Rule-based (`zone_classifier.py`, `binding.py`, `consolidate.py`) tetap fast-path
utama; LLM hanya dipanggil saat ekstraksi gagal/ambigu, dan tidak pernah
auto-commit ke input engine.

## Menjalankan lokal

```bash
cd services/document-intelligence
pip install -e .
uvicorn app.main:app --host 127.0.0.1 --port 8083
```

## Test

```bash
python -m pytest -q
# 2026-07-10: 296 passed, 5 skipped
```
