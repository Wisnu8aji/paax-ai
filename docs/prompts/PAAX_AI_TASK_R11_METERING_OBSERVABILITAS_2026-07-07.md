# PROMPT SAYA — Task R11: Metering & Observabilitas Biaya AI

> Ditulis Saya, 2026-07-07, reasoning tinggi. Bagian dari
> `docs/prompts/PAAX_SAYA_ROADMAP_10_TASKS_NON_UI_2026-07-07.md` (Task 11).
> **WAJIB setelah** Task R7 (audit log `tool_call_audit` sudah ada) dan
> R10 (auth — metering di-scope per user/project yang sudah terautentikasi).
>
> **PENTING (operasional)**: SEGERA `git add` + commit file prompt ini
> di AWAL branch task SEBELUM menulis kode — insiden 2026-07-07
> membuktikan file prompt tak-ter-commit bisa hilang saat checkout/
> cleanup branch berikutnya.

---

## 0. Konteks

`MASTER_PLAN.md` §12-14 eksplisit: "meter operasi mahal (ekstraksi gambar,
agen) dengan kuota/kredit per paket", "dashboard pemakaian token/kredit
per tenant agar anomali cepat terlihat". Sekarang **NOL metering** — tidak
ada yang menghitung berapa kali Gemini dipanggil, berapa halaman
dianalisa, berapa token terpakai per user/proyek.

Task R7 sudah membangun `tool_call_audit` (mencatat `tokens_in`/
`tokens_out`/`latency_ms` PER tool-call ai-orchestrator). Task ini
memperluas metering ke **document-intelligence** juga (panggilan
AI-assist ke-8 modul) dan membangun AGREGASI + KUOTA di atas keduanya.

---

## 1. Scope task ini

### 1.1 Metering panggilan AI-assist document-intelligence

`app/perception/ai_assist/client.py::GeminiAiAssistClient.generate_json`
(baca ulang, sudah dikutip Task R3) — tambahkan pencatatan tiap panggilan
(sukses maupun gagal) ke tabel baru (migrasi `services/db/`,
`0005_usage_metering.py`):
```sql
CREATE TABLE ai_usage_log (
    id UUID PRIMARY KEY,
    tenant_id TEXT,                  -- owner_id/project_id, boleh NULL kalau tidak diketahui
    service TEXT NOT NULL,           -- 'document-intelligence' | 'ai-orchestrator'
    operation TEXT NOT NULL,         -- 'ai_assist:<modul>' | 'tool_call:<nama>' | 'embedding'
    cache_hit BOOLEAN NOT NULL DEFAULT false,   -- terhubung Task R3
    tokens_in INTEGER, tokens_out INTEGER,
    latency_ms INTEGER,
    success BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_usage_tenant_date ON ai_usage_log(tenant_id, created_at);
```
`GeminiAiAssistClient` butuh cara mengirim log ini ke `db-api` — TAMBAHKAN
parameter opsional `usage_logger: Callable | None` (dependency injection,
BUKAN hardcode ke `db-api` di `client.py` — supaya test tetap tidak perlu
DB nyata; caller di `drawing_routes.py` yang menyuntikkan logger asli).
**Fire-and-forget** sama pola Task R7 §1.3 (kegagalan log TIDAK
menggagalkan pipeline analisa).

### 1.2 Endpoint agregasi pemakaian

`db-api`: `GET /usage/summary?tenant_id=...&period=daily|weekly|monthly` —
agregasi `SUM(tokens_in+tokens_out)`, `COUNT(*)` by `operation`,
`cache_hit ratio` (dari Task R3, sekarang terhubung ke metering nyata).
Response cukup untuk nanti ditampilkan UI (domain Saya, di luar scope
task ini) — task ini HANYA endpoint + agregasi, TIDAK ada tampilan.

### 1.3 Kuota per paket + penolakan halus

