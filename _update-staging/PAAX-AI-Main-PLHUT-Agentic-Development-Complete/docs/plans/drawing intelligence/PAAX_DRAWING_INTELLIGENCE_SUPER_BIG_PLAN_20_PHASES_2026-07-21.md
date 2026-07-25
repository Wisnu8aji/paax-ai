# PAAX Drawing Intelligence — Super Big Plan 20 Fase

**Tanggal:** 21 Juli 2026  
**Fokus:** Drawing Intelligence untuk PDF, raster, DWG/DXF, bukti lintas lembar, deteksi berbasis proyek, geometri, review manusia, dan penyajian hasil matang.  
**Di luar scope plan ini:** RAB, harga, schedule, dan otomatisasi estimasi biaya.

## Visi produk

PAAX tidak dibangun sebagai peniru Kreo. Kreo digunakan sebagai salah satu benchmark minimum. Target PAAX adalah sistem yang lebih kuat pada lima hal: membaca primitive vektor asli, menyatukan bukti lintas lembar, belajar dari simbol dan legenda proyek, mempertahankan provenance sampai objek yang dilihat user, serta menolak hasil yang belum cukup kuat daripada menampilkan kepastian palsu.

Alur tujuan:

```text
PDF / raster / DWG-DXF
→ input routing
→ vector + raster evidence
→ sheet and zone intelligence
→ DEM canonical evidence
→ project vocabulary
→ cross-sheet element graph
→ project-specific detection
→ geometry reconstruction
→ candidate work items
→ human review and feedback
→ accepted Drawing Intelligence output
```

## Prinsip non-negotiable

1. **Vector-first, raster-fallback.** Primitive CAD/PDF tidak boleh dibuang dan diganti screenshot bila masih tersedia.
2. **Evidence before inference.** Semua objek, relasi, dan kandidat mempunyai halaman, bbox, metode, confidence, dan sumber.
3. **Candidate is not quantity.** Label, simbol, mask, atau candidate detection bukan jumlah fisik terverifikasi.
4. **AI interprets; deterministic engines measure.** AI boleh mengklasifikasikan dan merencanakan. Geometri dan ukuran dihitung oleh kode deterministik.
5. **Cross-sheet by design.** Denah, legend, schedule, potongan, detail, dan notes diperlakukan sebagai satu paket proyek.
6. **Human correction is product data.** Accepted/rejected examples menjadi memori prototype proyek, bukan feedback yang hilang.
7. **Truthful UI.** Field yang belum diketahui ditampilkan sebagai unknown/review, bukan diisi default agar terlihat lengkap.
8. **No regression.** Frontend, DEM, PCKM, review, dan fitur lama yang sudah benar dipertahankan.

---

# Fase 1 — Secure Drawing Ingestion

## Tujuan
Menerima dokumen dengan aman tanpa mengubah isi aslinya dan memberi identitas permanen pada setiap paket.

## Baseline yang sudah dibuat
- PDF, PNG/JPG/TIFF, DWG, dan DXF dikenali dari isi dan ekstensi.
- Raster dapat dibungkus menjadi PDF lokal untuk pipeline yang sama.
- DWG/DXF fail-closed bila converter lokal belum dikonfigurasi.
- SHA-256 source dipertahankan.

## Lanjutan
- MIME/magic validation khusus CAD.
- Manifest file, document revision, dan source lineage.
- Quarantine untuk encrypted/corrupt/malware file.
- Resume upload dan deduplication per hash.

## Testing
- Valid/invalid PDF; raster; renamed executable; encrypted PDF; corrupted xref; large file; duplicate document.

## Definition of Done
Setiap input mempunyai immutable source record, checksum, type, revision, security result, dan deterministic failure reason.

---

# Fase 2 — Modality Routing dan Quality Profiling

## Tujuan
Menentukan apakah tiap halaman harus diproses melalui vector, raster, hybrid, atau manual-review route.

## Baseline
- Seluruh 88 halaman PLHUT terdeteksi sebagai vector.
- Page profile mencatat native text dan vector path count.

## Lanjutan
- Detect embedded raster, clipping, invisible OCR layer, low-resolution scan, rotated page, mixed vector-raster region.
- Route per zona, bukan hanya per halaman.
- Quality score untuk noise, skew, contrast, vector fragmentation, dan line density.

