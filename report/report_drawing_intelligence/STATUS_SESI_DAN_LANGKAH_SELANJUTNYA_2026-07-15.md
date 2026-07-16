# Status Sesi & Langkah Selanjutnya — DEM/PCKM Drawing Intelligence

**Tanggal:** 2026-07-15
**Branch:** `feat/command-room-model-overhaul` (belum di-push/PR/merge)

---

## Apa yang Sudah Selesai Sejauh Ini

### Fase 0+1 — Skema DEM/PCKM (selesai, teraudit)
Skema Pydantic+Zod untuk `DrawingEvidenceSheet` (DEM, per-halaman) dan `ProjectGraphNode/Edge/Snapshot` (PCKM, graf proyek) — dikerjakan Codex, diaudit dan diverifikasi ulang oleh saya secara independen. Bersih.

### Fase 2 — DEM Job Orchestrator (selesai, teraudit, 2 bug diperbaiki)
Mesin yang benar-benar memanggil AI vision per halaman dan menyimpan hasilnya — dikerjakan Codex, saya audit mendalam dan temukan 2 bug nyata:
1. Halaman yang gagal sementara (`retry_wait`) tidak pernah benar-benar dicoba ulang — run tetap dilaporkan "selesai" padahal ada halaman terbengkalai.
2. Test resume memakai kode kunci palsu sehingga tidak benar-benar membuktikan halaman yang sudah selesai di-skip saat dilanjutkan.

Keduanya sudah diperbaiki dan di-commit (`197f8bb`, `67e0aff` — Claude commit sendiri sesuai instruksi khusus untuk perbaikan bug ini saja).

### Uji Nyata 88 Halaman PLHUT (selesai, 0 gagal)
Setelah skema+mesin siap, dijalankan uji sungguhan dengan Qwen3.7-Plus terhadap fixture PLHUT 88 halaman. Prosesnya sendiri melalui beberapa putaran perbaikan nyata:

- **Percobaan awal gagal total** — model mengarang struktur JSON sendiri karena prompt cuma menyebut nama skema tanpa bentuk konkret. Diperbaiki dengan `response_format: json_schema` (memaksa bentuk output secara struktural di level API, bukan cuma instruksi teks).
- **Ditemukan bug tersembunyi:** parameter mematikan mode "berpikir" (`extra_body.enable_thinking`) ternyata diam-diam diabaikan oleh provider — diganti ke parameter yang benar-benar berfungsi (`reasoning: {"enabled": false}`). Dibuktikan lewat uji perbandingan langsung: mode reasoning ON menghasilkan ekstraksi 2,5x lebih sedikit dengan biaya 2,5x lebih mahal — jadi mematikannya menguntungkan di dua sisi.
- **Ditemukan masalah cakupan:** uji pertama terhadap halaman legenda material hanya menangkap 25% kontennya (bagian header berulang tertangkap, tapi 20+ item legenda material terlewat total). Diperbaiki dengan menambahkan checklist 13 kategori observasi eksplisit + contoh nilai isi (few-shot) ke dalam prompt — hasil ekstraksi naik 112% (76→161 evidence) di halaman uji yang sama.
- **88 halaman dijalankan sekali** (sesuai otorisasi Anda) — mula-mula sekuensial, lalu dipercepat jadi 4 halaman paralel di tengah jalan atas permintaan Anda. Satu halaman sempat gagal karena koneksi jaringan terputus (`IncompleteRead` salah diklasifikasi sebagai kegagalan permanen) — bug ini diperbaiki dan halaman itu diproses ulang sendiri (bukan mengulang seluruh 88 halaman), berhasil di percobaan pertama.
- **Setelah semua 88 halaman selesai**, saya analisa kualitas datanya secara menyeluruh (bukan cuma menghitung jumlah) dan menemukan 2 masalah kualitas nyata:
  - 21,8% referensi bukti (`evidence_refs`) menunjuk ke ID yang tidak pernah benar-benar dibuat.
  - 97% halaman memakai koordinat piksel mentah, bukan format ternormalisasi 0-1 yang seharusnya.

  Isi faktanya sendiri (dimensi, kode elemen, klasifikasi disiplin) tetap akurat — yang bermasalah adalah jejak audit visualnya. Kedua masalah sudah diperbaiki di prompt untuk ekstraksi berikutnya, **tapi 88 halaman yang sudah selesai TIDAK diproses ulang** sesuai batas yang Anda tetapkan (hanya 1x jalan).

**Detail lengkap ada di:** `report/report_drawing_intelligence/LAPORAN_88_HALAMAN_PLHUT_2026-07-15.md`
**Data mentah tersimpan di:** `report/report_drawing_intelligence/dem_extraction_88pages/pages/` (88 file JSON)

