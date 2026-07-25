# PAAX Agentic Drawing Intelligence — Implementation Report Fase 01–30

**Tanggal:** 25 Juli 2026  
**Status:** development implementation snapshot; bukan universal production release  
**Baseline:** PAAX Drawing Intelligence PCKM v3 + Super Big Plan 5 Tahap  
**Project acuan:** `PLHUT-SURAKARTA`, PDF asli 88 halaman  
**Batas pekerjaan:** implementasi melanjutkan baseline yang ada; tidak mengulang arsitektur dari awal dan tidak mentransplantasikan seluruh OpenConstructionERP.

## 1. Keputusan arsitektur

Implementasi 30 fase pertama memakai arsitektur hybrid:

```text
Reliable deterministic workflows
+ Evidence-first Construction Truth Graph
+ Verified Measurement Facts
+ Core Engine calculation authority
+ Project-bound bounded agents
+ Human approval for authoritative writes
```

AI digunakan untuk klasifikasi, routing, pencarian evidence, dan penyusunan rencana. Engine deterministik digunakan untuk identity constraints, data lifecycle, formula, unit, persistence, dan authority. LLM tidak dipakai sebagai sumber jumlah atau volume final.

## 2. Masalah user yang ditutup

### 2.1 Command Room tidak mengikuti project PLHUT

Akar masalahnya bukan satu prompt, melainkan pecahnya identitas antara project aktif, conversation, connector, proxy, dan actor service. Sebelumnya project dapat dipilih di UI tetapi chat baru tidak selalu terikat ke project; connector dapat mempengaruhi apakah retrieval project diizinkan; beberapa service memakai actor `service-account`, sedangkan PLHUT dimiliki `paax-web`.

Perbaikan:

- active project dan conversation memiliki binding project yang eksplisit;
- chat baru mewarisi project yang sedang dibuka;
- connector memilih domain tool, bukan menghapus project binding;
- semua proxy portable memakai `PAAX_PORTABLE_ACTOR_ID`, default `paax-web`;
- Command Room mengambil `/engineering-context` project-bound terlebih dahulu;
- raw graph menjadi supporting evidence, bukan authority quantity;
- unknown item menghasilkan abstention dan forbidden claim, bukan angka karangan.

Verifikasi langsung:

```text
Query   : Berapa volume Kolom K2 Lantai 2?
Project : PLHUT-SURAKARTA
Authority: core_engine
Evidence : halaman 43, 50, 54
Result   : 2,340 m³
```

### 2.2 Gambar terpilih tidak tampil pada layer user

Fixture sebelumnya dapat mempunyai sheet mapping tetapi tidak mempunyai source image yang valid, sehingga canvas memilih geometri sintetis kecil. Implementasi baru menyediakan source manifest dan renderer halaman PDF asli melalui DB service. Frontend memetakan URL tersebut dan canvas memprioritaskan real source image sebelum fallback SVG.

Verifikasi visual dilakukan pada zero-based page 42 atau halaman manusia 43. Hasilnya benar-benar menampilkan `DENAH KOLOM LANTAI 2`, bukan placeholder.

### 2.3 Quantities berantakan dan menampilkan code internal

Quantity lama berasal dari projection graph yang terlalu dekat dengan data internal. Hash element, level `Multiple / N/A`, dan `Unknown` tidak layak menjadi output user.

Perbaikan:

- dibuat artifact `Civil Work Item` user-facing;
- item mempunyai LBS/WBS, category, location, unit, dimension, count, formula, result, status, dan source;
- tabel utama tidak menampilkan internal element ID;
- filter mencakup semua item, substruktur, lantai, atap, disiplin, kolom, dan balok;
- source button membuka sheet terkait;
- angka final berasal dari Measurement Facts/Core Engine;
- item dengan fakta kurang tetap tampil sebagai `Perlu review`, bukan dipaksakan mempunyai volume.

### 2.4 Backup perhitungan Excel

Endpoint ekspor menghasilkan workbook `Perhitungan Backup` dengan kolom:

```text
Item pekerjaan | Lokasi/Lantai | Jenis | Satuan | Ukuran | Jumlah |
Formula | Hasil | Status | Sumber
```

