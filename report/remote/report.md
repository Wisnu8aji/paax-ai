# Report Wiring UI (Tanpa Redesign)

## 1. File yang Diubah
- `apps/web/src/app/(dashboard)/layout.tsx` (Menggunakan Fable `SideRail`, bukan sidebar lama)
- `apps/web/src/app/(dashboard)/dashboard/page.tsx` (Wiring ke `useProjects`)
- `apps/web/src/app/(dashboard)/command-room/page.tsx` (Wiring `fetch('/api/ai/chat')` untuk chat dan integrasi projects asli via `useProjects`)
- `apps/web/src/app/(dashboard)/proyek/page.tsx` (Wiring list projects)
- `apps/web/src/app/(dashboard)/proyek/[projectId]/page.tsx` (Wiring single project overview)
- `apps/web/src/app/(dashboard)/proyek/[projectId]/layout.tsx` (Wiring navigation & context proyek aktif)

## 2. Wiring Backend yang Diperbaiki
- **Projects (List, Create, Update, Delete):** Terhubung melalui context `useProjects` yang membaca ke `projectRepository` (mendukung Firestore / Postgres DB API / fallback localStorage sesuai konfigurasi).
- **Project Detail:** Terhubung ke data spesifik dari context (termasuk status warning, progress, dan health indicator).
- **RAB Draft:** Membaca summary `rabValue` dari projects repository dan menampilkannya di stat card. Detail RAB terpisah di `rab-tester` dan repository.
- **Engineering Chat / Command Room:** Terhubung ke API route `/api/ai/chat` dan parser `readEngineeringChatResponse`. Daftar Project, Create Project, Add to Project, detail project, dan New Chat per project sekarang memakai project asli dari `useProjects`; `chat-history` hanya menyimpan riwayat percakapan lokal dengan `folderId = project.id`.

## 3. UI Fable yang Dipertahankan
- **Struktur Shell Dasar:** `layout.tsx` tetap mengusung layout dengan `SideRail` dan background gelap (Fable Premium).
- **Visual & Style:** Komposisi class seperti `pax-stagger`, `pax-card-hover`, styling warna `--chart-1`, `--text`, dll. tidak diganti. Dashboard utama, layout card, grafik donut (DonutChart), RingGauge, WaveStat dipertahankan 100%.
- **Komponen Fable Original:** File lama seperti `sidebar.tsx`, `nav-panel.tsx`, dan `icon-rail.tsx` sudah ditinggalkan (deleted).

## 4. Verifikasi yang Dijalankan
- `pnpm --filter @paax/web exec tsc --noEmit`: **LULUS** (Tidak ada TS errors).
- `pnpm --filter @paax/web test`: **LULUS** (Semua unit tests di frontend hijau, 13 test files passed, 47 tests passed).
- `Invoke-WebRequest -Uri http://localhost:3000/dashboard -UseBasicParsing`: **200 OK**.
- `Invoke-WebRequest -Uri http://localhost:3000/command-room -UseBasicParsing`: **200 OK**.

## 5. Backend Services yang Belum Berjalan (Sebagai Catatan Tambahan)
- Laporan Pagi (`/laporan`) masih memakai data statik/mock dari `lib/mock/workspace.ts` karena backend untuk pipeline otomatisasi laporan (v1.5) belum disiapkan/hidup.
- Schedule Tasks (`/proyek/[projectId]/page.tsx`) masih dalam tahap mock dan baru akan dihubungkan dengan engine deterministik di rilis (v0.7) berikutnya.
- Fitur "Upload via Google Drive / Gmail" dan "Voice/Mic" di Command Room disetel dengan notifikasi placeholder sesuai dengan batasan scope rilis ini.
