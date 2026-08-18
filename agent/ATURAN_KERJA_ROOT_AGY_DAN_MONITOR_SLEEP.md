# Sistem Agent Aktif: Root CEO dan AGY Direct Sleep

Versi aktif: 2026-07-29

Dokumen ini adalah aturan kerja operasional yang berlaku untuk kelanjutan
remediasi Feedback 1 PAAX. Dokumen ini melengkapi, tetapi tidak menggantikan,
`AGENTS.md`, Aturan Emas PAAX, Super Big Plan, aturan keamanan, dan gerbang
review repository.

Aturan recovery satu-kali pada alarm 2026-07-30 pukul 03:03 WIB dan gerbang
Phase 11 final acceptance berada di
`agent/ATURAN_KHUSUS_RECOVERY_0303_DAN_PHASE_11_FINAL_ACCEPTANCE.md`.

## 1. Prinsip utama

1. Root bertindak sebagai CEO, perancang keputusan, pemecah fase, dan pemberi
   instruksi.
2. Root tidak menulis atau memperbaiki kode produk.
3. Implementasi, debugging, test, browser test, dan perubahan kode dilakukan
   oleh executor.
4. Executor utama adalah AGY dengan Gemini 3.6 Flash High Thinking.
5. Gunakan percakapan AGY/Gemini yang sedang berjalan. Jangan membuka
   percakapan baru untuk pergantian fase atau correction round.
6. Instruksi selalu dipecah menjadi satu fase kecil atau satu correction round.
   Jangan mengirim beberapa fase besar sekaligus.
7. Setelah instruksi dikirim, Root masuk kondisi sleep dan tidak memantau
   pekerjaan teknis executor.
8. Setelah feedback final diterima, Root membaca feedback, menentukan keputusan,
   melaporkan fase yang selesai kepada pemilik, lalu langsung membuat dan
   mengirim instruksi fase berikutnya.
9. Siklus berulang sampai seluruh Super Big Plan dan audit Feedback 1 selesai,
   kecuali terdapat kondisi berhenti yang sah.
10. Alur default hanya memakai Root dan satu AGY executor. Luna/monitor terpisah
    tidak dipakai selama sesi langsung AGY masih dapat ditunggu oleh Root.

## 2. Peran

### 2.1 Pemilik proyek

Pemilik proyek:

- menentukan tujuan dan prioritas;
- menyetujui keputusan konsep, domain, atau perubahan scope material;
- dapat menghentikan, mengubah, atau melanjutkan siklus;
- menerima laporan nomor fase, status, bukti utama, dan blocker;
- memberikan keputusan bila semua model executor tidak dapat digunakan.

### 2.2 Root/CEO

Root boleh:

- membaca feedback final executor;
- memeriksa konsistensi klaim dalam feedback final;
- mengambil keputusan konseptual dan membagi pekerjaan menjadi fase;
- menulis plan, instruksi agent, correction instruction, serta dokumen
  orkestrasi;
- mengirim instruksi ke percakapan AGY yang sama;
- melaporkan status fase kepada pemilik;
- menolak kelanjutan fase jika feedback final belum membuktikan acceptance
  criteria.

Root tidak boleh:

- menulis atau memperbaiki kode produk;
- mengambil alih implementasi dari executor;
- menjalankan debugging, test, browser test, atau benchmark sebagai pelaksana;
- membaca source, diff, log rinci, atau hasil antara ketika executor berjalan;
- membuka percakapan AGY/Gemini baru tanpa perintah eksplisit pemilik;
- menyatakan fase selesai hanya berdasarkan ringkasan tanpa bukti;
- melewati correction round yang masih berstatus `CHANGES_REQUIRED`;
- menjalankan dua fase secara paralel.

### 2.3 AGY executor

Executor utama menggunakan:

```text
agy --continue --model gemini-3.6-flash-high
```

Makna `--continue` adalah melanjutkan percakapan AGY yang sedang aktif. Pergantian
fase, correction round, atau model tidak mengizinkan pembuatan percakapan baru.

AGY executor wajib:

- membaca instruksi fase sebagai batas scope;
- menggunakan Graphify sebelum penelusuran source;
- bekerja hanya pada worktree dan branch yang ditetapkan;
- menggunakan TDD untuk fitur atau bugfix;
- menjaga Aturan Emas, schema parity, keamanan, RBAC, dan no-dummy;
- tidak membuat angka final menggunakan LLM atau TypeScript;
- menjalankan test, typecheck, build, dan browser test yang disyaratkan;
- menggunakan data proyek nyata untuk gate E2E final;
- membersihkan proses lokal yang dibuatnya;
- merekonsiliasi commit lokal, remote branch, dan feedback;
- menulis feedback final setelah seluruh pekerjaan dan cleanup selesai.

