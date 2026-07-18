# PAAX DRAWING INTELLIGENCE — SUPER BIG PLAN

## Mandat Eksekusi Total DEM → PCKM → Command Room → Measurement Facts → Core Engine → RAB

**Status dokumen:** Instruksi eksekusi final untuk coding agents  
**Otoritas tertinggi:** Sonnet 5  
**Cakupan:** Seluruh perbaikan Drawing Intelligence berdasarkan audit sebelum merge, audit setelah merge ke `main`, paket DEM/PCKM, dan kondisi aktual repo  
**Target:** Menjadikan PAAX Drawing Intelligence benar secara evidence, spasial, semantik, kuantitas, unit, retrieval, UI, dan integrasi Core Engine  
**Prinsip kerja:** Tidak ada pertanyaan ke owner, tidak ada penghentian di tengah, tidak ada review per pekerjaan, audit besar hanya dilakukan setelah seluruh fase selesai  

---

# 0. PERINTAH UTAMA YANG TIDAK BOLEH DILANGGAR

## 0.1 Mandat untuk Sonnet 5

Sonnet 5 adalah **Supreme Orchestrator, Chief Architect, strategic thinker, instruction authority, dan final decision maker** untuk seluruh pekerjaan dalam dokumen ini. Sonnet 5 **dilarang mengerjakan implementasi secara langsung**: tidak boleh menulis atau mengedit kode, membuat migration, menjalankan test, melakukan commit, menyelesaikan merge conflict, atau menjalankan pekerjaan operasional lainnya. Seluruh pekerjaan nyata wajib dilaksanakan oleh agent pelaksana.

Sonnet 5 wajib:

1. Membaca seluruh dokumen ini sampai selesai sebelum mengubah kode.
2. Membaca aturan aktif repository, termasuk `CLAUDE.md`, `AGENTS.md`, dokumentasi aktif, schema, migration, dan test contract.
3. Menggunakan **Graphify sebagai sistem utama navigasi, impact analysis, dependency tracing, dan verifikasi struktur repo**.
4. Mengarahkan dan memastikan seluruh agent pelaksana menjalankan semua fase, subfase, dan work package sampai Definition of Done global tercapai.
5. Tidak berhenti setelah menyelesaikan satu fase.
6. Tidak meminta konfirmasi, approval, atau penjelasan tambahan dari owner.
7. Tidak menunggu review manusia di tengah pekerjaan.
8. Tidak membuat klaim selesai sebelum seluruh gerbang akhir lulus.
9. Tidak mengabaikan masalah hanya karena masalah berada di luar modul yang sedang dibuka, selama masalah tersebut memengaruhi correctness Drawing Intelligence.
10. Mengambil keputusan sendiri berdasarkan:
    - source of truth kode;
    - kontrak schema;
    - evidence proyek;
    - prinsip keselamatan data konstruksi;
    - Aturan Emas;
    - pendekatan paling konservatif apabila terdapat ketidakpastian.
11. Mendokumentasikan keputusan penting sebagai ADR atau catatan desain tanpa meminta persetujuan owner.
12. Terus bekerja sampai seluruh pekerjaan benar-benar selesai.

Sonnet 5 **tidak boleh berhenti** karena:

- satu agent gagal;
- satu provider mencapai usage limit;
- branch kotor;
- test gagal;
- dokumentasi berbeda dengan kode;
- ditemukan arsitektur lama;
- ditemukan bug baru;
- pekerjaan ternyata lebih besar dari perkiraan;
- satu pendekatan awal harus dibuang;
- dibutuhkan refactor lintas service.

Jika terdapat kebingungan, Sonnet 5 wajib:

1. Query Graphify.
2. Baca kode sumber terkait.
3. Baca test dan migration.
4. Bandingkan kontrak Python, TypeScript/Zod, database, API, dan frontend.
5. Pilih interpretasi paling aman.
6. Catat asumsi.
7. Berikan instruksi implementasi yang lengkap kepada agent pelaksana.
8. Perintahkan agent Claude Haiku menjalankan seluruh verification secara otomatis dan independen.
9. Evaluasi laporan hasil agent, berikan instruksi koreksi bila diperlukan, lalu lanjut ke pekerjaan berikutnya tanpa mengerjakan perubahan secara langsung.

---

## 0.2 Larangan bertanya kepada owner

Selama eksekusi, semua agent dilarang mengajukan pertanyaan kepada owner.

Jika terdapat pilihan desain, gunakan urutan keputusan berikut:

1. Pertahankan backward compatibility apabila tidak merusak correctness.
2. Utamakan evidence dan keselamatan data.
3. Fail closed untuk quantity, cost, volume, schedule, material, dan klaim fisik.
4. Hindari default palsu.
5. Gunakan `null`, `unknown`, `not_ready`, `ambiguous`, atau `blocked` apabila data tidak cukup.
6. Jangan mengisi kekosongan dengan tebakan.
7. Buat ADR jika keputusan memengaruhi arsitektur jangka panjang.

---

## 0.3 Tidak ada audit per pekerjaan

Tidak boleh ada penghentian untuk melakukan audit besar setelah setiap fase.

Yang diperbolehkan selama fase:

- unit test;
- integration test lokal;
- schema validation;
- typecheck;
- lint;
- migration test;
- fixture test;
- deterministic verification;
- Graphify dependency check;
- diff inspection oleh agent Claude Haiku verifier;
- perbaikan regresi otomatis.

Hal tersebut disebut **verification**, bukan audit.

**Otoritas verification eksklusif:** seluruh perintah verification, eksekusi test, pemeriksaan hasil, evidence collection, dan laporan pass/fail wajib dilakukan oleh agent Claude Haiku. Sonnet 5 tidak menjalankan verification dan agent implementasi tidak boleh melakukan self-approval. Sonnet 5 hanya mengevaluasi laporan Haiku dan memberikan instruksi tindak lanjut.

Audit arsitektur besar, audit keamanan, audit correctness, audit data lineage, dan audit final hanya dilakukan dalam **FASE FINAL AUDIT** setelah seluruh fase implementasi selesai.

Tidak ada per-phase approval gate. Jika verification gagal, agent Claude Haiku verifier wajib melaporkan kegagalan dan bukti teknis kepada Sonnet 5; Sonnet 5 kemudian memberikan instruksi koreksi kepada agent pelaksana. Setelah koreksi, verification diulang **hanya oleh agent Claude Haiku** sampai hijau, lalu pekerjaan langsung berlanjut.

---

## 0.4 Larangan testing AI menggunakan API key

Seluruh agent dilarang menggunakan API key nyata untuk pengujian implementasi.

Dilarang memanggil secara live:

- OpenRouter;
- Anthropic;
- DashScope;
- DeepSeek API;
- Gemini API;
- Google AI Studio;
- Vertex AI;
- NVIDIA NIM;
- provider vision atau reasoning eksternal lain.

Dilarang:

- membaca secret `.env` untuk menjalankan smoke test AI;
- menghabiskan usage owner;
- mengirim drawing proyek ke provider untuk pengujian;
- membuat benchmark baru dengan API eksternal;
- menguji fallback provider menggunakan request nyata.

Semua test provider wajib memakai:

- mocks;
- deterministic stubs;
- fixture responses;
- recorded sanitized payload yang sudah ada dan tidak memerlukan network;
- fake adapters;
- dependency injection;
- monkeypatch;
- local contract tests;
- network-disabled test mode.

Tambahkan guard test agar suite gagal jika mencoba outbound network.

Live AI validation dinyatakan **out of scope** untuk eksekusi ini. Correctness harus dibuktikan melalui kontrak, fixture, deterministic processing, dan existing stored outputs.

---

# 1. HIERARKI DAN PEMBAGIAN AGENT

## 1.1 Sonnet 5 — Supreme Orchestrator dan Thinking Authority

Tanggung jawab:

- memegang keseluruhan konteks;
- berpikir mendalam dan membuat execution graph;
- membagi pekerjaan;
- memberikan instruksi teknis dan arsitektural yang lengkap;
- memutuskan desain final;
- mengevaluasi laporan hasil agent;
- memberikan keputusan penyelesaian konflik kepada agent pelaksana;
- memastikan tidak ada phase yang terlewat;
- memerintahkan verification eksklusif kepada agent Claude Haiku;
- memimpin Final Audit hanya setelah seluruh fase selesai, berdasarkan bukti yang dikumpulkan dan diverifikasi agent Haiku;
- memastikan Definition of Done tercapai.