`services/db/` tabel `tenant_quota` (`tenant_id, plan, monthly_ai_calls_
limit, monthly_ai_calls_used, reset_at`). Middleware/dependency baru
`check_quota(tenant_id)` di titik masuk panggilan AI (document-intelligence
`_perform_analysis`, ai-orchestrator sebelum tool-call ke LLM) — kalau
`used >= limit`: **JANGAN error 500** — kembalikan respons yang jelas dan
manusiawi (`429` dgn body `{"error": "quota_exceeded", "message": "Kuota
AI bulan ini habis. Upgrade paket atau tunggu reset tanggal <X>.",
"reset_at": "..."}`) DAN pipeline TETAP JALAN dalam mode rule-based-only
(TANPA AI-assist/LLM) — konsisten prinsip fallback manual wajib
(`SAYA.md` §2). Reset kuota: kolom `reset_at`, dicek/direset saat
`check_quota` dipanggil kalau `now() > reset_at` (lazy reset, TIDAK perlu
cron terpisah untuk task ini).

### 1.4 Alarm anomali sederhana

Endpoint `GET /usage/anomalies?tenant_id=...` — bandingkan pemakaian
HARI INI vs rata-rata 7 hari terakhir tenant yang sama; kalau
`today > 3 * avg_7day` (ambang default, via env `ANOMALY_THRESHOLD_
MULTIPLIER`), masuk daftar anomali. **Ini query on-demand, BUKAN job
background/notifikasi push** — cukup untuk tahap ini, notifikasi proaktif
di luar scope.

---

## 2. Kill-switch

`METERING_ENABLED=0` (env, semua service) → seluruh logging metering
no-op TANPA mengubah perilaku pipeline (bukan cuma stats kosong — betul-
betul tidak ada overhead panggilan DB). Sama prinsip Task R3 §4.

---

## 3. Test WAJIB

- `ai_usage_log` terisi benar dari `GeminiAiAssistClient` (fake
  `usage_logger`, assert dipanggil dengan field benar) dan dari
  `tool_call_audit` (Task R7) yang diperluas ikut isi tabel ini
  (KEPUTUSAN: apakah `tool_call_audit` dan `ai_usage_log` digabung jadi
  satu tabel atau tetap 2 tabel terpisah dgn view gabungan — putuskan
  yang lebih bersih, laporkan alasan).
- `check_quota`: `used < limit` → panggilan LLM diizinkan; `used >= limit`
  → `429` + fallback rule-based tetap berjalan DAN mengembalikan hasil
  valid (test end-to-end: analisa PDF dengan kuota habis → tetap dapat
  hasil rule-based, tanpa field AI-assist terisi).
- Reset kuota: `now() > reset_at` → `used` di-reset ke 0 otomatis saat
  `check_quota` dipanggil berikutnya.
- Anomali: tenant dgn pemakaian hari ini 4× rata-rata 7 hari → muncul di
  `/usage/anomalies`; tenant normal → tidak muncul.
- Kill-switch: `METERING_ENABLED=0` → tidak ada baris baru di
  `ai_usage_log` sama sekali setelah panggilan AI (test dengan DB fixture
  bersih, assert tabel tetap kosong).

Jalankan test semua service tersentuh (document-intelligence,
ai-orchestrator, services/db-api) — baseline masing-masing dilaporkan.

---

## 4. Laporan WAJIB — `report-remote/`

Nama file baru: `report-remote/REPORT_TASKR11_METERING_OBSERVABILITAS_SAYA_<tanggal>.md`.
Isi wajib: (1) keputusan skema (gabung/pisah `tool_call_audit` vs
`ai_usage_log`, alasan), (2) bukti fallback rule-based tetap jalan saat
kuota habis (paling penting — kutip test & hasilnya), (3) hasil test
lengkap before/after per service, (4) commit + PR, (5) konfirmasi
kill-switch benar-benar nol-overhead (bukan cuma nol-data).

---

## 5. Pembagian kerja & larangan

- Branch baru dari `main` (pasca-merge R7, R10): `feat/metering-observabilitas`.
- Commit tanpa `Co-Authored-By`/signature AI.
- PR draft, JANGAN self-merge.
- JANGAN sentuh `apps/web/**`.
- JANGAN buat kuota habis = pipeline berhenti total — HARUS fallback
  rule-based, ini prinsip paling penting task ini.
