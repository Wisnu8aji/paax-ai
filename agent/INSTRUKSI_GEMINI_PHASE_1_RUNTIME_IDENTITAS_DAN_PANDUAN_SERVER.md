# INSTRUKSI GEMINI — PHASE 1
## Runtime Identity, Server Bootstrap, dan Panduan yang Tidak Dapat Menjalankan Versi Lama

### Model dan cara kerja

Gunakan **Gemini 3.6 Flash High Thinking**. Kerjakan hanya Phase 1 ini. Jangan melanjutkan Phase 2 atau Phase 3 sebelum seluruh acceptance gate Phase 1 lulus dan laporan akhir Phase 1 selesai.

Anda adalah executor. Jangan sekadar membuat analisis atau dokumen. Lakukan diagnosis berbasis bukti, implementasi, pengujian, commit terpisah yang dapat ditinjau, lalu tulis laporan hasil. Jangan menyatakan PASS berdasarkan kode, unit test, screenshot lama, atau laporan fase lama saja.

### Lokasi kerja yang sah

- Worktree produk terbaru: `G:\paax-ai-contextual-integration`
- Branch awal saat audit: `codex/contextual-intelligence-integration`
- HEAD terbaru yang ditemukan saat audit: `ad83e799` (2026-07-30)
- Jangan mengedit produk di `G:\paax-ai-main`; folder itu hanya boleh menjadi sumber pembanding dan lokasi instruksi.
- Jangan bekerja di `G:\paax-ai-feedback1-remediation`.
- Buat branch baru berawalan `codex/` dari worktree contextual terbaru sesuai aturan repository. Jangan merge ke `main`.
- Worktree contextual memiliki perubahan belum di-commit. Inventarisasi dan pertahankan semuanya. Jangan memakai reset, checkout untuk membuang perubahan, clean, atau operasi destruktif lain.

### Aturan tetap yang tidak boleh dilanggar

1. Baca `AGENTS.md`, `CLAUDE.md`, `docs/INDEX.md`, dan `docs/ai-map/STATE_CURRENT.md` sebelum mengubah apa pun.
2. Jalankan Graphify query/explain terlebih dahulu untuk alur startup, health/version, DB bootstrap, source document, dan seluruh simbol yang akan diubah. Setelah perubahan, jalankan `graphify update .`.
3. AI tidak boleh menghitung angka quantity/RAB/BoQ/jadwal. Semua angka final hanya dari deterministic core engine.
4. Tidak boleh ada API key atau fallback key hardcoded. Semua service dan proxy harus fail closed di luar `TESTING=1`.
5. Perubahan schema Zod dan Pydantic harus tetap paralel.
6. Jangan menghapus fitur atau file Command Room.
7. Gunakan test-driven debugging: buat reproduksi kegagalan terlebih dahulu, lalu perbaiki akar masalah.
8. Push branch dan buka PR setelah seluruh tiga phase selesai; pada Phase 1 cukup commit terpisah yang rapi dan jangan merge.

---

## Bukti baseline yang wajib diverifikasi ulang

Audit Codex menemukan bahwa server yang dilihat pengguna **bukan versi contextual terbaru**. Semua port aktif berasal dari `G:\paax-ai-main`:

- Web `3000`
- DB `8001`
- Core engine `8081`
- Drawing intelligence `8082`
- Document intelligence `8083`
- Site agent `8085`

`G:\paax-ai-main` berada pada commit `f0be1042` tanggal 25 Juli 2026, sedangkan worktree contextual berada pada `ad83e799` tanggal 30 Juli 2026 dan memiliki sekitar 117 commit lanjutan. Jangan menerima angka commit ini secara buta; verifikasi keadaan aktual sebelum mulai.

Akar masalah utama yang telah ditemukan:

