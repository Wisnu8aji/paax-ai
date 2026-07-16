# SOL Review — Gelombang A2/A3 dan B4/B5 sebelum B6

**Tanggal:** 2026-07-16  
**Reviewer:** GPT-5.6 Sol — Strategic Architect PAAX  
**Basis kode:** `e4ab1ae431c57f7dfcff17bb7810b6fb05ea6738` + working tree bersama pada branch `feat/pckm-phase3-synthesis`  
**Cakupan:** A2 occurrence per disiplin, A3 kanonisasi level, B4 intent parser, B5 retrieve v2  
**Eksklusi eksplisit:** A4 tidak direview karena masih dikerjakan paralel. Perubahan B6 yang muncul selama review juga tidak dinilai.

## Putusan eksekutif

**Putusan keseluruhan: PERBAIKI-DULU. Jangan hubungkan jalur ini ke Command Room production melalui B6.**

A2 secara substantif memenuhi kebijakan occurrence baru dan dapat diterima sebagai komponen. Namun ada tiga trust-boundary blocker sebelum B6:

1. A3 masih mempunyai jalur title-first yang dapat mengikat occurrence `Lantai Atap P +16.20` ke `Atap`, meskipun node kanonisasinya sendiri dipertahankan ambigu.
2. B5 mengabaikan entity filter ketika query juga mempunyai level, dan dapat menyebut hasil `grounded` walau tidak ada occurrence yang cocok.
3. Jalur kalkulasi B5 hanya fail-closed pada happy path parser. Parser error jatuh ke legacy retrieval dan respons API menghilangkan catatan fallback; jalur kalkulasi ber-entity juga tetap mencari node graf.

Selain itu, Decision D11 belum ditegakkan: `occurrence_count` masih disajikan mentah tanpa semantik “kelompok konteks tercatat, bukan jumlah fisik”. Benchmark 8/8 tidak menangkap cacat-cacat tersebut.

| Item | Putusan | Ringkasan |
|---|---|---|
| A2 — occurrence per disiplin | **SETUJU-LANJUT-B6** untuk item A2 sendiri | Gate schedule/section, kebijakan architecture/structure/MEP, locator grid, dan `label_count` terimplementasi serta test sintetis hijau. |
| A3 — kanonisasi level | **PERBAIKI-DULU** | Identitas kanonis utama konservatif, tetapi title-first dan deduplikasi fakta dapat menghapus/menembus status review. |
| B4 — intent parser | **PERBAIKI-DULU** | Enam anchor lulus, tetapi grammar kalkulasi terlalu luas dan prioritas conflict tidak konsisten dengan intent runtime. |
| B5 — retrieve v2 | **PERBAIKI-DULU** | Entity+level salah scope, zero-match dapat dilabeli grounded, kalkulasi tidak fail-closed pada error boundary, dan D11 belum ditegakkan. |
| B6 production | **TIDAK BOLEH DIMULAI sebagai integrasi production** | Tunggu perbaikan A3/B4/B5 dan kelulusan A4 secara independen sesuai D10. |

Tidak ada alasan untuk **TOLAK** fondasi keseluruhan: bentuk arsitekturnya masih dapat diperbaiki secara lokal tanpa membuang PCKM/retrieval.

## Metode dan batas bukti

Navigasi dimulai dengan `graphify query` memakai vocabulary graph, lalu `graphify path` mengonfirmasi jalur `canonicalize_levels() -> synthesize_project_graph()` dan `parse_query_plan() -> _retrieve_intent() -> retrieve_project_graph()`. Setelah itu klaim laporan dibandingkan dengan `git status`, `git diff`, source, test, dan reproduksi in-memory.

Working tree berubah selama review karena A4 dan B6 dikerjakan paralel. File A4/B6 tidak dinilai. Kegagalan real-fixture yang muncul setelah integrasi A4 parsial juga tidak digunakan untuk menjatuhkan putusan A2/A3.

## Verifikasi klaim implementor terhadap kode/test nyata

