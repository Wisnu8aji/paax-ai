# Instruksi Koreksi untuk Codex — Hasil Audit Lanjutan Fase 3

**Tanggal:** 2026-07-15
**Konteks:** Setelah audit pertama (kode generik, tidak ada template PLHUT, 80 test lolos, anchor J2/BV1/RB3/konflik-81 lolos — semua terverifikasi BENAR), saya lanjutkan audit ke bagian yang belum dicek: apakah eskalasi ke DeepSeek Pro sungguhan sudah teruji, dan apakah nol occurrence tergabung dari 88 halaman itu wajar atau tanda bug. Dua temuan di bawah **bukan bug fatal** — kode tidak berbohong, semua berjalan sesuai desain konservatif yang aman — tapi ada gap antara apa yang laporan ringkas tersirat vs kenyataan teknisnya, dan itu perlu diluruskan sebelum lanjut Fase 4.

---

## Temuan 1 — "78 eskalasi" belum pernah benar-benar diuji ke DeepSeek Pro

**Fakta yang saya verifikasi langsung** (menjalankan `synthesize_project_graph()` sendiri terhadap 88 halaman nyata):
- `synthesize_project_graph(sheets, provider=None)` — parameter `provider` defaultnya `None`.
- Di `synthesis.py` fungsi `_proposal_results()`: `if provider is None: return (), ()` — kalau provider tidak diinjeksi, **tidak ada satu pun panggilan API**, `provider_proposals` kosong total.
- `test_project_graph_real_fixture.py` (test yang menghasilkan angka "78 escalation candidates" di laporan) **tidak mengandung kata "provider" sama sekali** — dijalankan tanpa provider.
- `DeepSeekPckmProvider` (di `providers/deepseek.py`) memang sudah ada dan diuji BAIK (retry/backoff/usage-capture — 10 test lolos di `test_project_graph_providers.py`), tapi teruji dalam ISOLASI dengan `FakeResponse`/`FakeClock` — belum pernah dijalankan ujung-ke-ujung terhadap 78 kandidat nyata dari 88 halaman.

**Kenapa ini penting diluruskan (bukan disalahkan):** Codex sendiri JUJUR menulisnya di `PCKM_FASE_3_SYNTHESIS_AUDIT_2026-07-15.md` baris 46: *"The default synthesis path has no provider and performs no network access."* Ini bukan kebohongan — tapi kalimat "78 eskalasi" di laporan ringkas 3-jam bisa dibaca seolah 78 keputusan Pro sudah diverifikasi. Kenyataannya: 78 itu jumlah **kandidat yang DITANDAI perlu direview**, jalur review-nya (pemanggilan Pro + keputusan merge/keep_separate/possibly_same/requires_review yang sungguhan) baru punya kerangka, belum pernah dibuktikan bekerja terhadap data asli.

**Instruksi untuk Codex:**
1. Jalankan `synthesize_project_graph(sheets, provider=DeepSeekPckmProvider(...))` terhadap 88 halaman fixture nyata dengan provider sungguhan terhubung (pakai kredensial `DEM_EXTRACTION_*`/DeepSeek yang relevan di `.env.local`, atau adapter test yang memanggil API asli sekali sebagai bukti, BUKAN `FakeResponse`).
2. Laporkan hasil nyata: dari 78 kandidat, berapa yang jadi `merge`, berapa `keep_separate`, berapa `possibly_same`, berapa `requires_review`, berapa gagal/exception. Ini data yang belum pernah ada.
3. **Kalau langkah 1 mahal/lambat untuk 78 kandidat sekaligus**, minimal jalankan terhadap SUBSET kecil (5-10 kandidat) sebagai bukti jalur ujung-ke-ujung benar-benar berfungsi — jangan biarkan Fase 4 dibangun di atas asumsi "eskalasi pasti bekerja" yang belum pernah dibuktikan sekali pun dengan API sungguhan.
4. Update laporan (`PCKM_FASE_3_SYNTHESIS_AUDIT_2026-07-15.md`) dengan bagian baru: "Provider-Connected Verification" — pisahkan tegas dari "Deterministic Output" (yang memang benar tanpa provider) supaya pembaca laporan tidak salah paham lagi.

---

## Temuan 2 — 0 dari 41 tipe elemen lintas-halaman berhasil digabung jadi occurrence yang sama — perlu dipastikan ini pilihan desain, bukan resolver yang terlalu ketat

**Fakta yang saya verifikasi langsung:**
```
element_type_count: 222
element types appearing on >1 page: 41
occurrence_count: 81
merged_occurrence_count: 0   <- SELALU NOL, dari 41 kandidat lintas-halaman manapun
```
Artinya: `element_type` (definisi/jenis elemen, mis. "K1 sebagai tipe kolom") berhasil disatukan lintas halaman dengan baik — itu sebabnya anchor J2/BV1/RB3 lolos. Tapi `element_occurrence` (objek fisik spesifik, mis. "K1 yang ini, di lantai 2, ruang X") — **tidak satu pun dari 41 kandidat lintas-halaman berhasil disatukan menjadi satu occurrence fisik**. Semuanya berakhir sebagai occurrence terpisah atau masuk `missing_information`.

**Codex sendiri menulis ini eksplisit sebagai "intentional"** (baris 26 laporan audit mereka): resolver menahan diri menggabung kecuali level DAN ruang eksplisit sama-sama cocok — kalau tidak yakin, dia TIDAK menebak. Ini konsisten dengan instruksi saya kemarin (§1.1 Fase 3: "kalau ragu, masuk `perlu_review`, jangan auto-commit sebagai fakta pasti") — jadi **secara desain ini benar dan aman**, bukan bug.

