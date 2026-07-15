# PCKM Hardening Audit

Tanggal: 2026-07-15

## Proteksi aktif

- Semua endpoint graph memakai RBAC proyek dan snapshot aktif selalu di-scope per proyek.
- Retrieval membatasi depth dan budget melalui schema API.
- Query log menyimpan project, snapshot, plan, seed, traversal, budget, dan outcome.
- Endpoint metrics hanya mengagregasi log proyek pada path yang berwenang.
- Command Room melakukan retrieval server-side; browser tidak menerima graph lengkap.
- Bridge RAB tidak memproduksi nilai perhitungan dan membutuhkan approval manusia.

## Observability

- `GET /projects/{id}/project-graph/metrics` menyediakan jumlah query, hasil sukses, status graph belum siap, serta rata-rata token context.
- Endpoint metrics diverifikasi tidak mencampur log antar proyek.

## Batas operasional

- Rate limit dan cache lintas instance belum diimplementasikan sebagai cache proses lokal karena tidak aman atau konsisten pada deployment multi-instance.
- Untuk production, keduanya harus memakai shared infrastructure yang dikelola deployment, misalnya gateway rate limit dan cache terdistribusi; query log yang ada adalah dasar telemetry untuk konfigurasi itu.

## Verifikasi

- Database: `18 passed, 1 skipped`.
- Shared schema: `32 passed`.
- Shared schema typecheck: lulus.