### Riwayat Git Dibersihkan
Atas permintaan eksplisit Anda, 28 commit lama dengan trailer `Co-Authored-By: Claude` (plus 6 kutipan yang sama di isi file dokumentasi lama) sudah dihapus dari riwayat git — dilakukan dengan hati-hati (backup penuh dibuat dulu, diuji di clone terpisah sebelum diterapkan ke repo asli, tervalidasi tidak ada perubahan pada isi file/kode yang sedang berjalan). Semua commit baru sesi ini (7 commit terakhir) murni atas nama Anda, tanpa atribusi AI apapun.

---

## Total Perubahan Kode Sesi Ini (7 commit baru)

```
e0b6b35 fix(doc-intel): require normalized 0-1 bbox coordinates explicitly in Qwen prompt
1ca1e44 fix(doc-intel): make evidence_refs-to-evidence[] contract explicit in Qwen prompt
524ffc3 fix(doc-intel): classify http.client.IncompleteRead as transient in Qwen adapter
d3ab55d fix(doc-intel): make Qwen DEM prompt name coverage checklist explicitly
67e0aff fix(doc-intel): use working reasoning-disable parameter for Qwen DEM calls
dec0c36 fix(doc-intel): switch Qwen DEM extraction to JSON Schema-constrained output
ab6eff5 fix(doc-intel): redrive retry_wait pages and verify resume idempotency with real hash
```

Semua test lolos (329 passed, 5 skipped, 0 gagal). Belum ada push/PR/merge — semua masih di working branch lokal.

---

## Yang BELUM Dikerjakan (Ada di Working Tree, Belum Di-commit)

Selain kode DEM yang sudah dibahas, ada beberapa perubahan dari sesi-sesi sebelumnya yang masih menunggu keputusan Anda, belum di-commit sama sekali:
- Pengarsipan jalur lama TKG drawing-analysis (`drawing_routes.py` dan file terkait sudah dipindah ke `G:\paax-cleanup-archive\`, dihapus dari `main.py`)
- Beberapa dokumen plan/prompt/laporan dari sesi-sesi sebelumnya (Fase 0-1, Fase 2 instruksi Codex, dll)
- Slot API key `DEM_EXTRACTION_*` di `.env.example`/`.env.local`

Ini semua bukan pekerjaan baru — sudah ada dari sesi-sesi sebelumnya dan tetap menunggu Anda putuskan kapan mau di-commit (oleh Codex, sesuai aturan pembagian kerja yang sudah disepakati).

---

## Langkah Selanjutnya — Fase 3: PCKM Synthesis Engine

Ini fase berikutnya sesuai rencana besar (`docs/plans/drawing intelligence/PAAX_DEM_PCKM_GRAPH_COMMAND_ROOM_PLAN_2026-07-14.md`). Brainstorming untuk fase ini **sempat dimulai lalu dihentikan** karena kita putuskan lebih baik tunggu data ekstraksi nyata dulu — sekarang datanya sudah ada (88 halaman PLHUT), jadi bisa dilanjutkan dengan dasar yang solid.

**Yang akan dikerjakan di Fase 3:** mesin yang mengambil 88 `DrawingEvidenceSheet` (hasil per-halaman yang sudah ada) dan menggabungkannya jadi satu `ProjectGraphSnapshot` — peta pengetahuan proyek yang menghubungkan elemen yang sama di halaman berbeda (mis. "kolom K1 di halaman 12" dan "kolom K1 di halaman 49" dikenali sebagai objek yang sama), bukan sekadar tumpukan catatan per-halaman yang terpisah.

**Yang perlu diputuskan pertama kali saat Anda siap lanjut:**
1. Bagaimana cara mengenali objek yang sama di halaman berbeda ("cross-sheet resolver") — sekarang sudah ada data nyata 88 halaman sebagai acuan, bukan cuma asumsi dari benchmark lama.
2. Bagaimana menangani 21,8% referensi bukti yang putus di data 88-halaman ini saat PCKM dibangun dari data tersebut (saran saya di laporan: pakai `observations`/`sheet_identity` sebagai sumber utama, `evidence[]` sebagai pelengkap saja, karena isi faktanya tetap akurat meski jejak visualnya kadang putus).

**Proses kerja yang akan diikuti** (sama seperti Fase 2): brainstorming desain dulu sampai Anda setujui → tulis spec tertulis → tulis implementation plan detail dengan kode lengkap → simpan instruksi lengkap ke folder ini supaya bisa Anda jalankan manual lewat Codex, seperti Fase 0-1 dan Fase 2 sebelumnya.

---

## Ringkasan Singkat

Fase 0, 1, dan 2 dari rencana besar DEM/PCKM **selesai dan sudah diverifikasi dengan data nyata** (bukan cuma skema kosong). Kualitas ekstraksi Qwen terbukti baik untuk transkripsi gambar teknik. Dua catatan kualitas data (dangling reference, bbox piksel) sudah diperbaiki di kode untuk ke depannya, sudah didokumentasikan jujur, tidak mempengaruhi kelayakan data 88-halaman untuk dipakai lanjut ke Fase 3.

**Saya berhenti di titik ini sesuai permintaan Anda.** Silakan lanjutkan kapan siap — cukup minta lanjut ke brainstorming Fase 3.
