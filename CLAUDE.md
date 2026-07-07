# CLAUDE.md — PAAX AI

> ⚡ **SEBELUM KERJA: baca `docs/ai-map/START_HERE.md` dulu** (peta + status + navigasi)
> agar langsung terarah, tidak boros token, dan tidak meng-crawl semua file.
> File ini dibaca otomatis oleh Claude Code di setiap sesi. **Patuhi sepenuhnya.**
> Sumber kebenaran lengkap ada di `docs/MASTER_PLAN.md` (Blueprint Besar v2.0).
> Jika ragu, ikuti aturan di sini lebih dulu, lalu rujuk MASTER_PLAN.
> Dokumen strategi tambahan: `docs/strategy/PAAX_Analisis_Strategis_Companion.md`
> adalah pressure-test bisnis, biaya AI, margin, pricing, vendor model, dan
> prioritas roadmap. Baca saat task menyentuh roadmap, fitur AI, pricing,
> ekstraksi gambar, agent, biaya model, atau keputusan MVP.
> Spek rinci rumus takeoff & pipeline baca-gambar (92 rumus, TKG, 31 skill):
> `docs/specs/brain-v4.1/` — ringkasan gap vs dokumen ini: `docs/BRAIN_ALIGNMENT.md`.

---

## 0. Apa itu PAAX AI

Workspace AI untuk insinyur sipil / kontraktor / PM Indonesia: mengubah data
konstruksi tak-terstruktur (gambar kerja, PDF, RAB lama) menjadi keluaran
**auditable**: HSP, RAB patuh AHSP, BoQ, jadwal + Kurva S, simulasi skenario,
monitoring portofolio, dan Engineering Chat ter-grounding.

Moat = lokal Indonesia: AHSP (Permen PUPR No. 8/2023 + SE DJBK), bilingual,
harga satuan regional.

---

## 0.1 AI Sebagai Lapisan Pusat — Hadir di Hampir Setiap Tahap, Bukan Fitur Tempelan

PAAX **bukan** aplikasi RAB manual yang ditempeli AI di satu-dua tempat.
AI adalah lapisan **interpretasi & asistensi** yang hadir di hampir setiap
tahap alur kerja nyata (dikonfirmasi di kode per 2026-07-05), bukan klaim
pemasaran:

- **Baca gambar kerja** — lapisan AI-assist (§1.1) mengisi celah
  klasifikasi/binding SETIAP KALI rule-based gagal/ambigu: dimensi
  footplat, klasifikasi zona sheet, dinding pasangan bata, rangka atap
  (gording/trekstang/ikatan angin), jadwal kusen, titik MEP, kuda-kuda/
  profil baja, arsitektur area (keramik/plafon/waterproofing).
- **Menyusun RAB** — Smart RAB Builder: teks/tabel elemen bebas → usulan
  tipe + kode AHSP + seksi WBS + confidence (rule-based gratis, Gemini
  opsional).
- **Asisten insinyur** — Engineering Chat via `services/ai-orchestrator`
  (tool-calling nyata ke Gemini): membaca konteks proyek, memanggil tool
  (`lookup_ahsp`, `run_scenario`, `analyze_drawing`, `query_rab`,
  `query_schedule`), menalar jawaban.
- **Mentranskripsi gambar (fallback)** — menyalin teks gambar → struktur
  TkgDocument saat upload PDF langsung tidak tersedia/gagal.

Hampir tidak ada tahap dari upload gambar sampai RAB jadi yang sama sekali
tidak disentuh lapisan AI dalam beberapa bentuk. **Tapi** — dan inilah yang
membedakan PAAX dari produk "AI generates everything" — peran AI di setiap
titik itu SELALU interpretasi/klasifikasi/asistensi, **TIDAK PERNAH
kalkulasi angka final.** §1 di bawah bukan pembatas yang bertentangan
dengan poin ini — justru itulah yang membuat AI-di-mana-mana ini AMAN
dipakai untuk dokumen finansial/legal seperti RAB. Baca §1 sebelum
menyentuh kode apa pun yang berhubungan dengan AI.

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

### 1.1 AI-Assist untuk Klasifikasi & Binding (Lapisan 2A, paralel — bukan pengganti rule-based)

Sejak 2026-07-05 (dipicu temuan Fase X1/X1B: 13/13 elemen `pondasi_telapak`
PLHUT jatuh `perlu_review` karena dimensi hanya ada di halaman detail/grafis,
bukan tabel kode-dimensi yang bisa diparse regex), PAAX mengadopsi lapisan
AI-assist sebagai **fallback paralel** untuk `zone_classifier.py`,
`binding.py`, dan `consolidate.py` di `services/document-intelligence`
(rencana lengkap: `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md`
§X2, ringkasan gap: `docs/BRAIN_ALIGNMENT.md`). Aturan yang WAJIB ditegakkan
agar ini tidak melanggar Aturan Emas secara halus:

- **Rule-based tetap fast-path utama.** LLM HANYA dipanggil ketika ekstraksi
  regex/heuristik gagal atau ambigu (hasilnya `perlu_review`/`belum_didukung`).
  Tidak ada kasus di mana LLM menggantikan jalur deterministik yang sudah
  bekerja.
- **LLM membaca DATA YANG SUDAH DIEKSTRAK** (span teks + koordinat grid presisi
  dari PyMuPDF) — **BUKAN piksel gambar mentah**. Vision-on-raw-image tetap
  dihindari kecuali untuk halaman scan/raster tanpa layer teks (fallback
  OCR yang sudah ada, §12.1 MASTER_PLAN), karena vision-LLM murni ~60% akurat
  membaca dimensi gambar teknik vs data vektor PDF yang sudah eksak.
- **Setiap usulan LLM WAJIB divalidasi deterministik** sebelum jadi kandidat:
  angka yang diusulkan harus benar-benar muncul di span yang diekstrak
  (tidak boleh halusinasi), grid/kode yang diusulkan harus ada di registry,
  nilai harus masuk rentang wajar. Usulan yang gagal validasi ini dibuang,
  bukan dipaksakan.
- **Tidak ada auto-commit ke input engine.** Hasil lolos validasi tetap masuk
  sebagai kandidat berstatus `perlu_review` dengan `confidence` + `reason` —
  sama seperti alur `perlu_review` yang sudah ada — menunggu approval manusia
  sebelum dipakai sebagai input `services/core-engine`.
- **Audit trail wajib.** Setiap keputusan klasifikasi berbasis-AI dicatat
  (model, prompt/versi, input, output, reasoning) karena keluaran LLM bisa
  bervariasi antar run dan RAB harus tetap auditable. Pakai temperature
  rendah untuk meminimalkan varian, tapi tidak diklaim deterministik.
- **Biaya & latency dipertimbangkan di desain** — panggilan LLM per
  halaman/elemen di skala produksi tidak gratis; cache hasil per dokumen,
  jangan panggil ulang untuk dokumen yang sama (selaras §12–14 MASTER_PLAN).
- Ini BUKAN Vision-LLM v1.0 yang masih ditunda (baca piksel penuh sebagai
  jalur utama). Ini lapisan lebih sempit: LLM membaca teks+koordinat yang
  sudah eksak dari PyMuPDF untuk mengisi kekosongan klasifikasi/binding saat
  regex gagal — risiko jauh lebih rendah karena datanya sudah presisi.
- **Provider default: Gemini 2.5 Flash** (`GeminiAiAssistClient`,
  `services/document-intelligence/app/perception/ai_assist/client.py`) —
  sama dgn provider yang sudah dipakai `apps/web/src/lib/ai/orchestrator.ts`.
  Perbandingan alternatif (DeepSeek, OpenRouter, Groq, Qwen3 Coder) sudah
  didokumentasikan sbg referensi keputusan masa depan (bukan perubahan
  implementasi) di `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_
  2026-07-13.md` §X2.3a.

---

## 2. PRINSIP BANGUN BERTAHAP (Vertical Slices)

