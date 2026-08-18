# INSTRUKSI GEMINI — PHASE 2
## Data Gambar Nyata, Review Viewer, Klasifikasi Sheet, dan Quantity Berbasis Engine

### Prasyarat dan model

Gunakan **Gemini 3.6 Flash High Thinking**. Jalankan instruksi ini hanya bila laporan Phase 1 berakhir dengan:

`PHASE 1 PASS — READY FOR PHASE 2`

Kerjakan di branch/worktree contextual hasil Phase 1. Jangan bekerja di `G:\paax-ai-main`. Jangan melanjutkan Phase 3 sebelum semua acceptance gate Phase 2 lulus.

### Aturan arsitektur wajib

- Engine deterministik adalah satu-satunya sumber angka quantity, RAB, BoQ, bobot, durasi, dan hasil skenario.
- AI hanya boleh membantu klasifikasi, ekstraksi kandidat, binding, dan penjelasan. AI tidak boleh menghasilkan angka final.
- Rule-based/PyMuPDF/text-coordinate menjadi fast path. AI hanya fallback untuk data ambigu/tidak dikenal.
- Semua proposal AI harus tervalidasi deterministik, masuk antrean review manusia, dan tidak boleh auto-commit ke input engine.
- Semua data harus memiliki evidence, lineage, confidence/status, dan audit trail.
- Jangan menjalankan ulang OCR/analisis AI penuh untuk 88 halaman PLHUT. Gunakan DEM/PCKM yang sudah ada. Live AI baru diuji secara terbatas pada Phase 3.
- Jangan menggunakan route interception, mock response, synthetic screenshots, atau fixture statis sebagai bukti acceptance produk.
- Graphify-first sebelum membaca/mengubah alur artifact, viewer, package index, project graph, measurement fact, core engine, handoff, dan frontend.

---

## Bukti baseline yang wajib direproduksi

Database portable `G:\PAAX-Data\db\portable.sqlite` berisi data proyek nyata tetapi jalurnya belum lengkap:

- 1 project PLHUT;
- 1 DEM run;
- 88 DEM pages;
- sekitar 3.407 graph nodes, 3.768 edges, dan 2.040 evidence;
- hanya 1 `measurement_fact` dan 1 `rab_materialization_mapping`;
- tidak ada `work_item` node dalam project graph;
- sebagian besar tabel review/proposal/correction kosong.

DEM 88 halaman memiliki sheet identity, observations, evidence, dan text/coordinate extraction, tetapi belum memiliki package classification/level yang lengkap. `render_uri` memakai bentuk `local://...`, sedangkan artifact directory runtime kosong.

Masalah produksi yang telah ditemukan:

1. **Quantities tepat delapan item berasal dari fixture statis.**
   - `fixtures/plhut/project-manifest.json` menunjuk `fixtures/plhut/civil-work-items.json`.
   - File tersebut berisi tepat 8 item kolom yang dikurasi sebelumnya.
   - `services/db/src/paax_db/main.py` memuat JSON tersebut langsung untuk endpoint civil work items.
   - Ini bukan materialisasi quantity hidup dari seluruh project graph/core engine.

2. **Gate no-dummy tidak mencakup sumber masalah.**
   - `scripts/quality/check_no_production_di_dummy.py` hanya memindai area terbatas dan tidak menangkap fixture yang masuk melalui DB production endpoint.

3. **Gambar Review dan thumbnails bukan artifact gambar nyata.**
   - Browser aktif menampilkan SVG/placeholder ber-role `img`, bukan `<img>`, canvas PDF, atau tile gambar.
   - Latest frontend memiliki `PdfPageLayer`, tetapi jalur artifact PLHUT belum tersambung.
   - DEM memakai `reference://plhut-surakarta-2024`; document intelligence memakai local artifact store lain dan belum menyelesaikan URI reference tersebut.

