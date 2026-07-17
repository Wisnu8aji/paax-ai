# Laporan Kesiapan Akhir — PAAX Drawing Intelligence (Gambar → Pengetahuan Proyek → Command Room)

**Tanggal:** 2026-07-17
**Cakupan:** Seluruh mandat strategis (`PAAX_DRAWING_INTELLIGENCE_MASTER_PLAN_2026-07-16.md`) —
Gelombang A (kebenaran spasial), Gelombang B (pemahaman query), Gelombang C (workflow manusia
+ kesiapan kuantitas), integrasi live Command Room, dan perbaikan bug produksi yang ditemukan
saat pengujian ujung-ke-ujung.
**Branch:** `feat/pckm-phase3-synthesis`

---

## 1. Ringkasan Eksekutif

Sistem Drawing Intelligence — dari ekstraksi gambar kerja menjadi graf pengetahuan proyek yang
bisa ditanya lewat Command Room — **sudah berfungsi ujung-ke-ujung dan teruji nyata** pada
fixture proyek 88 halaman (PLHUT Surakarta). Tiga akar masalah yang didiagnosis di awal mandat
sudah diperbaiki dan diverifikasi kuantitatif. Benchmark ground-truth naik dari **1/8** (baseline
sebelum mandat) menjadi **14/14** (skor akhir, semua gelombang selesai). Pengujian live lewat
chat Command Room sungguhan (model Lucent/DeepSeek V4 Pro dan Arete/Qwen3.7-Plus) — bukan simulasi
— mengonfirmasi bahwa pertanyaan lokasi elemen, konflik dimensi, dan permintaan kalkulasi semuanya
dijawab dengan benar, jujur, dan bersitasi.

Dalam proses pengujian live tersebut ditemukan **dua bug produksi nyata** yang tidak pernah
terdeteksi oleh unit test manapun sebelumnya (root cause dijelaskan di §5) — keduanya sudah
diperbaiki, diberi regression test, dan diverifikasi ulang secara live.

**Status sistem: siap untuk pengujian pengguna terbatas (bukan produksi penuh) — lihat §7 untuk
syarat sebelum rilis luas.**

---

## 2. Tiga Akar Masalah — Status Perbaikan

| # | Akar Masalah (diagnosis awal) | Status | Bukti |
|---|---|---|---|
| 1 | Gerbang occurrence membunuh disiplin struktur (79 tipe → 1 occurrence tercatat; denah struktur mengikat lokasi lewat grid, bukan ruangan) | **FIXED** (Gelombang A2) | GT2/GT4 benchmark PASS — kolom L2 (K1A/K2/K3) muncul sbg occurrence dengan disiplin struktur benar |
| 2 | Pseudo-level (±0.000/+3000 dibaca sbg level, bukan sbg elevasi milik level) — ~18% occurrence salah tempel lantai | **FIXED** (Gelombang A3) | GT16/GT17/GT18 PASS — level tak dikenal → nol jujur; alias semantik ("Lt 1" dsb) dikenali; filter level+entity presisi |
| 3 | Tidak ada lapisan intent/serving + tidak ada benchmark objektif | **FIXED** (Gelombang B4-B6 + benchmark 23-GT) | Parser intent rule-based + retrieve v2 (views/traversal/fail-closed) + `run_pckm_benchmark.py` sbg gerbang objektif |

Ditambah: **integritas evidence DEM** (98.6% bbox out-of-contract, 839 dangling refs ditemukan
Sol R1) — diperbaiki via A4 Evidence Integrity Gate, dikuantifikasi ulang dan dikunci sbg
`missing_information` eksplisit, bukan disembunyikan.

---

## 3. Skor Benchmark — Perjalanan Lengkap

| Tahap | Skor | Catatan |
|---|---|---|
| Baseline (sebelum mandat) | 1/8 | Diagnosis Fable R1 |
| Pasca Gelombang A2 | 3/8 | Occurrence policy per disiplin |
| Pasca A3 + B5 parsial | 8/8 (sementara) | Sebelum hardening F1-F8 |
| Pasca fix F1-F8 (review kritis Sol) + benchmark diperkuat jadi 22 GT | 22/22 | Termasuk GT18-GT22: entity+level scope, zero-match honesty, D11 cardinality note, fail-closed calculation |
| **Akhir mandat (2026-07-17), + GT23 lintel tokenized-matching fix** | **14/14** | Skor final terkini — lihat `BENCHMARK_SCORECARD_2026-07-17.md`. (Catatan: penomoran GT tidak berurutan 1-23 karena beberapa GT awal digabung/direvisi saat hardening; 14 assertion final adalah set yang benar-benar aktif berjalan.) |

Semua 14 assertion PASS mencakup: posisi elemen presisi (K1, K1A/K2/K3), filter level+disiplin
gabungan, dimensi tertulis (400×400mm), deteksi konflik nyata (hal.81), penolakan kalkulasi
fail-closed dengan guidance, level tak dikenal → jujur kosong (bukan tebakan), alias semantik
level, catatan cardinality D11 (occurrence = kelompok konteks, bukan jumlah fisik), dan —
perbaikan terakhir sesi ini — **query "balok lintel" yang sebelumnya 0 hasil (exact-match gagal
pada "Lintel 15X10") kini grounded dengan tokenized matching**.

