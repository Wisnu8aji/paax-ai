# Audit 88 Halaman + Instruksi Codex Fase 3, 4, 5

**Tanggal:** 2026-07-15
**Peran saya di sini:** murni audit — tidak ada AI yang dijalankan ulang, tidak ada re-running 88 halaman. Semua angka di bawah dihitung langsung dari file JSON yang sudah tersimpan di `report/report_drawing_intelligence/dem_extraction_88pages/pages/`.

---

## 1. Selama running 88 halaman, masalahnya apa — sudah selesai?

Tiga masalah nyata muncul selama proses, semua **sudah selesai/diperbaiki**:

| # | Masalah | Status | Commit |
|---|---|---|---|
| 1 | Model mengarang struktur JSON sendiri (prompt cuma sebut nama skema) | Selesai — pindah ke `response_format: json_schema` strict | `dec0c36` |
| 2 | Parameter mematikan reasoning (`extra_body.enable_thinking`) diam-diam diabaikan provider | Selesai — ganti ke `reasoning: {"enabled": false}` (top-level) | `67e0aff` |
| 3 | Cakupan ekstraksi rendah (halaman legenda material cuma 25% tertangkap) | Selesai — checklist 13 kategori + few-shot di prompt | `d3ab55d` |
| 4 | `IncompleteRead` (jaringan terputus, 4-way paralel) salah diklasifikasi permanent | Selesai — diklasifikasi `transient`, halaman 49 diproses ulang sukses | `524ffc3` |

**Dua masalah lain ditemukan SETELAH 88 halaman selesai** (bukan selama proses) — ini yang jadi fokus pertanyaan Anda soal "evidence 0":

### Masalah "evidence 0" — audit ulang, angka lama SALAH

Laporan lama (`LAPORAN_88_HALAMAN_PLHUT_2026-07-15.md`) menulis **"10 halaman evidence kosong"**. Saya audit ulang barusan langsung dari 88 file JSON — **angka itu salah, yang benar 15 halaman**:

```
page_index (0-based): 2, 4, 10, 15, 19, 29, 40, 48, 61, 68, 72, 81, 82, 83, 85
page_number (1-based): 3, 5, 11, 16, 20, 30, 41, 49, 62, 69, 73, 82, 83, 84, 86
```

Root cause laporan lama salah: index 0-based dan page_number 1-based tercampur saat menulis laporan pertama kali, jadi 5 halaman tidak ketulis. Sudah saya perbaiki di file laporan aslinya.

**Isi 15 halaman ini bukan halaman kosong/gagal** — `observations` tetap terisi 6-63 item per halaman. Yang kosong murni array `evidence[]`-nya. Ini subset dari masalah dangling-reference di bawah.

### Dangling evidence_refs — 21,8%, benar TAPI cakupan metriknya ambigu (dikoreksi 2026-07-15)

> **Koreksi kedua (setelah verifikasi ulang bersama Codex):** angka 21,8% benar tapi hanya menghitung `observations.*.evidence_refs` — laporan sebelumnya tidak menegaskan ini eksplisit, jadi ambigu. `sheet_identity.*` (mis. `sheet_number`, `title`, `scale_candidates`) juga punya field `evidence_refs` sendiri (semua bertipe `InterpretedValue`) yang sebelumnya tidak ikut terhitung. Saya verifikasi ulang kedua cakupan langsung dari 88 file JSON:

| Cakupan | Total refs | Dangling | % | Halaman terdampak |
|---|---|---|---|---|
| `observations.*` saja | 3.549 | 775 | 21,8% | 40/88 |
| Seluruh dokumen (`observations.*` + `sheet_identity.*`) | 3.807 | 839 | 22,0% | 47/88 |

Kedua angka sudah diverifikasi cocok persis dengan koreksi yang diajukan. **Untuk Fase 3 (PCKM synthesis), pakai angka cakupan penuh (839/3.807, 47 halaman)** sebagai acuan risiko — itu yang mencerminkan seluruh permukaan skema, bukan cuma `observations`.

