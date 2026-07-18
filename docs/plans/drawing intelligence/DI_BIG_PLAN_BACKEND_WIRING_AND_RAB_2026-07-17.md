# Big Plan — Menuntaskan Drawing Intelligence & Menyambung ke RAB

**Tanggal:** 2026-07-17
**Status:** RENCANA — belum ada eksekusi. Perlu persetujuan pemilik sebelum dijalankan.
**Basis:** `DI_FRONTEND_BACKEND_GAP_AUDIT_2026-07-17.md` (audit lengkap dengan sitasi
file:line), `PAAX_DRAWING_INTELLIGENCE_MASTER_PLAN_2026-07-16.md` (arsitektur L0-L4,
Decision Register D1-D13 yang tetap mengikat), `FINAL_READINESS_REPORT_2026-07-17.md`
(status backend PCKM per hari ini — 14/14 benchmark, live-tested Command Room).

> Dokumen ini TIDAK mengulang isi audit gap secara detail — baca audit itu dulu untuk
> bukti per-temuan. Dokumen ini adalah **urutan kerja dan keputusan arsitektur** untuk
> menutup semua kesenjangan itu, plus perpanjangan ke RAB yang belum pernah direncanakan
> secara eksplisit sebelumnya.

---

## 1. Kerangka Berpikir: Kenapa Urutannya Begini

Sebelum daftar tugas, tiga keputusan arsitektur yang membentuk seluruh urutan kerja di
bawah — ini bagian yang paling penting untuk dipahami, bukan sekadar daftar centang.

### 1.1 Fondasi dulu, dekorasi belakangan

Ada satu lubang tunggal yang membuat **semua** fitur lain (canvas gambar asli, sheet
gallery nyata, review queue yang bisa diaksi, quantity readiness yang benar, RAB bridge
yang berujung) tidak mungkin berfungsi tanpa manual intervention: **tidak ada jalur HTTP
yang memicu `synthesize_project_graph()` setelah upload selesai** (audit §2.3.1). Semua
16 fitur lain yang teridentifikasi di audit bisa dikerjakan paralel SETELAH lubang ini
ditutup, tapi tidak ada satu pun yang bisa diverifikasi ujung-ke-ujung SEBELUM lubang ini
ditutup — karena semuanya butuh snapshot project-graph yang aktif. Karena itu **Fase 0**
di bawah adalah gerbang tunggal, bukan sekadar item prioritas tinggi.

### 1.2 V1 bukan dibuang — logikanya dipindah, UI-nya yang diganti

Owner menyebut "front end drawing intelligence saya akan baru" — tapi audit menemukan
V1 (`components/drawing-intelligence/*.tsx`) sudah punya logika fetch yang BENAR terhadap
backend nyata (loading state, error state, cancellation guard, 4 endpoint terhubung).
Membangun ulang logika itu dari nol di V2 akan membuang pekerjaan yang sudah teruji dan
berisiko menemukan ulang bug yang sudah pernah dipecahkan. **Rekomendasi: port pola
fetch V1 ke dalam komponen V2** (bentuk visual V2 dipertahankan — itu yang owner mau
diselesaikan — tapi logika datanya meniru pola `drawing-intelligence-workspace.tsx`
yang sudah terbukti benar), lalu **hapus V1 sepenuhnya** begitu V2 mengambil alih semua
kapabilitasnya (`fetchSummaryViews`, `retrieveProjectGraph`). Ini penting untuk menutup
pelanggaran-diam-diam terhadap D9 yang diidentifikasi di audit §1 — tidak boleh ada dua
implementasi UI PCKM hidup berdampingan tanpa label, dan solusi paling bersih adalah
satu implementasi menang (V2, karena itu yang di-routing dan yang owner ingin selesaikan)
dan yang lain dipensiunkan resmi, bukan dibiarkan membusuk sebagai kode mati.

### 1.3 "Selesai" untuk Drawing Intelligence berarti connector, bukan fitur baru

