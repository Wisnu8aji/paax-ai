# Command Room Arete — Offline QA

**Mode:** simulasi kontrak deterministik; tidak ada API AI yang dipanggil.
**Status:** PASS — 16/16 pemeriksaan lulus.

## Pertanyaan uji

> kolom lantai 2 ada apa saja jumlah berapa ukuran berapa

## Bentuk jawaban Arete yang diwajibkan

Berdasarkan rekonstruksi objek fisik dan penyambungan lintas lembar, kolom pada Lantai 2 adalah:

| Tipe | Jumlah | Dimensi penampang | Status | Sumber |
|---|---:|---|---|---|
| K-01 | 1 kandidat terdeteksi | Definisi ukuran belum ditemukan | Sudah terklasifikasi | [DENAH DIN. PARTISI LANTAI 2 p.24] |
| K1A | 8 unit | 400 × 400 mm | Terkonfirmasi sistem | [DENAH KOLOM LANTAI 2 p.43] |
| K2 | 4 unit | 250 × 600 mm | Siap dihitung Core Engine | [DENAH KOLOM LANTAI 2 p.43] |
| K3 | 5 unit | 250 × 400 mm | Terkonfirmasi sistem | [DENAH KOLOM LANTAI 2 p.43] |

Jumlah berstatus terkonfirmasi sistem berasal dari rekonstruksi instance pada denah utama, deduplikasi geometri, dan pengecekan lintas schedule/detail. Data yang tidak konsisten tidak disembunyikan; item tersebut ditandai Data rancu untuk dikoreksi atau di-approve reviewer.

## Pertanyaan volume

> berapa volume kolom lantai 2

Item berikut sudah siap dihitung oleh Core Engine karena jumlah fisik, dimensi, dan tinggi efektif memiliki authority: K2: 4 unit, 250 × 600 mm, tinggi efektif 3900.0 mm. Model AI tidak melakukan perkalian; Command Room harus memanggil Core Engine dan menampilkan hasil beserta formula serta sumber input.

## Timeline proses yang ditampilkan

1. **Memuat projection Drawing Intelligence untuk 88 lembar**
2. **Menemukan tipe kolom Lantai 2: K1A, K2, K3**
3. **Menghubungkan K2 ke 2 lembar sumber denah, tabel, dan potongan**
4. **Memeriksa rekonstruksi fisik K2: 4 unit**
5. **Memeriksa penampang 250 × 600 mm dan tinggi efektif 3900.0 mm**
6. **Memastikan authority jumlah=engine_confirmed dan readiness=ready**
7. **Menyusun jawaban teknik sipil dengan sitasi lembar yang dapat dibuka**

## Pemeriksaan

| Pemeriksaan | Status | Detail |
|---|---|---|
| delivery_schema_is_human_view | PASS | paax.drawing-intelligence.human-delivery.v2 |
| all_88_pages_available | PASS | page_count=88 |
| core_l2_column_types_found | PASS | codes=['K-01', 'K1A', 'K2', 'K3'] |
| k1a_dimension | PASS | 400 × 400 mm |
| k2_dimension | PASS | 250 × 600 mm |
| k3_dimension | PASS | 250 × 400 mm |
| physical_counts_are_authorized | PASS | items=[('K-01', None, 'candidate'), ('K1A', 8, 'engine_confirmed'), ('K2', 4, 'engine_confirmed'), ('K3', 5, 'engine_confirmed')] |
| answer_uses_civil_engineering_wording | PASS | mature civil-engineering wording present |
| answer_has_sheet_page_citations | PASS | human-readable citations present |
| volume_answer_routes_to_core_engine | PASS | golden rule and readiness preserved |
| no_live_provider_call | PASS | script has no HTTP/provider client |
| generic_hospital_level_12 | PASS | expected=('column_plan', 'L12', 'structure'); actual=('column_plan', 'L12', 'structure') |
| generic_bridge_abutment | PASS | expected=('bridge_plan', 'substructure', 'structure'); actual=('bridge_plan', 'substructure', 'structure') |
| generic_road_alignment | PASS | expected=('road_plan_profile', 'alignment', 'civil'); actual=('road_plan_profile', 'alignment', 'civil') |
| generic_unknown_vendor_sheet | PASS | expected=('unknown', None, 'unknown'); actual=('unknown', None, 'unknown') |
| timeline_is_stacked_and_contextual | PASS | steps=7 |

## Batasan

- No provider API was called; this validates retrieval, prompt, authority, citation, and output contracts.
- Natural-language variation of a live model still requires a controlled staging run with a dedicated non-production key.
