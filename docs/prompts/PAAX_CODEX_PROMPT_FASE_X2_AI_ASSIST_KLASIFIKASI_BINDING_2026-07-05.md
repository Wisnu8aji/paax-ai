# PROMPT CODEX — Lapisan AI-Assist Klasifikasi/Binding, Slice Pertama: Dimensi Footplat (Fase X2)

> **STATUS (2026-07-05, update sesi yang sama): TIDAK dijalankan oleh
> Codex.** Owner mengubah instruksi setelah prompt ini ditulis: Claude
> mengimplementasikan LANGSUNG (kode berjalan) di sesi yang sama, DAN scope
> diperluas dari 1 slice (footplat, spek di bawah) jadi 2 slice (+ AI-assist
> klasifikasi zona sheet). Prompt di bawah ini TETAP disimpan sbg catatan
> desain slice #1 (sebagian besar diikuti persis), TAPI implementasi nyata,
> keputusan final, dan hasil test yang benar ada di:
> `report-remote/REPORT_FASE_X2_AI_ASSIST_BINDING_CLAUDE_2026-07-05.md`
> (ditandai jelas dikerjakan Claude, BUKAN Codex) dan `docs/ai-map/STATE.md`
> §FASE X2. Jangan jalankan prompt ini via Codex lagi — sudah selesai.
>
> Ditulis Claude, 2026-07-05, atas instruksi owner. Konsep ini BARU
> disepakati owner-Claude sesi ini (bukan hasil analisis sepihak) dan sudah
> ditulis ke seluruh dokumen perencanaan sbg arah resmi project:
> `CLAUDE.md` §1.1, `AGENTS.md` §1.1, `docs/MASTER_PLAN.md` §6.2 & §12.1,
> `docs/BRAIN_ALIGNMENT.md` §4, `docs/ai-map/START_HERE.md`, `docs/ai-map/
> MAP.md`, dan detail penuh di `docs/plans/PAAX_ANALISA_RAB_DARI_GAMBAR_
> BIG_PLAN_2026-07-13.md` §X2. **Baca §X2 di dokumen itu dulu sebelum mulai**
> — prompt ini adalah spek eksekusi dari rencana tersebut, bukan pengganti.

---

## 0. Konteks — kenapa fase ini ada (verifikasi sudah dilakukan Claude)

Sesi ini saya (Claude) memverifikasi `report-remote/REPORT_FASE_X1B_
PACKAGING_BINDING_CODEX_2026-07-05.md` langsung ke kode (bukan percaya
narasinya begitu saja): klaim packaging `paax_schemas` installable **benar**
(grep `sys\.path\.insert|except ModuleNotFoundError` di `services/*/app`
kosong), dan klaim investigasi footplat **benar** (`bridging_tanah.py` baris
91-92 memang mencari alias `b/b_ft/lebar/lebar_bawah` &
`l/l_ft/panjang/panjang_bawah` seperti diklaim). Tidak ada masalah yang
perlu diperbaiki dari X1B — **prompt ini BUKAN perbaikan bug X1B**, ini
kelanjutan yang menangani temuan JUJUR X1B: PDF PLHUT nyata (88 halaman)
menghasilkan **13/13 (100%)** elemen `pondasi_telapak` `perlu_review` karena
dimensinya hanya ada di halaman detail/grafis (kode `PC 1/2/3` + angka
`1500/1300/...` sbg span teks lepas di halaman 49), bukan tabel kode-dimensi
yang bisa diparse `page.find_tables()`.

**Prinsip inti yang WAJIB dipegang** (detail lengkap `CLAUDE.md` §1.1):
rule-based tetap fast-path utama; LLM HANYA dipanggil sbg fallback saat
rule-based sudah gagal/ambigu (`perlu_review`/`belum_didukung`); LLM
membaca teks+koordinat YANG SUDAH DIEKSTRAK PyMuPDF, BUKAN piksel gambar;
setiap usulan LLM WAJIB divalidasi deterministik sebelum jadi kandidat;
TIDAK ADA auto-commit ke input engine — hasil tetap `perlu_review` menunggu
approval manusia; audit trail wajib.

**Kalau task ini akan membuat usulan LLM langsung mengisi `GalianFootplat`
tanpa validasi+gerbang review, STOP — itu pelanggaran Aturan Emas.**

---

## 1. Scope — vertical slice SEMPIT (bukan rewrite semua classifier)