Sonnet 5 tidak menyerahkan keputusan arsitektur final kepada agent lain, tetapi **tidak boleh menjadi implementer**. Sonnet 5 hanya berpikir, memutuskan, menginstruksikan, mengawasi, dan mengevaluasi. Semua perubahan kode, file, schema, migration, test, dokumentasi, commit, integrasi branch, dan perbaikan teknis wajib dikerjakan agent pelaksana.

---

## 1.2 Agent Antigravity 1 — Gemini 3.5 Flash

**Mode:** Agent cepat untuk pemetaan, inventaris, konsistensi, dan pekerjaan berulang.

Tugas utama:

- membaca struktur repository melalui Graphify;
- menginventaris file, endpoint, schema, migration, dan test;
- menemukan duplikasi route, dead code, stale docs, hardcoded values, mock fallback, dan contract drift;
- membuat file matrix Python ↔ Zod ↔ DB ↔ API ↔ UI;
- menulis test boilerplate;
- menjalankan static consistency checks;
- membantu dokumentasi dan migration inventory;
- mengidentifikasi file yang terdampak sebelum implementasi.

Gemini 3.5 Flash tidak boleh membuat keputusan final tentang:

- physical occurrence semantics;
- unit system;
- RAB authority;
- evidence truth model;
- security boundary.

Semua keputusan tersebut tetap milik Sonnet 5.

---

## 1.3 Agent Antigravity 2 — Gemini 3.1 Pro High

**Mode:** High reasoning melalui AGY/Antigravity.

Tugas utama:

- mendesain evidence truth layer;
- mendesain canonical coordinate system;
- mendesain typed DEM v2;
- mendesain PCKM physical entity model;
- mendesain revision lineage dan incremental synthesis;
- mendesain Measurement Fact contract;
- mendesain RAB Bridge v2;
- menilai invariant lintas service;
- menulis ADR dan migration strategy;
- melakukan adversarial reasoning terhadap failure mode.

Output Gemini 3.1 Pro bersifat proposal. Sonnet 5 wajib memeriksa proposal tersebut, mengambil keputusan final, lalu memberikan instruksi integrasi kepada agent pelaksana. Sonnet 5 tidak melakukan integrasi kode secara langsung.

---

## 1.4 Agent Antigravity 3 — Sonnet 4.6

**Mode:** Senior implementation agent.

Tugas utama:

- implementasi backend kompleks;
- refactor lintas Python service;
- persistence dan database constraints;
- typed API contracts;
- retrieval optimization;
- durable job architecture;
- corrections workflow;
- Core Engine HTTP boundary;
- security dan tenancy hardening;
- test integration.

Sonnet 4.6 tidak boleh mengubah aturan utama tanpa sinkronisasi dengan Sonnet 5.

---

## 1.5 Claude Haiku Watchdog — pemantauan setiap 60 detik

Satu agent Claude Haiku wajib berfungsi sebagai **continuous watchdog** selama pekerjaan berlangsung.

Interval pemantauan: **setiap 1 menit**.

Watchdog tidak melakukan audit kualitas besar. Watchdog hanya memantau liveness dan execution health. Watchdog wajib tetap aktif tanpa jeda sampai seluruh fase, verification Haiku, Final Audit, dan final integration selesai.

Setiap 60 detik, Watchdog memeriksa:

1. Agent mana yang aktif.
2. Agent mana yang berhenti menghasilkan progress.
3. Agent mana yang terkena usage limit.
4. Task mana yang tidak mempunyai owner.
5. Task mana yang stuck pada test error yang sama.
6. Branch dan working tree state.
7. Apakah terdapat file konflik.
8. Apakah agent mengubah file di luar scope tanpa alasan.
9. Apakah terdapat duplicate implementation.
10. Apakah outbound API test pernah dicoba.
11. Apakah Graphify digunakan sebelum perubahan besar.
12. Apakah verification berjalan.
13. Apakah terdapat uncommitted work yang berisiko hilang.
14. Apakah agent menunggu pertanyaan owner.

Watchdog melaporkan hanya kepada Sonnet 5.

Jika agent idle atau berhenti:

- tandai task sebagai `stalled`;
- kumpulkan state terakhir;
- berikan ringkasan file yang diubah;
- berikan test failure terakhir;
- laporkan kepada Sonnet 5 agar Sonnet 5 segera memberikan instruksi redispatch kepada agent pelaksana berikutnya;
- jangan menunggu agent tersebut kembali.

Jika agent berhenti karena limit, Watchdog memicu fallback protocol pada §2.

Tidak boleh ada keadaan seluruh worker berhenti bersamaan selama masih ada work package yang belum selesai. Watchdog wajib memastikan selalu ada agent pelaksana aktif atau proses redispatch aktif. Sonnet 5 tidak mengambil alih pekerjaan tersebut; Sonnet 5 hanya mengeluarkan instruksi redispatch dan keputusan teknis.

---

## 1.6 Claude Haiku Worker Pool — 1 sampai 3 agent, max effort

Selain Watchdog, Sonnet 5 wajib menjalankan 1–3 Claude Haiku max-effort sebagai worker dan verifier sesuai kebutuhan. Seluruh verification formal hanya boleh dijalankan oleh pool Claude Haiku ini.

Tugas yang sesuai:

- menjalankan seluruh unit test, integration test, migration test, fixture test, benchmark, typecheck, lint, schema validation, Graphify dependency check, network-block test, dan deterministic verification;
- memeriksa diff secara independen;
- mengumpulkan bukti verification dan membuat laporan pass/fail;
- menulis unit test;
- menulis migration test;
- memperbaiki typing;
- membersihkan dead code;
- menyamakan Zod/Pydantic;
- membuat fixture;
- memperbarui dokumentasi;
- membuat script audit deterministik;
- mengecek route duplication;
- mengecek naming consistency;
- menulis benchmark assertions;
- memperbaiki error kecil yang terisolasi.

Agent implementasi Antigravity, Luna, dan agent non-Haiku boleh melakukan sanity check lokal untuk membantu pekerjaan, tetapi **tidak boleh menyatakan verification resmi lulus**. Status verification resmi hanya sah jika dijalankan dan dilaporkan oleh agent Claude Haiku.

Haiku worker tidak boleh mengubah arsitektur inti tanpa instruksi Sonnet 5.

---

# 2. FALLBACK PROTOCOL ANTIGRAVITY → CODEX

Seluruh pekerjaan implementasi utama harus lebih dahulu dijalankan penuh oleh agent Antigravity: Gemini 3.5 Flash, Gemini 3.1 Pro High, dan Sonnet 4.6 sesuai pembagian tugas. Codex Luna dan Haiku worker tidak mengambil alih task Antigravity selama agent Antigravity masih aktif dan mempunyai usage. Peralihan dilakukan segera ketika usage limit habis, agent berhenti, atau session tidak dapat dilanjutkan.

## 2.1 Trigger fallback

Fallback dijalankan jika salah satu kondisi berikut terjadi:

- usage Antigravity habis;
- agent Antigravity tidak dapat dilanjutkan;
- provider menolak request karena quota;
- task berhenti tanpa progress;
- session agent tidak dapat dipulihkan;
- tool Antigravity unavailable.

---

## 2.2 Fallback utama — Codex GPT-5.6 Luna High Effort

Ketika Antigravity berhenti, Sonnet 5 wajib memindahkan task ke:

**1 agent Codex GPT-5.6 Luna, high effort.**

Handoff wajib berisi:

- tujuan task;
- file scope;
- Graphify findings;
- perubahan yang sudah dilakukan;
- diff yang belum selesai;
- invariant yang harus dipertahankan;
- test yang lulus;
- test yang gagal;
- keputusan ADR terkait;
- larangan live API testing;
- Definition of Done task.

Luna tidak boleh mengulang investigasi dari nol apabila state sudah tersedia.

---

## 2.3 Fallback sekunder — Claude Haiku max effort

Jika Luna tidak tersedia atau task dapat diparalelkan, Sonnet 5 menggunakan 1–3 Haiku max-effort.

Pembagian disarankan:

- Haiku A: implementation atau refactor terisolasi;
- Haiku B: tests dan fixtures;
- Haiku C: schema/docs/migration consistency.

