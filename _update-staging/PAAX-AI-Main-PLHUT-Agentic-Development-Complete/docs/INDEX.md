# 📚 PAAX — Indeks Dokumentasi (on-demand, bukan wajib dibaca)

> Ini daftar isi, bukan peta kode. Untuk navigasi kode/dependency/endpoint/test,
> pakai **Graphify** (`graphify query "<pertanyaan>"` / `graphify path "A" "B"` /
> `graphify explain "<konsep>"`) — lihat `CLAUDE.md` §7 / `AGENTS.md` §7.
> Baca file di bawah **hanya saat task-nya relevan**, bukan di awal tiap sesi.

## Aturan permanen (auto-load, sudah wajib dibaca)
| File | Isi |
|---|---|
| `CLAUDE.md` | Aturan permanen untuk Claude Code |
| `AGENTS.md` | Aturan permanen untuk Codex |

## Status & sejarah kerja
| File | Isi |
|---|---|
| `docs/ai-map/STATE_CURRENT.md` | Status aktif: branch/PR, hasil test terakhir, blocker, keputusan owner, langkah berikutnya |
| `docs/history/` | Arsip status & dokumen lama per periode — riwayat lengkap, bukan referensi kerja harian |
| `report/`, `report-remote/` | Laporan kerja mentah per task/fase (Codex/Claude/antigravity) |

## Referensi domain & arsitektur (baca saat relevan)
| File | Baca saat... |
|---|---|
| `docs/plans/drawing intelligence/DI_SOURCE_OF_TRUTH.md` | Source of Truth aktif untuk Drawing Intelligence, arsitektur, invariant, dan aturan data |
| `docs/ai-map/GLOSSARY.md` | Tidak paham istilah domain (AHSP, HSP, BUK, Kurva S, CPM, dst.) |
| `docs/MASTER_PLAN.md` | Butuh blueprint besar / roadmap lengkap |
| `docs/BRAIN_ALIGNMENT.md` | Gap-analysis spek "brain" v4.1 vs implementasi saat ini |
| `docs/specs/brain-v4.1/` | Butuh rumus takeoff lengkap / spek TKG / model entitas Evidence |
| `docs/adr/` | Keputusan arsitektur lama, kenapa sesuatu dibangun begitu |
| `docs/pages/` | Aturan per-halaman web (1 file per halaman) |
| `docs/strategy/` | Pressure-test bisnis, biaya AI, margin, pricing, roadmap |
| `docs/security/` | Kebijakan & catatan keamanan |
| `docs/api/` | Referensi API bila ada |

## Rencana & prompt kerja
| File | Isi |
|---|---|
| `docs/plans/` | Rencana besar per fase (masih relevan — cek tanggal, yang terbaru menang) |
| `docs/prompts/` | Prompt kerja historis untuk Codex/Claude per task |

## Diarsipkan (digantikan alat/dokumen lain, jangan dirujuk sebagai sumber aktif)
| File lama | Digantikan oleh |
|---|---|
| `docs/ai-map/START_HERE.md` (peta+status wajib baca) | `docs/INDEX.md` (ini, on-demand) + Graphify |
| `docs/ai-map/MAP.md` (lokasi kode/endpoint manual) | `graphify query`/`path`/`explain` — lihat `docs/history/MAP.md` |
| Riwayat panjang `docs/ai-map/STATE.md` | `docs/ai-map/STATE_CURRENT.md` (aktif) + `docs/history/` (arsip) |
| Rencana & spesifikasi lama Drawing Intelligence / DEM / PCKM (2026-07-11 hingga 2026-07-17) | `docs/plans/drawing intelligence/DI_SOURCE_OF_TRUTH.md` + `PAAX_DRAWING_INTELLIGENCE_SUPER_BIG_PLAN_REVISED.md` |
