# REPORT TASK 03 - ANALYZE_DRAWING TOOL AI ORCHESTRATOR

Tanggal: 2026-07-05
Executor: Codex
Branch: `feat/ai-orchestrator-toolcalling`
PR draft: https://github.com/Wisnu8aji/paax-ai/pull/39

## 1. Verifikasi Endpoint Document Intelligence

File diverifikasi hanya untuk dibaca: `services/document-intelligence/app/api/drawing_routes.py`.

Kutipan field yang ditemukan:

```python
class DrawingAnalysisResponse(BaseModel):
    file_id: str
    classification: str
    classification_confidence: Optional[float] = None
    rooms: List[str]
    doors: List[str]
    windows: List[str]
    quantity_candidates: List[QuantityCandidate]
    warnings: List[DrawingWarning]
    tkg_document: Optional[dict] = None
    tkg_text: Optional[str] = None
    metrics: Optional[dict] = None
    gerbang: Optional[dict] = None
    consolidated: Optional[dict] = None

class AnalyzeJobStatus(BaseModel):
    job_id: str
    status: str  # PENDING | PROCESSING | COMPLETED | FAILED
    progress_message: Optional[str] = None
    created_at: str
    updated_at: str
    result: Optional[DrawingAnalysisResponse] = None
    error: Optional[str] = None

_ANALYZE_JOBS: dict[str, AnalyzeJobStatus] = {}

@router.get("/analyze/status/{job_id}", response_model=AnalyzeJobStatus)
async def get_analyze_job_status(job_id: str):
    with _ANALYZE_JOBS_LOCK:
        job = _ANALYZE_JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan (mungkin server sudah restart)")
    return job
```

Implikasi: tool `analyze_drawing` harus proxy ke `GET /drawings/analyze/status/{job_id}` dan jujur bila job hilang karena store masih in-memory.

## 2. Implementasi

File baru:

```text
services/ai-orchestrator/src/tools/analyze_drawing.ts
services/ai-orchestrator/tests/tools/analyze_drawing.test.ts
```

File diubah:

```text
services/ai-orchestrator/.env.example
services/ai-orchestrator/README.md
services/ai-orchestrator/src/config.ts
services/ai-orchestrator/src/index.ts
services/ai-orchestrator/src/routes/chat.ts
services/ai-orchestrator/src/tools/registry.ts
services/ai-orchestrator/tests/routes/chat.test.ts
```

Tool baru:

```text
analyze_drawing(job_id)
```

Fungsi:

- Mengecek status job analisa gambar.
- Mengembalikan progress untuk `PENDING`/`PROCESSING`.
- Mengembalikan error untuk `FAILED`.
- Untuk `COMPLETED`, hanya meringkas `consolidated`: jumlah sheet, jumlah elemen, elemen per kategori, jumlah assumption, jumlah assumption dampak tinggi, dan dimensi bangunan.
- Tidak menghitung ulang volume, biaya, atau RAB.

## 3. RED Test Sebelum Implementasi

Perintah:

```powershell
pnpm --filter ai-orchestrator test -- tests/tools/analyze_drawing.test.ts tests/routes/chat.test.ts
```

Output utama:

```text
Cannot find module '../../src/tools/analyze_drawing'
tool tidak dikenal: analyze_drawing
```

Hasil:

```text
Test Files  2 failed (2)
Tests       1 failed | 3 passed (4)
```

## 4. Verifikasi Setelah Implementasi

### Targeted Task 03

```powershell
pnpm --filter ai-orchestrator test -- tests/tools/analyze_drawing.test.ts tests/routes/chat.test.ts
```

```text
Test Files  2 passed (2)
Tests       11 passed (11)
```

### Full AI Orchestrator Test

```powershell
pnpm --filter ai-orchestrator test
```

```text
Test Files  8 passed (8)
Tests       30 passed (30)
```

### Build

```powershell
pnpm --filter ai-orchestrator build
```

```text
tsc --noEmit
exit code 0
```

## 5. Commit

```text
177ff0840da5ea5eb46920de026398b80377c526
feat(ai-orchestrator): add analyze drawing tool
```

## 6. PR

```json
{"baseRefName":"main","headRefName":"feat/ai-orchestrator-toolcalling","isDraft":true,"number":39,"state":"OPEN","title":"feat: add ai orchestrator tool calling service","url":"https://github.com/Wisnu8aji/paax-ai/pull/39"}
```

## 7. Konfirmasi Task 03

- Tidak ada perubahan `apps/web/**`.
- Tidak ada perubahan `services/document-intelligence/**`; file itu hanya dibaca untuk verifikasi kontrak endpoint.
- Commit branch AIO tidak berisi `Co-Authored-By`, `Generated with`, atau signature AI.
- `analyze_drawing` tidak mengarang hasil analisa dan tidak menghitung RAB dari gambar.
- `DOCUMENT_INTELLIGENCE_URL` ditambahkan dengan default `http://localhost:8083`.

## 8. Ringkasan Keseluruhan Chain Task 01-03

### Task 01

Status: selesai.

Branch: `feat/x2-bridging-non-struktur-dinding-atap-kusen-mep`

PR: https://github.com/Wisnu8aji/paax-ai/pull/40

Hasil:

- Perubahan X2 non-struktur yang sudah ada di working tree diverifikasi.
- Bridging dan AI-assist untuk dinding, atap, kusen, dan MEP di-commit.
- Report dibuat: `report-remote/REPORT_TASK01_COMMIT_X2_BRIDGING_CODEX_2026-07-05.md`.
- Test utama: document-intelligence 229 passed/5 skipped, core-engine 280 passed, schemas 12 passed, web 47 passed + tsc exit 0.

### Task 02

Status: selesai.

Branch: `feat/x2-bridging-non-struktur-dinding-atap-kusen-mep`

PR: https://github.com/Wisnu8aji/paax-ai/pull/40

Hasil:

- Ditambahkan AI-assist kuda-kuda baja profil.
- Ditambahkan bridging ke core-engine `/takeoff/baja`.
- Validasi anti-halusinasi memastikan `kg_per_m` wajib berasal dari teks gambar.
- Report dibuat: `report-remote/REPORT_TASK02_BRIDGING_KUDA_KUDA_CODEX_2026-07-05.md`.
- Test utama: document-intelligence 244 passed/5 skipped, core-engine 280 passed, schemas build + 13 passed, web 47 passed + tsc exit 0.

### Task 03

Status: selesai.

Branch: `feat/ai-orchestrator-toolcalling`

PR: https://github.com/Wisnu8aji/paax-ai/pull/39

Hasil:

- Ditambahkan tool ke-7 AI Orchestrator: `analyze_drawing`.
- Tool membaca status job dari document-intelligence dan meringkas `consolidated`.
- README dan env example diperbarui.
- Test utama: ai-orchestrator 30 passed, build exit 0.

### Pending Yang Bukan Scope Chain Ini

- `apps/web` belum di-wiring untuk memanggil `services/ai-orchestrator`. Ini tetap pekerjaan terpisah.
- PR #39 dan PR #40 masih draft dan belum di-merge.