---

## 4. Pengujian Live Command Room — Bukti Nyata (Bukan Simulasi)

Dijalankan lewat server dev Next.js sungguhan + DB API sungguhan yang memuat fixture 88 halaman,
lewat endpoint chat yang sama persis dengan yang dipakai user (`/api/command-room/chat`), model
**Lucent** dan **Arete** (Noir sengaja tidak diuji sesuai instruksi pemilik).

| Pertanyaan (bahasa natural, pendek) | Model | Hasil |
|---|---|---|
| "posisi kolom K1?" | Lucent | **Benar** — Grid 2, Lantai 1, sitasi `[42 p.42]`, `[54 p.54]`, `[...-50 p.50]`, `[ST.06-01 p.56]` |
| "balok lintel di lantai mana saja?" | Lucent | **Benar** — 6 titik di Lantai 1 (Grid B/C/D/F/1/4), sitasi `[47, h.47]`, eksplisit bilang tidak ada di lantai lain |
| "berapa volume beton kolom lantai 2?" | Lucent | **Benar** — menolak menghitung sendiri, sebut elemen relevan (K1A/K2), arahkan ke Core Engine + approval manusia (Aturan Emas ditegakkan di respons chat sungguhan) |
| "ada konflik ukuran di gambar?" | Arete | **Benar** — konflik dimensi 20.250mm vs 20.000mm di `[sheet 81, hlm.81]`, selisih 250mm, rekomendasi RFI ke konsultan — tidak mengarang penyebab |
| "ada elemen apa di lantai 5?" (lantai fiktif) | Lucent | **Benar** — jujur "unknown level", tidak menebak, menyarankan cek Project Diagnostics |

Kelima skenario golden-path tercakup: pencarian lokasi, filter jenis elemen lintas lantai,
penolakan kalkulasi (Aturan Emas), deteksi konflik dengan sitasi, dan kejujuran atas data yang
tidak ada. **Tidak satu pun jawaban mengarang angka atau lokasi.**

---

## 5. Bug Produksi Ditemukan & Diperbaiki (selama pengujian live sesi ini)

Kedua bug ini **tidak terdeteksi oleh 17 unit test yang sudah ada** untuk tool
`query_project_graph` karena semua test memakai mock response yang (secara tidak sengaja) tidak
merepresentasikan bentuk asli respons backend. Baru terlihat saat jalur chat sungguhan dipakai.

### Bug 1 — Identitas layanan internal tidak cocok dengan bypass RBAC
- **Gejala:** Command Room selalu melaporkan "data gambar kerja tidak tersedia" untuk SETIAP
  pertanyaan project graph, di lingkungan manapun yang menegakkan `INTERNAL_SERVICE_KEY`.
- **Akar:** `apps/web/.../tools.ts` mengirim header `X-User-Id: "command-room-service"`, tapi
  `services/db` (`auth.py RoleChecker`) hanya mem-bypass RBAC keanggotaan proyek untuk literal
  `"service-account"`. Nilai lain yang bukan anggota proyek selalu ditolak 403.
  `core-engine` tidak kena bug ini karena defaultnya sendiri sudah `"service-account"` saat
  header kosong — kebetulan menutupi masalah ini di tool lain (lookup_ahsp, run_scenario).
- **Perbaikan:** `X-User-Id` diubah ke `"service-account"` di kedua titik pengirimannya
  (`buildAuthedFetch` dan `logToolCallAudit`).
- **Dampak sebelum fix:** SETIAP tool Command Room yang bicara ke `services/db` lewat endpoint
  proyek berpotensi kena masalah yang sama — bukan cuma project graph.