Owner secara implisit membingkai ini sebagai "sambungkan front end ke back end" — dan
audit mengonfirmasi itu framing yang tepat: **hampir seluruh backend yang dibutuhkan
sudah ada dan sudah teruji.** Pekerjaan terbesar bukan membangun kapabilitas baru
(kecuali 3 hal spesifik: pemicu sintesis, image serving, list-sheets — lihat §2), tapi
menghubungkan 30 file frontend V2 yang sudah dibangun matang secara visual ke endpoint
yang sudah ada. Ini mengubah estimasi besar-kecil: bagian tersulit bukan "membangun AI
baru," tapi "disiplin engineering" — memetakan setiap state mock ke fetch nyata dengan
benar, satu per satu, tanpa merusak UX yang sudah bagus secara visual.

---

## 2. FASE 0 — Gerbang Fondasi (WAJIB selesai sebelum fase lain diverifikasi ujung-ke-ujung)

Tiga potongan backend baru, semuanya kecil-menengah karena fungsi inti yang dibutuhkan
sudah ada — pekerjaan sebenarnya adalah *mengekspos* dan *merangkai*, bukan membangun
dari nol.

### 2.1 Auto-sintesis pasca-ekstraksi DEM (KRITIS, paling dulu)

**Masalah:** `process_document()` (`document_loop.py`) berhenti di
`update_run_status(run_id, "dem_complete")` — tidak pernah memanggil
`synthesize_project_graph()` atau POST ke `/project-graph/snapshots`.

**Rancangan:**
1. Setelah `update_run_status` menandai run `dem_complete`, tambahkan langkah baru:
   ambil semua `DemPage.result` (JSON per-halaman, sudah tersimpan) untuk run itu,
   validasi jadi `DrawingEvidenceSheet[]` (skema yang sama dipakai `synthesize_project_graph`
   hari ini di test/skrip — TIDAK ada perubahan skema), panggil
   `synthesize_project_graph(sheets)`, lalu POST hasilnya ke
   `POST /projects/{project_id}/project-graph/snapshots` (endpoint SUDAH ADA, tidak
   berubah).
2. Tandai status run baru: `"synthesis_in_progress"` → `"synthesis_complete"` atau
   `"synthesis_failed"` (field status yang sudah ada di `DemRun`, tinggal tambah nilai
   literal baru — tidak perlu migrasi skema).
3. Ini harus berjalan sebagai `BackgroundTasks` lanjutan (pola yang sama dgn ekstraksi
   itu sendiri), BUKAN blocking request — proyek 88 halaman butuh waktu nyata untuk
   sintesis.
4. **Keputusan desain yang perlu diambil pemilik:** apakah sintesis berjalan OTOMATIS
   tiap kali semua halaman selesai (simplest, tapi berarti tiap upload langsung
   menggantikan snapshot aktif), atau perlu tombol eksplisit "Build Project Graph" di UI
   (lebih terkendali, cocok dengan filosofi "approval manusia" yang konsisten di seluruh
   sistem — lihat D12 Master Plan soal keputusan AI tidak pernah otomatis diterapkan
   tanpa jejak). **Rekomendasi: tombol eksplisit** — konsisten dengan pola approval yang
   sudah dipakai di RAB Bridge dan Corrections, dan mencegah race condition kalau user
   mengunggah beberapa file berurutan sebelum siap mensintesis semuanya sekaligus.
5. Tambahkan endpoint status baru atau perluas `GET /drawings/dem/{run_id}/status` dengan
   field `synthesis_status` supaya frontend bisa polling fase kedua ini juga (progress
   bar "Membangun Graf Proyek..." setelah "Mengekstrak Halaman...").

**Test acuan manual (nilai dihitung sebelum implementasi, sesuai CLAUDE.md §3):**
sintesis fixture 88 halaman via jalur HTTP baru ini harus menghasilkan snapshot IDENTIK
(node count, edge count) dengan yang dihasilkan `serve_db_with_fixture.py` hari ini — itu
anchor regresi paling langsung tersedia.

