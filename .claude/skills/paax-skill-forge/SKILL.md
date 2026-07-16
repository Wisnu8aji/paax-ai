---
name: paax-skill-forge
description: Buat skill runtime PAAX baru, uji, bandingkan, dan sempurnakan -- adaptasi skill-creator Anthropic untuk konteks Command Room PAAX (tool ai-orchestrator, Evidence Gate, Aturan Emas CLAUDE.md). WAJIB dipakai saat owner minta "buat skill baru", "tool baru untuk Command Room", "kenapa tool X tidak ke-trigger", atau ingin mengevaluasi kualitas trigger/output sebuah tool/skill PAAX -- bahkan kalau owner tidak menyebut kata "skill" secara eksplisit, misalnya "kok run_scenario suka salah manggil" atau "aku mau AI bisa X juga di Command Room".
---

# PAAX Skill Forge

Kontrol plane untuk membuat & menyempurnakan **skill runtime PAAX** (bukan skill Claude Code biasa -- lihat pemisahan di `.claude/skills/paax-command-room-intelligence/PLAN.md` §1). Skill runtime PAAX diwujudkan sebagai:
- **Tool baru** di `services/ai-orchestrator/src/tools/*.ts` (didaftarkan di `registry.ts`), atau
- **Modul router** di `services/ai-orchestrator/src/router/*.ts` (Capability Router, Evidence Gate, dst).

Ini BUKAN skill `.md` yang dibaca model PAAX saat runtime -- Lucent/Arete/Noir bukan Claude Code, mereka tidak baca `SKILL.md`. "Skill" di sini berarti kemampuan baru yang disuntikkan lewat kode TypeScript (tool declaration + system prompt), sesuai penjelasan di PLAN.md §1.2.

## Kapan skill baru layak dibuat

Sebelum membuat tool baru, pastikan ini genuinely bernilai -- bukan cuma menambah tool untuk menambah tool:
- Ada endpoint/data nyata yang belum diekspos ke chat (cek `services/core-engine/app/main.py`, `services/db/src/paax_db/main.py` dulu sebelum bangun dari nol)
- Nilainya jelas: model bisa menjawab dengan data nyata yang sebelumnya harus dikarang/ditolak
- TIDAK melanggar Aturan Emas (CLAUDE.md §1) -- tool boleh MENGAMBIL/MENJEMBATANI data engine, tidak pernah MENGHITUNG sendiri

Kalau data yang dibutuhkan belum ada di backend sama sekali (bukan cuma belum diekspos), skill forge bukan tempatnya -- itu pekerjaan membangun fitur backend baru dulu.

## Alur kerja

### 1. Tangkap intent
Tanyakan/simpulkan dari percakapan:
- Tool apa yang dibutuhkan, data apa yang harus diambil/dihitung ulang dari mana
- Endpoint backend mana yang jadi sumbernya (core-engine `/xxx`, services/db `/xxx`, document-intelligence `/xxx`)
- Format output yang diharapkan user di jawaban akhir

### 2. Tulis tool
Ikuti pola yang SUDAH ADA persis (jangan reinvent):
- `services/ai-orchestrator/src/tools/<nama_tool>.ts` -- lihat `query_rab.ts`/`run_scenario.ts`/`project_diagnostics.ts` sebagai referensi pola
- `declaration.parameters` WAJIB pakai `items` schema eksplisit untuk field `ARRAY` (bug nyata pernah ditemukan: `run_scenario` tanpa `items` schema membuat model menerka struktur `lines` dan mengirim `ahsp_code: "undefined"`)
- `execute()` selalu return `Record<string, unknown>`, tangkap error jadi `{error: string}` bukan throw
- `summarize()` opsional tapi disarankan -- ringkasan pendek buat log/observability
- Kalau tool butuh auth ke core-engine/services/db, TIDAK perlu tangani sendiri -- `apps/web/src/app/api/command-room/chat/tools.ts` (`buildAuthedFetch()`) sudah menyuntikkan `X-Internal-Key`/`X-User-Id` ke semua tool via `fetchImpl`
- Daftarkan di `services/ai-orchestrator/src/tools/registry.ts`

