# LUNA Report Wave B4 — Intent Parser & Validator

Tanggal: 2026-07-16  
Branch: `feat/pckm-phase3-synthesis`

## Implementasi

| File | Fungsi/komponen |
|---|---|
| `services/db/src/paax_db/project_graph_intent.py` | `_load_vocabulary()` memuat vocabulary snapshot-scoped dan cache per `snapshot_id`; `_choose_level()` memvalidasi level kanonis/alias serta pola generik; `_find_discipline()` memetakan kamus disiplin; `_find_entities()` mencocokkan `element_type`; `parse_query_plan()` mengklasifikasikan intent dan mengisi allowlist relasi. |
| `services/db/src/paax_db/schemas.py` | `QueryIntentEnum`, `EdgeRelationEnum`, `QueryEntity`, `GraphQueryPlan`, serta alias `QueryPlan` sebagai mirror Pydantic dengan field yang sama seperti kontrak Zod. |
| `services/db/tests/test_project_graph_intent.py` | Fixture snapshot SQLite in-memory sintetis dan dua test untuk enam query acuan, field mirror, level tak dikenal, serta `unrecognized_terms`. |

Parser hanya melakukan klasifikasi dan penyusunan plan; tidak ada perhitungan angka.

## Hasil parse enam query acuan

| Query | Intent | Level | Disiplin | Entity | Catatan/relasi utama |
|---|---|---|---|---|---|
| `struktur lantai 2` | `LIST_FILTER` | `Lantai 2` | `structure` | — | allowlist element/list: `INSTANCE_OF`, `LOCATED_ON`, `LOCATED_IN`, `DEFINED_BY`, `DEPICTED_IN`, `HAS_DIMENSION`, `USES_MATERIAL`, `HAS_EVIDENCE` |
| `berapa volume beton lantai 2` | `CALCULATION_REQUIRED` | `Lantai 2` | — | — | relasi kosong; klasifikasi saja |
| `dimensi K1` | `NUMERIC_STORED_FACT` | — | — | `element_type: K1` | relasi kosong |
| `ada konflik apa di gambar` | `CONFLICT_LOOKUP` | — | — | — | `CONFLICTS_WITH`, `HAS_EVIDENCE` |
| `Lantai 3 ada apa saja` | `LIST_FILTER` | `None` | — | — | `level tak dikenal: Lantai 3` |
| `kolom lantai 1` | `ELEMENT_LOOKUP` | `Lantai 1` | — | `element_type: Kolom` | allowlist element/list |

## Verifikasi

Perintah yang dijalankan dari `services/db`:

```text
PYTHONUTF8=1 C:\Users\Nothing\AppData\Local\Programs\Python\Python313\python.exe -m pytest -q
```

Hasil nyata:

```text
39 passed, 1 skipped, 3 warnings in 16.04s
```

`graphify update .` juga dijalankan setelah perubahan kode. Tidak ada commit atau push.

## Keraguan dan risiko

- Cache sengaja memakai `snapshot_id` sebagai kunci tunggal sesuai kontrak; ini mengandalkan identitas snapshot tetap unik.
- Vocabulary level dan alias harus sudah dipersistenkan pada snapshot agar resolusi level menghasilkan nama kanonis.
- Tiga warning suite berasal dari deprecation konfigurasi Pydantic lama dan integrasi TestClient, bukan dari parser B4.
- Endpoint retrieval, Command Room, dan `services/document-intelligence` tidak diubah.