Kolom hasil disimpan sebagai angka Excel, bukan string saja. Number format membawa satuan, sehingga hasil tetap dapat dipakai untuk perhitungan lanjutan. K2 Lantai 2 disimpan sebagai numeric `2.34` dengan format `0.000 "m³"`.

### 2.5 PLHUT hilang atau data terhapus saat restart

Legacy live-test workflow bersifat fixture-oriented dan berisiko menghapus database. Bootstrap baru:

```text
Persistent DB
→ create schema if needed
→ create PLHUT only when absent
→ repair only missing DEM pages/snapshot/member
→ preserve all existing projects, chat, calculation, and review
```

Database lokal adalah `data/portable/paax-portable.db`. File database tidak didistribusikan dalam ZIP, tetapi dibuat sebelum DB API melayani request. Karena itu ketika web berhasil dibuka, PLHUT sudah terdaftar. Startup kedua tidak membuat duplikat dan tidak menghapus project lain.

## 3. Implementasi 30 fase

### Fase 01 — Pemulihan dan integritas paket

- Source portable yang central-directory ZIP-nya tidak valid dipulihkan ke working tree.
- Release baru dibangun dengan Python `zipfile`, diuji `testzip()`, dan memiliki manifest checksum per file.
- Cache, build output, `.venv`, `node_modules`, database runtime, dan secret dikeluarkan.

**Acceptance:** ZIP final dapat dibuka dan seluruh member lulus CRC.

### Fase 02 — Secret hygiene

- `.env.local` dari paket sumber tidak dimasukkan ke hasil.
- API token literal dibersihkan dari release tree.
- `make_zip.py` menjalankan secret scanner.
- internal service key dibuat acak pada startup dalam `.local-runtime`.

**Acceptance:** tidak ada `.env.local`, live token, atau runtime key dalam ZIP.

### Fase 03 — Portable environment contract

- `.env.local.example` menjadi credential-free.
- setup memeriksa Node.js 20+, pnpm 9+, dan Python 3.11–3.13.
- editable Python install mempunyai fallback `--no-build-isolation`.
- setup diakhiri preflight.

**Acceptance:** konfigurasi portable tidak bergantung pada hardcoded `live-test-key` dalam file release.

### Fase 04 — Persistent database

- SQLite portable disimpan di `data/portable/paax-portable.db`.
- startup tidak memanggil unlink/drop database.
- database project tambahan dipertahankan.

**Acceptance:** restart tidak menghapus state.

### Fase 05 — Idempotent PLHUT bootstrap

- `project-manifest.json` menjadi kontrak bootstrap.
- create-or-repair project, member, DEM run, 88 pages, dan active graph snapshot.
- UUID fixture stabil mencegah duplicate run.

**Acceptance:** hanya satu `PLHUT-SURAKARTA`, 88 DEM pages, snapshot aktif.

### Fase 06 — Source document manifest

- SHA-256 dan page count PDF asli disimpan di manifest.
- bootstrap dan preflight menolak mismatch.

**Acceptance:** authority document selalu byte-identical dengan PDF yang diaudit.

### Fase 07 — Default active project

- PLHUT diberi `portable_default=true`.
- project context frontend memilih PLHUT jika active project kosong/tidak valid.
- project lain tetap diperbolehkan.

**Acceptance:** first run langsung mempunyai project yang bisa dibuka.

### Fase 08 — Shared portable actor

- startup menetapkan `PAAX_PORTABLE_ACTOR_ID=paax-web`.
- DB, Core, Document Intelligence, web proxies, Command Room, dan synthesis memakai actor konsisten.
- fallback `service-account` hanya berlaku di deployment non-portable tanpa env.

**Acceptance:** owner/project authorization tidak pecah antar-service.

### Fase 09 — ProjectContextBinding

Kontrak binding agent memuat:

```text
tenantId, projectId, snapshotId, documentRevisionId,
actorId, conversationId, allowedToolScopes, issuedAt
```

**Acceptance:** tool menolak project ID yang berbeda dari binding.

### Fase 10 — Conversation project binding

- conversation menyimpan `boundProjectId`.
- chat baru mewarisi open project.
- pemindahan conversation ke project lain harus eksplisit.

**Acceptance:** project selection tidak hanya menjadi badge visual.

### Fase 11 — Connector-independent binding

