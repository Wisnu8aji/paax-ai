# PROMPT SAYA — Task R14: Scaffold Site Agent v2.0 (API Progres Lapangan)

> Ditulis Saya, 2026-07-07, reasoning tinggi. Bagian dari
> `docs/prompts/PAAX_SAYA_ROADMAP_10_TASKS_NON_UI_2026-07-07.md` (Task 14).
> **WAJIB setelah** Task R6 (DB proyek) dan R10 (auth/RBAC — peran
> `lapangan` dipakai langsung di sini).
>
> **PENTING (operasional)**: SEGERA `git add` + commit file prompt ini
> di AWAL branch task SEBELUM menulis kode — insiden 2026-07-07
> membuktikan file prompt tak-ter-commit bisa hilang saat checkout/
> cleanup branch berikutnya.

---

## 0. Konteks — folder KOSONG, scaffold murni

`services/site-agent/` **TIDAK ADA SAMA SEKALI** di repo saat ini
(diverifikasi: `find services/site-agent` kosong) — walau disebut di
`SAYA.md` §3/§4 sbg lapis "2C — Site Agent" dan halaman
`apps/web/.../site-agent/page.tsx` SUDAH ADA di frontend (status
`[roadmap v2.0]` per `docs/pages/site-agent.md`) menampilkan data MOCK.
Task ini adalah **scaffold backend PERTAMA** — bukan fitur lengkap v2.0
(analisa foto AI, weather impact, dsb TETAP di masa depan), HANYA:
API laporan harian tersimpan + perbandingan deterministik rencana-vs-
realisasi.

**Batas paling penting** (`docs/pages/site-agent.md` §Peran AI, kutip):
*"AI tidak menetapkan % progres final tanpa konfirmasi manusia; tidak
mengarang angka deviasi."* — task ini menegakkan itu di level API: field
`actual_progress_pct` HANYA bisa diisi manusia (`role=lapangan/pm/owner`
via Task R10), TIDAK PERNAH oleh proses otomatis.

---

## 1. Scope task ini

### 1.1 Scaffold service baru

`services/site-agent/` (Python/FastAPI, pola SAMA `services/core-engine`
— `pyproject.toml`, `app/main.py`, `app/models.py`, `tests/`). Port `8085`
(cek tidak konflik `.saya/launch.json`). Dependency: `paax-schemas`
(shared types, WAJIB sejak Fase X1B — pola sama service lain).

### 1.2 Model & endpoint

```python
class SiteLogInput(BaseModel):
    project_id: str
    date: str  # ISO date
    weather: Optional[str] = None       # 'cerah'|'mendung'|'hujan_ringan'|'hujan_deras'
    workers_count: Optional[int] = None
    notes: Optional[str] = None
    actual_progress_pct: float          # WAJIB diisi manusia, 0-100
    photo_refs: list[str] = []          # path/URL foto, HANYA referensi -
                                          # analisa AI atas foto DITUNDA (§0)

class DeviationResult(BaseModel):
    project_id: str
    date: str
    planned_progress_pct: float         # dari POST /schedule/s-curve core-engine
    actual_progress_pct: float          # dari SiteLogInput manusia
    deviation_pct: float                # actual - planned, DIHITUNG DI SINI
                                          # (rumus aritmetika sederhana boleh
                                          # di service ini KARENA cuma
                                          # pengurangan 2 angka yang SUDAH
                                          # dihitung engine/manusia -
                                          # BUKAN pelanggaran Aturan Emas,
                                          # sama kelas dgn frontend menampilkan
                                          # selisih - TAPI kalau ragu, PANGGIL
                                          # BALIK core-engine utk hitung ini,
                                          # jangan asumsi aman tanpa verifikasi
                                          # ke SAYA.md §1 dulu)
    status: str  # 'on_track' | 'behind' | 'ahead'
```

Endpoint:
```
POST /site-logs                          simpan laporan harian
GET  /site-logs?project_id=...&from=...&to=...   riwayat laporan
GET  /site-logs/{project_id}/deviation?date=...  bandingkan rencana vs realisasi
```

