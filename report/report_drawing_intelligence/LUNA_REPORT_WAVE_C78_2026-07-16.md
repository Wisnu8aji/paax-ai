# LUNA Report — Wave C C7/C8

Tanggal: 2026-07-16  
Branch: `feat/pckm-phase3-synthesis`  
Scope: `services/db`, `packages/schemas`, dan tests. Tidak menyentuh document-intelligence, ai-orchestrator, atau apps/web.

## Implementasi

- `GET /projects/{id}/project-graph/review-queue` dengan RBAC baca. Queue deterministik memakai bobot statis: conflict `3`, missing dimension `2.5 × occurrence_count`, ambiguous level `2`, possibly-same `1.5`, needs-review `1`. Setiap item membawa target node/edge, reason codes/details, evidence refs, dan prioritas.
- `GET /projects/{id}/project-graph/quantity-readiness` dengan flag boolean/len-only: `has_canonical_type`, `has_occurrence`, `has_written_dimension`, `no_open_conflict`, dan `level_binding_confirmed`. Status: `ready`, `needs_review`, atau `blocked`.
- Correction `accepted` menjadi overlay baca pada retrieve dan summary-views (`data_status=corrected`, nilai/rationale/aktor/waktu). Snapshot graph tetap tidak berubah. Snapshot baru membawa koreksi bila target stabil (`carried_from`); target hilang menghasilkan correction `stale`.
- RAB bridge tetap hanya menghasilkan input evidence-backed tanpa angka, tetapi sekarang menyimpan `rab_bridge_proposals` berstatus `pending`; tersedia resolve owner/pm menuju `approved` atau `rejected`.
- Migrasi Alembic `0013` menambah lineage correction, `rab_bridge_proposals`, dan `quantity_assumptions`. Pydantic dan Zod diperbarui bersama.

## Kriteria fixture acuan

Fixture sintetis memuat K1 dengan occurrence confirmed, level kanonis, dan dimensi ber-unit; K1A memiliki occurrence confirmed tetapi tanpa dimensi tertulis. Hasil teruji: K1 `ready`, K1A `blocked` dengan reason `no_written_dimension`, dan queue K1A memiliki prioritas `2.5` untuk satu occurrence.

## Verifikasi nyata

- `pytest services/db -q`: **61 passed, 1 skipped**.
- `pnpm test` di `packages/schemas`: **30 passed**.
- `pnpm exec tsc --noEmit` di `packages/schemas`: exit **0**.
- Benchmark runner: **13/13 PASS**.
- `alembic heads` dari `services/db`: **0013 (head)**; chain `0012 → 0013`.
- `graphify update .`: selesai; AST graph tidak menemukan perubahan topology baru.

## Keterbatasan

- Registry `quantity_assumptions` sudah dipersist sebagai tabel/kontrak, tetapi endpoint pengisian asumsi manusia belum ditambahkan karena SPEC C8 menyebutnya desain registry untuk fase RAB berikutnya.
- Dimensi tertulis dikenali dari edge `HAS_DIMENSION`/`DEFINED_BY` menuju node dimension dengan `properties.unit` atau `properties.units`; tidak ada inferensi piksel atau kalkulasi volume/biaya.
- UI C9 dan pemanggilan Core Engine tetap di luar scope.

Tidak ada commit atau push yang dilakukan.