Sonnet 5 tetap menjadi pengambil keputusan integrasi, tetapi pekerjaan integrasi kode, conflict resolution, commit, dan perubahan file dilaksanakan oleh agent pelaksana yang ditunjuk.

---

# 3. GRAPHIFY SEBAGAI SKILL UTAMA WAJIB

## 3.1 Graphify adalah entry point pertama

Sebelum membaca file secara acak, seluruh agent wajib menggunakan Graphify untuk:

- menemukan symbol;
- menemukan caller/callee;
- menemukan dependency lintas service;
- menemukan file yang mengimplementasikan kontrak sama;
- mencari test yang melindungi module;
- mengidentifikasi dead branch;
- menganalisis impact perubahan;
- menemukan duplications;
- menemukan route dan schema lineage.

Glob/Grep manual hanya fallback apabila Graphify tidak menemukan informasi yang dibutuhkan.

---

## 3.2 Protokol Graphify per work package

Sebelum perubahan:

1. Query Graphify untuk symbol utama.
2. Query upstream callers.
3. Query downstream consumers.
4. Query tests.
5. Query schema mirrors.
6. Query migration terkait.
7. Catat impact set.

Setelah perubahan:

1. Jalankan `graphify update .`.
2. Query ulang symbol.
3. Pastikan tidak muncul duplicate path.
4. Pastikan caller lama tidak tertinggal.
5. Pastikan docs aktif menunjuk implementasi baru.

Tidak boleh melakukan refactor besar tanpa Graphify impact map.

---

# 4. SOURCE OF TRUTH DAN ATURAN ARSITEKTUR

## 4.1 Hierarki source of truth

Urutan otoritas:

1. Database constraints dan persisted authoritative records.
2. Typed Core Engine output untuk hasil kalkulasi.
3. Human-verified Measurement Facts.
4. Human-verified physical elements.
5. PCKM graph dengan evidence lengkap.
6. DEM observations dengan evidence lengkap.
7. Raw drawing artifacts.
8. Deterministic inference.
9. AI proposal.
10. UI state.

UI tidak pernah menjadi source of truth.

---

## 4.2 Aturan Emas final

AI/LLM boleh:

- membaca;
- mentranskripsi;
- mengklasifikasi;
- menghubungkan;
- menyusun kandidat;
- menjelaskan;
- membuat execution plan;
- memilih tool;
- melakukan sanity check non-authoritative.

AI/LLM tidak boleh menjadi sumber final untuk:

- physical count;
- length;
- area;
- volume;
- weight;
- cost;
- AHSP final;
- duration;
- schedule;
- productivity;
- BoQ;
- RAB.

Semua angka final wajib berasal dari Core Engine dengan:

- typed input;
- unit eksplisit;
- formula;
- substituted formula;
- result;
- engine version;
- source IDs;
- timestamp;
- approval state.

---

## 4.3 Pemisahan entitas wajib

Sistem harus memisahkan:

```text
Raw Artifact
≠ Evidence
≠ Observation
≠ Semantic Reference
≠ Physical Candidate
≠ Verified Physical Element
≠ Measurement Fact
≠ Calculated Quantity
≠ Work Item
≠ AHSP Selection
≠ RAB Line
```

Tidak boleh ada shortcut yang mengubah label menjadi quantity.

---

# 5. STRATEGI BRANCH, COMMIT, DAN INTEGRASI

## 5.1 Branch kerja

Buat satu branch dari latest `main`:

```text
feat/drawing-intelligence-truth-rebuild
```

Tidak membuat stacked PR per fase.

---

## 5.2 Commit policy

Gunakan atomic commits berdasarkan work package, bukan berdasarkan agent.

Contoh:

```text
fix(di): preserve original DEM evidence in graph snapshot
feat(di): add canonical page coordinate transforms
refactor(di): separate contextual references from physical elements
feat(core-engine): introduce unit-aware measurement contracts
fix(web): remove occurrence-as-quantity mapping
```

Setiap commit wajib:

- buildable;
- tidak menyimpan secret;
- tidak berisi generated junk;
- mempunyai test terkait;
- diperbarui di Graphify.

Agent pelaksana tidak menunggu review owner setelah commit. Agent Claude Haiku melakukan verification formal, Sonnet 5 mengevaluasi laporannya dan langsung menginstruksikan pekerjaan berikutnya.

---

## 5.3 Final integration

Hanya satu final audit dan satu final integration action setelah semua fase selesai.

Jangan merge ke `main` sebelum Final Audit lulus.

---

# 6. FASE 0 — BASELINE, INVENTORY, DAN SAFETY FREEZE

## Tujuan

Mengamankan sistem agar fitur berbahaya tidak terus dianggap authoritative selama refactor berlangsung.

## Pekerjaan

### 6.1 Buat baseline manifest

Catat:

- current commit;
- seluruh service;
- endpoint aktif;
- schema Python;
- schema Zod;
- DB models;
- migrations;
- frontend route;
- mock data;
- feature flags;
- test counts;
- benchmark counts;
- known stale docs.

### 6.2 Feature flag darurat

Tambahkan feature flags:

```text
DI_ENABLE_RAB_MATERIALIZATION=false
DI_ENABLE_PHYSICAL_QUANTITY=false
DI_ENABLE_MOCK_FALLBACK=false untuk production
DI_ENABLE_LIVE_AI_TESTS=false permanen pada test
```

### 6.3 Hentikan occurrence sebagai quantity

Sebelum architecture rebuild selesai:

- jangan tampilkan `occurrence_count` sebagai `pcs` atau `ea`;
- ubah label menjadi `context groups`;
- ubah tab quantity menjadi `Detected References` apabila datanya belum Measurement Fact;
- jangan izinkan handoff ke RAB dari contextual occurrence.

### 6.4 Perbaiki bug langsung

- `missing_data` menjadi `missing_information`;
- hapus duplicate page image route;
- sanitasi filename;
- tambahkan upload size limit;
- tambahkan PDF magic-byte validation;
- jangan resolve review locally jika backend gagal;
- hapus hardcoded Floor 2, scale 1:100, R1, confidence 90 dari real-data path.

### 6.5 Production mock policy

- mock hanya boleh aktif pada explicit demo mode;
- production mode harus fail empty/not-ready;
- jangan fallback diam-diam ke mock.

## Verification

- tests untuk feature flags;
- tests untuk no-occurrence-as-pcs;
- route uniqueness test;
- upload validation test;
- production mock disabled test;
- missing-information retrieval test.

## Exit condition

Sistem tidak lagi menampilkan contextual occurrence sebagai physical quantity dan RAB materialization aman dinonaktifkan.

---

# 7. FASE 1 — DOCUMENTATION DAN ACTIVE STATE RECONCILIATION

## Tujuan

Menghapus perbedaan antara kondisi `main` dan dokumentasi agar agent tidak mengerjakan ulang fitur yang sudah ada.

## Pekerjaan

Perbarui:

- `docs/ai-map/STATE_CURRENT.md`;
- `README.md`;
- `docs/INDEX.md`;
- Drawing Intelligence architecture docs;
- API docs document-intelligence;
- API docs services/db;
- API docs Core Engine;
- provider status;
- branch status;
- migration status;
- frontend V1/V2 status;
- deprecation status TKG.

Tandai dokumen lama:

- historical;
- superseded;
- archived;
- no longer authoritative.

Buat satu dokumen:

```text
docs/plans/drawing intelligence/DI_SOURCE_OF_TRUTH.md
```

Berisi:

- architecture layer;
- active files;
- deprecated files;
- source-of-truth rules;
- provider testing prohibition;
- evidence and quantity authority.

## Verification

- link checker;
- stale branch phrase search;
- duplicate architecture source search;
- docs reference active paths.

---

# 8. FASE 2 — EVIDENCE TRUTH LAYER

## Tujuan

Menjamin seluruh fakta yang disajikan kepada Command Room dan UI dapat ditelusuri ke bukti asli.

## Masalah yang harus dihapus

Persistence saat ini membangun placeholder:

- `raw_text = evidence_id`;
- `bbox = null`;
- `source_dem_id = null`;
- edge evidence kosong;
- aliases kosong;
- communities kosong.

Hal tersebut harus dihapus total.

## 8.1 Evidence model v2

