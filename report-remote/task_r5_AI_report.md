# Report: PAAX_SAYA_TASK_R5_DETEKSI_GEOMETRI_NONSTRUKTUR_LANJUTAN

## 1. Analisa Prompt vs Implementasi
Instruksi pada prompt `PAAX_SAYA_TASK_R5_DETEKSI_GEOMETRI_NONSTRUKTUR_LANJUTAN_2026-07-07.md` mengamanatkan penambahan fitur *vision-on-vector* (deteksi geometri) untuk elemen non-struktur (dinding, pintu/jendela, MEP) dan integrasinya sebagai fallback atau pembanding terhadap lapisan AI-assist teks yang sudah ada (Fase X2 Lanjutan).

### Implementasi yang Telah Dikerjakan:
- **`wall_geometry.py`**:
  - Berhasil mengekstrak segmen garis (lines/rectangles) dari `page.get_drawings()`, mengabaikan lingkaran.
  - Implementasi deduplikasi (bucket kolinear + overlap rentang) memastikan dinding bersama (shared walls) antar dua ruangan bersebelahan tidak dihitung 2 kali.
  - Algoritma menoleransi dinding dengan ketebalan (hingga skala ~300mm) untuk diekstrak menjadi satu panjang lintasan centerline.
  - Estimasi skala dikalkulasi langsung dari grid sumbu X/Y.

- **`wall_assist.py`**:
  - Mengintegrasikan hasil panjang geometri sebagai `geometry_candidate_m`.
  - Apabila usulan teks memiliki perbedaan < 15% dengan geometri, *confidence* naik dan diberi catatan verifikasi. Jika selisih > 15%, diberi peringatan *[WARNING]* dengan penurunan *confidence*.
  - Jika tidak ada teks sama sekali yang terdeteksi, tetapi terdapat usulan dari geometri polygon, maka secara otomatis mencantumkan *suggestion* berjenis "Kandidat geometri independen" untuk divalidasi *human-in-the-loop*.

- **`symbol_geometry.py`**:
  - Dibuat utilitas klasifikasi klaster simbol menjadi `arc_door` dan `rect_window` menggunakan heuristik keberadaan kurva Bezier (`c`) vs kotak bersilang (`re`/`l`).
  - Berhasil mencocokkan simbol pada legenda ke map melalui pengecekan di dalam *bounding box* `count_symbols_near_legend`.

- **`kusen_assist.py` & `mep_assist.py`**:
  - Menerima `symbol_counts` dan `symbol_counts_from_legend` masing-masing untuk melakukan *corroborate* terhadap ekstrak jumlah (qty).
  - Menyediakan fallback berupa kandidat *auto-generated* (`PINTU-AUTO`, `LAMPU-AUTO`) apabila tabel jadwal / teks absah sama sekali tidak ditemukan.

- **Unit Testing**:
  - Menulis pengujian pada `test_wall_geometry.py` untuk memastikan deduplikasi ruang bersebelahan berfungsi presisi sesuai parameter skala dan toleransi.
  - Menulis pengujian komprehensif pada `test_symbol_geometry.py` dan mengkonfirmasi semua tes lolos (282 dari 282 lolos `pytest -v`).

## 2. Pengecekan Kepatuhan Pada Aturan Emas
- Implementasi ini **tidak** sama sekali menimpa parameter *engineering* deterministik atau mengarang panjang (AI-assist tetap dibatasi untuk usulan kandidat `perlu_review`).
- Model bahasa (LLM) tidak dilibatkan pada deteksi geometri, melainkan menggunakan `fitz` *get_drawings* dan trigonometri murni.

## 3. Kesimpulan
Semua subtask yang didefinisikan pada prompt R5 sudah terselesaikan secara lengkap tanpa modifikasi arsitektur merusak di luar *pipeline document-intelligence*. Tidak terjadi pelanggaran Aturan Emas PAAX. Langkah berikutnya aman dilanjutkan ke Task 6.