4. **Drawing Package Index belum termaterialisasi.**
   - Endpoint index mencari `drawing-intelligence/runs/{run_id}/package-analysis.json`.
   - Artifact itu tidak ada di data root.
   - Fallback membuat 88 entri unknown/needs_review; startup tidak membangun package analysis dari DEM/PCKM yang sudah tersedia.

5. **Runtime lama memperlihatkan 45/88 sheet UNASSIGNED**, hanya mode Sheets/Level Tree, Review tanpa gambar, dan Quantities 8 item. Latest contextual memiliki dasar tiga mode, tetapi belum boleh dianggap selesai sebelum diuji melalui data PLHUT asli.

---

## Target Phase 2

Menyambungkan satu rantai data nyata dan dapat diaudit:

**PDF sumber asli → artifact resolver → thumbnail/review viewer → DEM/PCKM → package classification/index → kandidat item pekerjaan → MeasurementFact tervalidasi → deterministic core engine → quantity/handoff.**

Tidak boleh ada fixture produksi, data buatan, item yang hilang diam-diam, atau AI yang menghitung angka.

## Langkah kerja wajib

### 1. Satukan kontrak artifact sumber

Rancang satu resolver artifact yang melayani kedua sumber:

- uploaded artifact normal;
- portable/reference artifact PLHUT.

Gunakan source PDF asli sebagai otoritas visual. Pilih integrasi paling aman di antara materialisasi PDF ke canonical artifact store atau resolusi terotorisasi melalui DB source-document endpoint. Jangan membuat dua kebenaran visual yang dapat berbeda.

Kriteria teknis:

- akses terotorisasi dan traversal-safe;
- dukungan HTTP range bila dibutuhkan viewer;
- response content type/cache headers yang benar;
- thumbnail rendah-resolusi untuk navigasi cepat;
- viewer menggunakan PDF/tile asli pada zoom, tidak mengompresi permanen sumber;
- semua 88 halaman memiliki artifact yang dapat dirender;
- cache dan tile pool memiliki lifecycle/memory bound sehingga laptop tidak berat;
- missing artifact menghasilkan status eksplisit dan retry/recovery, bukan placeholder palsu.

### 2. Materialisasikan Drawing Package Index dari data yang sudah ada

- Gunakan DEM/PCKM 88 halaman yang sudah tersimpan sebagai input; jangan mengulang ekstraksi berat.
- Normalisasi discipline, level, view, classification, revision, dan zone secara deterministik dari sheet identity, title block, drawing number, teks, dan koordinat.
- Pertahankan urutan PDF asli 1–88 secara lossless.
- Persist `package-analysis.json`/index atau bentuk artifact canonical yang ekuivalen ke data root sehingga restart tidak kembali ke unknown.
- Semua 88 halaman wajib masuk index tepat sekali; tidak boleh dropped/duplicated.
- Bedakan `unknown`, `not_applicable`, dan `needs_review`; jangan memalsukan level untuk cover/detail/tabel yang memang bukan denah lantai.
- Untuk tampilan Level, sediakan kelompok semantik yang berguna: level bangunan serta kategori non-level seperti Detail, Potongan, Tampak, Tabel/Jadwal, Site/Umum. Jangan menumpuk halaman yang sebenarnya dapat diklasifikasi ke `UNASSIGNED`.
- Untuk tampilan Classification, minimal dukung kategori berdasarkan bukti: cover, drawing list, site plan, plan, elevation, section, detail, schedule/table, diagram, dan technical notes.
- Kategori dinamis dari AI hanya boleh menjadi proposal terkontrol: slug/label tervalidasi, alasan/evidence, review manusia, dan audit trail.
- Tiga mode UI wajib nyata dan konsisten: **Level**, **Classification**, dan **Original Order**.

### 3. Tampilkan gambar nyata pada Sheets dan Review

