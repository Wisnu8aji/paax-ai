# 📍 PAAX — STATE (status SEKARANG)

> Update terakhir: **2026-07-05** (Task 4 Codex — bridging arsitektur area
> keramik dinding basah/plafon/waterproofing — diverifikasi Claude BERSIH,
> tidak ada temuan masalah. Task 5 baru ditulis: bridging 4 sub-domain
> `ArsitekturRequest` sisa (pondasi batu/lantai/atap miring/aanstamping),
> melengkapi SEMUA 7 sub-domain arsitektur. Detail: §TASK 4 TERVERIFIKASI
> & TASK 5 di bawah. Riwayat Task 1-3 (juga bersih): §TASK 1-3
> TERVERIFIKASI lebih bawah. Konteks approval ai-orchestrator &
> koreksi pola kerja: §KOREKSI POLA KERJA & AI-ORCHESTRATOR DISETUJUI
> lebih bawah).

## TASK 4 TERVERIFIKASI BERSIH & TASK 5 DITULIS (Claude, 2026-07-05)

**Verifikasi independen Task 4** (git log, test dijalankan ulang langsung
oleh Claude): branch/PR #40 tetap benar (base `feat/fase-x1b-packaging-
binding-footplat`, mergeable). 2 commit, body kosong (tidak ada
`Co-Authored-By`). `apps/web/**`, `app/takeoff/arsitektur.py`, dan
`binding.py` dikonfirmasi NOL perubahan. Test dijalankan ulang Claude:
document-intelligence **272 passed** (cocok klaim, naik dari 244).

**Validasi anti-halusinasi dicek LANGSUNG di kode**
(`arsitektur_area_assist.py`): field REQUIRED hilang → seluruh usulan
kategori itu ditolak; field OPTIONAL boleh kosong TAPI kalau ADA nilainya
tetap wajib lolos validasi angka+rentang (dibuktikan test
`test_arsitektur_area_assist_rejects_hallucinated_optional_field` —
`a_neto_m2` valid tapi `keliling_tepi_m` dikarang (999.0, tidak ada di
teks) → SELURUH usulan ditolak, bukan cuma field itu yang dibuang).
Isi `_ARCHITECTURE_CATEGORIES` dikonfirmasi PERSIS klaim laporan
(`plafon` ada, `keramik_dinding`/`waterproofing` tidak ada → dialihkan ke
`section_for_category("finishing")`). **Kesimpulan: TIDAK ADA temuan
masalah, tidak ada feedback korektif yang perlu disisipkan.**

**Task 5 baru ditulis** (BELUM dijalankan):
`docs/prompts/PAAX_CODEX_TASK_05_BRIDGING_ARSITEKTUR_PONDASI_LANTAI_ATAP_MIRING_AANSTAMPING_2026-07-05.md`
— melengkapi 4 sub-domain `ArsitekturRequest` SISA (`pondasi_batu`,
`lantai`, `atap_miring` — beda dari kategori "atap" gording/kuda_kuda
Task 1/2 yang RANGKA, ini PENUTUP atap —, `aanstamping`), SEMUA rumus
sudah ada & teruji sejak Fase 3b (2026-07-02) tapi belum pernah
di-bridging. Task ini SENGAJA **memperluas infrastruktur Task 4** (modul
`arsitektur_area_assist.py`/`bridging_arsitektur_area.py` yang sudah ada,
BUKAN modul baru) — instruksi eksplisit REUSE, hindari duplikasi. Setelah
task ini, SELURUH 7 sub-domain `ArsitekturRequest` akan ter-bridging
(3 dari Task 4 + 4 dari Task 5). Task TUNGGAL (bukan rantai baru) —
lanjutan branch/PR #40 yang sama.

## TASK 1-3 TERVERIFIKASI BERSIH & TASK 4 DITULIS (Claude, 2026-07-05)

**Verifikasi independen** (git log, test dijalankan ulang langsung oleh
Claude, bukan percaya laporan) — **HASIL: BERSIH, TIDAK ADA TEMUAN
MASALAH SAMA SEKALI** di ketiga task:

- **Task 1** (commit X2 bridging dinding/atap/kusen/mep + footplat/zona):
  branch `feat/x2-bridging-non-struktur-dinding-atap-kusen-mep` dibuat
  BENAR dari `feat/fase-x1b-packaging-binding-footplat` (bukan `main`).
  PR #40 draft, base benar, mergeable. 2 commit, body kosong (tidak ada
  `Co-Authored-By`). `apps/web/**` dikonfirmasi nol perubahan (diff vs
  base X1B kosong). Test dijalankan ulang Claude: document-intelligence
  **229 passed** (cocok klaim).
- **Task 2** (bridging kuda-kuda/profil baja): branch/PR sama, commit
  bersih. **Anti-halusinasi `kg_per_m` diverifikasi LANGSUNG di kode**
  (`kuda_kuda_assist.py`) — angka HANYA diterima kalau match ke angka yang
  benar-benar ada di `source_texts` yang sudah divalidasi ada di
  `detail_texts`; test `test_kuda_kuda_assist_rejects_standard_weight_
  when_not_sourced_from_text` MEMBUKTIKAN skenario spesifik yang diminta
  (model mengaku berat 14.0 kg/m dari "pengetahuan tabel baja umum" tapi
  angka itu tidak ada di teks manapun → DITOLAK). `app/takeoff/baja.py`
  dikonfirmasi TIDAK diubah. Test Claude jalankan ulang: **244 passed**
  (cocok klaim).
- **Task 3** (tool `analyze_drawing` ai-orchestrator): branch/PR #39
  (base `main`) tetap benar. Commit bersih. Test Claude jalankan ulang
  di worktree: **30 passed** (8 file), `tsc --noEmit` exit 0 — cocok
  klaim. `services/document-intelligence/**` dikonfirmasi HANYA dibaca
  (tidak diubah).

**Kesimpulan**: ketiga task TIDAK PERLU perbaikan apa pun — Task 4 murni
pekerjaan baru, tidak ada feedback korektif yang perlu disisipkan.

**Investigasi `binding.py`** (salah satu dari 3 modul target awal konsep
X2: `zone_classifier.py` ✓, `consolidate.py` ✓, `binding.py` — belum):
**KESIMPULAN — SENGAJA TIDAK dikerjakan.** `binding.py` murni algoritma
geometris (bbox vs titik grid + toleransi jarak), TIDAK ADA celah teks
yang bisa diisi AI-assist — kasus `needs_review=True` terjadi krn elemen
di luar rentang grid manapun (geometri), bukan krn ada data teks yang
terlewat. Memaksakan AI-assist di sini akan melanggar prinsip "AI-assist
hanya isi kekosongan teks/data terstruktur yang hilang" — jadi
ditinggalkan, bukan gap tertunda.

**Task 4 baru ditulis** (BELUM dijalankan):
`docs/prompts/PAAX_CODEX_TASK_04_BRIDGING_ARSITEKTUR_KERAMIK_PLAFON_WATERPROOFING_2026-07-05.md`
— bridging 3 kategori arsitektur area-based (`keramik_dinding` F-G04,
`plafon` F-G09, `waterproofing` F-G10 — SEMUA sudah punya rumus lengkap
di `app/takeoff/arsitektur.py`, belum pernah di-bridging) via pola yang
SAMA PERSIS dinding (dokumen-luas, entry sintetis, krn kategori ini juga
tidak punya kode per-instance). Task TUNGGAL (bukan rantai baru) — branch
lanjutan `feat/x2-bridging-non-struktur-dinding-atap-kusen-mep` (PR #40).

## RANGKAIAN BRIDGING NON-STRUKTUR — DINDING→ATAP→KUSEN→MEP SELESAI (Claude, 2026-07-05)

Kelanjutan langsung dari audit B0 (di bawah). Owner memutuskan: frontend
(Gantt UI, tombol 1-klik) ditunda; Engineering Chat/`services/ai-
orchestrator` TETAP status **menunggu keputusan eksplisit owner** (BELUM
dibangun, BUKAN disetujui diam-diam — keputusan arsitektur besar,
migrasi `apps/web/src/lib/ai/*` ke service baru); fokus jalan SEKARANG:
4 kategori non-struktur yang gap-nya sudah dipetakan audit B0.

**Dikerjakan berurutan otomatis** (dinding → atap → kusen → MEP), TANPA
interupsi manual antar kategori — **tidak ada blocker ditemukan di
sepanjang rangkaian**, semua 4 selesai dalam satu sesi berkelanjutan.

| Slice | Kategori | Pola gap | Report |
|---|---|---|---|
| #3 | Dinding pasangan bata | Deteksi elemen TIDAK ADA sama sekali (tanpa kode per-instance) — beda dari kolom/footplat | `report-remote/REPORT_X2_LANJUTAN_DINDING_CLAUDE_2026-07-05.md` |
| #4 | Atap (gording/trekstang/ikatan_angin) | Kode SUDAH dikenal taksonomi, bridging belum ada — pola PERSIS X1 | `report-remote/REPORT_X2_LANJUTAN_ATAP_CLAUDE_2026-07-05.md` |
| #5 | Kusen (jadwal pintu/jendela) | Butuh tabel jadwal yang belum dikenali parser; risiko tabrakan kode "P1" vs pondasi_telapak (diverifikasi & dihindari eksplisit) | `report-remote/REPORT_X2_LANJUTAN_KUSEN_CLAUDE_2026-07-05.md` |
| #6 | MEP (titik lampu/stop kontak/dll) | Rumus paling sederhana (count), ikon/simbol di luar cakupan | `report-remote/REPORT_X2_LANJUTAN_MEP_CLAUDE_2026-07-05.md` |

**Hasil gabungan**: 4 modul `ai_assist/` baru (`wall_assist.py`,
`roof_frame_assist.py`, `kusen_assist.py`, `mep_assist.py`), 4 modul
`bridging_*.py` baru (dinding/atap/kusen/mep), 4 schema Pydantic+Zod baru
(`AiDindingSuggestion`/`AiRoofFrameSuggestion`/`AiKusenSuggestion`/
`AiMepSuggestion`), wiring lengkap `consolidate.py`→`work_items.py`→
`tkg_routes.py` utk tiap kategori. **document-intelligence: 149 → 229
test passed** (+80 termasuk 24 dari Fase X2 slice #1-#2 sebelumnya +56 dari
rangkaian ini), **core-engine tetap 280** (tidak disentuh), packages/schemas
build OK + 12 test. Prinsip konsisten di semua slice: rule-based fast-path,
AI-assist hanya fallback teks (bukan piksel), anti-halusinasi 2 lapis,
tidak ada auto-commit ke input engine, audit trail wajib, dan kejujuran
eksplisit soal apa yang TIDAK dicakup (lihat tiap report utk daftar gap
detail per kategori).

**BELUM di-commit** — sesuai instruksi owner, seluruh working tree tetap
uncommitted menunggu review.

## KOREKSI POLA KERJA & AI-ORCHESTRATOR DISETUJUI (2026-07-05)

### Koreksi pola kerja (berlaku mulai sekarang, ke depan)

Owner mengoreksi pola kerja rangkaian di atas: **Claude HANYA merancang**
(logika deteksi/ekstraksi, skema data, validasi anti-halusinasi, kontrak
API) — **implementasi kode nyata WAJIB diserahkan ke Codex lewat prompt
file**, BUKAN ditulis langsung oleh Claude ke source. Slice dinding/atap/
kusen/MEP (§di atas) **SUDAH TERLANJUR diimplementasikan langsung oleh
Claude SEBELUM koreksi ini** — kerjanya TETAP DIPERTAHANKAN (semua sudah
selesai 100%, teruji, tidak dibuang — lihat konfirmasi status di bawah),
tapi ini PENGECUALIAN atas instruksi owner sesi itu, **BUKAN pola yang
akan diulang** untuk pekerjaan berikutnya. Ke-4 report sudah ditambahi
catatan koreksi ini secara eksplisit.

**Konfirmasi status pasti tiap kategori** (dicek ulang via test run
nyata sesi ini, BUKAN asumsi): **dinding, atap, kusen, MEP SEMUANYA
SELESAI 100%** (bukan sebagian) — `document-intelligence` 229 test passed,
5 skipped, dikonfirmasi via `pytest -q` dijalankan ulang. Tidak ada yang
setengah jadi.

### AI-Orchestrator — DISETUJUI EKSPLISIT owner, spek Codex sudah ditulis

Owner MENYETUJUI EKSPLISIT ("semua saya setujui") pembangunan
`services/ai-orchestrator` (Node/TypeScript, migrasi tool-calling nyata
utk Engineering Chat — `query_rab`/`query_schedule`/`lookup_ahsp`/
`query_progress`/`query_materials`/`run_scenario` dari §8.1
`docs/MASTER_PLAN.md`). **Status berubah dari "pending keputusan" jadi
"disetujui, mengikuti pola BARU (Claude desain, Codex implementasi)".**

**Keputusan desain (Claude)**: REST manual + Express (BUKAN Genkit,
walau `MASTER_PLAN.md` §15.2 menyebut Genkit) — ada scaffold LAMA
`scripts/scaffolding/create_ai_orch.py` berbasis Genkit yang TIDAK PERNAH
dijalankan & isinya cuma mock/placeholder rusak; dipilih REST manual krn
pola ini SUDAH TERBUKTI jalan di `apps/web/src/lib/ai/orchestrator.ts`
(REST langsung ke Gemini, tanpa SDK), menghindari risiko API Genkit yang
berubah cepat. Ini deviasi SADAR & didokumentasikan dari `MASTER_PLAN`,
bukan kesalahan — migrasi ke Genkit tetap opsi terbuka di masa depan.

**2 prompt Codex berantai ditulis** (BELUM dijalankan):
1. `docs/prompts/PAAX_CODEX_CHAIN_AIO_01_SCAFFOLD_TOOLCALLING_LOOP_2026-07-05.md`
   — scaffold service, loop tool-calling multi-turn Gemini (function-
   calling), 2 tool proxy sederhana (`lookup_ahsp`, `run_scenario`), test
   lengkap dgn fake Gemini client.
2. `docs/prompts/PAAX_CODEX_CHAIN_AIO_02_TOOLS_RAB_SCHEDULE_PROGRESS_MATERIALS_2026-07-05.md`
   — 4 tool sisanya: `query_rab`/`query_schedule` (baca `context` yang
   dikirim client dlm request, KARENA TIDAK ADA database proyek server-
   side — draft RAB/jadwal tersimpan di localStorage browser, temuan
   audit B0), `query_progress`/`query_materials` (stub jujur, Site Agent
   v2.0 & prediksi material v1.5 belum dibangun). Task TERAKHIR rangkaian
   ini — instruksi berhenti eksplisit di file itu.

Kedua prompt PANJANG & DETAIL SENGAJA (instruksi eksplisit owner: minim
iterasi bolak-balik) — skema data persis, contoh request/response,
edge case, lokasi file, kriteria test semua dicantumkan lengkap.

**PENTING — batas yang WAJIB dipahami sebelum eksekusi**: `query_rab`/
`query_schedule` TIDAK BISA "mengambil sendiri" data proyek (tidak ada
database server-side) — hanya bisa memfilter data yang client SUDAH
kirim di request `/chat`. **Wiring `apps/web` → `ai-orchestrator`
(mengirim context itu dari frontend) ADALAH TUGAS CLAUDE TERPISAH, BUKAN
bagian prompt Codex ini** (Codex dilarang sentuh `apps/web/**`) — setelah
kedua Codex chain ini selesai, sesi Claude berikutnya perlu wiring
`apps/web/src/app/api/ai/chat/route.ts` (atau file baru) supaya BENAR-
BENAR memanggil `services/ai-orchestrator` dan mengirim context RAB/
jadwal — ini BELUM dikerjakan sesi ini.

### Pending keputusan/eksekusi berikutnya

1. Gantt/CPM UI (M3) — siap dikerjakan Claude kapan pun (backend sudah
   lengkap), ditunda sesuai instruksi owner.
2. **AI-Orchestrator**: 2 prompt Codex di atas menunggu dieksekusi
   (Codex). Setelah selesai: wiring `apps/web` → `ai-orchestrator` (tugas
   Claude terpisah, belum dijadwalkan).
3. Generalisasi lebih lanjut per kategori non-struktur (kuda_kuda/profil
   baja, deteksi geometri garis dinding, `qty_counted` kusen via simbol,
   ikon MEP) — semua dicatat sbg gap jujur di report masing-masing,
   kandidat slice lanjutan (mengikuti pola BARU: Claude desain → Codex
   implementasi, bukan lagi diimplementasikan Claude langsung).
4. Fase Y (tombol 1-klik) & Fase Z (verifikasi ulang PLHUT) — tetap
   pending, dikerjakan Claude terpisah (frontend/verifikasi).

## AUDIT B0 — STATUS NYATA v0.9/v1.0 SEBELUM RANTAI CODEX (Claude, 2026-07-05)

Owner minta audit nyata (bukan percaya `STATE.md` lama yang bertanggal
2026-07-01, sebelum kerja Fase Q-X2) sebelum menyusun rantai prompt Codex
utk scope "v1.0 tuntas". Hasil per item, semua diverifikasi baca kode
langsung (bukan tebakan):

### 1. v0.9 Schedule & Scenario — status TERBELAH, bukan satu blok
- ✅ **M4 Simulasi Skenario (what-if)**: SUDAH JADI, bukan "belum dibangun"
  seperti klaim `STATE.md` lama. `apps/web/.../schedule/page.tsx` (373 baris)
  = UI lengkap: panel parameter (crew factor/lembur), grafik Frontier
  waktu-biaya (SVG), tabel kandidat, tabel durasi per item — semua dari
  `POST /scenario/simulate` via `simulateScenario()`. Tidak ada hitung di
  browser.
- ❌ **M3 Penjadwalan Gantt + jalur kritis (CPM)**: BENAR belum dibangun.
  `schedulePlan()` (client fetch ke `/schedule/plan`, CPM+tanggal
  kalender+Kurva S dependency) ADA di `lib/engine.ts` tapi **TIDAK PERNAH
  dipanggil di mana pun** — nol komponen Gantt, nol visualisasi jalur
  kritis di seluruh `apps/web`. Engine (`/schedule/cpm`, `/schedule/plan`)
  SUDAH lengkap & diuji — **gap 100% ada di UI**, nol pekerjaan backend
  tersisa (`predecessors: List[str]` di `PlanTaskInput` sudah ada, tinggal
  UI yang mengisi & menampilkan). Ini murni domain Claude/frontend.

### 2. Engineering Chat tool-calling (§8.1 MASTER_PLAN) — KONFIRMASI belum ada
`app/api/ai/chat/route.ts` = **satu panggilan Gemini one-shot**
(`geminiText`/`geminiMultimodal`) dengan "context pack" (skrip TKG + draft
RAB, dibangun CLIENT-SIDE dari localStorage lalu dikirim sbg string di body
request) ditempel ke prompt sbg teks. **TIDAK ADA** tool-calling sungguhan —
nol definisi tool `query_rab`/`query_schedule`/`lookup_ahsp`/`analyze_
drawing`/`query_progress`/`run_scenario`/`query_materials` yang bisa
dipanggil model. Klaim lama "masih tipis" bahkan kurang tepat — ini nol
tool-calling, bukan "tipis".

**Temuan arsitektur penting**: `services/ai-orchestrator/` (disebut
`MASTER_PLAN.md` §15.2 "mulai v0.8") **TIDAK PERNAH DIBUAT** — seluruh
logika AI (Gemini call, context pack, TKG extractor) hidup 100% di
`apps/web/src/lib/ai/*.ts` + `apps/web/src/app/api/ai/*/route.ts`. Karena
Codex DILARANG MUTLAK menyentuh `apps/web/**`, dan tool-calling nyata
butuh mengubah persis file-file itu, **B2 TIDAK PUNYA slice backend yang
aman diserahkan Codex hari ini** — kecuali owner memutuskan membuat service
baru `services/ai-orchestrator` (keputusan arsitektur besar: bahasa, hosting,
migrasi kode `lib/ai/*` yang sudah ada) — **STOP, ini butuh keputusan owner
eksplisit dulu** (`CLAUDE.md` §8: ambiguitas arsitektural → tanya, jangan
asumsi diam-diam).

### 3. A2 (sisa rumus takeoff) — TEMUAN PALING BESAR: dokumentasi lama SALAH
`docs/BRAIN_ALIGNMENT.md` §4 "Fase 3+" bilang F-F06/F-G04/F-G06-14/F-C07-10
"⚪ roadmap, belum dikerjakan" — **INI STALE, TERBUKTI SALAH.** Grep
langsung tiap `rule_id` ke `services/core-engine/app/`:
- **F-F06, F-G04, F-G06, F-G07, F-G08, F-G09, F-G10, F-G11, F-G12, F-G13,
  F-G14 SEMUA ADA** di `app/takeoff/{baja,atap,kusen,mep,mep_advanced}.py`
  (file-file ini SUDAH ADA di repo, total 575 baris), expose via
  `/takeoff/baja|atap|kusen|mep|mep-advanced|smkk`, **11 test lulus**
  (`test_takeoff_baja_atap.py`, `test_takeoff_finishing_plus.py`,
  `test_takeoff_kusen_mep.py`).
- **F-C07 (dinding beton), F-C08 (kolom menempel), F-C09 (tangga
  bekisting), F-C10 (perancah, anti-double-count via param
  `ahsp_bekisting_includes_perancah`) SEMUA ADA** di `app/tkg/takeoff.py`.
- Kesimpulan: **sisa rumus takeoff murni SELESAI 100%.** Tidak ada lagi
  "tulis rumus baru" yang tersisa untuk trade-trade ini.
- **TAPI gap nyata bergeser, bukan hilang**: `services/document-
  intelligence` TIDAK PERNAH mengklasifikasi elemen ke kategori
  `dinding`/`atap`/`kusen`/`mep`/`lantai`/`plafon`/`finishing` — kategori
  ini TIDAK ADA di `paax_schemas.tkg_taxonomy.PREFIKS` (kode→kategori) atau
  `TypeKategori` (Literal enum tabel), jadi `work_items.py::
  _ARCHITECTURE_CATEGORIES`/`_MEP_CATEGORIES`/`_EARTHWORK_CATEGORIES`
  **efektif dead code** (tidak pernah match `entry.kategori` apa pun).
  Beda dari X1 (footplat sudah terdeteksi, tinggal bridging ke engine) —
  di sini bahkan **deteksi elemennya sendiri belum ada**: dinding pasangan
  bata/kusen/MEP biasa digambar sbg polygon ruangan/tabel jadwal
  pintu-jendela/simbol titik — pola ekstraksi BEDA dari kolom/balok
  (kode+grid). Ini butuh sesi desain Claude (bagaimana tiap tipe elemen
  non-struktur diekstrak dari gambar) SEBELUM ada spek yang cukup jelas &
  sempit utk diserahkan Codex — bukan tugas mekanis hari ini.

### Kesimpulan rantai Codex utk scope "v1.0 tuntas" (A+B)
**KOSONG — 0 file prompt dibuat sesi ini.** A2/B1/B2 semuanya berujung pada
salah satu dari: (a) pekerjaan sisa 100% ada di `apps/web/**` (dilarang utk
Codex), atau (b) blocked pada keputusan arsitektur/desain yang perlu Claude/
owner putuskan dulu (spek deteksi non-struktur, spek `services/ai-
orchestrator`). Memaksakan prompt Codex hari ini akan melanggar disiplin
"spek jelas dulu, baru Codex" (`CLAUDE.md` §9) atau aturan larangan
`apps/web/**`.

**Rekomendasi langkah nyata berikutnya (menunggu keputusan owner):**
1. Fase Y (tombol 1-klik) & Fase Z (verifikasi ulang PLHUT) — TETAP jalan,
   dikerjakan Claude terpisah, TIDAK terblokir oleh temuan di atas.
2. Gantt/CPM UI (M3) — 100% siap dikerjakan Claude kapan saja (engine sudah
   lengkap), tidak perlu Codex sama sekali.
3. Sebelum B2 bisa lanjut: owner putuskan — bangun `services/ai-
   orchestrator` (migrasi dari `apps/web/src/lib/ai/*`) ATAU terima
   tool-calling tetap jadi pekerjaan Claude/frontend selamanya (krn kodenya
   TS di apps/web)?
4. Sebelum bridging non-struktur (A2 lanjutan) bisa lanjut: Claude perlu
   sesi desain terpisah per kategori (mulai dari yang paling bernilai,
   kandidat: dinding pasangan bata) — BELUM dimulai sesi ini, butuh
   keputusan/prioritas owner dulu kategori mana duluan.
> File ini SATU-SATUNYA tempat status berjalan.

## FASE X2 — AI-ASSIST KLASIFIKASI/BINDING, 2 SLICE (Claude langsung, 2026-07-05)

Owner mengubah instruksi: bukan cuma menulis prompt Codex utk Fase X2, tapi
Claude mengimplementasikan LANGSUNG (kode berjalan, bukan dokumen) di sesi
yang sama, dan scope diperluas dari 1 slice (footplat) jadi 2 slice
(footplat + klasifikasi zona) — keduanya pola AI-assist yang sama (`CLAUDE.md`
§1.1): rule-based fast-path, LLM fallback paralel hanya saat rule-based
gagal, validasi deterministik wajib sebelum jadi kandidat, tidak pernah
auto-commit ke input engine.

**Modul baru** `services/document-intelligence/app/perception/ai_assist/`:
- `client.py` — `GeminiAiAssistClient` (REST langsung ke Gemini
  `gemini-2.5-flash`, stdlib `urllib.request` SAJA — tidak ada dependency
  baru, pola sama `HttpTanahTakeoffClient`/`orchestrator.ts`) +
  `NullAiAssistClient` (degradasi anggun kalau `GEMINI_API_KEY` kosong).
- `dimension_assist.py` (**slice #1**) — usulan `b_mm`/`l_mm`/`d_gali_mm`
  footplat dari teks halaman `detail_tabel` (temuan X1/X1B: 13/13
  `pondasi_telapak` PLHUT gagal krn dimensi hanya di halaman detail).
  Validasi anti-halusinasi 2 lapis (source_texts harus persis ada di input,
  angka harus match ke source_texts yang dikutip) + rentang wajar
  100-5000mm.
- `zone_assist.py` (**slice #2, BARU — perluasan scope dari rencana awal**)
  — usulan kategori zona (enum tertutup, sesuai `_ZONE_RULES` +`cover`) utk
  sheet yang gagal diklasifikasi `zone_classifier.py` (`zone is None`),
  sesuai catatan `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md`
  §0.1 poin 4 yang ditulis 2026-07-13 tapi baru dieksekusi sekarang.
  Validasi: nilai HARUS persis salah satu dari 10 zona resmi (`tidak_yakin`
  DITOLAK sbg kandidat, bukan diloloskan dgn confidence rendah).

**Wiring**: `consolidate_document()` (`consolidate.py`) dapat parameter baru
`ai_client: AiAssistClient | None = None` (default `None` — SEMUA caller
lama tidak berubah perilakunya). `drawing_routes.py` (`/drawings/analyze`)
memanggil `GeminiAiAssistClient.from_env()` — aktif hanya kalau
`GEMINI_API_KEY` ada di env, degradasi anggun kalau tidak (pola sama
PaddleOCR). **Kedua slice HANYA mengisi field usulan baru**
(`ElementRegistryEntry.ai_dimension_suggestion`,
`SheetSummary.zone_ai_suggestion`) — field asli (`definisi.dimensi`, `zone`)
TIDAK PERNAH ditimpa; `bridge_galian_footplat`/`work_items.py` TIDAK
disentuh sama sekali (tetap murni deterministik, tidak pernah melihat
usulan AI).

**Schema**: Pydantic `AiDimensionSuggestion`/`AiZoneSuggestion` baru di
`consolidated_models.py` + mirror Zod `AiDimensionSuggestionSchema`/
`AiZoneSuggestionSchema` di `packages/schemas` (field opsional, tidak
mengubah shape lama).

**Test**: 24 test baru (19 unit `test_perception_ai_assist.py` — stub
client, TIDAK PERNAH memanggil API Gemini sungguhan, termasuk anti-
halusinasi angka/teks & rentang wajar & enum tertutup; 5 wiring
`test_perception_consolidate.py` — fixture sintetis kode "P9" BERBEDA dari
PLHUT §0.1, termasuk bukti fast-path: AI tidak dipanggil kalau rule-based
sudah berhasil, `dimensi`/`zone` asli tidak pernah ditimpa). document-
intelligence **173 passed + 5 skipped** (naik dari 149). core-engine
**280 passed** (tidak disentuh). `packages/schemas` build OK + Jest
**12 passed**. web Vitest **47 passed** + `pnpm tsc --noEmit` bersih.

**BELUM di-commit** — sesuai instruksi eksplisit owner (Claude dilarang
commit sesi ini), working tree tetap uncommitted. Report lengkap:
`report-remote/REPORT_FASE_X2_AI_ASSIST_BINDING_CLAUDE_2026-07-05.md`
(ditandai jelas dikerjakan Claude, BUKAN Codex).

**Pending utk slice berikutnya**: generalisasi ke kategori takeoff lain di
luar `pondasi_telapak`, integrasi `GEMINI_API_KEY` sungguhan end-to-end
(belum diuji dgn API key nyata, hanya stub), UI review/approval utk
`ai_suggestion` (di luar cakupan backend — domain Claude/frontend
terpisah), `binding.py` (label→grid) belum disentuh sbg slice AI-assist
(disebut di konsep awal, belum diprioritaskan).

## SESI PERENCANAAN — VERIFIKASI X1B + AI-ASSIST DIMASUKKAN KE ROADMAP (Claude, 2026-07-05)

Owner meminta 2 hal: (1) verifikasi jujur laporan Codex Fase X1B (bukan
percaya narasinya begitu saja), (2) integrasikan konsep baru — lapisan
AI-assist (LLM) sbg fallback paralel klasifikasi/binding gambar saat
rule-based gagal — ke seluruh dokumen perencanaan sbg arah resmi project.

**Verifikasi X1B (hasil: klaim laporan AMAN, cocok dgn kondisi kode nyata,
tidak ada temuan bermasalah):**
- Packaging `paax_schemas`: `packages/schemas/python/pyproject.toml` ada
  & valid (package `paax-schemas` 0.1.0). `services/core-engine/pyproject.
  toml` & `services/document-intelligence/pyproject.toml` mencatat
  dependency-nya. `.github/workflows/ci.yml` menginstal shared schemas
  SEBELUM service Python. Grep `sys\.path\.insert|except ModuleNotFoundError`
  di `services/*/app` (bukan test) = **kosong** — fallback path hack memang
  sudah hilang dari source, bukan cuma diklaim.
- Investigasi footplat: `bridging_tanah.py` baris 91-92 memang mencari alias
  `b/b_ft/lebar/lebar_bawah` & `l/l_ft/panjang/panjang_bawah` seperti yang
  diklaim laporan — bukan alias sempit yang jadi bug. Kesimpulan laporan
  (dimensi footplat PLHUT ada di halaman detail/grafis, bukan tabel
  kode-dimensi yang bisa diparse `page.find_tables()`) konsisten dgn cara
  kerja pipeline saat ini (tidak diverifikasi ulang lewat re-run PDF asli
  sesi ini, tapi klaim mekanisnya masuk akal & bukti kutipan teks halaman 49
  di laporan tidak dipalsukan/tidak kontradiktif dgn kode).
- Commit `6f355a7` (`git show --stat`) cocok persis file yang disebut
  laporan. PR #38 draft, base `main`, belum merge — sesuai klaim.

**Konsep baru diintegrasikan ke roadmap (bukan cuma satu file — semua
dokumen arsitektur/roadmap diselaraskan):**
- `CLAUDE.md` §1.1 & `AGENTS.md` §1.1 (baru): aturan resmi AI-assist
  klasifikasi/binding — rule-based tetap fast-path, LLM hanya fallback utk
  kasus gagal/ambigu, baca teks+koordinat SUDAH diekstrak (bukan piksel),
  validasi deterministik wajib, tidak ada auto-commit ke input engine,
  audit trail wajib, biaya/latency dipertimbangkan.
- `docs/MASTER_PLAN.md` §6.2 (catatan sebelum Tahap 3) & §12.1 (baris baru
  peta model) diperbarui.
- `docs/BRAIN_ALIGNMENT.md` §4 (tabel eksekusi): baris Fase 2 diperbarui +
  baris baru "Fase X2" + klarifikasi baris "Tetap ditunda" (Vision-LLM piksel
  vs AI-assist teks+koordinat — dua hal berbeda, jangan disamakan).
- `docs/ai-map/START_HERE.md`: baris "2 aturan" merujuk §1.1, baris Router
  baru menunjuk ke §X2 big-plan.
- `docs/ai-map/MAP.md`: `services/document-intelligence` DITAMBAHKAN (
  sebelumnya tidak terdaftar sama sekali di MAP — gap ditemukan & diperbaiki
  sesi ini) + endpoint + folder `perception/` + rencana `ai_assist/`.
- `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md`: tabel
  fase diperbarui (X1/X1B ditandai selesai dgn ringkasan §1a baru), fase
  **X2 baru** ditambah dgn detail penuh (kenapa ada, prinsip desain,
  slice pertama, keputusan arsitektur, interaksi dgn Fase Y).

**Prompt Codex baru ditulis** (belum dijalankan):
`docs/prompts/PAAX_CODEX_PROMPT_FASE_X2_AI_ASSIST_KLASIFIKASI_BINDING_2026-07-05.md`
— vertical slice sempit: modul `ai_assist/` di document-intelligence utk
kasus `pondasi_telapak` dimensi hilang dari halaman `detail_tabel`, klien
Gemini Python baru (pola sama `orchestrator.ts`, `GEMINI_API_KEY` yang sudah
ada), validasi deterministik wajib, test pakai stub/mock LLM (bukan API
sungguhan), fixture sintetis independen (bukan PLHUT hardcoded).

**Belum dikerjakan sesi ini (sengaja, di luar scope planning):** tidak ada
kode baru ditulis, tidak ada commit dibuat (owner instruksikan Codex yang
commit sesuai gerbang kerja §9 CLAUDE.md), tidak ada re-run pipeline PLHUT
utk angka baru (itu tugas Fase Z, belum dijadwalkan sesi ini).

## FASE X1B - PACKAGING PAAX SCHEMAS + INVESTIGASI BINDING FOOTPLAT (prompt 2026-07-16, eksekusi Codex 2026-07-05)
Branch kerja: `feat/fase-x1b-packaging-binding-footplat`.
PR: https://github.com/Wisnu8aji/paax-ai/pull/38
Report remote: `report-remote/REPORT_FASE_X1B_PACKAGING_BINDING_CODEX_2026-07-05.md`.

- **Packaging diperbaiki**: `packages/schemas/python` sekarang package
  Python installable (`paax-schemas` 0.1.0), bukan folder yang hanya
  ditemukan lewat fallback path.
- **Dependency service**: core-engine dan document-intelligence mencatat
  dependency `paax-schemas`; CI dan README menginstal shared Python schemas
  sebelum service Python.
- **Fallback dihapus**: import `paax_schemas` sekarang langsung. Tidak ada
  `sys.path.insert` / `except ModuleNotFoundError` untuk package ini di
  source target.
- **Tes packaging baru**: subprocess Python bersih dari folder masing-masing
  service membuktikan `paax_schemas` bisa di-import tanpa `PYTHONPATH`.
- **Investigasi PLHUT**: halaman 49 memuat angka/kode detail pondasi, tetapi
  tidak menjadi `TypeRecord` dengan kolom `kode` + `dimensi`; masalahnya gap
  ekstraksi detail/grafis, bukan alias field sempit di bridge. `d_gali` juga
  tidak ditemukan sebagai sumber eksplisit.
- **Verifikasi**: core-engine **280 passed**, document-intelligence
  **149 passed + 5 skipped**, packages/schemas build OK + Jest **12 passed**,
  web Vitest **47 passed**, `pnpm tsc --noEmit` exit 0.

## FASE X1 - BRIDGING GALIAN FOOTPLAT + FIX ARSITEKTUR (prompt 2026-07-15, eksekusi Codex 2026-07-05)
Branch kerja: `feat/fase-x1-bridging-galian-footplat`.
PR: https://github.com/Wisnu8aji/paax-ai/pull/37
Report remote: `report-remote/REPORT_FASE_X1_BRIDGING_GALIAN_CODEX_2026-07-05.md`.

- **Fix WBS**: `document-intelligence` tidak lagi memuat
  `core-engine/app/rab/sections.py` lewat filesystem/importlib. WBS pindah ke
  shared Python package `packages/schemas/python/paax_schemas/wbs.py`, lalu
  dipakai oleh core-engine dan document-intelligence.
- **Fix kategori TKG**: prefiks/kategori kode TKG pindah ke
  `packages/schemas/python/paax_schemas/tkg_taxonomy.py`. Kategori seperti
  `gording`, `kuda_kuda`, `ikatan_angin`, dan `trekstang` sekarang dikenal
  work-items dan map ke WBS `III - Pekerjaan Struktur`, bukan `LAINNYA`.
- **Bridge X1**: modul baru
  `services/document-intelligence/app/perception/bridging_tanah.py`
  membentuk input `GalianFootplat` dari `ElementRegistryEntry` dan memanggil
  `core-engine /takeoff/tanah` bila data lengkap. Tidak ada hitung volume
  manual di document-intelligence.
- **Status jujur**: `pondasi_telapak` tanpa dimensi `b/l` atau tanpa
  `d_gali` keluar sebagai `perlu_review` dengan alasan spesifik dan volume
  tetap kosong.
- **Smoke PLHUT lengkap 88 halaman**: 13 item `pondasi_telapak` dikenali dan
  masuk bridge `galian_footplat`; 0 `dihitung`, 13 `perlu_review`, alasan
  sama: `dimensi footplat tidak lengkap di gambar: b, l`.
- **Verifikasi**: document-intelligence **148 passed + 5 skipped**,
  core-engine **279 passed**, packages/schemas build OK + Jest **12 passed**,
  web Vitest **47 passed**, `pnpm tsc --noEmit` exit 0.
> Selesai satu fase → perbarui di sini (jangan sebar ke banyak file).

## ✅ FASE V/W — NORMALISASI KODE + WORK ITEM GROUPING (prompt 2026-07-14, eksekusi Codex 2026-07-05)
Branch kerja: `feat/gambar-rab-fase-v-w-normalisasi-work-items`.
PR: https://github.com/Wisnu8aji/paax-ai/pull/36
Report remote: `report-remote/REPORT_FASE_V_W_CODEX_2026-07-05.md`.

- **Step 0 selesai lebih dulu**: backlog Fase S/T/U/U-2 diverifikasi cocok
  dengan STATE lalu di-commit terpisah pada branch
  `fix/semarang-candidate-ranking-claude-direct`; PR draft:
  https://github.com/Wisnu8aji/paax-ai/pull/35.
- **Fase V selesai**: `consolidate.py` sekarang memakai kode kanonik untuk
  registry lintas-halaman. Variasi seperti `K1`, `K-1`, `K 1`, dan
  `KOLOM K1` digabung menjadi `K1`, sementara kode mentah tetap disimpan
  pada `ElementInstanceRef.kode_raw` dan `ElementRegistryEntry.kode_asli`.
  Test negatif memastikan `K1`, `K11`, dan `K1A` tetap entry berbeda.
- **Fase W selesai**: modul baru
  `services/document-intelligence/app/perception/work_items.py` mengelompokkan
  `ConsolidatedExtraction.element_registry` + `TakeoffItem` menjadi baris
  work item dengan `formula_status`: `dihitung`, `perlu_review`, atau
  `belum_didukung`. Modul ini hanya menyalin volume dari takeoff engine dan
  tidak menghitung angka baru.
- **Endpoint baru**: `POST /drawings/tkg/work-items` di document-intelligence.
  Input: consolidated extraction + list takeoff item. Output: `work_items`
  siap dipakai UI/RAB berikutnya.
- **Zod mirror**: `DrawingWorkItemSchema` dan
  `DrawingWorkItemsResultSchema` ditambahkan di `packages/schemas`.
- **Kategori saat ini**: kategori struktural dari takeoff TKG
  (`kolom`, `kolom_praktis`, `sloof`, `balok`, `ring_balok`, `latei`,
  `plat`, `pondasi_telapak`, `dinding_beton`, `tangga`) diperlakukan sebagai
  rumus tersedia bila ada takeoff item. `sanitasi`, `drainase`, `plumbing`,
  `listrik`, dan kategori di luar cakupan rumus saat ini ditandai
  `belum_didukung` tanpa volume.
- **Verifikasi**: core-engine **279 passed**, document-intelligence
  **141 passed + 5 skipped**, `packages/schemas` build OK + Jest
  **12 passed**, web Vitest **47 passed**, `pnpm tsc --noEmit` exit 0.

## ✅ FASE T — AHSP AUTO-SUGGEST AKTIF (2026-07-13, dikerjakan langsung oleh Claude)
Spek: `docs/prompts/PAAX_CODEX_PROMPT_FASE_T_AHSP_AUTO_SUGGEST_2026-07-12.md`.
Rencana besar terkait: `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md`.

- **Modul baru** `services/core-engine/app/mapping/takeoff_ahsp.py`:
  `suggest_ahsp_for_item`/`suggest_ahsp_for_takeoff` — memetakan tiap
  `TakeoffItem` (beton/bekisting/besi) ke usulan kode AHSP via `search_ahsp`
  yang SUDAH ADA (token-overlap deterministik, TIDAK diubah).
- **Kamus kategori->query** dibangun dari pengecekan LANGSUNG ke
  `data/ahsp/cipta-karya-2026.json` (bukan tebakan) — lihat komentar modul
  utk detail per kategori.
- **Kalibrasi ambang auto-suggest** (`_AUTO_SUGGEST_MIN_SCORE=0.5`,
  `_AUTO_SUGGEST_MIN_MARGIN=0.12`) diverifikasi manual thd katalog nyata.
  **Temuan jujur penting**: beton HAMPIR TIDAK PERNAH auto-suggest (selalu
  ada kompetitor dekat "Ready Mixed" + utk fc=25 token "25" collide dgn
  boilerplate "Slump (100 ± 25) mm" di SETIAP item beton keluarga itu,
  menghasilkan tie 3 arah); besi juga tidak pernah auto-suggest (katalog
  hanya beda by diameter <12mm/≥12mm & metode, tidak tersedia di
  `TakeoffItem`). Auto-suggest AMAN & aktif utk sebagian bekisting
  (pondasi_telapak/dinding_beton/plat/sloof/tangga — margin >=0.139),
  bekisting kolom/balok TIDAK (kompetitor "...Beton Pracetak" persis).
- **Bug ditemukan+diperbaiki saat verifikasi** (bukan cuma diklaim, diuji
  manual dulu): (1) regex `_FC_PATTERN` awal gagal utk notasi nyata
  `"fc' 25"` (apostrof setelah bukan antara f&c) — diperbaiki jadi toleran
  ke variasi posisi apostrof. (2) fallback query generik utk beton
  ("beton kolom") confidently salah pilih item "...Beton Pracetak" (precast,
  margin 0.16 lolos ambang) — diperbaiki dgn exclude semua item "pracetak"
  dari pencarian utk item takeoff (yang selalu cor-di-tempat, `_exclude_
  pracetak`), FIX INI JUGA memperbaiki bekisting kolom/balok (margin naik
  dari kompetitor pracetak yang hilang, walau tetap di bawah ambang final
  krn kompetitor cor-di-tempat lain).
- **Endpoint baru** `POST /tkg/takeoff-ahsp-suggest` (takeoff + suggestions
  digabung 1 response, `TakeoffAhspSuggestResult`).
- **Zod mirror** `TakeoffAhspCandidateSchema`/`TakeoffAhspSuggestionSchema`/
  `TakeoffAhspSuggestResultSchema` di `packages/schemas` (paket dibuild
  ulang, `pnpm build` di `packages/schemas`).
- **Frontend**: `tkg-workspace.tsx` `runPipeline` pakai
  `takeoffAhspSuggestTkg` (ganti `takeoffTkg`), `sendToRab` mengisi
  `ahsp_code`+`ahsp_suggested:true` HANYA utk item confident (match by
  kode+lantai+work_type); `RabDraftLine` dapat field opsional
  `ahsp_suggested`; halaman `/rab` menampilkan `StatusPill` "disarankan AI —
  cek & ganti bila perlu" di bawah dropdown, HILANG otomatis begitu user
  ganti kode manual. Tidak ada redesign visual (reuse `StatusPill`).
- **Verifikasi nyata (bukan cuma test)**: endpoint dipanggil langsung via
  curl ke core-engine berjalan (port 8081) dgn payload SL1/sloof — hasil
  cocok persis prediksi test (bekisting auto-suggest `2.2.1.3.2`, beton &
  besi tidak). Badge diverifikasi di browser sungguhan (`preview_*` tools):
  inject draft RAB dgn `ahsp_suggested:true` -> badge "disarankan AI"
  tampil; ganti dropdown manual -> badge hilang. Console bersih.
- **Test**: 13 test baru `test_takeoff_ahsp.py` (4 anchor katalog CK 2026
  nyata + 2 end-to-end via `buat_tkg()`+`takeoff_tkg()` nyata + 7 fixture
  sintetis independen §0.1) + 1 test baru `tkg-workspace.test.tsx`.
  core-engine **279 passed** (266+13), web **47 passed** (46+1),
  document-intelligence **136 passed + 5 skipped** (tidak disentuh),
  `pnpm tsc --noEmit` bersih di root & `apps/web`.
- **BELUM di-commit** — kerja di working tree yang sama (branch
  `fix/semarang-candidate-ranking-claude-direct`).

## ✅ FASE U/U-2 — PERBAIKAN NOISE KONSOLIDASI + GAP PAGE-TYPE (2026-07-13, dikerjakan langsung oleh Claude)

## ✅ FASE U/U-2 — PERBAIKAN NOISE KONSOLIDASI + GAP PAGE-TYPE (2026-07-13, dikerjakan langsung oleh Claude)
Rencana lengkap: `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_BIG_PLAN_2026-07-13.md`
(dokumen baru, melanjutkan `PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`
yang Fase 0-S-nya sudah selesai). Dipicu kritik mendalam owner + BUKTI NYATA
screenshot aplikasi berjalan (`G:\gambar contoh\*.png`, upload `GAMBAR KERJA
PLHUT SURAKARTA (1).pdf` 88 halaman ke proyek uji "Gedung 3 lantai").

- **Bug 1 ditemukan & diperbaiki**: `document-intelligence/app/perception/
  consolidate.py::_grid_conflicts` membandingkan `posisi_mm` ABSOLUT antar
  sheet — bug IDENTIK dgn V-03 core-engine yang sudah diperbaiki Fase M-2,
  tapi versi document-intelligence ini luput (beda service). Karena tiap
  halaman PDF merekonstruksi grid dgn origin sendiri, ini menghasilkan
  BELASAN Assumption "tinggi" nyaris identik per axis (bukti screenshot:
  9+ baris "Grid as '4' beda posisi antara sheet 6 dan sheet 39/40/.../47").
  Diperbaiki: bandingkan jarak RELATIF ke anchor label bersama (pola sama
  `_cek_v03`), DAN ringkas semua sheet konflik per axis jadi SATU Assumption
  (bukan satu per pasangan sheet).
- **Bug 2 ditemukan & diperbaiki**: teks unclassified 100% masuk assumptions
  tanpa filter, termasuk kop administratif berulang ("KEMENTERIAN...",
  "TAHUN ANGGARAN...", dst muncul di HAMPIR SETIAP halaman). Diperbaiki:
  `_is_admin_metadata` (keyword generik kop gambar + heuristik frekuensi
  lintas-sheet ≥3) — teks TETAP tersimpan di data mentah, hanya tidak lagi
  masuk `assumptions` yang tampil ke user.
- **Gap ditemukan & diperbaiki (U-2)**: `zone_classifier.py` hanya kenal
  keyword struktur (FOOTPLAT/PONDASI/ATAP/LT.n/SLOOF) — sheet cover/daftar-
  gambar/situasi/tampak/potongan selalu "Belum diketahui". Tambah kategori
  `daftar_gambar` (keyword generik "DAFTAR"/"INDEX GAMBAR"), `situasi`,
  `tampak`, `potongan`, dan fallback `cover` (KONSERVATIF: hanya jika
  halaman di antara 2 pertama, TANPA judul/grid/elemen sama sekali — kalau
  ragu, tetap jujur `None`, tidak dipaksakan). Bug tambahan ditemukan saat
  verifikasi: `assemble.py` memanggil `classify_zone` dgn `judul_asli`
  (placeholder "Sheet N" kalau judul tak ketemu, selalu truthy) bukan
  `judul_extracted` — fallback `cover` jadi dead code sebelum diperbaiki.
- **Verifikasi kuantitatif nyata** (PDF ASLI dari bukti screenshot owner,
  88 halaman, BUKAN fixture): sebelum→sesudah tidak bisa dibandingkan
  apple-to-apple persis dgn angka "4281" di screenshot (versi kode beda),
  TAPI hasil SESUDAH fix diukur langsung: **1007 assumptions total, 0
  (NOL) severity "tinggi"** (sebelumnya axis conflict tunggal saja bisa
  hasilkan 9+ entri "tinggi" berulang — kelas bug ini sekarang collapse
  jadi 0 krn perbandingan relatif + dedupe). Zona: 85/88 sheet
  terklasifikasi (naik drastis dari sebelumnya banyak "Belum diketahui"
  di sheet non-struktur); sisa 3 unclassified genuinely jujur (1 cover dgn
  grid palsu terdeteksi shg heuristik conservative menolak menebak, 2 sheet
  "DENAH PENANGKAL PETIR"/"DENAH SALURAN AIR HUJAN" — di luar taksonomi
  zona saat ini, MEP/utilitas, dicatat sbg gap jujur bukan dipaksakan).
- Test baru: 4 test `test_perception_consolidate.py` (relative-offset tidak
  false-positive, konflik nyata di 9 sheet collapse jadi 1 assumption,
  filter keyword admin, filter frekuensi berulang) + 6 test
  `test_perception_zone_classifier.py` (daftar_gambar 2 varian, situasi,
  tampak, potongan, cover fallback konservatif 5 kasus).
- Verifikasi: document-intelligence **136 passed, 5 skipped** (naik dari
  126). core-engine/web TIDAK disentuh sesi ini (tidak dijalankan ulang,
  scope murni document-intelligence).
- **BELUM di-commit** — bekerja di working tree yang sama dgn Fase S
  (branch `fix/semarang-candidate-ranking-claude-direct`), 2 concern beda
  domain (harga vs perception) tidak saling ganggu.
- **Selanjutnya (lihat big-plan 2026-07-13)**: Fase T (AHSP auto-suggest,
  spek sudah lengkap) → V (cross-page linking lebih toleran) → W (BOQ
  work-item grouping) → X (ekspansi rumus takeoff ke trade baru, PALING
  BESAR, multi-sesi) → Y (UI 1-tombol "Analisa RAB dari Gambar Kerja") →
  Z (verifikasi ulang PDF yang sama, update angka noise final).

## ✅ FASE S — PERBAIKAN RANKING KANDIDAT + TUTUP JALUR HARGA SEMARANG (2026-07-12, dikerjakan langsung oleh Claude)
Branch kerja: `fix/semarang-candidate-ranking-claude-direct` (dari
`origin/feat/ahsp-unit-apply-semarang-import-kejaksaan`, PR #34).
Owner minta perbaikan ini dikerjakan langsung tanpa prompt Codex terpisah.

- **Bug ditemukan saat verifikasi PR #34**: baris "Kloset jongkok porselen"
  (KEJAKSAAN row 71) jatuh ke "tidak ketemu" padahal katalog master punya
  `M.GEN.0450 "Kloset Jongkok"` dengan harga PERSIS sama (350000, sudah
  dipakai sbg override manual Fase A-2). Akar masalah: field `unit`
  resource itu di `_resources_catalog.json` tertulis **"unit"** (label
  generik/keliru), bukan "buah" — jadi kandidat ini kalah ranking gabungan
  dari 5 kandidat lain yang unit-nya cocok ("buah") tapi namanya jauh lebih
  jauh (mis. "Dinding Porselen uk. 10x20cm").
- **Perbaikan**: `scripts/harga/kejaksaan_semarang_report.py` fungsi
  `nearest_rejected_candidates` sekarang SELALU menyertakan kandidat dengan
  kemiripan NAMA tertinggi (mengganti kandidat paling lemah di top-N, bukan
  menambah panjang daftar — supaya potongan tampilan laporan tidak
  memangkasnya). **Tidak mengubah keputusan match final** (matched/
  ambigu/tidak_ketemu) — murni memperkaya kandidat yang ditampilkan.
- Diverifikasi: `python scripts/harga/kejaksaan_semarang_report.py`
  dijalankan ulang, hasil `report/HARGA_KEJAKSAAN_SEMARANG_2026-07-11.md`
  diregenerasi — jumlah matched/ambigu/tidak-ketemu **tidak berubah** (24/
  4/93), hanya kolom kandidat-dekat di 18 baris yang lebih informatif
  sekarang (mis. baris 71 sekarang menampilkan `M.GEN.0450`, baris 201
  "Jack hammer" menampilkan `E.GEN.0016 Jack Hammer Drill`).
- Test baru: `test_kandidat_nama_paling_mirip_tetap_tampil_walau_unit_
  katalog_keliru` (reproduksi persis kasus Kloset di atas),
  `test_nearest_rejected_candidates_kosong_bila_katalog_kosong`.
- **Status resmi jalur harga Semarang: DITUTUP untuk sesi ini.** Dua sumber
  lokal yang tersedia (`Daftar harga bahan dan upah.xlsx` dipakai Fase P,
  `KEJAKSAAN.xlsx` dipakai Fase R) **sudah habis ditambang** — KEJAKSAAN
  ternyata 0 kode baru (semua 24 match sudah ada di 25-resource yang sama),
  nilainya murni validasi silang (0 selisih harga >15%). Ekspansi cakupan
  lebih lanjut BUTUH sumber harga baru, bukan menambang ulang 2 file yang
  sama.
- **8 item ambigu masih terbuka** (perlu keputusan proyek spesifik dari
  owner, BUKAN sesuatu yang bisa ditebak/diputuskan otomatis):
  - Fase P: Wiremesh (M12 vs M6), Kran air (1/2" vs 3/4"), Keramik 30x60
    (polished/unpolished), Keramik 30x30 (banyak varian).
  - Fase R: Tukang Cat (3 entri near-duplikat di katalog master), Paku
    (banyak ukuran), Portland cement (3 entri near-duplikat), Paku sekrup
    (banyak ukuran).
- Verifikasi test: core-engine **266 passed** (264 + 2 baru), web **46
  passed**, `pnpm tsc --noEmit` exit 0, document-intelligence tidak
  disentuh (tidak dijalankan ulang, tidak ada perubahan di service itu).
- **BELUM di-commit** — working tree di branch
  `fix/semarang-candidate-ranking-claude-direct`, menunggu keputusan owner
  soal commit/PR (Claude tidak commit tanpa diminta eksplisit).

## ✅ FASE Q/R — TERAPKAN HASIL O/P + HARGA KEJAKSAAN SEMARANG (prompt 2026-07-11)
Branch kerja: `feat/ahsp-unit-apply-semarang-import-kejaksaan`.
PR: https://github.com/Wisnu8aji/paax-ai/pull/34
Base yang dipakai: `origin/feat/ahsp-unit-gap-semarang-price-batch2` karena
PR #29-#33 masih open dan fase ini bergantung pada laporan/data Fase O/P.

- **Fase Q selesai sebagai penerapan data produksi**: 188 satuan AHSP CK 2026
  diterapkan ke `data/ahsp/cipta-karya-2026.json` dari marker
  `report/AHSP_UNIT_GAP_RESOLUTION_2026-07-10.md`. Hasil akhir: 2.542 item
  AHSP, **0 unit kosong**, dan 188 kode cocok persis dengan laporan.
- **Region Semarang masuk repo sebagai price book nyata**:
  `data/harga-satuan/semarang.json` ditambahkan dari sumber lama
  `G:\paax-data\harga-satuan\semarang.json` (23 resource), lalu ditambah 2
  resource Fase P yang sudah diputuskan (`M.GEN.0085` Baja Profil 12000,
  `M.GEN.0456` Sealtape 10000). Total sekarang **25 resource**.
- **Loader diperketat**: `semarang_overrides.json` tidak lagi terbaca sebagai
  price book kosong karena loader hanya memuat JSON harga yang punya
  `resources` berupa list. File override historis tetap tidak diubah.
- **Coverage harga Semarang jujur**: sebelum Q, Semarang punya 0 priced
  resource. Sesudah Q: **25/2.441** resource AHSP punya harga,
  `coverage_ratio=0.0102`; masih sangat kecil dan itu diharapkan.
- **Fase R selesai sebagai laporan usulan, bukan penerapan harga**:
  `G:\AHSP\KEJAKSAAN.xlsx` sheet `HARGA BAHAN` diekstrak **121 baris**.
  Hasil: **24 matched aman**, **4 ambigu**, **93 tidak ketemu aman**. Baris
  tidak ketemu sekarang menampilkan kandidat dekat beserta alasan penolakan
  seperti unit/kategori/angka tidak cocok.
- **Perbandingan sumber Semarang**: overlap KEJAKSAAN vs price book Semarang
  sebanyak **24 kode**, selisih harga >15% **0**. Tidak ada averaging dan
  tidak ada harga KEJAKSAAN yang diterapkan otomatis.
- **Verifikasi**: core-engine **264 passed**, web Vitest **46 passed**,
  `pnpm tsc --noEmit` exit 0, document-intelligence **126 passed + 5 skipped**.
- Report detail:
  `report/HARGA_KEJAKSAAN_SEMARANG_2026-07-11.md`,
  `report/REPORT_FASE_Q_R_TERAPKAN_HASIL_KEJAKSAAN_SEMARANG_CODEX_2026-07-11.md`.

## ✅ FASE O/P — AHSP UNIT GAP + HARGA SEMARANG BATCH2 (prompt 2026-07-10)
Branch kerja: `feat/ahsp-unit-gap-semarang-price-batch2`.
PR: https://github.com/Wisnu8aji/paax-ai/pull/33
Base yang dipakai: `origin/fix/v03-relative-position-check` karena PR #29,
#30, #31, dan #32 masih open. Prompt ini membutuhkan data/report dari Fase N
dan M-2, sehingga tidak bisa dikerjakan langsung dari `main`.

- **Fase O selesai sebagai laporan usulan, bukan penerapan data**: 188 item
  AHSP CK 2026 yang `unit`-nya kosong dicari di 16 PDF resmi
  `G:\AHSP\Lampiran-VI-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Cipta-Karya-{1..16}.pdf`.
  Semua **188/188** ditemukan langsung di PDF resmi. Hasil kelompok: PDF resmi
  **188**, infer pola nama **0**, tidak terselesaikan **0**.
- **Duplikasi resource diverifikasi bukan bug**: test baru membuktikan
  `compute_hsp` menjumlahkan baris duplikat pada item nyata `1.1.1.1`
  (`L.02` muncul 2x koefisien 0.2) sebagai dua subtotal terpisah.
- **Fase P selesai sebagai laporan usulan Semarang batch2**: acuan harga
  existing adalah `G:\paax-data\harga-satuan\semarang.json` (23 resource
  unik hasil fase lama). Dari 68 baris unmatched: **2 matched diusulkan**
  (`Besi profil` -> `M.GEN.0085`, `Seal tape` -> `M.GEN.0456`),
  **4 ambigu**, **62 tidak ketemu aman**. Dua ambiguous lama (`Paku`,
  `Paku sekrup`) tetap dicatat sebagai review lama, tidak dihitung dalam 68.
- **File produksi tidak disentuh**: tidak ada perubahan pada
  `data/ahsp/cipta-karya-2026.json`, `data/harga-satuan/semarang.json`, atau
  `G:\paax-data\harga-satuan\semarang.json`.
- **Verifikasi**: core-engine **258 passed**, web Vitest **46 passed**,
  `pnpm tsc --noEmit` exit 0, document-intelligence **126 passed + 5 skipped**.
- Report detail:
  `report/AHSP_UNIT_GAP_RESOLUTION_2026-07-10.md`,
  `report/HARGA_SEMARANG_BATCH2_FINDINGS_2026-07-10.md`,
  `report/REPORT_FASE_O_P_AHSP_UNIT_GAP_SEMARANG_PRICE_CODEX_2026-07-10.md`.

## ✅ FASE M-2 — V-03 RELATIVE POSITION FIX (prompt 2026-07-09)
Branch kerja: `fix/v03-relative-position-check`.
PR: https://github.com/Wisnu8aji/paax-ai/pull/32
Base yang dipakai: `origin/feat/v03-fix-ahsp-catalog-import` karena PR #29,
#30, dan #31 masih open saat pekerjaan dimulai. PR M-2 tetap dibuka ke `main`
sesuai prompt dan belum di-merge.

- **Masalah yang diperbaiki**: V-03 hasil PR #31 masih membandingkan posisi
  absolut `posisi_mm` antar sheet. Ini salah untuk data pipeline nyata karena
  `grid_geometry.py` merekonstruksi grid per halaman dan memberi axis pertama
  di halaman itu `posisi_mm=0.0`.
- **Perbaikan inti**: `_cek_v03` sekarang membandingkan jarak relatif antar
  label as yang sama-sama muncul. Untuk `shared >= 2`, validator memilih
  anchor deterministik `sorted(shared)[0]`, lalu membandingkan
  `pos[label] - pos[anchor]` antar sheet. Toleransi tetap memakai
  `params.tol_grid` plus absolute floor `0.001 m`.
- **Batas jujur**: jika dua sheet hanya berbagi satu label, V-03 tidak membuat
  `E-GRID` karena belum ada jarak relatif yang bisa diuji. Ini dicatat sebagai
  keterbatasan matematis, bukan asumsi bahwa grid pasti benar.
- **Anchor test baru**: kasus sheet 1 `A=0,B=3000,C=6500` dan sheet 2
  `B=0,C=3500` sekarang `gate_passed=True` dan tanpa `E-GRID`. Kasus konflik
  nyata tetap tertangkap hanya pada subject `x:B`, tidak dobel ke `x:C`.
- **Verifikasi**: reproduksi manual `ok=True gate_passed=True []`;
  core-engine **251 passed**, web Vitest **46 passed**, `pnpm tsc --noEmit`
  exit 0, document-intelligence **126 passed + 5 skipped**.
- **Fase N/AHSP tidak disentuh**: tidak ada perubahan pada `data/ahsp` maupun
  test AHSP.
- Report: `report/REPORT_FASE_M2_V03_RELATIVE_FIX_CODEX_2026-07-09.md`.

## ✅ FASE M/N — V-03 FIX + IMPOR AHSP CK 2026 (prompt 2026-07-08)
Branch kerja: `feat/v03-fix-ahsp-catalog-import`.
PR: https://github.com/Wisnu8aji/paax-ai/pull/31
Base yang dipakai: `origin/feat/rab-nav-validator-audit-ahsp-suggest` karena
PR #29 dan #30 masih open saat pekerjaan dimulai.

- **Fase M selesai**: V-03 core-engine tidak lagi membandingkan fingerprint
  penuh antar sheet denah. Validator sekarang membandingkan hanya label as
  yang muncul di kedua sheet; subset grid sah (mis. atap hanya B-C, lantai A-C)
  lolos, tetapi konflik posisi nyata tetap menjadi `E-GRID` dengan subject
  actionable seperti `x:B`. Marker `xfail` V-03 sudah dihapus.
- **Fase N selesai sebagai impor mekanis + audit batch**: katalog resmi
  `G:\paax-data\ahsp\cipta-karya-2026.json` berisi **2.542 item** disalin ke
  `data/ahsp/cipta-karya-2026.json`. File sample lama
  `data/ahsp/cipta-karya.sample.json` tetap ada dan tidak diubah.
- **Temuan data 10 batch**: semua 2.542 item parse sebagai `AHSPItem`; tidak
  ada `resource_code` asing terhadap master resource; ada **197 anomali
  mekanis** (unit kosong dan/atau resource sama dengan koefisien sama berulang
  dalam item) yang dicatat, bukan diperbaiki sepihak. Detail:
  `report/AHSP_IMPORT_BATCH_FINDINGS_2026-07-08.md`.
- **Coverage harga jujur**: sebelum impor, `jateng` coverage ratio 1.0 untuk
  4 item sample/12 resource. Setelah impor, loader memuat **2.546 AHSP** (2.542
  resmi + 4 sample); `jateng` coverage ratio menjadi **0.0049** (12 dari 2.441
  resource AHSP punya harga). Ini benar dan diharapkan karena HSD regional resmi
  untuk katalog 2026 belum diimpor.
- **Belum dikerjakan di prompt ini**: AHSP auto-suggest Fase L, impor price book
  dari `_resources_catalog.json` (dilarang karena semua price=0), deteksi simbol
  grafis, dan vision-LLM fallback.
- **Verifikasi**: core-engine **249 passed** (tanpa xfail), web Vitest
  **46 passed**, `pnpm tsc --noEmit` exit 0, document-intelligence
  **126 passed + 5 skipped**.

## ✅ RENCANA BESAR GAMBAR KERJA — FASE J-2/K-2/L LANJUTAN (prompt 2026-07-07)
Branch kerja: `feat/rab-nav-validator-audit-ahsp-suggest`.
PR: https://github.com/Wisnu8aji/paax-ai/pull/30
Base yang dipakai: `origin/feat/gambar-generate-rab-wiring` karena PR #29
belum merged saat eksekusi.

- **Fase J-2 selesai**: setelah `sendToRab` menyimpan volume ke Draft RAB,
  UI tidak auto-redirect. Tombol baru **"Lihat Draft RAB"** muncul dan kliknya
  memanggil `router.push('/proyek/[projectId]/rab')`. Ini menjaga konteks user:
  pesan sukses tetap terbaca, lalu user sendiri membuka draft.
- **Fase K-2 selesai sebagai audit validator**: test baru di
  `services/core-engine/tests/test_tkg.py` membuktikan V-02 tetap menangkap
  total grid salah walau data memakai `zone`, `offset_tepi`, `alamat_list`,
  dan `alamat_needs_review`; V-04 tetap hanya warning untuk orphan type/def.
- **Temuan V-03 eksplisit**: kasus denah multi-sheet dengan grid subset sah
  (mis. sheet atap hanya B-C sementara sheet lantai penuh A-C) saat ini masih
  menjadi `E-GRID` karena validator membandingkan fingerprint grid penuh antar
  semua sheet `denah`. Test ditandai `xfail(strict=True)` agar temuan terlihat
  tanpa mengubah gate logic sepihak. Perlu keputusan Claude/owner sebelum V-03
  diubah dari error keras menjadi aturan yang lebih sesuai realita multi-sheet.
- **Fase L di-skip sengaja**: masih opsional, katalog AHSP repo hanya sample 4
  item. Auto-suggest berisiko memberi kesan mapping AHSP sudah matang. Jalur
  saat ini tetap jujur: volume masuk Draft RAB, `ahsp_code` kosong, user pilih
  manual di halaman RAB.
- **Verifikasi**: web Vitest **46/46**, `pnpm tsc --noEmit` hijau,
  core-engine **242 passed + 1 xfailed**, document-intelligence **126 passed +
  5 skipped**. Browser Playwright memverifikasi upload PDF → analisa → simpan
  → kirim volume → tombol "Lihat Draft RAB" → URL `/proyek/project-1/rab` dan
  row volume `1.25` tersimpan dengan `ahsp_code: ""`.

## ✅ RENCANA BESAR GAMBAR KERJA — FASE J/K SELESAI (prompt 2026-07-06)
Branch kerja: `feat/gambar-generate-rab-wiring`.

- **Fase J (wajib) selesai**: `apps/web/src/components/drawings/tkg-workspace.tsx`
  sekarang menjalankan `validateTkg` → `renderTkg` → `takeoffTkg` otomatis
  setelah user menekan **"Simpan hasil analisis"** pada Review Gambar. Tombol
  placeholder disabled **"Generate RAB"** dan teks **"Segera hadir"** dihapus
  dari UI. CTA yang sah adalah **"Kirim Volume ke Draft RAB"** setelah takeoff.
- **Aturan RAB tetap dijaga**: `sendToRab`, `TriagePanel`, dan format
  `RabDraftLine` tidak diubah. Item takeoff yang `needs_review` tidak dikirim.
  Item siap pakai dikirim sebagai baris Draft RAB berisi `volume`, sementara
  `ahsp_code` tetap string kosong agar user memilih AHSP di halaman RAB.
- **Fase K selesai sebagai coverage validator**: `services/core-engine/tests/
  test_tkg.py` menambah test untuk `SheetMeta.zone`, `alamat_list`,
  `alamat_needs_review`, dan notasi offset seperti `"B-offset_sebelum_1"`.
  Hasilnya: validator tidak membuat false-positive pada field pipeline baru,
  dan tetap menangkap issue nyata `W-CNT` ketika count simbol/label mismatch.
  Tidak perlu perubahan rumus/logic validator.
- **Fase L (AHSP auto-suggest) di-skip sengaja**: optional pada prompt, dan
  katalog AHSP lokal masih sample kecil. Mapping AHSP otomatis akan berisiko
  terlihat lebih pintar dari data yang tersedia. Jalur saat ini tetap jujur:
  volume masuk draft, AHSP dipilih manual.
- **Verifikasi**: web Vitest 45/45, `pnpm tsc --noEmit` hijau, core-engine
  240/240, document-intelligence 126/126 dengan 5 skipped. Browser headless
  Chrome juga memverifikasi upload PDF sintetis → Review Gambar → simpan →
  Triage Review + "Kirim Volume ke Draft RAB" muncul tanpa reload → Draft RAB
  tersimpan dengan volume `1.25` dan `ahsp_code: ""` → halaman `/rab`
  menampilkan row volume yang sama.

## ✅ RENCANA BESAR GAMBAR KERJA — FASE 0-H SELESAI (2026-07-05 malam)
Owner minta ekstraksi gambar kerja dinaikkan setara referensi nyata (2 dokumen
di `Downloads/paax_plhut_extraction_*`, HANYA bahan belajar §0.1 — bukan
template) + UI disederhanakan total (istilah teknis disembunyikan) + PaddleOCR
sungguhan + semua `.md` diselaraskan ulang. Detail lengkap tiap fase:
**`docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`**. Dikerjakan
LANGSUNG oleh Claude (bukan prompt Codex), berurutan tanpa berhenti minta izin
tiap fase (arahan eksplisit owner). **Semua fase 0-H selesai; Fase I (dokumen
ini) sedang berjalan.** Ringkasan hasil NYATA:

- **Fase B (zone classifier)**: `app/perception/zone_classifier.py` — judul
  sheet + skala diekstrak dari teks sungguhan (bukan placeholder generik "Sheet
  N"), zona paket-pekerjaan (substruktur/struktur_lantai_N/struktur_atap/
  detail_tabel) diklasifikasi rule-based dari judul. **Ke-15 sheet PLHUT
  cocok PERSIS** ke judul+skala asli PDF (zona: 13/15 cocok penuh intuisi
  manusia, 2/15 sengaja `detail_tabel` krn judul-nya tak punya kualifier
  lantai/atap eksplisit — kejujuran by-design, bukan bug).
- **Fase C (label→grid binding, §5)**: `app/perception/binding.py` — tiap
  instance elemen diikat ke alamat grid NYATA ("A1") atau notasi offset
  ("B-offset_sebelum_1") dari posisi bbox vs posisi_mm grid. **PC1/PC2/PC3
  PLHUT cocok PERSIS** ke tabel referensi owner. Bug nyata ditemukan+
  diperbaiki: label elemen digeser ~30-35pt dari simbol aslinya (toleransi
  awal 25% jarak-antar-as terlalu ketat, dinaikkan ke 40%).
- **Fase D (deteksi simbol)**: diinvestigasi, DITUNDA JUJUR — bentuk simbol
  footplat PLHUT (kotak+silang+kotak-kecil) terlalu spesifik ke satu konvensi
  drafter untuk digeneralisasi dengan aman dalam sisa waktu sesi ini.
- **Fase E (konsolidasi)**: `app/perception/consolidate.py` +
  `consolidated_models.py` — skema `ConsolidatedExtraction` TETAP (field
  selalu ada) merangkum grid kanonik (dipilih dari sheet terlengkap, konflik
  antar-sheet DITANDAI bukan ditimpa), element registry lintas-zona+tabel,
  assumption ledger, dimensi bangunan. PLHUT: grid 20m×10m benar, 32 kode
  elemen unik, 1078 assumption (mayoritas unclassified — jujur mencerminkan
  cakupan ~36%, bukan bug).
- **Fase F (async job)**: `POST /drawings/analyze/start` + `GET /drawings/
  analyze/status/{job_id}` (FastAPI BackgroundTasks + in-memory, batas: state
  hilang kalau restart — dicatat, cukup utk kematangan app saat ini).
- **Fase G (PaddleOCR nyata)**: `paddleocr` 3.7.0 + `paddlepaddle` 3.3.1
  BERHASIL terpasang & termuat di Python 3.13/Windows. **Temuan jujur**:
  inferensi `.predict()` gagal `NotImplementedError` native (oneDNN) di
  kombinasi OS/CPU mesin ini — adapter diperbaiki utk degradasi anggun
  (fallback manual tetap jalan, tidak meruntuhkan endpoint).
- **Fase H (UI overhaul)**: `tkg-workspace.tsx` dirombak —
  drag-drop+chip lampiran (reuse pola Engineering Chat), tombol "Jalankan
  Persepsi"→**"Analisa Gambar Kerja"**, animasi progres nyata (reuse
  `.pax-thinking`, teks dari `job.progress_message` backend bukan simulasi),
  panel teknis (cakupan%/grammar-pass/kode V-xx) **DIHAPUS dari tampilan
  utama**, diganti **"Review Gambar"**: kartu per-halaman (judul+zona+skala),
  grid&elemen per-zona bahasa manusia ("A1: PC1"), dimensi bangunan dalam
  meter, daftar "Perlu dicek" progresif (preview 12 + expand). Tombol
  **"Generate RAB"** placeholder (disabled, "segera hadir") — SENGAJA belum
  disambungkan, sesuai instruksi eksplisit owner (ekstraksi dulu, RAB nanti).
  **Diverifikasi end-to-end di browser nyata** (bukan cuma vitest): upload
  PDF sintetis via drag-drop asli → job async → Review Gambar tampil dgn
  dimensi bangunan benar (6,3m×7,2m cocok fixture) → simpan hasil → konfirmasi
  tersimpan. Nol error console.

**Angka final (2026-07-05 malam)**: core-engine **238**, document-intelligence
**131**, web **43** — total **412 test hijau**, tidak ada regresi.
**Cakupan real PDF PLHUT (15 sheet): 33,75% → 36,11%** (naik lagi setelah
Fase B/C — bug ditemukan: judul/skala yg sudah "dipakai jadi metadata" masih
salah dihitung unclassified, diperbaiki). **GERBANG-2 MASIH BELUM TUTUP** —
sisa gap: deteksi simbol grafis, beberapa sheet tanpa bubble-grid, V-02..08
core-engine belum diuji ulang dgn pipeline baru.

Investigasi branch (dari sesi sebelumnya): `feat/fase0-plhut-golden-anchor`
(Fase 0 RAB) dan `feat/ui-premium-redesign` (Fase 2 UI+persepsi) **SUDAH
DI-MERGE ke `main`** oleh Codex sebelum sesi ini dimulai (lihat `git log`
commit `d17a67d`/`97161a4`/`38ac2ef`) — working tree SEKARANG langsung di
`main`, bukan lagi branch terpisah. Semua perubahan Fase 0-H sesi ini
**MASIH BELUM DI-COMMIT** (Claude dilarang commit) — prompt Codex baru:
`docs/prompts/PAAX_CODEX_PROMPT_COMMIT_GAMBAR_TEKNIK_SIPIL_2026-07-05.md`.

## ⚠️ DIVERGENSI BRANCH — SUDAH DIINVESTIGASI (2026-07-04 malam), TERNYATA KECIL
`feat/ui-premium-redesign` (branch aktif, UI premium + SEMUA implementasi Fase
2 P1-P6+geometri grid) dan `feat/fase0-plhut-golden-anchor` (commit `1ee7665`,
draft PR #27) adalah SIBLING dari titik cabang yang sama (merge-base `a0b06ca`),
BUKAN satu garis keturunan — dokumen/fixture Fase 0 memang tidak ada di working
tree ini, bukan hilang. **Temuan investigasi (bukan asumsi):**
- Fase 0 HANYA menyentuh 14 file, SEMUA di `services/core-engine/tests/
  fixtures/plhut/*`, `data/harga-satuan/surakarta.json`, dan beberapa docs —
  **TIDAK ADA overlap kode** dengan Fase 2 (`document-intelligence`/`apps/web`).
  **Satu-satunya file yang sama-sama disentuh kedua branch: `docs/ai-map/
  STATE.md`** (konflik teks kecil, gampang diselesaikan manual).
- `gh pr list`: ketiga PR draft (#26 `ui-premium-redesign`, #27 `fase0-plhut-
  golden-anchor`, #28 `fase2-p5-ui-persepsi-review` lama/superseded) berstatus
  `MERGEABLE` ke `main` **secara independen**.
- **Rekomendasi (keputusan owner/Codex, BUKAN dieksekusi Claude — merge = commit):**
  merge PR #27 ke `main` dulu (isinya murni core-engine, tidak menyentuh
  UI/document-intelligence, resiko rendah), lalu commit+push pekerjaan sesi ini
  ke PR #26 dan selesaikan SATU konflik `STATE.md` secara manual saat merge
  PR #26 ke `main` setelahnya. Tidak perlu rebase besar-besaran.

## ⏩ TERBARU (2026-07-04, malam) — Fase 2 P1-P4+P6 DIIMPLEMENTASIKAN LANGSUNG OLEH CLAUDE
- **FASE 0 DI-COMMIT**: commit `1ee7665`, draft PR #27 (belum merge), 238 test
  hijau. Report: `report/REPORT_FASE0_PLHUT_GOLDEN_ANCHOR_CODEX_2026-07-04.md`.
- **Audit pagi** menemukan Codex hanya menjalankan P5 (frontend) dan
  memfabrikasi kode gerbang ad-hoc yang bentrok nama dgn validator resmi brain
  — lihat riwayat di [[roadmap-gambar-ke-rab]] memory / git log sesi ini untuk
  detail insiden & analisis PaddleOCR.
- **KEPUTUSAN OWNER (sore/malam):** Claude mengerjakan LANGSUNG seluruh backend
  Fase 2 (P1, P2, P3, P4, P6) + koreksi konektor frontend — TIDAK via prompt
  Codex. Codex hanya bagian commit (belum dijalankan — semua perubahan di
  bawah masih **UNCOMMITTED** di worktree `feat/ui-premium-redesign`, yang
  tetap jadi satu-satunya branch/worktree aktif, bukan cabang terpisah).
- **HASIL NYATA (bukan rencana lagi):**
  - `services/document-intelligence/app/perception/` dibangun penuh: span
    vektor+rotasi (P1), merge-run fragmen dgn guard method/line/gap-negatif
    (P1), leksikon+grammar notasi struktur §2 (~50 anchor, P2), rekonstruksi
    grid (notasi gabungan eksplisit)+tabel (`page.find_tables()` NYATA,
    bergaris)+elemen (P3), validator V-01/V-06 + gerbang + endpoint
    `/drawings/analyze` diperluas dgn `metrics`/`gerbang` NYATA (P4), adapter
    PaddleOCR raster lazy/opsional + guard vektor-dulu (P6).
  - **document-intelligence: 5 → 92 test hijau** (+1 skip butuh
    `PAAX_PLHUT_PDF`), **core-engine tetap 198** (tak disentuh), **web 41**
    (tkg-workspace dikoreksi baca `metrics`/`gerbang` ASLI dari backend,
    fabrikasi `V-TKG`/`V-COV`/`V-WARN`/`V-CLS` DIHAPUS total, test regresi baru
    memastikan itu).
  - **Diverifikasi end-to-end di browser nyata** (bukan cuma unit test): upload
    PDF sintetis via UI → `/upload` → `/drawings/analyze` → panel menampilkan
    metrics/gerbang ASLI dari backend (cakupan 89.5%, V-01/V-06 lolos,
    V-07/09/10 jujur "belum dievaluasi") — lihat screenshot/network log sesi ini.
  - **Smoke test JUJUR ke PDF PLHUT asli** (bukan golden-match, `test_smoke_
    real_plhut_pdf_does_not_crash`): 15 sheet, **47 table record NYATA** +
    **40 elemen** terekstrak (dulu ~0, semua `unclassified`), cakupan awal
    iterasi ini **16,24%** — peningkatan nyata dari pipeline lama, **BUKAN**
    "GERBANG-2 selesai". Sisa gap terbesar tercatat: rekonstruksi grid dari
    geometri bubble+garis-dimensi (§3.1.1 penuh) BELUM diimplementasikan.

- **✅ SUSULAN MALAM INI: rekonstruksi grid dari GEOMETRI (§3.1.1) selesai**
  (`app/perception/vector/grid_geometry.py`). Deteksi bubble-as (lingkaran
  vektor bezier ATAU poligon-garis, filter kelompok-ukuran dominan supaya
  penanda lain yang kebetulan sejajar tak ikut tertangkap) + Run angka di
  'channel' tegak lurus arah keluarga axis, dengan slot-assignment per
  pasangan-as, offset_tepi (§3.1.1c) dikecualikan dari total, dan total
  HANYA diterima bila cocok penjumlahan bentang (toleransi 1%) — tidak pernah
  dipaksakan. **Nilai acuan diverifikasi ANALITIS manual dari geometri PDF
  PLHUT asli SEBELUM kode ditulis** (lihat investigasi sesi ini): sumbu_x
  1/2/3/4 (posisi 0/5000/7000/10000mm), sumbu_y A-F (posisi 0/4000/8000/
  12000/16000/20000mm), total_x=10000, total_y=20000, offset_tepi 1580 —
  SEMUA cocok persis hasil kode. Diuji JUGA dengan fixture sintetis independen
  berlabel/nilai berbeda (P/Q/R, 3500/2800/4000/3200) untuk membuktikan
  generalisasi, bukan hafalan (§0.1) — `test_perception_grid_geometry.py`,
  7 test baru (termasuk uji "lingkaran kecil kebetulan sejajar tidak boleh
  dianggap keluarga grid baru", ditemukan sbg bug nyata & diperbaiki via
  filter kelompok-ukuran dominan).
  **Hasil ke cakupan real PLHUT (15 sheet): 16,24% → 33,75% agregat** (hampir
  2x lipat, `span_terklasifikasi` 543/1609) — progres terukur jujur, **GERBANG-2
  MASIH BELUM TUTUP** (butuh §5 label→alamat binding + deteksi simbol grafis +
  beberapa sheet 0% karena bukan tipe denah/tak berbubble). document-intelligence
  kini **100 test hijau** (naik dari 92, termasuk smoke PLHUT yg sebelumnya skip).
  - PaddleOCR: kode adapter lengkap + teruji via MOCK (paket `paddleocr`
    SENGAJA belum di-`pip install` — berat, opsional, lazy-import; service
    tetap boot normal tanpa itu, dibuktikan test eksplisit).
- **PaddleOCR — analisis kritis (ringkas):** `G:\paax-data\PaddleOCR-main`
  (v3.7.0, Apache 2.0) API `PaddleOCR.predict()` → `rec_texts/rec_scores/
  rec_boxes` PAS jadi `TextSpan` kedua (`method="ocr"`) mengalir ke pipeline
  SAMA dgn vektor — bukan pipeline terpisah spt diusulkan konsep awal owner.
  Detail lengkap: `docs/plans/PAAX_FASE2_PERSEPSI_PLAN_2026-07-04.md` §P6.1.
- **Dokumen prompt Codex Fase 2 (`docs/prompts/PAAX_CODEX_PROMPT_FASE2_*.md`)
  kini BERSTATUS HISTORIS/SUPERSEDED** — spek di dalamnya sudah diimplementasikan
  langsung oleh Claude, bukan dijalankan Codex. Jangan diserahkan ke Codex lagi.
- **BELUM DIKERJAKAN (prioritas berikutnya):** commit seluruh perubahan
  (Codex, sesuai arahan owner) — termasuk resolusi PR #27 (Fase 0, lihat
  §divergensi branch di atas); binding label↔objek↔alamat §5 (grid sekarang
  sudah ada posisi_mm nyata, jadi ini sekarang MUNGKIN dikerjakan, belum
  dimulai); deteksi simbol grafis (`count_simbol`); garis-as itu sendiri
  belum diverifikasi ulang (grid geometri bertumpu bubble+angka, bukan
  garis); V-02/03/04/05/08 (dijalankan core-engine `validate_tkg`, belum
  diuji ulang dgn TKG hasil pipeline baru — perlu verifikasi lanjutan);
  redesign visual UI (SENGAJA ditunda — akan dikerjakan pakai Opus 4.8,
  bukan sesi ini).

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

## ⚠️ GAP DATA — reality check (2026-07-01)
RUMUS engine benar & terverifikasi, TAPI datanya masih demo:
- Koef AHSP di repo = **DEMO** (`data/ahsp/cipta-karya.sample.json`, 4 item, ditandai "DATA ILUSTRATIF"). Data asli 2.542 item ada di luar repo (`G:\paax-data`, via env `PAAX_DATA_DIR`).
- Harga **±99% kosong** (`semarang.json` = 23 dari 2.456 resource) → HSP/RAB item nyata belum bisa dihitung benar.
- Volume/quantity **100% manual**; drawing→BoQ→RAB (v1.0) **0% dibangun**.
**Rekomendasi urutan:** ground data dulu (AHSP asli masuk sistem + isi harga 1 wilayah/1 tipe rumah sampai 1 RAB utuh + anchor test ke RAB nyata) → SEBELUM bangun baca-gambar. Detail: `Downloads/api.txt` Bagian 15.

## 🧠 Brain v4.1 (2026-07-01) — spek baru, disalin & dianalisis (2026-07-02)
Pemilik repo punya spesifikasi jauh lebih rinci di `G:\brain` (92 rumus takeoff,
model entitas Evidence/Assumption beraudit, spek TKG baca-gambar, 31 skill,
roadmap bergerbang F0–F5). Sudah disalin verbatim ke `docs/specs/brain-v4.1/`
+ dianalisis di `docs/BRAIN_ALIGNMENT.md`. **Kesimpulan kunci: brain
MENGUATKAN urutan yang sudah dikunci di sini** (ground data dulu, v1.0/CV
DITUNDA) — bukan membatalkannya. Yang berubah: ada target ekspansi baru untuk
rumus `services/core-engine/app/geometry/` (lihat EPIC D di bawah), yang aman
dikerjakan sekarang karena murni deterministik & tidak menyentuh CV/vision.

## Berikutnya (ringkas; rencana detail: lihat di bawah)
- **EPIC A — selesaikan v0.9 frontend**: A1 wiring client (Codex) → A2 Gantt UI +
  A3 panel knob (Claude) → wiring (Codex) → A4 narasi AI skenario.
- **EPIC B — Engineering Chat lintas-halaman**: B1 context pack (Codex) → B2 grounding
  → B3 UI chat global (Claude) → B4 tool-calling.
- **EPIC C — fixes**: C1 poles pembulatan 9B (`custom.subtotal`/`labor_cost` → `_r2`), dst.
- **EPIC D — ekspansi rumus takeoff (baru, dari brain v4.1)**:
  D1 ✅ volume beton F-B01–B11 (`geometry/volume.py`, 5 tipe baru) + Evidence
  schema diperkaya. D2 ✅ **sistem TKG hidup (2026-07-02)**: engine `app/tkg/`
  (models+validator V-02/04/05/08+renderer `.tkg.txt`+takeoff beton/bekisting/
  besi F-B/F-C01-C06/F-D01-D05, endpoint `/tkg/*`, 17 test anchor manual) ·
  Zod mirror TKG · route `POST /api/ai/tkg` (AI menyalin→TkgDocument, P-SEC-01)
  · UI `TkgWorkspace` di gambar-kerja (sumber→transkrip→skrip→takeoff→kirim
  volume ke draft RAB) · chat ter-grounding context pack (skrip TKG+draft RAB).
  D3 ✅ **kait + lewatan + pinggang + BBS (2026-07-02)**: F-D02 penuh (kait
  `k_hook_utama x d` per ujung; lewatan `n_lap = ceil(L_bat/l_stock)-1`,
  `lap = n_ld x d`; lewatan dibutuhkan tanpa `n_ld` -> needs_review), F-D04
  pinggang, F-D06 `waste_mode` param|bbs dgn guard AP-16 (dilarang dobel),
  F-D08 BBS (marks + kebutuhan stok + waste nyata per diameter; batang > stok
  dipecah; elemen review tidak menyumbang potongan) + mirror Zod
  (`BbsResultSchema`, param baru) — 8 test anchor manual baru (pytest 134).
  D4+E+F+G ✅ **take-off arsitektur/tanah (2026-07-02)**: paket baru
  `app/takeoff/` (params §Z: TanahParams/DindingParams/ArsitekturParams;
  models; **§F tanah** F-F01/02/03/04/05/07 galian footplat+menerus, urugan
  kembali, urugan pasir/sirtu, buangan+ritase — disiplin bank/gembur/padat
  tak dicampur; **§E finishing** F-E01/02/03/05/07 pasangan+deduksi bukaan
  (all|threshold), plester s_sisi, acian, cat n_lapis, screed; **§G subset**
  F-G01/03/05 pondasi batu belah, penutup lantai+plin, atap miring A/cosθ).
  3 endpoint `/takeoff/tanah|dinding|arsitektur` + mirror Zod + requests.http —
  13 test anchor manual baru (**pytest 147**). Data kurang → needs_review
  (bukan tebakan); faktor tanah default tercatat sebagai assumption.
  Berikutnya: D5 §Z penuh (sisa param confidence/QA), F-F06 pemadatan +
  angkut per kelas jarak, F-G04/G06-G14 (keramik dinding/baja/atap detail/
  MEP), F-C07-C10; UI tabel BBS + form takeoff manual di TkgWorkspace.
  Detail: `docs/BRAIN_ALIGNMENT.md` §4.
- **DIREVISI 2026-07-04/05 (sebelumnya "DITUNDA")**: jalur PERSEPSI VEKTOR
  (baca teks/geometri PDF asli — BUKAN vision-LLM piksel) untuk Gambar→BoQ→RAB
  ternyata TIDAK menyentuh gerbang F0 sama sekali (murni deterministik, tidak
  ada tebakan model) — owner memutuskan mengerjakannya langsung (lihat
  `docs/plans/PAAX_GAMBAR_TEKNIK_SIPIL_BIG_PLAN_2026-07-05.md`), hasil real:
  cakupan PLHUT 0%→33,75%. Yang TETAP ditunda: vision-LLM piksel (foto/scan
  tanpa teks vektor) sbg jalur UTAMA — itu hanya fallback OCR-gagal. Site
  Agent penuh (v2.0) tetap ditunda, tidak tersentuh oleh keputusan ini.

## 🎨 UI Premium Redesign — Medium Grey Glass (2026-07-03) — terverifikasi, menunggu commit Codex
Rombak besar sesuai spek owner (`G:\Design\prompt\PAAX_PLAN_SESI_DESAIN_PREMIUM_2026-07-03.txt`):
- **Tema default Medium Grey** (#A6A6AA) + token **gold/bronze** & palet
  `--chart-1..5` dari brand sheet; light/dark tetap ada, ganti via
  Pengaturan → Personalisasi (swatch "Medium Grey").
- **Glassmorphism** (`.pax-glass` + border gradasi `.pax-glass-edge`):
  nav panel, topbar, modal, drawer, settings dialog, KPI card, dropdown chat.
- **Logo/wordmark PAAX SVG** (`components/brand/paax-logo.tsx`) — rail & panel.
- **Konsolidasi nav (nol menu ganda)**: rail hitam = File/AHSP/Laporan/
  Kolaborasi + gear + akun; panel kaca = Workspace + Modul Proyek + credits.
  `sidebar.tsx` legacy (dead code) DIHAPUS; **Uji RAB dihapus** (halaman +
  menu); `/pengaturan` → redirect + buka dialog terpusat.
- **Dashboard bisnis**: 4 KPI glass + donut status + bar progres + kolom nilai
  RAB + ring health + warning (`components/charts/dashboard-charts.tsx`,
  display-only, komentar Aturan Emas). `formatRupiahCompact` di lib/format.
- **Engineering Chat premium**: riwayat + "Project Percakapan"
  (`lib/chat/chat-history.ts`, localStorage), tombol **+** (GDrive/Gmail
  "segera" + Tambah file/foto), chip lampiran (belum dikirim ke AI — jujur),
  Thinking…/Thinking more…/Thinking almost done… berkedip (`.pax-thinking`).
- Tipografi: tabular-nums untuk semua angka; kurva S recolor token bronze.
- **Restyle drawing-intelligence-workspace.tsx**: 43 titik kelas legacy
  (glass-card/btn-*/badge-*/text-paax-*/input-field/tabel) di-port ke
  Card/Button/StatusPill + token gold; halaman /gambar-kerja-ai &
  /proyek/:id/gambar-kerja diverifikasi nol kelas legacy.