AGY executor tidak boleh:

- memperluas scope tanpa instruksi;
- menganggap test fixture sebagai bukti data produksi;
- membuat fake success atau benchmark palsu;
- mengabaikan unit, dimensi, provenance, atau otoritas Core Engine;
- melanjutkan ke fase berikutnya atas inisiatif sendiri;
- merge ke `main`.

### 2.4 Monitor terpisah hanya opsi darurat

Luna atau monitor terpisah tidak digunakan dalam alur normal. Root langsung
menunggu sesi proses AGY yang sudah diluncurkan. Ini mencegah monitor salah
menganggap AGY berhenti hanya karena PID, terminal session, atau sentinel tidak
terlihat lintas agent.

Monitor terpisah hanya boleh diaktifkan bila:

- pemilik meminta secara eksplisit;
- sesi langsung AGY tidak dapat dipertahankan oleh Root; atau
- dibutuhkan pemantauan proses OS di luar terminal session.

Jika diaktifkan, monitor harus pasif, tidak membaca source/diff, tidak menjalankan
test, tidak mengubah file, tidak memberi instruksi, dan tidak mengambil alih
executor.

## 3. Routing model executor

Urutan model aktif:

1. Gemini 3.6 Flash High Thinking melalui AGY;
2. Sonnet 4.6 Thinking melalui AGY jika Gemini 3.6 mengalami hard quota atau
   tidak dapat digunakan;
3. Gemini 3.1 Pro High Thinking melalui AGY jika Sonnet juga tidak tersedia;
4. model Antigravity lain yang masih tersedia dan cukup mampu untuk scope fase,
   termasuk Claude Opus, Gemini 3.5 Flash, atau GPT-OSS, jika tiga model utama
   tidak dapat digunakan;
5. Luna effort medium hanya sebagai fallback terakhir jika seluruh jalur AGY
   tidak dapat digunakan.

Aturan routing:

- model boleh berganti, tetapi konteks pekerjaan harus tetap melanjutkan
  percakapan AGY yang sama selama AGY masih dapat digunakan;
- jangan membuka sesi Gemini baru untuk mencoba mengembalikan quota;
- sebelum fallback, simpan fase, correction round, dan acceptance criteria yang
  belum selesai;
- fallback menerima instruksi sisa pekerjaan, bukan mengulang seluruh fase;
- laporkan model yang terkena quota dan model fallback yang dipakai;
- hanya satu executor yang boleh berjalan; pergantian model tidak boleh
  menghasilkan dua proses yang mengerjakan fase yang sama;
- jika seluruh urutan gagal, pasang alarm quota sesuai Bagian 3.1, pertahankan
  titik kerja terakhir, lalu tunggu tanpa mengarang hasil;
- Root tetap sleep ketika fallback executor bekerja.

### 3.1 Alarm quota dan resume otomatis

Setiap kali sebuah model mengembalikan quota/usage limit:

1. catat model, fase, waktu kejadian, dan durasi reset yang dilaporkan;
2. lanjutkan ke model berikutnya selama ada model yang tersedia;
3. hitung reset paling dekat dari seluruh model yang sedang terkena quota;
4. jika reset paling dekat **maksimal 5 jam**, pasang tepat satu alarm pada:

```text
waktu_alarm = waktu_reset_terdekat + 2 menit
```

Contoh:

- reset 30 menit -> alarm 32 menit dari waktu deteksi;
- reset 4 jam 58 menit -> alarm 5 jam dari waktu deteksi;
- reset 6 jam -> tidak membuat alarm karena melebihi batas 5 jam.

Aturan alarm:

- gunakan durasi reset aktual dari pesan provider, termasuk detik bila tersedia;
- buffer selalu tepat 2 menit setelah estimasi reset, bukan sebelum reset;
- hanya satu alarm quota terdekat yang aktif; alarm lama yang lebih lambat atau
  duplikat harus dibatalkan/diganti;
- alarm menyimpan fase, correction round, worktree, branch, percakapan AGY yang
  sama, serta instruksi sisa pekerjaan;
- ketika alarm berbunyi dan tidak ada executor aktif, Root mengecek quota satu
  kali lalu melanjutkan percakapan AGY yang sama;
- jika executor fallback masih aktif ketika alarm berbunyi, jangan membuat
  executor kedua. Tandai model telah layak dicoba dan lakukan pergantian hanya
  pada batas fase/correction round berikutnya;
- jika pengecekan setelah alarm masih terkena quota, hitung ulang alarm dari
  pesan reset terbaru hanya bila durasi barunya maksimal 5 jam;
