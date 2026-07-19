# FINAL SUPER AUDIT — PAAX DRAWING INTELLIGENCE FASE 1–20

**Tanggal audit:** 19 Juli 2026  
**Repository:** `Wisnu8aji/paax-ai`  
**HEAD yang diaudit:** `b4bce3cfbffd8f8ffc874cbf473ef590000ede13`  
**Rentang perubahan:** `f8cf033db0b36d7d82282dc848445dca1adc38f3..b4bce3cfbffd8f8ffc874cbf473ef590000ede13`  
**Jumlah commit dalam rentang:** 73  
**Jumlah path Git berubah/ditambahkan:** 173  
**Mode audit:** read-only, tanpa perubahan repo, tanpa live AI-provider/API-key test  
**Keputusan:** **NO-GO UNTUK PRODUKSI**

---

## 1. EXECUTIVE VERDICT

Pekerjaan fase 1–20 menghasilkan kemajuan nyata dan cukup besar. Ini bukan sekadar penambahan laporan: terdapat implementasi baru pada evidence persistence, koordinat, physical candidates, constraint resolver, retrieval, Command Room, Measurement Facts, Core Engine boundary, RAB Bridge, durable-job abstraction, security, observability, benchmark, dan cleanup guard.

Namun implementasi saat ini **belum dapat dinyatakan selesai atau production-ready**. Audit menemukan blocker struktural yang berada tepat pada jalur kritis:

1. rantai migration Alembic putus;
2. indeks unik `artifact_hash` bertentangan dengan cara evidence disimpan;
3. bbox normalized berpotensi dinormalisasi ulang hingga koordinatnya rusak;
4. claim gate Command Room tidak mendeteksi jumlah elemen dan dimensi mm/cm;
5. endpoint DEM DB tidak cukup project-scoped dan menerima mass assignment;
6. service synthesis berpotensi gagal RBAC dan tidak mengirim revision scope;
7. production persistence untuk job/artifact masih memakai local/in-memory default.

Repo sendiri telah menyimpan `FINAL_AUDIT_B2_EVIDENCE_LEDGER.md` yang menyatakan keseluruhan Definition of Done masih **FAIL / insufficient evidence**. Audit independen ini memperkuat kesimpulan tersebut dan menemukan blocker konkret tambahan.

### Skor audit

| Area | Skor | Kesimpulan |
|---|---:|---|
| Arah arsitektur | 7.5/10 | Fondasi DEM → PCKM → Retrieval → Core Engine sudah tepat |
| Evidence truth & provenance | 3.0/10 | Persistence membaik, tetapi collision/fallback evidence masih berbahaya |
| Coordinate integrity | 2.0/10 | Transform model ada, tetapi integrasi provider→persistence salah |
| Physical semantics | 6.0/10 | Context group dipisahkan dari physical candidate; belum end-to-end |
| Retrieval | 5.5/10 | Budget/isolation membaik; final full-suite dan scale proof belum ada |
| Command Room numerical safety | 3.0/10 | Claim gate melewatkan contoh pertanyaan inti PAAX |
| UI truthfulness | 3.0/10 | Gate mode ada, tetapi real sync masih memakai hardcode/mock |
| Measurement/Core Engine | 6.0/10 | Typed unit dan 0.56 m³ benar; immutability/boundary belum lengkap |
| RAB Bridge | 5.0/10 | Human approval dan provenance membaik; masih concrete-centric |
| Durable infrastructure | 2.5/10 | Abstraction ada; runtime production masih local/in-memory |
| Security/tenancy | 3.0/10 | Sejumlah kontrol ada; DEM endpoint scope dan secret default bermasalah |
| Migration/deployment readiness | 1.0/10 | Alembic graph putus; upgrade head tidak dapat dipercaya |
| Test assurance | 3.5/10 | Banyak targeted test lulus; full build/migration/full suite belum lulus |
| **Production readiness keseluruhan** | **2.5/10** | **NO-GO** |

---

## 2. RUANG LINGKUP DAN METODE

### 2.1 Sumber yang diperiksa

Audit menggunakan:

- repository GitHub pada commit `b4bce3c`;
- arsip pengguna `fase 1-20.rar`;
- `REPORT.md`, manifest, dan salinan seluruh path yang berubah dalam rentang fase 1–20;
- source code aktual pada GitHub untuk file penting yang tidak lengkap di arsip;
- migration 0015–0029 yang berubah;
- test files yang ditambahkan/diubah;
- Big Plan revisi;
- final evidence ledger yang dibuat agent.

