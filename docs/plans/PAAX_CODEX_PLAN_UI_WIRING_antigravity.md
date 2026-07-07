# PLAN WIRING UI & DASHBOARD REFACTOR (PAAX AI)
**Author:** Codex (Antigravity) - Mengambil alih sementara tugas Claude hingga Kamis.
**Referensi Konsep:** `G:\Dashboard\Engineering chat\engineering chat.txt` & `G:\Dashboard\palette warna\warna.txt`

## 🎯 Tujuan
1. Merombak UI Dashboard mengikuti konsep "Engineering Chat" dengan sidebar gelap dan area utama yang clean & smooth.
2. Melakukan *wiring* (penyambungan) halaman-halaman yang masih menggunakan data mock ke backend services (core-engine, db-api, site-agent, ai-orchestrator) yang sudah diselesaikan pada Task R2-R14.

---

## 📋 Pembagian Task

### TASK U1: Refactor Layout & Tema Dasar (Engineering Chat UI)
- **Tema & Warna:** Mengimplementasikan palet dari `warna.txt` (Sidebar: `#202A33` - `#3B454D`, Main: `#FAFAF8`, Text: `#1F2933`).
- **Sidebar Kiri:**
  - Segmented button tab: **Home** & **Project**.
  - **Tab Home:** Menu New Chat, Search, Schedule Task, Conversation (dengan filter Recent/Archived/All).
  - **Profil Bawah:** Avatar user dengan role (mis. "wisnu · Pro").
- **Animasi:** Menambahkan transisi halus (fade, slide) untuk pergerakan sidebar dan tab, menghindari pop-up kasar.

### TASK U2: Halaman Project & Modal Create
- **Halaman Projects:** Menampilkan grid card proyek (Nama, Deskripsi, Updated date, badge info).
- **Modal Create Project:** Form "What are you working on?" dan "What are you trying to achieve?". Animasi modal yang smooth.
- **Wiring DB Proyek:** Mengganti data mock proyek dengan fetch ke `db-api` (`GET /projects`, `POST /projects`).

### TASK U3: Halaman Main Chat & Composer
- **Welcome Screen:** Menampilkan tulisan "PAAX", "wisnu returns!", dan usage limit di tengah layar.
- **Composer Baru:** 
  - Placeholder: "Bring the problem. I'll break it down."
  - Dropdown Model: Lucent (default) vs Solace (complex).
  - Tombol "Add to Project" pengganti Co-work.
  - Quick Actions: Analisa Gambar, Buat RAB, Strategize, From Drive, From Gmail.
- **Chat Transitions:** Animasi smooth saat chat dimulai (welcome screen menghilang fade-out, composer turun, message muncul).
- **Wiring AI Orchestrator:** Menyambungkan chat ke `ai-orchestrator` (`http://localhost:3001`) via Server-Sent Events (SSE) untuk efek streaming, dengan PAAX branding & loading state.

### TASK U4: Connectors & Integrasi
- Menambahkan tombol "Connect Source" / "Manage Connectors" di halaman chat project.
- Menampilkan opsi: Google Drive, Gmail, Local Files, GitHub. (Fase UI scaffolding).

### TASK U5: Wiring Data Mock ke Backend Real (R14, R12, Core-engine)
- **Site Agent (`/proyek/[id]/site-agent`):** Hapus mock `siteLogs`, fetch ke `http://localhost:8085/site-logs` dan tampilkan deviasi dari `/deviation`.
- **Laporan Pagi (`/laporan`):** Fetch real report dari `db-api` (`http://localhost:8083/reports/morning`).
- **Schedule Milestone (`/proyek/[id]`):** Ganti mock `scheduleTasks` dengan fetch ke `core-engine` (`/schedule/s-curve`).

---

## ⚠️ Aturan Emas & Panduan UX (dari ui-ux-pro-max)
1. **Zero Calculation in UI:** Frontend hanya menampilkan data dan state, kalkulasi tetap di backend.
2. **Smooth Interaction:** Tidak ada elemen yang hilang tiba-tiba (menggunakan `framer-motion` atau CSS transisi).
3. **Hierarchy & Spacing:** Minimum touch target 44px, spacing konsisten, font hierarchy yang jelas.

---
**Mohon review plan di atas. Jika disetujui, saya akan mulai mengeksekusi TASK U1.**
