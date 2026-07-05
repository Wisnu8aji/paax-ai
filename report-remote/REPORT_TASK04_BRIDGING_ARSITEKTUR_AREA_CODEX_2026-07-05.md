# REPORT TASK 04 - Bridging Arsitektur Area

Tanggal: 2026-07-05  
Branch: `feat/x2-bridging-non-struktur-dinding-atap-kusen-mep`  
PR: https://github.com/Wisnu8aji/paax-ai/pull/40  
Status PR saat dicek: `OPEN`, `DRAFT`, base `feat/fase-x1b-packaging-binding-footplat`, head branch benar, `MERGEABLE`.

## Ringkasan

Task 4 menjalankan bridging arsitektur berbasis area dari document-intelligence ke core-engine untuk:

- `keramik_dinding`
- `plafon`
- `waterproofing`

Kategori ini tidak punya kode per-instance yang stabil di gambar kerja, jadi jalurnya dibuat seperti dinding: AI-assist membaca catatan teks lintas dokumen, membuat entry sintetis `*-AUTO-1`, lalu work item memakai bridge ke endpoint core-engine `/takeoff/arsitektur`.

Tidak ada perubahan pada `apps/web/**`. Tidak ada perubahan pada rumus core-engine `app/takeoff/arsitektur.py`. Tidak ada perubahan pada `binding.py`.

## Verifikasi Model Core-Engine

File diverifikasi: `services/core-engine/app/takeoff/models.py`.

`ManualTakeoffResult`:

```python
class ManualTakeoffResult(BaseModel):
    domain: Literal["tanah", "dinding", "arsitektur", "baja", "atap", "kusen", "mep", "smkk"]
    items: List[TakeoffLine] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    params_used: List[ParamUsed] = Field(default_factory=list)
    n_needs_review: int = 0
```

`ArsitekturRequest` dan model terkait:

```python
class KeramikDindingBasah(BaseModel):
    kode: str
    keliling_basah_m: float
    h_pasang_m: Optional[float] = None
    bukaan_m2: float = 0.0


class PlafonBidang(BaseModel):
    kode: str
    a_neto_m2: float
    keliling_tepi_m: float = 0.0


class WaterproofingBidang(BaseModel):
    kode: str
    a_bidang_m2: float
    keliling_upstand_m: float = 0.0
    h_upstand_m: Optional[float] = None


class ArsitekturRequest(BaseModel):
    pondasi_batu: List[PondasiBatu] = Field(default_factory=list)
    lantai: List[PenutupLantai] = Field(default_factory=list)
    atap: List[AtapMiring] = Field(default_factory=list)
    aanstamping: List[Aanstamping] = Field(default_factory=list)
    keramik_dinding: List[KeramikDindingBasah] = Field(default_factory=list)
    plafon: List[PlafonBidang] = Field(default_factory=list)
    waterproofing: List[WaterproofingBidang] = Field(default_factory=list)
    params: ArsitekturParams = Field(default_factory=ArsitekturParams)
```

Kesimpulan: payload bridge wajib mengirim list kosong untuk domain arsitektur lain, dan hanya mengisi salah satu dari `keramik_dinding`, `plafon`, atau `waterproofing`.

## Verifikasi WBS Work Items

Isi `_ARCHITECTURE_CATEGORIES` di `services/document-intelligence/app/perception/work_items.py`:

```python
_ARCHITECTURE_CATEGORIES = {"dinding", "lantai", "plafon", "atap", "finishing", "kusen"}
```

Konfirmasi:

- `plafon` sudah ada di set.
- `keramik_dinding` tidak ada.
- `waterproofing` tidak ada.
- Karena itu `keramik_dinding` dan `waterproofing` diarahkan ke `section_for_category("finishing")`.
- `plafon` diarahkan ke `section_for_category("plafon")`.

## Perubahan yang Dikerjakan

File baru:

- `services/document-intelligence/app/perception/ai_assist/arsitektur_area_assist.py`
- `services/document-intelligence/app/perception/bridging_arsitektur_area.py`
- `services/document-intelligence/tests/test_perception_bridging_arsitektur_area.py`

File diubah:

- `services/document-intelligence/app/perception/consolidated_models.py`
- `services/document-intelligence/app/perception/consolidate.py`
- `services/document-intelligence/app/perception/work_items.py`
- `services/document-intelligence/app/api/tkg_routes.py`
- `services/document-intelligence/tests/test_perception_ai_assist.py`
- `services/document-intelligence/tests/test_perception_consolidate.py`
- `services/document-intelligence/tests/test_perception_work_items.py`
- `packages/schemas/src/index.ts`
- `packages/schemas/src/__tests__/schemas.test.ts`

Dokumen task yang ikut dicatat:

- `docs/prompts/PAAX_CODEX_TASK_04_BRIDGING_ARSITEKTUR_KERAMIK_PLAFON_WATERPROOFING_2026-07-05.md`
- `docs/ai-map/STATE.md`

## Detail Implementasi

`arsitektur_area_assist.py`:

- Menambahkan fungsi `suggest_arsitektur_area(kategori, candidate_texts, client)`.
- Mendukung kategori `keramik_dinding`, `plafon`, dan `waterproofing`.
- Memakai fast filter keyword sebelum memanggil client AI.
- Menolak kategori tidak dikenal.
- Menolak source text yang tidak berasal dari teks input.
- Menolak angka yang tidak muncul di source text.
- Field wajib harus ada.
- Field opsional boleh kosong, tetapi kalau diisi tetap wajib lolos validasi angka dan rentang.

`consolidated_models.py`:

- Menambahkan `AiArsitekturAreaSuggestion`.
- Menambahkan field `ai_arsitektur_area_suggestion` di `ElementRegistryEntry`.

`bridging_arsitektur_area.py`:

- Menambahkan `ArsitekturTakeoffClient`.
- Menambahkan `HttpArsitekturTakeoffClient` ke `/takeoff/arsitektur`.
- Menambahkan `bridge_keramik_dinding`.
- Menambahkan `bridge_plafon`.
- Menambahkan `bridge_waterproofing`.
- Payload selalu menyertakan list kosong untuk domain arsitektur lain.

`consolidate.py`:

- Menambahkan `_apply_arsitektur_area_ai_assist`.
- Membuat entry sintetis:
  - `KERAMIK_DINDING-AUTO-1`
  - `PLAFON-AUTO-1`
  - `WATERPROOFING-AUTO-1`
- Entry selalu `status="perlu_review"` karena AI hanya memberi usulan, bukan angka final.

`work_items.py`:

- Menambahkan dispatch fallback untuk 3 kategori arsitektur area.
- Menambahkan parameter `arsitektur_area_client`.
- Work item bisa menjadi `dihitung` jika core-engine tersedia dan mengembalikan quantity valid.
- Jika client tidak tersedia, item tetap muncul sebagai `perlu_review`.

`tkg_routes.py`:

- Meneruskan `HttpArsitekturTakeoffClient.from_env()` ke `build_work_items`.

`packages/schemas/src/index.ts`:

- Menambahkan `AiArsitekturAreaSuggestionSchema`.

## Bukti TDD

RED yang sudah diverifikasi sebelum implementasi:

- `python -m pytest -q tests/test_perception_ai_assist.py tests/test_perception_bridging_arsitektur_area.py tests/test_perception_consolidate.py`
  - Gagal karena modul belum ada:
    - `ModuleNotFoundError: No module named 'app.perception.ai_assist.arsitektur_area_assist'`
    - `ModuleNotFoundError: No module named 'app.perception.bridging_arsitektur_area'`
- `pnpm test` di `packages/schemas`
  - Gagal karena `AiArsitekturAreaSuggestionSchema` belum tersedia:
    - `TypeError: Cannot read properties of undefined (reading 'parse')`

