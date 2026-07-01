# 📍 PAAX — STATE (status SEKARANG)

> Update terakhir: **2026-06-29**. File ini SATU-SATUNYA tempat status berjalan.
> Selesai satu fase → perbarui di sini (jangan sebar ke banyak file).

## Versi
**v0.9 (Schedule & Scenario "hidup")** — engine SELESAI, frontend belum dibangun.

## Selesai & ada di `main`
- v0.6–v0.8: engine RAB/HSP/Kurva-S deterministik, smart import, export Excel rumus,
  orchestrator Gemini (free tier) + fallback rule-based.
- v0.9 **engine**: CPM (`/schedule/cpm`), schedule plan (`/schedule/plan` = CPM→tanggal
  kalender + Kurva S sadar-dependency), scenario knob crew/shift/efisiensi/target
  (`/scenario/simulate` → `.custom`).
- Engineering Chat tersambung Gemini (PR #17) — masih **tipis**: belum membaca data
  RAB/jadwal proyek (baru kirim projectId + status engine).
- Test hijau: engine **99** · web **16** · schema **11**.

## Berikutnya (ringkas; rencana detail: lihat di bawah)
- **EPIC A — selesaikan v0.9 frontend**: A1 wiring client (Codex) → A2 Gantt UI +
  A3 panel knob (Claude) → wiring (Codex) → A4 narasi AI skenario.
- **EPIC B — Engineering Chat lintas-halaman**: B1 context pack (Codex) → B2 grounding
  → B3 UI chat global (Claude) → B4 tool-calling.
- **EPIC C — fixes**: C1 poles pembulatan 9B (`custom.subtotal`/`labor_cost` → `_r2`), dst.
- **DITUNDA (jangan dibangun)**: v1.0 Gambar→BoQ→RAB (CV) + Site Agent penuh.

## Pembagian peran (2026-06-29)
- **Claude** = planning + semua spek/prompt + **UI frontend** + review.
- **Codex** = penyambungan teknis (lib/engine, fetch, state, route AI, backend, engine).

## Git
- Branch utama: `main`. Open PR: **(tidak ada)** per update ini.
- PR terakhir merged: #17 (engineering chat → Gemini).

## Rencana detail (di luar repo)
- Master plan + prompt Codex (A1, B1): file `PAAX_MASTER_PLAN_*` & `PAAX_CODEX_PROMPT_*`
  di folder Downloads owner.
- Konteks lintas-sesi: memory Claude (`MEMORY.md`).
