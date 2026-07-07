# PAAX — ROADMAP 10+ TASK NON-UI JANGKA JAUH (2026-07-07)

> **Status: RINGKASAN + 13 PROMPT DETAIL SUDAH DITULIS (2026-07-07),
> BELUM DIJALANKAN.** Prompt induk untuk rangkaian kerja backend/data/infra
> SETELAH rombak desain 2026-07-07 selesai. Disusun Claude atas instruksi
> owner: "pekerjaan selanjutnya yang tidak berhubungan dengan UI, minimal
> 10 task jauh ke depan, tiap task kompleks." Owner sudah mengkonfirmasi
> **Postgres (Cloud SQL)** untuk Task 6 (bukan Firestore) — semua prompt
> turunannya (7,8,10,11,12,14) sudah ditulis dengan asumsi itu.
>
> **File prompt lengkap per task** (baca file terkait, BUKAN ringkasan di
> bawah, saat benar-benar menjalankan Codex):
> - Task 1 → `PAAX_CODEX_TASK_05_BRIDGING_ARSITEKTUR_PONDASI_LANTAI_ATAP_MIRING_AANSTAMPING_2026-07-05.md` (sudah ada dari sesi lalu)
> - Task 2 → `PAAX_CODEX_TASK_R2_JOB_STORE_PERSISTEN_2026-07-07.md`
> - Task 3 → `PAAX_CODEX_TASK_R3_CACHE_ANALISA_DOKUMEN_2026-07-07.md`
> - Task 4 → `PAAX_CODEX_TASK_R4_GOLDEN_ANCHOR_EVAL_HARNESS_2026-07-07.md`
> - Task 5 → `PAAX_CODEX_TASK_R5_DETEKSI_GEOMETRI_NONSTRUKTUR_LANJUTAN_2026-07-07.md`
> - Task 6 → `PAAX_CODEX_TASK_R6_DATABASE_SERVER_SIDE_POSTGRES_2026-07-07.md` (5 sub-PR)
> - Task 7 → `PAAX_CODEX_TASK_R7_AI_ORCHESTRATOR_TAHAP2_2026-07-07.md`
> - Task 8 → `PAAX_CODEX_TASK_R8_RAG_VECTOR_STORE_AHSP_2026-07-07.md`
> - Task 9 → `PAAX_CODEX_TASK_R9_DEPLOY_CICD_CLOUD_RUN_2026-07-07.md`
> - Task 10 → `PAAX_CODEX_TASK_R10_AUTH_RBAC_2026-07-07.md`
> - Task 11 → `PAAX_CODEX_TASK_R11_METERING_OBSERVABILITAS_2026-07-07.md`
> - Task 12 → `PAAX_CODEX_TASK_R12_LAPORAN_PAGI_OTOMATIS_2026-07-07.md`
> - Task 13 → `PAAX_CODEX_TASK_R13_HARGA_MULTI_WILAYAH_VERSIONING_2026-07-07.md`
> - Task 14 → `PAAX_CODEX_TASK_R14_SITE_AGENT_SCAFFOLD_2026-07-07.md`
>
> **Cara pakai**: SATU task (atau SATU sub-langkah untuk Task 6) = SATU
> sesi Codex = SATU branch baru → PR draft → tunggu review owner + Claude.
> JANGAN kerjakan dua task dalam satu branch. Task berurutan berdasarkan
> dependency (lihat §URUTAN & DEPENDENCY di bawah) — jangan lompat kecuali
> diminta owner.

---

## ATURAN WAJIB SEMUA TASK (tidak bisa ditawar)

1. **ATURAN EMAS** (`CLAUDE.md` §1): AI/LLM/TypeScript TIDAK PERNAH menghitung
   angka final. Semua volume/HSP/RAB/durasi dari `services/core-engine`.
   AI-assist hanya usulan tervalidasi berstatus `perlu_review` (§1.1).
2. **DILARANG menyentuh `apps/web/**`** — seluruh UI domain Claude.
3. **Branch baru → push → PR draft → BERHENTI.** Tidak self-merge, tidak
   commit/push ke `main`.