Verifikasi: tsc OK · vitest **30** · build sukses (route /rab-tester hilang) ·
uji interaktif browser (tema, dialog, chat kirim+riwayat, menu +, redirect,
halaman gambar-kerja render TKG workspace + tabel kandidat).
Prompt commit: `docs/prompts/PAAX_CODEX_PROMPT_UI_PREMIUM_REDESIGN.md`
(branch `feat/ui-premium-redesign` dari `main`, draft PR base `main`).

## 🐞 Perbaikan pasca-redesign (2026-07-03) — prompt siap, MENUNGGU Codex
Owner uji PR #26 di browser, catat 14 temuan di `Downloads/perbaikan.txt`.
Claude investigasi root cause tiap poin (bukan tebakan) + tanya-jawab
keputusan arsitektural, hasilnya 2 prompt siap jalan:
- `docs/prompts/PAAX_CODEX_PROMPT_PERBAIKAN_UI_BATCH_2026-07-03.md` — **siap
  dijalankan sekarang** di branch `feat/ui-premium-redesign` (PR #26, masih
  draft): (1) fix hydration mismatch dashboard — root cause: `ProjectsProvider`
  baca `localStorage` sinkron di `useState` initializer
  (`lib/projects/projects-context.tsx:23`); (2) hapus navigasi ganda —
  tab horizontal `proyek/[projectId]/layout.tsx:92-119` duplikat sidebar kiri;
  (3) chat: label "Lainnya"→"Chat" + filter Pinned/Archived (belum ada,
  field baru di `chat-history.ts`) + diagnosis riwayat "hilang" (hipotesis:
  port dev server geser, localStorage per-origin — BUKAN bug kode
  terkonfirmasi); (4) Gambar Kerja AI: gabung 2 halaman jadi 1, TkgWorkspace
  disederhanakan (transkrip/skrip/takeoff mentah **dihapus dari UI** sesuai
  keputusan owner — user hanya lihat status ringkas + Triage + kirim ke RAB),
  upload file dibuat nyata (metadata tersimpan, BELUM dibaca AI).
