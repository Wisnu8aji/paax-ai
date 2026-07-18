# Audit Kesenjangan Frontend↔Backend — Drawing Intelligence Workspace

**Tanggal:** 2026-07-17
**Sifat dokumen:** Audit murni (tidak ada kode yang diubah). Basis untuk
`DI_BIG_PLAN_BACKEND_WIRING_2026-07-17.md`.
**Metode:** Investigasi mandiri (grep/read presisi file:line) + 1 subagent Explore
membaca penuh 30 file frontend V2 (`apps/web/src/components/drawing-intelligence/workspace/`).

---

## 0. Ringkasan satu paragraf

Ada **dua implementasi frontend Drawing Intelligence yang hidup berdampingan**: V1
(`apps/web/src/components/drawing-intelligence/*.tsx`, 1.219 baris, terverifikasi nyata
minggu ini di Wave C9/C9b, TAPI **tidak lagi bisa diakses lewat rute apa pun**) dan V2
(`apps/web/src/components/drawing-intelligence/workspace/`, 30 file, ~5.000+ baris,
**satu-satunya yang di-mount `page.tsx`**, TAPI **hampir seluruh datanya adalah mock
statis**). Backend sudah punya lebih banyak kapabilitas nyata daripada yang disangka
(upload+job-status DEM sudah ada, endpoint corrections/review sudah lengkap) — tapi
punya **satu lubang arsitektur kritis**: proses sintesis PCKM (yang membuat semua fitur
lain berfungsi) **tidak pernah dipicu otomatis dari HTTP mana pun** — hanya bisa
dijalankan manual lewat skrip test. Dan ada **dua endpoint yang sudah dibangun dengan
baik tapi berujung buntu**: RAB Bridge (proposal dibuat, tapi resolve tidak pernah
memanggil Core Engine) dan `quantity_assumptions` (tabel+skema lengkap, nol endpoint).

---

## 1. Peta Dua Frontend

| | V1 — `components/drawing-intelligence/*.tsx` | V2 — `components/drawing-intelligence/workspace/` |
|---|---|---|
| **Ukuran** | 1.219 baris, 7 file | ~5.000+ baris, 30 file |
| **Di-mount oleh `page.tsx`?** | **TIDAK** — hanya direferensikan di `apps/web/src/app/premium-ui-cleanup.test.ts` sbg `legacyWorkspace` | **YA** — satu-satunya yang dirender (`page.tsx` L6, L29) |
| **Sumber data** | Panggilan API nyata (`fetchSummaryViews`, `retrieveProjectGraph`, `fetchReviewQueue`, `fetchQuantityReadiness`) dengan loading/error state per-panel | 99% `di-mock-data.ts` statis. Hanya review-queue + status-bar count yang bisa diganti data nyata (lihat §3) |
| **Label status** | "EXPERIMENTAL permanen (D13)" — sengaja jujur soal keterbatasan | Tidak ada indikator "ini mock" yang terlihat user — tampil seolah data produksi nyata |
| **Fitur** | Level tree, occurrence list, insights (konflik+missing), quantity readiness panel, review tab (baca-saja) | Canvas gambar, upload modal, sheet gallery, analisis simulasi, quantity dock 5-tab, handoff ke RAB, Ask PAAX chat |
| **Kematangan visual** | Fungsional, sederhana | Jauh lebih matang — dibangun mengikuti spek "blueprint §N" yang dikutip di komentar kode, tapi dokumen blueprint itu sendiri **tidak ditemukan di repo** (kemungkinan eksternal/Figma, bukan bagian codebase) |

**Implikasi langsung:** Ini adalah pelanggaran diam-diam terhadap semangat Keputusan D9
Master Plan ("tidak ada dua source-of-truth tanpa label") — bukan kasus TKG-lama-vs-PCKM
yang sudah dilabeli D9, tapi kasus baru: dua UI PCKM modern, satu nyata-tapi-tak-terjangkau,
satu terjangkau-tapi-palsu.

---

## 2. Inventaris Backend Nyata (lebih lengkap dari dugaan)

### 2.1 Yang SUDAH ADA dan bekerja