### 2.2 Pemeriksaan yang dilakukan

- perbandingan commit base→HEAD;
- review source code lintas web, DB, document intelligence, core engine, schema, migration;
- pemeriksaan jalur evidence dan coordinate;
- pemeriksaan physical count dan quantity authority;
- pemeriksaan Command Room claim verification;
- pemeriksaan RBAC/project scope;
- pemeriksaan durable jobs/object storage;
- pemeriksaan Measurement Fact dan RAB;
- test Python deterministik;
- probe Alembic revision graph;
- parser sintaks TypeScript/TSX;
- probe custom untuk volume, mutation, claim gate, dan coordinate transform;
- pencarian produksi terhadap mock/hardcode dan modul yang hanya dipakai test.

### 2.3 Batas audit

Arsip `fase 1-20.rar` adalah **change archive**, bukan checkout lengkap seluruh repository. Karena itu:

- test yang mengimpor file lama/tidak berubah dapat gagal collect karena dependency tersebut tidak ada dalam arsip;
- full `pnpm build`, full `tsc`, dan semua Vitest tidak dapat dijalankan hanya dari change archive;
- PostgreSQL production instance tidak tersedia;
- Graphify output tidak ada dalam arsip dan tidak tersimpan pada HEAD GitHub;
- clone repo langsung dari container tidak tersedia pada lingkungan audit.

Keterbatasan tersebut tidak membatalkan blocker yang telah dibuktikan secara source-level atau execution-level. Sebaliknya, keterbatasan tersebut berarti repo **tidak boleh dianggap lulus** hanya karena targeted tests lulus.

---

## 3. HASIL TEST DAN PROBE

### 3.1 Test yang lulus

| Pemeriksaan | Hasil |
|---|---|
| Python `compileall` seluruh file Python dalam change archive | PASS, exit 0 |
| Parser TypeScript 5.8.3 untuk seluruh TS/TSX berubah | 41 file, 0 syntax diagnostic |
| Core Engine `test_units.py` + offline benchmark | 4 passed |
| Document Intelligence safe changed-test suite | 75 passed |
| DB standalone boundary/RAB tests | 10 passed |
| Custom Core Engine concrete-column volume | PASS: 400×400×3500 mm = **0.56 m³** |
| Network/API-key use selama audit | Tidak dilakukan |

### 3.2 Test yang belum dapat dinyatakan lulus

| Pemeriksaan | Status | Alasan |
|---|---|---|
| Full Core Engine suite | BLOCKED | Change archive tidak memuat unchanged `app.export` |
| Full Document Intelligence routes/synthesis suite | BLOCKED | Change archive tidak memuat unchanged `app.auth`, `alias_resolver`, dan dependency lainnya |
| Full DB suite | BLOCKED/UNPROVEN | `aiosqlite`/full checkout tidak tersedia; repo ledger sendiri mencatat unresolved DB invariant/schema failures |
| Full web build/typecheck/Vitest | UNPROVEN | Tidak tersedia full workspace/dependency install |
| PostgreSQL clean migration `upgrade head` | FAIL pada revision graph sebelum DB connection |
| Final Graphify verification | UNPROVEN | `graphify-out` tidak tersedia pada commit/arsip |
| Full network-block suite | UNPROVEN | Tidak ada full checkout/test orchestration |

### 3.3 Probe yang menemukan kegagalan

#### A. Alembic revision graph

Perintah `alembic heads` pada chain 0025–0029 menghasilkan:

```text
Revision 0027_dem_artifacts_and_durable_leases ... is not present
KeyError: '0027_dem_artifacts_and_durable_leases'
```

#### B. Command Room unsupported claims

Dengan authority `none`, tanpa evidence dan tanpa tool:

```text
"Lantai 2 memiliki 12 kolom K1."
→ lolos tanpa claim/rejection

"Dimensi kolom K1 adalah 400 mm x 400 mm."
→ lolos tanpa claim/rejection

"Nilai pekerjaan adalah Rp 120.000.000."
→ ditolak dengan benar
```

Artinya regex hanya melindungi sebagian format angka, bukan pertanyaan inti count/dimension.

#### C. Measurement Fact mutation

Object `MeasurementFact` dapat diubah langsung:

```text
value: 1 → 999
unit: m → mm
```

