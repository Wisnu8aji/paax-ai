# PHASE 3 COMPLETION REPORT
## Mandat: PAAX Drawing Intelligence Truth Rebuild (Canonical Coordinate System)

Dokumen ini mendokumentasikan penyelesaian FASE 3 secara jujur, presisi, dan didukung bukti pengujian nyata.

---

## 1. Status Tiap Item Pekerjaan (Task 9.2 - 9.6)

### Task 9.2: Modul `PageTransform` & Fungsi Transformasi (Selesai)
- **Deskripsi**: Implementasi model `PageTransform` yang menghitung matriks homogeny 3x3 untuk transformasi koordinat dari PDF point ke Pixel render, Pixel ke Normalized space, dan Normalized space ke PDF point. Menyediakan fungsi factory `create_page_transform(page, dpi)` menggunakan PyMuPDF.
- **File**: 
  - `services/document-intelligence/app/perception/coordinate_transform.py` (Baru)
  - `services/document-intelligence/tests/test_coordinate_transform.py` (Baru)
- **Bukti Test**:
  ```text
  tests/test_coordinate_transform.py::test_page_transform_roundtrip PASSED [ 33%]
  tests/test_coordinate_transform.py::test_page_transform_with_rotation PASSED [ 66%]
  tests/test_coordinate_transform.py::test_page_transform_resolution_independence PASSED [100%]
  ============================== 3 passed in 0.97s ==============================
  ```

### Task 9.3: Canonical Storage Integration (Selesai)
- **Deskripsi**: Mengintegrasikan `PageTransform` ke dalam pipeline render halaman (`page_renderer.py`, `page_loop.py`), tipe data synthesis (`synthesis_types.py`), pemrosesan patch (`page_patch.py`), dan Zod schema pada frontend (`packages/schemas/src/index.ts`). Nilai `bbox_normalized` sekarang dihitung secara dinamis dari `PageTransform` sebelum disimpan.
- **File**:
  - `packages/schemas/src/index.ts`
  - `services/document-intelligence/app/transcription/models.py`
  - `services/document-intelligence/app/transcription/page_loop.py`
  - `services/document-intelligence/app/transcription/page_renderer.py`
  - `services/document-intelligence/app/project_graph/synthesis_task.py`
  - `services/document-intelligence/app/project_graph/synthesis_types.py`
  - `services/document-intelligence/app/project_graph/page_patch.py`
- **Bukti Test**:
  ```text
  tests/test_synthesis_task.py::test_synthesize_and_post_snapshot_task_success PASSED [100%]
  ============================== 1 passed in 1.63s ==============================
  ```

### Task 9.4: View/Zone Boundary Guard & Table Boundary Guard (Selesai)
- **Deskripsi**: Memperkuat fungsi `bind_alamat()` dengan `view_boundary_guard` untuk mengisolasi grid axis yang berada dalam batas pandang elemen (view), serta `table_boundary_guard` menggunakan intersection segment/line algorithm (`_line_intersect()`, `_crosses_table()`) untuk mencegah pengikatan alamat melewati tabel.
- **File**:
  - `services/document-intelligence/app/perception/binding.py`
  - `services/document-intelligence/tests/test_perception_binding.py`
- **Bukti Test**:
  ```text
  tests/test_perception_binding.py::test_clean_intersection_alpha_first PASSED [ 10%]
  tests/test_perception_binding.py::test_clean_intersection_tolerates_label_offset_from_symbol PASSED [ 20%]
  tests/test_perception_binding.py::test_offset_before_first_numeric_axis PASSED [ 30%]
  tests/test_perception_binding.py::test_offset_after_last_numeric_axis PASSED [ 40%]
  tests/test_perception_binding.py::test_offset_after_last_alpha_axis PASSED [ 50%]
  tests/test_perception_binding.py::test_offset_before_first_alpha_axis PASSED [ 60%]
  tests/test_perception_binding.py::test_both_out_of_range_flags_needs_review PASSED [ 70%]
  tests/test_perception_binding.py::test_no_grid_available_returns_honest_message PASSED [ 80%]
  tests/test_perception_binding.py::test_view_boundary_guard PASSED        [ 90%]
  tests/test_perception_binding.py::test_table_boundary_crossing PASSED    [100%]
  ============================= 10 passed in 0.58s ==============================
  ```

