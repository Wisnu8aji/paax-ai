# Paket Bukti Bersama — Debat Strategis Drawing Intelligence R1 (2026-07-16)

> Disusun oleh Fable 5 (lead orchestrator). Berisi FAKTA TERVERIFIKASI per commit `e4ab1ae`
> (branch `feat/pckm-phase3-synthesis`), BUKAN kesimpulan. Anda WAJIB memverifikasi sendiri
> klaim di sini terhadap kode nyata — jangan menganggap dokumen sama dengan implementasi.

## 0. Misi (dari mandat owner)

Pimpin penyempurnaan PAAX Drawing Intelligence sampai mampu mengubah gambar kerja menjadi
pengetahuan proyek yang konsisten, dapat ditanya, dapat ditelusuri sumbernya, dapat
diverifikasi manusia, dan dapat diteruskan aman menuju quantity takeoff, BOQ, RAB.
Masalahnya BUKAN bug retrieval kecil — melainkan bagaimana PAAX memahami bangunan utuh,
membedakan lokasi/disiplin, menyatukan informasi lintas halaman, menjawab konsisten, dan
mencegah AI mengarang angka engineering. Baca mandat penuh:
`docs/prompts/FABLE_5_PAAX_DRAWING_INTELLIGENCE_STRATEGIC_MANDATE.md`

## 1. Kondisi terverifikasi (fakta per 2026-07-16, test: doc-intel 418 passed/5 skipped; db 37 passed/1 skipped)

### 1.1 DEM (Drawing Evidence Model) — ekstraksi per halaman
- Fixture nyata 88 halaman PLHUT tersimpan: `report/report_drawing_intelligence/dem_extraction_88pages/pages/page-*.json` + PDF sumber 25MB di `docs/plans/drawing intelligence/`.
- Ekstraktor Qwen (DashScope) dengan JSON-Schema constrained output, klasifikasi kegagalan transient/permanent, resume idempoten (Phase 2 selesai): `services/document-intelligence/app/transcription/`.
- Bukti kasus sulit nyata: halaman berjudul "DENAH LANTAI 1" menyebut levelnya sendiri "Main Floor" (Inggris); halaman lain "Floor 1"/"Floor 2" — penyatuan level TIDAK bisa murni pencocokan teks.

### 1.2 PCKM synthesis (deterministik + eskalasi AI)
- Pipeline: `page_patch.py` → alias resolution → `cross_sheet_resolver.py` → konflik → `community_builder` → `synthesis.py:synthesize_project_graph()` (L379).
- Hasil fixture 88 hal: 4218 nodes / 4583 edges / 12 level bersih (dulu 168 node level mentah — sudah dikecualikan dari output, hanya node terdedup prefix `LEVEL-` yang punya edge `LOCATED_ON`).
- Eskalasi AI: `providers/deepseek.py` `DeepSeekPckmProvider` — LIVE VERIFIED 2026-07-16 (key terpisah `DRAWING_INTELLIGENCE_API_KEY`, model `deepseek-v4-flash` via OpenRouter, 4 kandidat eskalasi, keputusan merge/keep_separate/possibly_same patuh enum, latensi 5-17 dtk/kandidat). Laporan: `ANTIGRAVITY_REPORT_ESKALASI_LIVE_VERIFIED_2026-07-16.md`.
- Ambiguitas dipertahankan eksplisit (edge `POSSIBLY_SAME_AS`; contoh nyata: 7 binding ambigu di "Lantai 2" fixture).

