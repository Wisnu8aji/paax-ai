# SOL R1 — Strategic Diagnosis dan Arsitektur Target PAAX Drawing Intelligence

**Tanggal:** 16 Juli 2026  
**Peran:** GPT-5.6 Sol — Strategic Architect, analisis independen Ronde 1  
**Cakupan:** gambar mentah → ekstraksi → rekonsiliasi → pengetahuan proyek → query → quantity → RAB → human review → UI  
**Basis audit kode:** committed baseline `e4ab1ae431c57f7dfcff17bb7810b6fb05ea6738` (`feat: add project graph retrieval and synthesis`)  
**Keputusan strategis:** **NO-GO** untuk menyebut atau memakai keluaran DEM/PCKM saat ini sebagai sumber kebenaran produksi; **GO bersyarat** untuk meneruskan fondasi yang ada setelah gerbang integritas, identitas spasial, revisi, dan benchmark dibangun.

---

## Ringkasan Eksekutif

PAAX belum memiliki satu Drawing Intelligence yang utuh. Kondisi nyata adalah **dua jalur yang terpisah**:

1. jalur lama PDF/teks → TKG → Core Engine → draft RAB yang sudah dipakai UI; dan
2. jalur baru DEM → PCKM → retrieval → tool Command Room yang baru tersambung sebagian.

Jalur lama sudah benar dalam satu hal fundamental: angka takeoff dihitung Core Engine, bukan frontend atau LLM. UI memanggil endpoint engine untuk validasi, render, dan takeoff (`apps/web/src/components/drawings/tkg-workspace.tsx:123-149`; `apps/web/src/lib/engine.ts:253-279`; `services/core-engine/app/main.py:352-380`). LLM penyusun laporan hanya boleh mengubah ringkasan dan jenis proyek, bukan volume, formula, atau item numerik (`services/document-intelligence/app/perception/ai_report.py:474-521`). Ini harus dipertahankan.

Namun jalur baru belum aman untuk menjadi hulunya. Masalahnya bukan sekadar “fitur belum dihubungkan”. Masalahnya adalah **sistem belum mempunyai trust boundary yang menolak data yang tampak valid secara skema tetapi salah secara bukti atau semantik**. Lima bentuk validitas semu sudah terjadi:

- skema-valid dianggap evidence-valid;
- string yang dinormalisasi dianggap identitas konstruksi kanonik;
- node occurrence dianggap jumlah fisik;
- snapshot yang atomik dianggap snapshot yang layak diaktifkan;
- adanya tool call dianggap setiap klaim jawaban sudah terverifikasi.

Audit read-only terhadap 88 file DEM menemukan 839 `evidence_refs` menggantung pada 47 halaman—angka yang juga tercatat dalam audit repo (`report/report_drawing_intelligence/PCKM_FASE_3_FIXTURE_AUDIT_2026-07-15.md:5-9`). Scan tambahan saya menemukan 6.904 dari 7.004 array `bbox` berada di luar kontrak 0–1, 15 halaman memiliki array `evidence` kosong, 33 ID evidence terduplikasi di dalam halaman yang sama, dan satu kontradiksi completion. Contoh langsung: bbox `[50,110,750,140]` disimpan meski prompt mewajibkan koordinat ternormalisasi (`report/report_drawing_intelligence/dem_extraction_88pages/pages/page-0001.json:60-75`; `services/document-intelligence/app/transcription/providers/qwen.py:240-252`), sedangkan halaman 42 menyatakan `is_complete=true` walau 9 dari 12 bagian selesai (`report/report_drawing_intelligence/dem_extraction_88pages/pages/page-0042.json:3661-3665`). Parser hanya menjalankan validasi Pydantic dan satu repair pass, tanpa invariants evidence, bbox, atau completion (`services/document-intelligence/app/transcription/parser.py:18-39`).

Kesalahan itu lalu dipromosikan. Semua observasi `levels` dipetakan langsung menjadi node bertipe `level` (`services/document-intelligence/app/project_graph/page_patch.py:12-26`), dan identitas level kanonik dibentuk hanya dari exact normalized text (`services/document-intelligence/app/project_graph/cross_sheet_resolver.py:378-394`). Audit eksekusi synthesis saat ini memang menghasilkan 12 node level, tetapi namanya adalah:

`+3.500`, `+4.400`, `+7.600`, `-1.300`, `2000`, `3000`, `Atap`, `Elevasi ±0.000`, `Lantai 1`, `Lantai 2`, `Lantai Atap P +16.20`, dan `±0.000`.

Karena `2000`, `3000`, dan beberapa elevasi mentah bukan identitas lantai kanonik, klaim “12 level bersih/genuinely distinct” **salah**. Lebih buruk, angka 12 kini dikunci sebagai assertion test dan dijelaskan sebagai kebenaran fixture (`services/document-intelligence/tests/test_project_graph_real_fixture.py:52-63`). Test tersebut sedang melindungi kesalahan semantik, bukan mencegahnya.

Rekomendasi inti saya:

1. **Jangan menghubungkan summary views yang ada ke Command Room/UI sebagai langkah berikutnya.** Itu hanya akan mempercepat distribusi data salah.
2. Pertahankan DEM dan PCKM sebagai nama profesional, tetapi sisipkan dua lapisan yang sekarang hilang: **Evidence Integrity Gate** dan **Reconciliation Decision Ledger**.
3. Definisikan **Drawing Issue Set** sebagai basis revisi; snapshot tidak boleh berarti “semua file terbaru yang kebetulan ada”.
4. Jadikan PCKM snapshot immutable, tetapi jangan menyebut isi PCKM sebagai immutable truth. Ia adalah kumpulan klaim kanonik yang versioned, provisional, dan correctable melalui ledger + snapshot baru.
5. Pisahkan query fakta, inferensi, dan kalkulasi. Query kalkulasi harus menghasilkan **Measurement Work Package**, menunggu persetujuan manusia, lalu baru memanggil Core Engine.
6. Jadikan human review sebagai mekanisme perubahan yang nyata. Endpoint koreksi saat ini hanya mengganti status dan catatan; tidak mengubah graph atau membangun snapshot baru (`services/db/src/paax_db/main.py:647-683`).
7. Gunakan fixture PLHUT 88 halaman sebagai regression seed, bukan bukti generalisasi atau benchmark final.

---

## Metode, Batas Bukti, dan Koreksi terhadap Paket Bersama

### Metode

Saya menggunakan `graphify query`/`graphify explain` sebelum setiap eksplorasi kode atau arsitektur, lalu memverifikasi subgraph terhadap source, test, migration, fixture, dan endpoint nyata. Saya juga menjalankan synthesis baseline-code secara read-only pada seluruh 88 file DEM dan melakukan scan deterministik terhadap integritas JSON. Tidak ada file atau kode yang diubah selain laporan ini; tidak ada provider jaringan yang dipanggil.

Batas penting: bukti persistence dan transaksi yang tersedia di test berjalan di SQLite in-memory (`services/db/tests/conftest.py:14-19`), sehingga saya tidak menganggap perilaku locking, concurrency, atau performa PostgreSQL produksi sudah terbukti.

Laporan ini sengaja dipatok ke committed baseline di atas. Saat final verification berlangsung, working tree bersama memperoleh perubahan eksternal yang belum di-commit pada `cross_sheet_resolver.py` beserta dokumen/spec baru dari proses lain; timestamp file berubah di antara test run dan menghasilkan metrik synthesis yang terus bergerak. Perubahan in-progress itu tidak saya tulis, tidak saya adopsi, dan tidak saya gunakan untuk mengubah diagnosis independen Ronde 1. Semua sitasi resolver dan angka baseline harus dibaca terhadap commit audit tersebut; perubahan sesudahnya wajib melalui review dan benchmark tersendiri.

Status verifikasi terakhir atas shared working tree: 20 test DB terfokus untuk retrieval, correction, summary view, dan RAB bridge lulus; 10 test DEM/parser/page-loop lulus. Test fixture synthesis nyata gagal karena resolver eksternal yang belum di-commit menghasilkan 77 occurrence sedangkan baseline test masih mengharapkan 87 (`services/document-intelligence/tests/test_project_graph_real_fixture.py:38-66`). Ini bukan saya perbaiki karena task ini melarang perubahan kode; hasil tersebut harus dianggap integration stop, bukan acceptance baru.

### Koreksi tegas terhadap asumsi paket bukti/plan

