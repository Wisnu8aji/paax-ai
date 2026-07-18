> **STATUS: HISTORICAL/SUPERSEDED** -- lihat [DI_SOURCE_OF_TRUTH.md](file:///G:/paax-ai-main/docs/plans/drawing%20intelligence/DI_SOURCE_OF_TRUTH.md) untuk kondisi terkini

# PAAX — Rencana Besar: Drawing Intelligence AI-Vision-First (2026-07-11)

> Ditulis Claude, 2026-07-11, atas instruksi owner. **Menggantikan arah lanjutan**
> dari `PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md` dan
> `PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md` (owner hapus keduanya
> dari working tree sesi ini — riwayat lengkap tetap ada di git, bisa dibaca
> lagi lewat `git show b161842:docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md`
> kalau perlu dirujuk). Dokumen ini mensintesis **2 konsep owner**
> (`docs/plans/drawing intelligence.txt`) dengan **analisis kode PAAX nyata**
> — bukan menyalin blueprint generik mentah-mentah. Living roadmap, update
> status di sini, jangan tulis ulang dari nol.

---

## 0. Kenapa dokumen ini ada

Owner minta pivot: **berhenti menomorsatukan OCR+regex+grammar (TKG)**,
**pindah ke AI-vision-first** untuk drawing intelligence. Alasan eksplisit:
jalur regex/grammar sudah berminggu-minggu dikerjakan (Fase 0-S, Fase U-Z),
GERBANG-2 belum tutup, cakupan PLHUT nyata baru ~36%, dan grammar-nya rawan
over-fit ke pola PLHUT (risiko yang sudah diakui sendiri di
`plhut-fixture-not-template.md`). Owner ingin AI yang bisa "melihat" gambar
kerja setara Claude/GPT — ekstraksi jadi data, data itu dipakai berkali-kali
tanpa scan ulang boros token, dan tersambung ke Command Room + RAB + jadwal.

Owner sudah menyiapkan **2 konsep** dari diskusi lain (`docs/plans/drawing
intelligence.txt`) sebagai bahan. Dokumen ini menganalisis keduanya secara
kritis terhadap kode PAAX yang sebenarnya (§0.2), lalu menyusun rencana yang
bisa dieksekusi di repo ini — bukan blueprint umum yang berasumsi mulai dari
nol.

**Temuan paling penting dari analisis kode** (alasan pivot ini masuk akal
secara teknis, bukan cuma preferensi): jalur vision yang **sudah ada**
(`services/document-intelligence/app/perception/assemble.py:337-345`) hari
ini **hanya aktif untuk sheet yang terbukti hasil scan/foto**
(`is_raster_sheet()` di `ingest/raster_detector.py` — sheet dianggap raster
kalau span teks vektor di bawah 3). Untuk PDF vector-native (kasus paling
umum, termasuk PLHUT), **vision tidak pernah dipanggil sama sekali** — 100%
ekstraksi lewat PyMuPDF vektor + regex/grammar. Jadi pivot ini bukan
"menggeser AI dari peran kecil ke peran besar", tapi **"memberi AI peran
pertama kalinya di jalur utama"** untuk mayoritas gambar kerja nyata.

---

## 0.1 Batasan yang TIDAK BERUBAH (Aturan Emas, `CLAUDE.md` §1)

Paling penting di seluruh dokumen ini. Permintaan owner ("AI harus paham
bentuk bangunan") **tidak boleh** ditafsirkan jadi "AI menghitung angka":

- **AI/vision-LLM BOLEH**: membaca piksel gambar, mengklasifikasi jenis
  halaman, mengenali simbol & teks, menghubungkan elemen ke spesifikasi
  lintas halaman, mengusulkan struktur (tipe/dimensi/alamat grid),
  menjelaskan hasil ke user. Semua ini = **strukturisasi**, bukan aritmetika.
- **AI/vision-LLM TIDAK PERNAH**: menghitung volume/HSP/subtotal RAB.
  Volume tetap wajib lewat `services/core-engine` (`app/tkg/takeoff.py`,
  `app/rab/rab.py`). Elemen tanpa rumus takeoff = masuk daftar "belum bisa
  dihitung otomatis", bukan diberi angka tebakan.
- **Confidence rendah wajib terlihat** (`needs_review`/`readiness_status`,
  §2) — tidak pernah disamakan dengan nilai pasti di RAB akhir, selalu bisa
  diverifikasi/diubah user sebelum commit.
- **Audit trail wajib** (§1.1 `CLAUDE.md`): setiap usulan vision-LLM
  mencatat model, versi prompt, input, output, alasan.

`plhut-fixture-not-template.md` tetap berlaku: PLHUT = kunci uji, bukan
sumber logika. Uji lakmus tiap tahap: *"kalau owner kasih gambar proyek lain
besok, apakah kode ini tetap relevan?"*

---

## 0.2 Analisis 2 konsep owner vs kode nyata PAAX

### Konsep 1 — Arsitektur konseptual (5 "mesin" + JSON-1/JSON-2 + status elemen)

**Isi ringkas**: Vision AI (konteks halaman) + OCR (teks+bbox) + OpenCV
(garis/grid deterministik) + Spatial Parser (menghubungkan OCR↔geometry) +
LLM Reasoning (Lucent/Solace, normalisasi & penyambungan lintas halaman).
Dua lapis data: **JSON-1** (bukti mentah per halaman, berbasis posisi piksel)
dan **JSON-2** (model bangunan, berbasis objek & relasi). Setiap elemen
punya status (`detected→classified→spatially_located→linked_to_spec→
counted→qto_candidate→qto_ready→manual_review_required`).

**Kekuatan (dipakai)**:
- Pemisahan JSON-1/bukti-mentah vs JSON-2/model-dipahami **sudah cocok**
  dengan bentuk skema yang ada di PAAX (lihat §2) — bukan konsep asing.
- Status per-elemen jauh lebih ekspresif daripada `needs_review: bool`
  tunggal yang dipakai sekarang di `TakeoffItem`/`DrawingWorkItem`.
- Split **Lucent = cepat/index, Solace = berat/audit** untuk Command Room
  cocok **persis** dengan dua model alias yang sudah nyata dipakai
  (`modelAlias: z.enum(["lucent", "solace"])` di
  `apps/web/src/app/api/command-room/chat/route.ts:37`).
- Contoh format jawaban Command Room (§7 konsep, cantumkan grid+sumber
  halaman+confidence+"perlu verifikasi manual") adalah pola UX yang bagus,
  layak jadi standar jawaban.

**Perlu disesuaikan**: "OpenCV / Geometry Engine" diasumsikan membaca
**gambar raster** (PNG hasil render). PAAX sudah punya
`app/perception/vector/grid_geometry.py`, `symbol_geometry.py`,
`wall_geometry.py` yang membaca **vektor PDF asli** — sudah terverifikasi
presisi milimeter-persis lewat nilai analitik. Ini lebih presisi daripada
OpenCV-di-atas-raster untuk PDF CAD-native. **Jangan diganti** — digabung
sebagai jalur cross-check (§6), bukan dilupakan.

### Konsep 2 — Blueprint eksekusi (pipeline + biaya + fase kalender)

**Isi ringkas**: PyMuPDF render PDF→PNG 300 DPI → loop per halaman → kirim
ke Qwen3 VL / Gemini → JSON-1 per halaman → gabungkan → post-processing
Python (grid-binding jarak-terdekat, counting, table-join) → JSON-2 →
Command Room/RAB. Tabel biaya per tahap, roadmap 4 fase kalender (1 minggu +
2 minggu + 2 bulan + 1 bulan), tabel edge case.

**Kekuatan (dipakai)**:
- Pipeline teknis konkret & masuk akal: loop per halaman (bukan kirim semua
  sekaligus), `response_format: json_object` + `try/except` untuk cegah
  crash saat model menghasilkan JSON rusak, table-join kode↔spesifikasi.
- Tabel edge case (skala NTS tak terbaca, simbol tak dikenal, halusinasi
  JSON, cost overflow→wajib caching) — semuanya selaras pola
  graceful-degrade yang sudah ada di codebase (`NullAiAssistClient`, dst).
- Prinsip "post-processing/binding = kode Python, bukan AI" selaras
  Aturan Emas (§0.1).

**Perlu disesuaikan besar** — dokumen ini ditulis generik ("greenfield"),
tidak tahu **sebagian besar infrastrukturnya sudah ada** di PAAX:

| Diasumsikan Konsep 2 | Kenyataan di PAAX |
| --- | --- |
| Bangun rasterisasi PDF→PNG dari nol | **Sudah ada**: `assemble.py:342` — `page.get_pixmap(dpi=200).save(png_path)` (saat ini digerbang di belakang `is_raster_sheet()`, tinggal dilepas gerbangnya) |
| Daftar akun baru: DashScope (Qwen), Google AI Studio, DeepSeek Official | NVIDIA NIM, Gemini, DeepSeek/OpenRouter **sudah berkunci API** di `.env.example`. Qwen/MiniMax bisa lewat OpenRouter yang **sudah terdeteksi** (`isOpenRouterKey()` di `command-room/chat/route.ts:72`) — bukan integrasi vendor baru |
| Bangun job-queue/async dari nol | **Sudah ada**: `POST /drawings/analyze/start` + polling status (`drawing_routes.py`) |
| Bangun skema JSON-1/JSON-2 dari nol | **Sudah ada bentuknya**: `TextSpan` (models.py) ≈ JSON-1, `ConsolidatedExtraction`/`ElementRegistryEntry` (consolidated_models.py) ≈ JSON-2 |
| Fase kalender 1mgu+2mgu+2bln+1bln, tim 1-2 backend engineer + prompt engineer | Repo ini dikerjakan **solo owner + Claude/Codex per-sesi** (Fase 0-H yang jauh lebih besar selesai **1 sesi**, 2026-07-05) — estimasi kalender tim tidak relevan |
| Biaya ekstraksi $0.18–0.50/proyek (88 halaman) | Estimasi internal PAAX sendiri (`docs/strategy/PAAX_Analisis_Strategis_Companion.md`) bilang Rp 3.500–8.000/**gambar** dan eksplisit "wajib dikalibrasi ulang dgn tarif aktual" — **dua sumber sudah beda jauh**, tanda jelas perlu benchmark nyata, bukan dipercaya begitu saja |

### Tabel sintesis keputusan

| Elemen konsep owner | Keputusan rencana ini |
| --- | --- |
| JSON-1 / JSON-2 dua lapis | **Dipakai** sbg model mental, dipetakan ke skema **existing** (§2) — bukan skema paralel baru (menghindari kelas bug "dua skema TKG divergen" yang sudah pernah terjadi di repo ini) |
| Status per-elemen (`detected→qto_ready`) | **Dipakai**, jadi field baru `readiness_status`, melengkapi bukan mengganti `needs_review` |
| Lucent=cepat / Solace=berat | **Dipakai persis** (§5) |
| OpenCV pada raster PNG | **Diprioritaskan ulang** — vector-geometry yang sudah presisi tetap jalur utama untuk PDF vector-native; vision/raster jadi fallback untuk sheet hasil scan (perluasan `RULE-EXT-30` yang sudah ada) |
| Akun baru Qwen/Gemini/DeepSeek terpisah | **Mulai dari yang sudah terpasang** (NVIDIA, Gemini, OpenRouter) |
| Fase kalender | **Diganti** Tahap+kriteria-selesai (gerbang), konsisten pola dokumen lain repo ini |
| Tabel biaya $0.18–0.50/proyek | **Dipakai sbg hipotesis awal**, wajib divalidasi ke PLHUT nyata sebelum dipercaya |
| Tabel edge case | **Dipakai penuh** (§7) |

---

## 1. Peta Tahap

| Tahap | Isi | Status |
| --- | --- | --- |
| 1 | Fondasi: perluas skema (JSON-1/JSON-2 → field existing) + provider abstraction terima gambar | ⚪ belum mulai |
| 2 | Triase halaman murah (semua halaman, model termurah, thumbnail) | ⚪ belum mulai |
| 3 | Ekstraksi JSON-1 penuh (hanya halaman "berisi", resolusi tinggi) | ⚪ belum mulai |
| 4 | Konsolidasi JSON-2 (deterministik Python, cross-check vektor) | ⚪ belum mulai |
| 5 | Command Room: grounding + tool-calling granular + eskalasi | ⚪ belum mulai |
| 6 | Sambungan RAB & Schedule (bridging ke takeoff existing) | ⚪ belum mulai |
| 7 | Validasi generalisasi (fixture kedua) + nasib pipeline lama | ⚪ belum mulai |

Legenda: 🟢 selesai · 🟡 sebagian · ⚪ belum mulai. **GERBANG-V** (Vision)
= Tahap 1–6 tertutup DAN Tahap 7 (validasi generalisasi) lolos.

---

## 2. Arsitektur data: dua lapisan, dipetakan ke skema yang sudah ada

Prinsip: **jangan bikin skema paralel baru** (§2 Aturan Emas — Zod/Pydantic
satu sumber kebenaran; pelajaran repo ini sendiri soal skema TKG yang pernah
divergen). JSON-1/JSON-2 dipakai sebagai **nama konseptual** untuk
menjelaskan, tapi keduanya **memperluas** tipe yang sudah ada.

### JSON-1 (bukti mentah per halaman) → perluasan `TextSpan` + tipe baru `VisionDetection`

`TextSpan` (`app/perception/models.py:18`) sudah punya `span_id, page, text,
bbox, confidence, method` — `method` sudah punya nilai `"vector"`/`"ocr"`,
tinggal ditambah `"vision"`. Untuk deteksi **simbol visual** (bukan teks),
perlu tipe baru paralel — `VisionDetection`:

```json
{
  "page_number": 42,
  "sheet_meta": { "judul": "DENAH KOLOM LANTAI 1", "skala": "1:100" },
  "text_detections": [
    { "text": "K1A", "role": "kode_elemen", "bbox_rel": [0.32,0.41,0.35,0.44], "confidence": 0.93 }
  ],
  "symbol_detections": [
    { "symbol_type": "kolom", "nearby_text": "K1A", "bbox_rel": [...], "confidence": 0.80 }
  ],
  "grid_hint": { "x_axes": ["A","B","C","D","E","F"], "y_axes": ["1","2","3","4"] },
  "model": "nvidia/nemotron-parse", "prompt_version": "v1", "extracted_at": "..."
}
```

### JSON-2 (model bangunan dipahami) → perluasan `ConsolidatedExtraction`/`ElementRegistryEntry`

`ElementRegistryEntry` (`consolidated_models.py:179`) dan
`ConsolidatedExtraction` (`consolidated_models.py:208`) **sudah** berbentuk
registry elemen lintas-halaman. Tambahan field:

```json
{
  "element_id": "COL-L1-K1A-001",
  "kategori": "kolom",
  "type_code": "K1A",
  "level": "Lantai 1",
  "grid_location": "B3",
  "dimensi": { "b_mm": 400, "h_mm": 400 },
  "citation": { "placement_page": 42, "spec_page": 50, "bbox_rel": [...] },
  "readiness_status": "qto_ready",
  "confidence": 0.82,
  "audit": { "model": "nvidia/nemotron-3-nano-omni", "prompt_version": "v1", "reviewed": false, "reviewed_by": null }
}
```

`readiness_status` enum (dari Konsep 1 §8, diadopsi): `detected →
classified → spatially_located → linked_to_spec → counted → qto_candidate →
qto_ready | manual_review_required`. Ini **melengkapi**, bukan mengganti,
`needs_review`/`Assumption` yang sudah ada di `TakeoffItem`/`DrawingWorkItem`.

### Building Envelope — ringkasan tingkat-bangunan (baru, murah dibaca)

Cikal bakal sudah ada (`consolidated.building_dimensions`, dipakai
`analyze_drawing.ts:92`). Diperluas jadi objek murah-dibaca-berkali-kali
yang langsung menjawab "AI paham bentuk bangunan seperti apa" tanpa
traverse semua elemen: dimensi keseluruhan, jumlah lantai, elevasi per
lantai, bentang utama, tipe atap.

### Relasi ke `TkgDocument` kanonik — TIDAK BERUBAH

`ConsolidatedExtraction` tetap diterjemahkan ke `TkgDocument` kanonik lewat
jalur yang **sudah ada** (`apps/web/src/lib/ai/document-intelligence-tkg.ts`)
sebelum masuk `takeoff_tkg()`/`compute_rab()`. Tidak ada logika hitung baru
di mana pun — hanya sumber pengisian `ConsolidatedExtraction` yang berubah
(vision-LLM, bukan cuma regex).

---

## 3. Pipeline teknis per Tahap

### Tahap 1 — Fondasi: skema + provider abstraction

- Perluas `consolidated_models.py` + mirror Zod (`packages/schemas`) dengan
  field §2 — **diubah bersama dalam commit yang sama** (Aturan Emas §2).
- Tambah `VisionDetection` paralel `TextSpan`.
- Perluas `AiAssistClient` Protocol (`ai_assist/client.py:56`) dengan varian
  yang menerima gambar (mis. method baru `generate_json_from_image`) — pola
  sama: `.from_env()`, degradasi anggun ke `None`, tidak pernah crash
  pipeline utama.
- **Kriteria selesai**: skema baru lolos test kontrak Pydantic↔Zod paritas.
  Belum ada logika baru yang berjalan di tahap ini — murni fondasi.

### Tahap 2 — Triase halaman murah (semua halaman)

- Reuse rasterisasi yang **sudah ada** (`assemble.py:342` pola
  `page.get_pixmap(dpi=...).save()`), tapi **lepas gerbang** `is_raster_sheet()`
  — jalan untuk **semua** halaman (bukan cuma yang terbukti hasil scan), DPI
  rendah khusus tahap ini (~100–120, cukup untuk klasifikasi kasar, bukan
  baca dimensi).
- Panggil model vision **termurah**. Sudah ada infrastrukturnya:
  `infer_fast_visual()` di `nvidia_vision_extractor.py:249`
  (`NVIDIA_FAST_MODEL = nemotron-nano-12b-v2-vl`) — saat ini hasilnya
  **dibuang** (komentar kode sendiri: *"best-effort... discarded, the
  extracted text path below remains source of truth"*). Tahap ini membuat
  hasil itu **dipakai** sebagai filter utama, bukan dibuang.
- Output per halaman: jenis halaman (cover/denah/detail/tabel/potongan/
  situasi/dll) + flag "kemungkinan ada item takeoff atau tidak".
- **Kriteria selesai**: 88 halaman PLHUT nyata + minimal 1 set halaman
  sintetis lain diklasifikasi, dibandingkan ke label manusia, akurasi
  terukur dan dicatat jujur (bukan "kelihatan masuk akal").

### Tahap 3 — Ekstraksi JSON-1 penuh (hanya halaman "berisi")

- Rasterisasi ulang **hanya** halaman yang lolos triase Tahap 2, DPI lebih
  tinggi (≥200–300 — ikuti saran Konsep 2 untuk teks kecil seperti `Ø12mm`;
  DPI 200 yang dipakai jalur OCR-fallback sekarang mungkin kurang untuk
  vision-LLM baca detail).
- Prompt + schema kontrak **per jenis halaman** (denah ≠ tabel-tipe ≠
  potongan — jangan satu prompt generik untuk semua, ini disebutkan sebagai
  risiko kualitas di analisis §0.2). Reuse pola `response_schema` ketat yang
  sudah dipakai `GeminiAiAssistClient` (`ai_assist/client.py:97-104`);
  tambahkan pola setara untuk provider lain.
- **Wajib** (poin edge-case Konsep 2, sudah selaras pola repo): guard
  format JSON ketat (`response_format`/`responseSchema`) + `try/except` di
  level per-halaman — 1 halaman gagal parse **tidak boleh** menjatuhkan
  seluruh job. Perlu status job PARTIAL (perluasan `AnalyzeJobStatus`).
- Output: JSON-1 per halaman (§2), disimpan dulu sebelum konsolidasi
  (resumable — kalau job terhenti di tengah, halaman yang sudah sukses
  tidak diproses ulang).
- **Kriteria selesai**: dijalankan ke 88 halaman PLHUT nyata, tercatat
  berapa halaman sukses/gagal/butuh retry, **biaya & waktu nyata diukur**
  (bukan estimasi dari dokumen manapun).

### Tahap 4 — Konsolidasi JSON-2 (deterministik Python, BUKAN AI)

- Grid-binding: jarak bbox→titik-potong-grid terdekat (pola Konsep 2 §3).
  **Kalau PDF vector-native tersedia**, `grid_geometry.py`/
  `symbol_geometry.py`/`wall_geometry.py` yang sudah presisi-mm-teruji
  dipanggil **juga**, dua sumber (vision vs vektor) **disilang-cek**; beda
  signifikan → `readiness_status = manual_review_required` (lebih kuat
  daripada percaya satu sumber saja).
- Counting/aggregation + table-join kode↔spesifikasi lintas halaman — reuse
  `consolidate.py`/`work_items.py` yang sudah ada, hanya sumber datanya yang
  berubah.
- **Bawa perbaikan noise Fase U lama**: `consolidate.py::_grid_conflicts`
  harus tetap bandingkan posisi **relatif** (bukan absolut) dan filter teks
  metadata administratif — bug ini independen dari sumber ekstraksi, akan
  muncul lagi kalau tidak dibawa serta.
- **Kriteria selesai**: `ElementRegistryEntry` hasil PLHUT dibandingkan ke
  transkrip tangan (`core-engine/tests/test_plhut_golden.py`) sebagai
  pembanding akurasi terukur.

### Tahap 5 — Command Room: grounding + tool-calling + eskalasi

- **Tutup gap nyata**: `command-room/chat/route.ts` hari ini **nol
  grounding** (murni passthrough ke DeepSeek). Tambah context pack (pola
  `project-context.ts`, `MAX_PACK_CHARS`) khusus `BuildingEnvelope` +
  ringkasan sheet — selalu jalan, murah.
- Tool-calling granular: perkaya `services/ai-orchestrator/src/tools/
  registry.ts` dengan `query_drawing_element(kode)`,
  `query_drawing_sheet(sheet_id)` — **atau** (keputusan terbuka, §10) port
  langsung ke format tool-calling OpenAI-compatible di
  `command-room/chat/route.ts` kalau ingin hindari 2 service tool-calling
  paralel.
- **Lucent = cepat** (baca index/`BuildingEnvelope`/ringkasan JSON-2), tanpa
  memproses seluruh halaman tiap pertanyaan. **Solace = berat** (baca
  JSON-1/JSON-2 lebih luas, audit relasi, deteksi konflik) — persis usul
  Konsep 1 §6, dipetakan ke `modelAlias` yang sudah ada.
- Format jawaban **wajib** sertakan sumber halaman + confidence + status
  verifikasi (pola contoh Konsep 1 §7) — bukan fakta telanjang.
- Eskalasi vision on-demand: hanya kalau grounding+tool-call tidak punya
  jawabannya, panggil vision ulang untuk **1 halaman spesifik**, hasil
  **di-cache balik** ke JSON-1/JSON-2 (bukan sekali pakai).
- **Kriteria selesai**: pertanyaan tentang elemen spesifik dijawab benar
  dengan citation halaman yang bisa diverifikasi manusia, tanpa vision
  dipanggil ulang untuk pertanyaan yang jawabannya sudah ada di cache.

### Tahap 6 — Sambungan RAB & Schedule (Aturan Emas tetap)

- JSON-2 → `TkgDocument` kanonik (jalur sudah ada) → `takeoff_tkg()`/
  `compute_rab()` — **tidak ada logika hitung baru**.
- Bridging yang sudah ada (X1/X1B: `bridging_tanah.py` dkk) tetap dipakai,
  tinggal disuplai dari JSON-2 berbasis vision, bukan diganti.
- Elemen dengan `readiness_status != qto_ready` **tidak** masuk RAB otomatis
  — masuk antrian review manusia (`triage-panel.tsx` yang sudah ada).
- Schedule: item pekerjaan hasil ekstraksi tetap masuk `build_schedule_plan()`
  yang sama — sumber & cakupan item pekerjaannya saja yang jadi lebih umum.
- **Kriteria selesai**: RAB dari PLHUT (jalur vision) dibandingkan ke
  `ALFA.xlsx` (golden RAB manual) sebagai tolok ukur akhir — deviasi diukur
  & dilaporkan jujur, bukan diklaim "berhasil" tanpa angka.

### Tahap 7 — Validasi generalisasi + nasib pipeline lama

- **Fixture kedua wajib** (bukan PLHUT) sesuai `plhut-fixture-not-template.md`
  — sebelum pendekatan ini diklaim "general".
- Pipeline regex/grammar lama (`zone_classifier.py` dkk) **tidak dihapus** —
  turun status jadi validator opsional/fallback offline (API vision down
  atau tanpa kuota), didokumentasikan sebagai itu, kodenya tetap ada.
- Ukur ulang coverage/akurasi/biaya vision-first vs regex-lama di PLHUT yang
  sama, laporan jujur (pola Fase Z lama).

---

## 4. Model & provider routing

| Tugas | Kandidat | Provider sudah terpasang? | Catatan |
| --- | --- | --- | --- |
| Triase halaman (Tahap 2) | NVIDIA `nemotron-nano-12b-v2-vl` | ✅ (`NVIDIA_DRAWING_FAST_*`) | Termurah/tercepat, sudah ada kodenya, tinggal dipakai hasilnya |
| Ekstraksi detail (Tahap 3) | NVIDIA `nemotron-parse`, Gemini 2.5 Flash | ✅ keduanya | Mulai dari sini dulu sebelum tambah vendor baru |
| Ekstraksi detail (kandidat baru dari owner) | Qwen-VL, MiniMax-VL | ⚠️ belum, tapi jalur OpenRouter **sudah terdeteksi** (`isOpenRouterKey()`) | Jalan pintas tanpa integrasi vendor baru dari nol — tinggal ganti model id |
| Binding/konsolidasi (Tahap 4) | — (deterministik Python) | — | Bukan tugas AI sama sekali |
| Konflik lintas halaman butuh judgment | Gemini 2.5 Flash / NVIDIA Nemotron reasoning (teks-only) | ✅ (`ai_assist/client.py`) | Reuse infrastruktur `AiAssistClient` yang sudah matang |
| Command Room cepat (Lucent) | DeepSeek (via `command-room/chat/route.ts`) | ✅ | Tidak berubah, hanya ditambah grounding |
| Command Room berat (Solace) | DeepSeek (via `command-room/chat/route.ts`) | ✅ | Tidak berubah, hanya ditambah grounding+tools |

**Jujur soal batasan**: harga/kualitas Qwen-VL/MiniMax-VL terbaru **tidak**
saya ketahui presisi (cutoff pengetahuan Januari 2026, sekarang Juli 2026).
Angka biaya di Konsep 2 ($0.18–0.50/proyek) dan di
`PAAX_Analisis_Strategis_Companion.md` (Rp 3.500–8.000/gambar) **sudah
saling beda jauh** — jangan commit ke satu model dari asumsi mana pun.
Tahap 3 wajib menghasilkan angka nyata dari PLHUT sebagai pembanding, baru
keputusan model final diambil.

---

## 5. Contoh format jawaban Command Room (diadopsi dari Konsep 1 §7)

```text
User: "Di mana posisi kolom K1A lantai 1?"

Kolom K1A lantai 1 terdeteksi pada grid B3, C3, D3, dan E3.
Sumber posisi: Denah Kolom Lantai 1, halaman 42.
Sumber spesifikasi: Tabel Kolom, halaman 50.
Confidence posisi: 82%.
Beberapa titik masih memerlukan verifikasi manual karena simbol
berdekatan dengan garis grid.
```

Prinsip: AI tidak pernah menjawab dari tebakan — selalu dari `JSON-2`
(`ElementRegistryEntry`) + `citation` + `confidence`. Kalau data belum
`qto_ready`, jawaban **eksplisit** bilang begitu, bukan menyamarkannya.

---

## 6. Nasib pipeline lama

| Komponen lama | Nasib |
| --- | --- |
| `vector/grid_geometry.py`, `symbol_geometry.py`, `wall_geometry.py` | **Dipertahankan penuh** — jalur cross-check presisi untuk PDF vector-native (Tahap 4) |
| `zone_classifier.py`, `binding.py`, grammar regex | **Turun pangkat** jadi validator/fallback opsional, bukan gate wajib (dibalik dari filosofi Fase V lama: "LLM fallback hanya kalau rule-based gagal" → sekarang vision primary, rule-based cross-check) |
| `ai_assist/*.py` (8 modul assist per kategori) | **Infrastrukturnya di-reuse** (pola `AiAssistClient`, graceful degrade) untuk client vision baru; tujuan sempit "fallback saat regex gagal" berkurang relevansinya begitu vision jadi primary |
| `consolidate.py`, `work_items.py` | **Dipertahankan**, sumber datanya saja berubah |
| Async job (`/drawings/analyze/start`+poll) | **Dipertahankan & diperluas** untuk pipeline bertingkat (Tahap 2-3) |
| `tkgRepository`, `TkgDocument` kanonik | **Dipertahankan sepenuhnya** — target akhir tidak berubah |

---

## 7. Edge case & kegagalan (dari Konsep 2, diadopsi penuh)

| Kasus | Solusi |
| --- | --- |
| Skala tidak terbaca (NTS) | `scale_numeric: null` + `unit_assumption` di JSON-1; JSON-2 tandai `manual_review_required` |
| Simbol tidak dikenali | JSON-1 `symbol_class: "unclear_symbol"`; JSON-2 lewati dari counting (tidak dihitung, bukan ditebak) |
| Model vision menghasilkan JSON rusak | `response_format`/`responseSchema` ketat wajib aktif + `try/except` per halaman, job status PARTIAL bukan crash total |
| Biaya membengkak | Caching wajib (`file_hash` dedupe, JSON-1 tersimpan permanen), triase berjenjang (Tahap 2 sebelum Tahap 3), rate limit |
| Vision vs vektor beda hasil (baru, dari analisis §0.2) | `readiness_status = manual_review_required`, kedua nilai dicatat di `citation`, bukan salah satu ditimpa diam-diam |
| Halaman gagal diproses total (timeout/error API) | Ditandai jujur di job status, tidak menjatuhkan halaman lain, bisa di-retry per-halaman |

---

## 8. Risiko jujur yang perlu diperhatikan

- **Presisi angka** — vision-LLM cenderung salah baca digit pada dimensi
  kecil/rapat dibanding parsing vektor. Makanya Tahap 4 wajib silang-cek,
  bukan percaya satu sumber.
- **Halusinasi JSON terstruktur** pada gambar kompleks tetap risiko nyata —
  `readiness_status`/`confidence` wajib dipertahankan ketat, paling gampang
  terlewat justru saat hasil vision "kelihatan makin pintar".
- **Biaya scan awal untuk 50–100 halaman tetap bukan nol** — piramida
  Tahap 2→3 menekan, tidak menghilangkan. Tahap 3 wajib menghasilkan angka
  nyata sebelum estimasi manapun dipercaya untuk perencanaan produk/harga.
- **Command Room sedang churn aktif** (`docs/ai-map/STATE_CURRENT.md`: "3
  rewrite besar dalam 4 hari, belum stabil", 2 implementasi NVIDIA/DeepSeek
  paralel belum disatukan) — Tahap 5 menambah grounding+tools di tengah
  churn ini, perlu hati-hati agar tidak menambah satu cabang divergen lagi.
- **Liability** — sesuai `PAAX_Analisis_Strategis_Companion.md`: RAB hasil
  pipeline manapun (vision atau regex) tetap "titik awal terverifikasi,
  bukan hasil final" — disclaimer & UI verifikasi tetap wajib, tidak
  berkurang urgensinya hanya karena sumbernya AI vision yang "kelihatan
  lebih pintar".

---

## 9. Yang perlu diputuskan owner sebelum eksekusi dimulai

1. **Urutan kerja** — Tahap 1-4 (pipeline ekstraksi) dulu, atau Tahap 5
   (tutup gap grounding Command Room, pakai TKG lama dulu sbg data
   sementara) dulu, atau digabung satu rencana bertahap?
2. **Tool-calling Command Room** — perkaya `ai-orchestrator` yang sudah ada
   (2 service terpisah, format Gemini function-calling) atau port langsung
   ke `command-room/chat/route.ts` (1 service, format OpenAI-compatible,
   tapi kerja ulang)?
3. **Model pilot pertama untuk Tahap 3** — mulai dari NVIDIA yang API
   key-nya sudah ada (paling cepat dicoba), atau benchmark NVIDIA vs Gemini
   Flash vs Qwen/MiniMax via OpenRouter sekaligus sebelum commit?
4. **Cakupan Tahap 7 fixture kedua** — gambar proyek lain yang mana yang
   dipakai sebagai uji lakmus generalisasi (di luar PLHUT)?

Rencana ini siap dieksekusi begitu owner memutuskan urutan §9 — tidak ada
kode yang diubah untuk menulis dokumen ini.