4. Commit **tanpa trailer apa pun** (`Co-Authored-By`/`Generated with` dilarang).
5. Tiap fungsi kalkulasi baru wajib test dengan **nilai acuan dihitung manual**.
6. Test penuh service yang disentuh HARUS hijau sebelum commit. Baseline saat
   ini: document-intelligence 272 passed/5 skipped, core-engine 280 passed,
   schemas 14 passed, ai-orchestrator 30 passed, web 47 passed.
7. Selesai task: tulis report baru di `report-remote/` (jangan timpa), update
   `docs/ai-map/STATE.md`.
8. Kalau menemui keputusan arsitektur ambigu → **STOP, tanya owner** — jangan
   asumsi diam-diam.

---

## TASK 1 — Bridging 4 Sub-Domain Arsitektur Sisa (Task 5 lama, spek SUDAH ADA)

Jalankan `docs/prompts/PAAX_CODEX_TASK_05_BRIDGING_ARSITEKTUR_PONDASI_LANTAI_ATAP_MIRING_AANSTAMPING_2026-07-05.md`
apa adanya: bridging `pondasi_batu`, `lantai`, `atap_miring` (penutup atap —
BEDA dari rangka atap Task 1/2), `aanstamping` — REUSE infrastruktur
`arsitektur_area_assist.py`/`bridging_arsitektur_area.py` Task 4, BUKAN modul
baru. Setelah ini SEMUA 7 sub-domain `ArsitekturRequest` ter-bridging.
**Terima**: document-intelligence naik dari 272 passed, anti-halusinasi
per-field teruji, rumus `app/takeoff/arsitektur.py` TIDAK diubah.

## TASK 2 — Job Store Persisten + Antrian Analisa Document-Intelligence

Ganti job store in-memory `/drawings/analyze` dengan persistensi (SQLite
file-based, TANPA dependency server eksternal) + antrian async + retry +
TTL/cleanup. Status job harus selamat dari restart service (kelemahan yang
sekarang diakui jujur oleh tool `analyze_drawing` ai-orchestrator).
**Terima**: restart uvicorn di tengah job → status masih bisa di-poll; test
simulasi restart; kontrak endpoint TIDAK berubah (klien lama tetap jalan).

## TASK 3 — Cache Hasil Analisa per Dokumen (Biaya & Latency AI)

Implement cache konten-addressed (hash PDF → hasil konsolidasi + usulan
AI-assist) supaya dokumen yang sama TIDAK memicu panggilan Gemini ulang —
amanat eksplisit `CLAUDE.md` §1.1 ("cache hasil per dokumen") & MASTER_PLAN
§12-14. Termasuk audit-trail versi prompt/model di entri cache (kalau versi
prompt berubah, cache miss).
**Terima**: dokumen identik diunggah 2× → panggilan LLM ke-2 = 0 (dibuktikan
test dengan fake client penghitung panggilan); invalidasi saat versi prompt naik.

## TASK 4 — Golden-Anchor Test Harness PLHUT + Eval per-Skill AI-Assist

Bangun rezim testing brain v4.1 §6 (T-01..T-08) tahap pertama: (a) golden
anchor 1 proyek nyata — fixture PLHUT terkunci di `tests/` (ATURAN owner:
PLHUT = kunci uji, BUKAN template) dengan snapshot hasil konsolidasi/work-items
yang di-diff eksplisit tiap perubahan pipeline; (b) eval per-skill AI-assist:
skrip yang mengukur akurasi/penolakan tiap modul `ai_assist/*` terhadap set
kasus berlabel (benar, halusinasi, ambigu); (c) property-based test geometri
grid (hypothesis) untuk `grid_geometry.py`.
**Terima**: `pytest -m golden` dan skrip eval jalan di CI; laporan akurasi
per-skill tercetak sebagai artefak; tidak ada fixture PLHUT yang bocor jadi
logika produksi.

## TASK 5 — Deteksi Geometri Non-Struktur Lanjutan (gap jujur Fase X2)