| Klaim | Bukti aktual | Putusan verifikasi |
|---|---|---|
| A2: schedule/table/section tidak membuat occurrence, tetapi reference dan dimension tetap diproses (`report/report_drawing_intelligence/TERRA_REPORT_WAVE_A2_2026-07-16.md:27-43`). | Klasifikasi excluded sheet ada di `services/document-intelligence/app/project_graph/cross_sheet_resolver.py:283-290`. Reference dan `HAS_DIMENSION` dibangun lebih dulu pada `:729-784`, baru occurrence dihentikan pada `:786-787`. Test ada di `services/document-intelligence/tests/test_project_graph_synthesis.py:493-547`. | **Didukung.** |
| A2: structure tanpa space memakai grid/sheet, MEP tanpa space tetap dipertahankan, dan `label_count=len(sources)` (`report/report_drawing_intelligence/TERRA_REPORT_WAVE_A2_2026-07-16.md:33-43`). | Cabang structure/MEP ada di `cross_sheet_resolver.py:789-799`; grid/sheet menjadi locator pada `:851-905`; edge `ALIGNED_TO` pada `:931-947`; `label_count` pada `:550-552`. Test ada di `test_project_graph_synthesis.py:445-579`. | **Didukung.** |
| A3: pre-pass terjadi sebelum occurrence binding dan provider tidak dipanggil (`report/report_drawing_intelligence/TERRA_REPORT_WAVE_A3_2026-07-16.md:9-31`). | Synthesis membangun patch lalu memanggil `canonicalize_levels` sebelum alias/cross-sheet pada `services/document-intelligence/app/project_graph/synthesis.py:486-499`. Parameter provider sengaja dibuang pada `services/document-intelligence/app/project_graph/level_canonicalizer.py:180-192`. | **Didukung.** |
| A3: `Lantai-Atap P +16.20` tidak auto-merge dengan `Atap` (`report/report_drawing_intelligence/TERRA_REPORT_WAVE_A3_2026-07-16.md:27-28`). | Canonicalizer mempertahankan roof variant pada `level_canonicalizer.py:39-43,94-100`, membuat review pair pada `:261-278`, dan test generic-title memeriksa `POSSIBLY_SAME_AS` pada `test_project_graph_synthesis.py:175-217`. Namun jalur judul sheet menembus kebijakan ini; lihat Temuan F1. | **Hanya sebagian didukung.** |
| B4: parser memuat vocabulary snapshot, memvalidasi level/discipline/entity, dan enam query anchor sesuai laporan (`report/report_drawing_intelligence/LUNA_REPORT_WAVE_B4_2026-07-16.md:8-25`). | Implementasi ada di `services/db/src/paax_db/project_graph_intent.py:114-262,291-354`; anchor ada di `services/db/tests/test_project_graph_intent.py:81-139`. | **Didukung untuk enam anchor saja; bukan bukti cakupan grammar.** |
| B5: audit seed benar dan edge pasca-pruning tidak menggantung (`report/report_drawing_intelligence/LUNA_REPORT_WAVE_B5_2026-07-16.md:15-21`). | Seed disalin sebelum ekspansi pada `services/db/src/paax_db/project_graph_retrieval.py:501-529`; pruning mensyaratkan kedua endpoint tetap ada pada `:208-230`; regression assertions ada di `services/db/tests/test_project_graph_retrieval.py:45-52,261-266`. | **Didukung.** |
| B5: entity lookup memakai seed entity dan scoped retrieval (`report/report_drawing_intelligence/LUNA_REPORT_WAVE_B5_2026-07-16.md:17`). | Benar hanya tanpa level pada `project_graph_retrieval.py:467-481`. Bila level ada, cabang `:305-412` tidak memakai `plan.entities`; reproduksi `K1 lantai 2` juga mengembalikan `Jendela @ Lantai 2`. | **Tidak didukung secara umum.** |
| B5: kalkulasi short-circuit fail-closed (`report/report_drawing_intelligence/LUNA_REPORT_WAVE_B5_2026-07-16.md:17`; spec `docs/plans/drawing intelligence/SPEC_WAVE_B_QUERY_UNDERSTANDING_2026-07-16.md:64-67`). | Happy path menghasilkan `nodes=[]` pada `project_graph_retrieval.py:269-291`, tetapi tetap memanggil `_entity_seed_nodes`; parser error jatuh ke legacy pada `:238-250`, dan API menghilangkan notes bila `intent=None` pada `services/db/src/paax_db/main.py:624-634`. | **Tidak memenuhi trust boundary penuh.** |
| Scorecard 8/8 membuktikan query composite scoped benar (`report/report_drawing_intelligence/BENCHMARK_SCORECARD_2026-07-16.md:11`). | Runner GT8 hanya memeriksa `len(nodes)>0` pada `services/db/tests/run_pckm_benchmark.py:143-144`; tidak memeriksa level, disiplin, entity, atau endpoint edge. | **Klaim “scoped benar” tidak didukung checker.** |

