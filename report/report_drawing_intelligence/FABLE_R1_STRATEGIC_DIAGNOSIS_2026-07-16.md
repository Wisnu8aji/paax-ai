# Fable 5 — Diagnosis Strategis Independen R1 (2026-07-16)

> Entri Ronde 1 Fable untuk debat 3-arah. Berbasis verifikasi kode/data langsung sesi ini
> (commit `e4ab1ae`, test doc-intel 418/5, db 37/1). Ditulis SEBELUM membaca jawaban Sol/Gemini.

## 1. Diagnosis — 10 Pertanyaan Mandat

### 1.1 Kondisi nyata
Pipeline tiga tahap NYATA dan hijau: DEM extraction (Qwen, resume idempoten, fixture 88 hal) →
PCKM synthesis (deterministik + eskalasi DeepSeek live-verified, snapshot 4218 node/12 level bersih) →
storage services/db (migrasi 0009-0012: snapshot atomik, corrections, cache, summary views) →
Command Room tool loop 3 model dengan audit. Sisi hilir quantity/RAB matang terpisah:
core-engine TKG takeoff + compute_volume + AHSP + golden test PLHUT. Yang lemah justru
LAPISAN TENGAH-ATAS: pemahaman spasial belum tuntas, pemahaman intent belum ada,
serving layer (views) belum dikonsumsi, tidak ada pengukuran kualitas jawaban, nol UI,
nol workflow review, jembatan ke quantity tanpa consumer.

### 1.2 Yang sudah benar (jangan dibangun ulang)
- **Evidence-first DEM** immutable per halaman + provenance anchor (`evidence_refs` di mana-mana).
- **Snapshot immutable + aktivasi atomik + supersede** (`build_and_activate_snapshot`,
  repository.py:212) — staleness nol by design; views ikut ditulis pra-aktivasi (urutan konsensus).
- **Aturan Emas tertanam di kode**, bukan cuma prompt: `compile_level_overview` nol aritmatika
  (diverifikasi baris-per-baris), RAB bridge status `requires_human_approval`, TOOL_SYSTEM_SUFFIX
  larangan mengarang + wajib sitasi, semua angka dari core-engine.
- **Disiplin biaya model**: tangga rule → Flash → Pro, key terpisah `DRAWING_INTELLIGENCE_API_KEY`,
  audit rationale+token per keputusan (live-verified 2026-07-16, 5-17 dtk/kandidat).
- **Ambiguitas first-class**: `POSSIBLY_SAME_AS`, `ambiguous_binding_ids` di quality payload —
  7 binding ambigu Lantai 2 TIDAK dipaksa merge.
- **Disiplin skema ganda** Pydantic+Zod satu commit; **fix dedup level berbasis pengukuran nyata**
  (168→12 node, bukan asumsi).

### 1.3 Terbangun tapi belum terhubung
| Komponen | Bukti | Status koneksi |
|---|---|---|
| Summary views | migrasi 0012 + endpoint GET | tersimpan, TIDAK ada jalur query yang membacanya |
| `GraphQueryPlan`/`QueryIntentEnum` | models.py:160 + index.ts:1692, sinkron sejak Phase 1 | tidak pernah disambungkan ke retrieve |
| RAB bridge | `build_rab_bridge_proposal` + endpoint | tidak ada consumer flow/UI |
| Corrections | migrasi 0010 | tidak ada workflow yang memakainya |
| Retrieval metrics | endpoint metrics + rate limit | tidak ada yang membaca/dashboard |
| PR review chain #42-47 | stacked draft 2026-07-15 | tertinggal dari HEAD — proses integrasi putus |

### 1.4 Terlihat selesai tapi belum benar-benar berfungsi
- **Query lokasi Command Room**: "berfungsi" hanya lewat workaround prompt di deskripsi tool
  (query_project_graph.ts:66 — "kirim HANYA nama lantai persis"). Frasa alami gabungan tetap
  gagal struktural. Ini persis "terlalu bergantung pada prompt" yang mandat tolak.
- **Kanonisasi level**: tampak bersih (12 level) tapi berbasis regex judul sheet; kasus semantik
  nyata ("Main Floor" vs "Lantai 1" di fixture) TIDAK terselesaikan — fallback Flash §13.1 belum
  dibangun. Generalisasi ke nomenklatur proyek lain belum teruji (uji lakmus PLHUT-bukan-template).