**Status:** akar masalah (prompt tidak menegaskan `evidence_refs` = foreign key wajib) sudah diperbaiki di kode (`1ca1e44`) untuk ekstraksi berikutnya. **Data 88-halaman yang sudah ada TIDAK diproses ulang** — sesuai batas "88 halaman hanya 1x jalan" yang Anda tetapkan. Ini dipakai apa adanya dengan catatan.

**Apakah ini "harus segera diselesaikan" seperti yang Anda minta?** Tidak dengan cara re-running — itu melanggar batas yang sudah Anda tetapkan sendiri. Yang bisa dan sudah saya lakukan: audit ulang angkanya biar laporan akurat (baru saja selesai di atas). Perbaikan sesungguhnya (data 88 halaman yang bersih tanpa dangling ref) baru terjadi di ekstraksi BERIKUTNYA — bukan dengan menyentuh data yang sudah ada.

### Bounding box piksel vs normalized — 97% halaman, terkonfirmasi

Tidak diaudit ulang detail kali ini (tidak ada indikasi laporan lama salah di sini, formulanya sederhana: `max(bbox) > 1.5`), status sama: diperbaiki di prompt (`e0b6b35`) untuk ke depan, data lama tidak diubah.

---

## 2. Total cost 88 gambar — TIDAK BISA saya pastikan angkanya

Ini temuan audit yang perlu saya sampaikan jujur: **`qwen.py` tidak pernah menyimpan field `usage` dari respons API**. Saya cek kode di `extract_page()` — yang diambil dari `body` cuma `body["choices"][0]["message"]["content"]`; `body["usage"]` (token count, cost) dibuang setiap kali, tidak pernah masuk ke `DemGeneration`, `run_summary.json`, atau file manapun.

Saya coba dua jalur lain untuk memastikan:
- **OpenRouter `/api/v1/credits`** → total pemakaian akun sejak awal: **$3.76** — tapi ini SEMUA pemakaian akun (termasuk semua eksperimen prompt/reasoning ON-OFF sebelum 88 halaman), tidak bisa dipisah khusus untuk 88 halaman ini.
- **OpenRouter `/api/v1/activity`** → 403 Forbidden (butuh provisioning key, bukan inference key yang kita punya).
- **OpenRouter `/api/v1/generation`** → butuh `id` per-call spesifik, yang juga tidak kita simpan.

**Kesimpulan jujur: saya tidak punya angka cost 88-halaman yang bisa dipertanggungjawabkan.** $3.76 adalah lifetime usage akun, bukan cost 88 halaman secara terisolasi — kalau saya sebut angka itu sebagai "cost 88 halaman" itu akan menyesatkan Anda.

**Rekomendasi untuk ke depan (bukan untuk data yang sudah ada):** tambahkan capture `body.get("usage", {})` di `qwen.py` dan simpan ke `DemGeneration` (field baru: `prompt_tokens`, `completion_tokens`, `cached_tokens`). Ini perbaikan kecil, murni observability, tidak menyentuh Aturan Emas karena tidak menghitung apa-apa yang dipakai untuk RAB. Bisa saya kerjakan sekarang kalau Anda mau, atau masuk sebagai task kecil di instruksi Codex di bawah.

---

## 3. "Fase JSON 2" — istilah yang Anda maksud

Kemungkinan besar yang Anda maksud adalah **JSON Schema-constrained output** (kadang disebut juga **"Structured Outputs"** di dokumentasi OpenAI/OpenRouter) — teknik yang memaksa API mengeluarkan JSON yang valid terhadap skema Pydantic secara struktural di level decoding token, bukan sekadar instruksi teks di prompt.

Ini **bukan** "Fase 2" dalam penomoran rencana besar proyek (Fase 2 = DEM Job Orchestrator, sudah selesai duluan). "JSON Schema-constrained" itu satu keputusan teknis KECIL di dalam Fase 2, tepatnya di adapter `qwen.py`, commit `dec0c36`. Urutannya:

1. Awalnya prompt cuma bilang "ikuti skema DrawingEvidenceSheet" (teks bebas) → model mengarang struktur sendiri.
2. Ganti ke `response_format: {"type": "json_schema", "json_schema": {..., "strict": true}}` → **ini yang Anda ingat sebagai "fase JSON"**.
3. Ditambah checklist coverage + few-shot examples di prompt (perbaikan terpisah, `d3ab55d`).

Jadi tidak ada "Fase JSON 2" sebagai nomor fase resmi — itu nama teknik (JSON Schema-constrained output / Structured Outputs), bagian dari Fase 2 yang sudah selesai.

---

## 4. Setelah ini, apa?

> **KOREKSI 2026-07-15 (setelah rencana kanonik dibaca ulang):** Bagian ini dan bagian §5 di bawah SEBELUMNYA salah — versi awal laporan ini menyatukan grounding RAB/schedule ke dalam "Fase 5", padahal itu bukan rencana kanonik proyek. Rencana kanonik ada di `docs/plans/drawing intelligence/PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md:3333-3450` dan punya **7 fase**, bukan 5:
>
> - Fase 3 — PCKM Synthesis Engine
> - Fase 4 — Project Knowledge Retrieval Service (retrieval scoped, **tanpa model jawaban** — bukan Command Room)
> - Fase 5 — Command Room Integration (read-only terhadap graph, wajib citation per jawaban faktual)
> - Fase 6 — Quality, Cost, and Hardening
> - Fase 7 — RAB Bridge Later, **eksplisit ditunda**: "Tidak dikerjakan sebelum Command Room stabil"
>
> Bagian §5 di bawah sudah ditulis ulang mengikuti pembagian ini. Ini bukan cuma soal penomoran — Fase 4 dan Fase 5 di dokumen kanonik memang dua tahap terpisah (retrieval engine dulu, baru Command Room dipasang di atasnya), dan RAB secara sengaja ditunda sampai jalur Command Room-nya sendiri terbukti stabil, bukan langsung digabung begitu synthesis selesai.

Status tiap fase saat ini:

- **Fase 0+1** (skema DEM/PCKM) — selesai, teraudit.
- **Fase 2** (DEM Job Orchestrator + 88-halaman real test) — selesai, teraudit, 4 bug ditemukan & diperbaiki (lihat tabel di atas), 0 gagal permanen dari 88 halaman.
- **Fase 3, 4, 5** (berikutnya) — belum dikerjakan. Instruksi lengkap di §5 di bawah, mengikuti task breakdown kanonik apa adanya (tidak saya karang ulang).
- **Fase 6, 7** — belum diinstruksikan detail di sini; Fase 7 secara eksplisit tidak boleh dimulai sebelum Fase 3-6 stabil.

---

## 5. Instruksi untuk Codex — Fase 3, 4, 5

Format sama seperti Fase 0-1 dan Fase 2 sebelumnya: spesifikasi tertulis, bukan kode langsung — Codex mengimplementasikan mengikuti spek ini, Claude verifikasi hasil sebelum commit (sesuai §5 CLAUDE.md). Task list di bawah mengikuti rencana kanonik `PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md` — saya tambahkan catatan implementasi konkret berdasarkan temuan audit 88-halaman (dangling refs, bbox, disiplin tak konsisten) di tempat yang relevan.

### FASE 3 — PCKM Synthesis Engine (synthesis deterministik)

**Tujuan:** menghasilkan project graph-native model snapshot dari 88 (atau N) `DrawingEvidenceSheet`.

**Input:** direktori `pages/*.json` (format `DrawingEvidenceSheet` — lihat `report/report_drawing_intelligence/dem_extraction_88pages/pages/` sebagai data uji nyata).

**Output:** `ProjectGraphSnapshot` (skema Fase 0-1, `packages/schemas` + Pydantic setara).