Buat kontrak evidence:

```json
{
  "evidence_id": "EV-...",
  "project_id": "...",
  "document_id": "...",
  "revision_id": "...",
  "run_id": "...",
  "dem_page_id": "...",
  "page_index": 0,
  "sheet_id": "...",
  "view_id": "...",
  "zone_id": "...",
  "modality": "native_pdf_text|vector|ocr|vision|human",
  "kind": "text|symbol|geometry|table_cell|dimension|note",
  "raw_content": "K1",
  "normalized_content": "K1",
  "bbox_source": [0,0,0,0],
  "bbox_normalized": [0,0,0,0],
  "polygon_source": [],
  "polygon_normalized": [],
  "confidence": 0.0,
  "extractor": {
    "provider": "...",
    "model": "...",
    "version": "...",
    "prompt_version": "..."
  },
  "artifact_hash": "sha256:...",
  "created_at": "..."
}
```

## 8.2 Evidence immutability

Evidence records immutable.

Koreksi tidak menimpa evidence. Koreksi membuat:

- interpretation overlay;
- corrected observation;
- new verified entity;
- superseding record.

## 8.3 Rewrite synthesis persistence

Tulis ulang `synthesis_task.py` agar:

1. Mengambil evidence asli dari DEM page result.
2. Menyimpan evidence lengkap.
3. Menyimpan node evidence.
4. Menyimpan edge evidence.
5. Menyimpan aliases.
6. Menyimpan communities.
7. Menyimpan resolver metadata.
8. Menyimpan `level_id` yang benar.
9. Menyimpan property-level evidence.
10. Menggunakan source manifest hash berbasis content, bukan hanya `run-id`.

## 8.4 Evidence foreign keys

Tambahkan FK/constraint:

- node evidence → node + evidence dalam snapshot sama;
- edge evidence → edge + evidence dalam snapshot sama;
- evidence project harus sama;
- tidak boleh orphan;
- tidak boleh duplicate conflicting evidence ID.

## 8.5 Evidence citation package

Command Room harus menerima:

- evidence ID;
- sheet;
- page;
- bbox;
- raw excerpt;
- status;
- source modality.

UI harus dapat membuka sheet dan highlight bbox.

## Verification

- roundtrip DEM → PCKM evidence;
- no placeholder raw text;
- no null bbox jika sumber mempunyai bbox;
- edge evidence preserved;
- property evidence preserved;
- citation opens correct page;
- snapshot build rejects dangling evidence;
- evidence immutability test.

## Exit condition

Setiap claim PCKM dapat ditelusuri ke evidence asli, bukan placeholder.

---

# 9. FASE 3 — CANONICAL COORDINATE SYSTEM

## Tujuan

Menghapus percampuran pixel, normalized, PDF points, crop, rotation, dan viewport coordinates.

## 9.1 Coordinate spaces

Dukung:

- PDF point space;
- raster pixel space;
- normalized page space;
- crop/zone space;
- viewport space;
- engineering/world coordinate jika scale dan origin diketahui.

## 9.2 Page transform model

```json
{
  "page_width_pdf": 841.89,
  "page_height_pdf": 595.28,
  "render_width_px": 4967,
  "render_height_px": 3508,
  "rotation_degrees": 0,
  "crop_box_pdf": [],
  "pdf_to_pixel": [],
  "pixel_to_normalized": [],
  "normalized_to_pdf": []
}
```

## 9.3 Canonical storage

Simpan geometry dalam:

- source coordinate;
- normalized coordinate.

Seluruh resolver memakai normalized coordinate.

## 9.4 View dan zone boundary

Sebelum nearest association:

- element dan target harus berada pada view sama;
- berada dalam drawing zone sama;
- tidak menyeberangi table boundary;
- tidak menghubungkan legend ke plan occurrence;
- tidak menghubungkan title block ke model space;
- tidak menghubungkan dua viewport berbeda.

## 9.5 Threshold relatif

Ganti absolute `120.0` dengan:

- persentase diagonal view;
- scale-aware threshold;
- relation-specific threshold.

## 9.6 Overlay UI

UI harus render bbox/polygon menggunakan transform canonical.

Tidak boleh procedural fake geometry untuk data production.

## Verification

- pixel and normalized fixture produce same relationships;
- rotated page overlay;
- crop-box page overlay;
- no cross-view nearest link;
- resolution independence;
- transform roundtrip tolerance.

---

# 10. FASE 4 — DEM V2 TYPED OBSERVATIONS

## Tujuan

Mengganti `ObservationValue` generik secara bertahap dengan typed observations tanpa merusak compatibility.

## 10.1 Typed observation classes

Bangun:

- `TextSpanObservation`;
- `DimensionObservation`;
- `GridAxisObservation`;
- `GridIntersectionObservation`;
- `LevelMarkerObservation`;
- `SpaceLabelObservation`;
- `ElementTagObservation`;
- `SymbolObservation`;
- `TableObservation`;
- `TableCellObservation`;
- `ReferenceCalloutObservation`;
- `MaterialObservation`;
- `NoteObservation`;
- `GeometryPrimitiveObservation`;
- `DrawingZoneObservation`.

## 10.2 Migration strategy

- pertahankan reader v1;
- buat adapter v1 → v2;
- output baru memakai v2;
- snapshot mencatat schema version;
- test fixture lama tetap dapat dibaca;
- jangan menghapus v1 sebelum migration selesai.

## 10.3 Evidence requirements

Validator wajib:

- `extracted` minimal satu evidence;
- `ai_interpreted` minimal satu evidence dan interpretation method;
- `conflicting` minimal dua evidence;
- `human_verified` membutuhkan verification record;
- hanya `missing` boleh tanpa evidence.

## 10.4 Dimensions

Dimension observation harus menyimpan:

- raw text;
- numeric value;
- unit;
- dimension line;
- extension points;
- orientation;
- object candidates;
- scale context;
- evidence.

## 10.5 Tables

Table harus menyimpan:

- table bbox;
- rows/columns;
- header cells;
- merged cells;
- cell bbox;
- reading order;
- row-to-element mapping candidates.

## 10.6 Symbols

Symbol harus menyimpan:

- bbox/polygon;
- visual signature;
- rotation;
- scale;
- candidate class;
- legend reference;
- confidence breakdown.

## Verification

- v1 fixture parses;
- v2 roundtrip;
- schema parity Python/Zod;
- evidence validator;
- typed table/dimension/symbol fixture tests.

---

# 11. FASE 5 — PCKM V2: REFERENCE VS PHYSICAL ELEMENT

## Tujuan

Menghapus kesalahan semantik bahwa grouped labels dianggap physical occurrence.

## 11.1 Node taxonomy baru

Tambahkan atau gunakan jelas:

- `element_type`;
- `element_reference`;
- `symbol_candidate`;
- `geometry_candidate`;
- `physical_element_candidate`;
- `physical_element`;
- `measurement_fact`;
- `work_item_candidate`.

Jika schema tidak ingin terlalu banyak node type, gunakan typed properties tetapi tetap bedakan status authority.

## 11.2 Rename legacy occurrence semantics

Current `element_occurrence` yang berasal hanya dari label/context harus dimigrasikan menjadi:

```text
contextual_element_reference
```

atau tetap memakai node type lama tetapi wajib property:

```json
{
  "occurrence_semantics": "context_group_not_physical",
  "physical_count_eligible": false
}
```

## 11.3 Physical candidate gate

Sebuah physical candidate hanya boleh dibuat jika ada:

- symbol atau geometry basis;
- level;
- view;
- spatial locator;
- type association candidate;
- source evidence;
- unique candidate ID.

## 11.4 Verified physical element gate

Menjadi verified jika:

- human verified; atau
- deterministic geometry rule dengan threshold yang telah benchmark dan tidak ambigu;
- tidak mempunyai conflict terbuka;
- tidak berasal dari schedule/legend/detail-only region.

## 11.5 Counts

Pisahkan:

```json
{
  "label_observation_count": 12,
  "context_group_count": 4,
  "physical_candidate_count": 10,
  "verified_physical_count": 8
}
```

Hanya `verified_physical_count` boleh dipakai untuk quantity.

## 11.6 Type vs instance

- type definition berasal dari schedule/detail/legend;
- physical instance berasal dari plan/model geometry;
- detail tidak membuat instance;
- schedule tidak membuat instance;
- section hanya mengonfirmasi atau memberi property.