Dengan demikian lebih dari tiga klaim telah diverifikasi langsung; dua klaim penting B5 dan satu klaim A3 hanya benar pada happy path.

## Temuan berbahaya

### F1 — HIGH — Title-first A3 dapat memaksa binding `+16.20` ke `Atap`

Canonicalizer memang mempertahankan `Lantai Atap P +16.20` sebagai kandidat ambigu. Namun `_source_context()` selalu memilih `_title_level()` sebelum fakta level hasil canonicalizer (`cross_sheet_resolver.py:371-392`). Regex judul hanya menangkap token `ATAP` dan mengembalikannya sebagai `Atap` (`:294-315`). Elevasi/kualifier `P +16.20` hilang pada boundary itu.

Reproduksi in-memory tanpa perubahan file:

- title: `DENAH LANTAI ATAP P +16.20`;
- level fact: `Lantai Atap P +16.20`;
- hasil level nodes: `Atap/extracted` dan `Lantai Atap P +16.20/ambiguous`;
- hasil occurrence: `R1 @ Atap / Ruang Mesin`, status `cross_sheet_inferred`;
- tidak ada review edge pada kasus satu-sheet tersebut.

Test A3 sekarang memakai default title `Synthetic sheet` (`test_project_graph_synthesis.py:20-27,175-217`), sehingga jalur precedence judul tidak teruji.

**Dampak:** node identitas tampak konservatif, tetapi fakta occurrence yang dikonsumsi summary/retrieval tetap dapat salah lantai. Ini persis bentuk “canonicalization terlihat benar, binding tetap salah” yang trust boundary R1 hendak cegah.

### F2 — HIGH — B5 mengabaikan entity bila level juga ada

Cabang level dijalankan untuk `LIST_FILTER` maupun `ELEMENT_LOOKUP` (`project_graph_retrieval.py:305-328`). Pemilihan occurrence hanya memeriksa discipline (`:340-347`); fallback BFS juga hanya memeriksa discipline (`:365-397`). Cabang yang benar-benar memakai entity seed sengaja dibatasi untuk query tanpa level (`:467-481`).

Reproduksi pada fixture test B5:

`K1 lantai 2` -> intent `ELEMENT_LOOKUP`, filter level `Lantai 2`, tetapi hasil berisi `OCC-W1 / Jendela @ Lantai 2` selain K1.

Tidak ada test entity+level. Test yang ada hanya `K1` tanpa level (`services/db/tests/test_project_graph_retrieval.py:355-365`) dan `struktur lantai 2` tanpa entity (`:303-339`).

**Dampak:** Command Room dapat menjawab pertanyaan elemen spesifik dengan fakta elemen lain sambil tetap memberi `data_status=grounded`.

### F3 — HIGH — Zero-match terlabel `grounded`

Level seed selalu dimasukkan ke hasil (`project_graph_retrieval.py:322,345-356` dan `:381-405`). Karena `data_status` ditentukan dari `bool(nodes)`, keberadaan node level saja cukup untuk status `grounded`, walaupun tidak ada occurrence sesuai filter.

Reproduksi: `mep lantai 2` pada fixture yang hanya memiliki occurrence structure dan architecture menghasilkan `nodes=[L2]` dan `data_status=grounded`.

**Dampak:** `grounded` tidak lagi berarti “jawaban filter ditemukan”; ia hanya berarti “anchor level ada”. Ini false-ready state.

### F4 — HIGH — Kalkulasi tidak fail-closed pada seluruh boundary

Ada tiga masalah terpisah:

1. Happy path tetap melakukan pencarian graf. `CALCULATION_REQUIRED` memanggil `_entity_seed_nodes()` (`project_graph_retrieval.py:269-273`), yang SELECT semua type/occurrence/reference kandidat lalu filter di Python (`:174-190`). Reproduksi `berapa volume K1` menghasilkan response `nodes=[]`, tetapi query log mencatat seed `TYPE-K1` dan `OCC-K1`; guidance bahkan menyebut occurrence sebagai “tipe elemen”. Ini tidak memenuhi pembacaan ketat spec “JANGAN cari-cari”.
2. Parser exception jatuh ke legacy retrieval (`:238-250`). Reproduksi dengan parser error menghasilkan `status=success`, `intent=None`, `data_status=None`, `nodes=[]`, bukan `calculation_required/not_ready`.
3. Endpoint hanya meneruskan notes/data_status bila `result.intent is not None` (`services/db/src/paax_db/main.py:624-634`), sehingga `parser: fallback_legacy` justru hilang dari respons API pada error tersebut.