- `docs/prompts/PAAX_CODEX_PROMPT_AI_MULTIMODAL_LAMPIRAN_2026-07-03.md` —
  **JANGAN jalankan dulu**, menunggu owner isi kotak persetujuan di dalam
  file. Bagian A (lampiran Engineering Chat beneran dibaca Gemini vision —
  aman, tak menyentuh gerbang F0) + Bagian B (opsional: vision MVP utk
  upload Gambar Kerja AI langsung jadi draft TKG — **menyentuh gerbang F0**,
  `BRAIN_ALIGNMENT.md` sudah menggerbang "TKG builder sungguhan" sbg DITUNDA
  menunggu data-grounding + Wizard-of-Oz; owner sudah dikonfirmasi paham
  tensi ini, prompt berisi kotak checklist eksplisit sebelum Codex boleh
  kerjakan Bagian B).

## 🔧 Gambar Kerja AI — upload PDF nyata ke TKG (2026-07-03, sesi lanjutan) — dikerjakan Claude, BELUM di-commit
Owner minta perbaikan langsung (bukan sekadar prompt) untuk "upload gambar kerja
langsung, AI yang membaca" (lihat `Downloads/perbaikan.txt` poin 1-2). Investigasi
menemukan `services/document-intelligence` (commit `ed6f511`, 2026-07-03 pagi,
**tidak tercatat di STATE.md/BRAIN_ALIGNMENT.md sebelumnya** — dokumen itu stale)
SUDAH punya pipeline PyMuPDF nyata (baca teks vektor PDF asli, bukan vision-LLM,
selaras brain-00 RULE-EXT-05 vektor-dulu) tapi **2 bug menghalangi**: (1) endpoint
upload tidak menyimpan file sama sekali, (2) `build_tkg_from_text` menghasilkan
JSON yang TIDAK selaras `TkgDocumentSchema` (Zod) — field `jenis`/`meta` hilang,
`grid` tidak dipecah `bentang_x`/`bentang_y`, dll. Diperbaiki:
- `upload_routes.py` beneran simpan file (dir lintas-platform via `tempfile.gettempdir()`).
- `tkg/builder.py` ditulis ulang selaras skema Zod persis (+ dukungan "GRID Y:",
  + pemetaan klasifikasi→`jenis`) — 4 test baru (pytest **9** total di service ini).