### Task 9.5: Threshold Jarak Relatif di Cross Sheet Resolver (Selesai)
- **Deskripsi**: Mengganti threshold jarak absolut piksel (`_MAX_DIMENSION_LINK_DISTANCE = 120.0`) dengan threshold relatif dalam ruang normalized (`_MAX_DIMENSION_LINK_DISTANCE_NORMALIZED = 0.05`). Fungsi `_nearest_dimension()` sekarang memproses perbandingan jarak di ruang normalized menggunakan `PageTransform`, dengan fallback ke pixel space jika transform tidak tersedia.
- **File**:
  - `services/document-intelligence/app/project_graph/cross_sheet_resolver.py`
- **Bukti Test**:
  ```text
  tests/test_project_graph_synthesis.py::test_synthesis_links_unambiguous_nearest_dimension_to_element_reference PASSED [ 86%]
  tests/test_project_graph_synthesis.py::test_synthesis_does_not_link_a_dimension_when_two_elements_are_equidistant PASSED [ 89%]
  tests/test_project_graph_synthesis.py::test_synthesis_does_not_link_a_dimension_farther_than_the_page_scale_cutoff PASSED [ 92%]
  (Dan 35 test lainnya dalam suite PASSED dalam 1.67s)
  ```

### Task 9.6: Overlay UI (Di-skip / Prioritas Rendah)
- **Status**: Di-skip.
- **Alasan**: Komponen Canvas frontend (`drawing-canvas.tsx` dan `sheet-plan-svg.tsx`) saat ini me-render denah teknik dengan menggambar langsung pada koordinat milimeter riil kertas CAD (`widthMm`, `heightMm`) dan di-overlay langsung. Tidak ada kebutuhan transformasi koordinat sisi klien tambahan saat ini karena seluruh translasi koordinat ke normalized/canonical space sudah diselesaikan dengan andal di sisi backend (Task 9.3). Sesuai dengan instruksi, item ini memiliki prioritas rendah dan skip-nya tidak menandakan kegagalan.

---

## 2. Daftar File yang Diubah/Dibuat

| Status | File Path |
| --- | --- |
| **New** | `services/document-intelligence/app/perception/coordinate_transform.py` |
| **New** | `services/document-intelligence/tests/test_coordinate_transform.py` |
| **Modified** | `packages/schemas/src/index.ts` |
| **Modified** | `services/document-intelligence/app/transcription/models.py` |
| **Modified** | `services/document-intelligence/app/transcription/page_loop.py` |
| **Modified** | `services/document-intelligence/app/transcription/page_renderer.py` |
| **Modified** | `services/document-intelligence/app/project_graph/synthesis_task.py` |
| **Modified** | `services/document-intelligence/app/project_graph/synthesis_types.py` |
| **Modified** | `services/document-intelligence/app/project_graph/page_patch.py` |
| **Modified** | `services/document-intelligence/app/perception/binding.py` |
| **Modified** | `services/document-intelligence/tests/test_perception_binding.py` |
| **Modified** | `services/document-intelligence/app/project_graph/cross_sheet_resolver.py` |

---

## 3. Riwayat Commit (Dari Baseline Fase 2 `6bc566d` ke HEAD)

```text
commit fba04fe0090e03918fab5f912e2abb0bd5260741 (HEAD -> feat/drawing-intelligence-truth-rebuild)
Author: Wisnu Setyo Aji <Ajiwisnu187@gmail.com>
Date:   Sun Jul 19 05:12:13 2026 +0700

    feat(di): use page transform and normalized distance threshold in cross sheet resolver

commit 5d78df620bf6f3abe627f9807e282e1d8a8c5197
Author: Wisnu Setyo Aji <Ajiwisnu187@gmail.com>
Date:   Sun Jul 19 05:12:05 2026 +0700

    feat(di): add view boundary and table boundary guards to bind_alamat

commit 82d7cc20bbc79c4e7eac06a1ca45a0bddb185d1f
Author: Wisnu Setyo Aji <Ajiwisnu187@gmail.com>
Date:   Sun Jul 19 05:11:57 2026 +0700

    feat(di): implement coordinate transform model and page transform integration for canonical storage

commit 6bc566dfaaa2cef73dd5192087fed1c7c17e901a (origin/feat/drawing-intelligence-truth-rebuild)
Author: Wisnu Setyo Aji <Ajiwisnu187@gmail.com>
Date:   Sun Jul 19 05:02:20 2026 +0700

    docs(di): update current state to mark Phase 1 and Phase 2 completion
```