Tidak ada exception pada ORM object. Klaim “immutable” masih bergantung disiplin repository/API, bukan invariant yang kuat.

#### D. Coordinate double-transform

BBox provider normalized:

```text
(0.1, 0.2, 0.3, 0.4)
```

Jika diproses sebagai PDF coordinate oleh `pdf_to_normalized_bbox`, hasilnya menjadi kira-kira:

```text
(0.000168, 0.000238, 0.000504, 0.000475)
```

Posisi evidence menyusut ke area sangat kecil dekat origin dan tidak lagi menunjuk objek sebenarnya.

---

# 4. BLOCKER P0 — WAJIB DIPERBAIKI SEBELUM PEKERJAAN LAIN

## P0-1 — Rantai Alembic putus

### Bukti

`services/db/alembic/versions/0027_dem_artifacts_and_durable_leases.py`:

```python
revision = "0027"
down_revision = "0026"
```

`services/db/alembic/versions/0028_dem_artifact_retention.py`:

```python
revision = "0028_dem_artifact_retention"
down_revision = "0027_dem_artifacts_and_durable_leases"
```

Revision yang diminta 0028 tidak pernah didefinisikan.

### Dampak

- Alembic tidak dapat membangun revision map;
- `alembic heads`, history, upgrade, dan downgrade dapat gagal;
- deployment DB baru tidak dapat mencapai head;
- semua tabel/constraint fase selanjutnya tidak bisa dipercaya tersedia.

### Perbaikan

Jika 0027/0028 belum pernah dipakai pada environment eksternal:

```python
# 0028
down_revision = "0027"
```

Jika revision salah sudah terdistribusi, jangan rewrite sembarangan. Buat strategi kompatibilitas/bridge migration setelah memeriksa `alembic_version` pada seluruh environment.

### Acceptance gate

- `alembic history` berhasil;
- tepat satu expected head;
- upgrade dari empty DB ke head berhasil di PostgreSQL;
- upgrade dari schema produksi sebelumnya ke head berhasil;
- downgrade satu revision dan re-upgrade berhasil;
- schema diff tidak menunjukkan drift.

---

## P0-2 — Unique `artifact_hash` membuat persistence evidence bertabrakan

### Bukti

Migration 0017 membuat partial unique index global:

```python
op.create_index(
    "ix_project_graph_evidence_artifact_hash_unique",
    "project_graph_evidence",
    ["artifact_hash"],
    unique=True,
    ...
)
```

Sementara `synthesis_task.py` mengisi setiap evidence dari satu dokumen dengan:

```python
"artifact_hash": sheet.source.document_hash
```

Satu PDF biasanya menghasilkan puluhan/ratusan evidence. Seluruhnya memiliki document hash sama.

### Dampak

Setelah migration berhasil, evidence kedua dari dokumen yang sama dapat melanggar unique index. Snapshot persistence dapat gagal meskipun evidence valid.

### Masalah konseptual

`artifact_hash` pada payload saat ini sebenarnya **document hash**, bukan hash evidence/crop. Document hash memang seharusnya berulang.

### Perbaikan

- hapus uniqueness global;
- rename semantic field menjadi `source_document_hash` atau pisahkan:
  - `source_document_hash`;
  - `evidence_content_hash`;
  - `crop_artifact_hash`;
- gunakan index non-unique untuk lookup;
- deduplication harus scoped dan berbasis identitas evidence/snapshot, bukan satu document hash global.

### Acceptance gate

Persist fixture dengan ≥100 evidence dari satu PDF dan dua snapshot berbeda. Seluruh evidence harus tersimpan tanpa collision dan tetap dapat dilacak ke source document.

---

## P0-3 — BBox normalized ditransformasikan ulang sebagai PDF point

### Bukti

Prompt Qwen secara tegas meminta bbox normalized 0–1.

Pada persistence:

```python
bbox_normalized = bbox
if bbox:
    transform = sheet.source.page_transform
    if transform is not None:
        bbox_normalized = transform.pdf_to_normalized_bbox(tuple(bbox))
```

Keberadaan `page_transform` digunakan sebagai asumsi bahwa input bbox adalah PDF coordinate, padahal provider menghasilkan normalized coordinate.

### Dampak

- click-to-highlight salah;
- evidence citation menunjuk lokasi salah;
- nearest-neighbor/constraint resolver memakai jarak salah;
- physical candidate bisa terikat ke grid/level/space yang salah;
- review manusia melihat bukti yang tidak sesuai;
- downstream quantity kehilangan auditability.

