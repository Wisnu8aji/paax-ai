# PROPOSAL DESAIN: Penyelesaian Masalah A (Cross-Page Element Type Merge Failure)
**Tanggal**: 2026-07-16  
**Status**: Usulan Desain (Tanpa Perubahan Kode Langsung)  
**Target File**: [cross_sheet_resolver.py](file:///G:/paax-ai-main/services/document-intelligence/app/project_graph/cross_sheet_resolver.py)

---

## 1. Latar Belakang & Analisis Masalah

Terdapat **41 kasus kegagalan penggabungan (merge) tipe elemen lintas halaman (cross-page)**. Elemen pada halaman lanjutan kehilangan informasi level atau ruang (*spatial context*) akibat kualitas ekstraksi Fase 1/2. Ini dikonfirmasi sebagai masalah kualitas data ekstraksi, bukan bug langsung pada resolver.

### Perilaku Saat Ini
Pada [resolve_cross_sheet](file:///G:/paax-ai-main/services/document-intelligence/app/project_graph/cross_sheet_resolver.py#L411-L641), jika sebuah *drawing reference* dari tipe elemen tertentu (misalnya `"J2"`) tidak memiliki `level` atau `space` (bernilai `None`), resolver akan langsung melakukan `continue` (skip) pada baris L510-L516:
```python
if source.level is None or source.space is None:
    missing_information.append(
        f"{type_node.canonical_name} on {source.source_ref.sheet_id} page "
        f"{source.source_ref.page_index + 1} requires {_context_missing_reason(source)} "
        "before occurrence synthesis"
    )
    continue
```
Akibatnya:
1. Referensi dari halaman lanjutan tersebut **tidak disintesis** menjadi `element_occurrence`.
2. Referensi tersebut **tidak terhubung** ke *occurrence* utama yang memiliki konteks lengkap.
3. Node referensi mengambang tanpa asosiasi fisik ke *occurrence* mana pun di dalam grafik proyek.

---

## 2. Arsitektur Solusi: Jalur Grup Generik Terkondisi & Isolasi Lintas-Halaman

Untuk menangani kegagalan merge tanpa melanggar prinsip keamanan, kita memperkenalkan **Jalur Grup Generik Terkondisi (*Conditional Generic Grouping Path*)** yang dilengkapi dengan **Isolasi Lintas-Halaman/Lantai**. 

### Strategi Penggabungan
Untuk setiap `type_node` (misal `"J2"`), kita membagi semua *source* referensinya menjadi dua kelompok:
1. **Contextual Sources**: Referensi yang memiliki `level` dan `space` tidak `None`.
2. **Deficient Sources**: Referensi yang kehilangan `level` atau `space` (atau keduanya).

Kita hanya mengaktifkan pembuatan **Grup Generik (Fallback)** jika:
$$\text{Jumlah Contextual Sources} \ge 1$$

Artinya, jika tipe elemen tersebut setidaknya memiliki **satu referensi dengan konteks lengkap** di dalam proyek, maka referensi lain yang kehilangan konteks (*deficient sources*) akan dibuatkan *occurrence* generik/fallback daripada dibuang (di-skip).

Jika tipe elemen tersebut **tidak memiliki referensi dengan konteks lengkap sama sekali** di seluruh proyek (jumlah *contextual sources* = 0), kita akan **mempertahankan perilaku `continue` lama**.

#### Mitigasi Lintas-Halaman/Lantai (Menutup Celah Penggabungan)
Jika suatu referensi kehilangan **kedua** konteks (`level` DAN `space` bernilai `None`), pembuatan key identitas dan pengelompokan fallback akan diisolasi per halaman menggunakan `sheet_id` dan `page_index`. Hal ini mencegah beberapa referensi dari halaman berbeda (yang merepresentasikan lantai berbeda) digabungkan secara salah ke dalam satu occurrence generik yang sama.

---

## 3. Formula Penurunan Confidence (Occurrence Hasil Grup Generik)

Kepercayaan (*confidence*) dari *occurrence* generik wajib diturunkan secara deterministik karena tidak memiliki data lokasi spasial/level yang pasti dari ekstraksi.

Formula usulan untuk menghitung confidence dari *occurrence* generik ($C_{\text{generic}}$) adalah:
$$C_{\text{generic}} = \text{round}(C_{\text{base}} \times (1.0 - \text{Penalty}_{\text{level}} - \text{Penalty}_{\text{space}}), 4)$$

Di mana:
*   $C_{\text{base}} = \min_{s \in \text{sources}} (s.\text{type\_node}.\text{confidence})$ (mengikuti basis confidence saat ini).
*   $\text{Penalty}_{\text{level}} = 0.2$ jika level tidak teridentifikasi (`level.key` dimulai dengan `"unmapped"`).
*   $\text{Penalty}_{\text{space}} = 0.3$ jika ruang tidak teridentifikasi (`space.key` dimulai dengan `"unmapped"`).

### Skenario Penalti Dampak:
1.  **Hanya Ruang yang Hilang (Space is None)**:
    *   $\text{Penalty} = 0.3 \implies C_{\text{generic}} = C_{\text{base}} \times 0.7$ (Penurunan 30%)
2.  **Hanya Level yang Hilang (Level is None)**:
    *   $\text{Penalty} = 0.2 \implies C_{\text{generic}} = C_{\text{base}} \times 0.8$ (Penurunan 20%)
3.  **Keduanya Hilang (Level & Space are None)**:
    *   $\text{Penalty} = 0.2 + 0.3 = 0.5 \implies C_{\text{generic}} = C_{\text{base}} \times 0.5$ (Penurunan 50%)

---

## 4. Preservasi Invarian Keamanan (Test Lama Tetap Lolos)

Dua test invarian keamanan pada [test_project_graph_synthesis.py](file:///G:/paax-ai-main/services/document-intelligence/tests/test_project_graph_synthesis.py) dilindungi dan dijamin tetap lolos **tanpa modifikasi assertion**:

1.  [test_synthesis_leaves_an_equal_distance_space_tie_as_missing_information](file:///G:/paax-ai-main/services/document-intelligence/tests/test_project_graph_synthesis.py#L297)
2.  [test_synthesis_does_not_associate_an_unpositioned_label_with_the_only_space](file:///G:/paax-ai-main/services/document-intelligence/tests/test_project_graph_synthesis.py#L318)

### Mengapa Tetap Lolos?
*   Kedua test ini menyuplai data uji dengan **satu sheet tunggal** yang memiliki satu referensi tipe `"J2"`.
*   Referensi `"J2"` tersebut bersifat *deficient* (kekurangan konteks spasial karena jarak ruang sama besar/tie, atau label tidak berposisi).
*   Karena hanya ada satu referensi dan referensi tersebut *deficient*, maka $\text{Jumlah Contextual Sources} = 0$.
*   Berdasarkan syarat kondisional kita, resolver akan langsung masuk ke blok `continue` lama, mencatat informasi di `missing_information`, dan **tidak mensintesis `element_occurrence` apa pun**.
*   Dengan demikian, assertion `assert not [node for node in result.snapshot.nodes if node.type == "element_occurrence"]` dan assertion `missing_information` tetap terpenuhi secara sempurna.

---

## 5. Rencana Penambahan Unit Test Baru

Kita akan menambahkan minimal 3 test baru untuk memverifikasi jalur grup generik baru ini di [test_project_graph_synthesis.py](file:///G:/paax-ai-main/services/document-intelligence/tests/test_project_graph_synthesis.py):

### Test 1: `test_synthesis_groups_context_deficient_occurrence_when_contextual_exists_cross_sheet`
*   **Skenario**: Menyuplai 2 sheet.
    *   Sheet A: Elemen `"J2"` lengkap dengan Level="Lantai 1", Space="Ruang A".
    *   Sheet B: Elemen `"J2"` dengan Level=None, Space=None (Kehilangan seluruh konteks).
*   **Verifikasi**:
    1.  Dihasilkan 2 node `element_occurrence`:
        *   `Occ 1` (Lantai 1 / Ruang A) dengan confidence asli (misal `0.9`).
        *   `Occ 2` dengan Level="Lantai Tidak Terpetakan (Sheet B hal. 1)" / Space="Ruang Tidak Terpetakan (Sheet B hal. 1)" sebagai grup generik.
    2.  Confidence dari `Occ 2` diturunkan tepat menjadi $0.9 \times 0.5 = 0.45$.
    3.  Dihasilkan edge `POSSIBLY_SAME_AS` antara `Occ 1` dan `Occ 2` untuk menandai ambiguitas bagi downstream estimator.
    4.  Tidak ada warning `requires level, spatial context` di `missing_information` untuk tipe tersebut dari Sheet B karena berhasil disintesis.

### Test 2: `test_synthesis_groups_partially_contextual_occurrence_with_fallback_space`
*   **Skenario**: Menyuplai 2 sheet.
    *   Sheet A: Elemen `"J2"` lengkap dengan Level="Lantai 1", Space="Ruang A".
    *   Sheet B: Elemen `"J2"` dengan Level="Lantai 1", Space=None (Hanya kehilangan konteks ruang).
*   **Verifikasi**:
    1.  Dihasilkan `element_occurrence` generik di bawah Level="Lantai 1" dan Space="Ruang Tidak Terpetakan".
    2.  Confidence diturunkan tepat sebesar 30% (dikalikan $0.7$), menghasilkan confidence $0.9 \times 0.7 = 0.63$.
    3.  Dihasilkan edge `POSSIBLY_SAME_AS` antara *occurrence* riil dan *occurrence* fallback.

### Test 3: `test_synthesis_does_not_merge_unmapped_occurrences_across_different_sheets`
*   **Skenario**: Menyuplai 3 sheet.
    *   Sheet A: Elemen `"J2"` lengkap dengan Level="Lantai 1", Space="Ruang A".
    *   Sheet B: Elemen `"J2"` dengan Level=None, Space=None (Kehilangan seluruh konteks).
    *   Sheet C: Elemen `"J2"` dengan Level=None, Space=None (Kehilangan seluruh konteks).
*   **Verifikasi**:
    1.  Dihasilkan 3 node `element_occurrence`:
        *   `Occ 1` (Lantai 1 / Ruang A).
        *   `Occ 2` dengan Level="Lantai Tidak Terpetakan (Sheet B hal. 1)" / Space="Ruang Tidak Terpetakan (Sheet B hal. 1)".
        *   `Occ 3` dengan Level="Lantai Tidak Terpetakan (Sheet C hal. 1)" / Space="Ruang Tidak Terpetakan (Sheet C hal. 1)".
    2.  `Occ 2` dan `Occ 3` tetap terpisah (tidak digabungkan menjadi satu occurrence generik), membuktikan bahwa `sheet_id` dan `page_index` mengisolasi grouping secara aman.

---

## 6. Rencana Perubahan Kode (Untuk Referensi)

Perubahan pada fungsi `resolve_cross_sheet` di [cross_sheet_resolver.py](file:///G:/paax-ai-main/services/document-intelligence/app/project_graph/cross_sheet_resolver.py) akan diimplementasikan sebagai berikut:

```python
# Di dalam resolve_cross_sheet:
for type_node_id, sources in sorted(sources_by_type.items()):
    sources = sorted(sources, key=lambda item: _source_key(item.source_ref))
    type_node = sources[0].type_node
    reference_ids: list[str] = []
    contexts: dict[tuple[str, str], list[_TypeSource]] = {}

    # Memeriksa apakah ada setidaknya satu referensi dengan konteks lengkap
    has_contextual = any(s.level is not None and s.space is not None for s in sources)

    for source in sources:
        reference_node = _reference_node(type_node, source.source_ref)
        reference_ids.append(reference_node.node_id)
        nodes.append(reference_node)
        # ... (pembuatan EDGE SAME_AS dan DEPICTED_IN tetap sama) ...

        if source.level is None or source.space is None:
            if not has_contextual:
                # Perilaku lama tetap dipertahankan jika tidak ada contextual source
                missing_information.append(
                    f"{type_node.canonical_name} on {source.source_ref.sheet_id} page "
                    f"{source.source_ref.page_index + 1} requires {_context_missing_reason(source)} "
                    "before occurrence synthesis"
                )
                continue
            
            # Celah Fix: Jika kedua level dan space hilang, sertakan sheet_id dan page_index
            # agar tidak terjadi merging lintas halaman/lantai secara membabi buta.
            if source.level is None and source.space is None:
                sheet_id = source.source_ref.sheet_id
                page_index = source.source_ref.page_index
                fallback_level_key = f"unmapped_{sheet_id}_p{page_index}"
                fallback_space_key = f"unmapped_{sheet_id}_p{page_index}"
                fallback_level_display = f"Lantai Tidak Terpetakan ({sheet_id} hal. {page_index + 1})"
                fallback_space_display = f"Ruang Tidak Terpetakan ({sheet_id} hal. {page_index + 1})"
            else:
                fallback_level_key = "unmapped"
                fallback_space_key = "unmapped"
                fallback_level_display = "Lantai Tidak Terpetakan"
                fallback_space_display = "Ruang Tidak Terpetakan"

            # Membuat FactValue fallback/unmapped
            fallback_level = source.level or _FactValue(
                key=fallback_level_key,
                display=fallback_level_display,
                confidence=0.5,
                evidence_refs=(),
                bbox=None
            )
            fallback_space = source.space or _FactValue(
                key=fallback_space_key,
                display=fallback_space_display,
                confidence=0.5,
                evidence_refs=(),
                bbox=None
            )
            
            generic_source = _TypeSource(
                type_node=source.type_node,
                patch=source.patch,
                source_ref=source.source_ref,
                level=fallback_level,
                space=fallback_space
            )
            contexts.setdefault((fallback_level.key, fallback_space.key), []).append(generic_source)
        else:
            contexts.setdefault((source.level.key, source.space.key), []).append(source)
```

Serta penyesuaian di `_occurrence_node` untuk menghitung confidence dengan penalti:
```python
def _occurrence_node(
    type_node: ProjectGraphNode,
    level_node: ProjectGraphNode,
    space_node: ProjectGraphNode,
    sources: Sequence[_TypeSource],
) -> ProjectGraphNode:
    # ... (logika evidence_refs tetap sama) ...
    
    base_confidence = min(source.type_node.confidence for source in sources)
    
    # Deteksi fallback/unmapped (menggunakan startswith karena key bisa memiliki suffix sheet/page)
    is_generic_level = any(s.level is not None and s.level.key.startswith("unmapped") for s in sources)
    is_generic_space = any(s.space is not None and s.space.key.startswith("unmapped") for s in sources)
    
    if is_generic_level or is_generic_space:
        penalty_level = 0.2 if is_generic_level else 0.0
        penalty_space = 0.3 if is_generic_space else 0.0
        confidence = round(base_confidence * (1.0 - penalty_level - penalty_space), 4)
    else:
        confidence = base_confidence
        
    # ... (instansiasi ProjectGraphNode menggunakan confidence terhitung) ...
```

---

## 7. Revisi: Penanganan Level+Space Sama-sama Hilang

Untuk menutup celah penggabungan membabi-buta lintas halaman/lantai, kami memilih **Opsi (b)**: menyertakan `sheet_id` dan `page_index` ke dalam kunci pengelompokan (`key` dari `FactValue` level dan space fallback) saat **kedua** properti tersebut bernilai `None`.

### Mengapa Pilihan Ini Aman Lintas-Lantai?
1. **Pemisahan Identitas Fisik**: Dengan menambahkan suffix key level dan space menggunakan `{sheet_id}_p{page_index}` (misal: `unmapped_SheetB_p0`), node `level_node` dan `space_node` yang terbentuk akan memiliki `node_id` yang berbeda untuk setiap sheet/page. Akibatnya, `element_occurrence` untuk tipe yang sama di sheet/page berbeda tidak akan pernah menggunakan ID yang sama, sehingga mereka disintesis menjadi occurrence terpisah (distinct) di dalam grafik proyek.
2. **Representasi Visual Lebih Informatif**: Label visual di `display` (misal: `"Lantai Tidak Terpetakan (Sheet B hal. 1)"`) memperjelas asal-usul data kepada estimator tanpa menggabungkan elemen secara keliru.
3. **Mencegah Over-aggregation**: Mengelompokkan berdasarkan halaman/sheet adalah pendekatan yang konservatif karena secara fisik halaman/sheet yang berbeda biasanya menggambarkan lantai atau area gambar yang berbeda.

### Status Unit Test Invarian Keamanan (Lama)
Dua test invarian keamanan berikut **tetap dijamin lolos** seperti analisis pada Bagian 4:
*   [test_synthesis_leaves_an_equal_distance_space_tie_as_missing_information](file:///G:/paax-ai-main/services/document-intelligence/tests/test_project_graph_synthesis.py#L297)
*   [test_synthesis_does_not_associate_an_unpositioned_label_with_the_only_space](file:///G:/paax-ai-main/services/document-intelligence/tests/test_project_graph_synthesis.py#L318)

**Alasan tetap lolos**:
Kedua test ini menguji kasus di mana properti `level` **ADA** (tidak `None`), namun properti `space` bernilai `None` (karena tie atau unpositioned label). 
Karena `level` ada (`level is not None`), kondisi "kedua level dan space bernilai `None`" tidak terpenuhi. Penanganan khusus suffix `sheet_id` / `page_index` ini **tidak terpicu**. Skenario ini tetap diproses dengan level asli yang ada dan space `unmapped` biasa, dan karena jumlah *contextual sources*-nya adalah 0, alur `continue` lama tetap berjalan sehingga tidak ada occurrence yang dibuat.

