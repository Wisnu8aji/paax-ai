# Instruksi Codex — Fase 3 sampai 7 (PCKM Synthesis → Retrieval → Command Room → Hardening → RAB Bridge)

**Tanggal:** 2026-07-15
**Sumber kanonik:** `docs/plans/drawing intelligence/PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md` Section 11-19 (skema, model routing, retrieval, answer contract) + `services/document-intelligence/app/project_graph/models.py` (Pydantic sudah ada sejak Fase 0-1 — **jangan buat ulang**, pakai apa adanya).
**Data uji nyata:** `report/report_drawing_intelligence/dem_extraction_88pages/pages/` (88 `DrawingEvidenceSheet`, 100% berhasil, sudah diaudit dua kali termasuk verifikasi silang).

---

## 0. Cara memakai dokumen ini — WAJIB DIBACA DULU

Anda diminta mengerjakan Fase 3 sampai 7 berurutan **tanpa berhenti untuk bertanya di tiap fase**. Itu bagian yang saya turuti. Tapi ada satu batasan yang **bukan preferensi saya** — itu aturan proyek tertulis di `CLAUDE.md` §5 dan di dokumen kanonik sendiri, jadi tidak bisa saya lepas:

1. **Tiap fase berhenti di titik commit + PR, bukan lompat ke kode fase berikutnya di atas fase yang belum lolos test.** Alasan konkret, bukan formalitas: di sesi sebelumnya, run 88-halaman nyata menemukan 4 bug (JSON structure salah, thinking-mode diam-diam nyala, cakupan ekstraksi rendah, IncompleteRead salah diklasifikasi) — SEMUA baru ketahuan karena ada jeda audit manusia per-tahap, bukan borongan. Kalau Fase 4 dibangun di atas Fase 3 yang diam-diam salah (mis. cross-sheet resolver menyatukan node yang seharusnya beda), bug itu akan terkubur di bawah 4 fase kode lain dan jauh lebih mahal diperbaiki nanti.
2. **Fase 7 terkunci** — dokumen kanonik sendiri menulis eksplisit "Phase 7 — RAB Bridge Later... Tidak dikerjakan sebelum Command Room stabil." Spek Fase 7 tetap saya tulis lengkap di bawah (Anda boleh baca, desain, bahkan siapkan kode di branch terpisah), tapi **jangan merge/aktifkan ke jalur utama sampai Fase 5 dinyatakan stabil oleh owner**. Ini bukan saya menahan Anda — itu syarat urutan yang tertulis di dokumen yang sama yang jadi acuan seluruh pekerjaan ini.
3. **Tidak ada "model terberat" untuk menyelesaikan ini.** Dokumen kanonik Section 13 sudah menetapkan model routing spesifik untuk PCKM synthesis: **DeepSeek v4 Flash** sebagai default, **DeepSeek v4 Pro** hanya untuk eskalasi kasus sulit (lihat §13.3 skor eskalasi di bawah). Bukan Command Room chat model (Lucent/Arete/Noir), dan bukan "pilih model paling kuat yang ada". Section 13.4 dokumen kanonik eksplisit: "Jangan gunakan Pro untuk seluruh PCKM" — mahal, lambat, satu failure domain besar, sulit diaudit.
4. **Aturan Emas (`CLAUDE.md` §1) berlaku penuh di semua 5 fase ini** — tidak satu pun boleh menghitung angka RAB/BoQ/volume. Fase 3-6 murni graph/retrieval/chat read-only. Fase 7 (nanti, setelah dibuka) tetap cuma "usulan menunggu approval manusia", never auto-fill.
5. **Branch baru → PR tiap fase, tidak pernah langsung ke `main`.** Setelah kode + test lolos, buka PR, tunggu review Claude (audit angka/logika) dan approval owner sebelum merge — baru lanjut ke branch fase berikutnya.

Kalau instruksi di bawah bertentangan dengan lima poin ini, lima poin ini yang menang.

---

## 0.1 MASALAH NYATA YANG BELUM SELESAI — kerjakan ini dengan reasoning terdalam

Bagian ini beda dari sisa dokumen: bukan spek fitur yang tinggal diikuti, tapi **daftar celah nyata yang kita temukan lewat audit langsung ke data 88-halaman dan ke kode, dan belum ada solusinya**. Kalau Anda dijalankan dengan reasoning effort tertinggi, di sinilah tempatnya dipakai — bukan pada bagian spek yang sudah jelas di atas.

### Masalah A — Cross-sheet resolver belum ada implementasinya sama sekali, dan data nyata menunjukkan ini tidak sesederhana exact-match

Instruksi Fase 3 §1.1 Tahap C bilang "mulai dari exact-match pada kode elemen ternormalisasi" — itu BENAR untuk kasus mudah (J2, BV1, RB3 di anchor test semuanya exact-match kode). Tapi belum terjawab, dan harus Anda pecahkan sebelum resolver dianggap selesai:

- **Kode yang sama tapi merujuk elemen fisik BERBEDA.** Proyek konstruksi nyata sering pakai kode berulang per-lantai/per-zona (mis. "K1" di lantai 1 vs "K1" di lantai 2 boleh jadi tipe kolom yang sama, TAPI dua *occurrence* fisik berbeda — bukan satu objek). Skema sudah membedakan `element_type` vs `element_occurrence` (pola IFC Type-vs-Occurrence, `models.py` `NodeType`), tapi **belum ada logic yang memutuskan kapan "K1" di dua halaman itu SATU type dengan DUA occurrence, vs SATU occurrence yang sama disebut ulang di detail halaman lain**. Anchor test kita (J2/BV1/RB3) semuanya kebetulan tidak punya ambiguitas ini — cek dulu di data nyata apakah ada kode elemen yang muncul di halaman denah DAN halaman detail dengan kemungkinan itu levelnya beda, sebelum resolver dianggap benar untuk kasus umum, bukan cuma 4 anchor yang sudah kita verifikasi.
- **Tidak ada baseline "seberapa banyak fenomena ini muncul di 88 halaman".** Kita cuma verifikasi 3 kode elemen secara manual. Sebelum implementasi dianggap selesai, jalankan resolver terhadap SELURUH 88 halaman dan laporkan: berapa banyak node tergabung, berapa banyak `possibly_same`/`requires_review`, apakah angkanya masuk akal (kalau cross-sheet resolver menyatukan 90% dari seluruh elemen jadi satu node besar, itu tanda resolver terlalu agresif; kalau nyaris tidak menyatukan apa pun, terlalu konservatif). Ini pertanyaan terbuka yang harus Anda jawab dengan data, bukan diasumsikan benar karena 4 anchor lolos.

### Masalah B — 22,0% dangling evidence_refs: kita tahu jumlahnya, kita BELUM tahu polanya

Audit menghitung 839/3.807 referensi putus di 47/88 halaman — itu FAKTA yang sudah diverifikasi. Yang **belum** kita selidiki dan jadi PR terbuka: apakah dangling ref ini **acak** (model kadang lupa membuat entri evidence) atau **sistematis** (mis. selalu terjadi pada kategori observasi tertentu — mungkin cuma di `materials`/`symbols`, tidak pernah di `dimensions`). Kalau sistematis, itu petunjuk penting untuk sheet knowledge patch builder (Fase 3 Tahap A): mungkin kategori tertentu butuh perlakuan beda (skip evidence_refs sepenuhnya untuk kategori X, andalkan `observations` mentah). Codex wajib jalankan analisis pola ini SEBELUM memutuskan patch builder cukup dengan aturan generik "observations sebagai sumber utama" — kalau polanya sistematis per-kategori, solusi generik itu bisa jadi kurang optimal.

### Masalah C — Normalisasi `discipline` cuma disebut "kamus sinonim kecil" — belum ada kamusnya, dan variasi nyata belum dipetakan penuh

Instruksi Fase 3 Tahap B menyebut variasi "Arsitektur"/"ARSITEKTUR"/"Architecture" sebagai contoh, dari 3 sample manual. **Belum ada audit lengkap** seluruh nilai unik `discipline` yang benar-benar muncul di 88 halaman (ada MEP, Struktur, Plumbing, dan "beberapa kategori kecil lainnya" yang belum dirinci di laporan manapun). Sebelum Flash normalizer dianggap selesai, Codex wajib: (1) ekstrak seluruh nilai unik `sheet_identity.discipline.value`/`raw` dari 88 file JSON, (2) bangun kamus normalisasi yang benar-benar menutup SEMUA variasi yang ditemukan (bukan cuma 3 contoh yang kita sebut), (3) laporkan kalau ada nilai yang tidak bisa dipetakan ke kategori standar mana pun (butuh kategori baru atau masuk `missing_information`).

### Masalah D — Skor eskalasi Flash→Pro (§1.3/§2.4) adalah RUMUS DARI DOKUMEN, belum pernah dikalibrasi terhadap data nyata

`risk_score = ambiguity_weight + conflict_weight + fanout_weight + cross_discipline_weight + low_evidence_weight` — dokumen kanonik memberi NAMA komponennya, tapi **tidak memberi bobot/nilai numerik nyata**, dan kita belum pernah menjalankannya terhadap data sungguhan untuk melihat berapa persen kasus akan ter-eskalasi ke Pro. Ini masalah terbuka nyata: kalau bobotnya salah, bisa jadi SEMUA cross-sheet match ter-eskalasi ke Pro (melanggar §13.4 "jangan gunakan Pro untuk seluruh PCKM" — mahal), atau SEMUA lolos sebagai Flash padahal ada yang harusnya direview (silent error, lebih berbahaya karena tidak kelihatan). Codex wajib: usulkan nilai numerik awal untuk tiap `*_weight`, jalankan terhadap 88 halaman, laporkan distribusi skor dan persentase yang ter-eskalasi, lalu argumentasikan kenapa ambang batasnya masuk akal — bukan asal comot angka.

### Masalah E — Token/cost usage TIDAK PERNAH disimpan untuk provider Qwen (DEM) — dan belum diputuskan pola sama untuk DeepSeek (PCKM)

Sudah dikonfirmasi lewat pembacaan kode langsung: `qwen.py extract_page()` membuang `body["usage"]` setiap kali. Ini FAKTA sudah beres diverifikasi (Masalah B Fase 6 §2 di dokumen ini sudah kasih fix konkret). Yang **belum diputuskan**: PCKM synthesis (Fase 3) akan memanggil DeepSeek Flash/Pro berkali-kali per project (bukan cuma 88 kali seperti DEM, tapi per Tahap A-E, berpotensi ratusan panggilan). Kalau pola "buang usage" yang sama terulang di adapter DeepSeek yang akan dibangun di Fase 3, kita akan menghadapi masalah cost-tidak-terlacak yang SAMA PERSIS seperti 88-halaman kemarin, kali ini di scope lebih besar. Codex wajib desain adapter DeepSeek untuk PCKM synthesis dengan usage-capture SEJAK AWAL (bukan ditambal belakangan seperti DEM) — ini bukan opsional di Fase 6, ini syarat desain Fase 3 dari hari pertama.

