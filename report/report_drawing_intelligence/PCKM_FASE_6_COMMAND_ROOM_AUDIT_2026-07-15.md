# PCKM Fase 6 - Command Room Integration Audit

Tanggal: 2026-07-15

## Ruang lingkup selesai

- Conversation yang berada pada proyek mengirim `projectId` ke route Command Room.
- Route mengambil subgraph retrieval secara server-side, bukan dari browser dan bukan seluruh graph.
- Context grounded berisi node serta evidence sheet/halaman; instruksi sistem mewajibkan sitasi untuk klaim faktual.
- Stream mengirim status retrieval tanpa mengirim reasoning mentah.
- Jika graph belum siap, service retrieval tidak tersedia, atau autentikasi internal belum tersedia, chat tetap berjalan melalui fallback context biasa.

## Batas Aturan Emas

- Prompt mengarahkan perhitungan RAB, BoQ, HSP, bobot, dan durasi ke Core Engine.
- Tidak ada kalkulasi baru pada route chat, retrieval helper, atau UI.

## Verifikasi

- Web suite: `14 passed`, `55 passed`.
- Typecheck web: `tsc --noEmit` lulus.
- Graphify incremental untuk `apps/web` lulus.
- Ekspektasi test orchestrator diselaraskan dari `1536` ke `16384` agar sesuai konfigurasi aktif yang telah lama ada.

## Kelanjutan fase

Fase berikutnya menambah hardening: rate limit, cache retrieval, security checks, telemetry, dan benchmark context sebelum bridge RAB yang hanya mempersiapkan handoff ke Core Engine.