- `drawing_routes.py`: `UPLOAD_DIR` lintas-platform, kirim `classification_confidence` asli.
- Web: `lib/ai/document-intelligence-tkg.ts` (klien baru, validasi Zod sebelum dipakai)
  + `TkgWorkspace` dapat opsi "Unggah PDF gambar kerja" (alternatif, bukan pengganti,
  jalur teks tetap ada) → hasil TKG masuk pipeline validate/render/takeoff yang SAMA
  (tidak ada logika baru di core-engine).
- Bug lain ketemu & diperbaiki sekalian (di file yang sama): key React bentrok di
  daftar Triage saat >1 elemen berbagi kode+work_type+rule_id (mis. beberapa kolom
  K1) — ditambah `alamat`+index ke key.
**Diverifikasi ujung-ke-ujung** (bukan cuma tsc/vitest hijau): PDF sintetis dari
golden fixture → upload nyata → `/drawings/analyze` → `TkgDocumentSchema.safeParse`
sukses → `/tkg/validate` (gate_passed) → `/tkg/takeoff` (6 item, semua needs_review
dgn alasan jujur "tinggi kolom tidak ada") → UI browser menampilkan status+Triage
benar, 0 error konsol setelah fix key.
**JUJUR — batas nyata**: diuji juga dengan PDF gambar kerja ASLI milik owner
(`GAMBAR KERJA PLHUT SURAKARTA.pdf`) — teks hasil PyMuPDF berupa fragmen tersebar
("DENAH FOOTPLAT", "5000", "A", "PC1"...), TIDAK cocok grammar SK-07 (MVP) yang ada
sekarang (baru kenal notasi terstruktur sederhana, bukan grammar brain-00 §2-§5
penuh: leksikon prefiks, merge-run, rekonstruksi grid/tabel dari geometri). Jadi:
pipeline SEKARANG genuinely bekerja & teruji, tapi PDF proyek nyata masih akan
menghasilkan TKG hampir kosong (semua masuk `unclassified`) sampai grammar penuh
dibangun (pekerjaan terpisah, besar — bukan sesi ini).
**Belum di-commit** — sesuai instruksi owner, Claude tidak commit; Codex yang akan
commit (branch `feat/ui-premium-redesign`, sama seperti batch perbaikan sebelumnya).
File berubah: `apps/web/.env.example`, `apps/web/src/components/drawings/tkg-workspace.tsx`,
`apps/web/src/lib/ai/document-intelligence-tkg.ts` (baru),
`services/document-intelligence/app/api/{drawing_routes,upload_routes}.py`,
`services/document-intelligence/app/tkg/builder.py`,
`services/document-intelligence/tests/{test_tkg_builder.py,fixtures/golden_tkg_text_sheet.txt}`.
**Catatan untuk `PAAX_CODEX_PROMPT_AI_MULTIMODAL_LAMPIRAN_2026-07-03.md` Bagian B**:
sebagian premisnya sudah berubah — untuk PDF vektor, jalur deterministik (non
vision-LLM) di atas sudah jalan & TIDAK menyentuh gerbang F0 sama sekali (murni
baca teks PDF, bukan tebakan model). Vision-LLM (Bagian B asli) sekarang relevan
HANYA untuk sheet raster murni (foto/scan tanpa teks vektor) — kasus yang lebih
sempit dari yang dikira sebelumnya.