Test kalkulasi hanya menguji happy path (`services/db/tests/test_project_graph_retrieval.py:391-403`); tidak ada parser-failure test dan tidak ada assertion bahwa graph lookup tidak terjadi.

**Dampak:** error pada komponen yang menentukan trust class dapat mengubah pertanyaan kalkulasi menjadi sukses-kosong yang menyesatkan—kasus yang GT9 sendiri menyatakan harus gagal.

### F5 — HIGH — D11 belum ditegakkan di B5/benchmark

A2 menyimpan `label_count=len(sources)` dengan komentar internal bahwa itu bukan takeoff (`cross_sheet_resolver.py:550-552`). Endpoint B5 tidak mengekspor properties node, sehingga `label_count` **tidak muncul langsung** di payload API (`services/db/src/paax_db/main.py:615-621`). Risiko langsung `label_count` di B6 saat ini rendah.

Sebaliknya, `summary_view` diekspor utuh (`main.py:624-633`) dan kontrak Zod menyajikan `occurrence_count` sebagai integer tanpa cardinality semantics (`packages/schemas/src/index.ts:1778-1788`). Tidak ada `notes`, `cardinality_semantics`, atau label “record kelompok konteks—bukan jumlah fisik” yang ditambahkan B5. Scorecard juga menulis “occ total/occ struktur” tanpa enforcement semantik (`BENCHMARK_SCORECARD_2026-07-16.md:8-11`).

Ini bertentangan dengan D11 (`PAAX_DRAWING_INTELLIGENCE_MASTER_PLAN_2026-07-16.md:233`) yang secara eksplisit mewajibkan enforcement di B5/B6 + benchmark.

**Dampak:** model/consumer dapat menjawab “berapa kolom” dari `occurrence_count` atau `confirmed_count`, padahal angka itu hanya jumlah record konteks.

### F6 — MEDIUM-HIGH — B4 grammar terlalu luas dan intent berlapis tidak konsisten

Spec menyatakan kalkulasi pada frasa kebutuhan seperti “butuh berapa material/semen/besi” (`SPEC_WAVE_B_QUERY_UNDERSTANDING_2026-07-16.md:26-29`). Implementasi memasukkan kata tunggal `material`, `semen`, `besi`, `beton`, dan `bertulang` ke `_CALCULATION_TERMS` (`project_graph_intent.py:38-55`), lalu satu match apa pun langsung menjadi `CALCULATION_REQUIRED` (`:303-313`).

Reproduksi:

- `material K1` -> `CALCULATION_REQUIRED`, bukan material/stored-fact lookup;
- `beton K1` -> `CALCULATION_REQUIRED`;
- `konflik dimensi` -> parser B4 memberi `NUMERIC_STORED_FACT` karena numeric diperiksa sebelum conflict (`:314-320`).

B5 menambal kasus terakhir dengan override kedua (`project_graph_retrieval.py:254-260`). Test B5 lulus (`test_project_graph_retrieval.py:367-376`), tetapi `GraphQueryPlan` B4 sendiri tetap salah dan parser/retrieval kini memiliki dua source of truth untuk prioritas intent.

**Dampak:** factual material query ditolak sebagai kalkulasi; consumer yang memakai parser secara langsung memperoleh intent berbeda dari retrieve v2.

### F7 — MEDIUM-HIGH — Deduplikasi fakta A3 membuang metadata review

`_fact_values()` memberi `aliases`, `properties`, dan `requires_review` pada kandidat (`cross_sheet_resolver.py:130-150`). Saat dua fakta dengan key sama digabung, constructor pengganti hanya menyalin key/display/confidence/evidence/bbox (`:152-163`); tiga field baru tersebut kembali ke default kosong/false.

Reproduksi dua fakta identik `Lantai Atap P +16.20` pada satu sheet:

- `canonical_level_requires_review=True`;
- kedua fact classification = `FLOOR_NAME_AMBIGUOUS`;
- hasil deduplikasi `_FactValue.requires_review=False`, aliases/properties kosong.

**Dampak:** occurrence pada fakta duplikat dapat memperoleh `cross_sheet_inferred` walau level kanonisnya ambigu. Test saat ini hanya memakai satu fakta level per sheet.

