# Sintesis Diskusi 3-Arah: Query Lokasi/Volume Spesifik pada Command Room

**Peserta:** Claude (Sonnet 5, otak sintesis + riset kode independen), Codex (GPT-5.6, effort high, 2 babak), Antigravity (Gemini 3.5 Flash High, 2 babak)
**Tanggal:** 2026-07-16
**Metode:** Ketiga pihak diberi konteks identik, bekerja independen babak 1, lalu saling mengkritisi babak 2, disintesis oleh Claude.

---

## 1. Pertanyaan yang Dijawab

> Bagaimana caranya ketika Command Room ditanya soal **lokasi atau volume spesifik** bangunan (misal: "struktur di lantai 2", "volume kolom lantai 1") — sistem bisa menjawab akurat?

## 2. Diagnosis — Konsensus Bulat 3 Pihak

**Dugaan owner benar.** Ketiga pihak independen sampai pada kesimpulan yang sama: masalahnya bukan bug kecil di retrieval, tapi **tahap arsitektur yang sudah dirancang di canonical plan sejak 2026-07-14 namun dilewati saat implementasi**:

- §12.2 "Tahap B — Community merge" menyebutkan eksplisit sub-kelompok **"level 1, level 2, roof, foundation"** sebagai unit merge — belum pernah dibangun. Implementasi nyata (`build_graph_communities()`) hanya connected-component graph generik, tanpa makna spasial apa pun.
- §12.5 "Tahap E — Project summary views" (level overview, dst) — belum pernah dibangun. `summary_builder.py` yang ada **BUKAN** ini — hanya proyeksi metadata datar (entities/risks/conflicts terurut ID), tanpa pengelompokan per-level/disiplin. (Antigravity awalnya salah kira modul ini = Tahap E; dikoreksi dan mereka akui.)
- §16.1 "intent parser" — nol implementasi (`grep IntentParser/parse_intent` = 0 hasil di seluruh `services/`).
- §13.1 secara eksplisit menetapkan **"level grouping"** sebagai tugas resmi DeepSeek v4 Flash — bukan dugaan baru, ini sudah keputusan arsitektur lama yang belum dieksekusi.

**Bukti konkret (ditemukan Claude, diverifikasi lewat data fixture 88 halaman nyata):**
- Halaman berjudul **"DENAH LANTAI 1"** menyebut levelnya sendiri sebagai **"Main Floor"** (bahasa Inggris). Halaman lain pakai "Floor 1"/"Floor 2". Ini membuktikan penyatuan level **tidak bisa murni deterministik** (beda dari dedup `element_type` yang berbasis kode presisi seperti "K1") — perlu penalaran semantik AI untuk kasus yang rule gagal.
- Query "lantai 2" (patch kemarin): 67 node bersih, relevan. Query "struktur lantai 2" (frasa gabungan alami): **0 hasil total**. Level di fixture nyata TIDAK di-dedup lintas halaman — belasan node terpisah bernama persis "Lantai 2".
- `GraphQueryPlan` (Pydantic `models.py:160` + Zod `index.ts:1692`, **sudah sinkron sejak Phase 1**) adalah bentuk kontrak query terstruktur yang persis dibutuhkan (`intent`, `filters: {level, discipline}`) — tapi belum pernah disambungkan ke endpoint retrieve yang ada sekarang (yang hanya terima `query: str` polos).

## 3. Arsitektur yang Disepakati (Konsensus Final)

```
DEM patches → canonical identity resolution (level/space) → immutable PCKM snapshot
           → summary views per snapshot (Tahap E) → query planner (intent parser)
           → jawab dari view/graph, ATAU → RAB Bridge → Core Engine (untuk angka final)
```

**Urutan ini WAJIB, bukan opsional** — poin krusial dari Codex yang disepakati Antigravity setelah dikritisi: kalau summary view dibangun dari belasan node "Lantai 2" yang belum disatukan identitasnya, view itu **hanya mempercepat akses ke duplikasi, bukan memperbaiki akurasi**. Canonicalization harus selesai dulu.

### 3.1 Resolusi Level (Canonicalization) — Hierarki Bertingkat

Bukan "AI mengolah semua data" — tapi hierarki pertahanan berlapis, konsisten dengan §13.4 ("jangan Pro/AI untuk semua"):

1. **Rule-based dulu** (gratis, instan): normalisasi teks (`_text_key`, pola yang sudah ada di `alias_resolver.py`/`cross_sheet_resolver.py`) + kamus alias statis proyek (Lt./Lantai/Floor/Level, dst).
2. **Fallback DeepSeek v4 Flash** — hanya untuk kasus yang rule gagal cocokkan (contoh nyata: "Main Floor" vs "Lantai 1"). Sesuai §13.1.
3. **Eskalasi DeepSeek v4 Pro** — hanya untuk ambiguitas lintas-sheet/lintas-disiplin, sesuai risk score §13.3. Kasus tidak yakin ditandai `ambiguous`, tidak dipaksa merge.

