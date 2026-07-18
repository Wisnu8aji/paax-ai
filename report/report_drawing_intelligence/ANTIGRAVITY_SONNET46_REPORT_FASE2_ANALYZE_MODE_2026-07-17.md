# ANTIGRAVITY SONNET4.6 REPORT — FASE 2: ANALYZE MODE (2026-07-17)

## 1. Ringkasan Pekerjaan
Mengubah "Analyze" mode di Drawing Intelligence Workspace V2 menjadi kontrol yang memicu sintesis PCKM nyata dan menghapus sisa-sisa simulasi kosmetik di UI.

### File yang Dimodifikasi:
- **`apps/web/src/components/drawing-intelligence/workspace/workspace-store.tsx`** (Lines 679-688 & 900-910)
  - Mengubah fungsi `startAnalysis` yang semula berisi `setInterval` simulasi progress 46 langkah menjadi wrapper yang mengambil `runId` terbaru dari tabel state upload dan memanggil `triggerProjectSynthesis(runId)`.
  - Memodifikasi `triggerProjectSynthesis` agar juga memicu transisi state `mode: 'review'` setelah sintesis berhasil (`synthesis_complete`), sesuai behavior sebelumnya.

- **`apps/web/src/components/drawing-intelligence/workspace/inspector/processing-overlay.tsx`** (Lines 6-177)
  - Menghapus hitungan "Live Analysis Stats" yang dikarang dari persentase progres fiktif.
  - Menerapkan efek polling nyata `fetchDemRunStatus(runId)` untuk membaca total pages, completed pages, dan field `synthesis_status` dari database.
  - Memperbarui komponen Stepper di UI untuk mencerminkan status sesungguhnya (pending, in progress, done) bersumber dari status sintesis backend.
  - Menghapus label palsu "(Live)" dari seksi "Model Stack" dan menghapus blok log fiktif (`ANALYSIS_LOG_SCRIPT`).

- **`apps/web/src/components/drawing-intelligence/workspace/inspector/analysis-setup-panel.tsx`** (Lines 186-189)
  - Karena filter konfigurasi `AnalysisConfig` (scope/mode/outputs) saat ini belum didukung secara granular oleh API backend, UI form tersebut tetap dipertahankan sesuai arahan MVP.
  - Menambahkan _disclaimer block_ bertulisan peringatan MVP agar tidak menyesatkan pengguna seakan parameter ini sudah diterapkan pada backend.

- **`apps/web/src/components/drawing-intelligence/workspace/navigator/upload-modal.tsx`** (Lines 340-357)
  - Memindahkan/menyambung kontrol sintesis (menghapus tombol "Start PCKM Synthesis" yang meng-invoke trigger langsung) menjadi "Configure Analysis", yang sekarang mentransisikan view ke `mode: 'analyze'`. Pengguna akan menekan tombol pemicu sesungguhnya di Analysis Setup Panel.

## 2. Hasil Uji / Verifikasi
- **TypeScript Compiler (`tsc --noEmit`)**: SUCCESS (0 Error)
- **Vitest Frontend Tests**: SUCCESS (18 test files passed, 87 tests passed, 8.11s)
- **Graphify Index**: SUCCESS (`graphify update .` dijalankan)
- **Aturan Emas**: Dipatuhi sepenuhnya. Tidak ada logic atau fungsi kalkulasi angka RAB yang ditulis di frontend.

## 3. Keputusan Desain (Ambiguitas)
- Karena tombol pemicu awal dari Fase 1 berada di `upload-modal.tsx`, logic `triggerProjectSynthesis` di store tetap dipertahankan karena sudah berisi sinkronisasi queue dan quantities secara lengkap setelah _completion_. Alih-alih merombak total, `startAnalysis` dikonversikan menjadi jembatan pemanggil ke `triggerProjectSynthesis`.
- Agar "Start Analysis" bisa dieksekusi dari panel tanpa melempar parameter khusus, store kini mengekstrak otomatis `runId` valid terbaru yang tersisa di `state.upload.entries` sebagai acuan objek.
- Komponen simulasi log (`ANALYSIS_LOG_SCRIPT`) secara permanen dihapus dari `processing-overlay.tsx` agar tampilan loading terhindar dari kesan manipulatif.

## 4. Status Pekerjaan
**100% Selesai**. Analyze Mode bukan lagi mock UI dan murni merepresentasikan transisi status _pipeline_ nyata di backend (Upload -> Extract -> Synthesize -> Review).
