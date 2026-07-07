# PAAX Document Intelligence

> ⚠️ README ini sebelumnya hanya 2 baris (sangat tertinggal dari kode nyata).
> Diperbarui 2026-07-05 saat audit dokumentasi menyeluruh sesi ini.

Service Python/FastAPI yang membaca **PDF gambar kerja** (denah, tabel
kolom/balok, dst.) dan mengubahnya jadi struktur teranalisis — **TKG
(Transkrip Kanonik Gambar)** — lalu di-bridging ke `services/core-engine`
untuk takeoff volume. Bukan OCR/CV generik: pipeline ini membaca **vektor
PDF asli** (teks + koordinat presisi lewat PyMuPDF), bukan piksel gambar.

> **Aturan emas:** service ini TIDAK PERNAH menetapkan harga/biaya atau
> menghitung volume sendiri — hanya menstruktur data untuk dikirim ke
> `services/core-engine` (`CLAUDE.md` §1, §3).

---

## 1. Pipeline (ringkas)

```
Upload PDF (POST /drawings/analyze/start)
  → per halaman: baca span teks vektor + rotasi (PyMuPDF)
  → gabung jadi Run, kenali grammar notasi (kode tipe/tulangan/dimensi/mutu)
  → baca tabel bergaris nyata (page.find_tables())
  → rekonstruksi grid dari bubble-as + garis-dimensi vektor
  → zone_classifier.py: klasifikasi zona/sheet (footplat, atap, LT.n, dst.)
  → consolidate.py: gabung semua halaman jadi satu registry elemen lintas-zona
  → AI-assist (ai_assist/, fallback paralel saat rule-based gagal — CLAUDE.md §1.1)
  → bridging_*.py: kirim entry siap-hitung ke core-engine /takeoff/*
  → work_items.py: rangkum jadi baris siap tampil (formula_status: dihitung/perlu_review/belum_didukung)
GET /drawings/analyze/status/{job_id} → polling hasil
```

Sheet TANPA teks vektor (hasil scan/foto) → jalur OCR (PaddleOCR, opsional/
lazy, lihat `pyproject.toml` extras `ocr`) — fallback sempit, bukan jalur
utama.

## 2. Endpoint (`app/main.py`)

| Method & Path | Fungsi |
|---|---|
| `GET /health` | Status service |
| `POST /upload`, `/pdf`, `/excel` | Upload file mentah |
| `POST /drawings/analyze/start` | Mulai job analisa PDF (async) |
| `GET /drawings/analyze/status/{job_id}` | Polling hasil (consolidated extraction) |
| `POST /drawings/tkg/work-items` | Kelompokkan consolidated extraction + takeoff item jadi work item siap tampil |

## 3. Struktur kode (`app/perception/`)

- `zone_classifier.py` — klasifikasi zona sheet (footplat/atap/LT.n/situasi/
  tampak/potongan/cover/daftar_gambar).
- `binding.py` — label→grid (murni geometris: bbox vs titik grid + toleransi
  jarak; SENGAJA bukan target AI-assist, tidak ada celah teks di sini).
- `consolidate.py` — gabung semua halaman jadi satu `ConsolidatedExtraction`
  (registry elemen, assumptions, warnings).
- `work_items.py` — kelompokkan registry + takeoff item jadi baris kerja.
- `bridging_tanah.py`, `bridging_dinding.py`, `bridging_atap.py`,
  `bridging_kusen.py`, `bridging_mep.py`, `bridging_kuda_kuda.py`,
  `bridging_arsitektur_area.py` — tiap modul memanggil endpoint
  `/takeoff/*` core-engine yang sesuai untuk kategori elemennya.
- `vector/grid_geometry.py` — rekonstruksi grid dari geometri vektor PDF.
- `ocr/` — adapter PaddleOCR raster (lazy import, opsional).
- `ai_assist/` (dibangun 2026-07-05, `CLAUDE.md` §1.1) — lapisan LLM
  fallback paralel saat rule-based gagal/ambigu:
  - `client.py` — `GeminiAiAssistClient` (REST stdlib `urllib.request` ke
    Gemini 2.5 Flash, tanpa dependency baru) + `NullAiAssistClient`
    (degradasi anggun bila `GEMINI_API_KEY` kosong).
  - `dimension_assist.py`, `zone_assist.py`, `wall_assist.py`,
    `roof_frame_assist.py`, `kusen_assist.py`, `mep_assist.py`,
    `kuda_kuda_assist.py`, `arsitektur_area_assist.py` — satu modul per
    kategori elemen, masing-masing dengan validasi anti-halusinasi
    (usulan harus match teks yang benar-benar diekstrak, rentang wajar,
    enum tertutup bila relevan).

Kategori yang sudah punya bridging penuh (rule-based + AI-assist fallback):
galian footplat, dinding pasangan bata, atap (gording/trekstang/ikatan
angin), kusen (jadwal pintu/jendela), titik MEP, kuda-kuda/profil baja,
arsitektur area (keramik dinding basah/plafon/waterproofing). Sisa 4
sub-domain arsitektur (pondasi batu/lantai/atap miring/aanstamping) — spek
ditulis (`docs/prompts/PAAX_CODEX_TASK_05_*.md`), belum dijalankan.

## 4. Cara Menjalankan

```bash
cd services/document-intelligence
pip install -e .                 # dasar (tanpa OCR)
pip install -e ".[ocr]"          # + PaddleOCR (opsional, besar ~ratusan MB)
uvicorn app.main:app --reload --port 8083
python -m pytest -q
```

Environment opsional: `GEMINI_API_KEY` (aktifkan lapisan AI-assist;
tanpanya, degradasi anggun ke `NullAiAssistClient` — semua fitur rule-based
tetap jalan).

## 5. Status & referensi

Status detail (test count, gap per kategori, PR terkait): `docs/ai-map/
STATE.md`. Peta lokasi kode & endpoint lengkap: `docs/ai-map/MAP.md`. Spek
rumus takeoff yang dipanggil bridging: `docs/BRAIN_ALIGNMENT.md` §4 &
`docs/specs/brain-v4.1/`.