Hasil: satu `canonical_level_id` per level fisik, dengan setiap mention per-halaman tetap terlacak via edge `SAME_AS`/`DERIVED_FROM` (relasi ini **sudah ada** di `EdgeRelation` enum, tidak perlu skema baru) — bukan dihapus, demi audit trail.

### 3.2 Skema Summary View (Sintesis Gabungan)

Codex (envelope operasional: versioning, provenance, quality) + Antigravity (payload level yang konkret, mudah jadi UI) digabung:

```json
{
  "schema_version": "paax.pckm.summary-view.v1",
  "project_id": "...", "snapshot_id": "...",
  "view_kind": "LEVEL_OVERVIEW",
  "grain": { "building_id": null, "level_id": "...", "discipline": null, "zone_id": null },
  "summary": {
    "level_name": "Lantai 2",
    "element_type_index": [{ "element_type_id": "...", "name": "Kolom K1", "occurrence_count": 12 }],
    "discipline_counts": [],
    "stored_measurement_facts": []
  },
  "quality": {
    "confirmed_count": 0, "ambiguous_binding_count": 0, "conflict_count": 0,
    "ambiguous_binding_ids": [], "conflict_ids": []
  },
  "provenance": { "source_document_ids": [], "evidence_ids": [], "summary_builder_version": "..." }
}
```

**Aturan wajib pada skema ini:**
- `quality.ambiguous_binding_ids`/`conflict_ids` **tidak boleh ditunda** — tanpa ini, "12 kolom di Lantai 2" tidak bisa dibedakan dari "10 pasti + 2 lokasinya ambigu". Elemen ambigu **tidak masuk** `confirmed_count`.
- Field disebut eksplisit `occurrence_count`/`entity_count` — **bukan** "quantity"/"volume" (mencegah kebingungan dengan angka RAB).
- `stored_measurement_facts` hanya angka yang **memang tertulis** di gambar + unit + evidence. **Tidak boleh** menjumlahkan/menurunkan volume baru.
- View wajib terikat `snapshot_id`; snapshot baru tidak boleh menyajikan view lama (selaras dengan `build_and_activate_snapshot` atomic activation yang sudah ada).
- `entity_ids`/`evidence_ids` penuh sebaiknya di endpoint drill-down terpisah (berpaginasi), bukan disalin penuh ke setiap overview — supaya hemat token.

### 3.3 Tiga Kelas Query (Bukan Dua) — Wajib untuk Aturan Emas

Antigravity awalnya usul 2 jalur (`LEVEL_OVERVIEW` vs `RAB_QUERY`). Codex membuktikan itu tidak cukup — **disepakati 3 kelas**:

| Kelas | Sumber Jawaban | Contoh |
|---|---|---|
| `LIST_FILTER` | Summary view / graph | "Elemen apa saja di Lantai 2?" |
| `NUMERIC_STORED_FACT` | Graph + evidence langsung | "Berapa tinggi yang tertulis di detail ini?" |
| `RAB_QUERY` / `CALCULATION_REQUIRED` | RAB Bridge → Core Engine (approval manusia wajib) | "Berapa volume beton/biaya lantai 2?" |

**Risiko konkret kalau cuma 2 kelas** (alasan Codex, disepakati): pertanyaan "berapa tinggi balok yang tertulis" bisa salah dipaksa ke RAB/Core Engine (padahal itu fakta gambar, bukan hitungan) — ATAU diperlakukan sebagai overview lalu angka dikembalikan tanpa evidence/unit/penanda ambigu. Paling berbahaya: pertanyaan volume/biaya bisa "tergelincir" ke view karena sama-sama mengandung kata "berapa", lalu model tergoda mengarang perhitungan sendiri dari daftar dimensi — **pelanggaran Aturan Emas**. `GraphQueryPlan` sudah menyediakan kedua intent (`NUMERIC_STORED_FACT`, `CALCULATION_REQUIRED`) — bukan kompleksitas baru, tinggal dipakai.

### 3.4 Intent Parser Query-Time

Terpisah tegas dari synthesis-time canonicalization (beda tanggung jawab):

1. **Rule/schema-constrained dulu** — kamus level+disiplin+alias, exact/prefix match ke vocabulary graph yang sudah ada (§16.5 query expansion).
2. **Fallback DeepSeek v4 Flash** — mengekstrak `intent`+`filters`+`entities` ke `GraphQueryPlan` (skema sudah ada, Pydantic+Zod sinkron) untuk frasa yang rule gagal parse, misal "struktur lantai 2" → `{"intent":"LIST_FILTER","filters":{"level":"Lantai 2","discipline":"structure"}}`.
3. Output **wajib divalidasi** terhadap vocabulary/node ID/relation allowlist — tidak pernah dipercaya sebagai query bebas.