## Verification

- schedule produces zero physical element;
- plan label without symbol produces reference only;
- symbol + type + level produces candidate;
- human verification promotes candidate;
- physical count excludes references;
- UI labels correct.

---

# 12. FASE 6 — CONSTRAINT-BASED ENTITY RESOLUTION

## Tujuan

Mengganti nearest-only linking dengan candidate generation + constraints + scoring + audit.

## 12.1 Candidate generation

Buat kandidat relationship untuk:

- label ↔ symbol;
- label ↔ dimension;
- element ↔ grid;
- element ↔ level;
- element ↔ space;
- reference ↔ detail;
- type ↔ schedule row;
- physical candidate ↔ type.

## 12.2 Constraints

Gunakan:

- same view;
- same zone;
- distance;
- direction;
- leader line;
- table row alignment;
- typography;
- legend match;
- schedule match;
- grid intersection;
- discipline;
- revision;
- cross-sheet consistency;
- no boundary crossing;
- no competing candidate with similar score.

## 12.3 Resolution states

```text
proposed
validated
accepted
ambiguous
conflicting
rejected
human_verified
```

## 12.4 Resolver audit

Setiap edge inferred menyimpan:

```json
{
  "method": "constraint_scored_binding_v2",
  "resolver_version": "...",
  "candidates_considered": 4,
  "score_breakdown": {},
  "passed_constraints": [],
  "failed_constraints": [],
  "rejected_candidate_ids": []
}
```

## 12.5 Confidence calibration

Pisahkan:

- OCR score;
- detector score;
- geometry score;
- legend score;
- schedule score;
- consistency score;
- calibrated score.

Jangan menganggap satu confidence float dari LLM sebagai probabilitas final.

## Verification

- no cross-viewport dimension binding;
- ties become ambiguous;
- far candidate rejected;
- schedule row alignment test;
- leader-line test;
- conflict preserved.

---

# 13. FASE 7 — REVISION LINEAGE DAN INCREMENTAL SYNTHESIS

## Tujuan

Mengelola drawing revision secara aman dan menghindari rebuild seluruh proyek untuk perubahan kecil.

## 13.1 Revision model

Tambahkan:

- document revision;
- sheet revision;
- issue date;
- issue purpose;
- status;
- supersedes;
- superseded by;
- revision cloud region;
- effective date;
- active revision flag.

## 13.2 Effective truth

PCKM aktif hanya memakai revision efektif.

Revision lama tetap tersedia untuk audit tetapi tidak ikut retrieval default.

## 13.3 Dependency graph

```text
Artifact
→ Evidence
→ Observation
→ Entity Candidate
→ Graph Node/Edge
→ Summary View
→ Retrieval Cache
→ Measurement Fact
→ RAB Proposal
```

## 13.4 Incremental invalidation

Jika page berubah:

- invalidate evidence page tersebut;
- rebuild observation page;
- rebuild affected entity candidates;
- rebuild affected nodes/edges;
- rebuild summary terkait;
- invalidate query cache terkait;
- tandai corrections stale bila target hilang;
- jangan rebuild seluruh proyek bila tidak perlu.

## 13.5 Stable IDs

Stable ID berdasarkan semantic identity + revision lineage, bukan urutan list.

## Verification

- new sheet revision supersedes old;
- retrieval excludes old revision;
- one-page revision rebuilds affected graph only;
- accepted correction carried or marked stale;
- snapshot lineage reproducible.

---

# 14. FASE 8 — DATABASE INVARIANTS DAN PERSISTENCE HARDENING

## Tujuan

Memindahkan invariant penting dari convention application ke database.

## Constraints

- satu active snapshot per project;
- node project sama dengan snapshot project;
- edge endpoints berada dalam snapshot sama;
- evidence berada dalam snapshot sama;
- confidence 0–1;
- valid status enum/check;
- unique `(run_id, page_index)`;
- immutable activated snapshot;
- correction target valid;
- accepted correction mempunyai reviewer/time;
- materialized proposal idempotent;
- Measurement Fact unique version;
- source manifest unique sesuai policy.

## Migrations

- migration forward;
- migration backward jika feasible;
- backfill script;
- dry-run report;
- no destructive migration tanpa backup path.

## Verification

- DB constraint tests pada SQLite compatibility dan PostgreSQL target;
- snapshot immutability;
- cross-project insertion rejection;
- duplicate active snapshot rejection;
- orphan evidence rejection.

---

# 15. FASE 9 — RETRIEVAL ENGINE V2

## Tujuan

Membuat retrieval scalable, deterministic, evidence-aware, dan token-bounded.

## 15.1 Query plan

```text
Natural query
→ intent
→ entity extraction
→ level/discipline/view filters
→ exact/alias search
→ text/trigram search
→ optional semantic fallback
→ bounded graph traversal
→ evidence reranking
→ context serialization
```

## 15.2 DB-native traversal

Ganti full graph load dengan:

- indexed seed lookup;
- recursive CTE;
- relation-specific queries;
- bounded frontier;
- precomputed summary views;
- exact direction handling.

## 15.3 Search indexes

Gunakan:

- normalized exact index;
- alias index;
- PostgreSQL FTS;
- trigram;
- optional pgvector sebagai fallback, bukan truth source.

## 15.4 Missing information

Pastikan intent mencari `missing_information`, bukan `missing_data`.

## 15.5 Context contract

```json
{
  "intent": "ELEMENT_LOOKUP",
  "data_status": "grounded|partial|empty|not_ready|calculation_required",
  "facts": [],
  "relationships": [],
  "conflicts": [],
  "missing_information": [],
  "citations": [],
  "allowed_claims": [],
  "forbidden_claims": [],
  "quantity_authority": "none|measurement_fact|core_engine"
}
```

## 15.6 Token budget

Hitung seluruh payload:

- nodes;
- properties;
- edges;
- evidence;
- notes;
- citations;
- system prompt;
- recent messages;
- memory;
- tool schema.

Gunakan tokenizer provider-specific atau estimator konservatif.

## Verification

- no full graph load on normal query;
- query plan tests;
- level+entity filter;
- missing info test;
- conflict test;
- token ceiling test;
- cross-project isolation;
- benchmark PLHUT tetap lulus.

---

# 16. FASE 10 — COMMAND ROOM CONTEXT, MEMORY, DAN CLAIM VERIFICATION

## Tujuan

Mencegah AI menambahkan klaim yang tidak ada dan mengendalikan token.

## 16.1 Server-built context

Jangan mempercayai 40 raw messages sebagai context final.

Server membangun:

```text
System policy
+ project retrieval context
+ durable memory relevan
+ conversation summary
+ 4–8 recent turns
+ current query
```

## 16.2 Hard limits

- hard input token ceiling;
- hard output limit;
- tool call limit;
- continuation limit;
- duplicate context removal;
- no arbitrary 1.28M character payload.

## 16.3 Claim pipeline

```text
User query
→ intent
→ execution plan
→ tools
→ candidate claims
→ claim verifier
→ answer composer
→ citation validator
```

## 16.4 Claim verifier

Setiap claim proyek wajib:

- mempunyai evidence atau tool result;
- mempunyai authority class;
- tidak melampaui verification status;
- tidak menyembunyikan conflict;
- tidak mengubah context group menjadi physical count;
- tidak menghitung final quantity.

## 16.5 Numeric authority

Tandai setiap angka:

- written fact;
- verified measurement;
- core-engine result;
- non-authoritative reference;
- forbidden inference.

## 16.6 Memory

Pisahkan:

- conversation memory;
- project facts;
- user preferences;
- corrections;
- decisions;
- temporary run state.

Jangan menyimpan AI hallucination sebagai durable project fact.

## 16.7 Status summarizer

- tidak boleh memblokir chat;
- rate-limited;
- dapat dimatikan;
- test memakai stub;
- jangan melakukan API live.

## Verification

- unsupported claim removed;
- conflict surfaced;
- physical count refusal;
- Core Engine routing;
- max history compaction;
- memory source separation;
- no API provider test.

---

# 17. FASE 11 — FRONTEND TRUTHFULNESS DAN REAL DATA WORKSPACE

## Tujuan

Menghapus keadaan UI terlihat production tetapi sebenarnya memakai mock/hardcode.