**13 task dari rencana kanonik**, dengan catatan implementasi dari audit data nyata:
1. Sheet knowledge patch builder
2. Node ID policy
3. Edge ID policy
4. Aliases
5. Deterministic grouping — **seluruh pipeline ini murni deterministik/rule-based**, sesuai rekomendasi Anda. Tidak ada LLM di jalur keputusan grouping/dedup.
6. Flash normalizer — pakai untuk menormalkan field bebas-teks seperti `discipline` (data nyata punya variasi "Arsitektur"/"ARSITEKTUR"/"Architecture") sebelum dipakai untuk grouping/community.
7. Cross-sheet candidate resolver — pencocokan objek yang sama di halaman berbeda (mis. "kolom K1 di halaman 12" = "K1" di halaman 49). Mulai dari exact-match pada kode elemen ternormalisasi.
8. Pro escalation — kalau candidate resolver ragu (bukan exact match), eskalasi ke jalur `perlu_review` (§1.1 CLAUDE.md), tidak pernah auto-commit ke graph tanpa review.
9. Conflict registry — **wajib** mengangkat kasus dimensi/spesifikasi berbeda untuk objek yang sama di halaman berbeda ke level project (bukan cuma per-halaman `conflicts[]`), karena ini basis untuk Fase 7 nanti.
10. Community builder
11. Snapshot validator
12. Atomic activation
13. Legacy TKG export

