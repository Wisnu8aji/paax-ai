# Legacy — Kode lama PAAX sebelum v0.6

Folder ini berisi **kode lama PAAX yang diarsipkan, tidak aktif**, dan **bukan bagian dari jalur build utama** v0.6.
Disimpan untuk referensi sejarah dan agar logika/aset yang masih relevan dapat dipindahkan ke fase berikutnya bila diperlukan.

> **Tidak ada kode di sini yang dijalankan oleh build, test, atau runtime v0.6.** Jangan menambahkan dependensi dari kode aktif ke folder ini.

## Isi

| Folder | Asal | Keterangan |
| --- | --- | --- |
| `streamlit-v0.1/` | v0.1 | Prototipe antarmuka berbasis Streamlit. |
| `vite-v0.2/` | v0.2 | Aplikasi demo Vite + Express (tab RAB/Assistant/Drawing/Schedule/Rates). |
| `core-engine-v0.5/` | v0.3–v0.5 | Engine FastAPI lama (`app/domain/...`, `app/api/...`) termasuk **export berbasis template Excel**. Diganti pada v0.6 oleh engine deterministik baru di `services/core-engine`. |

## Kenapa `core-engine-v0.5/` diarsipkan?

v0.6 ("Deterministic Foundation Release") menerapkan **aturan emas**: semua angka berasal dari engine deterministik berbasis koefisien AHSP, **tanpa output berbasis template**. Engine v0.5 mengandung jalur export template (`app/domain/export/excel_template_engine.py`, `placeholders.py`) yang tidak sesuai aturan tersebut, sehingga inti perhitungan dipindahkan ke engine baru.

Komponen v0.5 yang berpotensi berguna di fase berikutnya (mis. BoQ generator, validasi, skenario jadwal) tetap tersedia di sini untuk direkonsiliasi pada v0.7+.