| Asumsi | Putusan Sol | Bukti |
|---|---|---|
| “DEM sudah tervalidasi” | **Salah.** Baru tervalidasi bentuk Pydantic; belum tervalidasi integritas evidence, koordinat, coverage, dan completion. | Model membolehkan evidence kosong dan bbox tanpa range constraint (`services/document-intelligence/app/transcription/models.py:46-65`, `:75-97`, `:116-145`); parser hanya `model_validate` (`services/document-intelligence/app/transcription/parser.py:18-39`). |
| “12 level bersih/genuinely distinct” | **Salah dan berbahaya.** 12 adalah hasil exact-text dedup dari campuran level, elevasi, dan dimensi. | Resolver menggunakan normalized text sebagai identity (`services/document-intelligence/app/project_graph/cross_sheet_resolver.py:378-394`); test mengunci 12 (`services/document-intelligence/tests/test_project_graph_real_fixture.py:52-63`). |
| “AI Flash/Pro sudah menjadi split risiko PCKM” | **Belum benar.** Provider instance memilih satu alias dari env; tidak ada router per-candidate Flash→Pro. | `from_env` memilih satu `DRAWING_INTELLIGENCE_DEEPSEEK_MODEL`, default Flash (`services/document-intelligence/app/project_graph/providers/deepseek.py:90-139`). |
| “Eskalasi AI menyelesaikan ambiguity” | **Salah.** Output provider `merge`/`keep_separate` tidak dimaterialisasi; hanya `possibly_same`/`requires_review` menjadi edge review. | Filter eksplisit pada dua keputusan itu (`services/document-intelligence/app/project_graph/synthesis.py:279-331`). Synthesis sendiri menyatakan provider tetap audit proposal (`services/document-intelligence/app/project_graph/synthesis.py:379-401`). |
| “RAB bridge evidence-backed” | **Nama lebih kuat daripada implementasi.** Semua node terpilih dikembalikan walau `evidence_ids=[]`; tidak ada filter confidence, verification status, ambiguity, revision, atau measurement readiness. | `build_rab_bridge_proposal` tidak menolak node tanpa evidence (`services/db/src/paax_db/project_graph_rab_bridge.py:21-44`). |
| “Snapshot atomic berarti siap dipakai” | **Salah.** Atomic switch ada, tetapi tidak ada pre-activation semantic validation, completeness threshold, smoke query, atau required read model. Bahkan compatibility helper dapat mengaktifkan graph kosong. | `activate_snapshot` mengirim array kosong (`services/db/src/paax_db/project_graph_repository.py:155-173`); build langsung mengubah `building`→`active` setelah insert (`services/db/src/paax_db/project_graph_repository.py:212-259`). |
| “Audit tiap tool call” | **Best effort, bukan jaminan.** Tanpa DB URL ia tidak mencatat; kegagalan ditelan. | Fire-and-forget dan `.catch(() => {})` (`apps/web/src/app/api/command-room/chat/tools.ts:129-167`). |
| “Evidence Gate menjaga jawaban” | **Salah untuk enforcement.** Gate berjalan setelah jawaban di-stream, tidak memblokir, dan menganggap semua klaim angka verified bila satu tool numerik apa pun dipanggil. | Definisi non-blocker (`services/ai-orchestrator/src/router/evidence-gate.ts:13-18`), pemetaan klaim ke tool pertama tanpa entailment (`services/ai-orchestrator/src/router/evidence-gate.ts:53-94`), pemanggilan post-stream (`apps/web/src/app/api/command-room/chat/route.ts:685-701`). |
| “PCKM query sudah grounded” | **Hanya partial lexical retrieval.** `GraphQueryPlan`/`GroundedAnswer` ada sebagai model, tetapi tidak menjalankan pipeline. | Model mengaku phase berikutnya belum dibangun (`services/document-intelligence/app/project_graph/models.py:160-170`, `:190-201`); request runtime hanya query/depth/budget/relations (`services/db/src/paax_db/schemas.py:298-304`). |

---

## Bagian 1 — Diagnosis 10 Pertanyaan Mandat

### 1. Kondisi nyata Drawing Intelligence saat ini

**Verdict:** kumpulan komponen yang signifikan sudah ada, tetapi belum menjadi capability produk yang koheren dan aman.

Capability map saat ini:

| Capability | Status nyata | Catatan strategis |
|---|---|---|
| Per-page DEM extraction | Prototype operasional | Resumable dan schema-constrained, tetapi semantic/evidence integrity gagal. |
| DEM → sheet patch | Terbangun | Menyimpan hampir semua observasi; juga meneruskan data invalid sebagai node sah. |
| Cross-sheet PCKM synthesis | Terbangun sebagian | Deterministik dan konservatif pada merge, tetapi spatial identity salah model. |
| AI resolution | Advisory/no-op parsial | Tidak ada automatic risk routing; keputusan paling penting tidak diterapkan. |
| Snapshot persistence | Terbangun | Project-scoped dan atomic secara desain, tetapi activation gate tidak ada; test DB bukan PostgreSQL. |
| Summary views | Terbangun dan tersimpan | Belum dipakai aplikasi; semantik count/confirmed tidak cukup kuat. |
| Retrieval | Prototype lexical+BFS | Tidak memahami intent komposit; audit trace juga tidak akurat. |
| Command Room tool | Terhubung | Proyeksi hasil lossy; prompt workaround menggantikan query planner. |
| Human correction | CRUD status | Belum mengoreksi knowledge model. |
| Revision handling | Hampir tidak ada | Hanya vocabulary node/relation, belum ada issue-set lineage atau stale handling. |
| Quantity/RAB dari PCKM | Belum ada | Bridge hanya mengirim properties node untuk approval. |
| UI PCKM/review | Belum ada | UI aktif masih jalur TKG lama/local repository. |

Jalur UI lama sendiri aktif: setelah hasil perception disimpan dengan `reviewed:false`, UI memanggil pipeline engine dan dapat mengirim item non-review ke draft RAB (`apps/web/src/components/drawings/tkg-workspace.tsx:222-237`, `:260-309`). Jalur ini tidak memakai active PCKM snapshot, correction ledger, atau issue set. Pada halaman yang sama, status kartu masih menyebut AI “Ditunda” (`apps/web/src/app/(dashboard)/proyek/[projectId]/gambar-kerja/page.tsx:41-46`) walau workspace AI aktif dirender (`:48-50`). Ini bukan sekadar copy stale; ini gejala dua arsitektur produk yang belum disatukan.

### 2. Apa yang sudah benar

Ada fondasi yang layak dipertahankan:

1. **Aturan Emas pada compute boundary.** Frontend mengirim TKG ke Core Engine dan hanya menampilkan hasil (`apps/web/src/lib/engine.ts:229-279`; `services/core-engine/app/main.py:352-380`).
2. **Pemisahan DEM dan PCKM.** DEM berniat menjadi transkrip per halaman dan tidak menghitung/menyimpulkan global (`services/document-intelligence/app/transcription/models.py:8-12`). Ini benar secara konsep.
3. **Metadata teknis tidak diminta dari model.** `run_id`, document/project/source/generation diisi kode, bukan dihalusinasikan model (`services/document-intelligence/app/transcription/models.py:148-166`; `services/document-intelligence/app/transcription/page_loop.py:57-88`).
4. **Per-page resumability dan retry classification.** Ini cocok untuk dokumen besar, meski idempotency key belum lengkap.
5. **Conservative ambiguity intent.** `POSSIBLY_SAME_AS`, conflict nodes, missing information, dan human review lebih aman daripada auto-merge agresif.
6. **Project-scoped storage/retrieval dan RBAC dasar.** Query dan persistence memfilter `project_id`/snapshot; endpoint dibatasi peran (`services/db/src/paax_db/main.py:571-625`, `:647-701`).
7. **Immutable snapshot switch sebagai pola.** Menulis graph lalu mengganti pointer active secara transaksi adalah arah benar (`services/db/src/paax_db/project_graph_repository.py:212-259`). Yang kurang adalah quality precondition.
8. **No graph database premature migration.** PostgreSQL adjacency table cukup untuk skala sekarang. Mengganti ke Neo4j tidak memperbaiki ontology, evidence, atau revision.
9. **LLM report tidak mengubah angka.** AI enrichment hanya mengganti `technical_summary` dan `project_kind` (`services/document-intelligence/app/perception/ai_report.py:515-521`).
10. **Schema parity intent.** Model Python menunjuk pasangan Zod sebagai kontrak bersama (`services/document-intelligence/app/transcription/models.py:1-7`). Disiplin ini harus dilanjutkan pada setiap kontrak baru.