GREEN target setelah implementasi:

- `python -m pytest -q tests/test_perception_ai_assist.py tests/test_perception_bridging_arsitektur_area.py tests/test_perception_consolidate.py tests/test_perception_work_items.py`
  - `120 passed, 1 skipped, 1 warning`
- `pnpm test` di `packages/schemas`
  - `14 passed`

## Verifikasi Lengkap

Baseline sebelum Task 4:

- `services/document-intelligence`: `244 passed, 5 skipped, 2 warnings`
- `services/core-engine`: `280 passed, 1 warning`
- `packages/schemas`: `pnpm build` sukses, `pnpm test` `13 passed`

Setelah Task 4:

- `services/document-intelligence`: `272 passed, 5 skipped, 2 warnings`
- `services/core-engine`: `280 passed, 1 warning`
- `packages/schemas`: `pnpm build` sukses
- `packages/schemas`: `pnpm test` `14 passed`
- `apps/web`: `pnpm test` `13 passed`, `47 passed`
- `apps/web`: `pnpm exec tsc --noEmit` exit code `0`

## Git Log

Output `git log --oneline --decorate -8` setelah commit implementasi:

```text
4a773ad (HEAD -> feat/x2-bridging-non-struktur-dinding-atap-kusen-mep) feat(document-intelligence): bridge arsitektur area takeoff
f51a119 (origin/feat/x2-bridging-non-struktur-dinding-atap-kusen-mep) docs: add task02 kuda-kuda codex report
79ee1f0 feat(document-intelligence): bridge kuda-kuda baja profil
546b265 docs: add task01 x2 bridging codex report
3c431f9 docs: record x2 non-structural bridging context
d0269a1 feat(document-intelligence): add x2 non-structural bridging
8ad346a (origin/feat/fase-x1b-packaging-binding-footplat, feat/fase-x1b-packaging-binding-footplat) docs: record fase x1b pr link
6f355a7 fix(packaging): install shared paax schemas
```

Commit implementasi:

```text
commit 4a773ad061a565102b0f3ce166bb29476faa156d
Author:     Wisnu Setyo Aji <Ajiwisnu187@gmail.com>
AuthorDate: Sun Jul 5 17:36:22 2026 +0700
Commit:     Wisnu Setyo Aji <Ajiwisnu187@gmail.com>
CommitDate: Sun Jul 5 17:36:22 2026 +0700

    feat(document-intelligence): bridge arsitektur area takeoff
```

## Pemeriksaan Batas

- `apps/web/**`: tidak ada diff.
- `services/core-engine/app/takeoff/arsitektur.py`: tidak diubah.
- `services/document-intelligence/app/perception/binding.py`: tidak diubah.
- Commit message tidak memiliki `Co-Authored-By`.
- Tidak ada server yang dijalankan.

## Gap Tersisa

Masih di luar scope Task 4:

- `pondasi_batu` belum di-bridging dari document-intelligence.
- `lantai` belum di-bridging dari document-intelligence.
- `atap` miring arsitektur belum di-bridging dari document-intelligence.
- `aanstamping` belum di-bridging dari document-intelligence.
- AI-assist untuk `binding.py` tidak dikerjakan karena modul tersebut murni geometri, bukan gap teks terstruktur.

## Dampak ke Dashboard

Tidak ada tampilan dashboard yang diubah. Dampaknya bersifat data:

- Jika gambar memuat catatan plafon, keramik dinding basah, atau waterproofing yang jelas, sistem bisa membuat item kerja sintetis.
- Jika core-engine tersedia lewat `PAAX_CORE_ENGINE_URL` atau `CORE_ENGINE_URL`, item tersebut bisa dihitung otomatis lewat `/takeoff/arsitektur`.
- Jika core-engine tidak tersedia atau data wajib tidak lengkap, item tetap muncul sebagai `perlu_review`, bukan mengarang volume.