- connector state tidak mengosongkan project ID.
- `allowProjectGraphRetrieval` mengikuti keberadaan project, bukan sekadar toggle connector.

**Acceptance:** mematikan connector tidak membuat Arete lupa project.

### Fase 12 — Command Room authoritative retrieval

- loader mengambil engineering context dan graph support paralel.
- engineering context selalu menang untuk facts, citations, conflict, allowed/forbidden claims, dan quantity authority.

**Acceptance:** raw occurrence count tidak mengalahkan verified Civil Work Item.

### Fase 13 — Claim-evidence validator contract

- build context menghasilkan authority vector.
- setiap claim angka memiliki citations.
- unknown item menghasilkan `quantity_authority=none`.

**Acceptance:** K9 tidak dijawab dengan quantity rekaan.

### Fase 14 — Source PDF API

Endpoint baru:

```text
/source-document/manifest
/source-document/pdf
/source-document/pages/{page_index}/image
```

**Acceptance:** page renderer mengembalikan PNG nyata dengan ukuran yang diminta.

### Fase 15 — 88-sheet mapping

- frontend menerima 88 sheet dari DB fixture.
- setiap sheet mempunyai page image URL melalui proxy Drawing Intelligence.

**Acceptance:** page index 42 terhubung ke URL render halaman 43.

### Fase 16 — Real image canvas priority

- `realImageUrl` dirender sebelum synthetic `SheetPlanSvg`.
- fallback tetap tersedia jika source image gagal.

**Acceptance:** user melihat gambar asli ketika source tersedia.

### Fase 17 — Source coordinate/aspect preservation

- render memakai rasio halaman PDF.
- viewer tetap dapat melakukan fit/zoom tanpa mengubah original evidence.

**Acceptance:** denah tidak gepeng, terpotong, atau terbalik.

### Fase 18 — Canonical civil taxonomy

- taxonomy mulai memisahkan discipline, category, element type, location, dan unit.
- tests ditambahkan untuk klasifikasi sipil.

**Acceptance:** column bukan `Unknown`; KP tetap dibedakan dari kolom struktur utama.

### Fase 19 — LBS/WBS projection

- item mempunyai `lbs_path`, `wbs_section`, dan `wbs_group`.
- lokasi menjadi Substruktur/Lantai/Atap, bukan `Multiple / N/A`.

**Acceptance:** filtering dan grouping dapat dilakukan deterministik.

### Fase 20 — Hybrid classification engine

AI digunakan untuk proposal identity/context. Rule engine memvalidasi canonical aliases, level, category, source authority, dan lifecycle. Output final bukan hasil AI mentah.

**Acceptance:** class yang tidak memenuhi contract menjadi candidate/review, bukan final.

### Fase 21 — Civil Work Item artifact

- dibuat delapan item PLHUT canonical.
- tujuh siap dihitung dan satu KP perlu review.

**Acceptance:** artifact terikat project dan source document hash.

### Fase 22 — Physical count authority

- jumlah berasal dari audited physical instances pada count-source.
- legend, schedule, detail, dan title block tidak menjadi physical count.

**Acceptance:** L2 K1A=8, K2=4, K3=5; KP=18 dipisahkan.

### Fase 23 — Measurement Fact integrity

Validator memeriksa:

- unique ID;
- project/hash binding;
- verified status;
- source pages/roles;
- unit/dimension/count;
- source authority;
- formula/result exactness.

**Acceptance:** perubahan formula atau result yang tidak konsisten menghasilkan HTTP 409.

### Fase 24 — Formula Registry

- formula quantity didefinisikan deterministik;
- dimensional inputs jelas;
- Core Engine tetap calculation authority.

**Acceptance:** invalid/missing inputs ditolak, bukan dilengkapi LLM.

### Fase 25 — Exact Core calculation bridge

Canonical calculation:

```text
0.250 × 0.600 × 3.900 × 4 = 2.340 m³
```

**Acceptance:** engine version `0.6.0`, status `complete`, no warning.

### Fase 26 — Calculation backup workbook

- worksheet utama berisi formula, hasil numeric, status, dan source.
- worksheet kedua menjelaskan source hash dan authority.

**Acceptance:** 8 data rows + header; K2 L2 numeric 2.34.

