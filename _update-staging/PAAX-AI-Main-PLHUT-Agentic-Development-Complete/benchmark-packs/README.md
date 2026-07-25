# PAAX External Benchmark Packs

Folder ini menampung **manifest**, bukan file proyek berlisensi yang tidak boleh dibundel. Setiap benchmark wajib memiliki URL/sumber, lisensi, SHA-256, tipe proyek, disiplin, jumlah halaman, ground-truth reviewer, split, serta pertanyaan Command Room.

Prosedur:
1. Unduh byte asli secara legal dan kunci SHA-256.
2. Pisahkan `train/dev/hidden-holdout`.
3. Buat ground truth independen oleh minimal dua reviewer pada sampel kritis.
4. Jalankan PAAX, OpenConstruction baseline, dan native extractor dengan scope yang sama.
5. Ukur sheet identity, zone IoU, OCR, table cells, physical instances, measurement, calculation, citations, abstention, latency, dan reviewer correction burden.
6. Jangan menggunakan keluaran PAAX sebagai ground truth.

Gunakan `manifest.example.json` sebagai kontrak awal. Paket PLHUT tetap benchmark terkunci internal, sedangkan klaim generalisasi memerlukan beberapa proyek independen.