## ✅ FASE 0 (0a penuh + 0b-parsial harga) SELESAI & TERVERIFIKASI (2026-07-03), prompt Codex siap
Milestone besar terverifikasi ujung-ke-ujung lewat engine ASLI (bukan replika),
**238 passed** (198 lama + 40 baru), tak ada regresi:
- **0a-1 HSP**: `compute_hsp()` reproduksi **32/32 HSP profesional** dari `ALFA.xlsx`
  sheet AHS via `(A+B+C)×(1+OP)`.
- **0a-2 RAB total**: `compute_rab()` reproduksi **grand_total Rp 1.860.078.607**
  deviasi **+0,0009%** (224 baris DKH; 79 ber-AHS dari koefisien, 145 direct).
- **0b-parsial (harga Surakarta NYATA)**: owner authorized (2026-07-03) pakai
  harga di ALFA.xlsx (HARGA BAHAN/DKH/HSP) sbg HSD Surakarta sistem. Dibangun
  `data/harga-satuan/surakarta.json` (112 resource, price book UMUM regional —
  sah per §0.1, bukan fixture). Engine + price book ini mereproduksi RAB PLHUT
  **Rp 1.885.558.837 vs Rp 1.860.078.608 = +1,37%** (dalam ±10%); deviasi
  seluruhnya dari **5 inkonsistensi harga internal ALFA sendiri** (tercatat di
  `alfa_price_conflicts`, auditable RULE-HRG-02). Coverage 100% resource PLHUT.