## 17.1 Mode eksplisit

```text
demo
local-development
production
```

Production tidak boleh fallback ke mock.

## 17.2 Sheet mapping

Gunakan data nyata untuk:

- sheet number;
- title;
- discipline;
- level;
- scale;
- revision;
- confidence;
- status;
- image URL.

Unknown tetap unknown.

## 17.3 Canvas

- render PNG/PDF page asli;
- overlay bbox/polygon asli;
- no procedural mock geometry;
- evidence click-to-highlight;
- zoom/pan coordinate-safe.

## 17.4 Detected References vs Quantities

Sebelum Measurement Facts tersedia:

- tampilkan references;
- tampilkan context groups;
- tampilkan candidates;
- jangan tampilkan pcs final.

## 17.5 Quantity view

Hanya Measurement Facts atau Core Engine output boleh masuk quantity tab.

## 17.6 Empty/error state

Tampilkan:

- extraction pending;
- synthesis pending;
- graph not ready;
- evidence incomplete;
- revision conflict;
- quantity blocked;
- Core Engine required.

## Verification

- production no mock;
- no hardcoded floor/scale/revision/confidence;
- overlay correct;
- empty state honest;
- quantity source authority visible.

---

# 18. FASE 12 — REVIEW, CORRECTIONS, DAN HUMAN-IN-THE-LOOP

## Tujuan

Membuat review queue benar-benar persistent dan memengaruhi graph.

## 18.1 Workflow

```text
Review Queue Item
→ Correction Proposal
→ Accept/Reject/Edit
→ Correction Record
→ Cache invalidation
→ Graph overlay or new snapshot
→ UI refresh
```

## 18.2 Queue item identity

Review queue item dapat bersifat computed, tetapi UI harus membuat correction record sebelum resolve.

Jangan mengirim synthetic queue ID sebagai correction ID.

## 18.3 No local-only resolution

Jika backend gagal:

- jangan ubah item menjadi resolved;
- tampilkan error;
- pertahankan state open.

## 18.4 Correction types

Dukung:

- rename;
- reclassify;
- relocate;
- change dimension;
- merge;
- split;
- reject candidate;
- verify physical element;
- add missing relation;
- mark superseded.

## 18.5 Snapshot carry-forward

Correction harus:

- dibawa ke snapshot baru jika target stabil;
- ditandai stale jika target berubah;
- tidak diterapkan diam-diam jika evidence revision berubah.

## Verification

- create/resolve correction;
- UI state only changes after success;
- cache invalidation;
- carry-forward;
- stale correction handling;
- audit log.

---

# 19. FASE 13 — MEASUREMENT FACTS DAN UNIT SYSTEM

## Tujuan

Membangun lapisan authoritative sebelum RAB.

## 19.1 Measurement Fact schema

```json
{
  "measurement_id": "M-...",
  "project_id": "...",
  "snapshot_id": "...",
  "measurement_type": "count|length|area|volume_input|mass_input",
  "value": 0.0,
  "unit": "m|m2|m3|kg|unit",
  "source_method": "verified_instances|written_dimension|geometry_engine|human_input",
  "element_ids": [],
  "evidence_refs": [],
  "formula_inputs": [],
  "verification_status": "candidate|human_verified|engine_verified|superseded",
  "created_by": "...",
  "created_at": "..."
}
```

## 19.2 Strong dimensional types

Jangan gunakan float tanpa unit.

Gunakan typed quantities atau unit library.

Contoh:

```text
Length(mm=400)
Length(m=0.4)
Area(m2=0.16)
Volume(m3=0.56)
```

## 19.3 Conversion

- mm → m;
- mm² → m²;
- mm³ → m³;
- cm, m, inch jika dibutuhkan;
- scale-aware drawing distance.

## 19.4 Quantity eligibility

Count hanya dari verified physical elements.

Length/area hanya dari:

- verified geometry; atau
- written dimensions dengan unit dan binding valid.

Volume hanya dihitung Core Engine dari typed dimensions.

## 19.5 Assumptions

Quantity assumptions harus mempunyai:

- typed field;
- unit;
- scope;
- rationale;
- owner;
- approval;
- expiration/staleness;
- evidence or explicit human assumption source.

Jangan parse free text menjadi volume final.

## Verification

- 400×400×3500 mm = 0.56 m³;
- incompatible units rejected;
- missing dimension blocked;
- contextual occurrence cannot create count;
- assumption requires approval;
- measurement supersession.

---

# 20. FASE 14 — CORE ENGINE SERVICE BOUNDARY

## Tujuan

Menghapus import Core Engine melalui filesystem dari services/db.

## 20.1 Typed API

Buat endpoint Core Engine untuk:

- compute count-derived quantity;
- compute length;
- compute area;
- compute volume;
- build work item quantities;
- compute RAB lines;
- return formula and provenance.

## 20.2 Request contract

```json
{
  "project_id": "...",
  "snapshot_id": "...",
  "measurement_fact_ids": [],
  "calculation_type": "concrete_column_volume",
  "inputs": [],
  "requested_by": "..."
}
```

## 20.3 Response contract

```json
{
  "calculation_id": "...",
  "status": "complete|blocked|needs_input",
  "formula": "...",
  "substituted_formula": "...",
  "result": 0.56,
  "unit": "m3",
  "input_sources": [],
  "engine_version": "...",
  "warnings": []
}
```

## 20.4 Service isolation

- DB tidak import Core Engine module;
- gunakan authenticated HTTP;
- timeout/retry/idempotency;
- no silent fallback dummy functions;
- deployment topology independent.

## Verification

- service contract test;
- no sys.path injection;
- Core Engine unavailable → blocked, not fabricated;
- idempotent calculation;
- unit correctness.

---

# 21. FASE 15 — RAB BRIDGE V2

## Tujuan

Membuat handoff aman dari verified project knowledge ke RAB.

## 21.1 Alur final

```text
Verified Physical Elements
→ Measurement Facts
→ Work Item Candidates
→ AHSP Candidate Set
→ Human Approval
→ Core Engine Calculation
→ RAB Draft
```

## 21.2 Work breakdown

Satu elemen dapat menghasilkan banyak work item.

Kolom beton dapat menghasilkan:

- beton;
- bekisting;
- pembesian;
- curing;
- pekerjaan pendukung.

## 21.3 AHSP matching

Token overlap hanya boleh menjadi candidate generator.

Ranking harus mempertimbangkan:

- discipline;
- work category;
- unit compatibility;
- material;
- method;
- WBS;
- regional catalog;
- description;
- exclusions;
- human selection history.

Tidak ada auto-final AHSP.

## 21.4 Proposal lifecycle

```text
draft
candidate_ready
needs_review
approved
calculation_pending
calculated
materialized
rejected
superseded
```

## 21.5 Idempotency

Materialization tidak boleh menggandakan RAB lines bila endpoint dipanggil dua kali.

## 21.6 Provenance

Setiap RAB line menyimpan:

- Measurement Fact IDs;
- Calculation ID;
- evidence IDs;
- AHSP selection approval;
- snapshot ID;
- revision;
- created by;
- materialized at.

## Verification

- one element → multiple work candidates;
- incompatible AHSP unit rejected;
- repeated materialize no duplicate;
- blocked missing measurement;
- Core Engine result preserved;
- no direct generic volume parser.

---

# 22. FASE 16 — DURABLE JOBS DAN OBJECT STORAGE

## Tujuan

Menghilangkan ketergantungan pada FastAPI BackgroundTasks dan ephemeral local disk.

## 22.1 Artifact storage

Gunakan object storage abstraction:

- original PDF;
- rendered pages;
- crops;
- intermediate artifacts;
- benchmark fixtures.

## 22.2 Durable queue

Gunakan abstraction yang dapat diimplementasikan dengan:

- Cloud Tasks/PubSub;
- SQS;
- Redis queue;
- local durable worker untuk dev.

## 22.3 Job lifecycle

```text
queued
leased
running
retry_wait
partially_failed
completed
failed
cancelled
```

## 22.4 Worker safety

- lease timeout;
- heartbeat;
- retry count;
- exponential backoff;
- idempotency key;
- cancellation;
- resume;
- poison job handling.

## 22.5 Multi-instance safety

File dan job dapat diproses instance berbeda.

Tidak bergantung pada path lokal.