### 2.2 Ekspos rendering gambar sheet lewat HTTP

**Masalah:** `render_page_to_png()` sudah ada dan benar, dipakai internal, tidak pernah
diekspos.

**Rancangan:**
1. `GET /drawings/dem/{run_id}/pages/{page_index}/image` — panggil fungsi yang sudah
   ada, kembalikan `StreamingResponse`/`FileResponse` dengan `media_type="image/png"`.
2. Pertimbangkan caching (halaman PDF tidak berubah — hasil render bisa disimpan sekali
   ke disk/objek storage dan disajikan ulang, bukan di-render tiap request).
3. **Keputusan skala:** untuk MVP, render-on-demand dari file PDF asli (yang harus tetap
   disimpan — cek §2.3, saat ini `POST /upload` menyimpan ke disk tapi TIDAK terhubung
   ke `DemRun`; `POST /drawings/dem/start` menerima bytes tapi **tidak jelas dari audit
   apakah PDF aslinya disimpan permanen atau hanya diproses lalu dibuang** — INI PERLU
   DIVERIFIKASI SEBELUM implementasi, karena render gambar butuh akses balik ke file PDF
   asli. Jika PDF tidak disimpan, ini jadi prasyarat tambahan: simpan PDF asli
   (path/object storage) ter-link ke `DemRun.id`).

### 2.3 Endpoint "daftar sheet untuk proyek X"

**Masalah:** Tidak ada agregasi lintas-run. `file-sheet-navigator.tsx`/`sheet-gallery.tsx`
butuh ini untuk populate saat load.

**Rancangan:**
1. `GET /projects/{project_id}/dem/sheets` (services/db, atau proxy dari
   document-intelligence) — join `DemRun` (filter `project_id`) dengan `DemPage`,
   kembalikan daftar sheet dengan metadata cukup untuk gallery: `run_id, page_index,
   file_name, status, sheet_title (dari result JSON jika sudah ada), thumbnail_url
   (link ke endpoint §2.2)`.
2. Ini murni query baru terhadap tabel yang sudah ada — tidak ada perubahan skema.

**Keluaran Fase 0:** rantai lengkap Upload → Ekstraksi → (tombol/otomatis) Sintesis →
Snapshot Aktif → Semua endpoint L3/L4 yang sudah ada jadi bisa dipakai ujung-ke-ujung
dari upload nyata, BUKAN cuma dari skrip fixture. Ini satu-satunya cara memverifikasi
sisa fase di bawah dengan jujur.

---

## 3. FASE 1 — Wiring Frontend V2: Data Inti (paralel setelah Fase 0)

Urutan berdasarkan §4 audit (ranking dampak), disesuaikan supaya tiap langkah bisa
diverifikasi mandiri.

### 3.1 Sheets & Files (navigator/, gallery/)
- Ganti `state.sheets` dari `MOCK_SHEETS` → fetch `GET /projects/{id}/dem/sheets` (§2.3).
- Ganti `state.files` dari `MOCK_FILE` → derivasi dari daftar `DemRun` per proyek (butuh
  endpoint list-runs-per-proyek — cek apakah `GET /dem/runs` filter by project_id sudah
  ada; audit tidak eksplisit menyebut ini, PERLU DIVERIFIKASI SEBELUM implementasi).
- Upload modal: ganti `startUploadSimulation()` → panggil `POST /drawings/dem/start`
  sungguhan dengan `File` asli yang sudah ditangkap drag-drop, lalu poll status (§2.1).
  **Hapus tombol "Use sample drawing set"** dari UI produksi (audit menandainya sbg
  affordance data-palsu yang tidak pantas ada di production) — atau pindahkan ke balik
  flag dev-only jika masih berguna untuk demo internal.

### 3.2 Canvas — gambar asli
- `sheet-plan-svg.tsx` diganti/ditambah lapisan `<img>` yang memuat dari endpoint §2.2,
  dgn overlay SVG existing (bbox elemen, grid, dimensi) digambar DI ATAS gambar asli
  sebagai lapisan transparan — bukan menggantikan seluruhnya. Ini mempertahankan
  investasi visual yang sudah ada (grid detection, room shading) sambil menambah
  substansi nyata di baliknya.
