# AGENTS.md — PAAX AI

> ⚡ **SEBELUM KERJA: baca `docs/ai-map/START_HERE.md` dulu** (peta + status + navigasi)
> agar langsung terarah, tidak boros token, dan tidak meng-crawl semua file.
> File ini dibaca otomatis oleh Codex di setiap sesi. **Patuhi sepenuhnya.**
> Sumber kebenaran lengkap ada di `docs/MASTER_PLAN.md` (Blueprint Besar v2.0).
> Jika ragu, ikuti aturan di sini lebih dulu, lalu rujuk MASTER_PLAN.
> Dokumen strategi tambahan: `docs/strategy/PAAX_Analisis_Strategis_Companion.md`
> adalah pressure-test bisnis, biaya AI, margin, pricing, vendor model, dan
> prioritas roadmap. Baca saat task menyentuh roadmap, fitur AI, pricing,
> ekstraksi gambar, agent, biaya model, atau keputusan MVP.

---

## 0. Apa itu PAAX AI

Workspace AI untuk insinyur sipil / kontraktor / PM Indonesia: mengubah data
konstruksi tak-terstruktur (gambar kerja, PDF, RAB lama) menjadi keluaran
**auditable**: HSP, RAB patuh AHSP, BoQ, jadwal + Kurva S, simulasi skenario,
monitoring portofolio, dan Engineering Chat ter-grounding.

Moat = lokal Indonesia: AHSP (Permen PUPR No. 8/2023 + SE DJBK), bilingual,
harga satuan regional.

---

## 1. ATURAN EMAS — AI TIDAK PERNAH MENGHITUNG

**Setiap angka** di RAB, BoQ, jadwal, Kurva S, dan skenario WAJIB berasal dari
**engine deterministik (Python, Lapis 2B)**. LLM hanya boleh menyentuh angka
untuk MENJELASKAN — tidak pernah MENGHITUNG atau MENGARANG.

Implikasi konkret yang HARUS ditegakkan:

- ❌ Tidak ada perhitungan RAB/HSP/bobot/durasi di frontend (TypeScript). Frontend hanya **menampilkan** hasil engine.
- ❌ Tidak ada LLM di jalur perhitungan. LLM boleh klasifikasi/ekstraksi (gambar → kode AHSP) dan hanya menghasilkan **usulan/mapping**; angka tetap dihitung engine.
- ✅ AHSP = sumber **koefisien**, bukan template output. RAB dibangun dari `koef × harga`, bukan disalin dari contoh.
- ✅ Satu sumber kebenaran tipe data: skema **Zod** (TS) selaras dengan model **Pydantic** (Python). Keduanya diubah **bersamaan**.
- ✅ Bahkan AI Agent otonom tunduk: agen boleh mengubah **input terstruktur** (volume, item, urutan) lalu memanggil ulang engine — tetapi **tidak pernah menulis angka hasil sendiri**.

> Jika sebuah task akan membuat LLM atau TypeScript menghitung angka final,
> **STOP dan lapor ke pemilik repo.** Itu pelanggaran aturan emas.

---

## 2. PRINSIP BANGUN BERTAHAP (Vertical Slices)