- **Communities**: connected-component generik; sub-kelompok spasial §12.2 ("level 1, level 2,
  roof, foundation") tidak pernah dibangun — nilai produknya nyaris nol saat ini.
- **Kualitas jawaban retrieve**: node kembali ≠ jawaban benar; wrong-level/false-scope rate
  TIDAK TERUKUR karena benchmark tidak ada.

### 1.5 Masih murni konsep
Intent parser (§16.1); routing 3 kelas di kode; Tahap E selain LEVEL_OVERVIEW; lapisan
measurement rules + engineering assumptions (PCKM→TKG); workflow review manusia; UI workspace;
penanganan revisi gambar (lineage snapshot ada, dampak revisi tidak); hirarki spasial
multi-bangunan/zona/ruang; program metrik.

### 1.6 Keputusan lama yang MASIH VALID
Pemisahan dua lapisan DEM/PCKM; snapshot immutable + corrections overlay; pembagian model §13
(Flash default, Pro eskalasi, risk score) — ekonominya terbukti live; routing 3 kelas
(SINTESIS_3ARAH §3.3); "canonicalization dulu, views sesudah"; tool-calling in-process +
feature flag (PLAN Fase 0 — sudah dieksekusi nyata); semua batas Aturan Emas.

### 1.7 Keputusan yang PERLU DIREVISI
1. **Workaround prompt di tool description** → ganti kontrak tool terstruktur §17.2
   (param `discipline`/`node_types`/`level` terpisah) + intent parser. Hapus instruksi hack.
2. **Istilah "JSON 1/JSON 2"** → penamaan lapisan profesional (lihat §2 di bawah) + kontrak eksplisit.
3. **Communities generik** → diturunkan jadi artefak internal; peran produknya diambil summary views.
4. **PR chain #42-47** → supersede dengan satu PR segar dari `feat/pckm-phase3-synthesis`
   (keputusan proses, butuh konfirmasi owner — bukan blocker teknis).
5. **Regex level PLHUT-spesifik** → kamus alias per-proyek (config) + fallback semantik AI,
   demi generalisasi.

### 1.8 AKAR MASALAH UTAMA (satu kalimat)
**Pengembangan retrieval-first tanpa menuntaskan lapisan pemahaman (identitas spasial kanonis +
intent query) dan tanpa harness evaluasi** — semua gejala (salah lantai, 0 hasil, workaround
prompt, count meragukan) bermuara ke sini. Sistem sudah bisa MENGEKSTRAK dan MENYIMPAN,
belum sepenuhnya MEMAHAMI RUANG dan MEMAHAMI PERTANYAAN, dan tidak bisa MEMBUKTIKAN benar.

### 1.9 Risiko jika diteruskan tanpa perubahan
1. Jawaban salah-scope yang terdengar yakin → kepercayaan runtuh; lebih buruk: scope salah
   mengalir ke RAB.
2. Kerapuhan prompt-workaround: tiap model/frasa baru mematahkannya.
3. Celah Aturan Emas: tanpa routing 3 kelas ditegakkan di kode, model bisa tergoda
   mengagregasi dimensi jadi "volume".
4. Regresi senyap — tidak ada benchmark, tidak ada yang tahu kualitas naik/turun.
5. Biaya per pertanyaan tetap tinggi (graph mentah token-berat; views tak dipakai).
6. Divergensi worktree/PR → kekacauan merge, potensi kerja hilang.
7. Gagal generalisasi di proyek kedua (pola PLHUT tertanam).

### 1.10 Peluang terbesar
1. Views+intent parser = lompatan produk kasat mata: jawaban terstruktur bersitasi, murah, cepat.
2. Quality metadata → antrian review terprioritas → benih UI workspace sekaligus pembangun trust.
3. Lineage snapshot → analisis dampak revisi ("apa berubah dari rev A ke B, apa efeknya") —
   fitur engineering bernilai tinggi yang kompetitor jarang punya.
4. Gerbang quantity readiness → RAB bertahap: mulai dari BOQ berbasis count (fakta aman),
   volume menyusul via engine.
5. Benchmark = CI regresi + bukti akurasi untuk investor/user.

## 2. Arsitektur Target (usulan penamaan profesional)

```
L0 Source Registry     : dokumen, halaman, revisi, hash (immutable)
L1 Drawing Evidence    : DEM per halaman (immutable, anchor provenance)      [dulu "JSON 1"]
L2 Project Knowledge   : PCKM — entitas kanonis, hirarki spasial, relasi,    [dulu "JSON 2"]
                         status confirmed/ambiguous/conflicting, snapshot-versioned,
                         corrections sebagai OVERLAY audit-able (bukan mutasi)
L3 Serving / Answer    : summary views per snapshot + intent parser (GraphQueryPlan)
                         + routing 3 kelas + answer contract (sitasi, data_status, keyakinan)
L4 Quantity Bridge     : proposal RAB bridge + measurement rules + assumption registry
                         + approval manusia → input TKG → core-engine → BOQ/RAB
Lintas lapisan         : Provenance & Audit; Human Review (exception queue);
                         Observability (metrik); RBAC
```
Aliran revisi: dokumen revisi baru → DEM baru → snapshot PCKM baru (lineage ke lama) →
views baru → diff impact report. Corrections manusia hidup di overlay L2, ikut dibawa
maju saat snapshot baru dibangun (re-apply policy eksplisit, konflik ditandai).

## 3. Roadmap Prioritas R1 (≤10, berurut, dependensi eksplisit)

1. **Benchmark harness + acceptance suite** di fixture 88 hal (SINTESIS langkah 1 yang TERLEWATI —
   kerjakan PERTAMA; menggerbangi semua langkah lain). Termasuk pertanyaan-yang-wajib-ditolak.
2. **Tuntaskan kanonisasi level**: fallback DeepSeek Flash untuk kasus semantik + status ambiguous
   + audit + kamus alias per-proyek. (dep: 1 sebagai pengukur)
3. **Intent parser + validator GraphQueryPlan** (rule dulu, Flash fallback, allowlist). (dep: 2)
4. **Retrieve v2 plan-driven**: LIST_FILTER→views; NUMERIC_STORED_FACT→graph+evidence scoped;
   CALCULATION_REQUIRED→tolak+arahkan bridge. BFS lama jadi fallback. (dep: 3)
5. **Tool Command Room v2** kontrak §17.2 (param terstruktur, hapus workaround) + answer
   contract §18. (dep: 4)
6. **Ukur & iterasi**: jalankan benchmark, publikasikan metrik, perbaiki top failure. (dep: 5)
7. **Review workflow v1**: exception queue dari quality metadata + corrections round-trip
   (approve/reject/merge/split) — API dulu, UI minimal. (dep: 4; paralel dgn 5-6)
8. **Quantity readiness v1**: kriteria kesiapan per element_type + consumer flow RAB bridge +
   assumption registry skeleton + approval; BOQ count-based dulu. (dep: 6,7)
9. **UI workspace v1** (paralel setelah 4): pohon struktur proyek dari views, daftar elemen +
   drill-down evidence, panel konflik/ambiguitas. Konsumsi HANYA endpoint L3.
10. **Desain penanganan revisi + laporan dampak lineage** (desain sekarang, bangun setelah 1-8 stabil).

**TIDAK dibangun sekarang**: hirarki multi-bangunan penuh, kanonisasi zona/ruang penuh,
service baru, vector/embedding search, penggantian communities, deploy Postgres produksi,
gambar proyek lain (instruksi owner: nanti).

## 4. Desain Benchmark (Workstream 9)

- **Ground truth**: 50-80 pasang Q/A dilabel manual dari fixture 88 hal, JSON versioned di tests/.
- **Kategori**: daftar-per-lokasi; count per level/disiplin; fakta angka tertulis (unit+evidence);
  referensi lintas sheet; konflik; kejujuran missing-data; kejujuran ambiguitas; larangan
  kalkulasi (volume/biaya → wajib menolak & mengarahkan); konsistensi jawaban berulang;
  kelengkapan provenance.
- **Metrik**: answer accuracy, wrong-level rate, false-scope rate, wrong-discipline rate,
  evidence coverage, zero-result rate, unresolved ambiguity surfaced, calculation-integrity
  (0 pelanggaran), konsistensi, biaya token & latensi per query.
- **Wujud**: pytest runner menghasilkan scorecard JSON+MD (artefak repo), dipakai sebagai CI regresi.

## 4b. BUKTI KUANTITATIF — Probe Baseline 14 Query (dijalankan 2026-07-16, endpoint retrieve nyata + snapshot fixture 88 hal nyata)

Distribusi 12 "level" kanonis + in-degree LOCATED_ON aktual:
`Lantai 1`=37, `Lantai 2`=31, `±0.000`=7, `Elevasi ±0.000`=2, `Lantai Atap P +16.20`=2,
`3000`=2, `-1.300`=1, `+7.600`=1, `+3.500`=1, `+4.400`=1, `Atap`=1, `2000`=1.

**Temuan yang mengoreksi klaim "12 level bersih":** level sungguhan hanya 2-3 (Lantai 1,
Lantai 2, Atap). Sisanya pseudo-level (elevasi ±0.000, angka mentah 3000/2000) — dan
**16-19 dari 87 occurrence (±18%) menempel ke pseudo-level**, sehingga TIDAK TERLIHAT oleh
query level yang benar. `Atap` vs `Lantai Atap P +16.20` juga belum disatukan.
Dedup kemarin membersihkan node yatim, TIDAK menyelesaikan identitas kanonis.

Hasil probe per pola query:
| Query | Hasil | Makna |
|---|---|---|
| `Lantai 2` / `Lantai 1` | 60 / 70 node, tipe benar (occ+type+level), ~130ms | jalur workaround bekerja |
| `struktur lantai 2` | **0 node** | frasa alami gagal total |
| `kolom lantai 1` | **65 node TAPI tipe salah semua** (sheet:22, dimension:12, grid_axis:10) | false-scope yang tampak meyakinkan — LEBIH BERBAHAYA dari 0 |
| `Main Floor` | 0 node | alias semantik level tak dikenal (kasus DEM nyata) |
| `kolom` / `pintu` generik | 81/89 node, 79 drawing_reference noise, **16.5 DETIK** | mahal + tidak berguna |
| `K1` / `P2` / `STK2` | 74/75/63 node campur (occ benar + ref bleed STK1/STK3) | kode persis oke tapi BFS bocor tetangga |
| `berapa volume beton lantai 2` | `status=success, nodes=0` | TIDAK ada penolakan/pengarahan kalkulasi — cuma kosong menyesatkan |
| `Lantai 3` / kontrol negatif | 0 jujur | kejujuran nol-hasil OK |

Bukti tambahan: nama ruang di-Inggris-kan DEM ("Hajj Registration Room", "Restroom",
"Meeting room" berdampingan dengan "Ruang Kelas") → kanonisasi semantik dibutuhkan juga
untuk SPACE, bukan hanya level.

**Mekanisme akar masalah terkunci di kode** (`cross_sheet_resolver.py:327-339`,
`_source_context`): level konteks occurrence = (1) regex judul sheet; kalau gagal →
(2) `_nearest_value(source_bbox, levels)` = fakta kategori "levels" TERDEKAT SECARA GEOMETRI
dari label elemen. Kategori DEM "levels" heterogen (nama lantai + datum elevasi ±0.000 +
angka salah-klasifikasi 3000/2000) tanpa sub-tipe → elemen menempel ke teks elevasi terdekat.
Catatan penting: `±0.000` secara fisik ≈ datum Lantai 1 — 7 occurrence itu kemungkinan besar
MILIK Lantai 1 tapi tak terlihat oleh query "Lantai 2"/"Lantai 1". Ini persis tugas
"level grouping" yang §13.1 plan kanonik tetapkan untuk DeepSeek Flash — belum dibangun.

**Revisi akar masalah (dipertajam):** kanonisasi spasial belum menyelesaikan (a) sub-tipe
kandidat level (floor-name vs elevation-datum vs angka), (b) pemetaan elevasi→lantai per
proyek, (c) alias lintas bahasa level & ruang. Intent parser + views tetap wajib, tapi TANPA
kanonisasi yang benar mereka menyajikan duplikasi lebih cepat — urutan konsensus SINTESIS
terkonfirmasi data.

## 4c. Pembacaan Insinyur Sipil Senior atas 12 "Level" (target kebenaran kanonisasi)

Dibaca dengan konvensi gambar kerja Indonesia (peil, FFL, denah vs potongan):

| Node level saat ini | Pembacaan engineer | Target kanonis |
|---|---|---|
| `Lantai 1` (37 occ) | FFL ±0.00 | **Lantai 1** |
| `±0.000` (7) + `Elevasi ±0.000` (2) | datum peil = FFL Lantai 1 | gabung → **Lantai 1** (elevasi jadi atribut) |
| `Lantai 2` (31 occ) | lantai atas | **Lantai 2** |
| `+3.500`, `+4.400` (1+1) | FFL L2 / ring balk — tinggi tingkat tipikal 3.5-4.4m | kemungkinan **Lantai 2**, tandai `ambiguous` bila bukti tipis |
| `+7.600` (1) | di atas L2 → pelat/ring atap | **Atap** (ambiguous) |
| `Atap` (1) + `Lantai Atap P +16.20` (2) | atap utama vs peil +16.20 (menara/tower?) — BISA dua level fisik berbeda | JANGAN paksa merge — review manusia |
| `-1.300` (1) | di bawah grade → substruktur (pondasi/sloof) | strata **Substruktur**, bukan "lantai" |
| `3000`, `2000` (2+1) | 3000mm ≈ tinggi tingkat — ini TEKS DIMENSI salah kategori, bukan level | TOLAK sebagai identitas level |

Kesimpulan engineer: bangunan ini = 3-4 strata spasial (Substruktur, Lantai 1, Lantai 2,
Atap[+menara?]) dengan elevasi sebagai ATRIBUT datum — bukan 12 level. Kanonisasi harus
konvergen ke sini, dengan flag ambigu di tempat bukti tipis, TIDAK pernah memaksa.

Aturan domain tambahan untuk spec: (1) POTONGAN/TAMPAK adalah gambar lintas-level — elemen
di dalamnya TIDAK BOLEH diikat level dari "teks elevasi terdekat"; (2) DENAH mengikat SEMUA
elemennya ke satu level judulnya; (3) schedule (kusen/pintu) adalah sumber cross-check jumlah
vs denah — mesin deteksi konflik alami; (4) grid axis adalah sistem lokasi sekunder yang
melengkapi level/ruang. Pertanyaan benchmark wajib: "balok lintel LT-2 (hal. 47, gambar
struktur) terikat ke Lantai 2?" — probe menunjukkan disiplin struktur nyaris absen dari
occurrence L2 (architecture=5/mep=26) — kecurigaan binding struktur bocor ke pseudo-level.