Fixture + 3 generator + README + 3 test dibuat Claude di `services/core-engine/
tests/{fixtures/plhut/, test_plhut_hsp_golden.py, test_plhut_rab_golden.py,
test_plhut_surakarta_pricebook.py}` + `data/harga-satuan/surakarta.json`.
**Temuan penting**: (a) kode resource ALFA TIDAK andal (M.504 = 2 material beda)
→ fixture PLHUT kunci resource lokal per-analisa; (b) ada file Surakarta SERUPA
di luar repo (`G:\paax-data`, 109 resource, sesi sebelumnya) dgn penomoran kode
BEDA — tak aktif bug (loader pilih satu via env `PAAX_DATA_DIR`) tapi belum
direkonsiliasi, dicatat di gap doc. Prinsip §0.1 dipatuhi penuh. Prompt commit:
`docs/prompts/PAAX_CODEX_PROMPT_FASE0A_HSP_GOLDEN.md` (branch
`feat/fase0-plhut-golden-anchor` dari main; Codex commit, belum di-commit).

## ⚠️ Sisa GERBANG-0b penuh: pemetaan ke katalog AHSP RESMI (2.542 item) — butuh owner
Harga BUKAN lagi penghalang untuk lingkup PLHUT/Surakarta. Sisa: mengikat 112
resource Surakarta + 224 item DKH ke KODE RESMI katalog (`G:\paax-data`, sudah
format engine). Cek nama-persis: baru 21/112 match (kategori upah masuk akal —
kode resmi memang generik per-profesi; kategori bahan perlu pencocokan semantik
SK-19). Brain RULE-AHSP-01 mewajibkan konfirmasi manusia utk kasus ambigu — TIDAK
diotomatisasi diam-diam. Detail + rekomendasi: `docs/plans/PAAX_FASE0B_GAP_HARGA_2026-07-03.md`.
Tidak memblokir Fase 1 (workspace) / Fase 2 (persepsi) — bisa paralel.