### 1.3 Perbandingan rencana-vs-realisasi via engine (WAJIB, bukan lokal)

`GET /deviation` **memanggil** `core-engine POST /schedule/s-curve`
(endpoint YANG SUDAH ADA, `services/core-engine/app/rab/schedule.py`) dgn
data RAB tersimpan (dari `db-api` Task R6) untuk dapat `planned_progress_
pct` pada tanggal itu — **TIDAK mengulang rumus Kurva S sendiri di
site-agent**. `actual_progress_pct` diambil dari `SiteLogInput` tersimpan
manusia. `deviation_pct` = pengurangan sederhana (lihat catatan di §1.2 —
kalau ragu ini melanggar Aturan Emas, STOP dan tanyakan, JANGAN asumsi).

### 1.4 Foto — HANYA referensi, TIDAK ada analisa

`photo_refs: list[str]` disimpan APA ADANYA (path/URL, upload sungguhan
di luar scope — pola sama placeholder kontrak Task lain). **DILARANG
KERAS** memanggil vision-LLM/Gemini Vision di endpoint ini — itu
persis "Vision-LLM v1.0 yang masih ditunda" yang `SAYA.md` §1.1 secara
eksplisit BUKAN scope task ini.

---

## 2. Test WAJIB (`services/site-agent/tests/`)

- `POST /site-logs` menyimpan, `actual_progress_pct` di luar rentang
  0-100 → validasi Pydantic gagal jelas.
- `GET /deviation`: mock `core-engine` response `planned_progress_pct`,
  bandingkan dgn `actual_progress_pct` tersimpan → `deviation_pct` &
  `status` benar (test 3 skenario: `ahead`, `on_track`, `behind` —
  definisikan ambang `on_track` mis. |deviation| ≤ 2% — TENTUKAN &
  DOKUMENTASIKAN ambang ini, jangan biarkan implisit).
- Tidak ada laporan utk tanggal itu → `404` jelas, BUKAN 0 diam-diam.
- **Test negatif penting**: pastikan TIDAK ADA import/pemanggilan library
  vision/Gemini-multimodal di seluruh `app/` service ini (grep test —
  assert modul `google.generativeai`/vision apa pun TIDAK diimport,
  membuktikan §1.4 ditegakkan sbg kode, bukan cuma niat).

Jalankan `pytest -q` service baru ini (baseline 0, laporkan angka test
final, mis. "X passed").

---

## 3. Laporan WAJIB — `report-remote/`

Nama file baru: `report-remote/REPORT_TASKR14_SITE_AGENT_SCAFFOLD_SAYA_<tanggal>.md`.
Isi wajib: (1) struktur service baru lengkap, (2) keputusan §1.2 soal
lokasi hitung `deviation_pct` (STOP-dan-tanya kalau ragu — laporkan hasil
keputusanmu/apakah kamu memilih STOP), (3) ambang `on_track`/`behind`/
`ahead` yang ditetapkan & alasannya, (4) bukti test negatif "tidak ada
vision-LLM diimport" lulus, (5) hasil test lengkap, (6) commit + PR.

---

## 4. Pembagian kerja & larangan

- Branch baru dari `main` (pasca-merge R6, R10): `feat/site-agent-scaffold`.
- Commit tanpa `Co-Authored-By`/signature AI.
- PR draft, JANGAN self-merge.
- JANGAN sentuh `apps/web/**` — halaman site-agent frontend yang sudah
  ada TETAP pakai data mock sampai Saya yang wiring nanti.
- **JANGAN PERNAH** memanggil vision-LLM/analisa foto di task ini — ini
  larangan paling tegas di seluruh roadmap non-UI (Vision-LLM v1.0 tetap
  ditahan per `SAYA.md`).
- `actual_progress_pct` TIDAK PERNAH diisi otomatis oleh proses/AI apa
  pun — hanya input manusia terverifikasi (Task R10).