## 4d. AKAR MASALAH #2 (baru, berbukti penuh): SELURUH DISIPLIN STRUKTUR GUGUR DI GERBANG OCCURRENCE

Probe distribusi occurrence per level×disiplin (snapshot fixture nyata):
- **structure element_type = 79; structure element_occurrence = 1** (hanya "KOLOM PENDEK @ Atap").
- 78/79 tipe struktur (K1, K1A, KOLOM K2/K3, B1/B2/B3, G3, sloof, dst) TIDAK PUNYA occurrence.
- 207 entri missing_information "requires (level,) spatial context before occurrence synthesis".
- Distribusi occurrence yang ADA: Lantai 1 = arch:10 + mep:27; Lantai 2 = arch:5 + mep:26 —
  MEP dominan karena gambar MEP melabeli ruangan; struktur hilang total.

Mekanisme (cross_sheet_resolver.py:681-688): occurrence synthesis MEWAJIBKAN level DAN space;
sumber tanpa space di-skip (bila type punya konteks di tempat lain) → tidak pernah jadi occurrence.

**Verifikasi data mentah fixture:**
- hal.43 "DENAH KOLOM LANTAI 2": element_labels=17, grids=10, levels=1, **spaces=0**
- hal.48 "DENAH BALOK LINTEL LT-2": element_labels=4, grids=10, **spaces=0**
- hal.51 "TABEL BALOK LANTAI 1 & SLOOF": element_labels=9, materials=27, tables=1, **spaces=0**