### 1.3 Storage & summary views (services/db)
- Migrasi 0009 (graph storage) → 0010 (corrections) → 0011 (retrieval cache) → 0012 (summary views). Postgres target, SQLite in-memory untuk test (tidak ada Postgres nyata di mesin ini).
- `build_and_activate_snapshot()` (`project_graph_repository.py:212`): tulis graph + `persist_summary_views()` SEBELUM aktivasi, supersede snapshot lama atomik dalam satu transaksi.
- Summary view LEVEL_OVERVIEW: Pydantic (`app/project_graph/models.py`) + Zod (`packages/schemas/src/index.ts`) sinkron; `compile_level_overview()` (summary_builder.py:196) DIVERIFIKASI nol aritmatika (semua count = len() distinct ID; stored_measurement_facts salin verbatim angka tertulis + evidence_refs); `compile_all_level_overviews()` (L410); endpoint `GET /projects/{id}/project-graph/summary-views` dengan RoleChecker + filter view_kind/level_id.
- **FAKTA KUNCI: summary views tersimpan tapi BELUM dikonsumsi jalur query mana pun.**

### 1.4 Retrieval & query
- `POST /projects/{id}/project-graph/retrieve` (`project_graph_retrieval.py:108`): terima `query: str` polos → normalize → seed level-exact (prioritas node level ber-`LOCATED_ON`) ATAU text-match → BFS depth≤N → budget pruning → evidence hydration. Cache + rate limit + metrics ada.
- `GraphQueryPlan` + `QueryIntentEnum` (Pydantic `models.py:160`, Zod `index.ts:1692`) — ada sejak Phase 1, sinkron, **TIDAK PERNAH disambungkan** ke endpoint retrieve.
- Intent parser: **nol implementasi** (grep IntentParser/parse_intent = 0 di services/).

### 1.5 Command Room
- Tool loop penuh 3 model (`apps/web/src/app/api/command-room/chat/tools.ts`): Lucent (DeepSeek native), Arete (DashScope), Noir (Anthropic native); audit log tiap tool call; feature flag `COMMAND_ROOM_TOOLS_ENABLED`; TOOL_SYSTEM_SUFFIX wajib sitasi + larangan mengarang.
- `query_project_graph` tool (`services/ai-orchestrator/src/tools/query_project_graph.ts`) → endpoint retrieve. **FAKTA KUNCI: deskripsi tool berisi workaround prompt** — model disuruh "kirim HANYA nama lantai persis (query=\"Lantai 2\"), JANGAN gabungkan dengan jenis elemen" karena frasa alami "struktur lantai 2" = 0 hasil. Solusi bergantung-prompt, bukan arsitektur.

### 1.6 Jalur quantity/RAB
- core-engine MATANG & teruji: `app/tkg/takeoff.py:takeoff_tkg()` (L954), `geometry/volume.py:compute_volume()`, `validate_tkg()`, AHSP mapping, compute_rab, excel_exporter — golden test PLHUT hijau. Semua angka dari engine (Aturan Emas).
- `project_graph_rab_bridge.py:build_rab_bridge_proposal()` — kandidat berbasis evidence, status `requires_human_approval`, endpoint ada. **Belum ada consumer flow/UI; belum ada lapisan measurement rules / engineering assumptions antara fakta PCKM dan input TKG engine.**

### 1.7 Human review & UI
- Tabel corrections ada (migrasi 0010) — belum ada workflow/UI review untuk PCKM.
- UI DEM/PCKM: **nol**. Satu-satunya permukaan = chat Command Room. (UI lama `tkg-workspace.tsx` milik pipeline lama yang diarsip.)

### 1.8 Benchmark/evaluasi
- **Belum ada suite evaluasi query accuracy** (acceptance tests dari SINTESIS_3ARAH langkah 1 terlewati). Yang ada: unit/integration test per komponen (semua hijau).

### 1.9 Topologi branch/PR
- Branch kerja `feat/pckm-phase3-synthesis` = garis TERLENGKAP (36 commit di depan main).
- PR draft #42-#47 (stacked chain review/pckm-*) dibuat 2026-07-15 = kemasan review dari pekerjaan LAMA, tertinggal dari HEAD sekarang.

