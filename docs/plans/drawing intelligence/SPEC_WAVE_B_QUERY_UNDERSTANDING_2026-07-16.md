> **STATUS: HISTORICAL/SUPERSEDED** -- lihat [DI_SOURCE_OF_TRUTH.md](file:///G:/paax-ai-main/docs/plans/drawing%20intelligence/DI_SOURCE_OF_TRUTH.md) untuk kondisi terkini

# SPEC Gelombang B — Pemahaman Query (2026-07-16) [FINAL — ratifikasi Fable 2026-07-16]

> Implementasi Master Plan §5 Gelombang B (item 4-6). Prasyarat: Gelombang A hijau
> (occurrence struktur masuk graf + level kanonis). Kontrak acuan: plan kanonik §16.3-16.8
> (intent classes, GraphQueryPlan, seed scoring, relation allowlist), §17.2 (tool), §18
> (answer contract), SINTESIS_3ARAH §3.3-3.4 (routing 3 kelas).

## B4 — Intent parser rule-based + validator (services/db)

**Keputusan arsitektur (Fable):** fase awal parser **murni rule-based** di
`services/db/src/paax_db/project_graph_intent.py` (dekat endpoint, tanpa AI, tanpa network).
Fallback DeepSeek Flash (via endpoint doc-intel terpisah) DITUNDA — dibangun HANYA bila
benchmark membuktikan cakupan rule kurang. Alasan: vocabulary graph (nama level kanonis,
disiplin, kode elemen) membuat mayoritas frasa terjangkau rule; "jangan AI untuk semua" §13.4;
Aturan Emas lebih mudah dijaga.

**Mekanika:**
1. Muat vocabulary dari snapshot aktif (SELECT ringan, di-cache per snapshot_id):
   nama level kanonis + alias; enum disiplin + kamus kata (struktur/structure→structure,
   arsitektur/arsitektural→architecture, mep/me/mekanikal/elektrikal/plumbing/sanitasi→mep);
   kode elemen (canonical_name + aliases element_type).
2. Normalisasi query → token match:
   - token level (nama level kanonis/alias, pola "lantai N"/"lt N"/atap/dasar) → `filters.level`.
   - token disiplin → `filters.discipline`.
   - kode elemen persis → `entities[{type: element_type, value}]`.
   - kata kunci kalkulasi (volume, m3, m³, kubikasi, biaya, harga, rab, anggaran, butuh
     berapa material/semen/besi) → intent `CALCULATION_REQUIRED`.
   - pola fakta tertulis ("berapa dimensi/ukuran/tinggi/lebar/elevasi/peil X") →
     `NUMERIC_STORED_FACT`.
   - kata konflik/bentrok/tidak sesuai → `CONFLICT_LOOKUP`; "kurang/tidak ada data/belum
     lengkap" → `MISSING_DATA`; sisa berpola daftar/apa-saja/di-mana → `LIST_FILTER` /
     `ELEMENT_LOOKUP` (ada kode elemen → ELEMENT_LOOKUP).
3. Output = objek QueryPlan Pydantic BARU di `services/db/src/paax_db/schemas.py` yang
   field-nya SAMA PERSIS dengan Zod `GraphQueryPlanSchema` (packages/schemas/src/index.ts:1692)
   — intent, entities[], filters{level,discipline}, relations[], traversal{mode,depth},
   budget_tokens. (Zod TIDAK berubah — kontrak sudah ada; ini menambah mirror Pydantic di
   service db sesuai pola schemas.py yang memang mandiri.)
4. **Validator**: `filters.level` wajib cocok node level yang ada (else: turunkan jadi None +
   catatan "level tak dikenal: X" di response); discipline wajib enum sah; relations diisi
   dari allowlist per intent (§16.8); entities dicek ke vocabulary — tak dikenal tetap boleh
   (jadi term pencarian) tapi ditandai `unrecognized_terms`.

**Test acuan manual:** "struktur lantai 2" → {LIST_FILTER, level=Lantai 2, discipline=structure};
"berapa volume beton lantai 2" → CALCULATION_REQUIRED; "dimensi K1" → {NUMERIC_STORED_FACT,
entity K1}; "Main Floor" → level resolusi via alias kanonis (hasil A3); "ada konflik apa" →
CONFLICT_LOOKUP; "Lantai 3" → level tak dikenal → catatan + hasil kosong jujur.

## B5 — Retrieve v2 plan-driven (services/db)

`POST /projects/{id}/project-graph/retrieve` diperluas (BACKWARD COMPATIBLE — field lama
`query/depth/traversal_mode` tetap jalan sebagai mode legacy):
1. Request tambah opsional `use_intent: bool = true`. Bila true: parse+validate query →
   QueryPlan → eksekusi per intent. Bila parser tak yakin → fallback legacy BFS (dicatat
   `parser: "fallback_legacy"`).
2. Eksekusi per kelas:
   - `LIST_FILTER`/`ELEMENT_LOOKUP` dengan filters.level → **baca tabel
     project_graph_summary_views** (level_id = node level kanonis yang cocok) → jawab dari
     view (element_type_index + quality) + node occurrence pendukung scoped level+disiplin;
     view tak ada → scoped BFS fallback (seed = level node, filter disiplin di ekspansi).
   - `NUMERIC_STORED_FACT`: seed = entity nodes → traversal TERARAH relasi
     {INSTANCE_OF, HAS_DIMENSION, DEFINED_BY, LOCATED_ON, DEPICTED_IN} depth 2 →
     sertakan node dimension + evidence (perbaikan GT6: dimensi tak boleh terpangkas pruning —
     prioritas pruning: dimension/material > reference > sheet).
   - `CALCULATION_REQUIRED`: **JANGAN cari-cari** — response `status="calculation_required"`,
     `nodes=[]`, `guidance` berisi: penjelasan angka final harus Core Engine + approval,
     daftar fakta tersedia (tipe elemen terkait + dimensi tertulis bila entity dikenal), dan
     pointer `rab_bridge_available: true`. TIDAK memanggil engine otomatis.
   - `CONFLICT_LOOKUP`: seed = node type=conflict (+MISSING_DATA → missing_information).
3. Response tambah: `intent`, `applied_filters`, `data_status`
   ("grounded"/"empty"/"calculation_required"/"unknown_level"), `notes[]`, dan (bila dari view)
   `summary_view` payload. Field lama dipertahankan.
4. Skema request/response: update Pydantic db `schemas.py` DAN Zod `packages/schemas`
   BERSAMAAN (aturan §2 CLAUDE.md) — Zod perlu field response baru.

**Test acuan manual (fixture nyata, pola ASGITransport existing):** GT8 "struktur lantai 2"
→ nodes>0 semua scoped L2+structure; GT9 volume → calculation_required + nodes=0 + guidance;
GT6 "dimensi K1" → node "400x400 mm" + evidence hal.50 ADA di hasil; GT14 "konflik" →
node conflict hal.81; GT16 "Lantai 3" → data_status="unknown_level", nodes=0; benchmark
runner GT6/8/9/14 → PASS (target kumulatif ≥7/8).

## B6 — Tool Command Room v2 (ai-orchestrator + apps/web)

1. `query_project_graph.ts`: declaration param terstruktur per §17.2 — `query` (frasa alami
   utuh, TANPA instruksi workaround), opsional `level`, `discipline`, `node_types`, `limit`.
   Executor kirim body v2 (`use_intent: true` + field opsional). **HAPUS seluruh kalimat
   workaround** ("kirim HANYA nama lantai persis...") dari description — description baru
   singkat: kirim pertanyaan apa adanya, backend yang memahami.
2. Teruskan response v2 ke model: `data_status`, `intent`, `summary_view` (bila ada),
   `guidance` kalkulasi (model wajib menyampaikan arahan RAB/engine ke user, bukan menghitung).
   Pertahankan format citations existing `[sheet_id p.halaman]`.
3. `TOOL_SYSTEM_SUFFIX` (apps/web tools.ts): perbarui deskripsi tool (hapus workaround,
   tambah perilaku calculation_required). JANGAN ubah bagian lain file yang dilindungi.
4. Test: update `query_project_graph.test.ts` + `command-room-ui.test.ts` yang tersentuh;
   jalankan vitest/jest ai-orchestrator & web + `tsc --noEmit`.

## Batas Aturan Emas
Parser/retrieve TIDAK PERNAH menghitung; kelas kalkulasi selalu ditolak+diarahkan; semua
count dari len() view/graph; jawaban wajib bawa evidence; level tak dikenal = jujur kosong.

## Urutan & verifikasi
B4 → B5 (satu PR logis, services/db) → B6 (ai-orchestrator+web). Setelah tiap langkah:
pytest db + doc-intel, benchmark runner (catat delta scorecard), vitest untuk B6,
`graphify update .`.