### Root cause

Tidak ada `bbox_space`/coordinate provenance pada `EvidenceItem` dan `ObservationValue`. Sistem menebak jenis koordinat dari keberadaan transform.

### Perbaikan

Tambahkan tipe eksplisit:

```text
bbox_space = normalized | pixel | pdf_point | viewport
bbox_source
bbox_normalized
transform_version
```

Canonicalization harus:

- normalized → validate/clamp only;
- pixel → divide by source pixel dimensions;
- PDF point → transform using PDF media/crop/rotation;
- mixed/unknown → quarantine;
- tidak pernah menebak berdasarkan `page_transform` saja.

### Acceptance gate

Test wajib mencakup:

- Qwen normalized bbox + page transform;
- pixel bbox;
- PDF-point bbox;
- rotated page;
- crop box;
- round-trip normalized↔viewport;
- citation click berada pada target fixture yang benar.

---

## P0-4 — Claim verifier melewatkan jumlah kolom dan dimensi

### Bukti

Regex saat ini hanya mengenali:

- rupiah;
- m2/m3/m'/ha;
- hari/minggu/bulan;
- persen;
- pola kode AHSP tertentu.

Regex tidak mencakup:

- `12 kolom`;
- `20 unit`;
- `400 mm`;
- `30 cm`;
- `+4.000 m`;
- jumlah balok/pintu/symbol instance umum.

Probe membuktikan count dan mm dimension lolos tanpa evidence.

### Dampak

Command Room masih dapat memberikan jawaban meyakinkan untuk pertanyaan inti:

- “Lantai 2 ada berapa kolom?”
- “Dimensi K1 berapa?”
- “Ada berapa pintu D1?”
- “Berapa panjang dinding?”

Ini langsung bertentangan dengan target anti-halusinasi PAAX.

### Perbaikan

Solusi ideal bukan memperbesar regex tanpa batas. Gunakan structured answer contract:

```text
tool result
→ candidate claim object
→ authority/evidence binding
→ numeric/unit parser
→ claim verifier
→ renderer
```

Setiap project-specific number harus mempunyai:

```text
claim_id
value
unit/category
source/tool result ID
evidence refs
authority class
conflict status
```

Default policy: project number yang tidak mempunyai authority object **ditolak**, bukan dibiarkan.

### Acceptance gate

Golden tests minimal:

- count kolom/balok/pintu;
- mm/cm/m dimension;
- elevasi;
- area/volume;
- rupiah;
- durasi;
- percentage;
- written schedule fact;
- contextual reference count;
- conflicting dimensions;
- unknown floor.

---

## P0-5 — DEM DB endpoints tidak project-scoped dan menerima mass assignment

### Bukti

Endpoint berikut hanya memakai `get_current_user`, bukan RoleChecker/project membership:

```text
POST /dem/runs
GET  /dem/runs/{id}
PUT  /dem/runs/{id}
GET  /dem/runs/{id}/status
POST /dem/pages
PUT  /dem/pages/{id}
```

Update memakai:

```python
for key, value in update.items():
    if hasattr(run, key):
        setattr(run, key, value)
```

Pola sama pada page.

### Dampak

Authenticated actor yang mengetahui ID berpotensi:

- membaca run proyek lain;
- mengubah status;
- mengganti project/document/hash/provider/artifact metadata;
- mengubah page result/status;
- merusak audit trail atau lineage.

Global auth pada router memang ada, jadi endpoint tidak public-anonymous. Masalahnya adalah **authorization dan field-level control**, bukan absennya authentication.

### Perbaikan

- route project-scoped: `/projects/{project_id}/dem/...`;
- derive project ID dari run/page dan enforce membership;
- machine write menggunakan service scope spesifik;
- typed update models dengan allowlist;
- field immutable tidak dapat diedit lewat generic update;
- optimistic concurrency/version;
- audit log untuk mutation sensitif.

### Acceptance gate

Test user A tidak dapat read/update run/page project B meskipun mengetahui ID. Service hanya dapat mengubah field sesuai scope.

---

## P0-6 — Synthesis service berpotensi selalu gagal pada RBAC

### Bukti

Synthesis mengirim:

```python
headers["X-User-Id"] = "service-account"
POST /projects/{project_id}/project-graph/snapshots
```

Endpoint tersebut memakai:

```python
RoleChecker(["owner", "pm"])
```