- `scripts/portable/Start-PLHUT-Local.ps1` memakai PID bersama di `G:\PAAX-Data\runtime`.
- Ketika PID masih hidup, fungsi startup menganggap service “already running” tanpa memeriksa command line, repo root, branch, commit, executable, data root, atau build identity.
- `preflight.py --allow-running` mengizinkan port yang sudah ditempati.
- Akibatnya, startup dari contextual dapat diam-diam memakai service lama dari `paax-ai-main` dan tetap terlihat berhasil.
- Panduan `PANDUAN_INSTALASI_DAN_MENJALANKAN_SEMUA_SERVER_PAAX.md` menunjuk folder contextual yang benar, tetapi belum memiliki gerbang identitas yang mencegah reuse runtime lama.
- Clean HEAD versi `scripts/live_test/serve_db_with_fixture.py` harus diperiksa. Perubahan lokal yang belum di-commit tampaknya memperbaiki manifest fallback dan membuat Uvicorn benar-benar berjalan; produk tidak boleh bergantung pada patch lokal tersembunyi.
- `Start-PLHUT-Local.ps1` pernah terkena masalah karakter dash/encoding Windows PowerShell. Perintah yang ditulis di panduan harus bekerja langsung pada lingkungan Windows pengguna.
- Ada perubahan lokal pada proxy document/drawing intelligence yang menambahkan fallback string `live-test-key`. Itu regresi keamanan dan wajib dihapus; jangan pernah menuliskan nilai key asli dalam log atau laporan.

---

## Target Phase 1

Membuat proses startup PAAX **fail closed terhadap versi salah**. Saat pengguna menjalankan panduan dari worktree contextual, tidak boleh ada kemungkinan service dari folder/commit lain diam-diam dipakai. Semua service harus membuktikan identitas build, sumber data, dan health yang sama sebelum UI dinyatakan READY.

## Langkah kerja wajib

### 1. Baseline forensik tanpa mengubah data

- Rekam branch, commit, dirty state, lokasi executable, command line, working directory, PID, port, waktu mulai, dan `PAAX_DATA_ROOT` seluruh service aktif.
- Rekam status database portable tanpa mencetak rahasia: path database, project ID, jumlah DEM run, dan jumlah halaman.
- Hentikan hanya service PAAX yang benar-benar teridentifikasi. Jangan membunuh proses berdasarkan nama generik seperti semua `python.exe` atau semua `node.exe`.
- Pastikan tidak ada orphan process atau port PAAX tertinggal sebelum startup baru.

### 2. Amankan perubahan lokal contextual

- Inventarisasi delapan perubahan lokal yang ditemukan pada proxy web, DB main, sheet context, DB fixture server, dan startup script.
- Jangan membuang perubahan tersebut. Bedakan perubahan yang benar, perubahan parsial, dan regresi keamanan.
- Hilangkan semua hardcoded test-key dari jalur produksi dan pulihkan perilaku fail-closed.
- Pastikan clean committed branch mampu dijalankan; jangan membuat hasil bergantung pada file dirty yang tidak ikut commit.

### 3. Implementasikan identitas runtime tunggal

Bangun mekanisme identitas yang ringan dan konsisten untuk seluruh service. Minimal harus mencakup:

- absolute repository root;
- branch dan commit;
- dirty flag atau build provenance;
- service name dan PID;
- executable/command identity yang aman;
- process start time;
- data root dan database/artifact root;
- schema/data version yang relevan.

Identitas ini harus tersedia melalui health/version diagnostics tanpa mengekspos secret. Web juga harus mempunyai diagnostics/build marker yang dapat diaudit dari browser atau endpoint internal.

Startup harus:

- menolak PID hidup yang command line/repo/commit/data root-nya tidak sesuai;
- menolak port yang ditempati proses asing atau PAAX versi lain;
- tidak menganggap “PID hidup” sebagai bukti service sehat;
- menulis runtime manifest secara atomik setelah service benar-benar sehat;
- memverifikasi seluruh service melaporkan repo/commit/data root yang sama dengan startup yang diminta;
- gagal dengan pesan yang jelas bila terjadi mismatch, bukan meneruskan startup;
- tidak menyatakan READY sebelum HTTP 200, readiness dependency, build identity, dan data identity semuanya lolos.

Stop script harus:

- membaca manifest/PID yang tervalidasi;
- memastikan PID memang service PAAX terkait sebelum menghentikannya;
- mampu menghentikan runtime lama dari repo PAAX lain yang memakai data root/port yang sama;
- membersihkan PID/manifest stale secara aman;
- tidak menyentuh proses Node/Python lain milik pengguna.

### 4. Perbaiki bootstrap portable dan kompatibilitas Windows