## Testing
- Clean CAD export; scan; hybrid PDF; rotated page; empty page; raster with OCR layer.

## DoD
Router memilih toolchain per halaman/zona dan menjelaskan alasan pemilihannya.

---

# Fase 3 — Canonical Coordinate System

## Tujuan
Menyatukan PDF points, pixels, normalized coordinates, viewport, crop box, rotation, dan CAD world coordinates.

## Baseline
- DEM pixel/normalized bbox dapat dinormalisasi.
- Interactive tools mengembalikan geometry normalized.

## Lanjutan
- Canonical transform matrix per page/revision.
- Round-trip source ↔ normalized ↔ frontend viewport.
- Coordinate schema versioning.
- Explicit unknown/quarantine path.

## Testing
- Rotasi 0/90/180/270; crop box; non-zero media box; different raster DPI; legacy bbox migration.

## DoD
Click-to-highlight selalu kembali ke objek sumber dengan tolerance yang ditetapkan.

---

# Fase 4 — Native Vector Primitive Extraction

## Tujuan
Menyimpan garis, polyline, curve, polygon, hatch, clip path, text object, dan layer-like attributes sebagai bukti teknik.

## Baseline
- PyMuPDF vector drawings dan native text dipakai sebagai deterministic spine.
- Processing 88 halaman dibatasi per-page untuk mencegah memory growth.

## Lanjutan
- Primitive schema terpisah dari PyMuPDF representation.
- Path simplification tanpa kehilangan topology.
- Hatch/lineweight/style signature.
- DWG/DXF adapter melalui converter resmi/terkonfigurasi.

## Testing
- Segment/curve/rectangle count; closed path; hatch; duplicate path; clipped detail; scale consistency.

## DoD
Primitive dapat di-query, divisualisasikan, dan ditautkan ke evidence tanpa membaca PDF ulang.

---

# Fase 5 — Sheet Identity dan Page Semantics

## Tujuan
Mengetahui nomor lembar, judul, disiplin, level, jenis gambar, skala, dan revision secara evidence-backed.

## Baseline
- 88/88 halaman PLHUT mempunyai drawing type yang dikenal.
- Resolver menggabungkan title block, native text, DEM identity, view title, dan evidence.
- Empat halaman yang sebelumnya unknown telah dikoreksi secara deterministik.

## Lanjutan
- Conflict resolver untuk title/level/discipline.
- Revision precedence dan superseded sheet handling.
- Project-specific title-block template memory.

## Testing
- Title umum vs view title; roof note vs floor title; bilingual titles; multiple scales; revision stamp.

## DoD
Tidak ada fallback lantai/discipline buatan frontend. Ketidakpastian muncul sebagai review task.

---

# Fase 6 — Plan Zones dan Document Layout Intelligence

## Tujuan
Memisahkan drawing zone, title block, legend, schedule/table, notes, stamp, key plan, dan detail callout.

## Baseline
- Deterministic zone baseline tersedia.
- Legend/title/notes tidak dihitung sebagai occurrence drawing.

## Lanjutan
- Global-to-local layout model sebagai optional candidate generator.
- Vector boundary snapping.
- Nested zones dan multi-view sheet.
- User-editable zone correction.

## Testing
- Legend inside drawing; schedule attached to plan; multiple details; split sheets; title blocks in different corners.

## DoD
Detector tidak menghitung sample symbol pada legend dan dapat menjelaskan zone membership.

---

# Fase 7 — Engineering Text, Dimension, Table, dan Symbol OCR

## Tujuan
Membaca teks teknik tanpa kehilangan posisi dan karakter khusus.

## Baseline
- Native text menjadi prioritas.
- PaddleOCR adapter tersedia sebagai raster fallback opsional.
- DEM menyediakan lebih dari 1.000 observasi dimensi pada PLHUT.

## Lanjutan
- OCR ensemble khusus dimension strings, diameter, elevation, fractions, dan engineering symbols.
- Table grid reconstruction.
- Native text/OCR reconciliation.
- Character-level confidence dan correction memory.

## Testing
- Ø, ±, superscript, chained dimensions, narrow fonts, rotated labels, schedule rows.