### Fase 27 — Professional quantity UI

Tabel utama:

```text
Item pekerjaan | Lokasi/Lantai | Jenis | Satuan | Ukuran |
Jumlah | Formula | Volume/Hasil | Status | Sumber
```

**Acceptance:** hash/internal code tidak menjadi kolom utama user.

### Fase 28 — Scope filters dan source navigation

- filter semua item, substruktur, L1, L2, atap, disiplin, kolom, balok;
- grouping location/WBS;
- source membuka sheet terkait;
- Excel dapat diunduh.

**Acceptance:** engineer dapat melihat item per lantai tanpa membaca JSON.

### Fase 29 — Agent plan/state/tool core

- dynamic engineering plan;
- state machine plan/running/waiting approval/completed/failed/cancelled;
- dependency-aware tasks;
- replan tidak boleh mengubah project/conversation;
- tool registry mempunyai scope, timeout, side-effect level, dan approval token.

**Acceptance:** cross-project tool blocked; authoritative write tanpa approval blocked; timeout bekerja.

### Fase 30 — Runtime, acceptance, dan release hardening

- preflight;
- source contracts;
- live DB/Core/Document Intelligence verification;
- Command Room context runtime;
- user-facing acceptance workspace;
- calculation workbook validation;
- deterministic release ZIP + roundtrip validation.

**Acceptance:** seluruh check di bagian testing lulus, kecuali batas Next.js runtime yang dinyatakan secara terbuka di bawah.

## 4. Hasil quantity PLHUT yang tampil ke user

| Item | Lokasi | Ukuran | Jumlah | Hasil | Status |
|---|---|---:|---:|---:|---|
| K1 | Lantai 1 | 0,400 × 0,400 × 4,400 m | 4 | 2,816 m³ | Terverifikasi |
| K1A | Lantai 1 | 0,400 × 0,400 × 4,400 m | 8 | 5,632 m³ | Terverifikasi |
| K2 | Lantai 1 | 0,250 × 0,600 × 4,400 m | 4 | 2,640 m³ | Terverifikasi |
| K3 | Lantai 1 | 0,250 × 0,400 × 4,400 m | 5 | 2,200 m³ | Terverifikasi |
| K1A | Lantai 2 | 0,400 × 0,400 × 3,900 m | 8 | 4,992 m³ | Terverifikasi |
| K2 | Lantai 2 | 0,250 × 0,600 × 3,900 m | 4 | 2,340 m³ | Terverifikasi |
| K3 | Lantai 2 | 0,250 × 0,400 × 3,900 m | 5 | 1,950 m³ | Terverifikasi |
| KP | Lantai 2 | Belum tersedia | 18 | 18 unit | Perlu review |

KP tidak diberi volume palsu karena dimensi/tinggi belum terverifikasi.

## 5. Hasil pengujian

### 5.1 Regression test suites

| Suite | Hasil |
|---|---:|
| Core Engine | **299 passed** |
| Document Intelligence | **656 passed, 6 skipped** |
| DB Service | **162 passed, 1 skipped** |

### 5.2 Phase 30 verification

| Verifier | Hasil |
|---|---:|
| Portable preflight | PASS, 21 checks |
| Source contracts | **37 passed, 0 failed** |
| Live runtime | **17 passed, 0 failed** |
| Acceptance UI/API | **14 passed, 0 failed** |
| Agentic runtime | **16 passed, 0 failed** |
| Command context runtime | **6 passed, 0 failed** |
| TypeScript syntax | **212 files, 0 syntax errors** |
| Extracted ZIP runtime roundtrip | **4 passed, 0 failed** |

### 5.3 ZIP roundtrip runtime

ZIP hasil pertama diekstrak ke direktori kosong, tanpa database. DB service dijalankan langsung dari hasil ekstraksi dengan database baru. PLHUT dibuat otomatis, source manifest 88 halaman cocok, halaman PDF asli dapat dirender, dan 8 Civil Work Items tersedia. Hasil ini membuktikan bootstrap berada di dalam ZIP, bukan bergantung pada working directory pembuat.

### 5.4 Live service checks

Service yang benar-benar dinyalakan:

- DB/fixture service port 8001;
- Core Engine port 8081;
- Document Intelligence port 8083.