- Elemen bbox: ganti `MOCK_ELEMENTS` → hasil `retrieveProjectGraph`/`summary-views`
  filtered per sheet (perlu mapping node graph → koordinat bbox; cek apakah properti
  bbox tersimpan di `properties_json` node — kemungkinan besar ya, berdasarkan integrity
  gate A4 yang sudah menegakkan kontrak koordinat 0-1).

### 3.3 Elements & Quantities (inspector/, dock/)
- `state.elements` ← `retrieveProjectGraph` per sheet aktif, atau `summary-views` untuk
  ringkasan per-level (`element_type_index`, `discipline_counts` — shape sudah persis
  cocok dengan `DETECTED_SUMMARY` mock yang perlu diganti).
- `state.quantities` ← `GET .../quantity-readiness` (`readiness.items`, yang sudah
  di-fetch oleh `use-backend-sync.ts` TAPI dibuang — audit §3.1 menemukan ini persis).
  Perbaikan minimal: dispatch `readiness.items` ke `state.quantities` alih-alih hanya
  memakai `summary` untuk status bar. Perlu mapping `QuantityReadinessItem` →
  `QuantityItem` (shape berbeda — readiness fokus pada kesiapan per element_type, bukan
  baris kuantitas per-WBS; **ini keputusan desain**: apakah dock "Quantities" tab
  menampilkan readiness apa adanya, atau butuh agregasi tambahan yang belum ada di
  backend sama sekali — lihat §5 soal Measurement Work Package).

### 3.4 Review Queue — jadikan bisa diaksi
- Sudah setengah jalan (`replace-review-queue` bekerja). Perbaiki `sheetId`/`elementId`
  hardcode `null` → isi dari `target_id`/`target_type` item (audit §2.2.3: backend sudah
  siap, tinggal frontend kirim `POST .../corrections` dgn field yang benar alih-alih
  mencari `correction_id` yang memang tidak ada).
- Tombol "Resolve" di `quantity-dock.tsx`: panggil `resolveCorrection()` (fungsi client
  SUDAH ADA di `drawing-intelligence-api.ts`, TIDAK PERNAH dipanggil V2 — audit §3.3).

**Keluaran Fase 1:** workspace V2 menampilkan data proyek nyata untuk 4 dari 6 mode
(files, sheets, review, quantities-baca). "Analyze" dan "Handoff" masih perlu Fase 2.

---

## 4. FASE 2 — Wiring Frontend V2: Alur Kerja (setelah Fase 1 data-inti stabil)

