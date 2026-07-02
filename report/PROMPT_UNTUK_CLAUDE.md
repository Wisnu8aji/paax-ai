# PROMPT UNTUK CLAUDE (Deep Reasoning & Critical Review)

**Copy dan paste seluruh teks di bawah ini ke dalam chat Anda bersama Claude:**

***

**<SITUASI DAN PERAN>**
Anda adalah **Lead Architect & Senior Civil Engineer AI** untuk proyek PAAX AI. Sebelumnya, _agent_ Codex telah menjalankan tugas implementasi Backend (Lapis 2B - Core Engine) untuk proyek PLHUT Surakarta. Pekerjaan Codex mencakup: modul `smkk.py`, `mep_advanced.py`, _update_ `takeoff.py` (penggunaan bekisting & BBS), dan `test_plhut_anchor.py`.

Saya menggunakan model dengan kemampuan _reasoning_ tingkat tinggi untuk sesi ini. Saya menuntut analisa kritis, mendalam, tanpa kompromi, dan berorientasi ke masa depan (v1.0 & v2.0). Jangan beri jawaban standar atau "Yes-Man". Jika ada yang salah, katakan salah dan **perbaiki**.

**<INSTRUKSI UTAMA>**
1. **BACA DAN ANALISA:**
   - Baca file laporan: `G:\paax-ai-main\report\REPORT_PLHUT_CODEX_SESSION.md`.
   - Baca file kode yang diubah Codex: `services/core-engine/app/tkg/takeoff.py`, `mep_advanced.py`, `smkk.py`, `models.py`, dan `tests/test_plhut_anchor.py`.
   - Baca sumber kebenaran (Blueprint): Direktori `G:\brain\`, `docs/MASTER_PLAN.md`, `docs/ai-map/START_HERE.md`, dan `AGENTS.md`.

2. **CRITICAL CODE & LOGIC REVIEW (Tugas Berat 1):**
   - **Evaluasi Rumus & Logika:** Codex mengklaim telah mengimplementasikan "Aturan Emas AI" (Deterministik & No-Assumption). _Pressure-test_ klaim ini. Apakah logika SMKK (K3) Codex sudah 100% mematuhi AHSP Permen PUPR? Apakah pendekatan `usage_factor` pada bekisting dan akumulasi BBS besi bisa _scale up_ untuk gedung 10 lantai?
   - **Cari Celah (Edge Cases):** Identifikasi kasus di mana rumus Codex akan gagal atau memuntahkan hasil yang tidak masuk akal (misal: waste besi overlap, perhitungan asuransi yang terlalu linier, atau over-simplifikasi pipa MEP).
   - **Future-proofing:** Analisa apakah struktur data `ManualTakeoffResult` dan TKG Schema (Zod/Pydantic) saat ini sudah siap untuk menerima input _Vision AI_ dari _Document Intelligence_ (v1.0). Jika tidak, apa yang harus diubah agar tidak membentur jalan buntu di masa depan?
   - **TINDAKAN:** Eksekusi perbaikan langsung pada kode backend yang cacat, kurang lengkap, atau tidak _future-proof_.

3. **EKSEKUSI FRONTEND UI/UX & DATA LAYER (Tugas Berat 2):**
   - Codex telah meninggalkan task-task berikut (tercatat di `task.md`) untuk Anda selesaikan:
     - **Task 5:** Pencocokan Data AHSP Lokal Surakarta (Data Layer).
     - **Task 6:** Refactoring Drawing Intelligence UI & UX Estetik (Frontend).
     - **Task 8:** Frontend RAB Editor & Browser AHSP.
     - **Task 9:** Sistem Triage Review Berbasis UI.
   - **Standar Estetika:** Rancang dan refactor UI aplikasi web (Next.js 14, Tailwind, shadcn/ui) menjadi sangat elegan, premium, _glassmorphism_ yang fungsional, responsif, dengan mikro-animasi. _Dashboard engineering_ ini tidak boleh terlihat seperti MVP murahan. Harus wow.
   - **Triage Review:** Bangun komponen UI di mana item dari _core-engine_ yang memiliki status `needs_review` (karena data kurang/asumsi) dapat di-_triage_ oleh _engineer_ manusia dengan mudah.

4. **PENYELESAIAN TUNTAS:**
   - Lakukan semuanya secara _end-to-end_. Jangan berhenti sampai seluruh kelemahan Codex ditambal dan fitur Frontend/Data Layer selesai. 
   - Lakukan _thinking process_ yang mendalam (jabarkan _trade-off_ arsitektur Anda secara eksplisit).

**<OUTPUT YANG DIHARAPKAN>**
- _Breakdown_ analisa kritis terhadap kode Codex.
- Kode perbaikan backend yang diimplementasikan.
- Komponen UI/UX Frontend yang siap pakai.
- Penjelasan filosofi arsitektur mengapa Anda memilih solusi tersebut.

***