- **Satu sesi = satu task sempit & terdefinisi.** Jangan overscope. Konteks terlalu lebar membuat aturan emas terlupakan.
- **Verifikasi kriteria terima** tiap task sebelum lanjut.
- **Commit kecil & sering**, format **Conventional Commits** (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`).
- Setiap **fungsi perhitungan baru** WAJIB disertai **test dengan nilai acuan yang dihitung manual**. Target rezim testing lebih kaya (golden-anchor 1 proyek nyata, eval per-skill) ada di `docs/specs/brain-v4.1/PAAX_BRAIN_03_SKILL_API_PIPELINE_DATA.txt` §6 — diadopsi bertahap seiring modul rumus baru ditambah.
- Setiap **fitur AI baru** WAJIB punya **fallback manual**: bila AI gagal/ragu, pengguna tetap bisa menyelesaikan pekerjaan.
- Jangan menambah dependency / service baru tanpa alasan yang jelas terkait task aktif.

---

## 3. ARSITEKTUR (4 lapis + data) — tanggung jawab tidak boleh tertukar

| Lapis | Teknologi | Tanggung Jawab | TIDAK BOLEH |
|---|---|---|---|
| 0 — Presentasi | Next.js 15 (App Router), React 19, TS, Tailwind CSS v4, komponen custom `components/ui/` (BUKAN shadcn/ui — dicek langsung 2026-07-05, tidak ada dependency shadcn di repo) | Seluruh UI | Menghitung angka RAB |
| 1 — Orkestrasi | Node/Express, REST manual ke Gemini, tool-calling loop (`services/ai-orchestrator`, dibangun 2026-07-05 — BUKAN Genkit; deviasi sadar, lihat §1.1 & `docs/MASTER_PLAN.md` §15.1) | Router + agen, pilih model, panggil engine | Mengarang angka final |
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
│  ├─ ai-orchestrator/        # tool-calling Gemini (7 tool, dibangun 2026-07-05, lihat STATE.md)
│  ├─ document-intelligence/  # persepsi gambar (PyMuPDF real) + bridging non-struktur, sedang berjalan
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

> **Status hidup ada di `docs/ai-map/STATE.md` — baca file itu untuk detail
> terkini, jangan andalkan ringkasan di bawah ini untuk keputusan presisi.**
> Ringkasan per 2026-07-05 (garis besar, bukan status lengkap):

- v0.6 — ✅ Engine HSP/RAB/Kurva-S deterministik + test + halaman uji RAB.
- v0.7 — ✅ Multi-proyek + DB CRUD + UI shell + editor RAB + browser AHSP/harga + export Excel/PDF.
- v0.8 — ✅ Smart RAB Builder (AI-assist rule-based + Gemini opsional) + `services/ai-orchestrator` **sudah dibangun & aktif** (7 tool tool-calling ke Gemini, REST manual — bukan Genkit, lihat §3).
- v0.9 — ✅ Simulator skenario (frontier waktu-biaya) sudah jadi. ⏳ Gantt UI + jalur kritis (CPM): engine (`/schedule/cpm`, `/schedule/plan`) sudah lengkap & teruji, **UI-nya belum dibangun** — gap murni frontend.
- v1.0 — 🟡 **sedang berjalan, bukan lagi ditunda.** `services/document-intelligence` sudah punya pipeline persepsi PDF nyata (PyMuPDF, TKG, grid, PaddleOCR) + bridging ke core-engine untuk banyak kategori (footplat, dinding, atap/gording/kuda-kuda-baja, kusen, MEP, keramik/plafon/waterproofing). Lapisan AI-assist klasifikasi/binding (§1.1) berjalan sbg fallback teks (bukan vision-piksel). Engineering Chat (RAG + tools) masih tahap awal — orchestrator sudah ada tapi belum full-wired ke `apps/web`.
- v1.5 — ⚪ Laporan pagi · prediksi material · Agent Autopilot (add-on metered) — belum dimulai.
- v2.0 — ⚪ Monitoring multi-proyek · Site Agent · dashboard PM — belum dimulai.

> Vision-LLM piksel-mentah (baca gambar scan tanpa layer teks sbg jalur UTAMA)
> tetap ditahan — beda dari AI-assist teks+koordinat §1.1 yang sudah berjalan.

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

## 9. PEMBAGIAN TUGAS: CLAUDE vs CODEX

Sejak 2026-06-28, Wisnu memakai Claude dan Codex berdampingan di repo ini.
Pembagian (dicerminkan juga di `AGENTS.md` untuk Codex):

- **Claude** → thinking berat: frontend (`apps/web`), kerja "data" (dataset
  AHSP, pencocokan harga by-nama, pemetaan template export ke spek ADR),
  keputusan arsitektur, dan apa pun yang menyentuh Aturan Emas (§1) atau
  butuh judgment domain. Claude juga me-review hasil Codex yang menyentuh
  perhitungan sebelum dianggap selesai.
- **Codex** → kode tanpa thinking berat: implementasi backend yang SUDAH
  punya spek jelas (rumus §5 / ADR terkait), wiring config/env, endpoint
  mengikuti pola yang sudah ada, script & test mekanis.

Untuk task yang menyentuh angka RAB/HSP: **Claude tulis spek + nilai acuan
test manual → Codex implementasi → Claude verifikasi pytest & angka sebelum
commit.** Codex tidak boleh mengubah rumus inti tanpa spek itu — tetap
pelanggaran Aturan Emas kalau dilakukan diam-diam.

**GERBANG REVIEW (wajib, sejak 2026-06-28):** semua pekerjaan dikerjakan di
**branch baru → PR**, BUKAN langsung di `main`. Codex/Claude **tidak boleh
auto-merge**: PR menunggu pemeriksaan owner + Claude dulu, merge hanya setelah
disetujui. Jangan commit/push langsung ke `main`.
