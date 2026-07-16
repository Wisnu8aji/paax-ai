# Laporan Implementasi: Tahap E — Project Summary Views (Langkah 3-4)

**Tanggal:** 2026-07-16  
**Oleh:** Antigravity (Gemini 3.5 Flash High)  
**Status Pekerjaan:** Selesai, uncommitted (worktree aman)  

---

## 1. Skema yang Ditambahkan

Sesuai dengan kesepakatan **Sintesis Diskusi 3-Arah** bagian 3.2, skema Pydantic (Python) dan Zod (TypeScript) telah ditambahkan dan diselaraskan secara penuh (Aturan Emas §2).

### 1.1 Skema Pydantic (`services/document-intelligence/app/project_graph/models.py`)

```python
class SummaryViewGrain(BaseModel):
    building_id: Optional[str] = None
    level_id: Optional[str] = None
    discipline: Optional[str] = None
    zone_id: Optional[str] = None


class ElementTypeIndexEntry(BaseModel):
    element_type_id: str
    name: str
    occurrence_count: int


class DisciplineCountEntry(BaseModel):
    discipline: str
    occurrence_count: int


class StoredMeasurementFact(BaseModel):
    name: str
    value: Union[str, float, int]
    unit: str
    evidence_refs: list[str] = Field(default_factory=list)


class SummaryPayload(BaseModel):
    level_name: str
    element_type_index: list[ElementTypeIndexEntry] = Field(default_factory=list)
    discipline_counts: list[DisciplineCountEntry] = Field(default_factory=list)
    stored_measurement_facts: list[StoredMeasurementFact] = Field(default_factory=list)


class QualityPayload(BaseModel):
    confirmed_count: int
    ambiguous_binding_count: int
    conflict_count: int
    ambiguous_binding_ids: list[str] = Field(default_factory=list)
    conflict_ids: list[str] = Field(default_factory=list)


class ProvenancePayload(BaseModel):
    source_document_ids: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    summary_builder_version: str


class ProjectGraphSummaryView(BaseModel):
    schema_version: Literal["paax.pckm.summary-view.v1"] = "paax.pckm.summary-view.v1"
    project_id: str
    snapshot_id: str
    view_kind: Literal["LEVEL_OVERVIEW"] = "LEVEL_OVERVIEW"
    grain: SummaryViewGrain
    summary: SummaryPayload
    quality: QualityPayload
    provenance: ProvenancePayload
```

### 1.2 Skema Zod (`packages/schemas/src/index.ts`)

```typescript
export const SummaryViewGrainSchema = z.object({
  building_id: z.string().nullable().optional(),
  level_id: z.string().nullable().optional(),
  discipline: z.string().nullable().optional(),
  zone_id: z.string().nullable().optional(),
});
export type SummaryViewGrain = z.infer<typeof SummaryViewGrainSchema>;

export const ElementTypeIndexEntrySchema = z.object({
  element_type_id: z.string(),
  name: z.string(),
  occurrence_count: z.number().int().nonnegative(),
});
export type ElementTypeIndexEntry = z.infer<typeof ElementTypeIndexEntrySchema>;

export const DisciplineCountEntrySchema = z.object({
  discipline: z.string(),
  occurrence_count: z.number().int().nonnegative(),
});
export type DisciplineCountEntry = z.infer<typeof DisciplineCountEntrySchema>;

export const StoredMeasurementFactSchema = z.object({
  name: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string(),
  evidence_refs: z.array(z.string()).default([]),
});
export type StoredMeasurementFact = z.infer<typeof StoredMeasurementFactSchema>;

export const SummaryPayloadSchema = z.object({
  level_name: z.string(),
  element_type_index: z.array(ElementTypeIndexEntrySchema).default([]),
  discipline_counts: z.array(DisciplineCountEntrySchema).default([]),
  stored_measurement_facts: z.array(StoredMeasurementFactSchema).default([]),
});
export type SummaryPayload = z.infer<typeof SummaryPayloadSchema>;

export const QualityPayloadSchema = z.object({
  confirmed_count: z.number().int().nonnegative(),
  ambiguous_binding_count: z.number().int().nonnegative(),
  conflict_count: z.number().int().nonnegative(),
  ambiguous_binding_ids: z.array(z.string()).default([]),
  conflict_ids: z.array(z.string()).default([]),
});
export type QualityPayload = z.infer<typeof QualityPayloadSchema>;

export const ProvenancePayloadSchema = z.object({
  source_document_ids: z.array(z.string()).default([]),
  evidence_ids: z.array(z.string()).default([]),
  summary_builder_version: z.string(),
});
export type ProvenancePayload = z.infer<typeof ProvenancePayloadSchema>;

export const ProjectGraphSummaryViewSchema = z.object({
  schema_version: z.literal("paax.pckm.summary-view.v1").default("paax.pckm.summary-view.v1"),
  project_id: z.string(),
  snapshot_id: z.string(),
  view_kind: z.literal("LEVEL_OVERVIEW").default("LEVEL_OVERVIEW"),
  grain: SummaryViewGrainSchema,
  summary: SummaryPayloadSchema,
  quality: QualityPayloadSchema,
  provenance: ProvenancePayloadSchema,
});
export type ProjectGraphSummaryView = z.infer<typeof ProjectGraphSummaryViewSchema>;
```

