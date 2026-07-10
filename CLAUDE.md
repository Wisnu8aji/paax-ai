# CLAUDE.md — PAAX AI

> Aturan permanen & pendek — bukan peta kode atau status proyek.
> Peta dokumentasi on-demand: `docs/INDEX.md`. Status aktif: `docs/ai-map/STATE_CURRENT.md`.
> Navigasi kode/dependency/test: **Graphify dulu** (§7), jangan Glob/Grep buta.
> File ini dibaca otomatis oleh Claude Code di setiap sesi. **Patuhi sepenuhnya.**

---

## 1. ATURAN EMAS — AI TIDAK PERNAH MENGHITUNG

**Setiap angka** di RAB, BoQ, jadwal, Kurva S, dan skenario WAJIB berasal dari
**engine deterministik** (`services/core-engine`, Python). LLM/TypeScript hanya
boleh MENJELASKAN — tidak pernah MENGHITUNG atau MENGARANG.

- ❌ Tidak ada perhitungan RAB/HSP/bobot/durasi di frontend. Frontend hanya **menampilkan** hasil engine.
- ❌ Tidak ada LLM di jalur perhitungan — hanya klasifikasi/ekstraksi → **usulan/mapping**; angka tetap dari engine.
- ✅ AHSP = sumber **koefisien**, bukan template output.
- ✅ AI Agent otonom tunduk juga: boleh ubah **input terstruktur** lalu panggil ulang engine — tidak pernah menulis angka hasil sendiri.

Jika sebuah task akan membuat LLM atau TypeScript menghitung angka final —
**STOP dan lapor ke pemilik repo.** Itu pelanggaran aturan emas.

### 1.1 Batas AI-Assist (klasifikasi/binding gambar, bukan vision-piksel)

Lapisan AI-assist (`services/document-intelligence/app/perception/ai_assist/`)
adalah **fallback paralel**, bukan pengganti rule-based:

- Rule-based tetap fast-path utama; LLM hanya dipanggil saat regex/heuristik gagal/ambigu.
- LLM membaca **teks+koordinat yang sudah diekstrak** (PyMuPDF) — **bukan piksel gambar mentah**.
- Setiap usulan LLM **wajib divalidasi deterministik** (tidak boleh halusinasi, harus masuk rentang wajar) sebelum jadi kandidat `perlu_review`.
- **Tidak ada auto-commit ke input engine** — selalu menunggu approval manusia.
- Audit trail wajib: model, prompt/versi, input, output, reasoning dicatat.

---

## 2. SCHEMA: SATU SUMBER KEBENARAN

Skema **Zod** (TS, `packages/schemas`) dan **Pydantic** (Python) WAJIB selaras —
diubah **bersamaan** dalam commit yang sama, tidak pernah salah satu saja.

---

## 3. TESTING WAJIB

- Setiap **fungsi perhitungan baru** → test dengan **nilai acuan dihitung manual** sebagai anchor.
- Setiap **fitur AI baru** → wajib punya **fallback manual**: bila AI gagal/ragu, pengguna tetap bisa menyelesaikan pekerjaan.
- Sebelum commit: jalankan test yang relevan (pytest/vitest/`tsc --noEmit`). Kalau merah, jangan commit — lapor.

---

## 4. KEAMANAN

- ❌ JANGAN taruh rahasia/kunci API di repo. Gunakan `.env.example` + secret manager; `.env*` selalu di `.gitignore`.
- ✅ RBAC per peran (estimator/PM/lapangan/owner) untuk fitur multi-user.

---

## 5. PEMBAGIAN CLAUDE vs CODEX & GERBANG REVIEW

Pembagian (dicerminkan juga di `AGENTS.md` untuk Codex):

- **Claude** → thinking berat: frontend (`apps/web`), kerja "data" (dataset AHSP,
  pencocokan harga, pemetaan template), keputusan arsitektur, dan apa pun yang
  menyentuh Aturan Emas (§1). Claude juga me-review hasil Codex yang menyentuh perhitungan.
- **Codex** → kode tanpa thinking berat: implementasi dengan spek jelas, wiring
  config/env, endpoint mengikuti pola yang sudah ada, script & test mekanis.

Untuk task yang menyentuh angka RAB/HSP: **Claude tulis spek + nilai acuan test
manual → Codex implementasi → Claude verifikasi pytest & angka sebelum commit.**
Codex tidak boleh mengubah rumus inti tanpa spek itu.

**GERBANG REVIEW (wajib):** semua pekerjaan dikerjakan di **branch baru → PR**,
BUKAN langsung di `main`. Codex/Claude **tidak boleh auto-merge**: PR menunggu
pemeriksaan owner + Claude dulu, merge hanya setelah disetujui. Jangan
commit/push langsung ke `main`.

---

## 6. PROTEKSI COMMAND ROOM

File terkait Command Room (chat AI utama, model routing Lucent/Solace) **tidak
boleh dihapus atau dipindah** kecuali sudah terbukti tidak dipakai — buktikan
dulu lewat `graphify query`/`graphify path` + grep import + cek test:

- `apps/web/src/app/(dashboard)/command-room/`, `apps/web/src/components/command-room/`
- `apps/web/src/app/api/command-room/chat/route.ts`
- `apps/web/src/lib/paax-models.ts`, `apps/web/src/lib/ai/orchestrator.ts` (+ test)
- `apps/web/src/lib/chat/*` (chat-history, chat-run-store, chat-stream-events, use-chat-runs, format-run-duration)
- `.env.example` / `.env.local` (kunci NVIDIA/DeepSeek) — jangan pernah tampilkan isinya.

---

## 7. WORKFLOW GRAPHIFY-FIRST

Repo ini punya knowledge graph di `graphify-out/` (node/edge/community lintas
`apps/web`, `services/*`, `packages/*`).

- Untuk pertanyaan kode/arsitektur/dependency: `graphify query "<pertanyaan>"`
  dulu, lalu `graphify path "<A>" "<B>"` (relasi antar simbol) atau
  `graphify explain "<konsep>"` (penjelasan terfokus) — baru pakai
  Glob/Grep/Read kalau graph belum cukup menjawab.
- Setelah mengubah kode: `graphify update .` (AST-only, tanpa biaya API). Hook
  git (`post-commit`/`post-checkout`) sudah auto-rebuild — jalankan manual
  hanya kalau perubahan belum tercakup hook.
- Full rebuild (`graphify .`) hanya kalau graph hilang/rusak atau struktur
  repo berubah besar — jangan rebuild ulang tiap sesi/chat.
- Baca `graphify-out/GRAPH_REPORT.md` hanya untuk overview arsitektur luas saat
  query/path/explain tidak cukup.