**Catatan koreksi penting:** Antigravity sempat salah menyebut "Gemini 3.5 Flash/DeepSeek Flash" untuk jalur ini — **ditolak dan dikoreksi**. Gemini adalah model yang mengendalikan Antigravity sebagai coding agent (CLI), sama sekali tidak boleh masuk jalur produksi PAAX. Jalur intent parser **murni DeepSeek Flash/Pro**, sama seperti PCKM synthesis (§13) — bukan model terpisah, dan bukan Command Room chat model (Lucent/Arete/Noir) juga.

## 4. Trade-off (Konsensus)

| Aspek | Dampak | Mitigasi |
|---|---|---|
| Token AI | Biaya batch saat sintesis/binding, bukan per-pertanyaan | Rule dulu; Flash kasus biasa; Pro hanya eskalasi |
| Latency tulis | Snapshot activation lebih lambat (views perlu dibangun) | Build async sebelum activation; snapshot belum "siap" sebelum quality gate lolos |
| Latency baca | Jauh lebih cepat untuk query lokasi/ringkasan | View menyaring kandidat; graph mentah hanya untuk hydrate evidence |
| Maintenance | Schema+migrasi+materializer+test baru | Versioned per snapshot; Pydantic+Zod diubah dalam commit yang sama |
| Staleness | Nol secara desain — snapshot immutable | Snapshot baru ⇒ view baru ⇒ aktivasi atomik (pola sudah ada di `build_and_activate_snapshot`) |
| Risiko salah grouping | Binding salah bisa terlihat yakin padahal salah | Binding konservatif, status `ambiguous` eksplisit, evidence wajib, review manusia |
| Risiko Aturan Emas | View bisa "menggoda" agregasi kuantitas jadi volume | Batasi view ke grouping/indexing/stored facts/distinct count; volume selalu lewat Core Engine |

## 5. Urutan Implementasi Realistis (Konsensus)

1. **Acceptance tests dulu** dari fixture 88 halaman nyata (sebelum kode): "struktur lantai 2" tidak nol dan scope-nya benar; duplikasi "Lantai 2" tidak menggandakan count; setiap jawaban bawa sitasi; "volume...m³" tidak pernah dijawab AI/view langsung; snapshot baru tidak bisa pakai view snapshot lama.
2. **Canonical spatial binding** di Fase 3 (`cross_sheet_resolver.py`/`synthesis.py`): dedup level lintas halaman (rule dulu, Flash fallback, Pro eskalasi), status `ambiguous`/`conflicting` eksplisit, `LOCATED_ON` di-rewire ke level kanonis.
3. **Schema + migrasi summary views**: `snapshot_id` wajib, scope/index/provenance/quality, nol field hasil kalkulasi, Pydantic+Zod bersamaan.
4. **Materializer Tahap E**: proyeksi deterministik per project/building/level/discipline; Flash hanya untuk label/binding yang rule gagal; audit model/prompt-version/input-output per keputusan AI.
5. **Intent parser + query-plan validator**: rule dulu, vocabulary/alias lookup, fallback Flash tervalidasi, klasifikasi count vs stored fact vs Core Engine.
6. **Ganti endpoint retrieval**: dari "query string → BFS" jadi "validated query plan → view lookup → scoped graph/evidence hydration". Patch level-exact kemarin dipertahankan sebagai fallback kompatibilitas, bukan strategi utama.
7. **Hubungkan Command Room**, ukur: zero-result rate lokasi, false-scope rate, evidence coverage, escalation rate/cost, freshness per `snapshot_id`.

## 6. Yang TIDAK Disepakati / Perlu Keputusan Anda

Tidak ada perbedaan pendapat substansial yang tersisa — kedua agent konvergen penuh setelah babak 2. Satu nuansa terbuka:

- **Skala effort**: apakah semua 7 langkah ini dikerjakan sekaligus (persis pola Fase 3-7 kemarin, Antigravity jalan terus tanpa henti), atau dipecah bertahap dengan gerbang review di antaranya (langkah 1-2 dulu sebagai PR terpisah, baru lanjut). Ini murni keputusan operasional Anda, bukan soal teknis yang diperdebatkan ketiga pihak.

## 7. Ringkasan untuk Anda (Non-Teknis)

Dugaan Anda tepat sasaran. Command Room saat ini menjawab pertanyaan lokasi dengan cara "mencari kata yang mirip" di data mentah — itu sebabnya "lantai 2" saja bisa dijawab (setelah kemarin diperbaiki) tapi "struktur di lantai 2" gagal total. Solusinya **bukan** menambal pencarian lagi, tapi menyusun ulang data jadi "ringkasan matang per lantai" **setelah** sistem memastikan mana yang benar-benar lantai yang sama (karena satu gambar menyebut lantainya sendiri dalam bahasa Inggris — bukti nyata bahwa penyatuan lantai butuh AI, bukan cuma pencocokan teks). Setelah data matang ini ada, pertanyaan seperti "berapa kolom di lantai 2" dijawab langsung dari ringkasan (cepat, murah), sementara pertanyaan "berapa volume/biaya" tetap wajib lewat Core Engine dengan persetujuan Anda — tidak pernah dihitung AI sendiri.