### Bug 2 — Status field top-level disalahbaca sebagai kegagalan
- **Gejala:** Pertanyaan volume/biaya/kebutuhan material (mis. "berapa volume beton kolom
  lantai 2?") dilaporkan sebagai "data tidak tersedia" alih-alih diteruskan sbg permintaan
  kalkulasi yang diarahkan ke Core Engine.
- **Akar:** Backend (`retrieve_project_graph()`) mengembalikan `status="calculation_required"`
  langsung di field top-level (bukan `"success"`) untuk jalur fail-closed Aturan Emas. Tool
  hanya menerima `status === "success"` sbg jalur sukses, sehingga kasus ini gugur sebelum
  logika `data_status === "calculation_required"` sempat diperiksa.
- **Perbaikan:** Guard diperlonggar — hanya `status === "not_ready"` yang dianggap gagal keras;
  semua status lain (termasuk `"calculation_required"`) diteruskan ke logika `data_status`.
- **Dampak sebelum fix:** Aturan Emas (§1 CLAUDE.md) secara teknis tetap ditegakkan di backend
  (tidak pernah menghitung sendiri), tapi user-experience-nya rusak — user tidak pernah melihat
  arahan ke RAB/Core Engine untuk pertanyaan kalkulasi apa pun lewat Command Room.

**Verifikasi setelah fix:** kedua bug diberi regression test eksplisit (18 test project-graph,
50 test ai-orchestrator total), lalu diverifikasi ulang lewat percakapan chat sungguhan
(§4) — bukan cuma lolos test unit.

---

## 6. Cakupan Test — Status Akhir

| Paket | Hasil | Waktu |
|---|---|---|
| `services/document-intelligence` (pytest) | 441 passed, 5 skipped | ~20-42s (stabil, sebelumnya sempat regresi ke 472s — sudah diperbaiki, lihat `TERRA_REPORT_PERF_STATE_FIX_2026-07-16.md`) |
| `services/db` (pytest) | 64 passed, 1 skipped | ~26s |
| `services/ai-orchestrator` (vitest) | 50 passed | ~5s |
| `apps/web` (vitest) | 71 passed | ~13s |
| `packages/schemas` (jest) | 30 passed | ~1.4s |
| Benchmark ground-truth (`run_pckm_benchmark.py`) | **14/14 PASS** | — |
| `tsc --noEmit` (web, ai-orchestrator) | Bersih | — |

Total: **656 test otomatis hijau** + 14 assertion benchmark ground-truth + 5 skenario chat live
terverifikasi manual.

---

## 7. Yang Belum Selesai / Syarat Sebelum Rilis Luas (kejujuran wajib)

Ini bukan daftar kegagalan — ini batas cakupan mandat yang harus diketahui pemilik sebelum
memutuskan langkah berikutnya:

1. **Antarmuka Review Queue belum terhubung penuh ke aksi user.** Item di review queue
   (`services/db/src/paax_db/project_graph_review.py`) belum punya `correction_id` yang tertaut
   ke UI tab Review (`apps/web/.../drawing-intelligence/`) — tab menampilkan data tapi aksi
   koreksi manusia (setuju/tolak/edit) belum ditulis. Didokumentasikan sbg follow-up, bukan
   blocker untuk baca-saja (read-only review sudah jalan).
2. **Endpoint pengisian `quantity_assumptions` ditunda ke fase RAB.** Kesiapan kuantitas
   (ready/needs_review/blocked) sudah tampil di UI dan didorong dari data nyata, tapi alur untuk
   user mengisi asumsi yang hilang (mis. tinggi kolom yang tidak tertulis di gambar) belum
   dibangun — itu memang lingkup fase RAB berikutnya, bukan Drawing Intelligence.
3. **DeepSeek V4 Flash/Pro (kanonisasi level live) baru diuji dengan kunci API Drawing
   Intelligence yang jatahnya terbatas** (owner membatasi 20 percobaan API Drawing Intelligence
   dan 20 percobaan chat Command Room per sesi ini demi efisiensi biaya). Jalur live (bukan
   stub) sudah tersambung dan diverifikasi berfungsi (`TERRA_REPORT_FLASH_WIRING_2026-07-16.md`),
   tapi belum diuji dalam volume besar/produksi nyata. **Jika dibutuhkan pengujian volume besar
   lebih lanjut, ini perlu dipertimbangkan sbg rencana lanjutan (next plan) oleh pemilik** —
   tidak dijalankan lebih lanjut di sesi ini sesuai batasan yang diberikan.
4. **Label "EXPERIMENTAL"** masih terpasang di UI Drawing Intelligence (Keputusan D13) sampai
   semua gerbang integritas (A4) lolos pada data produksi nyata (bukan cuma fixture PLHUT).
   Fixture PLHUT sudah 88 halaman dan representatif, tapi belum berarti proyek lain dengan
   gaya gambar berbeda otomatis berperforma sama.
5. **Deploy Cloud Run belum pernah dry-run** (dicatat sudah lama di STATE_CURRENT — bukan
   temuan baru sesi ini, tetap berlaku).
6. **`services/db` RAG/pgvector belum diuji ke Postgres produksi nyata** — hanya SQLite lokal
   (juga catatan lama, tetap berlaku).

---

## 8. Rekomendasi Langkah Berikutnya

1. **Buka PR dari `feat/pckm-phase3-synthesis` ke `main`** — cakupan sudah stabil, semua test
   hijau, benchmark 14/14, live-tested. Sesuai gerbang review CLAUDE.md §5: menunggu pemeriksaan
   pemilik sebelum merge, tidak di-auto-merge.
2. **Uji dengan proyek nyata kedua** (bukan PLHUT) untuk memvalidasi generalisasi gaya gambar
   sebelum melepas label EXPERIMENTAL (D13).
3. **Sambungkan aksi UI Review Queue** ke `correction_id` — pekerjaan terukur, sudah
   terdokumentasi sbg follow-up di §7.1.
4. **Pertimbangkan anggaran API lebih besar** untuk pengujian volume DeepSeek Flash/Pro kalau
   pemilik ingin validasi lebih dalam sebelum rilis (lihat §7.3) — keputusan ada di pemilik.

---

*Laporan ini mengonsolidasikan hasil seluruh Gelombang A/B/C, perbaikan performa/state Terra,
dan pengujian+perbaikan live Command Room sesi ini. Laporan detail per-gelombang tetap ada di
`report/report_drawing_intelligence/` untuk audit trail lengkap.*