### Masalah F — Invariant `LOCATED_ON` tunggal sudah ADA validatornya, tapi belum ada strategi "apa yang terjadi kalau resolver memang butuh 2 kandidat lokasi yang sama-sama masuk akal"

`assert_single_located_on()` di `models.py:104` akan **raise ValueError** kalau resolver menghasilkan >1 edge `LOCATED_ON` aktif untuk satu elemen. Itu bagus sebagai pengaman, tapi belum ada jawaban untuk: apa yang Codex lakukan KETIKA validator ini gagal saat synthesis 88 halaman nyata (bukan kalau — kemungkinan ini akan benar-benar terjadi karena data nyata berantakan, lihat Masalah A soal ambiguitas lantai)? Apakah synthesis seluruh snapshot gagal total (buruk — satu elemen ambigu menghentikan seluruh proyek), atau elemen bermasalah itu di-skip sementara dan masuk `requires_review` sambil sisanya tetap jalan (lebih baik, tapi butuh implementasi eksplisit — belum ada di spek manapun)? Ini keputusan desain yang harus Codex buat dan dokumentasikan, bukan cuma menangkap exception generik.

**Cara melaporkan hasil pemecahan masalah A-F:** untuk tiap masalah di atas, sertakan di PR description: apa yang ditemukan dari analisis data nyata, keputusan desain yang diambil dan kenapa, dan bukti konkret (angka/statistik dari 88 halaman) yang mendukung keputusan itu — bukan cuma "sudah diimplementasikan". Claude akan audit ini sebelum approve merge, persis pola yang sudah dipakai sepanjang sesi ini.

---

## 1. FASE 3 — PCKM Synthesis Engine

**Tujuan (dari dokumen kanonik §11.1):** ubah 88 `DrawingEvidenceSheet` per-halaman menjadi satu `ProjectGraphSnapshot` — representasi kanonik proyek (bangunan, lantai, zona, elemen, material, hubungan antar-sheet, konflik, data belum tersedia, evidence asal tiap klaim). PCKM **bukan** menghitung apa pun — murni menormalisasi dan menghubungkan DEM records yang sudah ada.

**Skema — sudah ada, pakai langsung, JANGAN buat ulang:**
- `services/document-intelligence/app/project_graph/models.py` — `ProjectGraphNode`, `ProjectGraphEdge`, `ProjectGraphSnapshot`, `NodeProperty`, `NodeSourceRef`, `EdgeResolver`, `NodeType` (28 tipe), `EdgeRelation` (24 relasi termasuk `SAME_AS`/`POSSIBLY_SAME_AS`/`CONFLICTS_WITH`), `VerificationStatus`, `ConfidenceClass`.
- Zod setara: `packages/schemas/src/index.ts` (`ProjectGraphNode` baris ~1618, `ProjectGraphEdge` ~1648, `ProjectGraphSnapshot` ~1664). **Kalau Fase 3 menambah field apa pun ke Pydantic, Zod WAJIB diubah di commit yang sama** (`CLAUDE.md` §2 — satu sumber kebenaran).

### 1.1 Tahapan synthesis (dokumen kanonik §12 — WAJIB diikuti urutannya, bukan satu panggilan besar)

**Tahap A — Sheet Knowledge Patch** (per halaman, paralel aman):
```
sheet DEM record → page nodes → page edges → aliases → unresolved references
```
Model: DeepSeek v4 Flash. Setiap `DrawingEvidenceSheet` diubah jadi "patch" kecil dulu — bukan langsung digabung ke graph besar. Implementasi: fungsi `build_sheet_patch(sheet: DrawingEvidenceSheet) -> SheetKnowledgePatch` di modul baru `services/document-intelligence/app/project_graph/synthesis.py`. Sumber node/edge kandidat: `sheet.observations.element_labels`, `.dimensions`, `.materials`, `.grids`, `.levels`, `.spaces`, `.symbols`, `.tables`, `sheet.sheet_identity`.

**PENTING (temuan audit 88-halaman, wajib ditangani di tahap ini):** 22,0% dari seluruh `evidence_refs` di data nyata (839/3.807, 47/88 halaman — dihitung dari `observations.*` + `sheet_identity.*` gabungan) menunjuk ke `evidence_id` yang tidak pernah dibuat di `evidence[]`. Patch builder **wajib** memperlakukan `observations`/`sheet_identity` sebagai sumber fakta utama; `evidence[]` dipakai kalau ADA (untuk `bbox`/lokasi visual), tapi **tidak boleh jadi syarat** — kalau `evidence_refs` dangling, tetap buat node/patch-nya, cukup catat `evidence_refs` kosong/parsial di `NodeSourceRef.evidence_refs`. Jangan buang fakta hanya karena jejak visualnya putus.

**Tahap B — Community Merge** (per kelompok, bukan 88 halaman sekaligus):
```
Kelompok utama: architecture / structure / MEP / site / general
Subkelompok: level 1 / level 2 / roof / foundation / external works
```
`discipline` di data nyata tidak konsisten kapitalisasi/bahasa ("Arsitektur"/"ARSITEKTUR"/"Architecture") — normalisasi (lowercase + kamus sinonim kecil ID/EN) **sebelum** grouping, bukan sesudah. Ini "Flash normalizer" di task list kanonik.