## DoD
Teks dan dimensi mempunyai bbox, source modality, confidence, normalized representation, dan raw value.

---

# Fase 8 — DEM Canonical Evidence dan Repair

## Tujuan
Menjadikan DEM sebagai catatan per halaman yang lengkap, terstruktur, dan selalu dapat dilacak.

## Baseline
- 88 DEM digabung dengan native PDF.
- 166 evidence references berhasil dipulihkan secara konservatif: 85 ke evidence DEM existing dan 81 ke native-PDF text evidence yang nyata.
- Tidak ada evidence baru yang difabrikasi.

## Lanjutan
- Strict typed DEM untuk extraction baru.
- Evidence completeness gate per status.
- Quarantine untuk ambiguous repair.
- Page-level reprocessing tanpa mengulang paket.

## Testing
- Missing refs; duplicate evidence ID; wrong bbox; conflicting dimensions; stale revision.

## DoD
Semua authoritative observation mempunyai evidence nyata; unresolved tetap terlihat di review queue.

---

# Fase 9 — Project Vocabulary dari Legend, Schedule, dan Notes

## Tujuan
Mempelajari bahasa proyek: K1, K1A, D1, W1, fixture code, material, detail reference, dan alias.

## Baseline
- 155 vocabulary entries dibangun pada PLHUT.
- Schedule dimensions K2 dan K3 berhasil ditautkan ke denah lantai 2.

## Lanjutan
- Canonical alias graph.
- Semantic category plus vector/text prototype.
- Precedence: schedule/detail/general note.
- Vocabulary review UI.

## Testing
- K2 vs “Kolom K2”; K1 vs K1A; OCR variants; duplicate code in different disciplines.

## DoD
Setiap code memiliki canonical identity, category, definition source, aliases, attributes, dan conflict state.

---

# Fase 10 — Cross-Sheet Entity Resolution

## Tujuan
Menghubungkan occurrence pada denah dengan definition di legend/schedule, detail, potongan, dan notes.

## Baseline
- 271 cross-sheet references dihasilkan pada PLHUT setelah deduplication/evidence bridge terbaru.
- Native tokens tidak menduplikasi occurrence DEM.

## Lanjutan
- Candidate ranking berbasis code, discipline, level, geometry, sheet type, revision, dan proximity.
- Explicit competing candidates.
- Detail-callout navigation.

## Testing
- Same code multiple disciplines; old revision; missing definition; multiple detail sheets.

## DoD
Setiap resolved relation mempunyai provenance dua sisi dan rejected-candidate audit.

---

# Fase 11 — Vector Topology Index

## Tujuan
Mengubah primitive menjadi objek topology yang dapat dibandingkan dan ditelusuri.

## Baseline
- Vector descriptors mencatat segment, curve, rectangle, closure, aspect ratio, dan orientation histogram.
- Fast mode menunda descriptor untuk menghemat waktu dan memori.

## Lanjutan
- Stroke graph, junctions, endpoints, containment, adjacency.
- Scale/rotation/mirror-normalized descriptor.
- Approximate nearest-neighbor index per project.

## Testing
- Repeated symbols; mirrored symbol; scale variations; clutter; partial occlusion.

## DoD
Query similarity mempunyai bounded latency, score breakdown, dan evidence path.

---

# Fase 12 — Project-Specific Prototype Learning

## Tujuan
Belajar dari contoh proyek, bukan memaksa universal detector mengenali seluruh simbol dunia.

## Baseline
- Multiple positive and hard-negative examples didukung secara deterministik.
- Candidate tidak otomatis diterima.

## Lanjutan
- Persisted prototype version per project/revision.
- Visual embedding adapter sebagai optional candidate generator.
- Prototype calibration dan drift detection.
- Transfer antar sheet dalam proyek yang sama.

## Testing
- One-shot, few-shot, false-positive legend, rotated/mirrored/scale variants.

## DoD
User dapat memilih contoh, menolak kesalahan, dan hasil berikutnya membaik tanpa merusak audit history.

---

# Fase 13 — Auto Count Candidate Detection

## Tujuan
Menemukan kandidat objek berulang dengan recall tinggi lalu memisahkan kandidat dari jumlah fisik.