Tutup 3 gap deteksi yang dicatat report X2: (a) garis dinding dari geometri
vektor PDF (polygon ruangan → panjang dinding nyata, bukan hanya luas
dokumen); (b) `qty_counted` kusen dari simbol/blok berulang; (c) titik MEP
dari simbol (bukan hanya catatan jumlah teks). Rule-based/geometri deterministik
DULU; AI-assist hanya fallback teks sesuai pola yang sudah ada.
**PERHATIAN**: kalau desain ekstraksi per kategori ternyata butuh keputusan
bentuk-data baru, STOP dan minta sesi desain Claude — jangan improvisasi skema.
**Terima**: cakupan PLHUT naik terukur (baseline 36%), tiap detektor punya
test negatif (gambar tanpa elemen itu → nol deteksi palsu).

## TASK 6 — Database Proyek Server-Side (persistensi RAB/TKG/jadwal)

**✅ KEPUTUSAN OWNER (2026-07-07): Postgres (Cloud SQL).** Prompt detail
lengkap: `PAAX_CODEX_TASK_R6_DATABASE_SERVER_SIDE_POSTGRES_2026-07-07.md`
(5 sub-PR berurutan). Bangun service/lapisan data server-side untuk proyek,
draft RAB (input terstruktur), TKG tersimpan, dan riwayat chat — menggantikan
localStorage browser sebagai satu-satunya penyimpanan. Ini PRASYARAT
Engineering Chat lintas-proyek nyata (temuan audit B0: `query_rab` orchestrator
hanya bisa baca `context` kiriman client karena tidak ada DB server-side),
kolaborasi multi-user, dan monitoring v2.0. Sertakan API CRUD + migrasi data
dari format localStorage yang ada + skema Zod/Pydantic selaras.
**Terima**: ai-orchestrator bisa fetch RAB/jadwal proyek server-side tanpa
context dari client; data lama user bisa diimpor; RBAC-ready (kolom owner/role).

## TASK 7 — AI-Orchestrator Tahap 2: Context Server-Side, Streaming, Audit Log

Lanjutan Task 6: (a) tool `query_rab`/`query_schedule` membaca DB proyek
server-side (fallback `context` client tetap ada); (b) `POST /chat` streaming
SSE (jawaban token-per-token) tanpa mengubah kontrak non-streaming; (c) audit
log persisten tiap tool-call (model, input, output, latency, token) ke storage
Task 6 — amanat audit-trail §1.1; (d) rate-limit per klien.
**Terima**: test streaming dengan fake client; log audit bisa di-query per
percakapan; 30 test lama tetap hijau + test baru.

## TASK 8 — RAG Grounding: Vector Store AHSP + Dokumen Proyek

Bangun lapisan retrieval untuk Engineering Chat tahap 2 (MASTER_PLAN §8):
embedding katalog AHSP CK 2026 (2.542 item, data di `G:\paax-data` — JANGAN
commit datanya) + dokumen/TKG proyek, disimpan di vector store (pilih yang
tanpa infra berat dulu: SQLite-vec/pgvector sesuai keputusan Task 6), tool
baru `search_knowledge` di orchestrator yang mengembalikan kutipan + rujukan
(kode AHSP/halaman) — jawaban chat wajib bisa ditelusuri, bukan mengarang.
**Terima**: query "pasangan bata 1/2 batu" → kandidat AHSP relevan dengan kode
persis dari katalog; test retrieval deterministik dengan fixture kecil sintetis.

## TASK 9 — Deploy & CI/CD: Cloud Run + Secret Manager + Staging

Sesuai ADR-0003 (Google-first): containerize `core-engine`,
`document-intelligence`, `ai-orchestrator` (Dockerfile + healthcheck),
deploy Cloud Run dengan `GEMINI_API_KEY`/`PAAX_DATA_DIR` via Secret
Manager/volume (JANGAN pernah masuk repo), pipeline CI: test matrix semua
service → build image → deploy staging otomatis, produksi manual-approve.
CORS dikencangkan (sekarang terbuka).
**Terima**: satu perintah/workflow menghasilkan staging URL hidup untuk 3
service; dokumen runbook deploy; tidak ada secret di git history.

## TASK 10 — Auth & RBAC (estimator / PM / lapangan / owner)