| Kapabilitas | Endpoint | Bukti |
|---|---|---|
| Upload PDF + mulai ekstraksi DEM | `POST /drawings/dem/start` (services/document-intelligence) | `app/api/dem_routes.py` L18-38 — terima file, hitung hash, buat run, jalankan `process_document` di background via `QwenDemAdapter` |
| Polling status job DEM | `GET /drawings/dem/{run_id}/status` | `dem_routes.py` L41-43 |
| Upload generik (non-DEM) | `POST /upload` | `app/api/upload_routes.py` — guard 50MB, simpan ke `UPLOAD_DIR` |
| CRUD DEM run/page (storage) | `POST/GET/PUT /dem/runs`, `/dem/runs/{id}/status`, `/dem/pages`, `/dem/pages/{id}` (services/db) | `main.py` L468-538 |
| Snapshot build (materialisasi PCKM) | `POST .../project-graph/snapshots` | Dipakai manual oleh `serve_db_with_fixture.py`; shape lengkap di `schemas.ProjectGraphSnapshotBuildRequest` |
| Retrieve project graph (query natural language) | `POST .../project-graph/retrieve` | Diverifikasi live hari ini — 14/14 benchmark, 5 skenario Command Room lulus. Sudah punya rate-limit (60/menit via `PCKM_RETRIEVAL_LIMIT_PER_MINUTE`) + cache 300 detik (`ProjectGraphRetrievalCache`) — siap skala produksi ringan |
| Lineage koreksi lintas-snapshot | `ProjectGraphCorrection.carried_from` | `project_graph_repository.py` L253-277 — saat snapshot baru dibuat, koreksi accepted di snapshot lama otomatis dibawa maju, ditandai `stale` bila target sudah tidak ada. Mekanisme ini SUDAH ADA dan bekerja — penting utk desain UI "riwayat koreksi tetap terlihat lintas revisi" |
| Summary views per level | `GET .../project-graph/summary-views` | Shape `ProjectGraphSummaryView` — `element_type_index`, `discipline_counts`, `stored_measurement_facts`, `quality` (confirmed/ambiguous/conflict count), `provenance` |
| Review queue (baca) | `GET .../project-graph/review-queue` | `project_graph_review.py` `build_review_queue()` — item DIHITUNG ULANG tiap request dari state node/edge (bukan tabel tersimpan) |
| Quantity readiness (baca) | `GET .../project-graph/quantity-readiness` | `build_quantity_readiness()` — ready/needs_review/blocked per element_type dengan reason codes |
| **Buat koreksi** | `POST .../project-graph/corrections` | `main.py` L669-682 — endpoint nyata, tervalidasi |
| **Selesaikan koreksi (approve/reject)** | `POST .../project-graph/corrections/{correction_id}/resolve` | `main.py` L686-709 — endpoint nyata, tervalidasi |
| Buat proposal RAB Bridge | `POST .../project-graph/rab-bridge` | `main.py` L712-722 — evidence-backed, menyimpan `RabBridgeProposal` |
| **Selesaikan proposal RAB Bridge** | `POST .../project-graph/rab-bridge/{proposal_id}/resolve` | `main.py` L749-766 — **TAPI lihat §2.2, ini buntu** |
| Compute RAB/HSP/CPM/S-Curve (Core Engine) | `services/core-engine/app/rab/rab.py`, `schedule.py` | Nyata, teruji golden-test, dipakai halaman RAB (`proyek/[projectId]/rab/page.tsx`) yang SUDAH terhubung nyata (`calculateRAB`, `getHSPDetail`, `getSCurve` via `lib/engine.ts`) |

### 2.2 Yang ADA tapi BUNTU (dibangun sebagian, tidak selesai)

1. **RAB Bridge resolve tidak memanggil Core Engine.**
   `resolve_rab_bridge_proposal()` (`main.py` L754-766) hanya mengubah `proposal.status`
   jadi `"approved"`/`"rejected"` dan mengembalikan `payload["items"]` mentah — TIDAK PERNAH
   membuat `RABLineInput`, TIDAK PERNAH memanggil `compute_rab()`, TIDAK PERNAH menulis apa
   pun ke draft RAB proyek. Setelah "approved," data itu berhenti — tidak ada consumer.

