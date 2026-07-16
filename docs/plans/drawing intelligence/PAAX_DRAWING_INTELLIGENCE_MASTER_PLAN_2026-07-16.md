# PAAX Drawing Intelligence — Master Plan (2026-07-16)

> Dokumen induk mandat strategis (10 deliverables).
> **RATIFIKASI 2026-07-16**: atas instruksi owner ("debat jangan bertele-tele, tetapkan
> hal penting langsung, susun master plan, langsung eksekusi"), seluruh bagian yang
> semula berstatus draft-debat DIKUNCI FINAL oleh Fable 5 berdasarkan bukti kuantitatif terverifikasi.
> Laporan analisis independen Sol (GPT-5.6 xhigh) & Gemini yang masih berjalan akan
> diperlakukan sebagai INPUT REVIEW pasca-keputusan: temuan material diserap lewat
> amendemen bertanda, bukan membuka ulang debat.
> Sumber bukti: `report/report_drawing_intelligence/FABLE_R1_STRATEGIC_DIAGNOSIS_2026-07-16.md`
> (+ probe kuantitatif di dalamnya), `SINTESIS_3ARAH_QUERY_LOKASI_VOLUME_2026-07-16.md`,
> `BENCHMARK_GROUND_TRUTH_SEED_2026-07-16.md`.

---

## 1. Executive Diagnosis [FINAL]

**Kondisi:** pipeline DEM→PCKM→storage→Command Room nyata dan hijau (418+37 test), sisi
quantity/RAB (core-engine TKG) matang terpisah. Namun sistem baru bisa MENGEKSTRAK dan
MENYIMPAN — belum sepenuhnya MEMAHAMI RUANG, MEMAHAMI PERTANYAAN, dan belum bisa MEMBUKTIKAN
kebenarannya.

**Tiga akar masalah berlapis (semuanya berbukti kuantitatif):**

1. **Gerbang occurrence membunuh disiplin struktur** — 79 element_type struktur → hanya
   1 occurrence; 207 sumber gugur karena occurrence mewajibkan level+RUANG, padahal denah
   struktur melokasikan lewat GRID (bukti: hal.43 "DENAH KOLOM LANTAI 2" punya 17 label
   kolom + 10 grid + 0 spaces). "Berapa kolom di lantai 2" tidak mungkin dijawab —
   datanya tidak pernah masuk graf.
2. **Identitas level belum kanonis** — 12 node "level": hanya 2-3 sungguhan; ±18% occurrence
   menempel ke pseudo-level (±0.000, angka 3000/2000, elevasi lepas). Padahal gambar potongan
   menulis pemetaan eksplisit "EL. ±0.000 LANTAI 1 / +4.400 LANTAI 2 / +8.300 LANTAI ATAP"
   (hal.54) — sumber deterministik yang belum dibaca pipeline.
3. **Tidak ada lapisan pemahaman query + tidak ada pengukuran** — retrieve = keyword BFS
   (frasa alami "struktur lantai 2"=0 hasil; "kolom lantai 1"=65 node SALAH tipe;
   istilah generik=16 detik noise); GraphQueryPlan tak pernah disambungkan; summary views
   tersimpan tapi tak dikonsumsi; pertanyaan volume tidak ditolak/diarahkan; nol benchmark.

**Risiko bila diteruskan:** jawaban salah-scope yang meyakinkan → scope salah mengalir ke
RAB; kerapuhan prompt; celah Aturan Emas; regresi senyap; biaya query tinggi; gagal
generalisasi proyek kedua.

**Peluang:** views+intent = lompatan produk; quality metadata → review queue → trust;
lineage snapshot → analisis dampak revisi; benchmark = bukti akurasi; deteksi missing-data
NYATA sudah terbukti (K1A dipakai 12× di L2 tanpa dimensi di seluruh 88 hal — persis nilai
jual PAAX ke praktisi).

### 1.1 Biaya & performa terukur [FINAL]
- Ekstraksi DEM penuh 88 hal: **~2 j 16 m** wall-clock (Qwen/DashScope, resume+concurrency; 2026-07-14).
- Synthesis deterministik: ~30 dtk lokal; eskalasi AI: 78 kandidat × 5-17 dtk Flash
  (~1.2K prompt + ~3K completion token per 4 kandidat — live run 2026-07-16), paralelisasi mudah.
- Query retrieve saat ini: ~130ms (level-exact) s/d **16.5 dtk** (istilah generik, hasil noise) —
  bukti kebutuhan serving layer.

## 2. Target Product Vision [FINAL]

Drawing Intelligence = **Project Intelligence Layer**: memahami struktur proyek utuh
(bangunan-lantai-zona-ruang-grid-elevasi-disiplin), menjawab lintas halaman dengan evidence,
membedakan fakta/inferensi/asumsi/kalkulasi, mengakui ambiguitas, memprioritaskan review
manusia, menilai kesiapan quantity, dan meneruskan data tervalidasi ke Core Engine untuk
BOQ/RAB yang dapat diaudit. Target = sistem engineering intelligence yang dapat
dipertanggungjawabkan, bukan "chat yang bisa menjawab".

## 3. Target Architecture [FINAL — ratifikasi Fable 2026-07-16]

```
L0 Source Registry   : dokumen, halaman, revisi, hash (immutable)
L1 Drawing Evidence  : DEM per halaman (immutable; anchor provenance)         [dulu "JSON 1"]
L2 Project Knowledge : PCKM kanonis — entitas, hirarki spasial (level→ruang/grid),
                       status confirmed/ambiguous/conflicting, snapshot-versioned,
                       corrections = overlay audit-able                        [dulu "JSON 2"]
L3 Serving/Answer    : summary views per snapshot + intent parser (GraphQueryPlan)
                       + routing 3 kelas + answer contract (§18: sitasi, data_status, trace)
L4 Quantity Bridge   : proposal berbasis evidence + measurement rules + assumption registry
                       + approval manusia → input TKG → core-engine → BOQ/RAB
Lintas: Provenance/Audit; Human Review (exception queue); Observability; RBAC
```

Kebijakan spasial per disiplin (koreksi domain engineer):
- **Struktur**: occurrence = level WAJIB + grid locator; ruang opsional.
- **Arsitektur/MEP**: level + ruang.
- **Schedule/TABEL**: jalur definisional (DEFINED_BY: dimensi/material per tipe), bukan occurrence.
- **POTONGAN/TAMPAK**: lintas-level — dilarang mengikat level dari teks elevasi terdekat;
  justru jadi SUMBER pemetaan elevasi→lantai ("EL. x LANTAI y").

Aliran revisi: dokumen rev baru → DEM baru → snapshot baru (lineage) → views baru →
laporan dampak diff. Corrections dibawa maju dengan kebijakan re-apply eksplisit.

## 4. Capability Map [FINAL]

| Status | Komponen |
|---|---|
| SUDAH ADA & BENAR | DEM extraction+resume; synthesis deterministik+eskalasi Flash (live); snapshot atomik+supersede; corrections table; summary view LEVEL_OVERVIEW (schema+materializer+endpoint+storage); tool loop Command Room 3 model+audit; core-engine TKG/RAB+golden test; RAB bridge proposal |
| BERFUNGSI PARSIAL | kanonisasi level (regex judul saja); retrieve (workaround level-exact; frasa alami gagal); binding occurrence (arch/MEP saja) |
| BELUM TERHUBUNG | summary views→query path; GraphQueryPlan→endpoint; RAB bridge→consumer; corrections→workflow; metrics→dashboard |
| BELUM DIBANGUN | intent parser; routing 3 kelas; grid-locator struktur; jalur schedule definisional; pemetaan elevasi→lantai; alias semantik (Flash); review workflow; UI workspace; benchmark harness; assumption registry; revision impact |
| PERLU DIREVISI | deskripsi tool workaround; istilah JSON1/JSON2; communities generik; PR chain #42-47 stale |
| PERLU DIBUANG | (tidak ada — tidak ada komponen yang layak dihapus saat ini) |

## 5. Master Roadmap [FINAL — ratifikasi Fable 2026-07-16]

Gelombang A — Fondasi kebenaran data (berurut):
1. Benchmark harness + ground truth (seed 18 Q sudah ada) — gerbang semua langkah.
2. Perbaiki gerbang occurrence per disiplin (struktur: level+grid; schedule: definisional).
3. Kanonisasi level penuh: klasifikasi kandidat (floor/elevasi/angka) + pemetaan
   "EL. x LANTAI y" dari potongan (deterministik) + fallback Flash (semantik) + ambiguous.

Gelombang B — Pemahaman query (berurut, setelah A):
4. Intent parser + validator GraphQueryPlan (rule → Flash tervalidasi).
5. Retrieve v2 plan-driven (views→LIST; graph+evidence→STORED_FACT; tolak+arahkan→CALC).
6. Tool Command Room v2 kontrak §17.2 + answer contract §18; hapus workaround.

Gelombang C — Manusia & hilir (paralel sebagian dgn B):
7. Review workflow v1 (exception queue dari quality metadata + corrections round-trip).
8. Quantity readiness v1 (kriteria per element_type; consumer RAB bridge; assumption registry).
9. UI workspace v1 (konsumsi endpoint L3; pohon struktur, evidence drill-down, panel konflik).
10. Desain revisi/lineage impact (desain sekarang, bangun setelah stabil).

TIDAK sekarang: multi-bangunan penuh, kanonisasi zona penuh, service baru, vector search,
deploy Postgres produksi, gambar proyek lain (instruksi owner).

## 6. Decision Register [sebagian FINAL]

| # | Keputusan | Status | Alasan/bukti |
|---|---|---|---|
| D1 | Branch `feat/pckm-phase3-synthesis` = garis kanonik; PR #42-47 di-supersede satu PR segar | FINAL (proses merge = keputusan owner) | HEAD superset semua kode review-chain |
| D2 | Occurrence policy per disiplin (struktur tanpa wajib-ruang) | FINAL (bukti 4d) | 78/79 tipe struktur gugur; denah struktur memang tanpa label ruang |
| D3 | Pemetaan elevasi→lantai deterministik dari POTONGAN dulu, Flash sisa kasus | FINAL (bukti hal.54) | pola "EL. x LANTAI y" tertulis eksplisit |
| D4 | Penamaan lapisan L0-L4 menggantikan "JSON 1/JSON 2" | FINAL (ratifikasi 2026-07-16) | profesionalisasi kontrak |
| D5 | Routing 3 kelas + GraphQueryPlan dipakai (bukan didesain ulang) | FINAL (konsensus 3-arah terdahulu) | skema sudah ada & sinkron |
| D6 | Communities generik diturunkan jadi artefak internal | FINAL (ratifikasi 2026-07-16) | nilai produk nol saat ini |
| D7 | Gemini tidak pernah masuk jalur produksi; AI produksi = DeepSeek Flash/Pro key terpisah | FINAL (aturan owner + live-verified) | isolasi biaya & governance |
| D8 | Commit tanpa atribusi AI apa pun | FINAL (aturan owner 2026-07-16) | jejak git bersih |

## 7. Validation Strategy [FINAL — berkembang]

Ground truth seed 18 pertanyaan (file `BENCHMARK_GROUND_TRUTH_SEED_2026-07-16.md`) →
runner `services/db/tests/run_pckm_benchmark.py` (opt-in, bukan bagian pytest default) →
scorecard artefak repo. Metrik: accuracy, wrong-level, false-scope, evidence coverage,
zero-result, calculation-integrity 100%, konsistensi, latensi/token. Kaidah: hitungan =
"label/occurrence tercatat" + evidence, bukan klaim jumlah fisik. Benchmark dijalankan
sebelum & sesudah tiap gelombang; regresi = blocker.

**BASELINE TERUKUR (2026-07-16, sebelum gelombang A): 1/8 PASS**
(`BENCHMARK_SCORECARD_2026-07-16.md`). Kegagalan: struktur absen (GT2/4), dimensi K1 ada di
graf tapi terpangkas pruning (GT6 — STORED_FACT butuh traversal terarah HAS_DIMENSION, bukan
BFS generik), frasa alami nol (GT8), kalkulasi tidak diarahkan (GT9), konflik tak terjangkau
dari frasa (GT14), alias semantik (GT17). Satu-satunya PASS: kejujuran nol-hasil (GT16).

## 8. UI Product Direction [FINAL — ratifikasi Fable 2026-07-16]

Engineering intelligence workspace (bukan dashboard template): panel pohon proyek
(level→disiplin→tipe dari views), daftar elemen + occurrence + status keyakinan, drill-down
evidence ke halaman gambar (sitasi bbox), panel konflik & missing-data (antrian review
terprioritas dampak), indikator kesiapan quantity per elemen, jejak "angka ini dari mana".
UI hanya mengonsumsi endpoint L3/L4 — tidak pernah menghitung.

Prioritas urut (diperkaya masukan Sol §2.8, diadopsi): (1) drawing viewer + overlay evidence
raw/normalized berdampingan; (2) banner snapshot/revisi selalu terlihat (label
"experimental" per D13 sampai gate lulus); (3) navigator hirarki level→zona→disiplin;
(4) antrian review terurut risiko (evidence invalid → konflik → identitas spasial → merge
→ input quantity hilang); (5) panel keputusan (proposal, alternatif, evidence, rationale,
dampak); (6) preview efek koreksi sebelum apply; (7) label jawaban Observed/Inferred/
Calculated; (8) panel kesiapan quantity (rule, input, asumsi, approval — TANPA tombol
"hitung otomatis"). BUKAN graph-canvas visualisasi besar. Jalur TKG lama diberi badge
legacy (D9) sampai sunset.

## 9. Execution Plan [FINAL — ratifikasi Fable 2026-07-16]

Fable = keputusan, spek, verifikasi tiap langkah. Sonnet = implementasi utama (item roadmap
per PR kecil). Haiku = tugas mekanis (fixture, formatting, probe). Codex/Sol = review
arsitektur + spek yang menyentuh angka. Antigravity/Gemini = implementasi paralel yang
terspesifikasi penuh + verifikasi silang. Semua agent: graphify-first, dilarang menyentuh
Aturan Emas, commit tanpa atribusi AI, PR tanpa auto-merge.

## 10. Final Readiness Report

(Diisi di akhir eksekusi — lihat laporan terpisah.)

---

## AMENDEMEN 1 (2026-07-16, pasca-laporan Sol R1 — semua klaim diverifikasi ulang Fable)

Laporan `SOL_R1_STRATEGIC_DIAGNOSIS_2026-07-16.md` menyerahkan temuan material baru.
Verifikasi independen Fable mengkonfirmasi angka-angkanya PERSIS:

1. **Defect integritas DEM skala besar** (fixture 88 hal): 6.904/7.004 bbox (98,6%) di luar
   kontrak 0-1 (koordinat piksel — prompt tidak menegakkan; catatan: pencocokan geometri
   nearest-value TETAP fungsional karena konsisten dalam satu halaman, tapi kontrak &
   overlay UI rusak); 839 evidence_refs menggantung di 47 halaman (risiko citation
   laundering); 33 ID evidence duplikat; 15 halaman tanpa evidence; kontradiksi completion
   (hal.42 is_complete=true padahal 9/12 section). Parser hanya validasi Pydantic.
2. **Keputusan AI merge/keep_separate DIBUANG** — synthesis hanya materialisasi
   `possibly_same`/`requires_review` (verified synthesis.py). Konservatif itu benar,
   tapi keputusan harus TERCATAT sebagai proposal ledger, bukan hilang.
3. **Evidence Gate Command Room sudah ada TAPI fail-open** (ai-orchestrator/src/router/
   evidence-gate.ts): berjalan pasca-stream, tidak memblokir, menandai semua angka
   "verified" bila satu tool numerik terpanggil; kegagalan tool loop jatuh diam-diam ke
   jawaban tanpa data.
4. **Dual pipeline**: jalur UI TKG lama (tkg-workspace) hidup paralel dengan PCKM tanpa
   batas migrasi — risiko dua kebenaran untuk gambar yang sama.
5. **Idempotency resume DEM** tidak memuat prompt/model version (hanya hash PDF+status) —
   ganti prompt/model bisa memakai hasil lama; nama model generation metadata di-hardcode.
6. **activate_snapshot() kompatibilitas bisa mengaktifkan graf kosong** — tidak ada
   pre-activation quality gate.
7. Bug audit retrieval: `selected_seed_ids` mencatat semua node hydrated sbg seed; pruning
   bisa menyisakan edge dengan endpoint terpangkas.

**Perubahan roadmap (mengikat):**
- **Gelombang A ditambah A4 — DEM Evidence Integrity Gate v1** (spec di SPEC_WAVE_A):
  klasifikasi & karantina per-observasi (bukan per-halaman), `coordinate_space` eksplisit,
  invariant completion, laporan integritas per halaman. WAJIB hijau SEBELUM Gelombang B
  menyajikan data ke Command Room (stop-the-line Sol diadopsi dengan urutan: A2→A3→A4→B).
- **B5 diperluas**: perbaiki bug audit retrieval (seed_ids benar, tanpa edge menggantung
  pasca-pruning).
- **B6 diperluas**: kebijakan **fail-closed** untuk pertanyaan berdata-proyek (tool/graph
  gagal → status not_ready eksplisit, BUKAN lanjut dari pengetahuan model); arah target:
  kompilasi klaim+sitasi SEBELUM stream (claim compiler penuh = fase setelah C).
- **C7 diarahkan ke "Reconciliation Decision Ledger"** (generalisasi corrections):
  semua keputusan AI (termasuk merge/keep_separate yang kini dibuang) tercatat sebagai
  proposal; koreksi diterima memicu snapshot baru (model Sol diadopsi sebagai target;
  overlay baca v1 tetap sebagai jembatan pragmatis).
- **C8 mengadopsi kontrak "Measurement Work Package"** (nama & field Sol §2.4F).
- **C10 mengadopsi konsep "Drawing Issue Set"** (revisi = set terkelola, bukan file terbaru).
- **Benchmark**: seed v0 tetap; target proses = anotasi gold manusia (2 anotator +
  adjudikasi) per panduan Sol §4; PLHUT = regression seed, BUKAN bukti generalisasi.

**Keputusan baru Decision Register:**
| # | Keputusan | Status |
|---|---|---|
| D9 | Jalur TKG UI lama = bounded legacy dengan badge, tanpa fitur baru; sunset saat C9 live. Tidak ada dua source-of-truth tanpa label. | FINAL |
| D10 | Data DEM ber-defect integritas TIDAK boleh dikonsumsi jalur jawaban produksi tanpa melewati gate A4 (karantina per-observasi). | FINAL |
| D11 | `occurrence_count` TIDAK di-rename sekarang (menghindari churn skema); semantiknya ("kelompok konteks tercatat", bukan jumlah fisik) DITEGAKKAN di lapisan jawaban B5/B6 + benchmark. Rename dievaluasi pasca-C. | FINAL |
| D12 | Keputusan provider AI apa pun tidak pernah dibuang: dicatat sebagai proposal (ledger C7); auto-apply hanya rule deterministik berisiko rendah atau manusia. | FINAL |
| D13 | PCKM snapshot berlabel **experimental** (bukan "verified") di semua permukaan sampai gate A4 + benchmark gold lulus. | FINAL |