Firebase Auth (email + Google) di lapisan API: verifikasi JWT di ketiga
service Python/Node, scoping data per user/organisasi di DB Task 6, empat
peran dengan matriks izin (estimator: RAB penuh; lapangan: progres saja;
owner: semua + billing) sesuai `docs/security/data-governance.md`. Endpoint
tanpa token → 401; lintas-tenant → 403; teruji.
**Terima**: test integrasi peran-per-endpoint; tidak ada jalur anonim ke data
proyek; kunci service-to-service terpisah dari kunci user.

## TASK 11 — Metering & Observabilitas Biaya AI

Amanat MASTER_PLAN §12-14 ("meter operasi mahal"): hitung & simpan pemakaian
per tenant — panggilan LLM (token in/out, model), halaman dianalisa, ekstraksi
cache-hit vs miss; endpoint agregat pemakaian; kuota per paket dengan
penolakan halus saat lewat batas (pesan jelas, bukan error 500); alarm anomali
sederhana (pemakaian harian > N× rata-rata).
**Terima**: tiap panggilan Gemini di document-intelligence & orchestrator
tercatat; test kuota-terlampaui; nol overhead saat metering dimatikan via env.

## TASK 12 — Laporan Pagi Otomatis (AI Proaktif v1.5 tahap 1)

Scheduler (Cloud Scheduler/cron container) → generator laporan pagi per
proyek: ringkas status dari DB (progres, warning, item `perlu_review`
menunggu approval, deviasi jadwal via engine `/schedule/*`) → LLM HANYA
menarasikan angka yang sudah dihitung engine → simpan sebagai artefak laporan
(schema baru `MorningReport`) siap ditampilkan UI/di-e-mail nanti.
**Terima**: laporan bisa digenerate on-demand + terjadwal; setiap angka di
narasi bisa ditelusuri ke sumber engine-nya (test membandingkan angka narasi
vs angka sumber); tanpa API key → laporan versi tabel tanpa narasi tetap jadi.

## TASK 13 — Ekspansi Harga Regional Multi-Wilayah + Versioning Price Book

Generalisasi pipeline `scripts/harga` dari Semarang/Surakarta ke wilayah
berikutnya: extractor menerima format SHSD yang bervariasi, price book dapat
`effective_date` + versi (harga berubah per periode — RAB lama harus tetap
bisa dihitung ulang dengan harga saat itu), engine memilih price book
berdasarkan wilayah + tanggal. Data hasil tetap di `G:\paax-data` (di luar repo).
**Terima**: 2 versi price book wilayah sama hidup berdampingan; test engine
memilih versi benar berdasar tanggal; audit unmatched/ambiguous per wilayah.

## TASK 14 — Scaffold Site Agent v2.0 (API progres lapangan)

Tahap pertama `services/site-agent`: API laporan harian (progres per item RAB,
cuaca, jumlah pekerja, catatan) tersimpan ke DB Task 6, perbandingan
deterministik rencana-vs-realisasi via engine (deviasi = angka engine, BUKAN
AI), foto tersimpan sebagai referensi (analisa foto AI DITUNDA — hanya
placeholder kontrak). AI tidak menetapkan % progres final — manusia konfirmasi.
**Terima**: alur lapor → deviasi terhitung engine → tersimpan; test kontrak
lengkap; TIDAK ada vision-LLM di jalur ini dulu.

---

## URUTAN & DEPENDENCY (ringkas)

```
1 (arsitektur sisa)  → mandiri, jalan kapan saja
2 (job store) → 3 (cache) → 4 (golden/eval) → 5 (deteksi lanjutan)
6 (DB server-side, Postgres — DIKONFIRMASI) → 7 (orchestrator tahap 2) → 8 (RAG)
                                       → 10 (auth) → 11 (metering) → 12 (laporan pagi)
9 (deploy/CI) → bisa paralel setelah 2; wajib sebelum 12 produksi
13 (harga multi-wilayah) → mandiri setelah 1
14 (site agent) → butuh 6 & 10
```

Titik STOP wajib tanya owner: **Task 6** — ✅ SUDAH DIJAWAB (Postgres) —
dan **Task 5** (kalau di tengah jalan butuh skema data baru yang belum
diantisipasi prompt, lihat §5 file Task R5). Selain itu, tiap task berdiri
sendiri sebagai
satu sesi + satu PR.
