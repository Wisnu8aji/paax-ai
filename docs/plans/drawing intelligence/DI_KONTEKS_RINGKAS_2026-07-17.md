> **STATUS: HISTORICAL/SUPERSEDED** -- lihat [DI_SOURCE_OF_TRUTH.md](file:///G:/paax-ai-main/docs/plans/drawing%20intelligence/DI_SOURCE_OF_TRUTH.md) untuk kondisi terkini

# Konteks Ringkas — Drawing Intelligence

**Tanggal:** 2026-07-17. Dokumen orientasi cepat — baca ini dulu sebelum dokumen lain.
Detail lengkap ada di file yang dirujuk tiap poin.

---

## Apa itu Drawing Intelligence

Pipa: **gambar kerja (PDF) → ekstraksi AI → graf pengetahuan proyek (PCKM) → bisa
ditanya lewat Command Room / dipakai jadi RAB**. Arsitektur resminya L0-L4:

- **L0** Source Registry — dokumen/halaman/hash (immutable)
- **L1** Drawing Evidence (DEM) — hasil ekstraksi per halaman (immutable)
- **L2** Project Knowledge (PCKM) — entitas kanonis, hirarki spasial, snapshot-versioned
- **L3** Serving/Answer — summary views + intent parser + jawaban bersitasi
- **L4** Quantity Bridge — proposal evidence-based → approval manusia → RAB/Core Engine

Sumber lengkap: `PAAX_DRAWING_INTELLIGENCE_MASTER_PLAN_2026-07-16.md`.

---

## Status Backend (per hari ini)

- ✅ Benchmark ground-truth **14/14 PASS** (naik dari baseline 1/8).
- ✅ **Live-tested** lewat Command Room sungguhan (model Lucent + Arete): posisi elemen,
  filter lintas lantai, konflik dimensi, penolakan kalkulasi (Aturan Emas), kejujuran
  level-tak-dikenal — semua benar & bersitasi.
- ✅ 656 test otomatis hijau lintas paket, `tsc` bersih.
- ✅ Upload PDF nyata + ekstraksi DEM + polling status **sudah berfungsi**
  (`POST /drawings/dem/start`, `GET .../status`) — bukan cuma fixture.
- ✅ Endpoint corrections (buat+resolve), review-queue (baca), quantity-readiness (baca),
  summary-views, RAB bridge proposal (buat+resolve) — semua **nyata dan tervalidasi**.
- ❌ **Belum di-PR ke main** — menunggu keputusan owner (gerbang CLAUDE.md §5).
- 🏷️ Label **EXPERIMENTAL** (D13) tetap terpasang sampai diuji di proyek nyata kedua
  (bukan cuma PLHUT).

Sumber lengkap: `report/report_drawing_intelligence/FINAL_READINESS_REPORT_2026-07-17.md`.

---

## Bug Produksi yang Ditemukan & Diperbaiki (sesi hari ini)

Ditemukan saat live-testing Command Room, bukan lewat unit test (mock test tidak
merepresentasikan bentuk asli respons backend):

1. **RBAC identity mismatch** — Command Room kirim `X-User-Id: "command-room-service"`,
   tapi `services/db` cuma mem-bypass RBAC untuk literal `"service-account"`. Akibatnya
   SETIAP query project-graph dari Command Room selalu 403 diam-diam. **Fixed.**
2. **Status field top-level disalahbaca** — backend balikin `status="calculation_required"`
   langsung (bukan `"success"`), tapi tool cuma terima `"success"` sbg sukses. Akibatnya
   pertanyaan volume/biaya selalu dilaporkan "data tidak tersedia" alih-alih diarahkan ke
   Core Engine. **Fixed.**

Keduanya diberi regression test + diverifikasi ulang lewat chat sungguhan.

---

## Status Frontend — Temuan Paling Penting

Ada **dua implementasi UI hidup berdampingan** (pelanggaran diam-diam semangat D9 —
"tidak boleh ada dua source-of-truth tanpa label"):

| | V1 (`components/drawing-intelligence/*.tsx`) | V2 (`.../workspace/`, 30 file) |
|---|---|---|
| Dirender `page.tsx`? | **TIDAK** — kode mati dari sisi routing | **YA** — satu-satunya yang aktif |
| Datanya | **Nyata** — 4 endpoint terhubung, loading/error state benar | **~95% mock statis** (`di-mock-data.ts`) |
| Label ke user | "EXPERIMENTAL" jujur | Tidak ada indikator "ini mock" |

**Gap paling kritis (urutan dampak):**
1. **Tidak ada pemicu sintesis PCKM otomatis** — `synthesize_project_graph()` cuma
   dipanggil dari test/skrip manual, TIDAK PERNAH dari rute HTTP produksi. Ini satu
   lubang yang memblokir SEMUA fitur lain diuji dari upload pengguna sungguhan.
2. **Canvas tidak pernah menampilkan gambar asli** — selalu SVG prosedural dari
   koordinat mock. (Fungsi render PNG-nya SUDAH ADA internal, cuma belum diekspos HTTP —
   ini perbaikan kecil-menengah, bukan bangun dari nol.)
3. **Upload/Analisis/Handoff = simulasi murni** — `File` asli ditangkap lalu dibuang,
   selalu resolve ke fixture 6-sheet yang sama; tombol "Send verified quantities" cuma
   ubah state lokal, tidak ada `fetch` sama sekali.
4. **RAB Bridge buntu setelah approval** — proposal disetujui tapi tidak pernah jadi
   baris RAB draft nyata; `quantity_assumptions` (tabel penuh, migrasi ada) nol endpoint.

Sumber lengkap: `report/report_drawing_intelligence/DI_FRONTEND_BACKEND_GAP_AUDIT_2026-07-17.md`.

---

## Rencana Menutup Semua Gap

Urutan: **Fase 0** (3 potongan backend kecil — auto-sintesis, ekspos image render,
list-sheets — WAJIB dulu, gerbang tunggal) → **Fase 1** (wiring data inti V2, paralel) →
**Fase 2** (wiring alur kerja — analyze/handoff/ask-paax, butuh 2 keputusan desain owner
dulu) → **Fase 3** (RAB Bridge penuh sampai jadi baris RAB nyata — paling sensitif
Aturan Emas, butuh spek+nilai uji manual sebelum kode).

Rekomendasi kunci: **port logika fetch V1 ke V2** (bukan bangun ulang dari nol), lalu
**hapus V1**. 3 keputusan yang perlu owner ambil sebelum Fase 2-3 mulai: tombol vs
otomatis untuk sintesis; unifikasi/label dua jalur import RAB (RAB Bridge baru vs Smart
RAB Import lama); kriteria "ready" quantity apa sudah cukup untuk dikirim ke RAB.

Sumber lengkap: `DI_BIG_PLAN_BACKEND_WIRING_AND_RAB_2026-07-17.md` (folder ini).

---

## Aturan yang Tetap Mengikat (jangan dilanggar di kerja lanjutan)

- **Aturan Emas**: AI/TypeScript tidak pernah menghitung angka final — hanya engine
  deterministik. LLM cuma usulan/klasifikasi, selalu evidence-backed, selalu approval
  manusia sebelum masuk RAB.
- **D8**: commit tidak boleh menyebut AI/model apa pun.
- **D13**: label EXPERIMENTAL bertahan sampai gate integritas + benchmark lulus di
  proyek nyata kedua.
- **Command Room**: hanya Lucent + Arete untuk pengujian (jangan Noir, sesuai instruksi
  owner sesi ini).