### 3. Apa yang sudah dibangun tetapi belum terhubung

1. `GraphQueryPlan`, `RetrievalTrace`, dan `GroundedAnswer` sudah didefinisikan, tetapi runtime request dan Command Room tidak menggunakannya (`services/document-intelligence/app/project_graph/models.py:147-201`; `services/db/src/paax_db/schemas.py:298-313`).
2. Summary views disimpan dan mempunyai endpoint read (`services/db/src/paax_db/project_graph_repository.py:111-151`; `services/db/src/paax_db/main.py:698-724`), tetapi tidak ada consumer di `apps/web` selain kontrak schema.
3. Correction endpoint sudah ada, tetapi tidak ada correction application, overlay, rebuild, rebase, atau impact report (`services/db/src/paax_db/main.py:647-683`).
4. RAB bridge sudah ada, tetapi belum membuat measurement rule, input readiness, engine request, atau result lineage (`services/db/src/paax_db/project_graph_rab_bridge.py:21-44`).
5. Retrieval mengembalikan edges dan snapshot ID dari DB, tetapi tool Command Room membuang keduanya; ia hanya meneruskan node dan evidence (`services/ai-orchestrator/src/tools/query_project_graph.ts:31-55`).
6. Quality fields ada di node/snapshot/summary, tetapi tidak menjadi gate query atau activation.
7. DeepSeek provider dapat dipanggil, tetapi belum menjadi router Flash/Pro berbasis risk signal dan keputusan provider belum menjadi decision ledger.

### 4. Apa yang terlihat selesai tetapi belum benar-benar berfungsi

#### a. “Validated DEM”

Kontrak prompt jelas: semua refs harus resolve dan bbox harus 0–1 (`services/document-intelligence/app/transcription/providers/qwen.py:240-252`). Kontrak model tidak menegakkannya: `evidence_refs` boleh kosong, bbox hanya tuple float tanpa range, dan completion tanpa cross-field validator (`services/document-intelligence/app/transcription/models.py:46-65`, `:75-97`, `:116-145`). Status page bahkan ditulis `complete` apa pun isi `model_output.completion` (`services/document-intelligence/app/transcription/page_loop.py:80-95`). Jadi “valid” saat ini berarti “JSON bisa diparse”, bukan “drawing evidence dapat dipercaya”.

Idempotency juga tidak sesuai docstring. Dokumentasi model mengatakan key harus memasukkan `input_hash+prompt_version+model_alias` (`services/document-intelligence/app/transcription/models.py:169-173`), tetapi skip runtime hanya membandingkan hash seluruh PDF dan status complete (`services/document-intelligence/app/transcription/page_loop.py:28-34`). Perubahan prompt/model dapat memakai ulang hasil lama tanpa re-extraction. Generation metadata juga di-hardcode `qwen/qwen3.7-plus`, bukan membaca adapter aktual (`services/document-intelligence/app/transcription/page_loop.py:73-79`).

#### b. “Canonical 12 levels”

Kategori `levels` sendiri dirancang menampung elevasi (`services/document-intelligence/app/transcription/providers/qwen.py:225-226`), tetapi page patch menyatakannya sebagai node type `level` (`services/document-intelligence/app/project_graph/page_patch.py:12-26`). Resolver hanya memakai title regex `LT/LANTAI` atau nearest bbox, lalu exact text identity (`services/document-intelligence/app/project_graph/cross_sheet_resolver.py:251-339`, `:378-394`). Itu tidak cukup membedakan:

- floor identity vs elevation marker;
- building/storey vs roof datum;
- dimension `2000/3000` vs level;
- label lokal per bangunan/zone vs level proyek;
- `±0.000`, “Main Floor”, “Lantai 1”, dan datum lain sebagai alias atau entitas berbeda.

Klaim “12 bersih” harus dicabut sampai ada gold annotation manusia.

#### c. “AI escalation”

Resolver secara eksplisit berjalan “without provider decisions” (`services/document-intelligence/app/project_graph/cross_sheet_resolver.py:535-540`). Synthesis meminta provider bila disuntikkan, tetapi materializer mengabaikan keputusan `merge` dan `keep_separate`; hanya dua keputusan ambiguity dibuat edge review (`services/document-intelligence/app/project_graph/synthesis.py:279-331`). Ini bukan resolution; ini pencatatan saran yang sebagian hilang.

#### d. “Confirmed count”

Summary view menghitung satu per node occurrence (`services/document-intelligence/app/project_graph/summary_builder.py:217-250`). `confirmed_count` hanya mengeluarkan occurrence yang tersentuh `POSSIBLY_SAME_AS` atau conflict (`:316-366`); ia tidak memeriksa `verification_status`, confidence, missing evidence, fallback location, revision, atau apakah satu occurrence mewakili satu objek fisik. Nama `occurrence_count`/`confirmed_count` dapat dibaca user sebagai kuantitas, padahal itu baru **jumlah record kelompok konteks**. Ini berbahaya di domain RAB.

#### e. “Grounded query” dan audit

Exact level optimization hanya aktif jika seluruh query persis sama dengan nama level; “struktur lantai 2” sengaja tidak memicu scope (`services/db/src/paax_db/project_graph_retrieval.py:62-105`). Test bahkan mengunci bahwa query tersebut mengembalikan kosong (`services/db/tests/test_project_graph_retrieval.py:314-337`). Workaround dipindahkan ke deskripsi tool: model disuruh query “Lantai 2”, lalu panggil tool kedua untuk “kolom” dan membandingkan sendiri (`services/ai-orchestrator/src/tools/query_project_graph.ts:62-73`). Itu prompt choreography, bukan query planning.

Audit retrieval juga misleading: sesudah BFS, `by_id` diperluas dengan visited nodes, lalu `selected_seed_ids=list(by_id)` sehingga audit mencatat semua node hydrated sebagai seed; outcome selalu `success`, termasuk zero result (`services/db/src/paax_db/project_graph_retrieval.py:204-231`). Budget pruning menghapus node berdasarkan urutan ID dan menyisakan edge bila **salah satu** endpoint ada, sehingga response dapat menyimpan edge dengan endpoint yang sudah dipangkas (`:210-225`).

#### f. “Evidence Gate”

Evidence Gate tidak memeriksa apakah klaim tertentu benar-benar berasal dari row/tool result tertentu. Satu panggilan tool numerik menyebabkan semua pola angka di jawaban berstatus `verified` (`services/ai-orchestrator/src/router/evidence-gate.ts:53-94`). Gate dievaluasi sesudah stream selesai dan tidak mengubah jawaban (`apps/web/src/app/api/command-room/chat/route.ts:685-701`). Selain itu, kegagalan tool loop jatuh diam-diam ke jawaban tanpa tool (`apps/web/src/app/api/command-room/chat/route.ts:630-646`). Untuk data proyek dan angka engineering, fail-open ini tidak dapat diterima.

### 5. Apa yang masih menjadi konsep

Yang belum ada sebagai capability operasional:

- Drawing Issue Set dan revision precedence;
- building/site/zone/storey/view spatial ontology;
- reconciliation decision ledger yang benar-benar diterapkan;
- semantic DEM integrity gate dan quarantine;
- query intent parser yang menghasilkan `GraphQueryPlan`;
- claim-level answer compiler;
- measurement rule registry dan input-readiness evaluator;
- Measurement Work Package dengan assumption approval;
- revision impact analysis dan selective resynthesis;
- PCKM review workspace di UI;
- benchmark manusia yang menguji extraction → reconciliation → query → refusal → quantity;
- multi-project/multi-discipline holdout untuk generalisasi.

Node taxonomy memang memuat `revision` dan relation `SUPERSEDES`, tetapi pencarian implementasi runtime tidak menemukan issue set, revision selection, lineage, atau stale-answer enforcement di project graph. Vocabulary bukan implementasi.

### 6. Keputusan lama yang masih valid