**Catatan wajib dari audit 88-halaman:**
- `evidence_refs` di data nyata putus (menunjuk ID yang tidak pernah dibuat) pada 22,0% dari seluruh referensi (839/3.807, 47/88 halaman — cakupan penuh `observations.*` + `sheet_identity.*`, lihat tabel di bagian 1). Resolver **wajib** memperlakukan `observations`/`sheet_identity` sebagai sumber utama, `evidence[]` sebagai pelengkap opsional — jangan desain jalur yang mensyaratkan `evidence[]` lengkap.
- **Anchor test nyata (sudah diverifikasi langsung di data, dipakai sebagai nilai acuan §3 CLAUDE.md):**
  - `J2` (elemen jendela) muncul di halaman 21, 22, 27 — resolver wajib menyatukannya jadi 1 `ProjectGraphNode`.
  - `BV1` muncul di halaman 21, 22, 23 — sama, wajib jadi 1 node.
  - `RB3` muncul di halaman 44, 54, 55, 56 — sama, wajib jadi 1 node (rentang halaman terjauh, uji resolver tidak dibatasi jarak halaman berdekatan saja).
  - Konflik dimensi asli di halaman 81: total dimensi horizontal atas (20250mm) vs bawah (20000mm) beda 250mm pada elemen yang sama — dipakai sebagai anchor test untuk `conflict registry` (task #9): pastikan konflik ini terangkat ke level project, bukan hilang saat sintesis.
- 88 halaman PLHUT tetap dipakai sebagai fixture nyata secara keseluruhan (§PLHUT-fixture-rule — bukan template); keempat anchor di atas adalah subset yang WAJIB lolos, bukan pengganti cakupan penuh 88 halaman.

**Exit criteria (dari dokumen kanonik):**
```
active PCKM snapshot exists
graph query can retrieve known PLHUT facts
```

### FASE 4 — Project Knowledge Retrieval Service (retrieval project-scoped, tanpa model jawaban)

**Tujuan:** retrieval scoped terhadap satu project — BFS/DFS/shortest-path/evidence hydration — **tanpa LLM menjawab apa pun di fase ini**. Ini murni engine query, dipakai Command Room di Fase 5.

**12 task dari rencana kanonik:**
1. Vocabulary builder
2. Alias search
3. Query plan schema
4. Seed scoring
5. BFS
6. DFS
7. Shortest path
8. Relation filters
9. Evidence hydration
10. Budget pruning
11. Query logging
12. Benchmark harness

**Exit criteria:**
```
benchmark query returns expected nodes/evidence
context stays within budget
```

### FASE 5 — Command Room Integration (read-only + citation wajib)

**Tujuan:** Command Room grounded pada PCKM lewat retrieval service Fase 4 — **read-only terhadap graph**, setiap jawaban faktual wajib mengutip sumber (sheet/page).

**12 task dari rencana kanonik:**
1. Project-scoped conversation
2. projectId request
3. Retrieval orchestration
4. SSE retrieval events
5. Grounded prompt
6. Citation contract — **wajib**, setiap klaim faktual dari LLM harus bisa dilacak balik ke halaman/sheet sumber
7. Source UI
8. Graph-not-ready UI
9. Conversation summary
10. Query trace
11. Fallback legacy TKG
12. End-to-end tests

Tool baru kemungkinan masuk `apps/web/src/app/api/command-room/chat/tools.ts` (§6 CLAUDE.md — file terproteksi, jangan dihapus/dipindah). LLM di sini **hanya membaca/menjelaskan hasil query graph** — tidak pernah menghitung ulang atau mengarang node baru (§1 Aturan Emas berlaku penuh karena ini jalur chat).

**Exit criteria:**
```
Command Room answers PLHUT questions from graph
each factual answer cites sheet/page
no full graph injected
```

### Soal RAB/schedule — TIDAK masuk Fase 3-5, ditunda ke Fase 7

Dokumen kanonik eksplisit: **"Phase 7 — RAB Bridge Later... Tidak dikerjakan sebelum Command Room stabil."** Artinya Fase 3, 4, 5 di atas **tidak boleh menyentuh RAB/schedule sama sekali** — bukan "opsional/lanjutan" seperti yang saya tulis keliru di versi laporan sebelumnya.

Ketika waktunya tiba (setelah Fase 5-6 stabil), alur Fase 7 sesuai dokumen kanonik:
```
human-verified graph facts
→ takeoff request
→ Core Engine
→ Quantity Facts
→ BOQ
→ AHSP
→ RAB
```
Sesuai rekomendasi Anda dan §1 Aturan Emas: Fase 7 nanti hanya **mengangkat konflik dan membuat usulan yang menunggu approval manusia** — tidak pernah auto-fill atau menghitung. `conflict registry` yang dibangun di Fase 3 task #9 di atas adalah fondasi untuk ini nanti.

**Catatan untuk semua fase:** ikuti pembagian kerja §5 CLAUDE.md — Claude tulis spek (seperti dokumen ini) + nilai acuan test, Codex implementasi, Claude verifikasi sebelum commit. Semua kerja di branch baru → PR, tidak langsung ke `main` (§5 gerbang review).

---

## Ringkasan Jawaban Cepat

| Pertanyaan | Jawaban |
|---|---|
| Masalah selama 88 halaman, sudah selesai? | Ya, 4 bug ditemukan & diperbaiki (JSON structure, thinking-mode, coverage, IncompleteRead) |
| Evidence 0 — sudah selesai? | Angka lama SALAH (bilang 10, sebenarnya **15 halaman**) — sudah dikoreksi di laporan. Perbaikan akar masalah (dangling refs) sudah di kode untuk ekstraksi berikutnya; data 88-halaman yang ada TIDAK diproses ulang (sesuai batas 1x jalan Anda) |
| Total cost 88 gambar | **Tidak bisa dipastikan** — `qwen.py` tidak pernah menyimpan `usage` API; OpenRouter `/credits` cuma kasih total lifetime akun ($3,76, tercampur eksperimen lain) |
| "Fase JSON 2" itu apa/fase berapa | Bukan nomor fase — nama teknik "JSON Schema-constrained output / Structured Outputs", bagian dari Fase 2 (commit `dec0c36`) |
| Next fase | Fase 3: PCKM Synthesis Engine → Fase 4: Retrieval Service (tanpa model jawaban) → Fase 5: Command Room Integration (read-only + citation). RAB/schedule **ditunda ke Fase 7**, tidak masuk Fase 3-5. |
| Instruksi Codex Fase 3/4/5 | Ditulis lengkap di bagian 5 di atas, mengikuti task breakdown kanonik `PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md:3333-3450` |
