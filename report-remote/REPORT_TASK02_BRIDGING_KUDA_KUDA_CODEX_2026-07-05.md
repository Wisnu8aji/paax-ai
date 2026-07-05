# REPORT TASK 02 - BRIDGING KUDA-KUDA BAJA PROFIL

Tanggal: 2026-07-05
Executor: Codex
Branch: `feat/x2-bridging-non-struktur-dinding-atap-kusen-mep`
PR draft: https://github.com/Wisnu8aji/paax-ai/pull/40

## 1. Verifikasi Field Core-Engine Baja

File diverifikasi: `services/core-engine/app/takeoff/models.py`

Kutipan field yang ditemukan:

```python
class ManualTakeoffResult(BaseModel):
    domain: Literal["tanah", "dinding", "arsitektur", "baja", "atap", "kusen", "mep", "smkk"]
    items: List[TakeoffLine] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    params_used: List[ParamUsed] = Field(default_factory=list)
    n_needs_review: int = 0

class ProfileData(BaseModel):
    kg_per_m: float
    perimeter_m: Optional[float] = None

class BajaMember(BaseModel):
    kode: str
    designation: str
    length_m: float
    qty: int = 1

class BajaRequest(BaseModel):
    profile_table: dict[str, ProfileData] = Field(default_factory=dict)
    members: List[BajaMember] = Field(default_factory=list)
    builtup_plates: List[BuiltUpPlate] = Field(default_factory=list)
    paint_members: List[BajaMember] = Field(default_factory=list)
    params: BajaParams = Field(default_factory=BajaParams)
```

Implikasi: `profile_table` harus diisi dari data teks gambar. Sistem tidak boleh mengarang berat profil baja.

## 2. Implementasi

File baru:

```text
services/document-intelligence/app/perception/ai_assist/kuda_kuda_assist.py
services/document-intelligence/app/perception/bridging_kuda_kuda.py
services/document-intelligence/tests/test_perception_bridging_kuda_kuda.py
```

File diubah:

```text
services/document-intelligence/app/perception/consolidated_models.py
services/document-intelligence/app/perception/consolidate.py
services/document-intelligence/app/perception/work_items.py
services/document-intelligence/app/api/tkg_routes.py
services/document-intelligence/tests/test_perception_ai_assist.py
services/document-intelligence/tests/test_perception_consolidate.py
packages/schemas/src/index.ts
packages/schemas/src/__tests__/schemas.test.ts
```

## 3. Bukti Anti-Halusinasi Berat Baja

Test utama:

```python
def test_kuda_kuda_assist_rejects_standard_weight_when_not_sourced_from_text():
    """Nilai bisa saja benar menurut tabel baja umum, tapi kalau angka itu
    tidak ada di teks gambar, tetap wajib ditolak."""
```

Hasil test targeted setelah implementasi:

```text
89 passed, 1 skipped in 2.41s
```

Makna test: jika model mengisi `kg_per_m` dari pengetahuan umum tabel baja, tetapi angka itu tidak ada di `source_texts` dan `detail_texts`, hasil wajib `None`. Ini mencegah berat profil baja masuk dari tebakan model.

## 4. RED Test Sebelum Implementasi

Python sebelum implementasi:

```text
ModuleNotFoundError: No module named 'app.perception.ai_assist.kuda_kuda_assist'
ModuleNotFoundError: No module named 'app.perception.bridging_kuda_kuda'
2 errors in 2.37s
```

Schemas sebelum implementasi:

```text
TypeError: Cannot read properties of undefined (reading 'parse')
AiKudaKudaSuggestionSchema › parses complete kuda-kuda profile suggestion
Test Suites: 1 failed, 1 total
Tests:       1 failed, 12 passed, 13 total
```

## 5. Verifikasi Setelah Implementasi

### Targeted Python

```powershell
cd services/document-intelligence
python -m pytest -q tests/test_perception_ai_assist.py tests/test_perception_bridging_kuda_kuda.py tests/test_perception_consolidate.py
```

```text
89 passed, 1 skipped in 2.41s
```

### document-intelligence penuh

```powershell
cd services/document-intelligence
python -m pytest -q
```

```text
244 passed, 5 skipped, 2 warnings in 39.29s
```

### core-engine penuh

```powershell
cd services/core-engine
python -m pytest -q
```

```text
280 passed, 1 warning in 19.59s
```

### packages/schemas

```powershell
cd packages/schemas
pnpm build
pnpm test
```

```text
Build success
Test Suites: 1 passed, 1 total
Tests:       13 passed, 13 total
```

### apps/web tambahan karena shared schema berubah

```powershell
cd apps/web
pnpm vitest run
pnpm tsc --noEmit
```

```text
Test Files  13 passed (13)
Tests       47 passed (47)
```

`pnpm tsc --noEmit` exit code 0.

## 6. Commit

```text
79ee1f03a2dfe8bb2349153bd16cac84100bdc20
feat(document-intelligence): bridge kuda-kuda baja profil
```

## 7. PR

```json
{"baseRefName":"feat/fase-x1b-packaging-binding-footplat","headRefName":"feat/x2-bridging-non-struktur-dinding-atap-kusen-mep","isDraft":true,"number":40,"state":"OPEN","title":"feat: AI-assist bridging non-struktur","url":"https://github.com/Wisnu8aji/paax-ai/pull/40"}
```

## 8. Konfirmasi

- Tidak ada perubahan `apps/web/**` pada diff Task 02 terhadap base X1B.
- Tidak ada `Co-Authored-By`, `Generated with`, atau signature AI pada commit branch ini.
- `kg_per_m` hanya diterima bila angka muncul di `source_texts` yang juga harus berasal dari `detail_texts`.
- Kuda-kuda memakai `/takeoff/baja` melalui `HttpBajaTakeoffClient`, bukan menghitung ulang di document-intelligence.
- `services/core-engine/app/takeoff/baja.py` tidak diubah.