1. **DEM bukan output final; PCKM bukan raw extraction.** Pemisahan ini benar.
2. **Evidence-first dan page-level processing.** Dokumen 88 halaman memang perlu resumability dan provenance per halaman.
3. **Rule-based/deterministic fast path + AI proposal fallback.** AI berguna untuk klasifikasi dan ambiguity, bukan sebagai mutation authority.
4. **PostgreSQL property graph sekarang.** Optimalkan kontrak dan query dahulu; jangan memindahkan problem semantik ke database lain.
5. **Immutable snapshots dan project scoping.** Tambahkan quality gate dan issue-set binding, jangan buang pola snapshot.
6. **Flash untuk kasus murah, Pro untuk kasus berisiko** sebagai prinsip ekonomi—tetapi belum sebagai implementasi.
7. **Human review sebagai bagian inti.** Yang perlu diperbaiki adalah efek review, bukan keberadaannya.
8. **Core Engine sebagai satu-satunya kalkulator.** PCKM hanya menyiapkan input terstruktur dan evidence.
9. **Summary/read models untuk query berulang.** Tetap berguna, tetapi harus rebuildable dan tidak menjadi source of truth.
10. **PLHUT sebagai fixture uji, bukan template.** Plan yang mengikat acceptance pada angka fixture tanpa gold semantics harus dikoreksi.

### 7. Keputusan yang perlu direvisi

1. **Revisi “AI-first” menjadi “evidence-first hybrid”.** Untuk PDF vektor, teks/layout/coordinate extraction deterministik harus menjadi evidence substrate. Vision model boleh menginterpretasi simbol, hubungan, dan area visual, tetapi outputnya hypothesis sampai grounded. Prompt yang lebih panjang tidak menggantikan validator.
2. **Jangan gunakan “community merge” sebagai identity mechanism.** Current community builder hanyalah connected components generik (`services/document-intelligence/app/project_graph/community_builder.py:21-83`). Connectedness bukan kesamaan building, level, discipline, atau element identity.
3. **Jangan jadikan Flash pembangun summary view.** Summary view harus deterministik dari validated snapshot. AI dapat membuat narrative, bukan aggregate/index facts.
4. **Revisi definisi canonicalization.** Exact normalized string cukup untuk alias candidate, tidak cukup untuk identity. Identity harus scoped oleh project → site/building → level → zone/view → discipline → entity class.
5. **Revisi acceptance “12 levels”.** Acceptance harus mengukur pairwise identity accuracy dan wrong-level rate terhadap human gold, bukan jumlah yang kebetulan stabil.
6. **Revisi `occurrence_count` menjadi `candidate_occurrence_group_count` sampai cardinality semantics terbukti.** Jangan menjawab “berapa kolom” dari jumlah node occurrence saat ini.
7. **Revisi snapshot activation.** Atomicity adalah mekanisme commit, bukan quality gate.
8. **Revisi Command Room fail-open.** Untuk data proyek, jika tool/graph/issue set/evidence tidak tersedia, jawaban harus fail-closed sebagai `not_ready/insufficient_evidence`, bukan melanjutkan dari pengetahuan model.
9. **Revisi AI provider decision semantics.** `merge`, `keep_separate`, dan `requires_review` harus tercatat sebagai proposal; hanya rule berisiko rendah atau keputusan manusia yang boleh menjadi applied decision.
10. **Revisi urutan roadmap.** Mengonsumsi summary view atau mempercantik UI sebelum membereskan DEM/spatial identity akan mengubah technical debt menjadi product debt.

### 8. Akar masalah utama

**Akar masalah bukan pilihan model, graph database, atau kekurangan prompt. Akar masalah adalah tidak adanya kontrak kepercayaan yang dapat ditegakkan di setiap transisi.**

Secara spesifik, PAAX mencampur empat konsep:

1. **observation** — sesuatu yang terbaca pada satu region;
2. **claim** — interpretasi tentang arti observation;
3. **identity** — keputusan bahwa beberapa claim menunjuk objek konstruksi yang sama;
4. **calculation input/result** — nilai yang sudah memenuhi rule, approval, unit, dan engine lineage.

Saat ini observation langsung menjadi node, normalized label langsung menjadi identity, occurrence langsung menjadi count, dan properties langsung ditawarkan ke RAB bridge. Karena itu error probabilistik di awal memperoleh aura deterministik setelah masuk database. Struktur graph tidak membuat isi graph benar.

Akar kedua adalah **dual pipeline tanpa migration boundary**. UI lama dan PCKM baru dapat berkembang paralel dengan definisi readiness, review, dan provenance yang berbeda. Tanpa satu “calculation-ready work package” sebagai titik temu, PAAX berisiko mempunyai dua jawaban untuk gambar yang sama.

### 9. Risiko jika diteruskan tanpa perubahan

1. Elemen terikat ke lantai salah tetapi jawaban tampak grounded.
2. `occurrence_count` dipakai sebagai kuantitas fisik dan masuk RAB.
3. Revisi lama tetap aktif setelah sheet baru diunggah.
4. Evidence citation menunjuk teks yang ada tetapi tidak mendukung klaim—citation laundering.
5. AI correction UI menjadi “teater review”: user approve, graph tidak berubah.
6. Snapshot salah dipromosikan secara atomik dan tersebar konsisten—konsistensi kesalahan.
7. Test suite mengunci angka output yang salah, membuat refactor benar terlihat sebagai regression.
8. Prompt/model update memakai ulang DEM lama karena idempotency key tidak memasukkan prompt/model.
9. Tool failure menghasilkan jawaban model tanpa data proyek.
10. Tim mengoptimalkan PLHUT dan kehilangan generalisasi nomenklatur, disiplin, bahasa, serta revisi proyek lain.
11. Audit trail tidak dapat merekonstruksi mengapa satu angka RAB lahir karena graph, approval, rule, dan engine run tidak terhubung end-to-end.
12. Kepercayaan estimator rusak: satu angka salah yang tampak “pasti” lebih merusak daripada sistem yang jujur mengatakan belum tahu.

### 10. Peluang terbesar

Peluang PAAX bukan menjadi OCR/chat gambar tercepat. Peluangnya adalah menjadi **revision-aware, evidence-grade construction intelligence** yang dapat menjawab:

- apa yang benar-benar terlihat;
- apa yang disimpulkan dan oleh siapa/rule apa;
- apa yang masih konflik atau hilang;
- revisi mana yang berlaku;
- input apa yang siap dihitung;
- asumsi apa yang harus disetujui;
- engine run mana yang menghasilkan quantity dan RAB.

Jika dibangun demikian, PCKM tidak hanya membantu Command Room. Ia menjadi shared substrate untuk drawing review, coordination, change impact, quantity readiness, tender audit, dan dispute trace. **Reconciliation Decision Ledger + Measurement Work Package** adalah dua aset defensible yang lebih bernilai daripada mengganti model vision.

---

## Bagian 2 — Arsitektur Target

### 2.1 Prinsip arsitektur

1. **Setiap boundary harus fail-closed.** Data invalid dikarantina, bukan “dipakai sambil diberi warning”.
2. **Raw evidence tidak pernah dimutasi.** Koreksi menambah decision/overlay dan menghasilkan snapshot baru.
3. **Canonical tidak berarti absolut benar.** Canonical berarti identity decision yang berlaku pada snapshot/issue set tertentu.
4. **AI menghasilkan proposal; rule/human menghasilkan applied decision.** Pengecualian rule auto-apply harus eksplisit, deterministik, dan benchmark-proven.
5. **Read model dapat dibuang dan dibangun ulang.** Ia bukan source of truth.
6. **Fakta, inferensi, asumsi, dan kalkulasi harus memiliki tipe berbeda.** Jangan hanya mengandalkan teks penjelasan.
7. **Revision/issue set harus berada sebelum synthesis, bukan ditempel setelah graph jadi.**
8. **Quantity adalah workflow terpisah dari query fakta.** Query dapat memicu persiapan work package, tetapi tidak menghitung.

### 2.2 Alur target

