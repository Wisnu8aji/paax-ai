# PCKM Hardening Audit

Tanggal: 2026-07-15

## Proteksi aktif

- Semua endpoint graph memakai RBAC proyek dan snapshot aktif selalu di-scope per proyek.
- Retrieval membatasi depth dan budget melalui schema API.
- Query log menyimpan project, snapshot, plan, seed, traversal, budget, dan outcome.
- Endpoint metrics hanya mengagregasi log proyek pada path yang berwenang.
- Rate limit retrieval memakai query log database per proyek dan window satu menit; konfigurasi `PCKM_RETRIEVAL_LIMIT_PER_MINUTE` berlaku lintas instance yang memakai database yang sama.
- Command Room melakukan retrieval server-side; browser tidak menerima graph lengkap.
- Bridge RAB tidak memproduksi nilai perhitungan dan membutuhkan approval manusia.

## Observability

- `GET /projects/{id}/project-graph/metrics` menyediakan jumlah query, hasil sukses, status graph belum siap, serta rata-rata token context.
- Endpoint metrics diverifikasi tidak mencampur log antar proyek.

## Batas operasional

- Cache lintas instance belum diimplementasikan sebagai cache proses lokal karena tidak aman atau konsisten pada deployment multi-instance.
- Untuk production, cache harus memakai shared infrastructure yang dikelola deployment; query log dan metrics yang ada adalah dasar telemetry untuk konfigurasi itu.

## Verifikasi

- Database: `18 passed, 1 skipped`.
- Shared schema: `32 passed`.
- Shared schema typecheck: lulus.