**Tahap C — Cross-sheet Resolver:**
Cari kandidat match berdasarkan (dari dokumen kanonik §12.3): kode yang sama, alias, detail callout, section reference, sheet reference, ruang yang sama, level yang sama, material schedule, door/window schedule, type table, conflicting dimensions. Flash mengerjakan kandidat normal; Pro mengerjakan kandidat sulit (lihat skor eskalasi §1.3 di bawah).

**Anchor test WAJIB (sudah diverifikasi langsung di data 88-halaman, dipakai sebagai nilai acuan §3 CLAUDE.md — bukan opsional):**
| Elemen | Muncul di halaman (page_number) | Hasil yang diharapkan |
|---|---|---|
| `J2` (jendela) | 21, 22, 27 | Resolver wajib satukan jadi 1 `ProjectGraphNode` (`node_id` konsisten, `source_refs` mencakup ketiga halaman) |
| `BV1` | 21, 22, 23 | Sama — 1 node, `source_refs` 3 halaman |
| `RB3` | 44, 54, 55, 56 | Sama — 1 node, rentang halaman terjauh (uji resolver tidak dibatasi jarak halaman berdekatan) |
| Konflik dimensi halaman 81 | 81 | Total dimensi horizontal atas (20250mm) vs bawah (20000mm), beda 250mm pada elemen yang sama — WAJIB terangkat jadi node `type: "conflict"` + edge `CONFLICTS_WITH`, bukan hilang saat merge |

Test harus memuat keempatnya sebagai assertion eksplisit (`assert len(matching_nodes) == 1`, dst) terhadap data real di `report/report_drawing_intelligence/dem_extraction_88pages/pages/page-0020.json` (J2, index 20=page 21), `page-0021.json`, `page-0026.json`, dst — file-file itu sudah ada, jangan bikin fixture baru untuk kasus ini.

**Tahap D — Conflict Resolution:**
DeepSeek v4 Pro dipanggil kalau (dokumen kanonik §12.4, implementasikan persis sebagai fungsi skor, bukan if-else bertumpuk):
```python
risk_score = ambiguity_weight + conflict_weight + fanout_weight + cross_discipline_weight + low_evidence_weight
# eskalasi jika salah satu benar:
candidate_count > 1
confidence < 0.78
conflict_detected == True
cross_discipline == True
affected_nodes > 20
```
Pro **tidak boleh menghapus konflik** — outputnya salah satu dari 4 keputusan: `merge`, `keep_separate`, `possibly_same`, `requires_review`. `possibly_same` dan `requires_review` **wajib** masuk `ProjectGraphEdge` dengan `relation: "POSSIBLY_SAME_AS"` dan `confidence_class: "AMBIGUOUS"` — bukan otomatis `SAME_AS`. Ini konsisten dengan `CLAUDE.md` §1.1: usulan AI ambigu wajib kategori `perlu_review`, tidak auto-commit sebagai fakta pasti.

**Tahap E — Project Summary Views** (cache, bukan sumber kebenaran):
project overview, building overview, level overview, discipline overview, system overview, space index, element type index, sheet index, conflict register, missing information register. Simpan sebagai view terpisah yang bisa di-generate ulang dari graph — kalau view dan graph beda, graph yang benar.

### 1.2 Invariant wajib (sudah ada validator-nya di `models.py:104`, pakai)
`assert_single_located_on()` — setiap `element_occurrence` cuma boleh 1 edge `LOCATED_ON` aktif (pola IFC `IfcRelContainedInSpatialStructure`). Sudah dipanggil otomatis lewat `ProjectGraphSnapshot._check_located_on_invariant` model_validator — pastikan resolver Anda tidak membuat lebih dari satu edge `LOCATED_ON` per elemen, atau snapshot construction akan raise `ValueError`.

**Opening dua-langkah (rekomendasi IFC di dokumen §11.4 poin 3):** pintu/jendela pada dinding dimodelkan `WALL --HAS_OPENING--> Opening` lalu `Opening <--FILLED_BY-- Door/Window`, bukan edge langsung dinding→pintu. Node `opening` sudah ada di `NodeType`. Ini relevan untuk RAB nanti (Fase 7): volume dinding harus dikurangi luas bukaan, jadi luas bukaan wajib jadi fakta node tersendiri yang bisa dikutip, bukan diasumsikan Core Engine.

### 1.3 Model routing (dokumen kanonik §13 — WAJIB, bukan pilihan)
```
Default: DeepSeek v4 Flash — sheet knowledge patch, normalisasi sederhana, alias standar,
         level/discipline grouping, edge creation langsung, summary view.
Eskalasi: DeepSeek v4 Pro — cross-sheet link ambigu, conflicting dimensions, detail-to-plan
          mapping sulit, multiple candidates, project-wide consistency review, final graph audit sample.
```
Ini **model backend batch berbeda** dari model chat Command Room (Lucent/Arete/Noir di `apps/web/src/lib/paax-models.ts`) — jangan tertukar. PCKM synthesis tidak dipilih user, dipanggil sistem sendiri.

