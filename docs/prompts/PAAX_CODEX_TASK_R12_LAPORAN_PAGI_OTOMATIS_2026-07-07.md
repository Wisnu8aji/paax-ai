# PROMPT CODEX — Task R12: Laporan Pagi Otomatis (AI Proaktif v1.5 Tahap 1)

> Ditulis Claude, 2026-07-07, reasoning tinggi. Bagian dari
> `docs/prompts/PAAX_CODEX_ROADMAP_10_TASKS_NON_UI_2026-07-07.md` (Task 12).
> **WAJIB setelah** Task R6 (DB proyek) dan R7 (tool-loop orchestrator
> yang diperluas — laporan memakai pola pemanggilan Gemini yang sama).

---

## 0. Konteks

`MASTER_PLAN.md` §9 (AI Proaktif & Tugas Terjadwal) dan roadmap v1.5
menyebut "laporan pagi otomatis" sbg fitur AI proaktif pertama. Ini
**BUKAN** fitur baca-foto/analisa-lapangan (itu Task R14/Site Agent v2.0
— vision-LLM DITUNDA) — ini murni **narasi otomatis di atas angka yang
SUDAH ADA** (progres, warning, item `perlu_review`, deviasi jadwal), sesuai
Aturan Emas: AI menjelaskan, tidak pernah menghitung.

---

## 1. Scope task ini

### 1.1 Generator laporan (Python, di `services/db-api` ATAU service baru
   `services/reports` — REKOMENDASI: service baru kecil, supaya tidak
   membebani `db-api` dengan logic pemanggilan Gemini yang harusnya lebih
   dekat ke `ai-orchestrator`; TAPI kalau kamu menilai lebih murah/simpel
   digabung ke `ai-orchestrator` sbg tool baru `generate_morning_report`,
   itu JUGA valid — putuskan & laporkan alasan, JANGAN bikin dua-duanya).

Fungsi inti: untuk `project_id` tertentu, kumpulkan:
- Progres & warning terbaru dari `projects` (Task R6: `progress`,
  `warnings`, `health`, `last_activity`).
- Item `perlu_review` yang menunggu approval (dari `rab_drafts`/
  `tkg_records` payload JSONB — hitung berapa entry `status=perlu_review`,
  BUKAN parsing ulang gambar).
- Deviasi jadwal: panggil `POST /schedule/s-curve` core-engine (endpoint
  YANG SUDAH ADA, TIDAK BOLEH bikin logic deviasi baru di service ini)
  dengan data RAB tersimpan, bandingkan progres rencana vs `progress`
  aktual tersimpan — **deviasi = angka dari engine, laporan HANYA
  menyalin angka itu, TIDAK menghitung ulang**.

Susun `context` terstruktur dari data di atas, kirim ke Gemini (pola
`generate_json`/REST yang SAMA dgn `ai-orchestrator`/`ai_assist/client.py`
— REUSE, jangan bikin klien Gemini ketiga) dengan system prompt eksplisit:
**"Anda HANYA boleh menarasikan angka yang diberikan di context. DILARANG
menghitung/mengarang angka baru. Kutip angka PERSIS seperti di context."**

### 1.2 Schema `MorningReport` (Pydantic + Zod mirror)

```python
class MorningReport(BaseModel):
    project_id: str
    generated_at: str
    summary: str                     # narasi 2-4 kalimat dari LLM
    highlights: list[str]            # poin positif (dari angka, dikutip)
    concerns: list[str]              # poin risiko/warning (dari angka)
    metrics_snapshot: dict           # angka MENTAH yang dipakai (utk audit,
                                      # bukti narasi tidak mengarang)
    narrative_source: str            # "gemini-2.5-flash" | "rule-based-fallback"
```
`metrics_snapshot` WAJIB disimpan bersama laporan — ini yang membuat
laporan bisa DIAUDIT (bandingkan tiap angka di `summary`/`highlights`/
`concerns` terhadap `metrics_snapshot`, harus cocok).

### 1.3 Endpoint & scheduler

`POST /reports/morning/{project_id}/generate` (on-demand) dan skeleton
untuk **terjadwal** — task ini TIDAK membangun Cloud Scheduler sungguhan
(itu Task R9/infra GCP), CUKUP buat endpoint yang BISA dipanggil cron
eksternal nanti + dokumentasikan command `curl` yang akan dipakai cron di
`docs/RUNBOOK_DEPLOY.md` (Task R9 — tambahkan baris di situ kalau sudah
ada, atau buat catatan terpisah kalau R9 belum jalan).

Simpan hasil (`morning_reports` tabel baru, migrasi Alembic
`0006_morning_reports.py`, kolom sama `MorningReport` + `id`, PK).

### 1.4 Fallback TANPA API key (WAJIB, fallback manual `CLAUDE.md` §2)

Kalau `GEMINI_API_KEY`/`GeminiAiAssistClient.from_env()` return `None` →
`narrative_source="rule-based-fallback"`, `summary` dibangun dari TEMPLATE
STRING sederhana (bukan LLM) yang tetap informatif: `f"Progres {progress}%,
{warnings} warning terbuka, {n_perlu_review} item menunggu review."` —
laporan TETAP dihasilkan, hanya tanpa narasi mengalir.

---

## 2. Test WAJIB

- Generator dengan fake Gemini client → `summary` dihasilkan, DAN test
  **membandingkan setiap angka yang disebut di `summary`/`highlights`/
  `concerns` (parse angka dari string, regex sederhana) terhadap
  `metrics_snapshot`** — angka yang TIDAK ADA di snapshot = FAIL test
  (bukti anti-halusinasi, paling penting).
- Fallback tanpa API key → `narrative_source="rule-based-fallback"`,
  laporan tetap berisi metrik benar.
- Deviasi jadwal: mock respons `/schedule/s-curve` core-engine → angka
  deviasi di laporan SAMA PERSIS dgn respons mock (tidak dihitung ulang
  di service laporan).
- Endpoint on-demand generate → tersimpan ke DB, bisa di-GET lagi.

Jalankan test service yang dibuat/disentuh (baseline sesuai kondisi saat
itu — laporkan angka).

---

## 3. Laporan WAJIB — `report-remote/`

Nama file baru: `report-remote/REPORT_TASKR12_LAPORAN_PAGI_CODEX_<tanggal>.md`.
Isi wajib: (1) keputusan lokasi kode (service baru vs tool ai-orchestrator,
alasan), (2) bukti test anti-halusinasi angka (paling penting, kutip
kasus konkret), (3) contoh 1 laporan lengkap (fixture, bukan data nyata)
dari mode Gemini DAN mode fallback berdampingan, (4) hasil test, (5)
commit + PR.

---

## 4. Pembagian kerja & larangan

- Branch baru dari `main` (pasca-merge R6, R7): `feat/laporan-pagi-otomatis`.
- Commit tanpa `Co-Authored-By`/signature AI.
- PR draft, JANGAN self-merge.
- JANGAN sentuh `apps/web/**`.
- JANGAN biarkan LLM menghitung deviasi/progres sendiri — SEMUA angka
  wajib berasal dari `projects`/`core-engine`, LLM hanya menyalin & menarasikan.