- Pastikan `scripts/live_test/serve_db_with_fixture.py` pada keadaan committed melakukan bootstrap idempotent **dan kemudian benar-benar menjalankan DB service**.
- Pastikan resolusi manifest PLHUT tidak bergantung pada current directory yang kebetulan benar.
- Pastikan startup tidak menghapus atau menimpa database pengguna. Migrasi/bootstrap harus non-destruktif dan idempotent.
- Pastikan semua script dapat diparse dan dijalankan oleh shell yang dinyatakan di panduan. Hilangkan masalah encoding/dash dan tetapkan kebijakan encoding yang konsisten.
- Jangan menyembunyikan error service. Simpan log per-service di data root dan tampilkan lokasi log saat gagal.

### 5. Perbaiki panduan pengguna

Perbarui file berikut di worktree contextual:

`G:\paax-ai-contextual-integration\PANDUAN_INSTALASI_DAN_MENJALANKAN_SEMUA_SERVER_PAAX.md`

Panduan harus singkat tetapi tidak ambigu, dengan urutan:

1. memastikan terminal berada di `G:\paax-ai-contextual-integration`;
2. memeriksa branch/commit yang akan dijalankan;
3. menghentikan runtime PAAX lama secara aman;
4. menjalankan preflight;
5. menjalankan semua service;
6. memverifikasi identity manifest dan seluruh endpoint health/readiness;
7. membuka web hanya setelah status READY;
8. cara melihat log dan menghentikan server;
9. diagnosis “UI terlihat versi lama” yang secara eksplisit mengecek command line dan build identity.

Jangan gunakan kriteria “HTTP di bawah 500 berarti sehat”. Wajib HTTP 200 dengan response contract dan identity yang benar.

### 6. Pengujian Phase 1

Buat dan jalankan test yang membuktikan setidaknya skenario berikut:

- PID stale dibersihkan dengan aman.
- PID hidup dari `G:\paax-ai-main` ditolak saat contextual hendak dijalankan.
- Port ditempati proses non-PAAX ditolak tanpa membunuh proses tersebut.
- Service dengan commit/data root berbeda ditolak.
- Runtime yang benar dapat di-start dua kali secara idempotent tanpa duplikasi proses.
- Stop hanya menghentikan PID yang cocok dengan manifest.
- DB bootstrap pada data yang sudah ada tidak menghapus project/DEM/page.
- Missing auth key di luar testing gagal tertutup.
- PowerShell script lulus parser dan dapat menjalankan alur yang didokumentasikan.

Setelah test otomatis, lakukan smoke test nyata:

- stop seluruh runtime lama secara aman;
- start dari panduan yang telah diperbaiki;
- buktikan seluruh command line service berasal dari `G:\paax-ai-contextual-integration`;
- buktikan seluruh service melaporkan commit yang sama;
- buktikan data root benar dan database memuat project PLHUT dengan 88 halaman;
- buka Overview di browser nyata tanpa route interception dan pastikan build identity sesuai.

---

## Acceptance gate Phase 1

Phase 1 hanya boleh PASS jika seluruh kondisi ini terpenuhi:

- Tidak ada service aktif dari `G:\paax-ai-main` atau worktree lama.
- Enam service aktif berasal dari worktree contextual terbaru dan identity-nya konsisten.
- Startup menolak runtime silang-repo/commit/data-root.
- Tidak ada hardcoded credential/fallback key.
- Panduan dari terminal baru dapat direproduksi tanpa langkah tersembunyi.
- Database existing tetap utuh dan PLHUT 88 halaman dapat dibaca.
- Test otomatis dan smoke test nyata hijau.
- Semua perubahan telah masuk commit Phase 1 yang terpisah.

Jika satu syarat gagal, tulis FAIL beserta bukti. Jangan lanjut ke Phase 2.

## Output wajib

Buat laporan:

`G:\paax-ai-contextual-integration\PHASE_1_RUNTIME_IDENTITY_AND_STARTUP_FEEDBACK.md`

Laporan harus berisi root cause, file yang diubah, test dan hasil mentah ringkas, identity seluruh service, commit Phase 1, masalah tersisa, dan kalimat penutup tepat salah satu:

- `PHASE 1 PASS — READY FOR PHASE 2`
- `PHASE 1 FAIL — DO NOT CONTINUE`

Berhenti setelah menulis laporan. Kirim isi laporan tersebut kepada Wisnu untuk ditinjau sebelum Phase 2 diberikan.