`RoleChecker` hanya mencari `ProjectMember` atau project owner. `internal_scopes` sudah dibuat pada `User`, tetapi tidak dipakai oleh `RoleChecker`.

### Dampak

Kecuali account literal `service-account` dimasukkan menjadi PM/owner pada semua proyek, background synthesis dapat mendapat HTTP 403 dan status berubah menjadi `synthesis_failed`.

### Perbaikan

Tambahkan service-scope authorization yang eksplisit:

```text
project_graph:synthesize
```

Scope harus:

- berasal dari deployment config/token, bukan header bebas;
- terikat pada project/action;
- tidak menjadi global bypass untuk semua endpoint;
- tercatat pada audit log.

### Acceptance gate

Integration test nyata: document-intelligence service identity membuat snapshot untuk project yang sah, ditolak untuk project/scope lain.

---

## P0-7 — Revision lineage tidak terhubung ke DEM synthesis

### Bukti

`DrawingEvidenceSheet` tidak mempunyai field `revision_id`.

Synthesis memakai:

```python
"revision_id": getattr(sheet, "revision_id", None)
```

dan tidak mengirim:

```text
effective_sheet_revision_ids
```

ke snapshot build payload.

Sementara repository DB menolak snapshot jika project memiliki active sheet revision tetapi request tidak menyatakan exact effective revision set. Repository juga menolak evidence yang tidak mempunyai revision ID pada revision-scoped snapshot.

### Dampak

Saat revision system benar-benar digunakan:

- snapshot build dapat gagal;
- evidence lineage selalu `None`;
- active revision tidak dapat dibedakan;
- stale/superseded data berpotensi salah dipakai;
- fase revision lineage hanya bekerja pada test fixture/manual payload, bukan extraction pipeline.

### Perbaikan

Propagasikan:

```text
DemRun/DocumentRevision
→ DemPage/SheetRevision
→ DrawingEvidenceSheet.revision_id
→ evidence.revision_id
→ snapshot.effective_sheet_revision_ids
```

Revision scope harus berasal dari DB source of truth, bukan ditebak dari title block.

### Acceptance gate

Fixture dua revision sheet:

- revision lama superseded;
- revision baru active;
- snapshot hanya memakai evidence revision aktif;
- correction carry-forward akurat;
- revision change invalidates stale snapshot.

---

# 5. TEMUAN P1 — HIGH RISK

## P1-1 — Missing evidence dibuat menjadi evidence palsu

Jika node/edge/property merujuk evidence ID yang tidak ada, synthesis membuat fallback:

```text
kind = text
raw_content = evidence_id
bbox = null
confidence = 0.5
provider = fallback
```

Ini membuat foreign reference terlihat “valid” secara struktural tanpa bukti sumber.

**Perbaikan:** quarantine/reject referencing fact. Jangan fabricate evidence. Snapshot boleh menjadi partial/needs-review, tetapi evidence palsu tidak boleh masuk truth layer.

---

## P1-2 — Duplicate evidence ID lintas halaman silently memilih yang pertama

`seen_ids` bersifat global dan duplicate berikutnya di-skip.

Jika model menggunakan `ev-001` pada beberapa halaman, evidence halaman berikutnya hilang dan node dapat terikat ke evidence dari halaman salah.

**Perbaikan:** evidence ID harus globally namespaced:

```text
run_id:page_index:local_evidence_id
```

Duplicate collision harus menjadi integrity error, bukan first-wins.

---

## P1-3 — DEM typed observations belum masuk production path

`typed_observations.py` mempunyai typed classes dan tests, tetapi pencarian reference menunjukkan modul tersebut hanya dipakai oleh test/adaptor sendiri. Production `DrawingEvidenceSheet` tetap menyimpan 13 list `ObservationValue` generik.

**Kesimpulan:** Fase typed DEM adalah scaffolding, belum migration end-to-end.

**Perbaikan:** wire typed schema ke model output, persistence, synthesis, Zod parity, migration/versioning, dan compatibility reader.

---

## P1-4 — Evidence requirement pada DEM masih opsional

- `ValueWithEvidence.evidence_refs` default empty;
- `ObservationValue.evidence_refs` default empty;
- discipline `InterpretedValue` tidak mempunyai evidence refs;
- bbox evidence optional;
- tidak ada validator status→minimum evidence.

Empty refs tidak dianggap dangling, sehingga fakta extracted/AI-interpreted dapat lolos tanpa evidence.

