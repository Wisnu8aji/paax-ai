# PAAX Drawing Intelligence — Goal Lanjutan 20 Fase

**Tanggal:** 21 Juli 2026  
**Fokus:** hasil Drawing Intelligence yang langsung dipahami engineer sipil maupun pengguna umum, tanpa membuka DEM/PCKM/JSON mentah.  
**Di luar scope:** RAB, harga, dan schedule.

## Goal gelombang ini

Mengubah keluaran teknis menjadi **User Work Item** yang mempunyai nama teknis dan bahasa awam, level/lokasi, ukuran tertulis, jumlah label teramati, evidence lembar, blocker, tindakan berikutnya, serta keputusan review. Data teknis mentah tetap tersedia untuk audit tetapi tidak membebani tampilan utama.

## Release gate gelombang ini

```text
88 halaman dianalisis
→ item lintas lembar diklasifikasikan
→ noise dipisahkan tanpa menghapus evidence
→ hasil diterjemahkan ke bahasa manusia
→ review dikelompokkan
→ accept/reject tersimpan secara versioned
→ frontend menampilkan hasil matang
→ benchmark user-ready harus PASS
```

## Status per fase

| Fase | Goal | Status saat ini | Gate berikutnya |
|---:|---|---|---|
| 1 | **Secure Drawing Ingestion** — Source checksum, manifest, PDF/raster routing, CAD fail-closed. | Baseline fungsional selesai | Encrypted/malware quarantine and enterprise upload resume remain production gates. |
| 2 | **Modality Routing and Quality Profiling** — Vector/raster/hybrid decision and explainable page profile; PLHUT 88/88 routed. | Baseline fungsional selesai | Zone-level learned routing on mixed scan/vector documents remains. |
| 3 | **Canonical Coordinate System** — Normalized evidence and viewport-safe geometry are versioned. | Baseline fungsional selesai | Full DWG world-coordinate round trip awaits production CAD adapter. |
| 4 | **Native Vector Primitive Extraction** — Native PDF text/vector primitives are the deterministic spine. | Baseline fungsional selesai | Dedicated hatch/layer schema and CAD-layer fidelity remain. |
| 5 | **Sheet Identity and Page Semantics** — Human scopes L1/L2/Atap/Fondasi/Area Tapak; no invented floor defaults. | Goal PLHUT selesai | More title-block families and revision-conflict evaluation remain. |
| 6 | **Plan Zones and Layout Intelligence** — Drawing/title/legend/table/note zoning prevents obvious legend counts. | Baseline fungsional selesai | Learned layout candidate generator and editable zone UI remain. |
| 7 | **Engineering Text, Dimensions, Tables and OCR** — Native text first; OCR fallback; profile dimensions no longer become opening dimensions. | Baseline fungsional selesai | Engineering OCR ensemble and character-level benchmark remain. |
| 8 | **Canonical DEM Evidence and Repair** — DEM/native evidence fusion and conservative repair; no fabricated evidence. | Goal PLHUT selesai | Strict typed DEM gate for all new providers remains rollout work. |
| 9 | **Project Vocabulary** — Context-ranked vocabulary; code identity uses definition source, discipline and sheet type. | Goal PLHUT selesai | Vocabulary conflict-resolution UI remains. |
| 10 | **Cross-Sheet Entity Resolution** — Discipline-scoped links join occurrences to schedules/details; K2 joins to 250×600 mm. | Goal PLHUT selesai | Generalized entity-resolution metrics require a second project. |
| 11 | **Vector Symbol Descriptors** — Stroke/topology descriptors and explainable candidates exist. | Baseline fungsional selesai | Per-class precision/recall and rotation/scale stress corpus remain. |
| 12 | **Project-Specific Similarity** — Positive/negative project prototypes with versioned storage exist. | Baseline fungsional selesai | Distributed persistence and multi-user conflict handling remain. |
| 13 | **Area Segmentation** — Vector-assisted One-Click Area returns review candidates, never final quantity. | Baseline fungsional selesai | Nested voids, raster masks and complex hatch reconstruction remain. |
| 14 | **Line Topology** — One-Click Line and connected-path baseline exist. | Baseline fungsional selesai | Curves, occlusion and noisy scan topology require broader fixtures. |
| 15 | **Geometry Reconstruction** — Connected vector geometry is deterministic and evidence-linked. | Baseline fungsional selesai | Object topology validation and CAD-scale round trip remain. |
| 16 | **Work-Item Maturation** — 64 human-readable items, 5 clarifications, 4 audit-suppressed candidates; no raw JSON in primary delivery. | Goal PLHUT selesai | Civil/MEP item taxonomy expansion requires additional project drawings. |
| 17 | **Human Review Queue** — Versioned accept/reject/edit ledger, canonical storage, batched review and frontend actions. | Goal PLHUT selesai | Database-backed multi-reviewer locking remains a production gate. |
| 18 | **Active Learning and Project Memory** — Accepted/rejected prototypes persist locally with legacy-key fallback. | Baseline fungsional selesai | Training/re-ranking evaluation across projects remains. |
| 19 | **Frontend Delivery** — Existing visual design preserved; human item cards, level labels, evidence, blockers and review actions wired. | Goal PLHUT selesai | Full browser E2E awaits pnpm dependencies and running services. |
| 20 | **Benchmark, Observability and Release Gates** — 19/19 package, 10/10 human, 18/18 user-ready; 88 pages; no live AI calls. | Release gate PLHUT lulus | Universal production release requires object-level ground truth, second project, Node build and PostgreSQL/pgvector CI. |

## Definition of Done untuk data yang diterima user

Setiap item yang tampil harus memenuhi seluruh syarat berikut:

1. Memiliki nama teknis Indonesia dan penjelasan sederhana.
2. Memiliki disiplin dan level yang evidence-backed; unknown tidak diisi dengan default palsu.
3. Menautkan lembar, bbox, dan evidence sumber.
4. Menyebut jumlah sebagai **label/simbol teramati**, bukan jumlah fisik final.
5. Menampilkan ukuran hanya bila ukuran tersebut benar-benar milik elemen, bukan profil material atau catatan lain.
6. Menjelaskan data yang belum diketahui dan tindakan review berikutnya.
7. Candidate noise tetap tersimpan pada audit layer tetapi tidak muncul di daftar kerja utama.
8. Keputusan user tersimpan dalam ledger berversi dan tidak mengubah source evidence.

## Goal gate yang dapat dijalankan

```powershell
python scripts/verify_drawing_intelligence_user_ready.py
```

Gate tersebut memeriksa 18 kontrak, termasuk 88 halaman, benchmark, kualitas item, K2 lantai 2, noise suppression, evidence, review batch, dan larangan menerima kuantitas otomatis.

## Hasil gelombang ini

```text
Package benchmark          : 19/19 PASS
Human-delivery benchmark   : 10/10 PASS
User-ready goal gate       : 18/18 PASS
Item siap tampil           : 64
Perlu klarifikasi          : 5
Noise audit disembunyikan  : 4
Review task                : 76
Review batch               : 6
Accepted otomatis          : 0
Live AI API call           : 0
```

## Batas status

Seluruh goal **pilot PLHUT dan user-facing continuation** pada gelombang ini selesai. Ini belum sama dengan universal production-ready. Generalisasi harus dibuktikan menggunakan ground truth object-level dan minimal satu proyek independen yang berbeda.