2. **`quantity_assumptions` punya model+skema+migrasi TAPI NOL endpoint HTTP.**
   `models.py:412 class QuantityAssumption`, `schemas.py:509 QuantityAssumptionCreate`,
   migrasi `0013_review_workflow_quantity_readiness.py` — semua ada. `grep` di `main.py`
   untuk `quantity-assumption`/`QuantityAssumption` = **nol hasil**. Tidak ada create, read,
   update, atau list.

3. **Review queue item TIDAK punya `correction_id` sendiri untuk aksi UI.**
   `_append_queue_item()` (`project_graph_review.py` L104-126) membuat `id` sintetis
   `f"{category}:{target_type}:{target_id}"` — dihitung ulang tiap request, bukan baris
   tabel dengan primary key. Untuk tombol "Approve/Reject" di UI benar-benar berfungsi,
   frontend harus mengirim `POST .../corrections` baru dengan `target_type`/`target_id`
   dari item queue itu (endpoint create SUDAH ADA, lihat §2.1) — bukan mencari
   `correction_id` yang tidak pernah ada di payload queue. Ini gap yang **lebih kecil dari
   dugaan sebelumnya** — hanya butuh 2 pemanggilan API di frontend, backend sudah siap.

### 2.3 Yang TIDAK ADA SAMA SEKALI (harus dibangun dari nol)

1. **TIDAK ADA endpoint yang memicu sintesis PCKM.**
   Ini temuan paling kritis, dikonfirmasi independen oleh 2 jalur investigasi. `POST
   /drawings/dem/start` (upload nyata, BUKAN cuma fixture — lihat catatan di bawah) berhasil
   mengekstrak semua halaman via `process_document()` (`document_loop.py`), yang di akhir
   HANYA memanggil `db_client.update_run_status(run_id, "dem_complete"|"partially_failed")`
   (`document_loop.py` L102) — titik pasti di mana rantai berhenti. `synthesize_project_graph()`
   (fungsi inti yang mengubah halaman DEM jadi graf pengetahuan proyek — sudah teruji,
   benchmark 14/14) **hanya dipanggil dari test dan dari
   `scripts/live_test/serve_db_with_fixture.py`** (skrip sekali-pakai manual) serta
   `run_pckm_benchmark.py` (test-only). Tidak ada satu pun rute FastAPI di
   `services/document-intelligence` maupun `services/db` yang memanggilnya. Rantai
   Upload → DEM → **(lubang tepat di `document_loop.py` L102)** → Project Graph →
   Command Room putus di titik itu. **Koreksi catatan awal:** `POST /drawings/dem/start`
   BUKAN endpoint fixture-only — ia menerima file PDF multipart nyata, menghitung hash,
   membuka dgn `fitz` untuk hitung halaman, dan memicu `BackgroundTasks` sungguhan. Upload
   sisi ini sudah benar-benar berfungsi; yang hilang murni langkah SETELAH ekstraksi selesai.

2. **TIDAK ADA endpoint yang menyajikan gambar/render halaman gambar kerja — TAPI fungsi
   rendering-nya sendiri sudah ada dan berfungsi, hanya belum diekspos lewat HTTP.**
   `render_page_to_png()` (`services/document-intelligence/app/transcription/page_renderer.py`
   L16-17, memakai PyMuPDF `page.get_pixmap(dpi=200).tobytes("png")`) sudah nyata dan
   dipakai — tapi HANYA dipanggil secara internal oleh `page_loop.py` untuk membangun
   payload gambar yang dikirim ke model vision (Qwen/DeepSeek) saat ekstraksi DEM. Byte PNG
   itu tidak pernah dikembalikan ke pemanggil HTTP mana pun. **Ini mengubah skala pekerjaan:
   bukan "bangun rendering PDF→gambar dari nol" (besar), tapi "ekspos fungsi yang sudah ada
   lewat satu route baru" (kecil-menengah)** — mis. `GET /drawings/dem/{run_id}/pages/{page_index}/image`.
   Komponen canvas frontend (`sheet-plan-svg.tsx`) tetap sepenuhnya menggambar ulang secara
   prosedural dari koordinat mm mock sampai route ini dibangun — user tidak pernah benar-benar
   melihat gambar yang mereka unggah, di kondisi apa pun, hari ini.