### 3. Update system prompt Command Room
Tambahkan deskripsi tool baru ke `TOOL_SYSTEM_SUFFIX` di `apps/web/src/app/api/command-room/chat/tools.ts` -- sebutkan namanya, kapan dipakai, kapan JANGAN dipakai. Model hanya tahu tool ada kalau disebut di sini (deklarasi tool saja kadang tidak cukup untuk model memutuskan kapan memanggilnya).

### 4. Uji dengan ketiga model (WAJIB, jangan skip)
Live-test lewat `route.ts` sungguhan (bukan cuma unit test tool secara terisolasi):
1. Nyalakan `core-engine` (`uvicorn app.main:app --port 8081`) dan Next.js dev (`npx next dev --port 3000`) di `apps/web`
2. Kirim prompt yang secara natural akan memicu tool baru, lewat ketiga model:
   - **Lucent & Arete**: prompt kompleks/berat, boleh multi-tool sekaligus
   - **Noir**: prompt SEDERHANA saja -- cukup buktikan tool terpanggil & berfungsi, jangan bebani reasoning berat
3. Cek event SSE yang keluar: `tool_call` (nama tool benar?), `tool_result` (summary masuk akal?), `evidence_gate` (status `verified` untuk klaim angka yang datanya dari tool?)
4. Cek isi jawaban akhir: angka konkret ditampilkan (bukan cuma "sudah dihitung"), tidak ada JSON tool-call bocor sebagai teks

### 5. Evaluasi & sempurnakan
Gejala umum yang HARUS diperbaiki kalau ditemukan (semua ini bug nyata yang pernah terjadi di Command Room, bukan hipotetis):
- **Tool tidak pernah terpanggil** → cek env var (`CORE_ENGINE_URL` dll) benar-benar ter-load Next.js (`apps/web/.env.local`, BUKAN `.env.local` di root repo -- dua file berbeda, Next.js cuma baca yang di `apps/web/`), cek `isToolsEnabled()` return true
- **Tool dipanggil berkali-kali tanpa perlu** → deskripsi tool kurang jelas soal "satu panggilan sudah cukup", perjelas di `declaration.description`
- **Model mengarang struktur parameter salah** → `items` schema untuk field ARRAY belum didefinisikan
- **JSON tool-call bocor jadi teks jawaban** → cek history tool-loop di `runOpenAiCompatibleToolLoop`/`runAnthropicWithTools` memakai format native provider (bukan stringify ke content biasa)
- **Jawaban akhir terlalu pendek/generik ("hasil di atas")** → model reasoning menaruh angka di reasoning trace bukan content; pertimbangkan matikan `thinking` di giliran final setelah tool selesai
- **Evidence Gate `manual_review_required` padahal tool sudah dipanggil** → cek nama tool baru masuk daftar `TOOLS_THAT_PROVIDE_NUMBERS` di `services/ai-orchestrator/src/router/evidence-gate.ts`

Ulangi 4-5 sampai ketiga model konsisten berhasil tanpa bug.

### 6. Jangan pernah lewati verifikasi teknis dasar
Sebelum menyatakan skill selesai:
```
cd services/ai-orchestrator && npx tsc --noEmit && npx vitest run
cd apps/web && npx tsc --noEmit && npx vitest run
```
Kalau ada test Python yang tersentuh (services/db, core-engine): `python -m pytest -q`.

## Yang TIDAK termasuk skill forge

- **Skill Claude Code** (`.claude/skills/*.md` lain seperti graphify) -- itu di luar scope skill runtime PAAX, edit langsung filenya kalau perlu, bukan lewat proses ini.
- **Perubahan Evidence Gate/Capability Router/Task Planner** yang mengubah keputusan arsitektur (bukan sekadar nambah tool baru ke daftar yang sudah ada) -- itu perlu didiskusikan dengan owner dulu, konsepnya belum final (lihat catatan di `services/ai-orchestrator/src/router/capability-router.ts`).
- **Document production baru** (DOCX/PDF) -- belum ada fondasi kode di repo ini; kalau owner minta, itu proyek baru bukan skill forge kecil (lihat PLAN.md §4.3 untuk status jujur XLSX vs DOCX/PDF).
