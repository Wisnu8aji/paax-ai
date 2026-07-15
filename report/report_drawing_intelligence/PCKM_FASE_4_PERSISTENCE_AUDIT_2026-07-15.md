# PCKM Fase 4 - Persistence Audit

Tanggal: 2026-07-15

## Ruang lingkup selesai

- Snapshot graph proyek disimpan sebagai versi immutable, dengan hanya satu snapshot `active` per proyek.
- Aktivasi memakai transaksi: graph lengkap ditulis dahulu, snapshot aktif lama ditandai `superseded`, lalu snapshot baru diaktifkan.
- Node, edge, evidence, relasi evidence, alias, community, dan query log memiliki tabel serta model ORM yang dipisahkan per project dan snapshot.
- API membangun snapshot hanya untuk peran owner atau PM; API baca hanya mengembalikan snapshot aktif pada proyek yang diminta.
- Kontrak transport snapshot tersedia dalam Pydantic dan Zod secara selaras.

## Batas keamanan dan data

- Tidak ada rumus, nilai RAB, BoQ, HSP, jadwal, atau angka hasil perhitungan pada persistence ini.
- Evidence tetap menyimpan referensi dokumen, halaman, sheet, teks, dan bbox untuk sitasi fase retrieval.
- Graph tidak dapat dipromosikan menjadi aktif sebelum semua record graph ditambahkan pada transaksi yang sama.

## Verifikasi

- `services/db`: `13 passed, 1 skipped`.
- Test persistence fokus: `5 passed`.
- `packages/schemas`: `29 passed`.
- `packages/schemas`: `tsc --noEmit` lulus.
- `graphify update .` dicoba, namun melebihi batas waktu pada worktree besar. Output Graphify tidak termasuk perubahan yang akan di-commit.

## Kelanjutan fase

Fase 5 akan memakai snapshot aktif ini untuk seed ranking, traversal graph, hydration evidence, pruning budget, dan audit query. Jalur retrieval tetap read-only terhadap graph aktif.