Target HANYA satu kasus konkret yang sudah terbukti gagal di X1/X1B:
elemen kategori `pondasi_telapak` yang keluar `perlu_review` dari
`services/document-intelligence/app/perception/bridging_tanah.py` karena
`dimensi` (`b`/`l`) kosong/tidak lengkap, DAN elemen itu punya halaman
sumber yang terklasifikasi `detail_tabel` oleh `zone_classifier.py`.

**Di luar scope prompt ini (sengaja, jangan dikerjakan)**:
- Menyentuh `zone_classifier.py` atau `binding.py` untuk kasus lain di luar
  footplat — generalisasi ke modul lain menyusul di slice terpisah SETELAH
  pola ini terbukti aman & berguna.
- Klasifikasi AHSP (itu domain Tahap 3 pipeline, TS/`ai-orchestrator`,
  tidak berubah).
- `apps/web/**` — frontend/UI di luar cakupan Codex sesi ini (dikerjakan
  Claude terpisah kalau/ketika modul ini sudah siap dipakai UI).
- Mengubah rumus `app/takeoff/tanah.py` atau engine RAB/HSP lain apa pun.
- Memanggil API Gemini sungguhan di dalam test suite (§4).

---

## 2. Yang harus dibangun

### 2.1 Modul baru `services/document-intelligence/app/perception/ai_assist/`