```text
Raw Drawing Artifact + metadata revisi
        │
        ▼
Project Drawing Issue Set ───────────────┐
        │                                 │ lineage / supersession
        ▼                                 │
Deterministic page render/text/layout     │
        + vision interpretation proposal  │
        ▼                                 │
Drawing Evidence Model (DEM, immutable)   │
        ▼                                 │
Evidence Integrity Gate ── invalid ──► Quarantine + Review Queue
        │ valid
        ▼
Spatial/Discipline Classification + Reconciliation Proposals
        ▼
Reconciliation Decision Ledger ◄──── Human correction/approval
        │ applied decisions
        ▼
PCKM Snapshot (immutable, versioned, issue-set-bound)
        ▼
Project Intelligence Read Models / Search Index (rebuildable)
        ▼
Validated GraphQueryPlan → Retrieval → Grounded Claim Set
        ├──────────────► Answer Compiler → LLM verbalizer → Command Room/UI
        │
        └─ calculation_required
              ▼
        Quantity Candidate + Measurement Rule Readiness
              ▼
        Human-approved Measurement Work Package
              ▼
        Core Engine deterministic run
              ▼
        Quantity Result → AHSP mapping/approval → RAB Engine → RAB snapshot
```

Human review bukan kotak terakhir. Ia adalah control plane yang dapat mengoreksi issue-set selection, DEM classification, identity, conflict, measurement assumption, dan AHSP mapping. Setiap koreksi membuat derived state baru; tidak ada in-place rewrite atas source/evidence lama.

### 2.3 Penamaan profesional lapisan data

| Nama yang direkomendasikan | Fungsi | Putusan atas istilah lama |
|---|---|---|
| **Raw Drawing Artifact** | File asli + hash + metadata upload | Lebih tepat daripada “raw PDF”. Dapat mencakup PDF, DWG export, image, dan revisi. |
| **Project Drawing Issue Set** | Set revisi dokumen/sheet yang disetujui berlaku bersama | Konsep baru wajib; mencegah “latest upload wins”. |
| **Drawing Evidence Model (DEM)** | Record evidence per sheet/page, raw observation, coordinates, provenance | Pertahankan. Ini nama profesional dan boundary-nya benar. |
| **Evidence Integrity Report** | Hasil validator + quarantine status | Tambahkan. Tanpa ini DEM bukan evidence-grade. |
| **Reconciliation Proposal** | Kandidat alias/same-as/location/conflict dari rule atau AI | Jangan masukkan langsung ke PCKM. |
| **Reconciliation Decision Ledger** | Append-only keputusan applied/rejected/review beserta reviewer/model/rule | Konsep baru paling penting. |
| **Project Construction Knowledge Model (PCKM) Snapshot** | Canonical claim graph untuk satu issue set + decision-ledger version | Pertahankan, tetapi sebut snapshot/claim model, bukan “truth”. |
| **Project Intelligence Read Models** | Level overview, entity index, conflict queue, search documents | Ganti istilah umum “PCKM Index/JSON 2”. Summary views adalah salah satu read model. |
| **Grounded Claim Set** | Hasil retrieval claim-level sebelum verbalization | Lebih aman daripada memberikan raw node kepada LLM. |
| **Measurement Work Package** | Input, rule, units, assumptions, approvals untuk engine | Jangan menyebut raw node list sebagai RAB bridge. |
| **Calculation Result / RAB Snapshot** | Output immutable dari Core Engine + input/version lineage | Angka final hanya di sini. |

Istilah `JSON 1/JSON 2` harus dihentikan total. JSON adalah serialisasi, bukan domain boundary. TKG boleh dipertahankan sebagai kontrak internal Core Engine selama migration, tetapi jangan dijadikan nama lapisan produk baru. Secara produk, PCKM menghasilkan Measurement Work Package; adapter menerjemahkannya ke TKG/endpoint engine yang sesuai.

### 2.4 Kontrak antar lapisan

#### A. Raw Artifact / Issue Set contract

Wajib memuat:

- `tenant_id`, `project_id`, `document_id`, `revision_id`, `issue_set_id`;
- file/page hash, MIME, page count, source URI;
- drawing number/title/discipline/issue purpose/status;
- `supersedes_revision_id`, effective/received dates, uploader;
- inclusion decision: active, withdrawn, superseded, reference-only;
- immutable audit event.

Issue set harus dapat berisi revisi parsial dari beberapa dokumen. “Revisi terbaru per filename” tidak cukup karena proyek dapat menerbitkan addendum, void sheet, dan revision package yang tidak seragam.

#### B. DEM contract

Selain field yang ada, wajib menegakkan:

- evidence ID unik **dalam scope page/run**;
- setiap `evidence_ref` resolve 100%;
- `coordinate_space` eksplisit (`normalized_page`, `pixel`, `pdf_point`) dan bbox valid untuk space tersebut;
- page render hash dan dimensions;
- `sections_completed <= sections_expected` dan `is_complete` iff coverage selesai;
- numeric observation selalu memiliki unit/status/source atau explicit `unit_missing`;
- model/provider/prompt/schema version aktual dan input hash;
- parser/extractor version;
- observation class tidak mengklaim entity identity;
- raw text tidak ditimpa normalized text;
- no derived/calculated values.

Current prompt sudah meminta evidence integrity, tetapi prompt bukan validator (`services/document-intelligence/app/transcription/providers/qwen.py:235-258`). Gate harus kode deterministik dan menghasilkan `accepted`, `partial`, atau `quarantined` dengan issue list.

#### C. Reconciliation contract

Setiap proposal/decision memuat:

- candidate IDs dan source evidence;
- decision kind: `alias`, `same_entity`, `different_entity`, `located_on`, `classified_as`, `supersedes`, `unresolved`;
- scope: project/building/level/zone/discipline/revision;
- proposer: deterministic rule atau model+prompt version;
- confidence dan risk signals;
- status: proposed/applied/rejected/superseded/requires_review;
- reviewer, rationale, timestamp;
- impacted node/edge/read-model IDs;
- decision hash dan parent decision bila dikoreksi.

AI tidak boleh melakukan canonical merge langsung. Bahkan model Pro hanya menaikkan kualitas proposal; ia bukan authority.

#### D. PCKM snapshot contract

Wajib memuat:

- issue-set ID/hash;
- accepted DEM run/page hashes;
- decision-ledger version/hash;
- schema/synthesis/resolver versions;
- graph validation report;
- unresolved ambiguity/conflict/missing counts per risk class;
- source coverage dan quarantine exclusions;
- state: building → validated → active → stale/superseded/invalid;
- activation approver/policy;
- deterministic snapshot hash.

Validator saat ini hanya memeriksa duplicate node, dangling edge endpoint, dan bentuk `LOCATED_ON` (`services/document-intelligence/app/project_graph/validator.py:40-146`). Tambahkan evidence existence, entity-scope compatibility, revision consistency, required location cardinality, no invalid bbox-derived binding, no quarantined source, and no untyped numeric promotion.

#### E. Query plan / grounded claim contract

`GraphQueryPlan` harus menjadi runtime contract, bukan model yatim. Minimal:

- intent;
- requested entity/type/discipline/building/level/zone/revision;
- fact class: observed, inferred, calculated;
- exact filters + controlled vocabulary matches;
- required relations;
- source/read-model choice;
- evidence requirement;
- conflict/ambiguity policy;
- calculation-required flag;
- budget and no-answer reason.

Output retrieval bukan sekadar nodes/evidence. Ia harus berupa claim records:

- claim/value/unit;
- spatial and discipline scope;
- evidence IDs + sheet/page/region;
- verification status/confidence;
- inference rule/decision ID bila bukan observed fact;
- conflicts/alternatives/missing information;
- snapshot/issue-set/revision IDs;
- retrieval trace;
- calculation run ID bila calculated.

LLM hanya mengubah Grounded Claim Set menjadi bahasa alami. Citation compiler dan fact/inference/calculation labels harus dibuat sebelum model menjawab.

#### F. Measurement Work Package contract

Work package memuat:

- requested quantity type and unit;
- applicable deterministic rule ID/version;
- input facts dan evidence;
- spatial/cardinality scope;
- required inputs yang tersedia/hilang;
- assumptions sebagai field terstruktur, bukan prose;
- human approvals per assumption/rule/scope;
- source snapshot + issue set;
- engine adapter/version;
- idempotency hash;
- output calculation run ID.

`properties_json` mentah dari node tidak boleh langsung dianggap input engine. Current bridge melakukan itu dan bahkan tidak menolak node tanpa evidence (`services/db/src/paax_db/project_graph_rab_bridge.py:28-44`).

### 2.5 Immutable, correctable, dan revision handling

#### Immutable

- file asli dan hash;
- page render dan extraction input;
- raw model response, prompt/model/version, latency/cost;
- accepted/quarantined DEM record;
- proposal AI/rule;
- review/decision event;
- PCKM snapshot;
- query plan/trace untuk jawaban penting;
- Measurement Work Package;
- Core Engine input/output;
- RAB snapshot.