3. **TIDAK ADA endpoint "daftar semua sheet/halaman untuk proyek X."**
   Yang paling dekat adalah `GET /dem/runs/{id}/status` (halaman untuk SATU run), tapi
   tidak ada agregasi lintas-run per proyek. `file-sheet-navigator.tsx`/`sheet-gallery.tsx`
   butuh ini untuk mengisi daftar file/sheet saat load.

---

## 3. Frontend V2 — Detail per Area (dari subagent Explore, disaring untuk temuan paling penting)

### 3.1 Satu-satunya jalur data nyata: `use-backend-sync.ts`

File 75 baris ini membuktikan pola kerja sudah benar (fetch nyata → dispatch → render),
tapi cakupannya sangat sempit:

- Memanggil `fetchReviewQueue(projectId)` + `fetchQuantityReadiness(projectId)` paralel.
- Jika keduanya kosong → **early return, biarkan mock tetap tampil** (comment eksplisit:
  "backend hidup tapi proyek belum punya graph — tetap pakai mock").
- Jika ada data: hanya **3 dispatch** — `backend-connected` (flag), `replace-review-queue`
  (dengan `sheetId`/`elementId` di-hardcode `null` untuk SETIAP item — jadi tombol "Buka"
  di baris queue tidak pernah aktif untuk data nyata), dan `set-status` (string status bar
  dari `readiness.summary` — **hanya angka ringkasan, bukan daftar `readiness.items`
  sesungguhnya**).
- `readiness.items` (daftar per-element_type dengan reason code) **diambil lewat jaringan
  lalu dibuang begitu saja** — tidak pernah sampai ke `state.quantities`.

### 3.2 Field state yang PERMANEN mock (bahkan saat `backendConnected: true`)

`files`, `sheets`, `elements`, `quantities`, `activity` — lima koleksi data terbesar dan
paling sentral di seluruh workspace — **tidak punya jalur fetch apa pun**, mock atau nyata.
`workspace-store.tsx` L343 bahkan menghardcode string status
`"Upload complete. 6 sheets are ready..."` terlepas dari berapa file yang sebenarnya
diunggah user.

### 3.3 3 dari 5 fungsi `drawing-intelligence-api.ts` tidak dipanggil sama sekali oleh V2

`fetchSummaryViews` dan `retrieveProjectGraph` (dua kapabilitas paling kaya — summary per
level dan query natural-language) hanya dipakai V1 yang sudah tak terjangkau rute.
`resolveCorrection` (fungsi client untuk endpoint approve/reject koreksi yang sudah nyata
di backend — lihat §2.1) **tidak dipanggil satu kali pun** di V2; tombol "Resolve" di
`quantity-dock.tsx` hanya mengubah state lokal.

### 3.4 Simulasi yang disamarkan sebagai proses nyata

- **Upload**: `startUploadSimulation()` menangkap objek `File` nyata dari drag-drop, lalu
  **membuangnya** dan selalu memuat ulang fixture PLHUT 6-sheet yang sama persis — file
  apa pun yang dipilih user tidak berpengaruh pada apa yang muncul.
- **Analisis**: `startAnalysis()` = progress bar `setInterval` terhadap skrip log yang
  sudah ditulis di awal (`ANALYSIS_LOG_SCRIPT`), lalu `processing-overlay.tsx` MENGARANG
  angka "Live Analysis Stats" dari persentase progress palsu itu (`Math.ceil(progress/100*6)`
  halaman, dst) — bukan telemetri sungguhan.
- **Handoff**: tombol "Send verified quantities" (`handoff-confirm-modal.tsx`
  `confirmSend()`) hanya mengubah flag lokal `handoff.sent = true` — **tidak ada `fetch`
  sama sekali**, tidak ada data yang benar-benar terkirim ke mana pun.
- **Ask PAAX**: `askPaax()` = pencocokan kata kunci (`q.includes('column')`) dengan delay
  900ms buatan — bukan panggilan LLM.
- Tombol "Use sample drawing set" di modal upload production secara eksplisit memuat 4 file
  palsu (`SAMPLE_FILES`) — affordance "muat data palsu" yang tampil ke user sungguhan.

*(Detail lengkap per-file dengan nomor baris ada di laporan penuh subagent — tersedia atas
permintaan; ringkasan di atas sudah mencakup semua temuan berdampak tinggi.)*

---

## 4. Ranking Kesenjangan (paling sentral ke paling kosmetik)