Live checks mencakup:

- PLHUT terdaftar dengan owner `paax-web`;
- source manifest SHA-256 dan page count;
- 88 sheets;
- real page PNG;
- 8 Civil Work Items;
- K2 projection;
- Command Room binding dan three-source evidence;
- unknown item abstention;
- exact Core calculation;
- workbook Excel.

### 5.5 User-visible inspection

Dibuat acceptance workspace yang mengambil data **langsung dari service hidup**, bukan mock statis. Workspace memuat project selector PLHUT, halaman PDF asli, jawaban verified K2, quantity table, status, sources, filters, dan Excel action. Snapshot visual disimpan pada:

```text
report/phase30_agentic_2026-07-25/PHASE30_ACCEPTANCE_SNAPSHOT.png
```

Gambar halaman asli juga disimpan sebagai:

```text
report/phase30_agentic_2026-07-25/PLHUT-HALAMAN-43-DENAH-KOLOM-L2.png
```

## 6. Batas pengujian yang tidak disembunyikan

Full Next.js application **belum berhasil dijalankan di sandbox pekerjaan ini** karena paket sumber tidak membawa `node_modules`, sedangkan npm/pnpm registry tidak dapat di-resolve atau time out dari environment. Chromium headless juga tidak menyelesaikan proses ketika dipakai untuk screenshot. Karena itu tidak ada klaim palsu bahwa seluruh route Next.js sudah dilihat melalui build browser production.

Yang telah diverifikasi secara nyata:

- source TypeScript tidak memiliki syntax error;
- source contracts memastikan real-image branch, quantity UI, project binding, dan Excel action ada;
- service backend hidup dan berinteraksi;
- Command Room context loader TypeScript dijalankan terhadap DB hidup;
- acceptance workspace HTML/API dijalankan dan divalidasi;
- output visual dari data live diinspeksi.

Pada laptop user yang mempunyai akses registry, `Setup-PLHUT-Local.ps1` memasang dependency lockfile dan `Start-PLHUT-Local.ps1` menjalankan Next.js. Full browser E2E pada Next.js tetap menjadi verification pertama setelah ZIP diekstrak di environment tersebut.

## 7. Audit panduan portable

Panduan lama tidak sepenuhnya benar karena:

- memakai hardcoded internal key;
- menggambarkan autoseed sebagai fixture test, bukan database persisten;
- tidak menjelaskan risiko actor mismatch;
- menjanjikan source layer tanpa memastikan PDF URL;
- tidak membedakan retrieval backend dengan jawaban generatif provider.

Panduan baru sudah disesuaikan dengan implementasi:

- generated runtime key;
- actor `paax-web`;
- idempotent persistent bootstrap;
- real PDF renderer;
- quantity authority;
- Command Room binding;
- Excel export;
- troubleshooting per masalah.

## 8. OpenConstruction yang diadopsi pada fase ini

Yang diambil adalah pola domain, bukan seluruh ERP:

- persistent document/measurement identity;
- user-facing measurement ledger;
- source-to-quantity linkage;
- Excel/BOQ handoff;
- concurrency/idempotency mindset;
- source navigation dan Plan Room concept.

Belum dibawa:

- CRM, payroll, full procurement, foreign cost catalogue;
- raw geometry count sebagai authority;
- one-document-wide scale;
- seluruh UI/module topology OpenConstruction.

## 9. Status akhir

```text
Fase implementasi 01–30             : IMPLEMENTED
PLHUT persistent/default            : VERIFIED
Command Room project binding        : VERIFIED
Drawing source-page renderer        : VERIFIED
Professional quantity projection    : VERIFIED
Core calculation K2 L2              : VERIFIED
Backup calculation Excel            : VERIFIED
Agent plan/state/tool foundation     : VERIFIED
Full Next.js browser E2E sandbox     : BLOCKED BY DEPENDENCY REGISTRY
Universal production release        : NOT YET
```

Paket ini adalah baseline lanjutan untuk fase berikutnya, bukan titik akhir agentic system. Multi-agent specialist runtime, event bus persistence, approval inbox production, Kreo-parity takeoff editor penuh, revision intelligence, RAB/AHSP deep integration, dan multi-project external benchmarks tetap berada pada tahap berikutnya.