**Perbaikan:**

- `missing` boleh tanpa evidence;
- `extracted`, `ai_interpreted`, `human_verified` wajib evidence;
- `conflicting` wajib ≥2 evidence atau conflict references;
- discipline wajib evidence/provenance;
- evidence-free facts quarantine.

---

## P1-5 — Resolver audit metadata dipangkas pada persistence

Resolver model diperluas, tetapi edge persistence hanya menyimpan subset tertentu. Candidate set, rejected candidates, score breakdown, constraints, version/calibration berpotensi hilang.

**Perbaikan:** persist full versioned resolver payload dan lindungi ukurannya melalui schema khusus, bukan manual field selection yang mudah tertinggal.

---

## P1-6 — Durable jobs dan object storage masih abstraction, belum production durability

Runtime default:

```python
ARTIFACT_STORE = LocalArtifactStore(...)
JOB_QUEUE = InMemoryDurableJobStore()
```

Pencarian changed production source tidak menemukan composition root yang mengganti object tersebut pada startup.

### Dampak

- process restart menghilangkan queue;
- multi-instance tidak berbagi jobs;
- local artifacts tidak portable;
- lease/retry hanya berlaku di satu process;
- Cloud Run/container ephemeral storage tetap berisiko.

**Perbaikan:** production harus fail startup jika durable adapters tidak dikonfigurasi. Implementasikan DB/queue-backed job store dan real object storage adapter.

---

## P1-7 — Frontend truthful workspace belum benar-benar truthful

`use-backend-sync.ts` masih:

- import `makeGeometry` dari mock;
- unknown floor → Floor 2;
- fabricate sheet code;
- assign semua discipline;
- hardcode sheet size;
- hardcode analyzed date;
- generate procedural geometry;
- default file size.

Lebih kritis:

```typescript
const mappedSheets: Sheet[] = [];
dispatch({ sheets: sheetsData.map(mapProjectDemSheet) });
```

Local `mappedSheets` tetap kosong, tetapi dipakai untuk evidence→sheet dan graph-node→sheet lookup. Akibatnya elemen graph nyata berpotensi tidak pernah dimapping ke workspace.

`quantity-dock.tsx` juga masih merender `MOCK_ASSUMPTIONS`.

**Perbaikan:** satu mapper authoritative; `const mappedSheets = sheetsData.map(...)`; production tidak boleh import mock module; unknown tetap null; real assumptions API.

---

## P1-8 — Measurement Fact “immutable” belum enforced

Docstring ORM menyebut immutable, tetapi:

- tidak ada DB trigger;
- tidak ada ORM `before_update` guard untuk MeasurementFact;
- object dapat dimutasi langsung;
- idempotency yang hanya bergantung pada ID mengasumsikan content tidak berubah.

**Perbaikan:** append-only table/DB trigger, atau versioned content hash dan API yang hanya create/supersede. Update/delete umum harus ditolak.

---

## P1-9 — Core Engine boundary belum mencakup seluruh measurement type

Typed conversion dan concrete column volume bekerja benar. Namun request contract mencantumkan jenis lebih luas, sementara executor utama masih fokus pada concrete-column volume.

**Perbaikan:** implementasikan typed operations count/length/area/volume/work-item dengan Decimal, explicit rounding policy, validation, provenance, dan idempotency.

---

## P1-10 — Core Engine mempunyai unsafe development auth default

Jika `ENV` tidak diatur, default adalah `development`; jika internal key kosong, service menerima `test-internal-key`.

Misconfigured production deployment dapat berjalan dengan known key.

**Perbaikan:** test key hanya ketika `TESTING=1`. Production/staging harus fail startup jika secret tidak tersedia.

---

## P1-11 — Artifact signing mempunyai predictable default secret

Route artifact menggunakan:

```python
os.getenv("ARTIFACT_SIGNING_SECRET", "development-only-artifact-secret")
```

**Perbaikan:** hanya izinkan default pada explicit local test/development. Production harus fail closed tanpa secret yang kuat dan rotated.

---

## P1-12 — RAB Bridge masih concrete-centric

Work breakdown utama masih berfokus pada concrete works. Non-concrete dapat turun menjadi generic primary work item. Candidate ranking belum mempunyai hard minimum semantic threshold yang memadai.

**Perbaikan:** domain-specific work taxonomy untuk structure/architecture/MEP/CIV; no-candidate state; unit/category/method/material hard constraints; human approval tetap wajib.