## Verification

- restart worker resume;
- duplicate delivery idempotent;
- object unavailable error;
- partial page retry;
- synthesis resumes;
- no live AI provider call.

---

# 23. FASE 17 — SECURITY, TENANCY, DAN DATA GOVERNANCE

## Tujuan

Mencegah cross-project access, secret leakage, unsafe upload, dan unauthorized correction/RAB actions.

## Pekerjaan

- project membership check;
- internal service identity standard;
- scoped service tokens;
- upload validation;
- filename sanitization;
- MIME and magic bytes;
- max pages;
- max render pixels;
- encrypted PDF handling;
- malware scanning hook;
- audit logs;
- rate limiting;
- correction permissions;
- RAB approval permissions;
- evidence access permissions;
- signed artifact URLs;
- retention policy;
- deletion workflow;
- PII and project confidentiality.

## Verification

- cross-project retrieval denied;
- cross-project artifact denied;
- invalid internal identity denied;
- oversized PDF rejected;
- path traversal filename rejected;
- unauthorized RAB materialization denied;
- audit log created.

---

# 24. FASE 18 — OBSERVABILITY DAN COST CONTROL

## Tujuan

Mengetahui kualitas, biaya, latency, failure, dan status setiap pipeline tanpa menebak.

## Metrics

### DEM

- pages processed;
- pages failed;
- retries;
- evidence per page;
- dangling refs;
- coordinate-space distribution;
- completion consistency;
- extraction duration;
- stored token usage metadata dari existing runs, tanpa API test baru.

### PCKM

- nodes by type;
- references;
- physical candidates;
- verified physical elements;
- ambiguous edges;
- conflicts;
- missing information;
- snapshot build duration.

### Retrieval

- query intent;
- seed count;
- nodes returned;
- context token estimate;
- cache hit;
- latency;
- empty/not-ready/calculation-required rate.

### Review

- queue size;
- correction acceptance;
- stale correction;
- time to resolution.

### RAB

- proposals;
- blocked items;
- AHSP candidates;
- approved selections;
- calculations;
- materializations.

## Logging

- structured;
- no raw secrets;
- avoid full sensitive drawing text in generic logs;
- correlation IDs;
- run ID;
- project ID;
- snapshot ID;
- calculation ID.

## Verification

- metrics emitted;
- logs redact secret;
- correlation trace end-to-end;
- cost dashboard uses stored metadata only.

---

# 25. FASE 19 — BENCHMARK DAN GENERALIZATION

## Tujuan

Membuktikan sistem tidak hanya cocok pada PLHUT.

## Larangan

Tidak menggunakan API key eksternal untuk membuat extraction baru.

Gunakan:

- existing DEM fixtures;
- sanitized stored outputs;
- manually prepared deterministic fixtures;
- synthetic geometry fixtures;
- additional uploaded test artifacts yang sudah tersedia lokal;
- local parser/vector pipeline.

## Benchmark suites

### Evidence

- evidence coverage;
- dangling refs;
- bbox accuracy;
- citation correctness;
- property provenance.

### Semantic

- sheet classification;
- level canonicalization;
- type linking;
- conflict detection;
- cross-sheet reference.

### Physical

- symbol candidate precision/recall;
- physical candidate precision/recall;
- verified count error;
- false positive/negative.

### Measurement

- unit conversion;
- length/area/volume correctness;
- blocked missing inputs;
- formula traceability.

### Retrieval

- intent accuracy;
- seed recall;
- evidence recall;
- irrelevant-context ratio;
- token budget;
- unsupported claim rate.

### UI

- production no mock;
- citation navigation;
- review persistence;
- quantity authority labels.

## Dataset diversity target

- vector PDF;
- raster scan;
- multiple viewport;
- architecture;
- structure;
- MEP;
- different naming convention;
- different symbol convention;
- revision set;
- schedule-heavy drawing;
- legend-heavy drawing.

## Exit condition

PLHUT benchmark tidak regresi dan benchmark kedua/deterministic diversity suite lulus sesuai threshold yang ditetapkan Sonnet 5 dalam ADR.

---

# 26. FASE 20 — LEGACY MIGRATION DAN CLEANUP

## Tujuan

Menghilangkan dua source of truth tanpa merusak data lama.

## TKG

- jadikan legacy adapter;
- tandai non-authoritative;
- project baru memakai DEM/PCKM v2;
- sediakan migration/read compatibility;
- hapus route TKG dari UI utama;
- jangan menghapus history yang dibutuhkan audit.

## Frontend V1/V2

- pilih satu workspace final;
- migrasikan capability real-data;
- archive/remove unreachable implementation;
- tidak ada dua workspace aktif.

## Provider/orchestrator duplication

- satukan duplicate provider logic;
- satukan auth/retry/timeout policy;
- satu model registry;
- satu tool contract.

## Dead code

- hardcoded classifier;
- localStorage-only verification;
- in-memory job registry;
- demo-only endpoint;
- duplicate route;
- stale mock mapping;
- direct Core Engine import dari DB.

## Verification

- Graphify no duplicate active implementations;
- no production import legacy UI;
- compatibility tests;
- no dead route references.

---

# 27. FINAL AUDIT — SATU-SATUNYA AUDIT BESAR

Final Audit hanya dimulai setelah semua fase 0–20 selesai dan seluruh verification lokal hijau.

## 27.1 Architecture audit

Periksa:

- layer separation;
- source of truth;
- evidence lineage;
- physical semantics;
- Measurement Fact authority;
- Core Engine boundary;
- RAB workflow;
- no duplicate implementation.

## 27.2 Evidence audit

- no placeholder evidence;
- no orphan refs;
- raw content preserved;
- bbox preserved;
- edge evidence preserved;
- citation opens correct source;
- revision lineage correct.

## 27.3 Spatial audit

- canonical transforms;
- no mixed-space resolver;
- view/zone constraints;
- threshold relative;
- overlay accuracy.

## 27.4 Quantity audit

- no contextual occurrence as pcs;
- physical count only verified;
- units typed;
- conversion correct;
- Core Engine only final arithmetic;
- no generic free-text volume path.

## 27.5 RAB audit

- no auto-final AHSP;
- multi-work-item support;
- human approval;
- idempotent materialization;
- provenance complete;
- Core Engine calculation IDs.

## 27.6 Retrieval and Command Room audit

- no full graph load for common path;
- token hard limit;
- grounded claim verifier;
- conflict surfaced;
- calculation refusal;
- memory separation;
- no unsupported claim.

## 27.7 Security audit

- tenancy;
- auth;
- artifact access;
- upload safety;
- permissions;
- rate limits;
- logs;
- secrets.

## 27.8 Deployment audit

- no ephemeral dependency;
- durable jobs;
- object storage;
- service-to-service HTTP;
- migration deployment order;
- rollback plan.

## 27.9 Test audit

Jalankan seluruh:

- Python tests;
- TypeScript tests;
- schema tests;
- migration tests;
- integration tests;
- benchmark;
- typecheck;
- lint;
- build;
- security tests;
- network-block test.

Tidak menjalankan live AI API tests.

## 27.10 Final audit report

Buat:

```text
report/report_drawing_intelligence/FINAL_SUPER_REBUILD_AUDIT.md
```

Isi:

- scope;
- commit range;
- architecture before/after;
- problems fixed;
- remaining limitations;
- test results;
- benchmark results;
- security results;
- migration status;
- release recommendation;
- explicit known risks.

Sonnet 5 tidak boleh menyatakan selesai jika report masih mempunyai blocker P0/P1.

---

# 28. DEFINITION OF DONE GLOBAL

Seluruh pekerjaan hanya dianggap selesai jika semua kondisi berikut terpenuhi.

## Evidence

- [ ] Tidak ada placeholder evidence.
- [ ] Tidak ada dangling node/edge evidence pada snapshot aktif.
- [ ] Raw content, bbox, source DEM, dan modality tersimpan.
- [ ] Setiap citation dapat membuka sumber.
- [ ] Activated snapshot immutable.

## Spatial

- [ ] Seluruh resolver memakai canonical normalized coordinates.
- [ ] View dan zone constraints aktif.
- [ ] Tidak ada threshold pixel absolut tanpa transform.
- [ ] Overlay UI tepat.

## Semantics

