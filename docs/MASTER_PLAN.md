# PAAX AI — Civil Engineering AI Workspace

**Blueprint Besar v2.0** — Sistem, Arsitektur Teknis, Produk AI, Model Bisnis & Roadmap

> Dari fondasi deterministik (v0.6) menuju workspace AI utuh (v2.0)
> Disusun untuk Wisnu Setyo Aji · Repo: `github.com/Wisnu8aji/paax-ai`
> Status: Draft strategis & teknis untuk direview

> **Inti dokumen ini.** Dokumen ini memperluas Cetak Biru PAAX sebelumnya menjadi rancangan menyeluruh: pipeline gambar→RAB, BoQ, penjadwalan, simulasi skenario, Engineering Chat ter-grounding, AI proaktif (laporan pagi, prediksi material, peringatan keterlambatan), AI Agent otonom, model paket & harga lengkap dengan estimasi biaya, riset kompetitor, serta roadmap rilis bertahap dengan rincian tugas pembangunan. Konsep inti dipertahankan sepenuhnya. **Aturan emas tetap sakral: engine yang menghitung, AI yang menjelaskan.** Setiap saran tambahan diletakkan di Bagian 19 sebagai peningkatan efisiensi tanpa mengubah konsep.

---

## Daftar Isi

1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Prinsip Eksekusi & Aturan Emas](#2-prinsip-eksekusi--aturan-emas)
3. [Visi Produk & Positioning](#3-visi-produk--positioning)
4. [Riset Kompetitor Mendalam](#4-riset-kompetitor-mendalam)
5. [Arsitektur Sistem](#5-arsitektur-sistem)
6. [Pipeline Inti — Gambar menjadi Pemecahan Data, RAB, BoQ & Jadwal](#6-pipeline-inti--gambar-menjadi-pemecahan-data-rab-boq--jadwal)
7. [Modul Produk Lengkap](#7-modul-produk-lengkap)
8. [AI Engineering Chat (Ter-grounding)](#8-ai-engineering-chat-ter-grounding)
9. [AI Proaktif & Tugas Terjadwal](#9-ai-proaktif--tugas-terjadwal)
10. [AI Agent Otonom (Autopilot) — Add-on](#10-ai-agent-otonom-autopilot--add-on)
11. [Model Perhitungan Deterministik (Engine)](#11-model-perhitungan-deterministik-engine)
12. [Strategi Multi-Model & Estimasi Biaya AI](#12-strategi-multi-model--estimasi-biaya-ai)
13. [Rancangan Paket & Harga Langganan](#13-rancangan-paket--harga-langganan)
14. [Unit Economics & Proyeksi Biaya Operasional](#14-unit-economics--proyeksi-biaya-operasional)
15. [Arsitektur Data & Infrastruktur Teknis](#15-arsitektur-data--infrastruktur-teknis)
16. [Roadmap & Rencana Rilis Bertahap](#16-roadmap--rencana-rilis-bertahap)
17. [Rincian Tugas Pembangunan per Versi](#17-rincian-tugas-pembangunan-per-versi)
18. [Risiko, Realita Jujur & Mitigasi](#18-risiko-realita-jujur--mitigasi)
19. [Tambahan (Efisiensi Tanpa Mengubah Konsep)](#19-tambahan-efisiensi-tanpa-mengubah-konsep)
20. [Penutup & Langkah Berikutnya](#20-penutup--langkah-berikutnya)

---

## 1. Ringkasan Eksekutif

PAAX AI adalah workspace berbasis AI untuk insinyur sipil, kontraktor, dan project manager Indonesia. Tujuan utamanya: mengubah data konstruksi tak-terstruktur — gambar kerja, PDF, foto lapangan — menjadi keluaran terstruktur yang dapat dipertanggungjawabkan: pemecahan elemen per-lantai, Bill of Quantities (BoQ), RAB patuh AHSP, jadwal proyek dengan Kurva S, simulasi skenario, dan monitoring portofolio real-time. Di atasnya berdiri lapis kecerdasan: Engineering Chat yang terhubung ke data proyek, AI proaktif yang bekerja terjadwal, dan AI Agent yang dapat mengeksekusi perubahan atas perintah teks.

Dokumen ini memperdalam tiga area yang ditekankan: (a) inti AI — gambar menjadi pemecahan data lalu RAB; (b) kecerdasan proaktif & agen — laporan pagi otomatis, prediksi pembelian material sesuai jadwal, peringatan dini keterlambatan, konsultasi taktis (mis. strategi kerja saat hujan), serta agen yang menyunting RAB/jadwal sendiri; dan (c) model bisnis — tiga paket langganan beserta estimasi biaya, batasan, benefit, dan teknologi API yang dipakai.

> **Tiga pilar yang tidak berubah.**
> 1. **AI bukan kalkulator.** Vision-LLM murni hanya ~60% akurat membaca dimensi gambar teknik. AI dipakai untuk mendeteksi, mengklasifikasi, mengorkestrasi, dan menjustifikasi — angka RAB dihitung mesin deterministik yang di-grounding ke AHSP. Ini sekaligus menghapus ketergantungan template.
> 2. **Moat PAAX adalah lokal.** AHSP (Permen PUPR No. 8/2023 + SE DJBK), bilingual, harga satuan regional. Pemain global buta regulasi biaya konstruksi Indonesia. Di situ posisi PAAX.
> 3. **Bangun bertahap, bukan sekaligus.** Visi besar dieksekusi versi demi versi; setiap rilis bisa didemokan. Inilah disiplin yang menjaga proyek tetap selesai.

---

## 2. Prinsip Eksekusi & Aturan Emas

Dua prinsip ini mengikat seluruh pembangunan — penjaga agar PAAX tidak menjadi "demo ramai fitur tetapi tidak ada yang jalan", pola yang sudah pernah dialami pada v0.4–v0.5.

### 2.1 Aturan Emas — AI Tidak Pernah Menghitung

Setiap angka di RAB, BoQ, jadwal, Kurva S, dan skenario **WAJIB** berasal dari engine deterministik (Lapis 2B). LLM hanya boleh menyentuh angka untuk **MENJELASKAN**, tidak pernah **MENGHITUNG/MENGARANG**. Implikasi konkret:

- Tidak ada perhitungan RAB di frontend (TypeScript). Frontend hanya menampilkan hasil engine.
- Tidak ada LLM di jalur perhitungan. Bila perlu klasifikasi/ekstraksi (gambar→kode AHSP), LLM hanya menghasilkan mapping/usulan; angka tetap dihitung engine.
- AHSP adalah sumber koefisien, bukan template output. RAB dibangun dari koefisien × harga, bukan disalin dari contoh.
- Satu sumber kebenaran tipe data: skema bersama (Zod) selaras dengan model engine (Pydantic). Diubah bersamaan.
- Bahkan AI Agent otonom tunduk pada aturan ini: agen boleh mengubah input terstruktur (volume, item, urutan) lalu memanggil ulang engine, tetapi tidak pernah menuliskan angka hasil sendiri.

### 2.2 Prinsip Bangun Bertahap (Vertical Slices)

Bangun satu alur vertikal sampai benar-benar jalan, baru lanjut. Jangan membangun banyak service paralel setengah jadi. Aturan praktis untuk Claude Code:

- Satu sesi Claude Code = satu task sempit & terdefinisi. Konteks terlalu lebar membuat asisten "lupa" aturan emas.
- Verifikasi kriteria terima tiap task sebelum lanjut. Commit kecil & sering (Conventional Commits).
- Setiap fungsi perhitungan baru wajib disertai test dengan nilai acuan yang dihitung manual.
- Setiap fitur AI baru wajib punya fallback manual: bila AI gagal/ragu, pengguna tetap bisa menyelesaikan pekerjaan.

> **Peran pemilik produk non-coder.** Tidak perlu membaca kode untuk memimpin proyek ini. Per rilis, perannya adalah product owner + penguji: mencoba "skrip demo" yang disediakan, menilai pengalaman & kelengkapan, lalu meminta perbaikan di level produk. Audit teknis (apakah angka dari engine, ada perhitungan terselubung di frontend, test sungguh menguji nilai) dilakukan reviewer teknis. Pembagian peran ini realistis & terbukti untuk founder berbasis ide.

---

## 3. Visi Produk & Positioning

### 3.1 Pernyataan Posisi

> PAAX AI adalah workspace AI untuk tim konstruksi Indonesia yang mengubah gambar dan dokumen proyek menjadi RAB patuh-AHSP, BoQ, jadwal Kurva S, dan keputusan berbasis skenario — dengan setiap angka yang bisa diaudit, bukan dikarang — sekaligus menjadi asisten yang proaktif memantau, memperingatkan, dan membantu mengeksekusi.

### 3.2 Target Pengguna & Job-To-Be-Done

| Persona | Tujuan Utama (JTBD) | Nilai dari PAAX |
|---|---|---|
| Estimator / QS | RAB cepat & akurat dari gambar tanpa berhari-hari takeoff manual | Takeoff + AHSP semi-otomatis; verifikasi ±20% |
| Project Manager | Jadwal realistis & pantau progres dari mana saja | Kurva S otomatis, simulasi skenario, monitoring portofolio, laporan pagi otomatis |
| Kontraktor / Owner | Kontrol biaya & nilai kewajaran penawaran (HPS) | RAB transparan, justifikasi AI, basis HPS, deteksi anomali harga |
| Engineer Lapangan | Lapor progres & diskusi teknis cepat | Upload progres, Engineering Chat terhubung data proyek, mode lapangan |
| Logistik / Procurement | Pastikan material tiba tepat waktu | Prediksi kebutuhan & pengingat pembelian material sesuai jadwal |

### 3.3 Diferensiasi — Mengapa PAAX, Bukan Togal/Kreo/ALICE

- **Patuh AHSP & regulasi Indonesia.** Engine biaya di-grounding ke koefisien Permen PUPR/SE DJBK — tidak dimiliki tool global.
- **Satu workspace, bukan tool terpisah.** RAB + BoQ + jadwal + skenario + monitoring + chat dalam satu konteks proyek.
- **Bilingual (ID/EN)** & memahami istilah teknik sipil Indonesia (AHSP, OH, jalur kritis, bobot, BUK).
- **Harga satuan regional.** Basis harga upah/bahan/alat per daerah, bukan asumsi global.
- **Proaktif & agentik.** Bukan alat pasif: PAAX memantau, memperingatkan, memprediksi material, dan dapat mengeksekusi perubahan.

---

## 4. Riset Kompetitor Mendalam

Peta pemain utama AI konstruksi global dan pelajaran untuk PAAX. **Catatan kejujuran:** rincian fitur/harga disusun dari pengetahuan hingga awal 2026 dan dapat berubah; verifikasi ke sumber resmi sebelum keputusan strategis. Yang lebih penting dari angka pasti adalah pola dan posisi.

### 4.1 Peta Pemain Global

| Tool | Fokus | Pendekatan AI | Pelajaran untuk PAAX |
|---|---|---|---|
| Togal.AI | Takeoff gambar 2D | CV; klaim akurasi tinggi pada denah arsitektur, sebagian besar otomatis | Pola "AI ~80% + verifikasi manusia ~20%" itu standar realistis. Jangan janjikan 100%. |
| Kreo (Caddie) | Takeoff + BoQ/cost plan | Agentic: agen baca gambar, ukur, buat laporan; chat-ke-gambar | "AI operator di dalam software" + chat-ke-gambar layak ditiru. Sisi biaya/regulasi lemah — AHSP jadi keunggulan PAAX. |
| ALICE Technologies | Penjadwalan generatif | Simulasi jutaan skenario; grafik waktu-biaya; objektif optimasi; chat-ke-jadwal | "What-if + grafik waktu-biaya + chat-ke-jadwal" = blueprint langsung modul Skenario PAAX. |
| nPlan | Prakiraan risiko jadwal | Monte Carlo + model dari jutaan jadwal historis | Tambahkan lapis probabilistik (risiko jadwal) di fase lanjut sebagai diferensiasi PM. |
| Buildots | Monitoring progres | CV dari kamera 360° helm; bandingkan ke jadwal otomatis | Inspirasi Monitoring: progres aktual (foto) vs rencana otomatis, deviasi sebagai sinyal dini. |
| Bobyard | AI takeoff & estimating | CV + LLM hitung & review takeoff, chat atas dokumen | Pasar AS ramai — penegasan bahwa celah Indonesia (AHSP) masih kosong. |
| Trunk Tools | Copilot dokumen konstruksi | Agent/RAG atas dokumen, RFI, spesifikasi | Validasi arah Engineering Chat ter-grounding ke dokumen proyek. |
| Autodesk / Procore | Platform inti (BIM, manajemen) | Fitur AI di atas platform mapan | Incumbent kuat di alur besar; PAAX menang di niche lokal + harga + bahasa, bukan head-to-head platform. |

### 4.2 Pelajaran Kunci yang Wajib Diadopsi

- Posisikan sebagai "titik awal yang diverifikasi", bukan hasil akhir yang dipercaya buta. Selalu sediakan UI verifikasi/koreksi.
- Hybrid (CV + LLM), bukan LLM tunggal. Konsensus teknis industri.
- Grafik waktu-biaya + simulasi skenario adalah fitur "wow" paling membedakan di scheduling. Jadikan andalan.
- Chat ter-grounding ke data proyek, bukan chatbot generik.
- Akurasi naik dari koreksi pengguna. Rancang feedback loop sejak awal — sumber moat data jangka panjang.

### 4.3 Celah Pasar yang Diisi PAAX

> **Posisi kosong di pasar.** Tidak ada pemain global yang menggabungkan: takeoff dari gambar + RAB patuh AHSP + BoQ + Kurva S + simulasi skenario + monitoring + AI chat + AI proaktif/agen, dalam satu workspace berbahasa Indonesia dengan harga satuan regional. Di Indonesia, mayoritas RAB masih dikerjakan manual di Excel; sistem resmi (informasi harga/material PUPR, e-Katalog/LPSE untuk procurement) belum menyatu ke alur estimasi-penjadwalan-monitoring berbasis AI. Itulah ruang yang ditempati PAAX.

---

## 5. Arsitektur Sistem

Arsitektur berlapis & modular agar tiap bagian dibangun & diuji terpisah. Empat lapis dengan tanggung jawab yang tidak boleh tertukar, di atas satu lapis data.

**Gambar 1 — Arsitektur empat lapis (representasi blok):**

```
LAPIS 0 — PRESENTASI · Next.js 14 + Tailwind + shadcn/ui
  Dashboard · Workspace · Viewer · Editor RAB/BoQ · Kurva S · Skenario · Chat · Monitoring
─────────────────────────────────────────────────────────────────────────────
LAPIS 1 — ORKESTRASI AI
  Router → Takeoff · Estimation · Schedule · Scenario · Chat · Procurement · Report
  Tool-calling · RAG · Model-agnostic · Scheduler (cron)
─────────────────────────────────────────────────────────────────────────────
LAPIS 2A — PERSEPSI            LAPIS 2B — ENGINE DETERMINISTIK     LAPIS 2C — SITE AGENT
  OCR · CV deteksi elemen ·     Volume · HSP · RAB · Bobot ·        Lapor progres ·
  ukur geometri · skala →       Durasi · Kurva S · Skenario ·       analisa foto ·
  inventaris per-lantai         100% AUDITABLE                      hitung deviasi
─────────────────────────────────────────────────────────────────────────────
LAPIS 3 — DATA
  DB Proyek (Postgres/Firestore) · Object Storage · Vector Store (RAG) ·
  Database AHSP (Permen PUPR 8/2023 + SE DJBK) · Harga Satuan Regional
─────────────────────────────────────────────────────────────────────────────
ATURAN EMAS — AI TIDAK PERNAH MENGHITUNG ANGKA. Semua angka WAJIB dari Lapis 2B.
AI hanya mendeteksi, mengklasifikasi, mengorkestrasi, menjelaskan.
```

### 5.1 Tanggung Jawab Tiap Lapis

| Lapis | Teknologi | Tanggung Jawab | Tidak Boleh |
|---|---|---|---|
| 0 — Presentasi | Next.js 14, TS, Tailwind, shadcn/ui | Seluruh UI | Menghitung angka RAB |
| 1 — Orkestrasi | Node/Genkit, tool-calling, RAG, scheduler | Router + agen, pilih model, panggil engine, tugas terjadwal | Mengarang angka final |
| 2A — Persepsi | Python: OCR + CV + Vision-LLM | Deteksi & ukur elemen, pemecahan per-lantai | Menetapkan harga/biaya |
| 2B — Engine | FastAPI/Python, Pydantic, NumPy | Semua perhitungan deterministik | Memakai LLM untuk aritmetika |
| 2C — Site Agent | Python/TS | Lapor progres, analisa foto, deviasi | Menggantikan verifikasi manusia |
| 3 — Data | Postgres/Firestore, Storage, Vector Store | Data proyek, file, RAG, DB AHSP & harga | Menyimpan rahasia di repo |

### 5.2 Sinkronisasi Skema — Risiko Terbesar Monorepo Lintas-Bahasa

Model data TypeScript (Zod) dan Python (Pydantic) bisa menyimpang dan menimbulkan bug integrasi yang sulit dilacak. Solusi: jadikan paket `schemas` satu sumber kebenaran. Idealnya definisikan skema sekali (JSON Schema), lalu generate Zod & Pydantic darinya. Minimal: ubah keduanya bersamaan & uji parsing contoh respons engine oleh Zod pada tiap perubahan.

---

## 6. Pipeline Inti — Gambar menjadi Pemecahan Data, RAB, BoQ & Jadwal

Inilah jantung PAAX & fokus utama: mengubah gambar kerja menjadi pemecahan elemen per-lantai, lalu RAB patuh AHSP, lalu BoQ dan jadwal — dengan verifikasi manusia di akhir. Alur ini meniru kemudahan "minta RAB ke chatbot", tetapi dikerucutkan, dirapikan, dan dibuat auditable.

**Gambar 2 — Pipeline (alur tahap):**

```
1. UPLOAD GAMBAR — user unggah PDF / CAD / foto denah ke proyek
        ↓
2A. PERSEPSI (CV+OCR) deteksi dinding/kolom/pintu/area + ukur
        →  2B. PEMECAHAN PER-LANTAI  Lt.1: {dinding, pintu, kolom...}; Lt.2: {...}
        ↓
3. KLASIFIKASI → KODE AHSP (Estimation Agent: LLM + RAG) — usul kode + koefisien, BUKAN angka final
        ↓
4. ENGINE DETERMINISTIK → Volume × koef AHSP × harga = HSP → Harga Item → RAB (AUDITABLE)
        ↓
5A. GENERATE BoQ rekap kuantitas per item │ 5B. GENERATE SCHEDULE bobot → durasi → Kurva S + jalur kritis
        ↓
6. VERIFIKASI MANUSIA (±20%) + EDIT MANUAL + EXPORT (Excel/PDF) → koreksi disimpan (feedback loop)
```

### 6.1 Tahap 1–2: Persepsi & Pemecahan Per-Lantai

Gambar diunggah (PDF/CAD/foto). Lapis Persepsi menjalankan OCR (teks, dimensi, legenda, kop) dan deteksi elemen (dinding, kolom, pintu, jendela, area lantai/atap) serta pengukuran geometri dengan penetapan skala (otomatis dari notasi atau manual). Hasil diorganisir per-lantai sebagai inventaris terstruktur, contoh:

| Lantai | Elemen terdeteksi | Kuantitas mentah (CV) | Satuan kerja (engine) |
|---|---|---|---|
| Lantai 1 | Dinding bata 1/2 batu | Σ panjang × tinggi | m² |
| Lantai 1 | Kolom 30×40 | jumlah × tinggi × dimensi | m³ / unit |
| Lantai 1 | Pintu / jendela | jumlah unit per tipe | unit |
| Lantai 1 | Lantai keramik | luas area | m² |
| Lantai 2 | Dinding, kolom, plafon, dst. | (idem, per elemen) | m² / m³ / unit |

> **Kejujuran teknis tentang akurasi.** Membaca gambar teknik padat anotasi adalah bagian TERSULIT dari seluruh sistem. Vision-LLM murni hanya ~60% akurat untuk dimensi; karena itu kita memakai CV terspesialisasi untuk geometri + Vision-LLM untuk konteks/teks, lalu manusia memverifikasi. Targetkan "otomatis ~80% + verifikasi ~20%", bukan 100%. Rancang UI koreksi yang nyaman sejak awal, simpan setiap koreksi sebagai sinyal peningkatan akurasi. Untuk gambar yang tersedia dalam format CAD/BIM (DWG/IFC), akurasi jauh lebih tinggi karena geometri sudah eksak — manfaatkan jalur ini bila ada (Bagian 19).

### 6.2 Tahap 3: Klasifikasi ke Kode AHSP (LLM + RAG)

Estimation Agent memetakan tiap elemen ke kode pekerjaan AHSP yang sesuai (mis. "dinding bata 1/2 batu" → kode AHSP terkait), memakai LLM reasoning + retrieval ke basis pengetahuan AHSP. LLM mengusulkan kode & koefisien acuan; ia tidak menghitung harga. Setiap usulan menyertakan tingkat keyakinan & rujukan AHSP agar dapat diverifikasi.

### 6.3 Tahap 4: Engine Deterministik Menghitung RAB

Engine mengonversi kuantitas mentah ke volume satuan pekerjaan, lalu menghitung HSP dari koefisien AHSP × harga regional, dikalikan volume menjadi harga item, dijumlahkan menjadi subtotal & RAB total. Semua deterministik & auditable (rumus di Bagian 11). Tidak ada angka dari LLM.

### 6.4 Tahap 5–6: BoQ, Jadwal, Verifikasi & Export

- **BoQ:** rekap kuantitas per item pekerjaan, langsung dari takeoff + engine.
- **Jadwal & Kurva S:** engine menghitung bobot, durasi dari produktivitas (OH), urutan/dependensi, lalu Kurva S kumulatif & jalur kritis.
- **Editor & verifikasi:** pengguna menandai item terverifikasi, mengoreksi koefisien/harga/volume; engine menghitung ulang seketika.
- **Export:** Excel/PDF untuk RAB, BoQ, jadwal; koreksi disimpan untuk feedback loop.

---

## 7. Modul Produk Lengkap

Delapan modul inti, masing-masing dengan peran AI vs engine yang tegas. Disusun project-centric dengan dashboard portofolio di atasnya.

| Modul | Deskripsi | Peran AI vs Engine |
|---|---|---|
| M1 — Gambar → BoQ → RAB | Pipeline Bagian 6. Semi-otomatis, auditable. | AI: deteksi, ukur, klasifikasi. Engine: semua angka. |
| M2 — Upload RAB Existing | RAB lama (Excel/CSV/PDF) diunggah untuk dianalisa & jadi dasar jadwal/skenario. | AI: parsing & mapping kolom, deteksi anomali harga. Engine: validasi subtotal/bobot. |
| M3 — Penjadwalan & Kurva S | RAB → bobot → durasi → Gantt + Kurva S + jalur kritis. Drag durasi/urutan. | AI: susun urutan/dependensi awal. Engine: bobot, durasi, Kurva S. |
| M4 — Simulasi Skenario | What-if: crew, shift/lembur, paralel, target percepatan, efisiensi budget. Grafik + narasi. | Engine: kandidat & grafik. AI: narasi & rekomendasi titik efisien. |
| M5 — Engineering Chat | Chat ter-grounding ke data proyek. Bisa menjalankan aksi via tool-calling. | AI: jawab + panggil tools. Engine: semua angka yang dirujuk. |
| M6 — Monitoring Multi-Proyek | Progres lapangan (% selesai, volume, foto) → deviasi vs rencana → dashboard + alert. | AI/CV: estimasi progres dari foto. Engine: Kurva S aktual vs rencana, deviasi. |
| M7 — AI Proaktif & Terjadwal | Laporan pagi, peringatan keterlambatan, prediksi & pengingat material (Bagian 9). | AI: ringkas & narasi terjadwal. Engine: angka deviasi, kebutuhan material, tanggal kritis. |
| M8 — AI Agent (Autopilot) | Eksekusi perubahan RAB/jadwal dari teks, dengan preview & persetujuan (Bagian 10). Add-on. | AI: rencanakan & terapkan perubahan input. Engine: hitung ulang semua angka. |

### 7.1 Catatan Modul 6 — Integrasi Bawahan → Project Manager

Engineer/pelaksana lapangan mengunggah progres harian (foto, % selesai per item, volume terpasang) lewat dashboard mereka. Data ini terintegrasi ke dashboard atasan (project manager), sehingga PM melihat progres seluruh proyek dan seluruh tim secara terkonsolidasi. Tiap unggahan menghasilkan: pembaruan Kurva S aktual, perhitungan deviasi terhadap rencana, dan — bila ada anomali — alert. Hak akses diatur per peran (estimator/PM/lapangan/owner).

---

## 8. AI Engineering Chat (Ter-grounding)

Engineering Chat adalah asisten yang **TERHUBUNG** ke data proyek — bukan chatbot generik. Persis seperti asisten yang dapat membaca berkas yang diunggah ke sebuah ruang kerja, chat ini membaca "memori proyek": RAB, BoQ, gambar, jadwal, progres lapangan, koefisien AHSP. Saat ditanya, ia memanggil tool untuk mengambil data, lalu menjawab dengan rujukan dan, bila perlu, angka dari engine.

### 8.1 Tools yang Dipanggil Chat

| Tool | Fungsi |
|---|---|
| `query_rab` | Ambil item/total/bobot RAB proyek aktif |
| `query_schedule` | Ambil durasi, jalur kritis, status jadwal, Kurva S |
| `lookup_ahsp` | Cari koefisien/aturan AHSP terkait |
| `analyze_drawing` | Rujuk elemen/dimensi dari gambar yang sudah diproses |
| `query_progress` | Ambil progres aktual & deviasi dari lapangan |
| `run_scenario` | Jalankan what-if langsung dari percakapan (engine) |
| `query_materials` | Ambil jadwal kebutuhan & status material |

### 8.2 Contoh Interaksi

> **Konsultasi taktis — strategi saat hujan.** Pengguna: "Diprediksi hujan 5 hari ke depan, pekerjaan apa yang sebaiknya didahulukan agar progres tetap jalan?" Chat memanggil `query_schedule` + `query_progress`, lalu menalar: pekerjaan dalam-ruang/terlindung (pasangan dinding lantai atas yang sudah teratap, instalasi MEP, plesteran interior, fabrikasi pembesian di los kerja) didahulukan; pekerjaan sensitif hujan (pengecoran terbuka, galian, urugan, waterproofing) ditunda/diberi perlindungan. Chat menyajikan urutan yang menjaga jalur kritis tetap aman, dan dapat langsung menawarkan `run_scenario` untuk melihat dampak pergeseran pada Kurva S. Catatan: rekomendasi taktis bersifat saran berbasis data proyek; angka apa pun (durasi, dampak biaya) tetap dari engine.

> **Pertanyaan angka — percepatan.** Pengguna: "Kalau saya tambah 3 tukang di pekerjaan struktur, hemat berapa hari?" Chat → `run_scenario` → engine menghitung → Chat menjawab dengan angka auditable + grafik: "Menambah 3 tukang memangkas N hari, menambah biaya Rp X; titik paling efisien di M tukang."

---

## 9. AI Proaktif & Tugas Terjadwal

Selain merespons saat diminta, PAAX bekerja proaktif lewat tugas terjadwal (cron) yang dijalankan AI Orchestrator. Inilah yang mengubah PAAX dari "alat" menjadi "asisten yang menjaga proyek". Setiap keluaran proaktif tetap menampilkan angka dari engine; AI menyusun & menarasikan.

### 9.1 Laporan Pagi Otomatis

Setiap pagi (mis. 06.00), Report Agent menyusun ringkasan seluruh proyek: progres terkini vs rencana, pekerjaan kemarin & rencana hari ini, hasil monitoring lapangan terbaru, deviasi Kurva S, serta daftar perhatian (item kritis, keterlambatan, material menipis). Dikirim ke dashboard dan/atau email/WhatsApp. Untuk PM, laporan mengonsolidasikan semua proyek dalam satu tampilan.

### 9.2 Peringatan Dini (Early Warning)

- **Keterlambatan:** bila deviasi aktual vs rencana melewati ambang, alert + estimasi dampak ke tanggal selesai (dari engine).
- **Material menipis:** bila stok/volume terpasang menunjukkan material akan habis sebelum pekerjaan selesai, beri peringatan.
- **Jalur kritis terancam:** bila pekerjaan di jalur kritis melambat, tandai prioritas tertinggi.

### 9.3 Prediksi & Pengingat Pembelian Material

Dari jadwal & koefisien AHSP, engine tahu kapan tiap pekerjaan dimulai dan berapa material dibutuhkan. Procurement Agent memetakan kebutuhan material ke linimasa, lalu mengingatkan pembelian dengan tenggang (lead time) di depan. Contoh: pekerjaan pembesian & pengecoran kolom dijadwalkan ~4 minggu lagi; ~2 minggu sebelumnya sistem mengingatkan untuk memesan besi tulangan, beton/semen, dan bekisting dalam kuantitas yang dihitung engine dari volume × koefisien.

| Input | Diolah | Output ke Pengguna |
|---|---|---|
| Jadwal item + tanggal mulai | Engine: kebutuhan material = volume × koef bahan | Daftar belanja per minggu, terkuantifikasi |
| Lead time material (dikonfigurasi) | Mundurkan tanggal pesan dari tanggal mulai | Pengingat "pesan sekarang" tepat waktu |
| Harga satuan regional | Engine: estimasi nilai pembelian | Perkiraan biaya pengadaan per termin |

> **Tetap dalam aturan emas.** Kuantitas & tanggal kritis dihitung engine dari jadwal + koefisien AHSP. AI hanya menyusun, mengingatkan, dan menarasikan. Tidak ada angka kebutuhan material yang "dikarang" LLM.

---

## 10. AI Agent Otonom (Autopilot) — Add-on

AI Agent memungkinkan pengguna memerintah dengan teks dan agen mengeksekusi perubahan pada RAB/jadwal sendiri. Contoh: "Ganti spesifikasi keramik lantai 1 ke 60×60 dan naikkan mutu beton kolom ke K-300", atau "Percepat pekerjaan struktur 1 minggu dan sesuaikan jadwal". Agen menerjemahkan perintah menjadi serangkaian perubahan input terstruktur, memanggil engine untuk menghitung ulang, lalu menyajikan hasilnya.

### 10.1 Cara Kerja & Guardrail Wajib

- Pengguna memberi perintah teks pada konteks proyek aktif.
- Agent menyusun rencana perubahan (item mana, volume/koefisien/urutan apa yang berubah) — usulan terstruktur, bukan angka final.
- Engine menghitung ulang RAB/jadwal/Kurva S dari input baru.
- Agent menyajikan **preview diff** (sebelum vs sesudah) untuk disetujui. Tidak ada perubahan permanen tanpa persetujuan; setiap aksi tercatat di audit log dengan tombol undo.

> **Mengapa add-on terpisah.** Agen multi-langkah memanggil LLM beberapa kali per perintah, sehingga biayanya paling tinggi di antara semua fitur. Karena itu Autopilot dijual sebagai add-on berbasis kredit (metered), bukan default. Ini menjaga margin paket inti tetap sehat sekaligus memberi pengguna kontrol biaya. Guardrail keamanan: selalu preview + persetujuan, audit trail, undo, dan batas cakupan (agen tidak mengubah data di luar proyek aktif). Aturan emas tetap berlaku: agen mengubah input, engine yang menghitung.

### 10.2 Contoh Aksi Bermanfaat

- **Edit RAB dari teks:** ganti item, ubah volume/spesifikasi, tambah/hapus pekerjaan — agen menerapkan lalu engine menghitung ulang.
- **Sesuaikan jadwal dari teks:** percepat/perlambat, paralelkan, geser urutan — engine menyusun ulang Kurva S & jalur kritis.
- **Buat varian** RAB/jadwal sebagai opsi pembanding (mis. "buat versi hemat 10%").
- **Susun draf dokumen** (justifikasi HPS, ringkasan perubahan) dari data proyek.

---

## 11. Model Perhitungan Deterministik (Engine)

Rumus yang dipakai Core Engine. Semua deterministik & patuh kerangka AHSP (Permen PUPR No. 8/2023 + SE DJBK). Ini fondasi yang sudah dibangun & teruji pada v0.6 dan menjadi tujuan akhir seluruh pipeline.

### 11.1 Harga Satuan Pekerjaan (HSP)

```
A (Bahan) = Σ ( koef_bahanᵢ × harga_bahanᵢ )
B (Upah)  = Σ ( koef_upahⱼ × harga_upahⱼ )   ; koef tenaga dalam OH (Orang-Hari)
C (Alat)  = Σ ( koef_alatₖ × harga_alatₖ )
HSP       = ( A + B + C ) × ( 1 + BUK% )     ; BUK = Biaya Umum & Keuntungan
```

### 11.2 Volume ke RAB

```
Harga Item = Volume (V) × HSP
Subtotal   = Σ Harga Item (seluruh item)
RAB Total  = Subtotal + PPN (sesuai ketentuan)
```

### 11.3 Bobot Pekerjaan & Kurva S

```
Bobot Item (%) = ( Harga Item / RAB Total ) × 100%
Progres/periode = bobot item didistribusikan sepanjang durasi (merata/berbobot)
Kurva S = Σ kumulatif progres seluruh item per periode waktu
```

Durasi item dihitung dari produktivitas: total mandays = V × koef_OH; durasi (hari) = mandays ÷ jumlah pekerja efektif. Ketergantungan antar pekerjaan (mis. pondasi sebelum kolom) menentukan urutan, tanggal mulai/selesai, & jalur kritis.

### 11.4 Mesin Simulasi Skenario (What-If)

| Variabel | Yang Dihitung Ulang Engine | Output ke Pengguna |
|---|---|---|
| Tambah crew/tukang | durasi = mandays ÷ pekerja baru; biaya upah; geser Kurva S | Berapa hari lebih cepat? Berapa tambahan biaya? |
| Shift / lembur | produktivitas harian naik; biaya lembur; durasi | Trade-off waktu vs biaya lembur |
| Paralelkan pekerjaan | jalur kritis baru; durasi total | Apakah percepatan aman terhadap dependensi? |
| Target percepatan | kombinasi sumber daya untuk capai target; biaya minimum | Skenario termurah untuk capai target |
| Efisiensi budget | item mana bisa dihemat; dampak ke durasi | Di mana penghematan paling aman |

---

## 12. Strategi Multi-Model & Estimasi Biaya AI

Tidak ada satu model unggul di semua tugas. PAAX memakai beberapa model & merutekan tugas ke yang paling tepat lewat Orchestrator model-agnostic — bila ada model lebih baik/murah, cukup ganti di satu tempat.

### 12.1 Peta Penugasan Model

| Tugas | Jenis Model | Alasan |
|---|---|---|
| Pemahaman dokumen & OCR | Multimodal LLM (vision) + OCR khusus | Konteks panjang, baca PDF/legenda/tabel/notasi |
| Deteksi & ukur elemen | CV terspesialisasi (deteksi objek/garis) | Presisi geometri yang tak bisa diandalkan ke LLM |
| Klasifikasi elemen → AHSP | LLM reasoning + RAG | Perlu penalaran + rujukan basis pengetahuan AHSP |
| Orkestrasi & tool-calling | LLM reasoning | Memilih tool, menyusun langkah, memanggil engine |
| Engineering Chat | LLM + RAG + tools | Jawaban berbasis data proyek |
| Pencarian semantik AHSP | Model embedding | Vektorisasi AHSP & spesifikasi untuk RAG |
| Justifikasi & narasi skenario | LLM reasoning | Mengubah angka engine jadi penjelasan manusiawi |
| Analisa foto progres | Vision-LLM + heuristik | Estimasi % progres & deteksi anomali dari foto |

### 12.2 Estimasi Biaya AI per Operasi (Indikatif)

Untuk merancang harga, kita perlu memahami biaya variabel tiap operasi AI. Angka di bawah indikatif (kasar) dan **WAJIB dikalibrasi ulang** dengan harga model & jumlah token aktual. Engine (perhitungan) praktis gratis; biaya nyata ada pada operasi LLM/vision.

| Operasi | Estimasi biaya variabel |
|---|---|
| Ekstraksi 1 gambar (OCR+CV+vision-LLM) | ≈ Rp 3.500 |
| Klasifikasi → AHSP (LLM+RAG, /proyek) | ≈ Rp 1.800 |
| Generate RAB (engine) | ≈ Rp 5 (hampir nol) |
| Narasi skenario (LLM) | ≈ Rp 600 |
| 1 pesan chat (RAG+tools) | ≈ Rp 350 |
| Laporan pagi (/proyek/hari) | ≈ Rp 900 |
| Agent edit RAB (multi-step LLM) | ≈ Rp 4.200 |

> **Implikasi untuk produk.** Operasi termahal adalah ekstraksi gambar & AI Agent. Keduanya harus dimeter (metered) lewat kuota/kredit agar biaya terkendali & margin terjaga. Operasi murah (chat, narasi) bisa lebih longgar. Pasang caching hasil ekstraksi sejak awal agar gambar sama tidak diproses berulang.

---

## 13. Rancangan Paket & Harga Langganan

Tiga paket inti + satu add-on (AI Agent), dengan struktur batas-untuk-mengontrol-biaya. Harga ilustratif untuk pasar Indonesia dan perlu divalidasi lewat riset pelanggan. Prinsip: paket bawah untuk akuisisi (estimator/freelancer), paket atas untuk tim & PM dengan fitur portofolio & proaktif.

### 13.1 Matriks Paket

| Fitur / Batas | Starter | Professional | Enterprise |
|---|---|---|---|
| Harga (ilustratif) | Rp 149rb/bln | Rp 499rb/kursi/bln | Rp 1,99jt/kursi/bln* |
| Target | Estimator/freelancer | Kontraktor/konsultan kecil | Firma / PM / multi-tim |
| Proyek aktif | 3 | 15 | Tak terbatas (fair use) |
| Ekstraksi gambar / bln | 20 | 100 | 500+ (atau kredit) |
| RAB · BoQ · Export | Ya | Ya | Ya |
| Jadwal & Kurva S | Dasar | Penuh + skenario | Penuh + skenario |
| Engineering Chat | 200 pesan/bln | 1.000 pesan/bln | Tinggi / kustom |
| AI Proaktif (laporan pagi, prediksi material) | — | Hingga 5 proyek | Semua proyek |
| Monitoring portofolio + dashboard PM | — | Terbatas | Penuh (RBAC, multi-tim) |
| Site Agent (progres lapangan) | — | Add-on | Termasuk |
| Kolaborasi (kursi) | 1 | 3 termasuk | Per kursi |
| Dukungan | Komunitas/email | Prioritas | Dedikasi + SLA |
| AI Agent Autopilot | — | Add-on (kredit) | Add-on (kredit) |

\*Enterprise umumnya custom/quote sesuai jumlah kursi & proyek. Pertimbangkan paket tahunan (diskon ~2 bulan) untuk arus kas & retensi.

### 13.2 Add-on: AI Agent Autopilot (berbasis kredit)

- **Model:** kredit (mis. Rp 50rb–300rb/bln paket kredit, atau bayar-per-pemakaian). 1 perintah agen = sekian kredit sesuai kompleksitas.
- **Alasan:** biaya agen tertinggi & bervariasi; metering melindungi margin & memberi kontrol biaya.
- **Termasuk:** edit RAB/jadwal dari teks, varian otomatis, draf dokumen — semua dengan preview, persetujuan, audit, undo.

### 13.3 Ekonomi Paket (Ilustratif)

| Paket | Harga jual/bln | Estimasi biaya AI+infra | Margin kotor |
|---|---|---|---|
| Starter | Rp 149rb | ≈ Rp 35rb | ≈ 77% |
| Professional | Rp 499rb | ≈ Rp 165rb | ≈ 67% |
| Enterprise | Rp 1,99jt | ≈ Rp 720rb | ≈ 64% |

> **Kontrol biaya = kunci margin.** Margin sehat hanya terjaga bila operasi mahal (ekstraksi gambar, agen) dibatasi kuota/kredit. Tanpa metering, satu pengguna berat bisa menghapus margin banyak pengguna ringan. Pasang: kuota per paket, kredit untuk kelebihan, caching ekstraksi, pemilihan model termurah-yang-cukup per tugas, dan dashboard pemakaian per tenant.

### 13.4 Funnel Akuisisi

- Free trial / paket gratis terbatas (mis. 1 proyek, 3 ekstraksi) untuk menurunkan friksi coba.
- "1 RAB gratis dari gambar" sebagai magnet akuisisi — pengalaman "wow" pertama tanpa bayar.
- Upsell natural: Starter → Professional saat butuh skenario/proaktif; → Enterprise saat butuh portofolio/PM.

---

## 14. Unit Economics & Proyeksi Biaya Operasional

Ringkasan sumber biaya & cara mengendalikannya. Tujuannya bukan angka pasti (masih dini), melainkan kerangka berpikir agar harga & batas paket masuk akal sejak awal.

| Sumber Biaya | Pemicu | Strategi Kendali |
|---|---|---|
| LLM (chat, klasifikasi, narasi, agen) | Jumlah & panjang panggilan token | Model termurah-yang-cukup, batasi konteks, cache, kuota/kredit |
| Vision/OCR (ekstraksi gambar) | Jumlah halaman/gambar diproses | Caching, CV self-host untuk geometri, kuota ekstraksi |
| Vector Store (RAG) | Ukuran indeks & query | Indeks ringkas, retrieval terbatas top-k |
| Compute engine | Jumlah perhitungan | Sangat murah; tak jadi bottleneck |
| Storage (gambar/file) | Volume & retensi | Tiering & kompresi; kebijakan retensi |
| Infrastruktur (hosting, DB) | Trafik & data | Serverless/Cloud Run; skala sesuai pemakaian |

> **Tiga aturan biaya yang dipasang sejak awal.**
> 1. **Meter operasi mahal** (ekstraksi gambar, agen) dengan kuota/kredit per paket.
> 2. **Cache agresif:** hasil ekstraksi & retrieval yang sama tidak dihitung ulang.
> 3. **Observability biaya:** dashboard pemakaian token/kredit per tenant agar anomali cepat terlihat.

---

## 15. Arsitektur Data & Infrastruktur Teknis

### 15.1 Tech Stack

| Lapisan | Teknologi | Status |
|---|---|---|
| Frontend | Next.js 14 (App Router), React, TS, Tailwind, shadcn/ui | Pertahankan |
| State/Data FE | React Query / Server Components, Zod | Pertahankan |
| AI Orchestrator | Node/Genkit (model-agnostic), tool-calling, RAG, scheduler | Perkuat |
| Core Engine | Python 3.11+, FastAPI, Pydantic, NumPy | Pertahankan & perdalam |
| Document Intelligence | Python: OCR + CV (deteksi/ukur) + Vision-LLM | Bangun di v1.0 |
| Site Agent | Python/TS: progres & analisa foto | Fase lanjut (v2.0) |
| AI Models | Multimodal LLM (vision/reasoning), CV khusus, embeddings | Multi-model |
| Data | Postgres/Firestore + Object Storage + Vector Store + DB AHSP | Pertahankan |
| Deploy | Cloud Run (services) + Vercel/Firebase (web) | Pertahankan |
| Schemas | JSON Schema → generate Zod & Pydantic | Tambahkan |

### 15.2 Struktur Monorepo (Disempurnakan)

```
paax-ai/
├─ apps/web/                  # Next.js workspace + dashboard
│   └─ app/projects/[id]/     # drawings · rab · schedule · scenarios · chat · monitoring
├─ services/
│   ├─ core-engine/           # FastAPI — perhitungan deterministik
│   ├─ ai-orchestrator/       # router + agents + RAG + scheduler (cron)
│   ├─ document-intelligence/ # OCR + CV + ekstraksi kuantitas (v1.0)
│   └─ site-agent/            # progres lapangan + analisa foto (v2.0)
├─ packages/
│   ├─ schemas/               # JSON Schema → Zod + Pydantic (1 sumber kebenaran)
│   └─ ui/ · constants/ · tsconfig/
├─ data/  ├─ ahsp/  └─ harga-satuan/   # koefisien & harga regional
└─ docs/  (blueprint, ADR, API, MASTER_PLAN)
```

### 15.3 Keamanan & Kepatuhan Data

- Jangan menaruh rahasia/kunci API di repo; gunakan `.env` / secret manager.
- Kepatuhan UU PDP (Pelindungan Data Pribadi) Indonesia; pertimbangkan residensi data dalam negeri untuk pelanggan enterprise.
- RBAC ketat (estimator/PM/lapangan/owner); audit log untuk aksi agen & perubahan data sensitif.

---

## 16. Roadmap & Rencana Rilis Bertahap

Visi besar dieksekusi versi demi versi. Setiap rilis punya satu "aha moment" baru yang bisa didemokan, dibangun di atas rilis sebelumnya tanpa membuang pekerjaan. Estimasi waktu mengasumsikan kerja solo ~20 jam/minggu dengan Claude Code; bila ada kesibukan lain (mis. kursus IBM AI Engineer), kalikan 1,3–1,5×.

| Rilis | Aha Moment | Cakupan Inti | Estimasi* |
|---|---|---|---|
| v0.6 | Engine yang benar | HSP/RAB/Kurva-S deterministik + test + 1 halaman uji | ~1 minggu (hampir selesai) |
| v0.7 | Workspace hidup | Multi-proyek + UI shell + editor RAB + DB AHSP/harga + export | 3–4 minggu |
| v0.8 | AI pertama masuk | Upload RAB Excel + AI mapping kolom + deteksi anomali harga | 3–4 minggu |
| v0.9 | Schedule cerdas | Gantt + jalur kritis + simulator skenario + narasi AI | 4–5 minggu |
| v1.0 | Visi utuh | Gambar→BoQ→RAB + Engineering Chat (RAG+tools) | 3–4 bulan |
| v1.5 | Proaktif & agen | Laporan pagi · prediksi material · Agent autopilot (add-on) | 2–3 bulan |
| v2.0 | Portofolio & lapangan | Monitoring multi-proyek · Site Agent · dashboard PM | 2–3 bulan |

\*Estimasi sengaja konservatif & jujur. v1.0 (vision) adalah lompatan terbesar karena melibatkan CV + service baru; jangan terkejut bila iterasinya panjang. Itu wajar & sudah diantisipasi. **Garis MVP = v1.0** (visi inti gambar→RAB + chat).

---

## 17. Rincian Tugas Pembangunan per Versi

Daftar tugas terurut. Setiap tugas punya kriteria terima; selesaikan & verifikasi sebelum lanjut. Ini turunan langsung untuk prompt Claude Code (satu tugas per sesi).

### 17.1 v0.6 — Deterministic Foundation (selesaikan dulu)

| # | Tugas | Kriteria Terima |
|---|---|---|
| 1 | Selesaikan integrasi API (test end-to-end `/rab/calculate`, `/schedule/s-curve`) | Test integrasi hijau; subtotal/total & titik akhir Kurva S = 100 terverifikasi |
| 2 | Halaman uji RAB manual sederhana (pilih item + volume → RAB + Kurva S) | Halaman memanggil engine; tanpa perhitungan di frontend |
| 3 | Konfigurasi env & skrip dev (engine + web bersamaan) | Satu urutan jelas menjalankan keduanya; env terdokumentasi |
| 4 | Finalisasi: CHANGELOG/README mutakhir; tag v0.6.0 | Repo bersih, semua hijau, siap demo |
| 5 | Amankan UI shell hasil import design ke `_draft_v07/` (untuk dipakai v0.7) | Main route bersih; shell tersimpan, bukan terbuang |

### 17.2 v0.7 — Workspace Hidup

| # | Tugas | Kriteria Terima |
|---|---|---|
| 1 | Database proyek + CRUD (buat/list/edit/hapus) | Multi-proyek berfungsi & tersimpan |
| 2 | Integrasikan UI shell ke route utama (dari `_draft_v07`) | Navigasi & layar inti tampil rapi, terhubung data |
| 3 | Editor RAB per proyek (add/edit/remove item → engine hitung) | Semua angka dari engine; bobot/subtotal benar |
| 4 | Browser DB AHSP + editor harga satuan regional | Cari AHSP, lihat koefisien, ubah harga regional |
| 5 | Export RAB/BoQ ke Excel/PDF | File ter-generate sesuai data engine |

### 17.3 v0.8 — Smart Import (AI #1)

| # | Tugas | Kriteria Terima |
|---|---|---|
| 1 | Upload RAB (Excel/CSV/PDF) + parser struktur standar | RAB terbaca & tampil di editor |
| 2 | AI mapping kolom non-standar → skema PAAX | Kolom Vol/Sat/Harga terpetakan benar; ditinjau pengguna |
| 3 | Validasi konsistensi via engine (subtotal/bobot) | Anomali jumlah tertandai |
| 4 | Deteksi anomali harga vs DB regional + justifikasi AI | Item di atas/bawah wajar tersorot dengan penjelasan |
| 5 | Stand up AI Orchestrator (pertama kali aktif) | Pipeline orkestrasi berjalan; model-agnostic |

### 17.4 v0.9 — Schedule & Scenario

| # | Tugas | Kriteria Terima |
|---|---|---|
| 1 | Gantt interaktif (drag durasi/urutan) + jalur kritis | Perubahan memicu hitung ulang engine |
| 2 | Scenario engine di core-engine (kandidat what-if) | Kandidat & grafik waktu-biaya benar |
| 3 | Panel skenario (crew/shift/target/efisiensi) | Variabel mengubah hasil engine |
| 4 | Scenario Agent (narasi & rekomendasi) | Narasi merujuk angka engine, bukan mengarang |

### 17.5 v1.0 — Vision Release (visi inti)

| # | Tugas | Kriteria Terima |
|---|---|---|
| 1 | Document Intelligence: OCR + CV deteksi elemen + ukur + skala | Deteksi & ukur elemen dari gambar uji |
| 2 | Pemecahan per-lantai (inventaris terstruktur) | Elemen terorganisir per lantai dengan kuantitas |
| 3 | Estimation Agent: klasifikasi elemen → AHSP (RAG) | Usulan kode + keyakinan + rujukan |
| 4 | Viewer gambar + bounding box + UI verifikasi/koreksi | Koreksi mudah; disimpan untuk feedback loop |
| 5 | Engine: dari kuantitas → RAB (auditable) → BoQ + jadwal | Angka konsisten end-to-end |
| 6 | Engineering Chat (RAG + tools) | Jawab dengan data proyek; jalankan skenario dari chat |

### 17.6 v1.5 — Proaktif & Agent

| # | Tugas | Kriteria Terima |
|---|---|---|
| 1 | Scheduler (cron) di Orchestrator | Tugas terjadwal berjalan andal |
| 2 | Report Agent: laporan pagi multi-proyek | Ringkasan terkirim; angka dari engine |
| 3 | Early warning: keterlambatan, material menipis, jalur kritis | Alert muncul pada ambang yang tepat |
| 4 | Procurement Agent: prediksi & pengingat pembelian material | Daftar belanja per minggu + pengingat lead time |
| 5 | AI Agent Autopilot (preview/approve/undo/audit) + metering kredit | Edit RAB/jadwal dari teks aman & terukur biaya |

### 17.7 v2.0 — Portfolio & Field Ops

| # | Tugas | Kriteria Terima |
|---|---|---|
| 1 | Site Agent: upload progres lapangan + analisa foto | Estimasi progres & deviasi dari foto |
| 2 | Integrasi bawahan → dashboard PM (konsolidasi) | PM melihat semua proyek & tim |
| 3 | Dashboard portofolio + alert otomatis | Status on-track/warning/delay + notifikasi |
| 4 | RBAC penuh + audit + (opsional) risiko jadwal Monte Carlo | Hak akses per peran; lapis probabilistik opsional |

---

## 18. Risiko, Realita Jujur & Mitigasi

Bagian ini sengaja jujur. Tujuannya bukan menakut-nakuti, melainkan menyiapkan agar tidak kaget dan tahu apa yang harus disiapkan dari sekarang.

| Risiko | Dampak | Mitigasi |
|---|---|---|
| LLM dipakai menghitung → angka salah/tidak auditable | Tinggi | Aturan emas: semua angka via engine; agen pun mengubah input, bukan menulis angka |
| Akurasi takeoff rendah pada gambar kompleks | Tinggi | Hybrid CV+LLM, UI verifikasi, feedback loop, ekspektasi ~80%, jalur DWG/IFC bila ada |
| Scope terlalu lebar → tidak ada yang selesai | Tinggi | Build vertikal bertahap; satu task per sesi; kriteria terima |
| Skema FE/BE menyimpang | Sedang | Satu sumber kebenaran (JSON Schema → Zod/Pydantic) |
| Biaya AI tidak terkontrol | Sedang | Kuota/kredit, caching, pilih model per tugas (model-agnostic) |
| Regulasi AHSP/harga berubah | Sedang | Versi & update DB terjadwal; mekanisme update sejak awal |
| Founder solo + sambil belajar | Sedang | Rilis bertahap, peran owner+tester, reviewer teknis, satu task per sesi |
| Akurasi estimasi progres dari foto | Sedang | Heuristik + input manual + verifikasi; jangan andalkan foto saja |
| Ketergantungan pada satu vendor model | Rendah | Orchestrator model-agnostic — mudah ganti model |

> **Realita yang harus diterima sejak awal.** Bagian tersulit & paling lama dari seluruh sistem adalah membaca gambar teknik (v1.0). Persiapkan: dataset gambar Indonesia untuk uji, UI verifikasi yang nyaman, dan kesabaran untuk iterasi panjang. Sampai v1.0, sebagian besar nilai PAAX sudah bisa dirasakan lewat jalur manual + Smart Import (v0.7–v0.9) — itulah mengapa urutan ini dipilih: nilai mengalir lebih awal, risiko terbesar ditunda sampai fondasi matang.

---

## 19. Tambahan (Efisiensi Tanpa Mengubah Konsep)

Gagasan yang tidak mengubah konsep melainkan menambah efisiensi, akurasi, atau peluang. Ambil yang cocok; semuanya opsional dan ditempatkan setelah rencana inti.

- **Jalur DWG/IFC (CAD/BIM), bukan hanya gambar raster.** Bila pengguna punya file CAD/BIM, ekstraksi geometri jauh lebih akurat daripada membaca gambar piksel. Tawarkan sebagai "mode akurasi tinggi" — mengurangi beban CV & kebutuhan verifikasi.
- **Confidence scoring + "verifikasi prioritas".** Tampilkan deteksi berkeyakinan rendah lebih dulu agar pengguna memverifikasi yang paling berisiko. Membuat verifikasi ±20% terasa ringan & terarah.
- **Feedback loop terinstrumentasi sejak hari pertama.** Simpan setiap koreksi pengguna (deteksi, klasifikasi AHSP, harga) sebagai data berlabel. Inilah moat jangka panjang: akurasi yang naik seiring pemakaian, sulit ditiru pesaing.
- **Integrasi sumber harga resmi.** Pertimbangkan menarik harga satuan dari sumber resmi/regional (mis. informasi harga PUPR, e-Katalog) secara berkala, dengan versi & tanggal.
- **Paket dokumen tender otomatis.** Hasilkan dokumen justifikasi HPS / berita acara dari data proyek (RAB + AHSP + rujukan regulasi) sebagai keluaran satu klik — sangat bernilai untuk owner/konsultan.
- **Eval harness untuk AI (golden test set).** Kumpulan gambar + RAB acuan untuk mengukur akurasi tiap rilis. Mencegah regresi diam-diam & memberi angka akurasi yang bisa diklaim dengan jujur.
- **Mode lapangan offline/low-bandwidth (PWA).** Untuk Site Agent: antrian unggah saat sinyal lemah, sinkron saat tersambung. Realistis untuk lokasi proyek Indonesia.
- **Round-trip Excel/AutoCAD.** Banyak pengguna hidup di Excel; impor/ekspor mulus (dan kelak add-in) menurunkan friksi adopsi.
- **Observability biaya per tenant.** Dashboard pemakaian token/kredit per pelanggan agar margin nyata terlihat & anomali tertangkap sebelum membakar biaya.
- **Validasi pasar lebih dulu (Wizard-of-Oz).** Sebelum membangun CV mahal, tawarkan "kirim gambar, terima RAB" yang di belakangnya dikerjakan semi-manual dengan engine v0.6–v0.9. Bila ada yang bersedia bayar, risiko teknis tervalidasi sebelum investasi besar.
- **Template & rekomendasi "proyek serupa".** Simpan RAB/jadwal sebagai template; sarankan item dari proyek mirip untuk mempercepat estimasi awal.
- **Lapis risiko jadwal (Monte Carlo) di v2.x.** Seperti nPlan: probabilitas selesai tepat waktu. Diferensiasi kuat untuk PM, tetapi tunda sampai inti matang.
- **Kepatuhan & residensi data (UU PDP).** Penting untuk pelanggan enterprise; siapkan kebijakan privasi & opsi penyimpanan dalam negeri sejak desain.
- **Mobile-first untuk PM.** Tampilan portofolio & alert yang nyaman di ponsel — PM sering memantau dari lapangan, bukan meja.
- **Optionality jangka panjang.** Setelah data & pengguna terkumpul, terbuka peluang (mis. integrasi pengadaan/marketplace material). Catat sebagai arah, bukan prioritas — agar fokus inti tetap terjaga.

---

## 20. Penutup & Langkah Berikutnya

PAAX tidak perlu dibangun ulang dari nol — fondasinya benar. Yang dibutuhkan: memperjelas peran AI, mengganti template dengan analisa nyata, membangun satu alur inti sampai matang sebelum melebar, lalu menambah lapis proaktif & agen di atas fondasi yang teruji. Dengan kerangka ini, visi besar — gambar menjadi RAB & jadwal, workspace, chat ter-grounding, dan asisten proaktif — punya jalur eksekusi yang realistis dan terukur.

> **Langkah konkret minggu ini (sebelum melompat ke fitur AI besar):**
> 1. **Selesaikan v0.6 lebih dulu** — amankan UI shell hasil import design ke `apps/web/app/_draft_v07/` (bukan dibuang, dipakai di v0.7), bersihkan route utama, lalu selesaikan integrasi test API & halaman uji RAB sederhana.
> 2. Jadikan dokumen ini sebagai **MASTER_PLAN** di `docs/`, dan rujuk dari **CLAUDE.md** agar Claude Code di sesi berikutnya tidak overscope.
> 3. **Satu task per sesi Claude Code**, verifikasi kriteria terima, commit kecil. Bawa hasil tiap task untuk direview sebelum lanjut.
> 4. **Tahan godaan membangun v1.0 sekaligus.** Nilai tetap mengalir tiap rilis; risiko terbesar (vision) ditunda sampai fondasi matang.

---

*— Akhir Dokumen — Blueprint Besar PAAX AI v2.0*