## Baseline
- Cross-reference detections dan project prototype candidates tersedia.
- Count semantics selalu `drawing_label_observation` atau candidate detection.

## Lanjutan
- Tiled detection untuk large drawing.
- Non-maximum suppression lintas vector/raster/text candidates.
- Zone and discipline filtering.
- Candidate review workflow.

## Testing
- Dense symbols; legend false positive; repeated text; overlap; mirrored instances.

## DoD
Precision/recall diukur per kelas, dan accepted physical count hanya berasal dari review/verification gate.

---

# Fase 14 — One-Click Area dan One-Click Line

## Tujuan
Memberi alat interaktif cepat yang menggabungkan user prompt dengan geometri asli.

## Baseline
- One-Click Area memilih closed vector boundary.
- One-Click Line memilih segment terdekat.
- Positive/negative points dan raw PDF-unit measurement tersedia.

## Lanjutan
- Raster segmentation fallback plus boundary snapping.
- Connected-path line tracing.
- Void/opening handling.
- Scale calibration before converted measurement.

## Testing
- Nested polygon; hole; open boundary; disconnected lines; negative point; ambiguous candidate.

## DoD
Tool menghasilkan geometri editable, raw measurement, confidence, evidence, dan review reason—bukan quantity final tersembunyi.

---

# Fase 15 — Structural Geometry Reconstruction

## Tujuan
Mengubah mask/path/candidate menjadi objek teknik seperti column center, wall faces, beam span, room polygon, pipe network, atau grid intersection.

## Baseline
- Closed polygon and line measurement baseline tersedia.

## Lanjutan
- Polygon repair, snapping, centerline extraction, opening insertion.
- Grid-line and intersection recovery.
- Wall-room topology.
- Structural/MEP graph adapters per discipline.

## Testing
- Broken walls; small gaps; intersecting lines; curved pipes; multiple openings.

## DoD
Objek mempunyai geometry type, topology relations, coordinate provenance, dan validation diagnostics.

---

# Fase 16 — Work-Item Candidate Maturation

## Tujuan
Mengubah deteksi terpisah menjadi item pekerjaan Drawing Intelligence yang dipahami user—tanpa masuk ke RAB.

## Baseline
- 77 candidate work items PLHUT dihasilkan setelah deduplication terbaru.
- Maturity: observed, classified, review-ready.
- Missing information dan review task tersimpan.

## Lanjutan
- Discipline-specific candidate schemas.
- Definition completeness and geometry completeness score.
- Merge/split candidates.
- Accepted Drawing Object catalogue.

## Testing
- Definition missing; cross-level ambiguity; duplicate candidates; incomplete geometry.

## DoD
User melihat nama item, lokasi, evidence, status kematangan, blocker, dan tindakan berikutnya.

---

# Fase 17 — Human Review dan Approval Workspace

## Tujuan
Membuat koreksi lebih cepat daripada pemeriksaan manual penuh.

## Baseline
- Review queue tersedia.
- 38 dari 88 halaman PLHUT diberi status review, bukan failure.
- Existing frontend dipertahankan dan mulai menerima data package intelligence nyata.

## Lanjutan
- Side-by-side source/evidence.
- Accept/reject/edit/merge/split actions.
- Reviewer role, audit trail, and undo/supersede.
- Batch review for repeated candidates.

## Testing
- Unauthorized review; stale candidate; revision update; concurrent reviewers.

## DoD
Setiap accepted item mempunyai reviewer, timestamp, source revision, dan immutable provenance.

---

# Fase 18 — Active Learning dan Project Memory

## Tujuan
Menggunakan koreksi user untuk memperbaiki pencarian berikutnya secara aman.

## Baseline
- Positive/hard-negative scoring tersedia dalam memory per request.

## Lanjutan
- Persisted prototype store.
- Feedback event schema.
- Offline recalibration, never silent online model mutation.
- Rollback and comparison between prototype versions.

## Testing
- Accepted sample improves ranking; negative suppresses false positive; rollback restores prior behavior.

## DoD
Peningkatan dapat diukur dan direproduksi; feedback tidak mengubah hasil lama secara diam-diam.

---

# Fase 19 — Truthful Frontend Delivery

