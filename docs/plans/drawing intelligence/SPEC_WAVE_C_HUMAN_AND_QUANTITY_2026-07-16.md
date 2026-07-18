> **STATUS: HISTORICAL/SUPERSEDED** -- lihat [DI_SOURCE_OF_TRUTH.md](file:///G:/paax-ai-main/docs/plans/drawing%20intelligence/DI_SOURCE_OF_TRUTH.md) untuk kondisi terkini

# SPEC Gelombang C — Review Manusia & Kesiapan Quantity (2026-07-16) [FINAL — ratifikasi Fable 2026-07-16]

> Implementasi Master Plan §5 Gelombang C (item 7-9 inti; item 10 desain). Prasyarat: A hijau;
> C7 bisa paralel dengan B (permukaan file berbeda). Kenyataan kode saat ini: corrections
> create/resolve SUDAH ada (`main.py:647-683`, RBAC owner/pm, wajib target snapshot aktif;
> tabel `project_graph_corrections` models.py:355), RAB bridge endpoint SUDAH ada
> (`main.py:686-695`). Yang hilang: antrian terprioritas, semantik penerapan koreksi,
> kriteria kesiapan quantity, dan permukaan UI.

## C7 — Review Workflow v1 (API-first)

1. **Endpoint antrian**: `GET /projects/{id}/project-graph/review-queue`
   (RBAC baca: estimator/pm/lapangan/owner). Sumber exception (semua SUDAH ada di data):
   - node/edge `verification_status/confidence_class` ambiguous|conflicting;
   - edge `POSSIBLY_SAME_AS` (binding ambigu);
   - node type=conflict;
   - occurrence berstatus needs_review/ambiguous hasil A2 (locator sheet-scope);
   - level `possibly_same` hasil A3 (mis. Atap vs "Lantai Atap P +16.20");
   - **missing-data bermakna**: element_type TERPAKAI (punya occurrence) tanpa dimensi
     tertulis di mana pun (kasus nyata K1A — flagship).
2. **Prioritas deterministik** (tanpa AI, tanpa biaya rupiah — Aturan Emas):
   `priority = w_conflict(3) > w_missing_dimension_terpakai(2.5, dikali jumlah occurrence)
   > w_ambiguous_level(2) > w_possibly_same(1.5) > w_needs_review(1)` — angka bobot statis
   di kode, transparan, bukan "dampak biaya" yang dihitung AI. Response menyertakan alasan
   per item + evidence_refs + node/edge target.
3. **Penerapan koreksi diterima** (semantik overlay — snapshot tetap immutable):
   - `resolve` status `accepted` → koreksi masuk daftar "active corrections" snapshot itu.
   - Retrieve/views TIDAK memutasi graf: layer pembacaan menempelkan koreksi
     (`data_status: "corrected"`, nilai terkoreksi + rationale + siapa/kapan) saat menyajikan
     node yang tersentuh. Implementasi v1: join sederhana corrections-accepted per node_id
     di retrieve + summary-views GET.
   - Saat snapshot BARU dibangun: koreksi accepted lama di-re-evaluasi — bila target masih
     ada (node_id stabil) dibawa maju (kolom `carried_from` baru, nullable); bila hilang,
     ditandai `stale` untuk review ulang. (Migrasi Alembic 0013; Pydantic+Zod bersamaan.)
4. Test acuan: antrian fixture nyata memuat K1A-missing-dimension di puncak kategori missing;
   koreksi accepted mengubah data_status jawaban retrieve terkait; koreksi stale terdeteksi
   saat snapshot baru.

## C8 — Quantity Readiness v1

1. **Kriteria kesiapan per element_type** (murni boolean/len, nol aritmatika volume):
   - `has_canonical_type`; `has_occurrence` (≥1 occurrence confirmed);
   - `has_written_dimension` (HAS_DIMENSION/DEFINED_BY ke dimensi ber-unit);
   - `no_open_conflict` (tidak tersentuh conflict/possibly_same open);
   - `level_binding_confirmed` (semua occurrence-nya di level kanonis non-ambigu).
   → `readiness: ready | needs_review | blocked` + `reasons[]` (setiap reason bawa
   evidence/target untuk drill-down).
2. **Endpoint**: `GET /projects/{id}/project-graph/quantity-readiness` → daftar per
   element_type + ringkasan proyek (berapa ready/blocked — len saja). K1 → ready;
   K1A → blocked (no_written_dimension) pada fixture: test acuan manual.
3. **Consumer RAB bridge v1**: dari daftar `ready`, user (via Command Room guidance B5 atau
   UI C9) memanggil endpoint rab-bridge existing dengan node_ids terpilih → proposal
   `requires_human_approval` (SUDAH ada). Tambahan v1: simpan proposal (tabel
   `rab_bridge_proposals`, migrasi ikut 0013) dengan status pending/approved/rejected oleh
   owner/pm — approved = artefak input untuk Core Engine (pemanggilan engine = fase RAB
   berikutnya, DI LUAR scope C8; tidak ada angka dihitung di sini).
4. **Assumption registry (desain saja di C8, tabel ikut 0013)**: `quantity_assumptions`
   (id, project_id, element_type_id nullable, text, source_role, status, created_at) —
   diisi manusia; dipakai fase RAB untuk melampirkan asumsi ke perhitungan engine.

## C9 — UI Workspace v1 (apps/web) — ringkas, detail di dispatch
Halaman baru `drawing-intelligence` (dashboard route baru, JANGAN menyentuh Command Room):
panel kiri pohon proyek (level kanonis → disiplin → element_type, sumber: summary-views +
quantity-readiness); panel tengah daftar occurrence + evidence (sitasi sheet/halaman, link
viewer PDF fase lanjut); panel kanan antrian review (C7) dengan aksi accept/reject
(memanggil endpoint resolve existing). Status kesiapan quantity per tipe (badge
ready/needs_review/blocked). UI HANYA konsumsi endpoint — nol perhitungan.

## C10 — Revisi/lineage (desain, tidak dibangun sekarang)
Snapshot baru per revisi dokumen; `generation_metadata.source_revision`; laporan diff
(node hilang/baru/berubah antar snapshot; koreksi stale C7.3 bagian dari ini). Dibangun
setelah A-B-C7/8 stabil di benchmark.

## Batas Aturan Emas
Prioritas review = bobot statis transparan; readiness = boolean/len; proposal RAB tidak
menghitung apa pun; UI tidak menghitung; semua keputusan merge/koreksi = manusia atau
AI-tervalidasi dengan audit; engine tetap satu-satunya kalkulator.