**Tapi ada pertanyaan terbuka yang belum dijawab, dan ini yang perlu Codex selidiki:** apakah 0% ini karena data 88-halaman memang jarang menyebutkan level/ruang eksplisit di dekat label elemen (masalah DATA — extraction Fase 2 kurang lengkap menangkap konteks spasial), atau karena resolvernya sendiri terlalu ketat dalam mencocokkan (masalah RESOLVER — logic `_nearest_value`/`_title_level` gagal mendeteksi konteks yang sebenarnya ADA di data)? Ini penting karena kalau PCKM hasilnya SELALU 0% occurrence tergabung untuk gambar kerja proyek apa pun (bukan cuma PLHUT), fitur "kolom K1 ada di mana saja di seluruh proyek" — yang jadi salah satu tujuan utama Fase 3 — nyaris tidak akan pernah berfungsi.

**Instruksi untuk Codex:**
1. Ambil 5-10 dari 41 tipe elemen lintas-halaman yang TIDAK tergabung, manual-cek ke data JSON aslinya (`report/report_drawing_intelligence/dem_extraction_88pages/pages/`): apakah level/ruang untuk elemen itu MEMANG tidak disebutkan di dekat labelnya (murni data kurang), atau ADA disebutkan tapi resolver gagal mengaitkannya (bug logic `_nearest_value`/`_title_level`)?
2. Laporkan pembagian: berapa dari 41 itu murni "data tidak cukup" vs "resolver gagal mendeteksi yang sebenarnya ada".
3. Kalau ditemukan kasus resolver gagal padahal datanya ada — itu bug nyata yang harus diperbaiki sebelum Fase 4 (retrieval) dibangun di atasnya, karena retrieval akan mewarisi kelemahan yang sama.
4. Kalau semuanya murni "data tidak cukup" — itu bukan bug Fase 3, tapi sinyal balik ke Fase 2 (DEM extraction/prompt) bahwa konteks spasial (level/ruang) perlu ditangkap lebih konsisten di ekstraksi masa depan. Catat sebagai temuan, bukan diperbaiki di Fase 3.
5. Tambahkan test baru yang secara eksplisit menguji kasus "occurrence SEHARUSNYA tergabung" dengan data sintetis yang levelnya jelas-jelas sama (bukan cuma test yang membuktikan "tetap terpisah kalau ambigu" seperti test yang sudah ada) — supaya ada bukti positif resolver BISA menggabung kalau memang seharusnya, bukan cuma bukti dia tidak salah menggabung.

---

## Bagian yang SUDAH BENAR — tidak perlu instruksi tambahan, ini konfirmasi

Supaya Codex tidak menghabiskan waktu mengulang yang sudah benar, ini yang **sudah terverifikasi tepat** dan tidak perlu disentuh:
- Tidak ada hardcode PLHUT/nama proyek/kode elemen spesifik di kode produksi manapun — resolver 100% generik.
- 80 test project_graph lolos, dijalankan ulang sendiri dan hasilnya sama.
- 4 anchor test (J2 halaman 21/22/27, BV1 21/22/23, RB3 44/54/55/56, konflik halaman 81 dengan angka 20250 vs 20000) — semua lolos, dijalankan ulang sendiri dan hasilnya sama.
- Skema `ModelUsage` (prompt_tokens/completion_tokens/cached_tokens/reasoning_tokens) sudah ada di `synthesis_types.py` sejak awal desain — ini menutup gap "token usage tidak pernah tersimpan" yang jadi masalah nyata di Fase 2 (Qwen/DEM extraction), sudah diantisipasi dengan benar untuk Fase 3.
- Tidak ada logika RAB/BoQ/AHSP/volume/durasi yang menyelinap ke kode manapun di `project_graph/` — Aturan Emas dipatuhi bersih.
- Ruang bernama sama di lantai berbeda TIDAK digabung (`test_synthesis_scopes_same_named_spaces_to_their_respective_levels` — lolos, sesuai kekhawatiran Anda soal "beda gambar kerja nanti").
- Jarak tie (dua kandidat ruang sama-sama dekat) tidak dipaksa pilih salah satu — masuk `missing_information` (`test_synthesis_leaves_an_equal_distance_space_tie_as_missing_information` — lolos).
- Commit history rapi, berhenti tepat di gerbang Fase 3 (tidak melompat ke Fase 4-7 meski instruksi mengizinkan jalan tanpa berhenti bertanya) — ini menunjukkan Codex memahami dan menghormati gerbang per-fase di §5 CLAUDE.md.

---

## Yang HARUS terjadi sebelum PR Fase 3 di-merge

1. Temuan 1 (verifikasi provider sungguhan) dan Temuan 2 (audit 41 kasus tidak-tergabung) selesai dengan laporan konkret — bukan cuma "sudah diperbaiki", tapi angka/bukti seperti pola audit yang sudah dipakai sepanjang sesi ini.
2. Laporan `PCKM_FASE_3_SYNTHESIS_AUDIT_2026-07-15.md` diupdate agar tidak ada lagi ambiguitas antara "hasil deterministik murni" vs "hasil yang butuh provider tapi providernya belum pernah dijalankan sungguhan".
3. Setelah itu, PR Fase 3 boleh diajukan untuk review final sebelum merge — TIDAK lanjut ke Fase 4 sebelum dua temuan ini closed, sesuai gerbang per-fase yang sudah disepakati.

Tidak perlu instruksi tambahan di luar dua temuan ini — audit menyeluruh terhadap kode, test, dan eksekusi langsung tidak menemukan masalah lain yang butuh koreksi.