- **Satu sesi = satu task sempit & terdefinisi.** Jangan overscope. Konteks terlalu lebar membuat aturan emas terlupakan.
- **Verifikasi kriteria terima** tiap task sebelum lanjut.
- **Commit kecil & sering**, format **Conventional Commits** (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`).
- Setiap **fungsi perhitungan baru** WAJIB disertai **test dengan nilai acuan yang dihitung manual**.
- Setiap **fitur AI baru** WAJIB punya **fallback manual**: bila AI gagal/ragu, pengguna tetap bisa menyelesaikan pekerjaan.
- Jangan menambah dependency / service baru tanpa alasan yang jelas terkait task aktif.

---

## 3. ARSITEKTUR (4 lapis + data) — tanggung jawab tidak boleh tertukar

| Lapis | Teknologi | Tanggung Jawab | TIDAK BOLEH |
|---|---|---|---|
| 0 — Presentasi | Next.js 14, TS, Tailwind, shadcn/ui | Seluruh UI | Menghitung angka RAB |
| 1 — Orkestrasi | Node/Genkit, tool-calling, RAG, scheduler | Router + agen, pilih model, panggil engine | Mengarang angka final |
| 2A — Persepsi | Python: OCR + CV + Vision-LLM | Deteksi & ukur elemen, pemecahan per-lantai | Menetapkan harga/biaya |
| 2B — Engine | FastAPI/Python, Pydantic, NumPy | **Semua perhitungan deterministik** | Memakai LLM untuk aritmetika |
| 2C — Site Agent | Python/TS | Lapor progres, analisa foto, deviasi | Menggantikan verifikasi manusia |
| 3 — Data | Postgres/Firestore, Object Storage, Vector Store, DB AHSP | Data proyek, file, RAG, koefisien & harga | Menyimpan rahasia di repo |

---

## 4. STRUKTUR MONOREPO

```
paax-ai/
├─ apps/web/                  # Next.js workspace + dashboard
│  └─ app/projects/[id]/      # drawings · rab · schedule · scenarios · chat · monitoring
├─ services/
│  ├─ core-engine/            # FastAPI — perhitungan deterministik (Lapis 2B)
│  ├─ ai-orchestrator/        # router + agents + RAG + scheduler  (mulai v0.8)
│  ├─ document-intelligence/  # OCR + CV + ekstraksi kuantitas     (mulai v1.0)
│  └─ site-agent/             # progres lapangan + analisa foto    (v2.0)
├─ packages/
│  ├─ schemas/                # JSON Schema → Zod + Pydantic (1 sumber kebenaran)
│  └─ ui/ · constants/ · tsconfig/
├─ data/  ├─ ahsp/  └─ harga-satuan/   # koefisien & harga regional
└─ docs/  # MASTER_PLAN.md, ADR, API
```

Stack: pnpm workspaces + Turborepo · Next.js 14 (App Router) · React Query + Zod ·
Python 3.11+ / FastAPI / Pydantic / NumPy · Deploy: Cloud Run (services) + Vercel/Firebase (web).

---

## 5. RUMUS ENGINE (kanonik — semua deterministik)

```
A (Bahan) = Σ (koef_bahanᵢ × harga_bahanᵢ)
B (Upah)  = Σ (koef_upahⱼ × harga_upahⱼ)        ; koef tenaga dalam OH (Orang-Hari)
C (Alat)  = Σ (koef_alatₖ × harga_alatₖ)
HSP       = (A + B + C) × (1 + BUK%)            ; BUK = Biaya Umum & Keuntungan

Harga Item = Volume × HSP
Subtotal   = Σ Harga Item
RAB Total  = Subtotal + PPN

Bobot Item (%) = (Harga Item / RAB Total) × 100%
Kurva S        = Σ kumulatif progres seluruh item per periode

mandays      = Volume × koef_OH
durasi (hari) = mandays ÷ jumlah pekerja efektif
```

**Nilai acuan test (WAJIB diverifikasi ke repo asli sebelum diandalkan):**
test engine harus memuat minimal satu nilai HSP dan satu subtotal RAB yang
dihitung manual sebagai anchor. Jangan ubah angka acuan tanpa menghitung ulang
manual dan mencatat sumber koefisien AHSP-nya.

---

## 6. STATE SAAT INI & ROADMAP

**Sekarang:** transisi **v0.6 (Deterministic Foundation) → v0.7 (Workspace Hidup).**

- v0.6 — Engine HSP/RAB/Kurva-S deterministik + test + halaman uji RAB.
- v0.7 — Multi-proyek + DB CRUD + UI shell + editor RAB + browser AHSP/harga + export Excel/PDF.
- v0.8 — Smart Import (upload RAB Excel + AI mapping kolom + deteksi anomali harga). **AI orchestrator pertama aktif.**
- v0.9 — Gantt + jalur kritis + simulator skenario + narasi AI.
- v1.0 — Gambar → BoQ → RAB (CV) + Engineering Chat (RAG + tools). **Lompatan terbesar.**
- v1.5 — Laporan pagi · prediksi material · Agent Autopilot (add-on metered).
- v2.0 — Monitoring multi-proyek · Site Agent · dashboard PM.

> **Tahan godaan membangun v1.0 (vision) lebih awal.** Risiko terbesar ditunda
> sampai fondasi matang. Nilai mengalir tiap rilis lewat jalur manual + Smart Import.

---

## 7. KEAMANAN & DISIPLIN REPO

- ❌ JANGAN menaruh rahasia/kunci API/`.env` di repo. Gunakan `.env.example` + secret manager.
- ✅ Pastikan `.gitignore` mencakup: `node_modules/`, `.next/`, `.turbo/`, `dist/`, `build/`, `__pycache__/`, `*.pyc`, `.venv/`, `venv/`, `.env`, `.env.*`, `.DS_Store`, `coverage/`, `.pytest_cache/`.
- ✅ Sebelum commit: jalankan test engine (pytest). Kalau merah, jangan commit — lapor.
- ✅ Konsistensi versi & dokumentasi (CHANGELOG/README) dijaga sejak awal.
- ✅ RBAC per peran (estimator/PM/lapangan/owner) saat fitur multi-user mulai dibangun.

---

## 8. CARA KERJA DENGAN PEMILIK REPO (Wisnu)

- Pemilik = **product owner non-coder**: pandu dengan ringkasan jelas, skrip demo, dan kriteria terima — bukan dump kode panjang.
- Bahasa: **Indonesia**.
- Saat selesai task: tampilkan (1) apa yang berubah, (2) cara mencoba/verifikasi, (3) `git status` + commit yang dibuat, (4) usulan task berikutnya.
- Jika menemui ambiguitas keputusan arsitektural (mis. Postgres vs Firestore), **STOP dan tanyakan** — jangan asumsi diam-diam.

---

## 9. PEMBAGIAN TUGAS: CODEX vs CLAUDE

Sejak 2026-06-28, Wisnu memakai Codex dan Claude berdampingan di repo ini.
Pembagian (dicerminkan juga di `CLAUDE.md` untuk Claude):

- **Codex (kamu)** → kode tanpa thinking berat: implementasi backend yang
  SUDAH punya spek jelas (rumus §5 / ADR terkait), wiring config/env,
  endpoint mengikuti pola yang sudah ada, script & test mekanis.
- **Claude** → thinking berat: frontend (`apps/web`), kerja "data" (dataset
  AHSP, pencocokan harga by-nama, pemetaan template export), keputusan
  arsitektur, dan apa pun yang menyentuh Aturan Emas (§1) atau butuh
  judgment domain.

Kalau task yang kamu terima ternyata butuh keputusan domain/ambigu, atau
menyentuh rumus inti RAB/HSP TANPA spek/nilai-acuan yang sudah jelas —
**STOP, jangan menebak. Minta Wisnu bawa ke sesi Claude dulu.** Konsisten
dengan Aturan Emas §1: jangan mengarang angka atau logika perhitungan sendiri.

**GERBANG REVIEW (wajib, sejak 2026-06-28):** kerjakan di **branch baru →
push → buka PR**, lalu **BERHENTI**. JANGAN merge ke `main` sendiri dan jangan
commit/push langsung ke `main`. PR menunggu pemeriksaan owner + Claude; merge
hanya setelah disetujui. Kalau review minta perbaikan, push lagi ke branch yang
sama.