### F8 — MEDIUM — Schema parity B5 belum seketat klaim

Pydantic response menerima `summary_view: Optional[Dict[str, Any]]` (`services/db/src/paax_db/schemas.py:378-392`), sedangkan Zod memerlukan `ProjectGraphSummaryViewSchema` (`packages/schemas/src/index.ts:1835-1849`). Kedua file memang diubah bersama, tetapi boundary validation tidak setara.

**Dampak:** payload summary malformed dapat lolos backend dan baru gagal/berubah perilaku di consumer TypeScript. Ini melanggar semangat satu sumber kebenaran skema.

## Audit regresi dan kualitas test

Tidak ditemukan file test yang dihapus. Diff test justru dominan menambah coverage:

- `services/db/tests/test_project_graph_retrieval.py`: +195/-1;
- `services/document-intelligence/tests/test_project_graph_synthesis.py`: +241/-1;
- `services/document-intelligence/tests/test_project_graph_real_fixture.py`: +54/-14.

Anchor real-fixture A2/A3 memang diubah, tetapi disertai penjelasan konteks dan assertions semantik baru; saya tidak menemukan test lama yang diam-diam dihapus atau diubah menjadi assertion lebih longgar. Regresi tersembunyi berada pada **ruang yang tidak diuji**, bukan pada penghapusan test:

1. qualified roof pada title sheet;
2. duplicate canonical level facts satu sheet;
3. entity + level;
4. discipline valid tetapi zero-match;
5. parser exception untuk query kalkulasi;
6. bare material/stored-fact query;
7. semantic guard D11;
8. GT8 scope correctness.

Benchmark 8/8 tidak boleh diperlakukan sebagai production gate. GT8 hanya nonzero check (`run_pckm_benchmark.py:143-144`), sedangkan GT9 hanya melihat status/refusal marker (`:147-152`) dan tidak memeriksa parser failure. PLHUT tetap regression seed, sesuai Amendemen 1, bukan bukti generalisasi.

Perubahan default `use_intent=true` memang mengubah perilaku request lama yang tidak mengirim field tersebut. Ini bukan perubahan diam-diam karena disebut di laporan B5 (`LUNA_REPORT_WAVE_B5_2026-07-16.md:68-73`) dan diwajibkan spec (`SPEC_WAVE_B_QUERY_UNDERSTANDING_2026-07-16.md:50-54`), tetapi rollout B6 tetap harus menganggapnya behavioral migration, bukan sekadar schema-compatible addition.

## Hasil test yang saya jalankan

| Perintah | Hasil |
|---|---|
| `python -m pytest -q` di `services/db` | **49 passed, 1 skipped, 3 warnings** |
| `pnpm exec tsc --noEmit` di `packages/schemas` | **exit 0** |
| `python -m pytest tests/test_project_graph_synthesis.py -q` | **30 passed** |
| `python -m pytest tests/test_project_graph_synthesis.py tests/test_project_graph_real_fixture.py -q` | **30 passed, 1 failed** |
| `python tests/run_pckm_benchmark.py` | **8/8 PASS secara mekanis** |

Failure real-fixture saat review berada di `services/document-intelligence/tests/test_project_graph_real_fixture.py:86`: `HAS_DIMENSION` aktual 153 vs anchor 168 setelah perubahan A4 paralel. Karena A4 belum selesai dan secara eksplisit dikecualikan, failure ini dicatat sebagai keadaan worktree, bukan temuan A2/A3. Klaim historis “suite penuh hijau” dalam laporan Terra tidak dapat direproduksi terhadap worktree yang sudah berubah; itu bukan bukti bahwa klaim historisnya palsu.

Benchmark runner menulis ulang scorecard sebagai side effect; scorecard dikembalikan ke isi sebelum run agar review tidak mengubah artefak benchmark implementor.

## Jawaban langsung atas trust-boundary questions

1. **Apakah A4 mengkarantina full-dangling?** Tidak dinilai, sesuai instruksi. D10 tetap hard dependency: B6 production tidak boleh aktif sebelum A4 lulus review/test terpisah.
2. **Apakah A3 konservatif terhadap `+16.20` vs `Atap`?** Pada canonical node path: ya. Pada occurrence binding end-to-end: **belum**; title-first dapat mengikatnya ke `Atap` (F1), dan duplicate facts dapat menghapus status review (F7).
3. **Apakah `CALCULATION_REQUIRED` fail-closed tanpa pencarian?** Happy-path response kosong dan tidak menghitung, tetapi **tidak** fail-closed penuh: ada entity graph lookup, parser-error fallback legacy, dan API menyembunyikan fallback notes (F4).
4. **Apakah count berisiko dianggap kuantitas fisik?** `label_count` belum diekspor di response API B5, tetapi `occurrence_count`/`confirmed_count` di summary view sangat berisiko dan D11 belum ditegakkan (F5).

