# Laporan Implementasi SS5.2.1 — Unifikasi Label & Keamanan Tumpang-tindih RAB

**Tanggal:** 2026-07-17
**Agent:** Antigravity (Claude Sonnet 4.6 Thinking)
**Branch:** feat/pckm-phase3-synthesis
**Konteks:** Big Plan SS5.2 poin 1 — labeling & keamanan tumpang-tindih jalur import RAB

---

## Ringkasan Eksekutif

Tugas ini adalah murni **labeling & UX clarity** (BUKAN logika kalkulasi baru). Dua jalur import RAB
yang sebelumnya tidak saling mengenal kini berlabel tegas di UI, dan setiap baris RAB membawa
badge sumber yang jelas. Tidak ada perubahan pada logika engine, kalkulasi HSP/RAB/volume, atau
skema database utama.

---

## File yang Diubah (dengan line reference)

### 1. `apps/web/src/lib/projects/rab-repository.ts` — L34-44, L73-100

Tambah field opsional `source?: 'smart_import' | 'rab_bridge' | 'manual'` ke `RabDraftLine` interface.
Normalize di `normalizeDraft` via VALID_SOURCES Set. Field opsional — baris lama tidak rusak.
RabDraftLine adalah local TypeScript interface (tidak ada Zod/Pydantic shared schema untuk type ini).

### 2. `services/db/src/paax_db/schemas.py` — L519-528

Tambah `RabBridgeProposalSummary` Pydantic schema untuk endpoint list proposals baru.

### 3. `services/db/src/paax_db/main.py`

**Perubahan A (L928-929):** Tambah `"source": "rab_bridge"` ke dict line di `materialize_rab_bridge_proposal()`.
Setiap baris dari RAB Bridge kini terlabel di payload JSON.

**Perubahan B (L775-812):** Endpoint baru `GET /projects/{id}/project-graph/rab-bridge/proposals`.
List proposals dengan filter opsional by status. Diperlukan oleh RabBridgeImportModal.

### 4. `apps/web/src/app/(dashboard)/proyek/[projectId]/rab/page.tsx`

a. **Label tombol SmartImport (L328-332):** "Smart Import" → "Impor dari File (Excel/PDF)"
b. **Tombol baru RAB Bridge (L333-337):** "Impor dari Drawing Intelligence (AI Terverifikasi)" dengan BrainCircuit icon
c. **`applyLinesWithSource()` (L304-320):** Menggantikan `applyAiLines()`, menerima source parameter
d. **`reloadDraftFromServer()` (L322-330):** Reload draft setelah materialize RAB Bridge berhasil
e. **Badge sumber di editor baris (L388-397):** "Dari File Eksternal" (neutral) / "Drawing Intelligence" (ok)
f. **Badge sumber di RabResultTable (L647-664):** Badge kecil 9px di bawah AHSP code
g. **Komponen `RabBridgeImportModal` (L762-932):** Modal entry point jalur Drawing Intelligence:
   - Load list approved proposals dari DB API
   - Tabel proposals dengan radio button pemilihan
   - Tombol "Materialisasi ke RAB Draft" → POST .../materialize
   - Penjelasan konteks membedakan dari jalur file eksternal
   - Setelah berhasil: tutup modal + reload draft dari server
h. **State `rabBridgeOpen` (L89):** State modal RAB Bridge

### 5. `apps/web/src/components/rab/smart-rab-import.tsx` — L180

Title modal: "Smart Import RAB" → "Impor dari File Eksternal (Excel/PDF)"

---

## Keputusan yang Diambil

**D1 — source 'manual' untuk SmartRabBuilder:**
SmartRabBuilder (Susun dengan AI) menghasilkan baris dari prompt AI. Source 'manual' dipilih
karena user yang mengkonfigurasi via prompt — ini berbeda dari file eksternal atau Drawing Intelligence.

**D2 — Pisahkan callback RAB Bridge dari applyLinesWithSource:**
Jalur RAB Bridge menulis ke DB langsung via endpoint materialize. Frontend tidak mendapat array baris
— hanya respons count. Callback `reloadDraftFromServer()` digunakan untuk sinkronisasi state.

**D3 — Tidak ada Zod/Pydantic update untuk RabDraftLine:**
RabDraftLine tidak ada di packages/schemas (Zod) maupun services/db/schemas.py (Pydantic).
Field source disimpan sebagai JSON payload — cukup tambah ke TypeScript interface dan normalize saat load.

**D4 — Tidak ada deteksi duplikat otomatis:**
Sesuai Big Plan: badge sumber sudah cukup. Baris dari dua jalur tampil berdampingan dengan label
berbeda — user yang memutuskan mana yang dipertahankan.

---

## Hasil Test

| Tes | Hasil | Detail |
|-----|-------|--------|
| `tsc --noEmit` (apps/web) | 0 error | 2 error iterasi pertama (applyAiLines ref, union type) — keduanya diperbaiki |
| `vitest run` (apps/web) | 93/93 PASS | 19 test files, 21.69s |

---

## Yang Belum Selesai / Di Luar Cakupan

1. **Deteksi duplikat otomatis** — BUKAN cakupan SS5.2.1 (Big Plan: "biarkan terpisah tapi labeli jelas")
2. **Wiring Fase 1-2** (canvas nyata, sheets nyata, dll.) — tugas terpisah
3. **RBAC header** di RabBridgeImportModal menggunakan `'X-User-Id': 'web-client'` sementara
4. **Badge sumber baris lama** — baris di DB sebelum update ini tidak punya field source; tampil tanpa badge (aman, field opsional)

---

## Kepatuhan Aturan

- Aturan Emas: Tidak ada angka baru dihitung. Field source murni metadata tampilan.
- CLAUDE.md SS2: Zod dan Pydantic tidak diubah — RabDraftLine bukan skema shared.
- Tidak commit/push.
- Tidak memanggil API eksternal/DeepSeek.
- graphify update dijalankan setelah edit selesai.
- Graphify-first: Query graphify dijalankan sebelum mulai kode.