| # | Kesenjangan | Dampak | Kategori perbaikan |
|---|---|---|---|
| 1 | **Tidak ada pemicu sintesis PCKM otomatis** | Seluruh sistem (semua fitur lain) tidak bisa berjalan di luar skrip manual | Backend baru — KRITIS, paling dulu |
| 2 | **Canvas tidak pernah menampilkan gambar asli** | Janji produk utama ("lihat gambar Anda dianalisis AI") tidak terpenuhi sama sekali, di kondisi apa pun | Backend baru (image serving) + frontend (ganti SVG prosedural) |
| 3 | **Upload tidak benar-benar mengunggah ke pipeline** | Fitur inti kedua tidak berfungsi — Simulasi selalu memuat data yang sama | Frontend (hubungkan ke `/drawings/dem/start` yang SUDAH ADA) |
| 4 | **`sheets`/`elements`/`quantities` selamanya mock** | Semua panel data utama menampilkan fiksi permanen | Frontend (banyak titik) + backend baru (list-sheets, list-elements per proyek) |
| 5 | **RAB Bridge buntu setelah approval + tidak ada endpoint daftar proposal** | Jembatan Drawing Intelligence→RAB yang sudah setengah dibangun tidak berujung ke mana pun; juga tidak ada `GET` untuk melihat daftar proposal pending suatu proyek (hanya create+resolve per-ID) | Backend (selesaikan `resolve_rab_bridge_proposal` + tambah endpoint list) |
| 6 | **Handoff UI tidak mengirim apa pun** | Tombol paling penting di alur kerja (`handoff-confirm-modal.tsx`) murni kosmetik | Frontend (panggil RAB Bridge API yang sudah ada) |
| 7 | **`quantity_assumptions` nol endpoint** | Fitur "isi asumsi yang hilang" (mis. tinggi kolom tak tertulis) tidak bisa dibangun sama sekali di frontend | Backend baru (CRUD) |
| 8 | **Review queue item tanpa correction_id** | Tombol approve/reject di UI review tidak bisa memanggil endpoint yang sebenarnya sudah ada | Frontend kecil (kirim target_type/target_id, bukan cari correction_id) |
| 9 | **V1 vs V2 tidak terhubung** | Kapabilitas nyata V1 (`fetchSummaryViews`, `retrieveProjectGraph`) tidak termanfaatkan di V2 yang aktif | Keputusan arsitektur + porting |
| 10 | **Ask PAAX bukan LLM sungguhan** | Fitur chat kontekstual tidak nyata | Frontend + kemungkinan tool baru (mirip Command Room) |
| 11-18 | Kosmetik: Compare Revisions, Share/copy-link, tombol Documentation/Help, Export CSV, bulk actions galeri, cursor X/Y beku, dll. | Rendah — tidak menghalangi alur kerja inti | Frontend, prioritas rendah |

---

## 5. File Referensi Kunci

**Frontend V2 (mock):**
`apps/web/src/components/drawing-intelligence/workspace/{di-types.ts, di-mock-data.ts,
workspace-store.tsx, use-backend-sync.ts, index.tsx}` + subdirektori `canvas/`, `dock/`,
`inspector/`, `navigator/`.

**Frontend V1 (nyata, tak terjangkau rute):**
`apps/web/src/components/drawing-intelligence/{drawing-intelligence-workspace.tsx,
level-tree-panel.tsx, occurrence-list-panel.tsx, quantity-readiness-panel.tsx,
review-tab-panel.tsx, insights-panel.tsx, drawing-intelligence-api.ts}`.

**Backend — upload & DEM:**
`services/document-intelligence/app/api/{dem_routes.py, upload_routes.py, tkg_routes.py}`.

**Backend — project graph & RAB bridge:**
`services/db/src/paax_db/{main.py, project_graph_review.py, project_graph_rab_bridge.py,
project_graph_repository.py, models.py, schemas.py}`.

**Backend — Core Engine (sudah terhubung nyata ke halaman RAB lain):**
`services/core-engine/app/rab/{rab.py, schedule.py}`.

---

*Dokumen ini adalah basis untuk `DI_BIG_PLAN_BACKEND_WIRING_2026-07-17.md` — jangan
eksekusi apa pun dari sini tanpa persetujuan pemilik atas rencana tersebut.*