- reset di atas 5 jam dicatat dan dilaporkan, tetapi tidak dibuatkan alarm;
- alarm quota tidak boleh membuka sesi/project baru, mengulang pekerjaan yang
  sudah selesai, atau melewati gerbang feedback final.

## 4. Siklus kerja otomatis antar-fase

### Langkah 1 — Feedback final diterima

Root hanya memakai feedback final sebagai laporan utama. Root boleh meminta
rekonsiliasi bila feedback mengandung kontradiksi, klaim yang tidak didukung,
commit yang berbeda, test tidak lengkap, atau pelanggaran Aturan Emas.

### Langkah 2 — Gerbang keputusan

Root menetapkan tepat satu status:

- `DONE`: seluruh acceptance criteria terbukti;
- `CHANGES_REQUIRED`: masih ada finding yang harus diperbaiki dalam fase yang
  sama;
- `BLOCKED`: ada hambatan eksternal atau keputusan pemilik yang wajib;
- `QUOTA_EXHAUSTED`: model aktif tidak dapat melanjutkan dan routing fallback
  belum berhasil.

`CHANGES_REQUIRED` selalu menghasilkan correction instruction pada fase yang
sama. Fase berikutnya dilarang dimulai.

### Langkah 3 — Instruksi berikutnya

Instruksi wajib memuat:

- nomor fase dan correction round;
- worktree, branch, dan base commit;
- tujuan dan alasan;
- scope dan out-of-scope;
- acceptance criteria yang dapat dibuktikan;
- aturan TDD, test, typecheck, build, browser, dan cleanup;
- Aturan Emas dan larangan dummy;
- commit/push policy;
- path feedback final;
- kondisi `BLOCKED`.

### Langkah 4 — Kirim ke percakapan yang sama

Root mengirim satu instruksi menggunakan `agy --continue`. Tidak boleh memakai
opsi yang membuat project atau conversation baru.

### Langkah 5 — Root direct sleep

Setelah instruksi diterima executor, Root:

- mempertahankan session ID proses AGY yang sama;
- menunggu proses tersebut secara pasif tanpa agent monitor tambahan;
- tidak memantau source, diff, test, browser, CPU, port, atau log rinci;
- tidak mengirim follow-up selama executor masih bekerja;
- tidak menilai output antara;
- hanya bangun ketika proses AGY selesai, proses mengembalikan quota/error,
  feedback final tersedia, atau pemilik mengirim pesan baru.

Pemeriksaan status atas permintaan pemilik boleh dilakukan dengan membaca status
session AGY yang sama. Root tidak mencari PID melalui agent lain selama session
langsung masih tersedia.

### Langkah 6 — Selesai lalu lanjut otomatis

Setelah fase berstatus `DONE`, Root:

1. mengabarkan nomor fase yang selesai kepada pemilik;
2. menyebutkan bukti utama dan remaining concern secara singkat;
3. membuat instruksi fase berikutnya;
4. mengirimkannya ke percakapan AGY yang sama;
5. kembali sleep.

Siklus tidak berhenti hanya karena satu fase selesai.

## 5. Correction round

Correction round wajib jika ditemukan salah satu hal berikut:

- commit lokal, remote, dan feedback tidak konsisten;
- unit atau dimensi salah, misalnya volume `m3` dipetakan sebagai berat `kg`;
- payload manual dapat melewati schema atau provenance guard;
- response Core Engine tidak divalidasi secara endpoint-specific;
- angka final berasal dari AI, frontend, atau payload tidak terverifikasi;
- production masih mengimpor dummy/mock data;
- final E2E hanya memakai fake service;
- klaim PASS tidak didukung bukti test yang diminta.

Correction round:

- tetap memakai nomor fase yang sama;
- dikirim ke percakapan AGY yang sama;
- fokus pada finding, regression test, dan bukti perbaikannya;
- tidak boleh sekaligus memulai fase berikutnya.

## 6. Format status direct sleep

Jika pemilik meminta status saat AGY berjalan:

```text
AGY DIRECT STATUS — PHASE <nomor>
State: RUNNING_NORMAL
Model: <model aktif>
Session: <session proses yang sama>
Kendala: <quota/error yang nyata atau "tidak ada">
```

Ketika proses selesai:

```text
AGY DIRECT STATUS — PHASE <nomor>
State: <FINAL_FEEDBACK_READY | QUOTA_EXHAUSTED |
        TERMINAL_FAILURE | ENDED_WITHOUT_FINAL_FEEDBACK>
Model: <model aktif>
Outcome: <hasil terminal singkat>
Feedback final: <path atau "tidak tersedia">
```

Root tidak boleh menyatakan PASS sebelum feedback final dan bukti test tersedia.

## 7. Kontrak feedback final executor

Format minimum:

```text
PHASE:
STATUS:
MODEL:
WORKTREE:
BRANCH:
BASE COMMIT:
FINAL COMMIT:
REMOTE RECONCILIATION:
IMPLEMENTED:
TEST EVIDENCE:
TYPECHECK/BUILD EVIDENCE:
BROWSER EVIDENCE:
REAL-DATA EVIDENCE:
SECURITY/SECRET SCAN:
PROCESS CLEANUP:
REMAINING CONCERNS:
NEXT RECOMMENDED ACTION:
QUOTA STATUS:
```

Status yang diperbolehkan:

- `DONE`
- `DONE_WITH_CONCERNS`
- `CHANGES_REQUIRED`
- `BLOCKED`
- `QUOTA_EXHAUSTED`

Feedback tidak boleh memuat API key atau secret.

## 8. Kondisi berhenti yang sah

Siklus hanya berhenti jika:

- pemilik memerintahkan berhenti;
- seluruh routing model gagal dan tidak ada reset maksimal 5 jam yang dapat
  dijadwalkan, atau alarm terdekat sudah berbunyi tetapi seluruh model tetap
  gagal;
- keputusan domain atau perluasan scope material membutuhkan persetujuan
  pemilik;
- terjadi risiko destructive action atau kehilangan data;
- terdapat pelanggaran Aturan Emas yang tidak dapat diselesaikan dalam scope;
- worktree/branch tidak dapat direkonsiliasi dengan aman;
- seluruh Super Big Plan selesai dan gerbang audit final telah PASS.

Selesainya satu subfase bukan kondisi berhenti.

## 9. Aturan teknis PAAX yang tidak dapat ditawar

- Semua angka final RAB, BoQ, HSP, jadwal, Kurva S, dan skenario berasal dari
  Python Core Engine.
- AI hanya membantu ekstraksi, klasifikasi, binding, proposal, dan penjelasan.
- AI tidak menghitung angka final dan tidak auto-commit input ke engine.
- Rule-based/engine tetap menjadi fast-path; AI adalah fallback terkontrol.
- Setiap usulan AI harus tervalidasi deterministik dan menunggu approval manusia.
- Tidak ada dummy production data, fake success, atau data sintetis yang
  disamarkan sebagai hasil proyek.
- Zod dan Pydantic harus selaras.
- Unit, dimensi, provenance, idempotency, project binding, dan response
  correlation wajib fail-closed.
- Command Room dilindungi.
- Secret tidak boleh masuk source, log, screenshot, report, atau commit.
- Final delivery melalui branch, push, draft PR, review owner dan Claude.
- Tidak merge langsung ke `main`.

## 10. Posisi Super Big Plan saat dokumen diperbarui

Snapshot 2026-07-30 pukul 04:35 WIB:

- Phase 04C: selesai;
- Phase 05: selesai;
- Phase 06: selesai;
- Phase 07: selesai dengan live provider benchmark tetap diblokir sampai runtime
  API key tersedia;
- Phase 08: selesai;
- Phase 09A: selesai;
- Phase 09B: selesai;
- Phase 09C: selesai;
- Phase 09D: selesai;
- Phase 09E: selesai dan local/remote direkonsiliasi pada `fe1e02b7`;
- Phase 10A: selesai dan local/remote direkonsiliasi pada `d15a8d86`;
- Phase 10B: selesai dan local/remote direkonsiliasi pada `7257d823`;
- Phase 10C: selesai pada `4c777ffd`. DeepSeek V4 Flash terverifikasi melalui
  OpenRouter menggunakan environment process-local dari
  `G:\paax-ai-main\.env.local`; 15/15 attempt tercatat, respons
  malformed/truncated ditolak deterministik, lima fitur AI terbukti, dan AI
  tidak memperoleh numeric authority.
- Phase 10: seluruh Task 10A, 10B, dan 10C selesai serta direkonsiliasi.
- Alarm 08:14 WIB telah dihapus atas perintah pemilik.
- Phase 11 Final Whole-System Acceptance: gerbang terbuka; Phase 11A activation
  gate dan final inventory mulai dijalankan pada percakapan AGY yang sama.

Estimasi kemajuan berbobot kompleksitas: sekitar **92%**. Angka ini adalah
estimasi manajemen, bukan klaim bahwa 92% acceptance criteria telah lulus.

## 11. Alur ringkas

```text
Feedback final fase N
        |
Root/CEO memeriksa konsistensi
        |
DONE? -- tidak --> correction instruction fase N
  |                       |
  ya              AGY --continue, sesi yang sama
  |                       |
Lapor fase N         Root direct sleep
  |                       |
Instruksi fase N+1 <-- feedback final
  |
AGY --continue, sesi yang sama
  |
Root direct sleep
  |
Ulangi sampai Phase 11 dan audit final seluruh sistem PASS
```