**Pembacaan insinyur sipil:** denah struktur TIDAK PERNAH melabeli nama ruang — kolom/balok
dilokasikan lewat GRID AXIS (As A-F / 1-6). Mewajibkan "space" untuk occurrence struktur adalah
asumsi arsitektur-sentris yang salah secara domain. Data grid-nya ADA (10 grid/halaman) tapi
tidak dipakai sebagai locator. Tambahan: halaman "TABEL BALOK" adalah SCHEDULE — sifatnya
definisional (DEFINED_BY: dimensi/material per tipe), bukan occurrence berlokasi; butuh
kebijakan binding berbeda.

**Implikasi:** "berapa kolom di Lantai 2" mustahil dijawab benar oleh retrieval/views secanggih
apa pun — datanya tidak pernah masuk graf. Kebijakan occurrence harus per-disiplin:
struktur = level WAJIB + grid sebagai locator (space opsional); arsitektur/MEP = level+space;
schedule = jalur definisional. Ini melengkapi akar masalah #1 (pseudo-level) dan #3
(intent/serving belum ada). Ketiganya berlapis: perbaiki #2 dulu di synthesis, #1 di
kanonisasi, #3 di query path — urutannya saling mengunci.

## 5. Risiko & Solusi Dangkal yang Ditolak
- Menambah regex/sinonim lagi ke keyword search → menyembuhkan satu contoh, memperdalam utang.
- Menyempurnakan prompt tool → kerapuhan permanen.
- Membangun views/fitur baru sebelum kanonisasi tuntas → mempercepat akses ke duplikasi.
- LLM diberi akses "jawab bebas" atas graph mentah → pelanggaran traceability + Aturan Emas.
- Menyatakan selesai karena unit test hijau → hijau ≠ akurat; hanya benchmark yang membuktikan.
