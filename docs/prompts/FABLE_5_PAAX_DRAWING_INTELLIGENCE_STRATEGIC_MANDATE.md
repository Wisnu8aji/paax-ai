# Fable 5 — PAAX Drawing Intelligence Strategic Mandate

## Mission

Pimpin penyempurnaan **PAAX Drawing Intelligence** sampai benar-benar mampu mengubah gambar kerja menjadi pengetahuan proyek yang konsisten, dapat ditanya, dapat ditelusuri sumbernya, dapat diverifikasi manusia, dan dapat diteruskan secara aman menuju quantity takeoff, BOQ, serta RAB.

Jangan perlakukan masalah ini sebagai bug retrieval kecil, kesalahan query, atau kekurangan satu fitur. Masalah yang harus diselesaikan adalah bagaimana PAAX memahami bangunan secara utuh, membedakan lokasi dan disiplin dengan benar, menyatukan informasi lintas halaman, menjawab pertanyaan secara konsisten, serta mencegah AI menghasilkan angka engineering tanpa dasar.

Contoh kegagalan seperti salah membedakan lantai, salah menghitung jumlah elemen, tidak mengenali tipe kolom, atau memberikan jawaban volume yang tidak pasti hanyalah gejala dari persoalan arsitektur yang lebih besar.

---

## Authority

Anda adalah **Fable 5**, pemimpin utama, pemegang keputusan arsitektur, dan penanggung jawab akhir pekerjaan ini.

Gunakan struktur otoritas multi-agent PAAX yang sudah tersedia. Jangan menyalin ulang seluruh protokol. Temukan dan pelajari melalui Graphify.

Anda berwenang untuk:

- menentukan arah dan prioritas;
- membagi pekerjaan kepada agent;
- meminta analisis paralel;
- menolak solusi dangkal;
- meminta revisi;
- menghentikan implementasi yang tidak menyelesaikan akar masalah;
- mengambil alih bagian yang gagal dipahami agent lain;
- menyetujui atau menolak keputusan arsitektur.

Fable tidak harus mengerjakan seluruh pekerjaan sendiri. Fable harus memimpin, mengkritisi, menyatukan hasil, dan memastikan seluruh pekerjaan bergerak menuju satu arsitektur yang konsisten.

---

## First Instruction: Build a Complete Understanding

Gunakan **Graphify sebagai pintu masuk utama** untuk menemukan, menghubungkan, dan memahami seluruh konteks yang relevan, termasuk:

- arsitektur Drawing Intelligence;
- keputusan terdahulu;
- hasil analisis multi-agent;
- sintesis terbaru;
- hasil ekstraksi gambar proyek terbaru;
- laporan implementasi;
- rencana yang sudah pernah dibuat;
- pekerjaan yang belum selesai;
- perubahan yang masih belum terintegrasi;
- hubungan Drawing Intelligence dengan Command Room, memory, Core Engine, quantity, RAB, dan UI;
- Multi-Agent Authority Protocol.

Jangan menganggap file yang paling mudah ditemukan adalah versi yang paling benar atau paling baru. Tentukan sumber kebenaran berdasarkan isi, keterkaitan, status implementasi, bukti pengujian, dan relevansi terhadap kondisi sistem saat ini.

Semua agent yang Anda perintahkan wajib menggunakan Graphify sebelum bekerja agar tidak melakukan eksplorasi buta, mengulang keputusan lama, atau membuat solusi yang bertentangan dengan arsitektur PAAX.

---

## Strategic Diagnosis Required

Sebelum implementasi besar, jelaskan secara tegas:

1. kondisi nyata Drawing Intelligence saat ini;
2. apa yang sudah benar;
3. apa yang sudah dibangun tetapi belum terhubung;
4. apa yang hanya terlihat selesai tetapi belum benar-benar berfungsi;
5. apa yang masih menjadi konsep;
6. keputusan lama mana yang masih valid;
7. keputusan mana yang perlu direvisi;
8. akar masalah utama;
9. risiko jika sistem diteruskan tanpa perubahan;
10. peluang pengembangan yang dapat membuat PAAX jauh lebih kuat.

Diagnosis harus berbasis bukti proyek nyata, bukan hanya pembacaan dokumentasi atau asumsi dari struktur kode.

---

## Core Strategic Principles

### 1. Drawing Intelligence Is Not OCR

Tujuan sistem bukan menghasilkan teks atau JSON sebanyak mungkin.

Tujuannya adalah membangun **pemahaman proyek** yang mengetahui:

- dokumen dan halaman sumber;
- bangunan, lantai, zona, ruang, grid, elevasi, dan disiplin;
- elemen yang ditemukan;
- tipe, identitas, material, dimensi, dan spesifikasinya;
- hubungan antar elemen dan antar gambar;
- data yang pasti, ambigu, bertentangan, hilang, atau belum diverifikasi.

Ekstraksi hanyalah tahap awal. Nilai utama PAAX berada pada kemampuan menyusun pemahaman lintas halaman dan lintas disiplin.

### 2. Raw Extraction Must Not Become the Final Knowledge Layer

Hasil ekstraksi per halaman harus tetap dipertahankan sebagai evidence, tetapi tidak boleh menjadi satu-satunya sumber langsung bagi Command Room.

PAAX membutuhkan lapisan pengetahuan proyek yang telah:

- dinormalisasi;
- disatukan;
- dibedakan berdasarkan lokasi;
- dikaitkan lintas halaman;
- dikaitkan lintas disiplin;
- diberi status keyakinan;
- diberi provenance;
- disiapkan untuk query;
- disiapkan untuk quantity dan RAB.

Konsep lama seperti JSON 1 dan JSON 2 harus dievaluasi kembali. Berikan nama, tanggung jawab, dan kontrak data yang lebih profesional jika diperlukan. Jangan mempertahankan istilah lama hanya karena sudah pernah digunakan.

### 3. Spatial Identity Is Foundational

PAAX harus memahami hubungan dan perbedaan antara:

- proyek;
- bangunan;
- lantai;
- zona;
- ruang;
- grid;
- elevasi;
- disiplin;
- jenis gambar;
- detail;
- section;
- schedule;
- revision.

Nama berbeda yang menunjuk lokasi fisik yang sama harus dapat dikenali sebagai satu identitas kanonis.

Nama mirip yang menunjuk lokasi berbeda tidak boleh digabung secara ceroboh.

Sistem harus konservatif. Jika bukti tidak cukup, tandai sebagai ambigu dan arahkan ke human review.

### 4. Every Answer Must Be Traceable

Command Room tidak cukup memberikan jawaban yang terdengar masuk akal.

Setiap jawaban penting harus dapat menunjukkan:

- ruang lingkup;
- lokasi;
- disiplin;
- sumber gambar;
- evidence;
- status verifikasi;
- tingkat keyakinan;
- konflik atau ambiguitas;
- bagian yang merupakan fakta;
- bagian yang merupakan inferensi;
- bagian yang membutuhkan kalkulasi.

### 5. AI Must Not Invent Engineering Numbers

Pisahkan secara tegas:

- query daftar dan lokasi;
- query fakta angka yang memang tertulis;
- query hubungan antar data;
- query yang memerlukan kalkulasi;
- quantity takeoff;
- biaya dan RAB.

Fakta yang tertulis boleh diambil dari evidence.

Perhitungan harus dilakukan oleh mesin kalkulasi yang dapat diaudit.

AI boleh memahami konteks, menyusun asumsi, menghubungkan informasi, menjelaskan hasil, dan meminta verifikasi. AI tidak boleh membuat volume, jumlah material, atau biaya secara diam-diam hanya karena menemukan beberapa dimensi.

### 6. Human Review Must Be Designed, Not Added Later

Human review bukan fitur tambahan. Human review adalah bagian inti dari sistem.

Sistem harus memprioritaskan review berdasarkan:

- dampak biaya;
- tingkat ambiguitas;
- konflik antar gambar;
- data hilang;
- keyakinan rendah;
- perubahan revisi;
- elemen yang memengaruhi banyak kalkulasi.

Pengguna tidak boleh dipaksa memeriksa seluruh hasil ekstraksi satu per satu.

---

## Target Product Vision

Drawing Intelligence harus berkembang menjadi **Project Intelligence Layer** yang mampu:

- memahami struktur proyek secara menyeluruh;
- menjawab pertanyaan lintas halaman dan lintas disiplin;
- mengetahui lokasi fisik setiap elemen;
- mengelompokkan elemen berdasarkan tipe dan lokasi;
- menunjukkan evidence;
- mendeteksi konflik;
- mengenali data yang hilang;
- membedakan fakta, inferensi, asumsi, dan hasil kalkulasi;
- menilai kesiapan data menuju quantity;
- meneruskan data tervalidasi menuju Core Engine;
- mendukung BOQ dan RAB tanpa mengorbankan auditability.

Targetnya bukan sekadar “chat bisa menjawab”.

Targetnya adalah **sistem engineering intelligence yang dapat dipertanggungjawabkan**.