#### Correctable—melalui append-only event, bukan mutation

- drawing metadata/revision classification;
- normalized label;
- alias/entity identity;
- spatial/discipline binding;
- conflict resolution;
- measurement assumptions/rule choice;
- AHSP mapping.

Koreksi menghasilkan decision baru dan PCKM snapshot baru. Snapshot lama tetap dapat direproduksi untuk audit.

#### Revision workflow yang diwajibkan

1. Ingest revision sebagai artifact baru, tidak overwrite.
2. Tentukan `supersedes` dan inclusion di candidate issue set.
3. Review/approve issue set sebagai kombinasi dokumen yang berlaku.
4. Re-extract hanya page/artifact yang berubah, tetapi invalidasi seluruh claim yang bergantung padanya.
5. Reconcile delta terhadap identity ledger lama; jangan membuat identitas baru hanya karena nomor revisi berubah.
6. Bangun candidate PCKM snapshot dan impact report: added/removed/changed/conflicting/orphaned corrections/affected quantities.
7. Jalankan quality gate + benchmark smoke queries.
8. Activate atomically; snapshot lama menjadi superseded, bukan hilang.
9. Tandai Measurement Work Package/RAB yang bergantung pada claim berubah sebagai stale dan minta recompute.
10. Setiap jawaban “saat ini/terbaru” wajib menyebut issue set/revision basis. Jika tidak ada approved issue set, sistem harus menolak kata “terbaru”.

### 2.6 Model routing dan trade-off

#### Rule/deterministic first

- metadata, text spans, page coordinates, hash, table cells, exact drawing numbers;
- schema/integrity validation;
- controlled vocabulary normalization;
- obvious aliases dalam scope yang sama;
- query grammar dan filters;
- read-model aggregation;
- all calculations.

#### Flash proposal

- discipline/view/title classification yang ambigu;
- alias candidate explanation;
- low-risk entity typing;
- query intent fallback jika deterministic parser tidak cukup.

#### Pro proposal

- cross-sheet identity dengan conflict;
- multi-building/spatial ambiguity;
- revision conflict explanation;
- sample audit dan difficult-query planning.

**Trade-off:** gate ketat akan menurunkan coverage awal dan meningkatkan review queue. Itu benar. False-negative yang terlihat dapat diperbaiki; false-positive quantity yang tampak confirmed jauh lebih mahal. Optimasi harus memaksimalkan precision pada auto-apply dan recall pada review routing, bukan memaksimalkan jumlah node.

### 2.7 Query, quantity, dan RAB

Tiga jalur wajib berbeda:

1. **Stored fact query** — ambil claim+evidence; tidak menghitung.
2. **List/location query** — gunakan read model untuk candidate selection, hydrate dari PCKM/evidence, dan jelaskan cardinality semantics.
3. **Calculation-required query** — jangan jawab angka. Buat readiness report/Measurement Work Package, minta approval input/asumsi, panggil engine, lalu jawab dari calculation result.

`query_rab` hanya membaca RAB yang sudah ada. Ia tidak boleh dijadikan jalan pintas untuk menjawab volume dari drawing. PCKM summary juga tidak boleh menghitung. Komentar Golden Rule pada summary builder sudah benar (`services/document-intelligence/app/project_graph/summary_builder.py:196-204`); semantik quantity harus ditangani di work-package layer.

### 2.8 Human review dan UI target

Prioritas UI bukan graph canvas besar. Prioritasnya adalah **review evidence dan dampak keputusan**:

1. Drawing viewer dengan overlay bbox/evidence dan raw/normalized side-by-side.
2. Issue-set/revision banner yang selalu terlihat.
3. Hierarchy navigator: site/building/level/zone/view/discipline.
4. Review queue terurut risk: invalid evidence → revision conflict → spatial identity → entity merge → missing quantity input.
5. Decision panel: proposed decision, alternatives, evidence, model/rule rationale, affected claims.
6. Correction effect preview: node/edge/read-model/query/quantity yang berubah.
7. Conflict/missing tab dan stale outputs.
8. Query answer sources dengan label Observed / Inferred / Calculated.
9. Quantity readiness panel: rule, inputs, missing fields, assumptions, approvals—bukan tombol “hitung otomatis”.
10. Snapshot activation dashboard dan benchmark status.

Current UI menampilkan hasil AI dan memungkinkan “Proses RAB”, tetapi tidak menunjukkan PCKM snapshot, revision basis, atau applied correction (`apps/web/src/components/drawings/tkg-workspace.tsx:468-586`, `:629-645`). Migration UI harus eksplisit; jangan menjalankan dua source-of-truth tanpa badge/policy.

---

## Bagian 3 — Roadmap Prioritas (Maksimal 10 Item)

### Urutan yang direkomendasikan

| # | Workstream | Dependensi | Exit gate yang dapat diuji | Paralel |
|---:|---|---|---|---|
| 1 | **Freeze trust model + benchmark gold seed** | Tidak ada | Kontrak observation/claim/identity/calculation disetujui; taxonomy dan annotation guide selesai; current PCKM ditandai experimental. | Annotation 88 halaman, engine-rule inventory, UI research dapat mulai. |
| 2 | **DEM v2 Evidence Integrity Gate** | 1 | 0 dangling refs; 0 duplicate evidence ID per scope; 0 bbox invalid; completion invariant 100%; prompt/model/input hash aktual; invalid page quarantined. | Zod/Pydantic parity dan observability. |
| 3 | **Drawing Artifact Revision + Issue Set** | 1 | Revision lineage, inclusion/withdrawn/supersedes, approved issue set, stale-state tests, delta manifest. | Dapat berjalan paralel dengan 2. |
| 4 | **Spatial/discipline ontology + canonical identity resolver** | 2, 3 | Gold-based pairwise identity test; no dimension/elevation promoted sebagai floor identity; building/level/zone/view scope eksplisit; conservative unresolved path. | UI hierarchy prototype. |
| 5 | **Reconciliation Decision Ledger + applied corrections** | 4 | `merge/keep_separate/location/alias` proposal tercatat; human resolution membangun snapshot baru; correction impact/rebase teruji; no provider direct mutation. | Review UI implementation dapat berjalan setelah contract stabil. |
| 6 | **PCKM quality gate + rebuildable read models** | 4, 5 | Snapshot hanya active setelah semantic validation + issue-set binding + smoke queries; summary counts diberi cardinality semantics; empty/invalid graph tidak dapat active. | PostgreSQL integration/concurrency test. |
| 7 | **Runtime GraphQueryPlan + Grounded Claim Set** | 6 | Intent/filter parser bekerja pada query komposit; retrieval recall/precision/evidence metrics; exact zero/not-ready/conflict states; audit seed benar; no dangling edge after pruning. | Deterministic parser dan DeepSeek fallback dapat dibangun paralel. |
| 8 | **Command Room enforcement + PCKM review UI** | 5, 7 | Claim-level citation before stream; tool/data failure fail-closed; Observed/Inferred/Calculated label; correction round-trip terlihat di UI; audit durable. | UI dapat mulai dari mock contract sejak 4/5. |
| 9 | **Measurement Work Package → Core Engine → RAB lineage** | 4–8 | Quantity false-ready = 0 pada gold; assumptions explicit+approved; deterministic replay; result links ke evidence/snapshot/rule/engine; tidak ada numeric compute di TS/LLM. | Inventory rule/adapter Core Engine dimulai sejak 1. |
| 10 | **Pilot lintas proyek/disiplin/revisi + cutover** | 2–9 | PLHUT regression lulus, holdout proyek lain lulus, revision scenario lulus, security/no-leak lulus, cost/latency SLO terukur; dual pipeline memiliki sunset decision. | Rollout per discipline/risk tier. |

### Stop-the-line action sebelum item 1 selesai

- Jangan label snapshot/summary saat ini “verified/confirmed” di UI atau Command Room.
- Jangan hubungkan summary views current fixture sebagai source jawaban production.
- Jangan gunakan 12 level sebagai acceptance anchor.
- Jangan gunakan RAB bridge current sebagai calculation-ready API.
- Pertahankan jalur TKG lama sebagai bounded legacy path dengan badge jelas dan engine-only calculation sampai migration work package siap.

### Yang tidak perlu dibangun sekarang

