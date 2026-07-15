# PCKM Hardening Audit

Tanggal: 2026-07-15

## Proteksi aktif

- Semua endpoint graph memakai RBAC proyek dan snapshot aktif selalu di-scope per proyek.
- Retrieval membatasi depth dan budget melalui schema API.
- Query log menyimpan project, snapshot, plan, seed, traversal, budget, dan outcome.
- Endpoint metrics hanya mengagregasi log proyek pada path yang berwenang.
- Rate limit retrieval memakai query log database per proyek dan window satu menit; konfigurasi `PCKM_RETRIEVAL_LIMIT_PER_MINUTE` berlaku lintas instance yang memakai database yang sama.
- Cache retrieval memakai database dengan key project/snapshot/request dan TTL `PCKM_RETRIEVAL_CACHE_SECONDS`; cache hit tidak menjalankan traversal kedua.
- Command Room melakukan retrieval server-side; browser tidak menerima graph lengkap.
- Bridge RAB tidak memproduksi nilai perhitungan dan membutuhkan approval manusia.
- Koreksi graph manusia tersimpan sebagai proposal immutable per project/snapshot; status dapat diselesaikan atau ditolak tanpa mengubah snapshot aktif.

## Observability

- `GET /projects/{id}/project-graph/metrics` menyediakan jumlah query, hasil sukses, status graph belum siap, serta rata-rata token context.
- Endpoint metrics diverifikasi tidak mencampur log antar proyek.
- Workflow koreksi diverifikasi hanya mencatat review dan mempertahankan node snapshot aktif tanpa perubahan.

## Batas operasional

- Cache tidak pernah dipakai lintas project atau snapshot; snapshot baru otomatis menghasilkan key baru.

## Verifikasi

- Database: `23 passed, 1 skipped` sebelum cache; test cache tambahan `9 passed` pada suite retrieval.
- Shared schema: `34 passed`.
- Shared schema typecheck: lulus.