- `client.py` — interface/protocol client (mis. `AiAssistClientProtocol`
  dengan method `suggest(prompt: str, schema: dict) -> dict | None`) +
  implementasi:
  - `GeminiAiAssistClient` — panggilan REST langsung ke Gemini API
    (model `gemini-2.5-flash`, konsisten dgn `apps/web/src/lib/ai/
    orchestrator.ts`), pakai `GEMINI_API_KEY` dari env (sudah ada di
    `.env.example`, JANGAN buat env var baru), response schema JSON
    terstruktur (bukan free text), temperature RENDAH (mis. 0.1) supaya
    variansi run-to-run minimal.
  - **Cek dulu dependency yang SUDAH ada** di `services/document-
    intelligence` sebelum menambah library HTTP baru (grep import
    `httpx`/`requests` — hasil cek saya sesi ini: BELUM ada satupun
    dipakai di source). **Preferensi: pakai `urllib.request` dari stdlib**
    untuk POST JSON sederhana ini (nol dependency baru) KECUALI kamu
    menemukan alasan konkret kenapa itu tidak cukup (mis. butuh timeout/
    retry yang jauh lebih mudah lewat `httpx`) — kalau menambah dependency,
    catat alasannya eksplisit di laporan (`CLAUDE.md` §2: "jangan tambah
    dependency tanpa alasan jelas").
  - `NullAiAssistClient` (atau `client=None`) — dipakai saat
    `GEMINI_API_KEY` tidak diset. Pipeline utama (`bridging_tanah.py`)
    HARUS tetap jalan normal (fallback ke `perlu_review` biasa, TANPA
    `ai_suggestion`) kalau client ini yang aktif — pola degradasi anggun
    yang SAMA dengan `paddle_ocr_extractor.py` (lazy, tidak meruntuhkan
    endpoint kalau dependency/key tidak ada).
- `dimension_assist.py` — fungsi inti, kira-kira:
  ```python
  def suggest_footplat_dimensions(
      entry: ElementRegistryEntry,
      detail_spans: list[TextSpan],   # span teks+bbox halaman detail_tabel terkait
      client: AiAssistClientProtocol,
  ) -> AiAssistSuggestion | None:
      ...
  ```
  - Bangun prompt dari `entry.kode`/`kode_asli` + SEMUA span teks (teks +
    posisi) pada halaman `detail_tabel` yang relevan (bukan seluruh
    dokumen — batasi konteks token wajar).
  - Minta model kembalikan JSON terstruktur: `{"b_mm": number|null,
    "l_mm": number|null, "d_gali_mm": number|null, "confidence": number,
    "reasoning": string, "source_span_ids": [string]}` (sesuaikan field
    persis ke apa yang dicari `bridging_tanah.py::_first_dim`).
  - **Parsing harus toleran** — kalau model mengembalikan JSON tidak valid/
    field hilang, treat sbg gagal (return `None`), JANGAN crash pipeline.

### 2.2 Validasi deterministik (WAJIB, ini bagian terpenting — bukan opsional)

Sebelum hasil dari 2.1 dianggap kandidat sah, validasi SEMUA berikut. Kalau
GAGAL SATU SAJA, buang hasilnya (return `None`), JANGAN dipaksakan:

1. **Anti-halusinasi angka**: tiap nilai numerik yang diusulkan (`b_mm`,
   `l_mm`, `d_gali_mm`) HARUS cocok (persis, atau dengan toleransi
   pembulatan satuan yang wajar — dokumentasikan toleransinya) dengan salah
   satu teks span mentah yang benar-benar ada di `detail_spans` yang
   dikirim ke model. Kalau model "mengarang" angka yang tak ada di span
   input, TOLAK.
2. **Anti kode asing**: `entry.kode`/kode manapun yang direferensikan model
   HARUS sudah ada di `element_registry` yang dikonsolidasi — tidak boleh
   kode baru yang tidak pernah terdeteksi rule-based.
3. **Rentang nilai wajar**: dimensi footplat dalam mm harus masuk rentang
   masuk akal (tentukan & dokumentasikan batas, mis. 100mm-5000mm) — nilai
   di luar itu (mis. kebetulan menangkap tahun anggaran "2024" atau nomor
   halaman) ditolak.
4. **`source_span_ids` harus tidak kosong** — usulan tanpa rujukan span
   sumber yang bisa ditelusuri balik ditolak (syarat audit trail).

### 2.3 Wiring ke `bridging_tanah.py`

- Saat `_first_dim` tidak menemukan `b_ft`/`l_ft` (atau `d_gali`) DAN
  halaman sumber entry terklasifikasi `detail_tabel` DAN ada
  `AiAssistClientProtocol` aktif (bukan Null) → panggil
  `suggest_footplat_dimensions`.
- Kalau lolos validasi §2.2 → attach ke hasil `perlu_review` sbg field baru
  **`ai_suggestion`** (objek: nilai yang diusulkan + `confidence` +
  `reasoning` + `model` + `source_span_ids` + timestamp). **Status TETAP
  `perlu_review`** — TIDAK PERNAH otomatis mengisi `GalianFootplat` atau
  memanggil `core-engine` dengan nilai usulan ini tanpa approval eksplisit
  (mekanisme approval/UI itu sendiri di luar scope prompt ini — cukup
  expose datanya lewat API, jangan bangun UI approval sekarang).
- Kalau gagal validasi / tidak ada client aktif / bukan halaman
  `detail_tabel` → perilaku SAMA PERSIS seperti sebelum X2 (tidak ada
  regresi ke jalur `perlu_review` biasa).

### 2.4 Schema — Pydantic + Zod mirror (WAJIB bersamaan, `CLAUDE.md` §1)

- Tambah model Pydantic `AiAssistSuggestion` (field sesuai §2.1/§2.3) di
  `services/document-intelligence` — expose lewat response
  `/drawings/tkg/work-items` (atau endpoint bridging yang relevan, cek
  struktur response yang sudah ada dulu).
- Mirror ke Zod di `packages/schemas` (pola yang sama dgn
  `DrawingWorkItemSchema` Fase W) — field opsional (`ai_suggestion?`),
  TIDAK mengubah shape field lain yang sudah ada. `pnpm build` di
  `packages/schemas` setelah perubahan.

---

## 3. Fixture & test (WAJIB, ini bukti utama slice ini bekerja)

- **Fixture sintetis independen** (kode & angka BERBEDA dari PLHUT,
  konsisten §0.1/§0.2 "PLHUT = fixture bukan template") yang mensimulasikan
  halaman `detail_tabel` dgn span kode+angka lepas mirip pola PLHUT halaman
  49 (mis. kode buatan `"PZ1"`, `"PZ2"` + angka buatan berbeda dari
  1500/1300/dst PLHUT).
- **Test pakai FAKE/stub client** (`FakeAiAssistClient` yang mengembalikan
  JSON tetap, tidak memanggil jaringan) — test suite TIDAK PERNAH memanggil
  Gemini API sungguhan (gratis, cepat, deterministik). Minimal:
  1. Kasus sukses: span punya angka yang jelas → `ai_suggestion` terisi,
     `confidence`+`reasoning`+`source_span_ids` ada, status entry TETAP
     `perlu_review` (bukan `dihitung`).
  2. Kasus anti-halusinasi: stub client mengembalikan angka yang TIDAK ADA
     di span input → hasil ditolak (`ai_suggestion` = `None`/tidak ada).
  3. Kasus kode asing: stub mengembalikan kode yang tidak ada di registry
     → ditolak.
  4. Kasus rentang tidak wajar: stub mengembalikan angka di luar rentang
     wajar (mis. "2024") → ditolak.
  5. Kasus tanpa client aktif (`GEMINI_API_KEY` tidak diset /
     `NullAiAssistClient`) → perilaku identik dgn sebelum X2, tidak crash.
  6. Kasus regresi: elemen yang SUDAH `dihitung` sebelum X2 (dimensi
     lengkap dari rule-based) TIDAK terpengaruh sama sekali oleh kode baru
     ini (ai_assist tidak dipanggil kalau rule-based sudah berhasil).
- **Real integration test (opsional, terpisah dari suite utama)**: kalau
  mau menguji `GeminiAiAssistClient` sungguhan, gate di belakang env var
  (mis. skip kalau `GEMINI_API_KEY` tidak diset saat test dijalankan) —
  pola sama dgn test PLHUT PDF asli yang butuh `PAAX_PLHUT_PDF`. JANGAN
  jadikan ini bagian dari `pytest` default yang jalan di CI (biaya + perlu
  API key rahasia).
- Jalankan FULL suite: `services/core-engine` pytest, `services/document-
  intelligence` pytest, `packages/schemas` build+jest, `apps/web` vitest +
  `pnpm tsc --noEmit` — laporkan angka before/after, pastikan TIDAK ADA
  regresi di test yang sudah ada.

---

## 4. Pembagian kerja, commit, gerbang review (SAMA seperti fase sebelumnya)

- **Codex**: seluruh §2-§3 (backend Python, schema Pydantic+Zod mirror,
  test). Commit HANYA oleh Codex, boleh jalan tanpa minta approval tiap
  langkah kecil (pola sesi sebelumnya).
- **TANPA `Co-Authored-By`/signature AI apa pun di commit manapun.**
- **Claude**: UI approval/review untuk `ai_suggestion` (kalau nanti
  dibangun) sepenuhnya di luar cakupan Codex — JANGAN sentuh `apps/web/**`
  sama sekali di prompt ini.
- **Gerbang review**: branch BARU dari `main` (fitur ini independen dari
  X1/X1B yang sudah PR terpisah, JANGAN numpuk di branch
  `feat/fase-x1b-packaging-binding-footplat`) — mis.
  `feat/fase-x2-ai-assist-dimensi-footplat`. Push, buka PR **draft** ke
  `main`. **JANGAN merge sendiri.**

---

## 5. Laporan WAJIB — `report-remote/`, JANGAN hapus/timpa riwayat lama

Nama file baru: `report-remote/REPORT_FASE_X2_AI_ASSIST_BINDING_CODEX_
<tanggal-eksekusi-nyata>.md`. **JANGAN edit/hapus report lama** (semua file
`REPORT_FASE_*` yang sudah ada di `report-remote/`).

Isi wajib:
1. Ringkasan modul `ai_assist/` yang dibangun (file baru, keputusan desain
   HTTP client & kenapa — stdlib vs library baru).
2. Bukti konkret validasi deterministik bekerja (kutip 1 contoh kasus
   anti-halusinasi/kode-asing/rentang yang DITOLAK dgn output test-nya).
3. Konfirmasi eksplisit: `ai_suggestion` TIDAK PERNAH otomatis mengisi
   `GalianFootplat`/memanggil `core-engine` tanpa approval — tunjukkan baris
   kode yang membuktikan ini (bukan cuma klaim).
4. Hasil test lengkap (semua service, before/after jumlah test).
5. **Daftar commit sesi ini, TIAP commit sertakan output MENTAH**
   `git log -1 --format="%H%n%s%n%n%b" <sha>` (SHA, judul, badan lengkap
   apa adanya, supaya bisa diverifikasi tidak ada trailer AI tersembunyi).
6. Link PR + status (draft, base branch).
7. Pending untuk slice berikutnya (generalisasi ke `zone_classifier.py`/
   `binding.py` lain, integrasi real API key end-to-end, dsb — jangan
   kerjakan sekarang, cukup dicatat).

---

## 6. Yang TIDAK boleh dilakukan (tegas)

- Jangan biarkan `ai_suggestion` (atau turunannya) masuk ke input
  `GalianFootplat`/`core-engine` tanpa gerbang review manusia — ini
  pelanggaran Aturan Emas kalau terjadi diam-diam.
- Jangan panggil API Gemini sungguhan di dalam test suite default/CI.
- Jangan generalisasi ke `zone_classifier.py`/`binding.py`/kategori takeoff
  lain di luar `pondasi_telapak` — itu slice berikutnya, bukan sekarang.
- Jangan tambah dependency Python baru tanpa alasan eksplisit di laporan.
- Jangan sentuh `apps/web/**`, jangan ubah rumus `app/takeoff/tanah.py`.
- Jangan merge ke `main` sendiri, jangan hapus/timpa file di
  `report-remote/`, jangan sertakan `Co-Authored-By`/signature AI di commit
  manapun.