- Card/row sheet harus memuat thumbnail halaman nyata, bukan ikon atau SVG placeholder yang diberi label img.
- Review harus membuka halaman sumber nyata dengan koordinat/highlight evidence yang sesuai.
- Zoom, pan, page switch, overlay, dan cache harus bekerja tanpa mengubah resolusi sumber.
- Page number, sheet code/title, classification, dan evidence harus merujuk halaman yang sama; buat test terhadap off-by-one.
- Pastikan viewer tetap berfungsi setelah reload dan restart semua service.

### 4. Ganti delapan fixture dengan pipeline work-item hidup

Hapus fixture dari **jalur produksi**, bukan sekadar mengganti nama atau menambah item JSON. Fixture delapan item boleh dipertahankan hanya sebagai test anchor yang jelas dan tidak dapat diakses endpoint produksi.

Bangun alur produksi yang:

1. mengambil seluruh kandidat elemen/item pekerjaan dari project graph/DEM/PCKM;
2. menggabungkan kandidat duplikat berdasarkan identitas/evidence deterministik;
3. mengklasifikasikan kandidat ke taxonomy pekerjaan yang terversi;
4. memetakan kandidat yang cukup bukti ke input `MeasurementFact` terstruktur;
5. memvalidasi unit, dimensi, provenance, dan confidence;
6. meminta deterministic core engine menghitung nilai;
7. menyimpan calculation receipt, versi engine, input hash, formula/rule ID, dan evidence;
8. menandai kandidat yang belum cukup bukti sebagai `blocked` atau `needs_review`, bukan mengarang nol/angka;
9. memastikan tidak ada kandidat yang hilang diam-diam.

Coverage pekerjaan tidak boleh dibatasi pada kolom. Inventarisasi evidence-driven harus mampu mencakup kelompok yang memang ada dalam gambar, misalnya fondasi, sloof/balok, kolom, pelat, tangga, dinding, pintu/jendela, atap/struktur baja, finishing, plumbing/sanitary, electrical/MEP, dan pekerjaan site/luar. Jangan membuat item jika gambarnya tidak mendukung.

Definisi “semua item” adalah **seluruh kandidat berbukti telah masuk ledger** dengan salah satu status:

- `engine_verified`;
- `needs_review`;
- `blocked_missing_evidence`;
- `not_applicable` dengan alasan.

Jumlah total tidak boleh di-hardcode. Acceptance bukan sekadar `> 8`; buat completeness reconciliation yang membuktikan semua kandidat dari graph telah diperhitungkan dan domain yang ada tidak terlewat.

### 5. Perbaiki kontrak dan UI Quantities

- Pisahkan jelas **candidate inventory** dari **authoritative quantities**.
- Hanya hasil dengan receipt engine yang boleh disebut quantity terverifikasi.
- UI tidak menampilkan formula panjang sesuai feedback pengguna; tampilkan nilai, unit, status, dan sumber ringkas berupa nomor halaman/sheet. Detail receipt tetap dapat dibuka pada panel audit.
- Filter/grouping harus berasal dari taxonomy yang nyata, bukan array statis frontend.
- State loading, empty, blocked, review, dan engine error harus berbeda dan dapat ditindaklanjuti.
- Hindari perhitungan atau agregasi final di TypeScript/frontend.
- Jika mengubah model, perbarui Pydantic dan Zod dalam commit yang sama.

### 6. Integrasikan Review dan Handoff

- Proposal klasifikasi/binding/measurement harus muncul di review queue dengan halaman/evidence nyata.
- Approve/reject/correct harus persisten, idempotent, ber-audit, dan memicu re-materialisasi engine bila input berubah.
- Handoff hanya menerima item yang sudah human-approved bila perlu dan memiliki receipt engine valid.
- Handoff tidak boleh membaca delapan fixture atau angka AI.

### 7. Perluas quality gates

Perluas gate no-dummy agar mencakup seluruh jalur produksi relevan:

- DB service dan route;
- project manifests yang dipakai produksi;
- frontend fallback;
- document/drawing intelligence;
- bootstrap/startup artifact;
- handoff dan quantity adapters.

Bedakan fixture test sah dengan fixture yang bocor ke runtime. Tambahkan test yang gagal bila production endpoint kembali membaca `civil-work-items.json` atau data statis sejenis.

---

## Pengujian wajib Phase 2

Gunakan runtime contextual yang telah lolos Phase 1 dan data PLHUT existing. Jangan menghapus DB atau melakukan full 88-page AI/OCR rerun.

Minimal jalankan:

- unit test artifact resolver, range/caching, path authorization, dan missing artifact;
- unit/property test package index: 88 masuk, 88 unik, urutan 1–88 tetap;
- regression test page/sheet/evidence alignment;
- schema parity test Zod/Pydantic;
- pipeline test candidate → fact → engine receipt → quantity;
- test bahwa AI output tidak pernah menjadi angka final;
- test semua status ledger dan tidak ada silent drop;
- test production endpoints tidak membaca fixture delapan item;
- test approve/reject/correct persistence dan idempotency;
- backend pytest, frontend typecheck/unit test, build, dan security gates relevan.

Lakukan browser E2E nyata tanpa interception:

- Sheets memuat 88 sheet dengan thumbnail nyata;
- tiga mode tampilan berfungsi dan mempertahankan page identity;
- tidak ada halaman classify-able yang masuk UNASSIGNED;
- Review menampilkan PDF/gambar asli, zoom/pan/page switch bekerja;
- Quantities bukan delapan item statis dan memiliki coverage ledger seluruh kandidat;
- minimal beberapa domain pekerjaan yang benar-benar terdapat di PLHUT terlihat sesuai evidence;
- blocked/review items tidak diberi angka palsu;
- reload/restart tidak menghilangkan index, review, atau materialization;
- console dan network tidak memiliki error produk.

Lakukan pula regression kecil pada paket `gambar-kerja-arsitektur-gedung-a`/dataset 53 halaman tanpa full re-analysis untuk memastikan sistem tidak hardcoded khusus PLHUT.

---

## Acceptance gate Phase 2

Phase 2 hanya PASS jika:

- seluruh 88 halaman memiliki source artifact dan thumbnail nyata;
- Review merender gambar/PDF nyata, bukan semantic placeholder;
- package index persistent mencakup 88/88 tanpa duplikasi/drop;
- Level, Classification, Original Order bekerja;
- kategori/unknown ditangani secara semantik dan auditabel;
- endpoint produksi tidak lagi membaca fixture 8 item;
- setiap angka quantity yang tampil mempunyai deterministic engine receipt;
- seluruh kandidat berbukti tercatat pada completeness ledger;
- item kurang bukti tetap review/blocked tanpa angka rekaan;
- Review correction dan Handoff memakai data persisten yang benar;
- test otomatis dan browser nyata lulus;
- perubahan masuk commit Phase 2 terpisah.

Jika salah satu gagal, jangan menulis 100% dan jangan lanjut Phase 3.

## Output wajib

Buat laporan:

`G:\paax-ai-contextual-integration\PHASE_2_REAL_DRAWING_SHEET_QUANTITY_FEEDBACK.md`

Laporan harus menyertakan:

- data lineage aktual;
- reconciliation 88 halaman;
- classification distribution sebelum/sesudah;
- jumlah kandidat menurut domain dan status ledger;
- jumlah authoritative quantities dengan engine receipt;
- bukti fixture tidak dipakai produksi;
- bukti visual/browser nyata;
- test command dan hasil;
- commit Phase 2;
- gap yang masih tersisa.

Akhiri tepat salah satu:

- `PHASE 2 PASS — READY FOR PHASE 3`
- `PHASE 2 FAIL — DO NOT CONTINUE`

Berhenti dan kirim laporan kepada Wisnu.