## Tujuan
Menampilkan file asli, overlay, candidate, evidence, dan review state tanpa data dummy produksi.

## Baseline
- Unknown level tidak lagi menjadi Floor 2.
- Ukuran file/tanggal/confidence tidak lagi diisi nilai palsu.
- One-Click tools terhubung ke persisted DEM run.
- Package metrics dan candidate work items dapat ditampilkan.

## Lanjutan
- Overlay geometry sebenarnya, not synthetic rooms/grids.
- Thumbnail/image URL, zoom-safe bbox, provenance inspector.
- Candidate editing and prototype feedback UI.
- Long-running progress from durable jobs.

## Testing
- Visual regression; coordinate alignment; no mock in production; incomplete backend payload.

## DoD
Apa yang terlihat user sesuai dengan persisted backend state dan dapat ditelusuri ke lembar sumber.

---

# Fase 20 — Benchmark, Observability, dan Release Gates

## Tujuan
Membuktikan kualitas pada seluruh paket, bukan satu atau dua halaman pilihan.

## Baseline
- PLHUT 88 halaman dianalisis penuh.
- Benchmark 19/19 PASS sekitar 20 detik pada fast mode.
- 51 halaman pass, 37 review, 0 fail.
- 88/88 DEM, 155 vocabulary, 271 cross-sheet references, 77 work-item candidates.
- 0 physical counts auto-accepted dan 0 final quantities dihitung Drawing Intelligence.

## Lanjutan
- Ground-truth annotation set terpisah dari DEM model output.
- Precision/recall/IoU/connectivity/length error per discipline.
- Regression dashboard per commit.
- Performance/memory/error budget.
- Second-project benchmark to prevent PLHUT overfitting.

## Testing
- Full deterministic offline CI.
- Network blocked and all AI keys unset.
- PostgreSQL/object storage/durable worker integration.
- PDF, raster, and configured CAD fixture set.

## DoD
Release hanya diperbolehkan bila quality gates, security, performance, migration, and regression benchmarks hijau.

---

# Matriks KPI utama

| Area | KPI | Baseline PLHUT | Target berikutnya |
|---|---|---:|---:|
| Package coverage | Halaman dianalisis | 88/88 | 100% semua paket uji |
| Sheet semantics | Known drawing type | 88/88 | ≥99% + conflict audit |
| DEM coverage | DEM fused | 88/88 | 100% extraction baru strict |
| Evidence | Observation refs | ~89% setelah repair | ≥98% extraction baru |
| Cross-sheet | Resolved references | 271 | precision/recall ber-ground-truth |
| Candidate output | Work items | 77 | quality per discipline |
| Review | Fail pages | 0 | tetap 0; ambiguity → review |
| Safety | Auto accepted counts | 0 | tetap 0 |
| Safety | Final quantities calculated | 0 | tetap 0 |
| Runtime | 88-page fast analysis | ~20 s | bounded by hardware profile |

# Testing strategy berulang

Setiap fase wajib menjalankan empat lapisan:

1. **Unit test** untuk parser, geometry, coordinate, scoring, dan policy.
2. **Synthetic drawing test** dengan jawaban geometri yang diketahui pasti.
3. **PLHUT 88-page regression** untuk memastikan sistem tidak menurun pada data nyata.
4. **Adversarial test** untuk legend false positive, wrong level, conflicting dimensions, missing evidence, dan unsupported input.

Benchmark PLHUT tidak boleh menjadi satu-satunya ground truth. DEM adalah input evidence existing, bukan jawaban final untuk menilai dirinya sendiri. Fase produksi berikutnya membutuhkan annotation set manual dan proyek kedua yang berbeda.

# Definition of product success

Drawing Intelligence dianggap matang ketika user dapat membuka PDF/DWG yang didukung, melihat sheet yang teridentifikasi, memilih atau menemukan objek, menelusuri definisinya lintas lembar, menerima candidate work items beserta geometri/evidence, menyelesaikan review secara cepat, dan memperoleh accepted Drawing Objects yang dapat dipakai modul lain—tanpa angka palsu, tanpa kehilangan source coordinate, dan tanpa membaca ulang 88 halaman pada setiap pertanyaan.