---

# 6. TEMUAN P2 — MEDIUM RISK / QUALITY DEBT

1. Retrieval masih mempunyai jalur yang memuat candidate nodes/edges ke Python dan dapat membesar pada proyek besar.
2. `communities` persistence menyimpan summary/member count tetapi membership detail perlu diverifikasi end-to-end.
3. Pydantic warnings/deprecation perlu dibereskan sebelum upgrade dependency.
4. Core Engine relative direct dependency menyebabkan `uv run --project` bermasalah pada environment tertentu.
5. Tidak ada visible CI status pada latest commit.
6. Final Graphify state tidak dapat diverifikasi dari repository.
7. Status dan phase reports dapat memberi kesan selesai walaupun final ledger mengatakan FAIL.
8. Beberapa comment/doc masih menyebut mock fallback sebagai perilaku normal.
9. Tidak ada final full web build/typecheck evidence.
10. Tidak ada clean PostgreSQL schema-upgrade artifact/log.

---

# 7. STATUS ULANG FASE 1–20

Status di bawah adalah hasil audit source/test, bukan status laporan agent.

| Fase | Status audit | Catatan |
|---|---|---|
| 1 — Source of truth/docs | PASS dengan catatan | Dokumen dirapikan, tetapi completion language harus tunduk final ledger |
| 2 — Evidence truth | FAIL | artifact hash collision, fallback evidence, duplicate first-wins |
| 3 — Coordinates | FAIL | normalized bbox double-transform |
| 4 — Typed DEM | PARTIAL | typed adapter/test ada, production model masih generic |
| 5 — Reference vs physical | PARTIAL/PASS | separation membaik dan conservative gate ada; full physical pipeline belum dibuktikan |
| 6 — Constraint resolver | PARTIAL | algorithm/test ada; resolver audit persistence belum lengkap |
| 7 — Revision lineage | FAIL end-to-end | DEM tidak membawa revision ID/effective scope |
| 8 — DB invariants | FAIL | Alembic chain broken dan artifact-hash invariant salah |
| 9 — Retrieval v2 | PARTIAL | improvements ada; full suite/scale proof belum ada |
| 10 — Command Room context/claims | FAIL | count dan mm dimension lolos tanpa evidence |
| 11 — Truthful workspace | FAIL/PARTIAL | hardcode/mock dan empty mappedSheets bug |
| 12 — Review/corrections | PARTIAL | persistence membaik; perlu full integration/tenancy retest |
| 13 — Measurement Facts | PARTIAL | typed units benar; immutability belum enforced |
| 14 — Core Engine boundary | PARTIAL | HTTP boundary/0.56 m³ benar; operation coverage/auth perlu perbaikan |
| 15 — RAB Bridge v2 | PARTIAL | approval/provenance baik; taxonomy masih terbatas |
| 16 — Durable jobs/storage | FAIL production | local/in-memory runtime default |
| 17 — Security/governance | FAIL | DEM scope/mass assignment, service RBAC, signing secret |
| 18 — Observability | PARTIAL | instrumentation bertambah; full production validation belum ada |
| 19 — Offline benchmark | PASS terbatas | deterministic offline suite lulus; bukan bukti keseluruhan |
| 20 — Cleanup | PARTIAL | guards ada; duplicate/legacy production paths masih tersisa |

---

# 8. HAL YANG SUDAH BENAR DAN HARUS DIPERTAHANKAN

Audit tidak menyarankan membuang arsitektur yang telah dibangun. Hal berikut valid:

1. DEM dan PCKM tetap menjadi arsitektur utama.
2. Context group telah dipisahkan dari physical quantity.
3. Physical gate bergerak konservatif.
4. Unit conversion deterministik menghasilkan 0.56 m³ dengan benar.
5. DB→Core Engine diarahkan ke HTTP boundary, bukan filesystem import.
6. RAB Bridge mempunyai human approval dan provenance.
7. Upload policy mencakup magic byte, MIME, size/page/pixel/encryption checks.
8. Retrieval mempunyai isolation/budget improvements.
9. Command Room context lebih bounded daripada sebelumnya.
10. Banyak test baru nyata dan berguna.
11. Benchmark fase 19 berjalan offline tanpa menghabiskan AI API key.
12. Tidak perlu mengganti model vision untuk memperbaiki blocker persistence/coordinate/security.

---

# 9. URUTAN REMEDIASI YANG DISARANKAN