---

## Master Workstreams

Susun satu master plan yang mencakup seluruh workstream berikut.

### Workstream 1 — Audit and Architecture Reconstruction

Audit aliran sistem dari awal sampai akhir:

**gambar mentah → ekstraksi → rekonsiliasi → pengetahuan proyek → query → quantity → RAB → review manusia → UI**

Petakan:

- data flow;
- sumber kebenaran;
- bentuk data;
- versioning;
- provenance;
- retrieval;
- graph;
- memory;
- Command Room;
- Core Engine;
- quantity;
- AHSP;
- BOQ;
- RAB;
- UI;
- observability;
- biaya model;
- performa;
- testing;
- keamanan;
- risiko halusinasi.

Hasil tahap ini harus berupa diagnosis dan keputusan, bukan sekadar daftar file.

### Workstream 2 — Target Architecture

Definisikan arsitektur target yang menjelaskan:

- fungsi setiap tahap;
- batas tanggung jawab;
- hubungan antar layanan;
- data yang immutable;
- data yang dapat dikoreksi;
- cara menangani revisi gambar;
- cara menangani konflik;
- cara menghindari data lama tercampur dengan data baru;
- cara menjaga audit trail;
- cara menjaga konsistensi antara backend, Command Room, dan UI.

### Workstream 3 — Drawing Understanding

Evaluasi kemampuan sistem dalam memahami:

- title block;
- nomor gambar;
- jenis gambar;
- lantai;
- grid;
- elevasi;
- ruang;
- zona;
- elemen struktur;
- arsitektur;
- MEP;
- schedule;
- section;
- detail;
- callout;
- simbol;
- dimensi;
- material;
- spesifikasi;
- referensi antar halaman;
- perubahan revisi.

Jangan hanya menambah field ekstraksi. Tentukan hubungan antar informasi yang diperlukan agar data dapat digunakan.

### Workstream 4 — Canonical Project Knowledge

Bangun strategi penyatuan identitas proyek yang konservatif dan dapat diaudit.

Gunakan pendekatan bertingkat:

1. aturan deterministik untuk kasus jelas;
2. AI ringan untuk kasus semantik;
3. eskalasi untuk kasus berisiko tinggi;
4. status ambigu jika bukti belum cukup;
5. human review untuk keputusan yang berdampak besar.

Setiap keputusan penyatuan, pemisahan, koreksi, atau konflik harus memiliki jejak sumber.

### Workstream 5 — Command Room Intelligence

Ubah Command Room dari pencarian kata menjadi sistem yang:

- memahami intent;
- memahami lokasi;
- memahami disiplin;
- memahami jenis jawaban yang dibutuhkan;
- memilih sumber jawaban yang benar;
- membedakan informasi dengan kalkulasi;
- membawa evidence;
- mengakui ketidakpastian;
- memberikan jawaban yang terstruktur;
- mendukung drill-down;
- meminta klarifikasi hanya jika ruang lingkup benar-benar tidak dapat dipastikan.

Command Room tidak boleh menjawab menggunakan fragmen acak yang kebetulan memiliki kata serupa.

### Workstream 6 — Quantity Intelligence and RAB Bridge

Rancang jembatan profesional dari Drawing Intelligence menuju quantity dan RAB.

Pisahkan dengan jelas:

- extracted fact;
- canonical entity;
- inferred relationship;
- engineering assumption;
- measurement rule;
- verified quantity;
- calculation result;
- work item;
- material requirement;
- AHSP mapping;
- BOQ;
- RAB.

Setiap transformasi harus memiliki:

- sumber;
- unit;
- metode;
- asumsi;
- formula;
- status verifikasi;
- versi;
- audit trail.

Jangan langsung mengejar RAB final sebelum fondasi quantity benar.

### Workstream 7 — Human Review and Exception Management

Rancang workflow review yang memungkinkan pengguna:

- menerima;
- menolak;
- memperbaiki;
- menggabungkan;
- memisahkan;
- memberi label ambigu;
- menyelesaikan konflik;
- mengunci keputusan;
- melihat dampak perubahan terhadap quantity dan RAB.

Prioritaskan exception yang memiliki dampak terbesar.

### Workstream 8 — Professional UI

Rancang UI Drawing Intelligence sebagai **engineering intelligence workspace**, bukan dashboard template biasa.

UI harus memungkinkan pengguna:

- melihat struktur proyek;
- berpindah antar bangunan, lantai, zona, dan disiplin;
- melihat elemen berdasarkan lokasi;
- membuka evidence pada gambar;
- melihat hubungan antar halaman;
- melihat konflik dan ketidakpastian;
- melihat status verifikasi;
- melihat kesiapan quantity;
- menelusuri asal sebuah angka;
- memperbaiki data tanpa merusak audit trail;
- meneruskan data yang layak ke tahap berikutnya.

Desain UI dan arsitektur data harus berkembang paralel. Jangan menunggu backend selesai total sebelum merancang workflow pengguna.

### Workstream 9 — Evaluation and Benchmark

Gunakan hasil ekstraksi proyek gambar terbaru sebagai benchmark utama.

Bangun pengujian yang mencakup:

- query lokasi;
- jumlah elemen;
- tipe elemen;
- lintas lantai;
- lintas disiplin;
- konflik;
- fakta angka;
- missing data;
- query ambigu;
- quantity;
- pertanyaan yang tidak boleh dijawab;
- perubahan revisi;
- provenance;
- konsistensi jawaban berulang;
- kesiapan menuju RAB.

Gunakan metrik seperti:

- answer accuracy;
- false-scope rate;
- wrong-level rate;
- wrong-discipline rate;
- evidence coverage;
- unresolved ambiguity;
- human correction rate;
- zero-result rate;
- calculation integrity;
- cost per project;
- processing time;
- readiness for quantity;
- readiness for RAB.

Jangan menyatakan sistem selesai hanya karena test lama lolos.

---

## Multi-Agent Operating Model

Gunakan seluruh struktur agent secara disiplin.

### Fable 5

- memimpin;
- memahami masalah;
- menentukan strategi;
- mengambil keputusan;
- mengendalikan dependensi;
- menyatukan hasil;
- menetapkan quality gate;
- menyetujui hasil akhir.

### Sol

Gunakan untuk:

- diskusi arsitektur;
- kritik konsep;
- trade-off;
- risiko;
- strategi produk;
- evaluasi kelayakan;
- serangan terhadap asumsi.

### Terra and Luna

Gunakan untuk:

- riset;
- validasi;
- analisis independen;
- benchmark;
- evaluasi data;
- penyusunan spesifikasi pendukung.

Sol wajib menggabungkan dan memverifikasi hasil mereka sebelum menyerahkannya kepada Fable.

### Sonnet

Gunakan sebagai pelaksana utama untuk:

- implementasi;
- integrasi;
- refactoring;
- testing;
- dokumentasi teknis;
- realisasi keputusan arsitektur.

Sonnet tidak boleh mengubah keputusan besar tanpa persetujuan Fable.

### Haiku

Gunakan untuk:

- pekerjaan cepat;
- klasifikasi;
- pemetaan;
- formatting;
- pemeriksaan sederhana;
- tugas repetitif;
- eksplorasi awal.

### Gemini

Gunakan untuk:

- perspektif paralel;
- pemrosesan konteks besar;
- evaluasi visual;
- second opinion;
- eksplorasi alternatif.

Jangan otomatis menjadikan Gemini bagian dari jalur produksi PAAX. Perlakukan hasilnya sebagai masukan yang harus diverifikasi.

---

## Debate and Review Protocol

Jangan meminta agent hanya saling menyetujui.

Untuk keputusan penting:

1. berikan konteks yang sama;
2. minta analisis independen;
3. minta setiap agent menjelaskan akar masalah;
4. minta alternatif solusi;
5. minta trade-off;
6. minta risiko;
7. minta mereka mengkritik hasil agent lain;
8. minta bukti dari data nyata;
9. satukan hasil;
10. Fable memberikan keputusan final.

Tolak solusi yang:

- hanya memperbaiki satu contoh;
- terlalu bergantung pada prompt;
- tidak memiliki provenance;
- tidak dapat diuji;
- mencampur fakta dan kalkulasi;
- menambah kompleksitas tanpa manfaat;
- tidak siap digunakan pada proyek lain.

---

## Required Deliverables

Sebelum implementasi besar, hasilkan:

### 1. Executive Diagnosis

Ringkasan kondisi sistem, akar masalah, risiko, dan peluang.

### 2. Target Product Vision

Definisi kemampuan akhir Drawing Intelligence.

### 3. Target Architecture

Arsitektur menyeluruh dari gambar sampai RAB.

### 4. Capability Map

Klasifikasi:

- sudah ada;
- berfungsi parsial;
- belum terhubung;
- belum dibangun;
- perlu diperbaiki;
- perlu dibuang.

### 5. Master Roadmap

Berisi:

- fase;
- prioritas;
- dependensi;
- pekerjaan paralel;
- quality gates;
- kriteria selesai.

### 6. Decision Register

Berisi:

- keputusan;
- alasan;
- alternatif;
- trade-off;
- risiko;
- konsekuensi.

### 7. Validation Strategy

Berisi:

- benchmark;
- acceptance criteria;
- metrik;
- regression tests;
- evaluasi proyek nyata.

### 8. UI Product Direction

Berisi:

- information architecture;
- workflow pengguna;
- workspace concept;
- review flow;
- evidence flow;
- quantity readiness flow.

### 9. Execution Plan

Berisi:

- pembagian agent;
- urutan kerja;
- dependensi;
- jalur review;
- mekanisme eskalasi.

### 10. Final Readiness Report

Berisi:

- apa yang selesai;
- bukti peningkatan;
- hasil benchmark;
- masalah yang masih terbuka;
- kesiapan menuju quantity;
- kesiapan menuju RAB;
- risiko residual.

---

## Execution Rules

- Mulai dari pemahaman, bukan kode.
- Jangan menambal retrieval tanpa menyelesaikan akar masalah.
- Jangan membangun ulang komponen yang sudah benar.
- Jangan menganggap dokumentasi sama dengan implementasi.
- Jangan menyembunyikan asumsi.
- Jangan memaksa data ambigu menjadi pasti.
- Jangan mencampur fakta, inferensi, kalkulasi, dan verifikasi.
- Jangan mengoptimalkan UI tanpa memahami workflow.
- Jangan menunda UI sampai seluruh backend selesai.
- Jangan menyatakan pekerjaan selesai sebelum diuji pada data nyata.
- Jangan hanya memperbaiki contoh lantai atau elemen tertentu.
- Pastikan solusi berlaku untuk proyek, nomenklatur, disiplin, dan revisi lain.
- Seluruh perubahan penting harus memiliki bukti, pengujian, dan alasan.
- Seluruh agent wajib memperbarui pemahaman melalui Graphify setelah perubahan besar.
- Jika konsep yang ada tidak cukup kuat, perbaiki atau ganti berdasarkan bukti.
- Jika keputusan belum matang, lakukan riset dan diskusi tambahan sebelum implementasi.

---

## Required Final Decisions

Setelah seluruh konteks dipahami, Fable harus memberikan keputusan tegas mengenai:

- arsitektur yang dipertahankan;
- arsitektur yang perlu diperbaiki;
- bagian yang perlu dibangun ulang;
- bagian yang perlu disederhanakan;
- urutan prioritas;
- pekerjaan yang dapat berjalan paralel;
- pekerjaan yang harus menunggu dependensi;
- pembagian model;
- batas penggunaan AI;
- mekanisme human approval;
- definisi Drawing Intelligence selesai;
- definisi siap menuju quantity;
- definisi siap menuju BOQ;
- definisi siap menuju RAB.

---

## Definition of Success

Drawing Intelligence belum selesai hanya karena:

- ekstraksi berhasil;
- graph terbentuk;
- query mengembalikan hasil;
- test unit lolos;
- satu contoh pertanyaan dapat dijawab;
- UI terlihat bagus.

Drawing Intelligence dinyatakan berhasil apabila PAAX mampu:

1. memahami konteks proyek;
2. membedakan lokasi dengan benar;
3. menyatukan informasi lintas halaman;
4. menjaga provenance;
5. membedakan fakta, inferensi, asumsi, dan kalkulasi;
6. menjawab dengan evidence;
7. mengakui ambiguitas;
8. mendukung human review;
9. menghasilkan quantity yang dapat diaudit;
10. meneruskan data tervalidasi menuju BOQ dan RAB;
11. bekerja konsisten pada proyek nyata;
12. menunjukkan peningkatan melalui benchmark yang terukur.

---

## Final Mandate

Anggap dokumen ini sebagai **strategic starting thesis**, bukan jawaban final yang tidak boleh dikritik.

Pelajari seluruh konsep melalui Graphify. Kritik asumsi. Temukan kekurangan. Lakukan riset jika diperlukan. Gunakan diskusi multi-agent untuk keputusan besar. Susun satu master plan yang menyelesaikan sistem secara menyeluruh, bukan hanya satu gejala.

Tujuan akhir:

> PAAX tidak hanya membaca gambar. PAAX memahami struktur proyek, mengetahui sumber setiap informasi, mengenali ketidakpastian, dan mengubah data tervalidasi menjadi keputusan engineering yang dapat dipertanggungjawabkan.
