# Laporan Implementasi Traceability Evidence RAB - Fase 3
**Tanggal:** 2026-07-17  
**Pengembang:** Gemini 3.5 Flash (Antigravity AI Assistant)  
**Status:** SELESAI & TERUJI  

## 1. Ringkasan Pekerjaan
Menambahkan pelacakan asal-usul (traceability) volume pekerjaan pada RAB. Baris-baris RAB yang terbentuk dari handoff jembatan Drawing Intelligence (`RabBridgeProposal` -> `RabDraftLine`) kini membawa metadata sitasi lengkap berupa `evidence_ids`, `sheet_id`, dan `page_index` dari gambar kerja asli (PDF). Frontend RAB Editor & Result Table menampilkan badge visual sumber sitasi yang interaktif dan konsisten dengan sistem PCKM.

---

## 2. File & Line Terubah

### A. Frontend Data Schema
* **File:** [rab-repository.ts](file:///G:/paax-ai-main/apps/web/src/lib/projects/rab-repository.ts)
  * `RabDraftLine` (lines 19-34): Menambahkan field opsional `sheet_id?: string` dan `page_index?: number`.
  * `normalizeDraft` (lines 78-83): Menambahkan pemetaan field `sheet_id` dan `page_index` saat memuat payload draft RAB dari backend.

### B. Backend Materialization Logic
* **File:** [main.py](file:///G:/paax-ai-main/services/db/src/paax_db/main.py)
  * `materialize_rab_bridge_proposal` (lines 857-872): Mengumpulkan seluruh `evidence_ids` dari proposal items, lalu melakukan query batch ke `models.ProjectGraphEvidence` untuk mendapatkan pemetaan `sheet_id` dan `page_index` guna menghindari masalah N+1 query.
  * Line construction (lines 913-915): Menyuntikkan `sheet_id` dan `page_index` ke objek line yang di-append ke payload `RabDraft`.

### C. Backend Unit Tests
* **File:** [test_rab_materialize.py](file:///G:/paax-ai-main/services/db/tests/test_rab_materialize.py)
  * Test setup (lines 64-85): Menambahkan mock entitas `models.ProjectGraphEvidence` ke dalam session database uji.
  * Test assertions (lines 122-127): Memvalidasi bahwa line hasil materialisasi sukses memuat `sheet_id` dan `page_index` yang tepat sesuai mock data.

### D. Frontend UI & Presentation
* **File:** [page.tsx](file:///G:/paax-ai-main/apps/web/src/app/(dashboard)/proyek/[projectId]/rab/page.tsx)
  * Imports (line 29): Mengimpor icon `FileText` dari `lucide-react`.
  * Editor Row rendering (lines 381-395): Jika baris RAB memiliki sitasi, tampilkan `StatusPill` netral "Sumber: Sheet {sheet_id}, halaman {page_index + 1}" dengan hover tooltip berisi daftar `evidence_id`.
  * Calculated Result Table rendering (lines 530-618): Meneruskan `draft` prop ke `RabResultTable`. Memetakan hasil perhitungan engine ke input draft line untuk menampilkan badge sitasi `Sheet {sheet_id} p.{page_index + 1}` di sebelah kode AHSP.

---

## 3. Hasil Pengujian

### A. TypeScript Compilation (`apps/web`)
* **Perintah:** `pnpm --filter web exec tsc --noEmit`
* **Hasil:** `0 errors/warnings` (Sukses Bersih)

### B. Frontend Vitest Test Suite (`apps/web`)
* **Perintah:** `pnpm --filter web test`
* **Hasil:** `19 passed` files, `93 passed` tests, `0 failed`

### C. Backend Pytest Test Suite (`services/db`)
* **Perintah:** `pytest`
* **Hasil:** `85 passed`, `1 skipped`, `3 warnings` (100% dari total unit test db lolos)

---

## 4. Keputusan Desain & Mitigasi Ambiguitas
1. **Batching Database Query:** Alih-alih melakukan query per-item dalam loop materialisasi, program mengekstrak semua ID bukti unik terlebih dahulu dan melakukan query database secara massal (batch query) menggunakan operator `in_`. Ini melindungi latensi server database.
2. **Korelasi Hasil vs Draft Input:** Output perhitungan Core Engine (`RABResult.lines`) tidak membawa data meta visual. Korelasi dilakukan di tingkat UI `RabResultTable` dengan mencocokkan indeks baris valid dari draft input, dilengkapi fallback pencarian berdasarkan `ahsp_code` untuk menjamin konsistensi sitasi.
3. **Kesesuaian Halaman Gambar (1-Indexed):** `page_index` di tingkat database disimpan sebagai 0-indexed (dimulai dari 0). Frontend memformat visualisasi dengan menambahkan `+ 1` agar terbaca sebagai nomor halaman riil (1-indexed) bagi estimator proyek.

---

## 5. Pekerjaan Tersisa (Next Steps)
* Verifikasi ujung-ke-ujung (end-to-end) menggunakan alur unggah gambar PDF nyata di UI, polling status sintesis graf proyek, dan handoff proposal di proyek nyata kedua untuk pelepasan label `EXPERIMENTAL`.