## Perbaikan wajib sebelum B6

### A3

1. `services/document-intelligence/app/project_graph/cross_sheet_resolver.py:294-315,371-392` — jangan biarkan title parser menghapus kualifier/elevasi atau mengalahkan hasil canonicalizer. Title candidate harus masuk policy kanonisasi yang sama.
2. `cross_sheet_resolver.py:152-163` — merge `aliases`, `properties`, dan `requires_review` secara konservatif (`OR` untuk review), bukan reset default.
3. `services/document-intelligence/tests/test_project_graph_synthesis.py` — tambah test judul nyata `DENAH LANTAI ATAP P +16.20` dan duplicate level facts; occurrence wajib tetap pada kandidat ambigu/review, bukan `Atap` inferred.

### B4

1. `services/db/src/paax_db/project_graph_intent.py:38-55,303-320` — bedakan factual material lookup dari permintaan kalkulasi; jangan jadikan kata tunggal `material/beton/besi` selalu calculation.
2. Putuskan precedence conflict di parser B4 sendiri dan hapus split-brain override B5 (`project_graph_retrieval.py:254-260`).
3. `services/db/tests/test_project_graph_intent.py` — tambah anchor `material K1`, `beton K1`, `konflik dimensi`, dan intent-overlap lain.

### B5

1. `services/db/src/paax_db/project_graph_retrieval.py:305-412` — terapkan `plan.entities` pada summary path dan fallback level path; jangan mengembalikan elemen lain.
2. Pada cabang level, `data_status` harus didasarkan pada matched result setelah filter, bukan keberadaan anchor level.
3. `project_graph_retrieval.py:238-291` — calculation guard harus tetap fail-closed bila parser error. Jangan fallback legacy untuk query dengan sinyal kalkulasi; jangan melakukan graph search pada jalur refusal.
4. `services/db/src/paax_db/main.py:624-634` — jangan menghilangkan fallback/error notes hanya karena `intent=None`; untuk data proyek, gunakan status eksplisit (`not_ready`/`unknown`) sesuai kontrak B6 fail-closed.
5. Tegakkan D11 di response: bawa semantics eksplisit bahwa `occurrence_count`/`confirmed_count` adalah jumlah kelompok konteks tercatat, bukan quantity fisik. Tidak perlu rename sekarang; jangan hitung di TS/LLM.
6. Filter atau bangun ulang `summary_view` sesuai discipline/entity yang diterapkan; jangan mengirim payload level penuh bersama node subset tanpa penanda.
7. Samakan Pydantic/Zod untuk struktur `summary_view` (`services/db/src/paax_db/schemas.py:378-392`; `packages/schemas/src/index.ts:1835-1849`).
8. Perkuat benchmark `services/db/tests/run_pckm_benchmark.py:143-152`: cek semua occurrence benar level+discipline, tambah entity+level, zero-match, parser-failure calculation, no graph-search calculation, dan D11 wording.

## Gate re-review

B6 baru boleh menerima **SETUJU-LANJUT** setelah seluruh kondisi berikut terbukti dengan test merah-hijau:

- qualified roof title tidak mengubah candidate ambiguous menjadi `Atap` occurrence;
- duplicate level facts tidak menghapus metadata review;
- entity+level hanya mengembalikan entity yang diminta;
- zero-match menghasilkan `empty`, bukan `grounded`;
- calculation tetap refusal/not-ready ketika parser gagal dan tidak melakukan graph traversal/search;
- response/benchmark menegakkan D11;
- schema parity Pydantic/Zod teruji;
- A4 lulus gate terpisah sesuai D10;
- suite DB, doc-intel, schema typecheck, benchmark yang diperkuat, dan test B6 semuanya hijau pada satu snapshot worktree yang stabil.

**Final Sol:** A2 diterima; A3, B4, dan B5 belum aman untuk konsumsi Command Room production. Status keseluruhan tetap **PERBAIKI-DULU**.
