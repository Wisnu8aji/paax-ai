# AGENTS.md — PAAX AI

> Aturan permanen & pendek — bukan peta kode atau status proyek.
> Peta dokumentasi on-demand: `docs/INDEX.md`. Status aktif: `docs/ai-map/STATE_CURRENT.md`.
> Navigasi kode/dependency/test: **Graphify dulu** (§7), jangan Glob/Grep buta.
> File ini dibaca otomatis oleh Codex di setiap sesi. **Patuhi sepenuhnya.**

---

## 1. ATURAN EMAS — FORMULA DAN ANGKA FINAL WAJIB DETERMINISTIK

Determinisme berlaku **hanya** untuk eksekusi rumus dan angka final RAB, BoQ,
jadwal, Kurva S, skenario, serta kuantitas fisik. Nilai tersebut wajib berasal
dari `services/core-engine` (Python) dengan measurement facts yang sudah
disetujui dan scoped. LLM, TypeScript, dan ringkasan agent tidak boleh
dipresentasikan sebagai angka final.

- ❌ Tidak ada perhitungan RAB/HSP/bobot/durasi di frontend. Frontend hanya menampilkan receipt hasil engine.
- ❌ Tidak ada LLM di jalur eksekusi rumus atau otoritas kuantitas final.
- ✅ Agent tetap agentic: boleh melakukan Vision/persepsi, ekstraksi, interpretasi, evidence reconciliation, klasifikasi, planning, review, penjelasan, dan proposal fakta terstruktur.
- ✅ AHSP = sumber koefisien; Core Engine = pelaksana rumus dan pemilik output angka final.
- ✅ AI Agent otonom boleh menulis usulan input terstruktur lalu meminta Core Engine menghitung ulang; tidak boleh menulis angka hasil sendiri.

Kalau task membuat LLM atau TypeScript menghitung atau menyatakan angka final,
**STOP, jangan menebak, lapor ke pemilik repo.** Itu pelanggaran aturan emas.

### 1.1 Batas Vision dan AI-Assist Agentik

Lapisan AI-assist (`services/document-intelligence/app/perception/ai_assist/`)
melengkapi parser/rule-based, bukan menggantikan otoritas Core Engine:

- Native PDF parsing, OCR, regex, dan geometri adalah fast-path bukti yang murah dan dapat diuji; bukan larangan bagi Vision agentik.
- Vision provider yang dikonfigurasi (target live: MiMo v2.5) boleh membaca halaman/render gambar untuk tugas persepsi dan mengembalikan observasi ber-citation, confidence, serta status abstain.
- Agent dapat dipanggil untuk ambiguitas **atau** review berbasis bukti yang bernilai; setiap proposal tetap melalui validasi fakta/constraint dan antrean review.
- **Tidak ada auto-commit ke input engine** — approval manusia dan provenance tetap wajib.
- Audit trail wajib menyimpan provider/model, prompt/versi, input, output, evidence refs, serta keputusan review; jangan menyimpan secret.

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

## 5. PEMBAGIAN CODEX vs CLAUDE & GERBANG REVIEW

Pembagian (dicerminkan juga di `CLAUDE.md` untuk Claude):

- **Codex (kamu)** → kode tanpa thinking berat: implementasi dengan spek jelas,
  wiring config/env, endpoint mengikuti pola yang sudah ada, script & test mekanis.
- **Claude** → thinking berat: frontend (`apps/web`), kerja "data" (dataset AHSP,
  pencocokan harga, pemetaan template), keputusan arsitektur, dan apa pun yang
  menyentuh Aturan Emas (§1) atau butuh judgment domain.

Kalau task yang kamu terima ternyata butuh keputusan domain/ambigu, atau
menyentuh rumus inti RAB/HSP TANPA spek/nilai-acuan yang sudah jelas — **STOP,
jangan menebak. Minta Wisnu bawa ke sesi Claude dulu.**

**GERBANG REVIEW (wajib):** kerjakan di **branch baru → push → buka PR**, lalu
**BERHENTI**. JANGAN merge ke `main` sendiri dan jangan commit/push langsung
ke `main`. PR menunggu pemeriksaan owner + Claude; merge hanya setelah
disetujui. Kalau review minta perbaikan, push lagi ke branch yang sama.

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

PAAX memakai graph persistent **per modul aktif**, bukan mengasumsikan satu
graph root: `services/document-intelligence`, `services/core-engine`,
`services/ai-orchestrator`, dan `apps/web` masing-masing memiliki
`graphify-out/`.

- Untuk pertanyaan kode/arsitektur/dependency: jalankan `graphify query "<pertanyaan>"`
  dari folder modul terkait dulu, lalu `graphify path "<A>" "<B>"` (relasi antar simbol) atau
  `graphify explain "<konsep>"` (penjelasan terfokus) — baru pakai
  Glob/Grep/Read kalau graph belum cukup menjawab.
- Setelah mengubah kode: refresh graph modul terdampak. Bila semantic backend belum
  dikonfigurasi, gunakan `graphify <module> --code-only --no-viz` lalu
  `graphify cluster-only <module> --no-viz`; jangan mengklaim graph kode mencakup isi Markdown.
- Baca `graphify-out/GRAPH_REPORT.md` modul hanya untuk overview arsitektur luas saat
  query/path/explain tidak cukup.

**WAJIB, bukan opsional.** Untuk setiap task yang menyentuh kode/arsitektur/dependency
di repo ini: jalankan `graphify query "<pertanyaan>"` (atau `graphify path`/
`graphify explain`) **sebelum** Glob/Grep/Read buta — bukan hanya "kalau graph
belum cukup", tapi sebagai langkah pertama secara default.

### 7.1 User Memory: Always Use Graphify For This Repo

User preference for `D:\paax-ai-main`: for any prompt or task involving this
repo, use the Graphify skill/workflow first to locate relevant files, symbols,
dependencies, and architecture context before broad source browsing. Prefer
`graphify query`, `graphify path`, or `graphify explain` as the first navigation
step so work is faster, more accurate, and uses fewer tokens.

This is mandatory project memory. Do not skip it unless the user explicitly says
not to use Graphify for that task, or the task is purely outside the repo/codebase.

## graphify

This project has module knowledge graphs at each active module's `graphify-out/` with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` from the module when its graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, refresh the affected module graph and record its freshness.