1. Neo4j/graph database baru.
2. Vector database umum sebelum lexical+typed query planner benar.
3. Full BIM/3D reconstruction atau CAD geometry engine baru.
4. Generic multi-agent autonomous graph builder.
5. Graphify sebagai runtime PCKM—Graphify tetap alat navigasi repo, bukan domain engine.
6. Full graph visualization untuk user.
7. Pro model pada semua page/query.
8. Auto-quantity seluruh disiplin.
9. Auto-commit ke RAB tanpa human approval.
10. Conversation memory kompleks sebelum claim/revision contract stabil.

### Yang bisa benar-benar paralel

- Human annotation dan benchmark harness;
- issue-set schema + migration;
- DEM integrity validator;
- inventory Core Engine rule/input contract;
- UI information architecture dari contract mock;
- PostgreSQL integration/security tests;
- cost/latency/audit instrumentation.

Yang **tidak** boleh paralel secara independen adalah canonical resolver, summary semantics, dan query planner. Ketiganya berbagi definisi identity/cardinality; membangunnya terpisah akan mengulang dual-truth problem.

---

## Bagian 4 — Desain Benchmark Workstream 9

### 4.1 Putusan benchmark

88 halaman PLHUT harus dipakai sebagai **regression corpus beranotasi manusia**, bukan “ground truth” hanya karena current output stabil. Audit yang ada membuktikan defect evidence tersebar di semua 13 kategori observation (`report/report_drawing_intelligence/PCKM_FASE_3_FIXTURE_AUDIT_2026-07-15.md:37-64`). Karena itu benchmark tidak boleh mengambil DEM/PCKM current sebagai label.

Gold set harus dibuat oleh dua annotator yang memahami gambar konstruksi, lalu adjudication untuk disagreement. AI boleh membantu UI annotation, tetapi tidak boleh menjadi adjudicator final. Setiap label gold harus menunjuk region evidence.

### 4.2 Paket gold yang harus dihasilkan

1. **Sheet Gold:** drawing number, title, discipline, view type, scale, revision, page role.
2. **Evidence Gold:** raw text/symbol/table/geometry observations dengan region dan coordinate space.
3. **Spatial Gold:** building/site, storey identity, elevation datum, zone, grid, room/space, view.
4. **Entity Gold:** element type, occurrence grouping, cardinality semantics, source sheets.
5. **Reconciliation Gold:** pair `same`, `different`, `uncertain`, alias, located-on, cross-sheet reference.
6. **Conflict/Missing Gold:** conflicting dimensions, unresolved references, missing inputs, revision conflicts.
7. **Query Gold:** intent, filters, expected claims, expected evidence, allowed inference, refusal reason.
8. **Quantity Readiness Gold:** applicable rule, required inputs, available/missing facts, assumptions requiring approval—**bukan angka yang dihitung LLM**.
9. **Revision Gold:** karena 88 halaman bukan revision history lengkap, buat controlled issue-set scenarios dari copy yang diberi perubahan terverifikasi atau tambah corpus revisi nyata. Jangan mengklaim revision benchmark lulus dari fixture tunggal.

### 4.3 Kategori query

| Kategori | Contoh bentuk | Expected behavior |
|---|---|---|
| Direct entity lookup | “Apa spesifikasi J2?” | Entity exact/alias, scope, evidence, status. |
| Scoped entity lookup | “Kolom struktur di Lantai 2” | Parse type+discipline+level dalam satu plan; jangan prompt pecah manual. |
| Location inventory | “Apa saja elemen pada Lantai 1?” | Read-model candidate + graph hydration; jelaskan unit record/cardinality. |
| Existence/negative | “Apakah ada pintu P9?” | `found`, `not_found_in_scope`, atau `data_incomplete`; bukan satu pesan generik. |
| Stored numeric fact | “Dimensi K1 yang tertulis?” | Hanya nilai+unit yang tersimpan, direct evidence, conflict surfaced. |
| Cross-sheet relationship | “Detail J2 dirujuk dari denah mana?” | Relationship path + evidence kedua sisi. |
| Conflict/ambiguity | “Dimensi mana yang berbeda?” | Tampilkan alternatives; jangan pilih diam-diam. |
| Missing-data query | “Data apa yang belum cukup untuk takeoff?” | Readiness/missing report, bukan asumsi. |
| Calculation-required | “Berapa volume beton kolom Lantai 2?” | Return `calculation_required`; build/locate approved work package and engine result. |
| Revision/current | “Apa yang berubah pada revisi terbaru?” | Harus punya approved issue set + diff; kalau tidak, refuse. |
| Multi-hop | “Elemen pada level yang dirujuk detail ini” | Validated path, bounded relation set, evidence per hop. |
| Discipline collision | Kode sama pada arsitektur/struktur/MEP | Jangan merge lintas discipline tanpa decision. |
| Adversarial/security | Prompt meminta data proyek lain atau menyuruh abaikan evidence | Project isolation dan policy refusal. |
| Consistency/paraphrase | Beberapa paraphrase pertanyaan yang sama | Claim set stabil; wording boleh berubah. |

### 4.4 Metrik per tahap

#### DEM

- schema pass rate;
- evidence-reference integrity rate;
- bbox validity dan evidence-region overlap;
- field precision/recall/F1 per kategori;
- sheet identity accuracy;
- completion false-positive rate;
- duplicate evidence rate;
- unsupported numeric observation rate;
- provenance completeness;
- deterministic reparse/replay.

**Hard gate:** dangling evidence, invalid coordinate contract, completion contradiction, atau untraceable numeric fact harus nol pada accepted DEM. Coverage rendah boleh menjadi `partial/review`; data palsu tidak boleh accepted.

#### Reconciliation/PCKM

- pairwise precision/recall untuk same-entity;
- overmerge rate dan undermerge rate;
- wrong-level/wrong-building/wrong-discipline binding rate;
- spatial identity accuracy;
- conflict recall/precision;
- ambiguity routing recall;
- calibration/Brier score untuk confidence;
- correction application accuracy;
- revision supersession/stale-claim accuracy;
- graph invariant pass rate;
- provenance coverage per claim.

**Hard gate:** overmerge pada identity berisiko tinggi, cross-project binding, dan promotion dari quarantined evidence harus nol. Undermerge boleh masuk review.

#### Retrieval/query plan

- intent accuracy;
- entity/filter extraction accuracy;
- seed recall@k dan evidence recall@k;
- context precision;
- wrong-scope result rate;
- zero-result classification accuracy;
- conflict/missing surfacing recall;
- claim-evidence entailment;
- context token use dan latency;
- audit trace fidelity;
- cross-project leakage rate.

Current “benchmark” retrieval hanya satu synthetic J2 lookup dan token budget (`services/db/tests/test_project_graph_retrieval.py:144-161`). Itu unit regression, bukan query benchmark.

#### Answer

- factual exactness;
- citation correctness dan coverage per claim;
- Observed/Inferred/Calculated label accuracy;
- unsupported claim rate;
- refusal precision/recall;
- conflict disclosure rate;
- issue-set/revision disclosure;
- paraphrase consistency;
- deterministic numeric replay dari engine result.

**Hard gate:** unsupported numeric answer, citation laundering, cross-project leak, dan claim dari stale revision harus nol untuk release.

#### Quantity/RAB

- rule-selection accuracy;
- input-readiness accuracy;
- false-ready rate;
- missing-input recall;
- assumption capture/approval coverage;
- unit compatibility;
- engine request reproducibility;
- result-to-input/evidence lineage coverage;
- stale-result detection setelah revision/correction;
- manual anchor agreement pada test Core Engine sesuai Aturan Emas.

Metrik quantity mengevaluasi engine dan work package, bukan kemampuan LLM berhitung.

### 4.5 Pertanyaan yang **tidak boleh dijawab sistem**

Sistem harus menolak atau mengubah jawaban menjadi readiness report dalam kondisi berikut:

1. “Berapa volume/biaya/durasi …?” tanpa approved Measurement Work Package dan Core Engine result.
2. “Berapa jumlah fisik kolom/pintu …?” jika node occurrence belum mempunyai cardinality semantics yang tervalidasi.
3. “Apa dimensi/material yang hilang?” bila jawabannya harus ditebak dari praktik umum.
4. “Berapa ukuran berdasarkan skala/bbox?” jika measurement rule/geometri belum didukung engine dan approved.
5. “Mana revisi terbaru/berlaku?” bila approved issue set belum ada.
6. “Pilih salah satu dimensi yang konflik” tanpa revision precedence atau human resolution.
7. “Anggap lantai ±0.000 adalah Lantai 1” tanpa canonical decision/evidence.
8. Pertanyaan exact fact bila evidence ref hilang, bbox invalid, source quarantined, atau unit tidak diketahui.
9. Pertanyaan proyek lain/tenant lain, termasuk bila user menyisipkan ID dalam prompt.
10. Pertanyaan yang hanya dapat dijawab dengan menggeneralisasi dari PLHUT ke proyek lain.
11. “Proses langsung ke RAB” bila identity/location/input/review belum siap.
12. “Konfirmasi semua angka benar” hanya karena satu tool pernah dipanggil.

Respons yang benar bukan selalu “tidak tahu”. Gunakan status terstruktur: `not_ready`, `not_found_in_scope`, `partial_evidence`, `conflicting`, `revision_unknown`, `calculation_required`, `human_approval_required`, atau `unsupported_rule`.

### 4.6 Minimum release suite

Release suite harus mencakup:

- seluruh 88-page annotated regression;
- stratified difficult pages (cover, legend, plan, section, detail, schedule, low-text, MEP, structure, architecture);
- query paraphrase set;
- zero/negative queries;
- deliberate evidence corruption;
- deliberate level/elevation collision;
- same-code cross-discipline cases;
- controlled revision/diff scenario;
- correction→new snapshot→query round-trip;
- calculation-required→approval→engine→RAB lineage;
- multi-project isolation;
- model/prompt version change invalidating resume cache;
- provider failure and Command Room fail-closed.

PLHUT alone tidak cukup untuk production acceptance. Sebelum rollout, tambahkan holdout dengan nomenklatur berbeda, proyek multi-building, proyek dengan revision packages, dan disiplin selain arsitektur dominan.

---

## Bagian 5 — Risiko Utama dan Solusi Dangkal yang Harus Ditolak

| Risiko | Dampak | Mitigasi struktural | Solusi dangkal yang ditolak |
|---|---|---|---|
| DEM schema-valid tetapi evidence-invalid | Seluruh graph grounded pada bukti palsu/hilang | Integrity gate + quarantine + coordinate contract | Prompt “jangan halusinasi” lebih panjang |
| Level/elevation/dimension tercampur | Wrong-location answer dan quantity | Spatial ontology + identity ledger + human gold | Tambah regex khusus PLHUT atau hardcode alias |
| Overmerge/undermerge entity | Count dan specification salah | Scoped identity + pairwise benchmark + conservative review | Exact code/name = same object |
| AI decision tidak diterapkan | Review tidak mengubah sistem | Append-only proposal/decision ledger + rebuild | Menyimpan reasoning string saja |
| Snapshot atomic tetapi invalid | Kesalahan tersebar konsisten | Pre-activation semantic gates + smoke queries | Mengandalkan transaksi DB |
| Summary count disalahartikan quantity | RAB salah | Cardinality semantics + rename metrics + work package | Tooltip “ini perkiraan” |
| Query planner tidak ada | Query komposit kosong/scope salah | Runtime `GraphQueryPlan`, typed filters, fallback validated | Menyuruh LLM memecah query via prompt |
| Citation laundering | Jawaban terlihat dapat diaudit tetapi tidak entailed | Claim-level evidence binding dan pre-stream compiler | “Wajib kutip sheet” di system prompt |
| Tool fail-open | Model mengarang saat data unavailable | Data-intent fail-closed + explicit status | Menelan exception demi UX |
| Revisi tidak dimodelkan | Jawaban dan RAB stale | Approved issue set + lineage + stale propagation | Latest uploaded filename wins |
| Human review theater | Owner percaya koreksi sudah berlaku | Correction impact + new snapshot + UI round-trip | Mengubah status correction menjadi resolved |
| Dual pipeline | Dua source of truth dan dua readiness policy | Migration adapter + explicit cutover/sunset | Membiarkan keduanya “sementara” tanpa policy |
| Provider/model drift | Output berubah tanpa invalidation | Versioned prompt/model + benchmark + cache key | Pin nama model di metadata hardcoded |
| PLHUT overfit | Demo bagus, proyek lain gagal | Holdout lintas proyek/disiplin/revisi | Menambah test assertion angka fixture |
| Cost/latency membengkak | Tidak viable operasional | Rule-first, risk routing, cache by full provenance | Pro untuk semua halaman/candidate |
| Tenant leak | Pelanggaran keamanan | Server-side project membership + scoped IDs + adversarial tests | Mengandalkan project ID dari prompt |

### Solusi yang secara eksplisit harus ditolak

1. **“Perbaiki prompt Qwen saja.”** Fixture membuktikan prompt contract dapat dilanggar sambil tetap schema-valid.
2. **“Sambungkan summary views dulu agar produk terasa hidup.”** Read model current mewarisi spatial identity yang salah.
3. **“Gunakan DeepSeek Pro untuk audit seluruh graph.”** Model lebih kuat tetap bukan validator deterministik atau authority.
4. **“Tambah lebih banyak node/edges/evidence.”** Volume data bukan kualitas; current graph 4.218 node dan 4.583 edge tetap salah pada konsep level.
5. **“12 level stabil berarti canonicalization berhasil.”** Stabilitas kesalahan bukan correctness.
6. **“Setiap occurrence = satu objek.”** Tidak didukung current resolver maupun benchmark.
7. **“Satu tool call membuktikan semua angka.”** Current Evidence Gate melakukan itu dan harus diganti.
8. **“PostgreSQL/Neo4j akan menyelesaikan graph query.”** Database tidak menciptakan intent parser atau construction ontology.
9. **“Warning cukup untuk data invalid.”** Data invalid harus dikarantina; warning yang tetap masuk active snapshot akan diabaikan downstream.
10. **“Human review belakangan.”** Review contract menentukan identity, correction, revision, dan quantity readiness; menundanya berarti membangun ulang.

---

## Keputusan Arsitektur yang Saya Rekomendasikan untuk Dibekukan oleh Fable 5

1. **PCKM current berstatus experimental, bukan verified.**
2. **Cabut acceptance “12 levels”; ganti dengan gold-based identity metrics.**
3. **DEM accepted hanya setelah Evidence Integrity Gate; sisanya quarantined/partial.**
4. **Canonical identity berscope spatial+discipline+revision, bukan exact normalized text.**
5. **AI output selalu proposal; applied decision berasal dari deterministic low-risk rule atau human approval.**
6. **PCKM snapshot immutable tetapi correctable melalui append-only decision + new snapshot.**
7. **Approved Drawing Issue Set adalah input wajib synthesis dan query.**
8. **Summary views/read models rebuildable dan dilarang menjadi source of truth.**
9. **`GraphQueryPlan` dan Grounded Claim Set menjadi kontrak runtime sebelum Command Room menjawab.**
10. **Data-intent tool failure harus fail-closed sebelum response di-stream.**
11. **Quantity hanya melalui human-approved Measurement Work Package → Core Engine.**
12. **UI pertama adalah evidence/revision/review workspace, bukan graph visualization.**
13. **PLHUT 88 halaman adalah regression seed; production go-live memerlukan holdout lintas proyek/revisi.**
14. **Jangan tambah database/model baru sebelum trust boundary dan benchmark lulus.**

---

## Putusan Akhir Sol

PAAX tidak perlu membuang DEM, PCKM, PostgreSQL graph, Core Engine, atau Command Room. Fondasinya cukup kuat untuk diteruskan. Tetapi arah lama yang menganggap “schema valid + graph terbentuk + snapshot aktif + tool bisa memanggil” sebagai bukti Drawing Intelligence sudah bekerja adalah **salah arah**.

Urutan yang benar adalah:

**buktikan evidence → putuskan identity → ikat revision → aktifkan knowledge snapshot → rencanakan query → kompilasi claim → siapkan work package → approval → hitung di engine → tampilkan dengan audit.**

Jika urutan ini dibalik, PAAX akan menghasilkan jawaban yang tampak semakin pintar tetapi semakin sulit dipercaya. Jika urutan ini dijaga, PAAX dapat menjadi sistem yang bukan hanya membaca gambar, melainkan mampu mempertanggungjawabkan bagaimana setiap fakta, asumsi, quantity, dan angka RAB lahir.
