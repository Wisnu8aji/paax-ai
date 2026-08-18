# INSTRUKSI GEMINI — PHASE 3
## Mission, Agentic Review, Integrasi Penuh, dan Final Acceptance yang Jujur

### Prasyarat dan model

Gunakan **Gemini 3.6 Flash High Thinking**. Jalankan hanya jika Phase 1 dan Phase 2 masing-masing berakhir PASS. Kerjakan pada branch/worktree contextual yang sama dan pertahankan commit terpisah per kelompok perbaikan.

Phase ini adalah gerbang final. Jangan memakai klaim, screenshot, atau laporan lama sebagai pengganti pengujian runtime terbaru.

### Aturan final

- Engine deterministik tetap satu-satunya pembuat angka final.
- Agent/LLM hanya boleh mengklasifikasi, mengusulkan binding/perbaikan, memanggil tool yang diizinkan, dan menjelaskan hasil engine.
- Semua tindakan agent yang mengubah input harus membutuhkan policy/RBAC, validasi deterministik, audit trail, dan approval manusia bila berpengaruh pada quantity/handoff.
- AI failure harus memiliki fallback manual lengkap.
- Tidak ada secret di source, log, screenshot, atau laporan.
- Maksimum live AI test adalah **5 panggilan per fitur**, hanya setelah seluruh offline gate hijau. Gunakan model **DeepSeek V4 Flash** melalui API key Drawing Intelligence pada environment lokal. Jangan menyalin key ke repo atau output.
- Jangan menjalankan ekstraksi AI penuh atas 88 halaman. Pilih sampel kecil yang representatif untuk menguji jalur AI.
- Graphify-first sebelum perubahan dan `graphify update .` setelah perubahan.

---

## Bukti baseline yang harus ditutup

1. Mission pada runtime lama crash dengan:

   `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`

   sumber terlihat pada `statusDotColor` di `apps/web/src/components/drawing-intelligence/workspace/status-bar.tsx`. Latest contextual pernah menambah normalisasi status, tetapi perbaikannya wajib diverifikasi pada runtime/data nyata dan seluruh variasi response, bukan diasumsikan selesai.

2. Dokumen status saling bertentangan:

   - `FINAL_AUDIT_B2_EVIDENCE_LEDGER.md` menyatakan bukan deklarasi selesai, retrieval insufficient, beberapa gate FAIL, dan overall incomplete.
   - `SUPER_BIG_PLAN_FINAL_ACCEPTANCE.md` masih `IN_PROGRESS` dan Phase 11E belum selesai.
   - Laporan feedback lain menyatakan 61/61 atau 100%.

   Runtime nyata membuktikan klaim 100% lama tidak valid. Semua laporan harus direkonsiliasi dengan bukti terbaru.

3. Super Big Plan revisi mencakup phase 0–20 dan global Definition of Done, tetapi laporan completion yang ditemukan tidak mencakup seluruh phase secara konsisten. Jangan menganggap nomor phase sebagai bukti implementasi.

4. Feedback Word `G:\REVISI\feedback 1.docx` berisi tuntutan fungsi nyata, antara lain performa viewer seperti OpenTakeoff, gambar asli tidak terkompresi, takeoff benar, seluruh pekerjaan bukan delapan item, Mission berfungsi, Handoff lengkap, tiga mode sheet, classification universal, dan AI fallback terkontrol.

---

## Target Phase 3

Menutup seluruh integrasi tersisa, membuat Mission/agentic system aman dan berguna, lalu mengaudit PAAX dari startup bersih sampai browser nyata terhadap Super Big Plan dan feedback Word tanpa klaim palsu.

## Langkah kerja wajib

### 1. Perbaiki Mission sebagai sistem, bukan hanya null guard

- Reproduksi crash dengan data runtime nyata sebelum perubahan.
- Telusuri kontrak status dari backend sampai component menggunakan Graphify.
- Normalisasi data di boundary schema/API; UI tetap defensif terhadap missing/unknown status.
- Pastikan loading, empty, degraded, error, retry, dan ready state berbeda.
- Mission harus dapat dibuka langsung, melalui navigasi, setelah reload, dan setelah service restart.
- Mission harus menampilkan run/task nyata yang tersimpan, bukan card dummy.
- Semua action yang tersedia harus mengarah ke backend/tool nyata dan memberikan hasil/audit yang dapat ditelusuri.

### 2. Finalisasi agentic system dengan batas keselamatan

