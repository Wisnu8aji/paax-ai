# PAAX AI — Paket Portabel PLHUT Surakarta

Paket ini adalah baseline pengembangan PAAX Drawing Intelligence dan agentic system. Ia membawa **PDF asli PLHUT 88 halaman**, fixture DEM/graph, Civil Work Items terverifikasi, serta runtime portable yang mempertahankan proyek dan data lokal.

## Jalankan

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Setup-PLHUT-Local.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\portable\Start-PLHUT-Local.ps1
```

Buka `http://127.0.0.1:3000`.

Perilaku wajib:

- `PLHUT Surakarta` selalu terdaftar dan menjadi default bila tidak ada active project valid;
- restart tidak menghapus database, koreksi, calculation, chat, atau project tambahan;
- Drawing Intelligence menampilkan halaman PDF asli dan 88 sheet;
- quantity menggunakan Civil Work Item/Measurement Fact terverifikasi serta Core Engine;
- Command Room tetap terikat ke project yang dipilih, terlepas dari status connector;
- workbook `Perhitungan Backup` dapat diekspor.

Internal service key dibuat lokal dan tidak didistribusikan. API key model eksternal harus diisi sendiri bila jawaban generatif live diperlukan.

Baca [PANDUAN-PORTABEL-PLHUT.md](PANDUAN-PORTABEL-PLHUT.md) untuk arsitektur, verifikasi, dan troubleshooting lengkap.