**Audit trail wajib** (`CLAUDE.md` §1.1): tiap `ProjectGraphEdge.resolver` (field sudah ada di skema) wajib diisi `{"method": ..., "model": "deepseek-v4-flash"|"deepseek-v4-pro"}` untuk edge hasil resolver — bukan cuma untuk yang Pro proses, semua edge hasil inferensi (bukan `extracted` langsung).

### 1.4 Storage (dokumen kanonik §14 — Postgres, bukan Neo4j/FalkorDB dulu)
Tabel: `project_graph_snapshots`, `project_graph_nodes`, `project_graph_edges`, `project_graph_evidence`, `project_graph_node_evidence`, `project_graph_edge_evidence` — skema kolom persis seperti tercantum di dokumen §14.2. Snapshot bersifat immutable + atomic activation (task #12 di task list) — snapshot baru dibangun penuh dulu, baru diaktifkan sebagai "current" dalam satu transaksi, snapshot lama disimpan dengan `superseded_at` terisi (bukan dihapus — perlu untuk audit/rollback).

### 1.5 Test wajib (§3 CLAUDE.md)
- 88 halaman PLHUT sebagai fixture nyata (aturan proyek: PLHUT = kunci uji, BUKAN template — pipeline harus generalisasi ke gambar apa pun, bukan di-hardcode untuk PLHUT).
- Keempat anchor di §1.1 di atas sebagai assertion wajib.
- Test invariant `LOCATED_ON` tunggal (pakai `assert_single_located_on` yang sudah ada).
- Test bahwa snapshot dengan `evidence_refs` dangling tetap berhasil dibangun (regresi untuk temuan 22,0% dangling — jangan sampai synthesis gagal total gara-gara ini).

### 1.6 Exit criteria (dokumen kanonik, harus lolos sebelum PR dibuka)
```
active PCKM snapshot exists
graph query can retrieve known PLHUT facts
```
Plus (tambahan dari saya, syarat commit sebelum lanjut Fase 4): pytest 100% hijau, 4 anchor test lolos, `tsc --noEmit` bersih di `packages/schemas`.

---

## 2. FASE 4 — Project Knowledge Retrieval Service

**Tujuan (dokumen kanonik §16.1):** retrieval **project-scoped, tanpa model menjawab**. Ini murni engine query yang dipakai Command Room di Fase 5 — tidak ada LLM menyusun jawaban di fase ini.

**Skema — sudah ada:** `GraphQueryPlan`, `QueryEntity`, `Citation`, `RetrievalTrace` di `models.py:155-188`.

### 2.1 Urutan wajib (dokumen kanonik §16.1)
```
user question → intent parser → project/snapshot resolver → graph query plan
→ graph retrieval → evidence hydration → context budget pruning → (Fase 5: answer model) → citation formatter
```

### 2.2 Intent classes (dokumen kanonik §16.3 — 16 kelas, pakai persis)
```
GENERAL_CHAT, PROJECT_OVERVIEW, DIRECT_FACT, LIST_FILTER, NODE_EXPLAIN, RELATIONSHIP,
PATH_QUERY, SHEET_LOOKUP, SPACE_LOOKUP, ELEMENT_LOOKUP, MATERIAL_LOOKUP, CONFLICT_LOOKUP,
MISSING_DATA, NUMERIC_STORED_FACT, CALCULATION_REQUIRED, RAB_QUERY, SCHEDULE_QUERY
```
**Fase ini:** `RAB_QUERY` dan `SCHEDULE_QUERY` boleh mengembalikan status "belum dihubungkan" (`data_status: "not_ready"`) — implementasi penuhnya nunggu Fase 7. Jangan implementasikan logic RAB apa pun di sini, cukup intent classifier mengenali kelasnya lalu return status kosong.

### 2.3 Query expansion (dokumen kanonik §16.5 — vocabulary-bound, prinsip graphify sendiri)
```
user terms → normalize → exact graph vocabulary → scoped aliases → construction ontology → selected query tokens
```
**Wajib:** ekspansi hanya boleh pakai vocabulary yang benar-benar ada di graph (persis prinsip yang dipakai skill graphify di repo ini) — jangan biarkan LLM mengarang istilah pencarian yang tidak ada nodenya. Simpan audit trace (`original_terms`, `expanded_terms`, `expansion_sources`) — format persis contoh di dokumen §16.5.

### 2.4 Seed selection (dokumen kanonik §16.6 — skor eksplisit, implementasikan sebagai fungsi scoring, bukan heuristik ad-hoc)
```python
score = (exact_code_match * 1000) + (exact_label_match * 800) + (alias_match * 500)
      + (prefix_match * 100) + (token_overlap * IDF) + project_scope_bonus
      + discipline_match_bonus + level_match_bonus + verified_bonus + centrality_small_bonus
      - ambiguity_penalty - conflict_penalty
```
Dedup berdasarkan **canonical node**, bukan label — karena beberapa node sah bisa punya label sama di lantai berbeda (mis. "K1" bisa muncul sebagai kode di lebih dari satu tipe elemen kalau proyek memang begitu; jangan asumsikan label unik).

### 2.5 Traversal selection (dokumen kanonik §16.7 — pilih mode sesuai jenis pertanyaan, bukan selalu BFS)
| Mode | Dipakai untuk | Depth |
|---|---|---|
| BFS | Daftar, konteks terdekat, overview, "apa saja"/"di mana" | 1-2 |
| DFS | Rantai definisi, "bagaimana X terkait Y", tracing reference | 4-6 |
| Shortest path | Hubungan dua objek spesifik (plan→detail→spec, space→element→material) | - |
| Direct lookup | Kode unik, tidak perlu traversal luas | - |

### 2.6 Relation allowlist (dokumen kanonik §16.8 — traversal TIDAK BOLEH ikuti semua edge)
Contoh `ELEMENT_LOOKUP`: `INSTANCE_OF, LOCATED_ON, LOCATED_IN, DEFINED_BY, DEPICTED_IN, HAS_DIMENSION, USES_MATERIAL, HAS_EVIDENCE`.
Contoh `SPACE_LOOKUP`: `LOCATED_ON, CONTAINS, ADJACENT_TO, OPENS_TO, HAS_FINISH, SERVED_BY, DEPICTED_IN, HAS_EVIDENCE`.
Definisikan allowlist per intent class sebagai konstanta eksplisit (mirror skema `EdgeRelation` yang sudah ada) — jangan biarkan traversal generic mengikuti seluruh 24 tipe edge tanpa filter, itu yang akan membuat context budget meledak.

### 2.7 Evidence hydration (dokumen kanonik §16.9 — dua tahap, jangan gabung jadi satu query berat)
Tahap 1: traversal awal ambil metadata ringan saja (node_id, type, confidence — bukan full properties/evidence).
Tahap 2: **setelah** node terpilih final, baru fetch evidence yang direferensikan node/edge terpilih. Format evidence pack persis contoh dokumen §16.9 (`node_id`, `facts`, `sources[]` dengan `sheet`/`page`/`title`/`evidence`/`bbox`).

**Catatan bbox dari audit:** 85/88 halaman data nyata masih pakai bbox piksel (bukan 0-1 ternormalisasi) — kalau evidence pack menampilkan bbox ke UI Fase 5, cek `source.width_px`/`height_px` per halaman dan konversi ke 0-1 di layer ini kalau perlu konsistensi tampilan, jangan asumsikan semua bbox sudah 0-1.

### 2.8 Budget pruning (dokumen kanonik §16.10 — urutan prioritas eksplisit)
Prioritas simpan: direct matching nodes → verified facts → exact evidence → requested relations → nearest neighbors → conflict/missing-data warnings → community summary.
Buang duluan: distant nodes, generic project metadata, duplicate evidence, low-confidence inferred edges, unrelated disciplines.

### 2.9 Benchmark harness (task #12 — wajib sebelum Fase 5 dimulai)
Set pertanyaan uji terhadap 88-halaman PLHUT (pakai anchor J2/BV1/RB3/konflik-81 dari Fase 3 sebagai basis pertanyaan: "K1 J2 ada di halaman berapa saja?", dst) + assert jumlah node/edge yang dikembalikan sesuai ekspektasi + context tetap dalam `budget_tokens`.

### 2.10 Exit criteria (dokumen kanonik)
```
benchmark query returns expected nodes/evidence
context stays within budget
```

---

## 3. FASE 5 — Command Room Integration

**Tujuan (dokumen kanonik §16.1, §18):** Command Room grounded pada PCKM lewat retrieval Fase 4 — **read-only terhadap graph**, tiap jawaban faktual **wajib** mengutip sumber sheet/page. Ini satu-satunya fase di antara 3-6 yang menyentuh `apps/web` (file terproteksi §6 CLAUDE.md).

**Skema jawaban — sudah ada:** `GroundedAnswer`, `Citation`, `RetrievalTrace` di `models.py:173-201`.

### 3.1 Request contract (dokumen kanonik §16.2 — pakai persis, jangan modifikasi bentuk)
```json
{
  "runId": "RUN-...", "conversationId": "CONV-...", "projectId": "PRJ-001",
  "messages": [], "message": "Kolom K1 berada di lantai mana saja?",
  "modelAlias": "lucent", "reasoningEffort": "high", "thinking": "off",
  "retrieval": {"mode": "auto", "maxContextTokens": 1600, "includeEvidence": true}
}
```
`modelAlias` di sini tetap `lucent`/`arete`/`noir` (model chat yang sudah ada di `apps/web/src/lib/paax-models.ts`) — **berbeda** dari DeepSeek Flash/Pro yang dipakai Fase 3 untuk synthesis. Model chat cuma **membaca dan menjelaskan** hasil retrieval Fase 4, tidak pernah menghitung ulang atau mengarang node baru (`CLAUDE.md` §1 berlaku penuh).

### 3.2 Context pack (dokumen kanonik §16.11 — urutan tetap, JANGAN inject seluruh graph)
```
SYSTEM RULES → PROJECT ID + ACTIVE SNAPSHOT → USER INTENT → RETRIEVED FACTS
→ RETRIEVED RELATIONSHIPS → CONFLICTS/MISSING DATA → SOURCE CITATIONS
→ RECENT CONVERSATION SUMMARY → CURRENT USER QUESTION
```
**Eksplisit dilarang** (dokumen kanonik, garis bawah tebal di sumber): seluruh PCKM + seluruh TKG text + seluruh RAB + 40 pesan lengkap. Retrieval Fase 4 sudah memangkas ini — jangan Fase 5 membatalkan pemangkasan itu dengan inject mentah.

### 3.3 Conversation memory (dokumen kanonik §19 — 3 layer, bukan riwayat penuh)
- **Recent turn window**: 4-8 pesan terakhir saja (bukan 40 seperti route lama).
- **Conversation summary**: `{active_topics[], resolved_entities{}, user_constraints[], open_questions[]}`.
- **Project graph memory**: cuma `active_node_ids[]` yang sedang dibahas, bukan fakta node disimpan ulang di summary — fakta tetap dari graph tiap kali, summary cuma menyimpan "sedang bahas node mana".

### 3.4 Citation contract (dokumen kanonik §18 — WAJIB tanpa kecuali)
```json
{
  "answer": "...", "citations": [{"citation_id": "C1", "document_id": "...",
  "sheet_id": "S-49", "page_number": 49, "title": "Detail Kolom", "evidence_ids": ["EV-P049-121"]}],
  "data_status": "grounded|partial|ungrounded|not_ready", "confidence": 0.91,
  "missing_data": [], "conflicts": [],
  "retrieval_trace": {"intent": "...", "seed_node_ids": [...], "node_count": 8, "edge_count": 11, "context_token_estimate": 1120}
}
```
Setiap klaim faktual di `answer` wajib bisa dilacak balik ke minimal satu `citation`. Kalau retrieval tidak menemukan apa pun relevan, `data_status: "ungrounded"` atau `"not_ready"` — model **tidak boleh** tetap menjawab seolah tahu faktanya. UI tidak wajib tampilkan seluruh `retrieval_trace` ke user biasa (boleh disembunyikan di balik "Sources"/developer mode), tapi wajib disimpan untuk audit.

### 3.5 Tool wiring
Kemungkinan besar masuk `apps/web/src/app/api/command-room/chat/tools.ts` (file terproteksi §6 CLAUDE.md — jangan dihapus/dipindah, buktikan dulu lewat graphify kalau ragu). Cek pola `paax-connector-foundry` skill (`.claude/skills/paax-connector-foundry/`) kalau ini dianggap "koneksi baru service" ke `services/document-intelligence`.

### 3.6 Fallback & UI (task #7,8,11 — jangan skip, ini yang bikin fitur terasa selesai bukan setengah jadi)
- **Graph-not-ready UI**: kalau project belum punya snapshot aktif (Fase 3 belum jalan untuk project itu), Command Room harus bilang jelas "belum ada graph proyek ini" — bukan diam-diam jatuh ke jawaban tanpa grounding.
- **Fallback legacy TKG**: kalau ada jalur TKG lama yang masih dipakai project lain, jangan putus total — cek dulu apakah TKG routes yang diarsipkan sesi lalu (`drawing_routes.py` dipindah ke `G:\paax-cleanup-archive\`) relevan di sini sebelum memutuskan fallback-nya seperti apa.
- **Source UI**: tampilan kutipan (card ringkas + link ke halaman sumber gambar) — bisa pakai `bbox` dari evidence pack Fase 4 untuk highlight lokasi di gambar asli.

### 3.7 Test wajib
End-to-end: ajukan pertanyaan nyata tentang PLHUT (pakai anchor J2/BV1/RB3/konflik-81) lewat Command Room, assert jawaban menyebut halaman yang benar via `citations`, assert tidak ada full-graph ter-inject ke prompt (cek ukuran context pack terhadap `budget_tokens`).

### 3.8 Exit criteria (dokumen kanonik)
```
Command Room answers PLHUT questions from graph
each factual answer cites sheet/page
no full graph injected
```

**→ Setelah exit criteria ini lolos DAN owner menyatakan Command Room stabil, Fase 7 (§5 di bawah) boleh dibuka. Sebelum itu, lanjut dulu ke Fase 6.**

---

## 4. FASE 6 — Quality, Cost, and Hardening

**Tujuan (dokumen kanonik):** bukan fitur baru — mengeraskan apa yang sudah dibangun Fase 3-5 supaya production-ready. Ini yang paling relevan dengan pertanyaan Anda "supaya nanti user ekstraksi gambar tidak ada masalah apa pun".

**10 task kanonik, dengan instruksi konkret per task:**

1. **Accuracy benchmark** — set pertanyaan tetap terhadap 88-halaman PLHUT (perluas dari benchmark harness Fase 4 §2.9), jalankan tiap kali ada perubahan resolver/prompt, catat akurasi dari waktu ke waktu (bukan cuma sekali jalan lalu lupa).
2. **Token benchmark** — **ini menutup gap nyata yang ditemukan audit sesi ini**: `qwen.py` saat ini TIDAK PERNAH menyimpan `body["usage"]` dari respons API (dikonfirmasi langsung di kode — `extract_page()` cuma ambil `body["choices"][0]["message"]["content"]`, field `usage` dibuang). Task konkret: tambah capture `usage = body.get("usage", {})` di `qwen.py`, simpan ke `DemGeneration` sebagai field baru (`prompt_tokens`, `completion_tokens`, `cached_tokens`, `reasoning_tokens`) — **update Pydantic DAN Zod bersamaan** (`CLAUDE.md` §2). Ini kenapa 88-halaman kemarin tidak bisa dihitung cost-nya sama sekali; jangan ulangi untuk PCKM synthesis (DeepSeek Flash/Pro) — capture usage dari awal di sana.
3. **Latency benchmark** — catat waktu per tahap synthesis (A-E di Fase 3) dan per query (Fase 4), bukan cuma end-to-end.
4. **Cache** — `cache_control: ephemeral` sudah dipakai di prompt DEM extraction (`qwen.py`); terapkan pola serupa untuk instruksi statis PCKM synthesis kalau providernya (DeepSeek) mendukung prompt caching.
5. **Rate limit** — DEM extraction 88-halaman sempat kena `IncompleteRead` di 4-way concurrent load; PCKM synthesis dan retrieval service butuh rate-limit/backoff eksplisit terhadap provider DeepSeek, jangan asumsikan tidak akan kena masalah serupa.
6. **Security** — review endpoint retrieval baru (Fase 4/5) terhadap OWASP top 10 (`CLAUDE.md` instruksi umum) — khususnya query injection kalau `GraphQueryPlan.filters` dibangun dari input user tanpa sanitasi, dan RBAC per project (`projectId` di request Fase 5 harus divalidasi milik user yang login, bukan cuma dipercaya dari body request).
7. **Human correction** — jalur untuk owner/estimator mengoreksi node/edge yang salah (mis. hasil `possibly_same`/`requires_review` dari Tahap D Fase 3) — ini yang mengisi `verification_status: "human_verified"` di skema yang sudah ada.
8. **Graph correction workflow** — begitu koreksi manusia masuk, bagaimana itu jadi snapshot baru (bukan mutasi diam-diam ke snapshot aktif — pakai pola atomic activation yang sama seperti Fase 3 §1.4).
9. **Observability dashboard** — gabungkan token benchmark (#2), latency (#3), accuracy (#1) jadi satu tempat yang bisa dilihat, bukan tersebar di log.
10. **Model routing optimization** — setelah ada data nyata dari accuracy+token+latency benchmark, evaluasi apakah skor eskalasi Flash→Pro di Fase 3 §1.3 sudah pas (terlalu sering eskalasi = mahal, terlalu jarang = kualitas turun) — sesuaikan threshold berdasarkan data, bukan tebakan awal.

**Tidak ada exit criteria eksplisit di dokumen kanonik untuk Fase 6** — treat sebagai selesai ketika: token usage 100% ter-capture untuk semua provider (DEM + PCKM), accuracy benchmark berjalan otomatis di CI, tidak ada endpoint baru dari Fase 4/5 yang lolos tanpa review keamanan.

---

## 5. FASE 7 — RAB Bridge Later (spek siap, TERKUNCI sampai Command Room stabil)

**Status: JANGAN DIKERJAKAN SEKARANG.** Dokumen kanonik menulis eksplisit: *"Tidak dikerjakan sebelum Command Room stabil."* Bagian ini disiapkan supaya begitu syaratnya terpenuhi, tidak perlu brainstorming ulang dari nol — tapi implementasi/merge ke jalur utama menunggu konfirmasi owner bahwa Fase 5 stabil.

**Alur (dokumen kanonik):**
```
human-verified graph facts → takeoff request → Core Engine → Quantity Facts → BOQ → AHSP → RAB
```

**Batasan wajib (Aturan Emas §1, ditegaskan ulang karena ini fase paling berisiko melanggarnya):**
- Fase 7 **hanya** mengangkat `conflict registry` (dibangun di Fase 3 Tahap D — node `type: "conflict"` + edge `CONFLICTS_WITH`) jadi **usulan** yang menunggu approval manusia.
- **Tidak ada auto-fill.** Tidak ada perhitungan volume/BOQ/AHSP/RAB yang dilakukan LLM atau TypeScript — itu tetap 100% domain `services/core-engine` (Python, deterministik), sama seperti semua fitur RAB lain di proyek ini.
- `human-verified graph facts` di alur di atas artinya: hanya node dengan `verification_status: "human_verified"` (hasil task Fase 6 #7 human correction) yang boleh masuk `takeoff request` ke Core Engine — node `ai_interpreted`/`cross_sheet_inferred` yang belum direview manusia tidak boleh langsung jadi input hitungan.
- `RAB_QUERY`/`SCHEDULE_QUERY` intent yang di Fase 4 sengaja dikosongkan (`data_status: "not_ready"`) — Fase 7 yang mengisi implementasinya, tetap dengan batasan: jawaban ke Command Room soal RAB tetap **menampilkan angka dari Core Engine**, bukan LLM menghitung sendiri lalu menjelaskan hasilnya.

**Test wajib nanti:** anchor konflik halaman 81 (§1.1 Fase 3) dipakai sebagai kasus uji end-to-end: konflik terekam di PCKM → muncul sebagai usulan di Command Room/UI RAB → owner approve/reject → kalau approve, jadi input takeoff request → Core Engine hitung → angka RAB berubah sesuai — Claude/Codex tidak pernah menulis angka RAB itu sendiri di kode manapun.

---

## Ringkasan gerbang per fase (checklist sebelum lanjut fase berikutnya)

| Fase | Selesai kalau | Sebelum lanjut fase berikutnya |
|---|---|---|
| 3 | Exit criteria kanonik lolos + 4 anchor test + pytest hijau + Zod sinkron | PR dibuka, review Claude (audit resolver logic + angka), approval owner, merge |
| 4 | Benchmark query kembalikan node/evidence sesuai + budget terjaga | PR terpisah, sama seperti di atas |
| 5 | Command Room jawab PLHUT dari graph + citation wajib + no full-graph inject | PR terpisah + **owner menyatakan Command Room stabil** (syarat pembuka Fase 7) |
| 6 | Token usage ter-capture penuh, accuracy benchmark otomatis, review keamanan endpoint baru selesai | PR terpisah |
| 7 | **Terkunci sampai baris di atas (Fase 5) terpenuhi** | Baru dibuka setelah konfirmasi eksplisit owner |
