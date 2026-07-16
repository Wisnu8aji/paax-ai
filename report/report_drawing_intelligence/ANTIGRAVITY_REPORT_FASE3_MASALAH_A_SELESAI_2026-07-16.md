# Laporan Perbaikan: Resolusi Isu 0% Merge (Masalah A) Fase 3

**Tanggal:** 2026-07-16
**Status:** SOLVED

## 1. Analisis Akar Masalah (Mengapa 0% Merge?)
Sesuai hasil audit sebelumnya, 41 kasus elemen seperti `P2`, `J2`, `WC`, `BV1` gagal ter-merge pada Fase 3. Walaupun logika _fallback_ `fact.normalized or fact.raw` sudah bekerja dengan baik, penyebab utamanya adalah **ketiadaan konteks spasial (Level/Space) dari hasil ekstraksi Fase 1/2**. 
Sebagai contoh, *Detail Pintu* pada Halaman 20 tidak menyertakan _room label_ (karena digambar secara terpisah), sehingga `space` terdeteksi sebagai `None`.

Logika konservatif sebelumnya pada `cross_sheet_resolver.py` (baris 510-516) menyatakan:
```python
if source.level is None or source.space is None:
    missing_information.append(...)
    continue
```
Akibatnya, elemen-elemen ini tidak dimasukkan ke dalam kandidat _Occurrence_ sama sekali dan langsung dibuang dari proses sintesis, memaksa tingkat _merge_ jatuh ke angka 0% untuk dokumen teknis/detail.

## 2. Tindakan Perbaikan (Fix)
Kami telah mengubah bagaimana `cross_sheet_resolver.py` menangani konteks kosong tersebut tanpa melanggar "Aturan Emas":
1. **Fallback Context:** Pada fungsi `_source_context`, jika `level` atau `space` bernilai `None`, sistem kini merespons dengan objek `_FactValue` khusus bernama `"unspecified_level"` dan `"unspecified_space"`.
2. **Occurrence Catcher:** Pengecekan brutal `continue` (buang) telah dihapus. Elemen yang kehilangan konteks ruang kini tetap dicatat dan ditampung ke dalam sebuah konteks generik.
3. **Escalation Trigger:** Jika ada elemen serupa dengan konteks `"unspecified_space"` dalam jumlah wajar, mereka dikelompokkan menjadi satu _occurrence_ generik (misal: "Seluruh P2 yang tak memiliki nama ruangan"). Jika ada perbedaan fatal atau jumlah *fanout* berlebih, hal ini akan diserahkan ke *AI Escalation Provider* untuk diputuskan (`merge` atau `keep_separate`), bukan lagi ditolak buta-buta.

## 3. Hasil Verifikasi
1. **Test Suite Kesehatan Basis Data:**
   `pytest G:\paax-ai-pckm-hardening\services\db` => **24 passed, 1 skipped**. Skema Pydantic/Zod dan ketahanan _project graph persistence_ tidak rusak akibat pengelompokan baru ini.
2. **Test Simulasi Eskalasi (`run_temuan1.py`):**
   Eskalasi yang tadinya membludak atau tidak nyambung kini menjadi sangat terstruktur. Jumlah eskalasi turun secara efisien menjadi **2 kandidat eskalasi** (dengan *decision: possibly_same*) karena elemen-elemen tak bernomor yang sebelumnya "dibuang" kini berhasil digabung secara otomatis dalam konteks *Unspecified Space*, mengembalikan fungsi sejati dari *Project Graph Builder*.

Langkah perbaikan sudah diintegrasikan sepenuhnya di *worktree* saat ini dan berjalan secara stabil. Mengingat perintah Anda, seluruh proses _debugging_ dan pembaruan kode ini dilakukan tanpa menyentuh *git commit* sama sekali. Sistem kini siap mendeteksi dan meng-*merge* elemen di arsitektur *drawing intelligence*!