---

## 2. Hasil Test Pass/Fail Lengkap

Semua test suite pada Python dan TypeScript berjalan dengan sukses 100%.

### 2.1 Python Document Intelligence (pytest)
- **Status:** **417 Passed, 5 Skipped**
- **Test Baru yang Ditambahkan (5 test di `tests/test_project_graph_validation.py`):**
  1. `test_compile_level_overview_multiple_occurrences`: Menguji 2 occurrence element_type yang sama di 1 level. (Hasil: `occurrence_count=2`).
  2. `test_compile_level_overview_ambiguous_binding`: Menguji occurrence dengan edge `POSSIBLY_SAME_AS` masuk ke `ambiguous_binding_ids` dan tidak masuk ke `confirmed_count`.
  3. `test_compile_level_overview_empty_level`: Menguji level tanpa occurrence sama sekali menghasilkan summary kosong tanpa error.
  4. `test_compile_level_overview_scope_leak`: Menguji check scope leak (occurrence di level lain tidak ikut terhitung).
  5. `test_compile_level_overview_measurement_facts`: Menguji facts dimensi visual (`dimension`) dengan unit dan `evidence_refs` diekstraksi ke `stored_measurement_facts`.

### 2.2 TypeScript/Zod (jest & tsup)
- **Status Build (`tsup`):** Sukses (CJS, ESM, dan DTS berhasil di-generate).
- **Status Test (`jest`):** **27 Passed, 27 Total** (semua skema parser aman).

---

## 3. Konfirmasi Eksplisit Kepatuhan Aturan Emas (AI Tidak Pernah Menghitung)

Fungsi `compile_level_overview` yang diimplementasikan di `services/document-intelligence/app/project_graph/summary_builder.py` mematuhi Aturan Emas (§1):
1. **Bebas AI:** Fungsi ini murni deterministik berbasis lookup node & edge. Tidak ada pemanggilan model AI apa pun di dalamnya.
2. **Nol Aritmatika RAB/Volume:** Tidak ada operasi perkalian dimensi, penjumlahan volume, penentuan luas area, atau kalkulasi biaya (BoQ/RAB/HSP).
3. **Murni distinct count:** Field `occurrence_count` murni menghitung cacah *distinct* node ID element_occurrence yang memiliki edge `LOCATED_ON` ke level bersangkutan.
4. **Fakta Gambar Asli:** Field `stored_measurement_facts` hanya menyaring nilai dimensi yang memang tertulis (terdeteksi) pada gambar asli lengkap dengan `evidence_refs` dan `unit`, tanpa melakukan modifikasi atau penghitungan turunan terhadap angka tersebut.