Agent perlu membantu bagian yang tidak dapat diselesaikan fast-path engine/rules, tetapi tidak boleh menggantikannya.

Pastikan:

- tool registry/allowlist eksplisit;
- RBAC per estimator/PM/lapangan/owner;
- structured input/output tervalidasi;
- model routing, timeout, retry terbatas, cancellation, dan circuit breaker;
- persistent run state dan recovery setelah restart;
- audit log berisi model, prompt/version, input reference, output, reasoning summary, tool call, actor, timestamp, dan keputusan manusia tanpa menyimpan secret;
- agent tidak dapat menulis quantity/RAB final;
- perubahan input engine melalui proposal → deterministic validation → human approval → engine recomputation;
- hasil engine menyertakan receipt dan dipresentasikan agent hanya sebagai penjelasan;
- ketika AI/key/provider gagal, pengguna dapat menyelesaikan klasifikasi/review secara manual.

### 3. Tutup Review, Takeoff, Quantities, dan Handoff sebagai satu workflow

Uji dan perbaiki alur end-to-end nyata:

1. pengguna memilih sheet/page nyata;
2. sistem menampilkan gambar/evidence;
3. rule engine menghasilkan classification/candidate;
4. AI fallback hanya untuk ambiguity yang dipilih;
5. proposal masuk Review;
6. user approve/reject/correct;
7. valid input masuk engine;
8. engine membuat quantity receipt;
9. Quantities menampilkan hasil terverifikasi dan status item lain;
10. Handoff mengekspor/menyerahkan hanya hasil yang sah.

Pastikan correction tidak hilang saat reload/restart, tidak menghasilkan duplikasi pada retry, dan seluruh transisi memiliki audit trail. Takeoff dan Handoff tidak boleh membaca fixture atau menghitung di frontend/LLM.

### 4. Audit UI/fungsi seluruh Drawing Intelligence

Lakukan browser audit nyata terhadap paling sedikit:

- Overview/project selection;
- Files;
- Sheets — Level, Classification, Original Order;
- Analyze;
- Review;
- Takeoff;
- Quantities;
- Mission;
- Handoff;
- Command Room yang terkait tanpa menghapus/memindahkan file terlindungi.

Untuk setiap halaman catat:

- data source dan identity runtime;
- loading/empty/error/success state;
- network response;
- console error;
- persistence setelah reload;
- apakah data nyata atau fixture;
- evidence visual yang membuktikan gambar benar-benar dirender.

Jangan menganggap SVG icon dengan `role=img` sebagai gambar kerja. Validasi elemen viewer/canvas/tile dan bandingkan halaman dengan PDF sumber.

### 5. Performance dan kualitas visual

Ukur pada PLHUT 88 halaman, bukan hanya fixture 53 halaman:

- cold first meaningful drawing/page load;
- warm page switch;
- zoom/pan responsiveness;
- long tasks;
- memory/heap growth setelah navigasi berulang;
- cache hit dan eviction;
- source resolution dan ketepatan halaman.

Tetapkan budget yang masuk akal berdasarkan baseline perangkat dan target Super Big Plan. Bila target lama tidak dapat dicapai, laporkan hasil faktual dan bottleneck; jangan mengganti angka atau menyembunyikan failure. Pastikan viewer tidak menyimpan ulang PDF/gambar sumber dalam bentuk terkompresi lossy.

### 6. Live AI test yang dibatasi

Hanya setelah offline tests hijau:

- gunakan environment lokal Drawing Intelligence;
- model DeepSeek V4 Flash;
- maksimum 5 panggilan untuk setiap fitur AI yang benar-benar diuji;
- gunakan subset halaman ambigu yang representatif, bukan 88 halaman;
- catat request ID/model/timestamp/status/latency dan hasil validasi tanpa key;
- uji success, invalid output, provider failure/fallback manual, dan human approval;
- hentikan pemanggilan untuk fitur tersebut setelah 5 kali, walaupun belum PASS;
- kegagalan live AI tidak boleh diubah menjadi PASS hanya karena mock test lulus.

### 7. Audit penuh Super Big Plan dan feedback Word

Baca ulang secara lengkap:

- `docs/plans/drawing intelligence/Versi 1.1/PAAX_DRAWING_INTELLIGENCE_SUPER_BIG_PLAN_REVISED.md`;
- `G:\REVISI\feedback 1.docx`;
- seluruh laporan Phase 0–11 dan final audit terkait;
- Phase 1 dan Phase 2 feedback terbaru.

Buat matriks atomik yang memetakan **setiap** requirement ke:

- status PASS/FAIL/BLOCKED/NOT APPLICABLE;
- implementasi/file/symbol;
- data evidence;
- test otomatis;
- browser evidence;
- commit;
- gap dan pemilik tindak lanjut.

Jangan menandai PASS jika hanya ada komponen tetapi jalur runtime gagal. Jangan menggunakan jumlah phase/report sebagai persentase completion. Requirement tanpa bukti tetap FAIL atau BLOCKED.

Perbaiki laporan lama yang menyesatkan. Pertahankan sejarah audit, tetapi beri superseded marker dan tautan ke hasil terbaru; jangan menghapus bukti failure lama. Sinkronkan setidaknya:

- `SUPER_BIG_PLAN_FINAL_ACCEPTANCE.md`;
- `FINAL_AUDIT_B2_EVIDENCE_LEDGER.md`;
- laporan `FEEDBACK1_ACCEPTANCE_AUDIT` terkait;
- status Phase 11E/final acceptance.

### 8. Verifikasi dari keadaan committed dan startup bersih

- Commit semua perubahan produk yang memang diperlukan; jangan sertakan secret, log runtime besar, cache, DB, atau artifact pengguna.
- Stop semua service dengan script yang telah diperbaiki.
- Pastikan port/proses bersih.
- Jalankan kembali hanya dari panduan dan branch committed.
- Verifikasi identity seluruh service.
- Jalankan migrasi/bootstrap non-destruktif terhadap data portable existing.
- Lakukan seluruh browser smoke/final test tanpa hot patch atau dev state tersembunyi.
- Jalankan backend tests, frontend tests/typecheck/build, schema parity, security/no-dummy, migration, engine golden anchors, dan Graphify update.
- Periksa git diff/status agar tidak ada perubahan penting tertinggal atau artifact kotor ikut commit.

### 9. Integrasi Git

- Jangan commit ke `main` dan jangan merge sendiri.
- Push branch `codex/...` yang memuat commit Phase 1, Phase 2, dan Phase 3.
- Buka PR dengan ringkasan arsitektur, migrasi/data impact, test evidence, keamanan, rollback, dan daftar gap bila ada.
- Berhenti setelah PR. Merge hanya oleh owner setelah review owner + Claude sesuai `AGENTS.md`.

---

## Final acceptance gate

Produk hanya dapat dinyatakan final bila semuanya benar:

- server yang berjalan terbukti berasal dari worktree/commit terbaru;
- startup bersih reproducible melalui panduan;
- PLHUT 88/88 halaman terindeks dan seluruh gambar/thumbnails nyata tampil;
- Sheets memiliki tiga mode dan classification yang dapat diaudit;
- Review viewer merender source asli tanpa placeholder/kompresi lossy;
- Quantities bukan delapan fixture dan seluruh angka memiliki engine receipt;
- seluruh work-item candidate tercatat tanpa silent drop;
- Mission dapat dibuka dan agentic workflow persisten/aman;
- Review/Takeoff/Quantities/Handoff terhubung end-to-end;
- tidak ada error console/network produk pada jalur audit;
- AI fallback lulus validasi/human-review atau secara jujur dinyatakan gagal;
- seluruh feedback Word dan Super Big Plan mempunyai bukti per requirement;
- semua test wajib hijau;
- tidak ada hardcoded key, dummy production data, atau perubahan schema satu sisi;
- branch dipush dan PR dibuat, tanpa merge otomatis.

Jika ada satu requirement material gagal, status final bukan 100%.

## Output wajib

Buat tiga output di worktree contextual:

1. `PHASE_3_MISSION_AGENTIC_INTEGRATION_FEEDBACK.md`
2. `FINAL_FEEDBACK1_AND_SUPER_BIG_PLAN_ACCEPTANCE_AUDIT.md`
3. perbarui `PANDUAN_INSTALASI_DAN_MENJALANKAN_SEMUA_SERVER_PAAX.md` hanya bila final clean-start menemukan koreksi tambahan.

Laporan final harus mencantumkan commit/branch/PR, runtime identity, data counts, engine receipt counts, browser evidence, performance evidence, live AI budget yang terpakai per fitur, hasil test, dan semua gap.

Akhiri dengan tepat salah satu deklarasi:

- `FINAL PASS — READY FOR OWNER + CLAUDE REVIEW; NOT MERGED`
- `FINAL FAIL/BLOCKED — NOT READY FOR MERGE`

Berhenti setelah itu. Jangan merge ke `main`.