## 2. Dokumen kanonik yang WAJIB Anda baca (pakai graphify untuk navigasi)
1. Mandat: `docs/prompts/FABLE_5_PAAX_DRAWING_INTELLIGENCE_STRATEGIC_MANDATE.md`
2. Plan kanonik (3943 baris — fokus §12 synthesis stages, §13 model split, §16 retrieval architecture, §17 tool contract, §18 answer contract): `docs/plans/drawing intelligence/PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md`
3. Sintesis 3-arah terdahulu (arsitektur query lokasi sudah disepakati 3 pihak — JANGAN didesain ulang dari nol, tapi BOLEH dikritisi dengan bukti): `report/report_drawing_intelligence/SINTESIS_3ARAH_QUERY_LOKASI_VOLUME_2026-07-16.md`
4. ADR: `docs/adr/0005-dem-pckm-graph-retrieval.md`
5. Plan skill Command Room (Fase 0 sudah dieksekusi — tool loop hidup): `.claude/skills/paax-command-room-intelligence/PLAN.md`

## 3. Aturan mutlak (tidak bisa dinego)
1. **Aturan Emas**: AI tidak pernah menghitung angka final (volume/biaya/durasi) — hanya engine deterministik. AI boleh: klasifikasi, ekstraksi, mapping, usulan; semua tervalidasi + audit trail + approval manusia.
2. Skema Zod (packages/schemas) dan Pydantic WAJIB diubah bersamaan.
3. Gerbang review: branch → PR, tidak ada auto-merge.
4. PLHUT = fixture uji, BUKAN template — solusi wajib generalisasi ke proyek/nomenklatur/disiplin lain.
5. Gemini TIDAK masuk jalur produksi PAAX (hanya coding agent). Jalur AI produksi PCKM = DeepSeek Flash (kasus biasa) / Pro (eskalasi) dengan key terpisah Drawing Intelligence.
6. Human review = bagian inti desain, bukan tambahan.
7. Setiap jawaban penting Command Room wajib bisa tunjukkan: scope, lokasi, disiplin, sumber, evidence, status verifikasi, keyakinan, konflik/ambiguitas, fakta-vs-inferensi-vs-kalkulasi.

## 4. Tugas Anda (Ronde 1 — analisis independen, JANGAN berkoordinasi)

Jawab dengan bukti (sitasi file:baris atau data fixture nyata), bukan asumsi:

1. **Diagnosis**: 10 pertanyaan mandat — kondisi nyata; apa yang sudah benar; terbangun-tapi-belum-terhubung; terlihat-selesai-tapi-belum-berfungsi; masih konsep; keputusan lama yang masih valid; yang perlu direvisi; AKAR MASALAH utama; risiko jika diteruskan tanpa perubahan; peluang terbesar.
2. **Arsitektur target** gambar mentah → ekstraksi → rekonsiliasi → pengetahuan proyek → query → quantity → RAB → review manusia → UI. Termasuk: penamaan profesional lapisan data (evaluasi ulang istilah lama "JSON 1/JSON 2"), kontrak antar lapisan, data immutable vs bisa dikoreksi, penanganan REVISI gambar, jejak audit.
3. **Roadmap prioritas** (maks 10 item berurut) dengan dependensi eksplisit + apa yang TIDAK perlu dibangun sekarang + apa yang bisa paralel.
4. **Desain benchmark** (Workstream 9) di fixture 88 halaman: kategori query, metrik, dan pertanyaan yang TIDAK BOLEH dijawab sistem.
5. **Risiko utama** + solusi dangkal yang harus ditolak.

Format jawaban: Markdown Bahasa Indonesia, judul per bagian di atas, sitasi bukti inline.

## 5. Aturan kerja untuk Anda
- WAJIB jalankan `graphify query "<pertanyaan>"` / `graphify explain` SEBELUM membaca/grep file apa pun — di setiap eksplorasi.
- DILARANG mengubah kode/file apa pun. Ini tugas analisis murni. DILARANG commit.
- Verifikasi klaim paket ini terhadap kode — kalau Anda temukan fakta di paket ini SALAH, laporkan dengan bukti (itu nilai tambah terbesar).
- Pikirkan dalam; jangan jawaban permukaan. Solusi yang hanya memperbaiki satu contoh, bergantung prompt, tanpa provenance, tak teruji, atau mencampur fakta-dan-kalkulasi = TOLAK.