- [ ] Label/reference terpisah dari physical element.
- [ ] Schedule/detail tidak membuat physical instance.
- [ ] Physical count hanya dari verified elements.
- [ ] Revision lama tidak ikut truth aktif.

## DEM/PCKM

- [ ] Typed observation minimum selesai.
- [ ] Pydantic/Zod parity.
- [ ] Provider output tetap proposal/evidence.
- [ ] Integrity gate fail closed.

## Retrieval

- [ ] `missing_information` berfungsi.
- [ ] Normal query tidak memuat seluruh graph.
- [ ] Context token budget menyeluruh.
- [ ] Cross-project isolation teruji.
- [ ] Existing PLHUT benchmark tidak regresi.

## Command Room

- [ ] Server-built compact context.
- [ ] Claim verifier aktif.
- [ ] Unsupported claims dibuang.
- [ ] Conflict dan missing data selalu terlihat.
- [ ] Kalkulasi final selalu diarahkan ke Core Engine.

## UI

- [ ] Production tanpa mock fallback.
- [ ] Tidak ada default Floor 2/1:100/R1/confidence 90.
- [ ] Context groups tidak disebut pcs.
- [ ] Review persistence benar.
- [ ] Quantity authority terlihat.

## Measurement

- [ ] Strong unit types.
- [ ] mm/cm/m conversion benar.
- [ ] Count/length/area/volume berbeda secara typed.
- [ ] Free-text assumption tidak langsung menjadi final volume.

## Core Engine

- [ ] DB tidak import Core Engine melalui filesystem.
- [ ] Typed service contract tersedia.
- [ ] Formula dan provenance tersimpan.
- [ ] Unavailable engine fail closed.

## RAB

- [ ] RAB Bridge v2 memakai Measurement Facts.
- [ ] AHSP hanya candidate sampai human approval.
- [ ] Satu elemen dapat menghasilkan beberapa work item.
- [ ] Materialization idempotent.
- [ ] Setiap line mempunyai calculation/evidence provenance.

## Infrastructure

- [ ] Object storage digunakan.
- [ ] Durable queue digunakan.
- [ ] Worker resume/idempotency teruji.
- [ ] Tidak bergantung pada local ephemeral PDF.

## Security

- [ ] Upload guard lengkap.
- [ ] Auth/tenant isolation lengkap.
- [ ] Service identity konsisten.
- [ ] Sensitive logs aman.

## Tests

- [ ] Semua tests hijau.
- [ ] Semua builds hijau.
- [ ] Graphify rebuilt.
- [ ] Tidak ada live AI API call.
- [ ] Network-block guard lulus.
- [ ] Final Audit tanpa blocker P0/P1.

---

# 29. URUTAN EKSEKUSI WAJIB

Urutan tidak boleh dibalik secara sembarangan:

```text
0. Safety Freeze
1. Documentation Truth
2. Evidence Truth Layer
3. Canonical Coordinates
4. DEM V2 Typed Observations
5. PCKM Reference vs Physical Model
6. Constraint-Based Resolution
7. Revision + Incremental Synthesis
8. Database Invariants
9. Retrieval V2
10. Command Room Claim Verification
11. Frontend Truthfulness
12. Human Review Workflow
13. Measurement Facts + Units
14. Core Engine Service Boundary
15. RAB Bridge V2
16. Durable Jobs + Object Storage
17. Security + Governance
18. Observability
19. Generalization Benchmark
20. Legacy Cleanup
21. Final Audit
22. Final Integration
```

Alasan urutan:

- RAB tidak boleh dibangun di atas evidence yang hilang.
- Quantity tidak boleh dibangun di atas contextual references.
- Physical detection tidak boleh dibangun di atas coordinate system campuran.
- Command Room tidak boleh dianggap grounded jika citation persistence palsu.
- UI tidak boleh menyajikan quantity sebelum Measurement Fact authority ada.

---

# 30. ORCHESTRATION LOOP SONNET 5

Sonnet 5 wajib menjalankan loop orkestrasi berikut sampai seluruh Definition of Done terpenuhi. Sonnet 5 hanya berpikir, memutuskan, memberikan instruksi, memantau, dan mengevaluasi; seluruh tindakan operasional dilakukan agent:

```text
1. Pilih work package berikutnya
2. Perintahkan agent pelaksana menggunakan Graphify
3. Evaluasi Graphify findings dan tentukan impact set
4. Berikan instruksi lengkap kepada agent Antigravity
5. Pantau seluruh agent melalui Haiku Watchdog setiap 60 detik
6. Jika Antigravity berhenti atau limit habis, redispatch ke Luna High Effort dan/atau 1–3 Haiku
7. Perintahkan agent pelaksana mengintegrasikan hasil dan membuat commit atomik
8. Perintahkan agent Claude Haiku menjalankan seluruh verification formal
9. Evaluasi laporan verification Haiku
10. Jika gagal, berikan instruksi koreksi kepada agent pelaksana
11. Perintahkan Haiku mengulang verification sampai hijau
12. Perintahkan agent menjalankan graphify update . dan mencatat progress ledger
13. Lanjut tanpa meminta review owner
```

Jika agent Antigravity berhenti:

```text
Capture state oleh Watchdog
→ Sonnet 5 memberikan instruksi dispatch Luna High Effort
→ Jika perlu paralelkan 1–3 Haiku
→ Agent pelaksana mengintegrasikan perubahan
→ Agent Haiku menjalankan verification formal
→ Sonnet 5 mengevaluasi hasil dan menginstruksikan kelanjutan
```

Sonnet 5 baru boleh berhenti ketika:

- seluruh fase selesai;
- seluruh checklist selesai;
- Final Audit selesai;
- tidak ada blocker P0/P1;
- final report dibuat;
- branch siap diintegrasikan;
- seluruh perubahan telah dipahami dan didokumentasikan.

---

# 31. HASIL AKHIR YANG WAJIB DIHASILKAN

1. Codebase Drawing Intelligence yang diperbaiki.
2. Evidence persistence v2.
3. Canonical coordinate system.
4. Typed DEM v2 compatibility layer.
5. PCKM physical entity model.
6. Constraint-based resolver.
7. Revision lineage.
8. Incremental synthesis.
9. DB-native retrieval.
10. Compact Command Room context dan claim verifier.
11. Production UI tanpa mock/hardcode.
12. Persistent correction workflow.
13. Measurement Fact system.
14. Unit-aware Core Engine contracts.
15. RAB Bridge v2.
16. Durable queue dan object storage abstraction.
17. Security hardening.
18. Observability.
19. Generalization benchmark.
20. Legacy cleanup.
21. Migration scripts.
22. Updated active documentation.
23. Final Super Rebuild Audit report.
24. Satu final integration branch yang bersih dan siap merge.

---

# 32. PENUTUP MANDAT

Target pekerjaan ini bukan membuat demo yang terlihat pintar.

Targetnya adalah membuat PAAX mampu membedakan dengan tegas:

- apa yang benar-benar tertulis;
- apa yang hanya dibaca AI;
- apa yang disimpulkan secara deterministik;
- apa yang masih ambigu;
- apa yang mewakili elemen fisik;
- apa yang sudah diverifikasi;
- apa yang menjadi Measurement Fact;
- apa yang dihitung Core Engine;
- apa yang akhirnya masuk RAB.

Prinsip final:

```text
Evidence harus utuh.
Koordinat harus benar.
Makna objek harus benar.
Jumlah fisik harus dapat dibuktikan.
Unit harus eksplisit.
Kalkulasi harus deterministik.
RAB harus mempunyai provenance.
AI tidak boleh menutup kekurangan data dengan tebakan.
```

Sonnet 5 wajib terus berpikir, mengarahkan, menginstruksikan, memantau, dan mengevaluasi sampai seluruh mandat selesai tanpa berhenti dan tanpa meminta owner mengambil keputusan teknis di tengah proses. Sonnet 5 tidak boleh mengerjakan implementasi atau verification secara langsung. Seluruh pekerjaan dilaksanakan penuh oleh agent Antigravity; ketika limit Antigravity habis, pekerjaan dipindahkan ke Codex GPT-5.6 Luna High Effort dan 1–3 Claude Haiku max-effort. Seluruh verification formal dilaksanakan hanya oleh Claude Haiku, dan tidak ada agent yang boleh menggunakan API key AI untuk testing.