## 🗺️ Roadmap "Gambar → RAB benar" (2026-07-03) — analisis mendalam brain, keputusan owner: Fase 0 dulu
Owner minta rencana lengkap sampai gambar nyata → RAB benar sesuai brain.
Claude baca 4 berkas brain penuh + audit repo. Hasil: `docs/plans/PAAX_ROADMAP_GAMBAR_KE_RAB_2026-07-03.md`.
**Temuan inti**: 3 "setengah" sistem beda kematangan — Engine hitung ~70%
(jalan KALAU TKG benar), Data grounding ~40% (AHSP asli 2.542 item ada di
`G:\paax-data` tapi belum tersambung; harga ~4%), Persepsi baca gambar ~20%
(PyMuPDF jalan tapi grammar belum kenal notasi gambar nyata → PDF asli jadi
`unclassified`). Golden anchor `test_plhut_golden.py` = TKG PLHUT **transkrip
TANGAN** (manusia persepsi, engine hitung benar) — membuktikan separuh keras
sudah benar. **Urutan brain (data dulu, baru mata, TXT03 §7/AP-09)**:
FASE 0 tutup GERBANG-0 di PLHUT (data+engine, manusia transkrip → RAB penuh
berharga vs `ALFA.xlsx` manual owner) → FASE 2 tutup GERBANG-2 (persepsi
otomatis = golden transkrip-tangan) → FASE 3-4 tutup GERBANG-4 (gambar nyata →
RAB auditable). Owner PUNYA materi anchor lengkap: PLHUT PDF + RAB manual
`ALFA.xlsx`+`MC 00.xlsx`. **Butuh keputusan owner** (4 hal, lihat §5 dokumen):
setuju urutan Fase 0 dulu? ambang deviasi (usul ±10%)? bantu baca ALFA.xlsx?
konfirm PLHUT proyek golden? Baru lalu Claude pecah Fase 0 jadi prompt Codex 0A–0D.

## Pembagian peran (2026-06-29)
- **Claude** = planning + semua spek/prompt + **UI frontend** + review.
- **Codex** = penyambungan teknis (lib/engine, fetch, state, route AI, backend, engine).

## Git
- Branch utama: `main`. Open PR: **#20 (draft — sistem TKG, branch
  `docs/brain-v4.1-alignment`)**; menyusul PR UI overhaul (stacked di atas #20).
- PR terakhir merged: #19 (dashboard navigation performance).

## Rencana detail (di luar repo)
- Master plan + prompt Codex (A1, B1): file `PAAX_MASTER_PLAN_*` & `PAAX_CODEX_PROMPT_*`
  di folder Downloads owner.
- Konteks lintas-sesi: memory Claude (`MEMORY.md`).
