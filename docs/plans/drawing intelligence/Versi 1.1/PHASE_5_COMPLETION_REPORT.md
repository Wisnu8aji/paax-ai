# PHASE 5 COMPLETION REPORT
## Mandat: PCKM v2 — Reference vs Physical Element

**Branch:** `feat/drawing-intelligence-truth-rebuild`  
**Status:** Implemented with documented residuals; no push or merge performed.

## 1. Status sub-item 11.1–11.6

### 11.1 Node taxonomy — selesai untuk backend schema

`NodeType` Python dan Zod sekarang mengenal `element_reference`,
`symbol_candidate`, `geometry_candidate`, `physical_element_candidate`,
`physical_element`, `measurement_fact`, dan `work_item_candidate`.
`element_occurrence` existing dipertahankan untuk compatibility dan tidak
dihapus. Pada synthesis, occurrence legacy diberi semantics context group;
physical candidate/verified physical adalah node terpisah.

Temuan kondisi nyata: sebelum fase ini, `element_occurrence` dibuat dari label
yang berhasil diberi konteks level/ruang/grid. Jadi ia bukan physical instance
yang aman untuk quantity, walaupun pola `element_type` → `INSTANCE_OF` sudah
benar secara Type-vs-Occurrence.

### 11.2 Legacy occurrence semantics — selesai

Semua occurrence yang dibuat oleh context grouping memiliki properties:

```json
{
  "occurrence_semantics": "context_group_not_physical",
  "physical_count_eligible": false
}
```

Candidate/verified physical memakai `physical_instance`; hanya verified
physical yang memiliki `physical_count_eligible=true`.

### 11.3 Physical candidate gate — selesai untuk rule-based gate

`physical_element_candidate` hanya dibuat jika seluruh kondisi berikut
terpenuhi: basis symbol/geometry dengan evidence dan bbox yang overlap secara
deterministik dengan label, level nyata, view ID berupa sheet/view sumber,
spatial locator nyata berupa space/grid (fallback `unmapped` ditolak), type
association, dan stable candidate ID.

Legend/notasi/keterangan dan geometry region yang terlalu luas ditolak agar
tidak mengubah label/legend menjadi elemen fisik. Schedule/section/detail-only
path tidak masuk gate occurrence.

### 11.4 Verified physical gate — selesai untuk human verification

Candidate dipromosikan menjadi `physical_element` hanya jika basis, label,
level, dan locator terkait berstatus `human_verified` serta patch tidak punya
conflict terbuka. Status dan property count eligibility ikut dipromosikan.

Deterministic geometry promotion dengan threshold benchmark **belum diaktifkan**;
belum ada benchmark threshold yang menjadi dasar aman untuk auto-verification.

### 11.5 Counts — selesai di audit dan summary PCKM

`SynthesisAudit` dan `SummaryPayload` sekarang memisahkan:

- `label_observation_count`;
- `context_group_count`;
- `physical_candidate_count`;
- `verified_physical_count`.

Legacy `occurrence_count` pada index tetap dipertahankan sebagai context-group
count untuk backward compatibility. Counter quantity-authoritative adalah
`verified_physical_count`; references/context groups tidak dihitung sebagai
verified physical.

### 11.6 Type vs instance — parsial, dengan schedule/section guard selesai

Yang terverifikasi dan diuji: schedule row/table dan section/elevation tidak
membuat physical instance baru; detail/reference tetap menjadi reference atau
property/evidence path. Existing `_is_occurrence_excluded_sheet()` menjadi
guard tersebut.

Residual: producer `element_type` masih dipetakan dari observation
`element_labels` umum pada `page_patch.py`, bukan dibatasi secara eksplisit
hanya pada schedule/detail/legend. Perubahan pembatasan penuh berisiko
mengubah semantics dan fixture legacy tanpa kontrak producer v2 yang lengkap,
sehingga dicatat untuk fase lanjutan.

## 2. Bukti test nyata

- `services/document-intelligence`: seluruh `test_project_graph_*.py` — **123 passed**.
- Fase 5 khusus `test_project_graph_pckm_v2.py` — **5 passed**.
- Regression targeted synthesis/model/summary — **58 passed**.
- `services/db`: seluruh `test_project_graph_*.py` — **55 passed**, 2 warning
  Pydantic deprecation yang sudah ada.
- `packages/schemas`: Jest — **30 passed**.
- `packages/schemas`: `tsc --noEmit` — **lulus**.

Test Fase 5 mencakup schedule tanpa physical node, label tanpa symbol sebagai
context group, symbol + type + level + locator sebagai candidate, human
promotion, dan physical count yang mengecualikan context/reference.

Tidak ada live AI API test.

## 3. File yang diubah

- `services/document-intelligence/app/project_graph/models.py`
- `services/document-intelligence/app/project_graph/cross_sheet_resolver.py`
- `services/document-intelligence/app/project_graph/synthesis.py`
- `services/document-intelligence/app/project_graph/summary_builder.py`
- `services/document-intelligence/app/project_graph/validator.py`
- `services/document-intelligence/tests/test_project_graph_pckm_v2.py`
- `services/db/src/paax_db/schemas.py`
- `packages/schemas/src/index.ts`
- Dokumen ini.

## 4. Commit dari akhir Fase 4 sampai HEAD

```text
6ceb9ec docs(di): add Phase 4 completion report
9e9d555 feat(di): separate physical candidates from context groups
a591cd5 fix(di): keep physical gate conservative and compatible
```

Commit Fase 3–4 yang menjadi konteks sebelum perubahan Fase 5:

```text
c588628 docs(di): add Phase 3 completion report
d23ef09 feat(di): add typed DEM observation models and adapter
fba04fe feat(di): use page transform and normalized distance threshold in cross sheet resolver
5d78df6 feat(di): add view boundary and table boundary guards to bind_alamat
82d7cc2 feat(di): implement coordinate transform model and page transform integration for canonical storage
```

## 5. Catatan Graphify

Graphify query digunakan sebelum source inspection untuk menemukan synthesis,
summary, retrieval, dan schema paths. `graphify update .` dijalankan setelah
perubahan kode; graph berhasil diperbarui menjadi 7,029 nodes dan 13,520 edges.
HTML visualization dilewati otomatis karena graph melewati limit 5,000 nodes.

