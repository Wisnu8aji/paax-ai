> **STATUS: HISTORICAL/SUPERSEDED** -- lihat [DI_SOURCE_OF_TRUTH.md](file:///G:/paax-ai-main/docs/plans/drawing%20intelligence/DI_SOURCE_OF_TRUTH.md) untuk kondisi terkini

# DEM Phase 2 — Job Orchestrator Design

> Spec ini adalah Fase 2 dari `docs/plans/drawing intelligence/PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md`
> (§7-8, task list "Phase 2 — DEM Job Orchestrator"). Fase 0+1 (skema DEM/PCKM
> Pydantic+Zod) sudah selesai — lihat `docs/adr/0005-dem-pckm-graph-retrieval.md`
> dan `docs/superpowers/plans/2026-07-14-dem-pckm-phase0-1-schemas.md`.

## Tujuan

88 halaman gambar kerja (fixture: `docs/plans/drawing intelligence/Gambar kerja/
GAMBAR KERJA PLHUT SURAKARTA (1).pdf`, diverifikasi 88 halaman via PyMuPDF)
dapat diproses lewat AI vision (Qwen3.7-Plus/DashScope) menjadi satu
`DrawingEvidenceSheet` valid per halaman (schema sudah ada,
`services/document-intelligence/app/transcription/models.py`), tahan restart,
bisa di-resume tanpa mengulang halaman yang sudah selesai, dan gagal dengan
alasan yang jelas per halaman (bukan retry buta).

Ini murni Fase 2 — tidak menghasilkan PCKM (Fase 3) dan tidak terhubung ke
Command Room (Fase 5). Output akhir: N baris `DrawingEvidenceSheet` tersimpan
di Postgres, bisa diaudit satu per satu.

**Aturan Emas tetap berlaku:** AI vision hanya mengisi field `DrawingEvidenceSheet`
yang sudah ada (transkrip evidence per halaman) — tidak pernah menghitung
volume/luas/RAB. Setiap fakta tetap wajib `confidence` + `evidence_refs` +
`status`, sesuai schema Fase 0+1.

## Keputusan yang sudah dikonfirmasi user

- Cakupan: Fase 2 penuh (13 task §7, bukan dipecah sub-fase).
- Provider vision: **Qwen3.7-Plus via DashScope**, reasoning effort **xhigh**
  (maksimal), API key TERPISAH dari Command Room (`DEM_EXTRACTION_PROVIDER`/
  `DEM_EXTRACTION_API_KEY`/`DEM_EXTRACTION_BASE_URL`/`DEM_EXTRACTION_MODEL` di
  `.env.example`/`.env.local`, sudah disiapkan kosong 2026-07-14).
- Persistensi: **Postgres via `services/db`** (Alembic migration), bukan file
  JSON lokal — supaya resume (§7.7) benar-benar tahan restart proses.
- Retry: **bukan retry buta N kali** — setiap kegagalan diklasifikasi dulu,
  baru ditentukan tindakannya (detail di bawah). Selama pengembangan/pengujian
  fase ini, kegagalan yang ditemukan diperbaiki langsung di kode (root cause),
  bukan dibiarkan jadi retry loop untuk user akhir nanti.

## Arsitektur

```
POST /drawings/dem/start (upload PDF)
        |
        v
  document hash + create dem_runs row (status=created)
        |
        v
  render semua N halaman -> page-NN.png (PyMuPDF)
        |
        v
  buat dem_pages row per halaman (status=queued)
        |
        v
  page worker loop (2 concurrent worker awal, §7.5)
   |- render (kalau belum) -> calling_model (Qwen vision) -> parse+validate -> simpan DrawingEvidenceSheet
   |- gagal -> klasifikasi -> retry_wait ATAU repair-pass ATAU failed (lihat "Klasifikasi kegagalan")
   `- output kepotong token -> continuation loop (§8, base_result_hash + cursor) sampai is_complete=true
        |
        v
  semua halaman terminal -> validasi manifest -> tandai dem_complete / partially_failed
        |
        v
  GET /drawings/dem/{run_id}/status -> progress per halaman
```

## Klasifikasi kegagalan (bukan retry buta)

Motivasi: retry identik N kali pada kegagalan sistemik (prompt salah, encoding
gambar salah, format request salah) membuang biaya/waktu tanpa pernah berhasil,
dan bisa terlihat seperti "looping terus menerus" ke pengguna. Setiap kegagalan
`calling_model` diklasifikasi dulu:

1. **`transient`** (timeout, rate-limit 429, 5xx dari provider)
   → `retry_wait` dengan backoff, percobaan diulang **sama persis** — ini
   satu-satunya kasus yang boleh retry buta, karena penyebabnya di luar kendali
   kita dan permintaan yang sama punya peluang berhasil di percobaan berikutnya.

2. **`invalid_output`** (JSON rusak, gagal validasi Pydantic `DrawingEvidenceSheet`,
   field wajib kosong)
   → **JANGAN** retry sama persis. Satu kali **repair pass**: kirim balik output
   yang gagal + pesan error validasi spesifik (bukan prompt generik "coba lagi"),
   minta model perbaiki hanya bagian yang salah.
   → Repair pass gagal juga → langsung `failed`, simpan pesan error validasi ASLI
   di kolom `dem_pages.error` (bukan pesan digeneralisasi) supaya penyebab
   sebenarnya terlihat jelas per halaman.

3. **`permanent`** (401/403 auth salah, 400 request salah/gambar corrupt)
   → langsung `failed`, tidak ada retry sama sekali — kegagalan jenis ini tidak
   akan pernah berhasil hanya dengan diulang.

`dem_pages.attempt_count` naik untuk kasus 1 dan 2 (repair pass dihitung sebagai
1 attempt tambahan), tidak untuk kasus 3. Batas retry transient: 3 percobaan
dengan backoff eksponensial (1s/4s/16s) sebelum jatuh ke `failed`.

## State machine

**Document job** (`dem_runs.status`, §7.2):
```
created -> preprocessing -> pages_queued -> transcribing -> validating
-> dem_complete
```
Status tambahan: `partially_failed`, `cancelled`, `requires_review`.

**Page task** (`dem_pages.status`, §7.3):
```
queued -> rendering -> calling_model -> validating -> complete
```
Cabang gagal: `calling_model -> retry_wait -> calling_model` (transient),
atau langsung `-> failed` (permanent/invalid_output setelah repair pass gagal).

## Continuation (§8, output kepotong max token)

Ditangani DI DALAM alur satu halaman (bukan entitas terpisah dari retry) — kalau
`DrawingEvidenceSheet.completion.is_complete == false`, halaman tetap `calling_model`
dan dikirim `ContinuationPatch` request: `base_result_hash` (hash hasil sebagian
sebelumnya, mencegah patch nyasar ke versi salah) + `cursor` (posisi lanjut).
Server menggabungkan patch secara deterministik (bukan mengirim ulang seluruh
JSON). Loop berhenti begitu `is_complete == true` atau continuation gagal
diklasifikasi ulang lewat aturan yang sama di atas.

## Skema Postgres (migration `0008`, Alembic — ikut pola `services/db/alembic/versions/0007_command_room_memory.py`)

```python
op.create_table(
    'dem_runs',
    sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
    sa.Column('project_id', sa.String(), nullable=True),
    sa.Column('document_id', sa.String(), nullable=False),
    sa.Column('document_hash', sa.String(), nullable=False),
    sa.Column('file_name', sa.String(), nullable=False),
    sa.Column('total_pages', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(), nullable=False, server_default='created'),
    sa.Column('provider', sa.String(), nullable=False),
    sa.Column('prompt_version', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
)
op.create_index(op.f('ix_dem_runs_project_id'), 'dem_runs', ['project_id'], unique=False)
op.create_index(op.f('ix_dem_runs_document_hash'), 'dem_runs', ['document_hash'], unique=False)

op.create_table(
    'dem_pages',
    sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
    sa.Column('run_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('dem_runs.id', ondelete='CASCADE'), nullable=False),
    sa.Column('page_index', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(), nullable=False, server_default='queued'),
    sa.Column('attempt_count', sa.Integer(), nullable=False, server_default='0'),
    sa.Column('failure_kind', sa.String(), nullable=True),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('input_hash', sa.String(), nullable=True),
    sa.Column('result', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
)
op.create_index(op.f('ix_dem_pages_run_id'), 'dem_pages', ['run_id'], unique=False)
op.create_index('idx_dem_pages_run_page', 'dem_pages', ['run_id', 'page_index'], unique=True)
```

`status` sebagai String (bukan Postgres ENUM), mengikuti konvensi yang sudah
didokumentasikan di `0007_command_room_memory.py` — menambah varian status baru
tidak butuh migrasi `ALTER TYPE` terpisah, validasi nilai di application layer.

`dem_pages.result` menyimpan `DrawingEvidenceSheet` penuh (JSONB) setelah sukses
— tidak ada tabel continuation-patch terpisah; continuation adalah bagian dari
mengisi satu halaman, bukan entitas berbeda.

## Idempotency (§7.6)

Idempotency key = `document_hash + page_index + page_render_hash + schema_version
+ prompt_version + model_alias`. Sebelum memanggil model, cek `dem_pages.input_hash`
halaman yang sama — kalau kombinasi sama dan `status == complete`, jangan panggil
model ulang (dipakai juga saat resume, §7.7: halaman 1-46 complete tidak diulang,
mulai dari task non-terminal pertama).

## Provider adapter

Interface provider-agnostic (Qwen implementasi pertama, sesuai keputusan user):

```python
class DemVisionProvider(Protocol):
    async def extract_page(
        self,
        image_bytes: bytes,
        page_context: PageContext,
        prompt_version: str,
    ) -> DemExtractionResult:
        """Raises DemProviderError(kind=transient|invalid_output|permanent)."""
```

**`QwenDemAdapter`** (`services/document-intelligence/app/transcription/providers/qwen.py`):
- Base URL/API key/model dari `DEM_EXTRACTION_BASE_URL`/`DEM_EXTRACTION_API_KEY`/
  `DEM_EXTRACTION_MODEL` (env terpisah dari `DASHSCOPE_API_KEY` milik Arete/Command
  Room — tidak boleh tercampur, sesuai instruksi user).
- Model: `qwen3.7-plus`, **reasoning effort xhigh** (parameter maksimal yang
  didukung DashScope untuk model ini — dipetakan ke field request yang sesuai;
  kalau provider tidak mengekspos parameter reasoning effort untuk endpoint
  vision yang dipakai, dicatat eksplisit di konfigurasi adapter, bukan diam-diam
  diabaikan).
- Mengirim gambar halaman (base64) + strict prompt (lihat "Strict prompt" di
  bawah) yang meminta output JSON sesuai schema `DrawingEvidenceSheet`.
- Klasifikasi error HTTP provider -> `transient` (429/5xx/timeout), `permanent`
  (401/403/400), selainnya diteruskan ke parser sebagai kandidat `invalid_output`.

**`MockDemAdapter`** (test-only): kontrak sama, fixture respons tetap, dipakai
di semua test job-orchestrator supaya suite tidak memanggil DashScope sungguhan.

## Strict prompt (§7 Task 6)

Prompt versi `dem-extraction-v1.0.0` (field `DemGeneration.prompt_version`)
meminta model:
- Mengembalikan HANYA JSON valid sesuai bentuk `DrawingEvidenceSheet` (tanpa
  markdown fence, tanpa teks penjelasan di luar JSON).
- Setiap fakta wajib `confidence` (0.0-1.0) + `evidence_refs` (ID yang merujuk
  balik ke `evidence[]` di halaman yang sama) + `status` yang sesuai
  (`extracted|ai_interpreted|ambiguous|conflicting|missing`).
- TIDAK PERNAH menghitung nilai turunan (luas dari dimensi, dst) — hanya
  mentranskrip apa yang tertulis/tergambar (Aturan Emas).
- Kalau output akan terpotong karena batas token, isi `completion.is_complete=false`
  + `completion.next_cursor` menunjuk section yang belum selesai (bukan
  memotong JSON di tengah struktur).

## Endpoint baru

`services/document-intelligence/app/api/dem_routes.py` (pola sama seperti
`drawing_routes.py` yang baru diarsipkan ke
`G:\paax-cleanup-archive\2026-07-14-tkg-drawing-analysis-legacy\`, tapi
implementasi baru — tidak menyalin kode lama):

```
POST /drawings/dem/start
  Body: multipart file upload (PDF) + project_id opsional
  -> membuat dem_runs + dem_pages, memulai job loop di background, return run_id

GET /drawings/dem/{run_id}/status
  -> { status, total_pages, pages: [{page_index, status, attempt_count, failure_kind, error}] }
  (Task 12-13 §7: status endpoint + basis progress UI minimal)
```

Didaftarkan di `services/document-intelligence/app/main.py` dengan
`dependencies=[Depends(get_current_user)]`, mengikuti pola router lain.

## Concurrency (§7.5)

Mulai 2 worker halaman paralel (halaman independen satu sama lain — DEM tidak
butuh konteks halaman lain). Kenaikan ke 4/6 worker adalah tuning pasca-Fase 2,
bukan bagian dari exit criteria fase ini.

## Testing

- `MockDemAdapter` untuk seluruh test unit/integrasi job-orchestrator (tidak
  memanggil DashScope sungguhan dalam suite otomatis).
- Test klasifikasi kegagalan: transient -> retry_wait dengan attempt_count naik;
  invalid_output -> satu repair pass lalu failed dengan pesan asli tersimpan;
  permanent -> langsung failed, attempt_count tidak naik.
- Test idempotency: halaman dengan `input_hash` sama + `status=complete` tidak
  memicu pemanggilan provider ulang.
- Test resume: manifest dengan campuran complete/failed/queued hanya memproses
  ulang task non-terminal.
- Uji manual dengan Qwen sungguhan (bukan bagian test suite otomatis) memakai
  fixture nyata: `docs/plans/drawing intelligence/Gambar kerja/GAMBAR KERJA
  PLHUT SURAKARTA (1).pdf` (88 halaman, diverifikasi PyMuPDF) — dijalankan
  manual oleh user/Codex setelah `DEM_EXTRACTION_API_KEY` diisi di `.env.local`.

## Exit criteria (dari plan, §7)

```text
88-page fixture completes or reports exact failed pages
resume works
no completed page rerun
```

## Di luar cakupan Fase 2 (ditunda ke fase berikutnya)

- PCKM synthesis (Fase 3) — menggabungkan `dem_pages.result` antar halaman jadi
  satu project graph.
- Command Room integration (Fase 5) — tool `query_project_graph` baru.
- Concurrency tuning di atas 2 worker.
- UI progress lengkap (Task 13 hanya "minimal" — cukup untuk memverifikasi
  status via endpoint, bukan komponen React penuh).