### 4.1 Analyze mode — jujurkan atau hapus simulasinya
Ini butuh keputusan pemilik: apakah "Analyze" mode di V2 dimaksudkan sebagai **kontrol
untuk memicu ekstraksi+sintesis Fase 0** (mengubahnya jadi UI nyata untuk tombol "Build
Project Graph" yang direkomendasikan di §2.1.4), atau tetap konsep terpisah untuk
sesuatu yang belum dibangun sama sekali (mis. re-run klasifikasi dgn parameter
berbeda). **Rekomendasi: opsi pertama** — `AnalysisConfig` (scope/mode/outputs) yang
sudah didesain dgn matang di `di-types.ts` cocok dipetakan jadi parameter permintaan
sintesis (mis. `scope` membatasi disiplin mana yang diproses), dan `processing-overlay.tsx`
diubah dari progress-bar palsu jadi polling nyata terhadap `synthesis_status` (§2.1.5).

### 4.2 Handoff → RAB Bridge (lihat juga §5, ini titik temu dengan RAB)
- `handoff-confirm-modal.tsx` `confirmSend()`: ganti dispatch lokal murni → panggil
  `POST /projects/{id}/project-graph/rab-bridge` dgn `node_ids` dari item quantities yang
  berstatus verified, tampilkan `proposal_id` yang dikembalikan, lalu (approval oleh PM)
  panggil `.../rab-bridge/{proposal_id}/resolve`.
- **Ini TIDAK cukup untuk "selesai."** Lihat §5 — approval hari ini tidak berujung ke
  RAB. Bagian ini perlu dikerjakan BERSAMAAN dgn backend baru di §5, bukan berdiri
  sendiri, kalau tujuannya benar-benar "quantities terverifikasi sampai ke RAB draft."

### 4.3 Ask PAAX → nyata via Command Room tool
- Alih-alih membangun jalur LLM baru, **pakai ulang infrastruktur Command Room yang
  sudah live** (`query_project_graph` tool, sudah diperbaiki & diverifikasi hari ini).
  `ask-paax.tsx` bisa memanggil endpoint chat yang sama dgn `projectId` context, atau —
  lebih ringan — panggil `POST .../project-graph/retrieve` langsung dan format
  jawabannya sendiri tanpa lapisan chat LLM penuh (lebih murah, lebih cepat, tidak butuh
  model routing). **Rekomendasi: mulai dgn retrieve langsung** (murah, deterministik,
  konsisten Aturan Emas), evaluasi kebutuhan LLM penuh setelah dipakai nyata.

---

## 5. FASE 3 — Menutup Jembatan ke RAB (perpanjangan yang owner minta dipikirkan)

Ini bagian yang paling belum dipikirkan sebelumnya — Master Plan menyebut L4 "Quantity
Bridge" sbg lapisan arsitektur tapi tidak pernah merinci langkah konkretnya sampai
`RABLineInput`. Audit menemukan persis di mana jembatan itu berhenti (`RabBridgeProposal`
disetujui tapi tidak pernah jadi baris RAB). Berikut rancangan menutupnya, plus dua hal
yang menurut analisis ini genuinely belum owner pikirkan.

### 5.1 Rantai lengkap yang harus ada (belum ada hari ini)

```
Drawing Intelligence (evidence node + properties)
  → RabBridgeProposal (SUDAH ADA — evidence packaging, no calc)
  → [approved oleh PM — SUDAH ADA]
  → ??? LUBANG BARU YANG BELUM PERNAH DIRANCANG ???
  → RabDraftLine[] { ahsp_code, volume, duration_days }  (target akhir, shape SUDAH ADA di rab-repository.ts)
  → compute_rab() Core Engine (SUDAH ADA, teruji)
```

**Yang perlu dibangun untuk mengisi lubang itu:**

1. **Pemetaan node graph → kandidat AHSP.** `RabBridgeProposal.items` punya
   `{node_id, name, discipline, properties, evidence_ids}` — TIDAK ADA `ahsp_code`.
   Perlu langkah baru: cocokkan `name`/`discipline` node terhadap katalog AHSP (2.542
   item, `G:\paax-data` — sudah dikenal dari memory proyek), hasilkan
   `ahsp_code` + tandai `ahsp_suggested: true` (field ini SUDAH ADA di `RabDraftLine`,
   dipakai fitur Smart RAB Import lama — pola pencocokan token-overlap yang sudah ada di
   sana bisa dipakai ulang, bukan dibangun dari nol).
2. **Sumber `volume`.** Ini titik paling sensitif secara Aturan Emas. `RabBridgeProposal`
   sengaja TIDAK pernah menghitung volume (by design — evidence-only). Volume HARUS
   datang dari salah satu dari dua sumber, dan sistem harus tegas membedakan:
   - **Dimensi tertulis di gambar** (sudah ada di `stored_measurement_facts` — nilai +
     satuan + evidence_refs, hasil ekstraksi asli, BUKAN kalkulasi) → jika lengkap,
     volume bisa dihitung DETERMINISTIK oleh Core Engine dari dimensi itu (mis. panjang ×
     lebar × tinggi kolom = volume beton — ini kalkulasi geometri sederhana yang SAH
     dilakukan Core Engine, bukan LLM, sesuai Aturan Emas §1: "engine deterministik...
     boleh menghitung").
   - **Asumsi manusia** (`quantity_assumptions`, tabel yang sudah ada tapi nol endpoint —
     lihat gap #5 audit) — untuk kasus dimensi tidak tertulis. Endpoint CRUD untuk tabel
     ini WAJIB dibangun sebagai bagian fase ini, bukan ditunda lagi, karena tanpanya
     tidak ada cara mengisi volume utk item `blocked`/`needs_review`.
3. **Endpoint baru: "materialisasi proposal jadi RAB draft."**
   `POST /projects/{id}/project-graph/rab-bridge/{proposal_id}/materialize` (nama
   sementara) — dipanggil SETELAH `resolve` (approved) DAN setelah `ahsp_code`+`volume`
   terisi (via §5.1.1-2) untuk tiap item, menulis baris ke `ProjectRabDraft.lines` proyek
   itu (lewat endpoint RAB draft yang sudah ada di `services/db` — `GET/POST
   /projects/{id}/rab`, dikonfirmasi ada dari audit graphify awal sesi ini,
   `main.py:95-117`... perlu verifikasi ulang shape write-nya saat implementasi).
4. **UI baru:** panel "Review sebelum kirim ke RAB" — menampilkan tiap item proposal dgn
   AHSP tersarankan (bisa diganti manual), volume (tertulis-di-gambar vs perlu-asumsi
   dibedakan visual dgn jelas), sebelum tombol final "Kirim ke RAB Draft." Ini idealnya
   MENGGANTIKAN `handoff-confirm-modal.tsx` yang sekarang murni kosmetik — desain
   ulang minimal berbasis kerangka yang sudah ada, bukan halaman baru dari nol.

### 5.2 Hal yang genuinely belum dipikirkan — direkomendasikan untuk dipertimbangkan

1. **Unifikasi dgn Smart RAB Import.** Audit menemukan `SmartRabImport`
   (`components/rab/smart-rab-import.tsx`) adalah jalur import RAB YANG SAMA SEKALI
   TERPISAH dari RAB Bridge — keduanya sekarang akan menjadi dua cara berbeda utk
   mengisi `ProjectRabDraft.lines`, dgn UX dan mekanisme kepercayaan yang berbeda. Owner
   perlu memutuskan: apakah keduanya tetap terpisah selamanya (Smart Import = dari
   file Excel/PDF eksternal, RAB Bridge = dari Drawing Intelligence internal — masuk
   akal sbg dua sumber berbeda), atau salah satu dipensiunkan setelah yang lain matang.
   **Rekomendasi: biarkan terpisah tapi LABELI keduanya dgn jelas di UI** ("Impor dari
   file" vs "Impor dari Drawing Intelligence") — supaya user tidak bingung kapan pakai
   yang mana, dan supaya keduanya tidak diam-diam saling menimpa baris yang sama tanpa
   penjelasan (risiko `RabDraftLine.id` collision atau duplikasi baris kalau user pakai
   dua jalur untuk elemen yang sama).

2. **Revisi/Lineage saat drawing diunggah ulang.** Master Plan §5 roadmap item 10
   ("Desain revisi/lineage impact") secara eksplisit ditandai "desain sekarang, bangun
   setelah stabil" — tapi Fase 3 di atas mengasumsikan satu snapshot aktif per proyek.
   Pertanyaan yang belum dijawab: kalau user mengunggah revisi gambar SETELAH sudah ada
   RAB draft yang terisi dari RAB Bridge sebelumnya, apa yang terjadi pada baris RAB yang
   sudah terlanjur dikirim? Apakah ditandai "berbasis snapshot lama, perlu re-review,"
   atau dibiarkan begitu saja (risiko RAB jadi tidak sinkron dgn gambar terbaru tanpa
   peringatan)? Ini BUKAN untuk dikerjakan sekarang (sesuai keputusan Master Plan), tapi
   perlu ditandai eksplisit sbg risiko yang akan muncul begitu Fase 3 di atas berjalan
   di proyek nyata dgn revisi berkelanjutan — owner perlu tahu ini sblm produksi, bukan
   ditemukan saat insiden.

3. **Kapan "quantity readiness = ready" sungguhan cukup utk dikirim ke RAB?** Kriteria
   `ready` hari ini (`build_quantity_readiness`) mengecek: ada occurrence confirmed, ada
   dimensi tertulis, tidak ada conflict terbuka, level binding terkonfirmasi. Ini KRITERIA
   KUALITAS DATA GRAF, bukan kriteria "cukup baik utk estimasi biaya real." Contoh celah:
   satu kolom confirmed dgn dimensi tertulis TAPI hanya muncul di 1 dari 6 lantai yang
   seharusnya identik — apakah itu benar-benar `ready`, atau butuh sanity-check tambahan
   ("apakah jumlah occurrence masuk akal dibanding total lantai proyek")? Ini pertanyaan
   desain yang perlu melibatkan penilaian senior civil engineer (sesuai standing rule
   sesi ini), bukan cuma logika boolean — direkomendasikan jadi bagian eksplisit
   spesifikasi Fase 3, bukan diasumsikan otomatis benar dari kriteria yang ada sekarang.

4. **Audit trail "angka RAB ini berasal dari mana" harus mengutip evidence gambar, bukan
   cuma AHSP code.** Konsisten dgn Aturan Emas dan §18 answer contract Master Plan
   (sitasi wajib) — setiap baris RAB yang lahir dari RAB Bridge idealnya membawa
   `evidence_ids`/`sheet_id`/`page_index` sbg metadata tertaut (bukan cuma `ahsp_code`
   generik), supaya PM yang mereview RAB bisa klik-balik ke halaman gambar yang jadi
   dasar volume itu. `RabDraftLine` hari ini TIDAK punya field utk ini — perlu
   ditambahkan (perubahan skema kecil, Zod+Pydantic bersamaan sesuai CLAUDE.md §2) kalau
   traceability ini dianggap penting (sangat direkomendasikan, mengingat seluruh nilai
   PCKM adalah "setiap klaim harus bersitasi").

---

## 6. Urutan Eksekusi yang Direkomendasikan

```
FASE 0 (gerbang, sekuensial, wajib dulu)
  0.1 Auto-sintesis pasca-DEM (+ keputusan tombol vs otomatis)
  0.2 Ekspos image render
  0.3 Endpoint list-sheets-per-proyek
  → Verifikasi: upload PDF asli via UI → snapshot aktif → bisa ditanya Command Room,
    TANPA campur tangan skrip manual sama sekali.

FASE 1 (paralel setelah Fase 0, per-area independen)
  1.1 Sheets & Files wiring         1.3 Elements & Quantities wiring
  1.2 Canvas gambar asli            1.4 Review Queue actionable

FASE 2 (setelah Fase 1 stabil, butuh keputusan desain dari owner dulu)
  2.1 Analyze mode → kontrol sintesis nyata (perlu keputusan §4.1)
  2.2 Handoff → RAB Bridge call (silang dgn Fase 3)
  2.3 Ask PAAX → retrieve nyata

FASE 3 (RAB Bridge penuh, bisa mulai paralel dgn Fase 2 akhir)
  3.1 quantity_assumptions CRUD (backend)
  3.2 Pemetaan node→AHSP (pakai ulang logika Smart Import)
  3.3 Endpoint materialize proposal→RAB draft
  3.4 UI review-sebelum-kirim
  3.5 KEPUTUSAN OWNER: unifikasi/label dua jalur import RAB (§5.2.1)

SETELAH SEMUA FASE:
  - Hapus V1 sepenuhnya (kode + test yang mereferensikannya)
  - Lepas label EXPERIMENTAL (D13) — HANYA setelah diuji di proyek nyata kedua
    (bukan cuma PLHUT), sesuai syarat yang sudah tercatat di Final Readiness Report
  - Revisit §5.2.2 (lineage revisi) sbg proyek desain terpisah
```

**Estimasi kasar skala kerja per fase** (bukan angka jam — itu keputusan yang butuh
konteks tim; ini murni urutan besar-kecil relatif berdasarkan jumlah titik integrasi):

- Fase 0: kecil-menengah (3 potongan backend, semuanya mengekspos/merangkai fungsi yang
  sudah ada, bukan membangun baru).
- Fase 1: besar (titik integrasi terbanyak — 4 area data × banyak komponen konsumen per
  area), tapi RENDAH RISIKO (pola sudah terbukti benar di V1, backend sudah teruji).
- Fase 2: menengah, TAPI butuh keputusan desain owner dulu di 2 titik (§4.1, unifikasi
  RAB) sebelum implementasi bisa mulai — jangan mulai coding sebelum keputusan itu ada.
- Fase 3: besar DAN berisiko lebih tinggi (menyentuh Aturan Emas langsung — volume/AHSP
  mengarah ke uang sungguhan) — butuh spek tertulis + nilai uji manual sebelum
  implementasi, sesuai CLAUDE.md §3, TIDAK boleh dikerjakan tergesa.

---

## 7. Yang TIDAK Direkomendasikan Dikerjakan Sekarang

Konsisten dgn kaidah "TIDAK sekarang" di Master Plan §5 (multi-bangunan, vector search,
dst) — daftar tambahan hasil analisis ini:

- **Ask PAAX sbg LLM percakapan penuh** — mulai dari retrieve langsung (§4.3) dulu,
  evaluasi kebutuhan setelah dipakai nyata.
- **Auto-materialize RAB Bridge tanpa review manusia** — bertentangan langsung dgn
  Aturan Emas dan D12 (keputusan AI selalu proposal, approval manusia wajib).
- **Migrasi Excel export dock ("Export CSV") jadi fitur nyata** — kosmetik, prioritas
  rendah, tidak menghalangi alur kerja inti (audit item #7-#8 di ranking).
- **Desain lineage/revisi penuh (§5.2.2)** — didesain, tidak dibangun, sampai Fase 0-3
  stabil di produksi nyata.

---

## 8. Ringkasan untuk Pemilik

Kabar baiknya: backend jauh lebih siap dari yang terlihat — sebagian besar "pekerjaan
besar" sebenarnya sudah selesai (upload nyata, ekstraksi nyata, retrieval nyata,
corrections nyata, RAB bridge proposal nyata, Core Engine RAB/CPM/S-Curve nyata). Yang
hilang adalah **satu sambungan kritis** (pemicu sintesis otomatis) yang tanpanya semua
yang lain tidak bisa diuji dari alur pengguna nyata, plus **satu fitur produk inti**
(melihat gambar asli) yang belum pernah dibangun, plus **disiplin wiring** — mengganti
puluhan titik data mock di V2 satu per satu dgn fetch nyata memakai pola yang sudah
terbukti benar di V1. Perluasan ke RAB butuh 3 keputusan eksplisit dari pemilik (tombol
vs otomatis untuk sintesis; unifikasi dua jalur import RAB; kriteria "ready" apa cukup
utk RAB) sebelum bagian tersulit — mengisi volume dgn benar sesuai Aturan Emas — bisa
mulai dikerjakan.

---

## Referensi Silang

- Audit gap lengkap (basis dokumen ini): `report/report_drawing_intelligence/DI_FRONTEND_BACKEND_GAP_AUDIT_2026-07-17.md`
- Arsitektur L0-L4 & Decision Register: `docs/plans/drawing intelligence/PAAX_DRAWING_INTELLIGENCE_MASTER_PLAN_2026-07-16.md`
- Status backend PCKM hari ini (14/14 benchmark, live Command Room): `report/report_drawing_intelligence/FINAL_READINESS_REPORT_2026-07-17.md`
- Shape target RAB draft: `apps/web/src/lib/projects/rab-repository.ts`
- Core Engine RAB (sudah nyata & teruji): `services/core-engine/app/rab/{rab.py,schedule.py}`