## Wave A — Emergency stop-the-line

Kerjakan sebelum fitur baru:

1. perbaiki Alembic 0027→0028 chain;
2. hapus/fix unique artifact hash;
3. perbaiki bbox coordinate provenance/double-transform;
4. tutup claim gate count/mm/cm/elevation;
5. project-scope semua DEM endpoints dan hapus generic mass assignment;
6. perbaiki synthesis service scope;
7. propagate revision IDs/effective scope.

**Exit gate:** clean PostgreSQL upgrade, end-to-end DEM→snapshot fixture, Command Room numerical adversarial suite.

## Wave B — Truth and persistence hardening

1. quarantine missing evidence;
2. namespace evidence IDs;
3. integrate typed DEM v2 production path;
4. enforce evidence-by-status;
5. persist full resolver audit;
6. enforce Measurement Fact append-only.

## Wave C — Production runtime

1. real durable queue;
2. real object storage;
3. startup fail-closed on missing adapters/secrets;
4. service identity/scopes;
5. worker restart/multi-instance tests.

## Wave D — UI and RAB

1. remove production mock imports;
2. fix mappedSheets;
3. real assumptions;
4. expand work-item taxonomy;
5. no-candidate threshold;
6. full provenance viewer.

## Wave E — Final verification

1. full Python suites;
2. full pnpm/Vitest/typecheck/build;
3. migration clean/upgrade/downgrade;
4. network-block suite;
5. active-snapshot DoD fixture;
6. Graphify explicit update/query validation;
7. security cross-project tests;
8. offline benchmark;
9. one final independent audit.

---

# 10. MINIMUM RETEST COMMANDS

Dijalankan dari full checkout, bukan change archive:

```bash
git status --short
git rev-parse HEAD

# Graphify
graphify query "DEM evidence persistence coordinate transform snapshot build"
graphify query "measurement facts core engine RAB bridge"
graphify update .

# Python
python -m compileall services packages
cd services/document-intelligence && python -m pytest -q
cd ../db && python -m pytest -q
cd ../core-engine && python -m pytest -q

# Migration — PostgreSQL clean DB and upgraded DB
cd services/db
alembic history
alembic heads
alembic upgrade head
alembic downgrade -1
alembic upgrade head

# TypeScript
pnpm install --frozen-lockfile
pnpm --filter @paax/schemas test
pnpm --filter @paax/ai-orchestrator test
pnpm --filter @paax/web test
pnpm --filter @paax/web exec tsc --noEmit
pnpm build

# Security/network
# Run repository network-block/provider-stub suite with all AI keys unset.
```

Tambahkan dedicated tests untuk ketujuh P0 sebelum mengulang final audit.

---

# 11. FINAL GO/NO-GO

## Development continuation

**GO**, dengan syarat hanya untuk remediation branch dan deterministic tests.

## Limited internal demo

**CONDITIONAL NO-GO.** Demo hanya aman jika:

- tidak menjalankan migration broken pada shared DB;
- quantity/RAB automation dimatikan;
- evidence overlay tidak diklaim akurat;
- production mock tidak tercampur;
- project data yang digunakan disposable.

## Production / real project data / paid estimation workflow

# **NO-GO**

Alasan penentu:

- DB migration chain putus;
- evidence persistence dapat collision;
- coordinate evidence dapat rusak;
- unsupported count/dimension dapat lolos Command Room;
- project-scope mutation belum aman;
- revision/synthesis path belum connected;
- durable job runtime belum durable;
- full build/full migration/full suite belum lulus.

Repo telah berkembang signifikan, tetapi “fase 1–20 selesai” saat ini berarti **banyak work packages telah diimplementasikan**, bukan bahwa sistem telah memenuhi Definition of Done global.

---

## 12. PRIORITAS ABSOLUT

Urutan yang tidak boleh dibalik:

1. **Alembic chain**
2. **artifact-hash invariant**
3. **bbox coordinate provenance**
4. **Command Room numeric claim gate**
5. **DEM project authorization/mass-assignment**
6. **service RBAC + revision propagation**
7. **production durable adapters**
8. baru kemudian UI/RAB/generalization cleanup
9. full deterministic verification
10. independent final audit

**Kesimpulan akhir:** pertahankan arsitektur, jangan restart proyek, tetapi hentikan klaim production readiness. Lakukan remediation P0 sebagai satu program terpisah sebelum melanjutkan otomatisasi quantity dan RAB.
