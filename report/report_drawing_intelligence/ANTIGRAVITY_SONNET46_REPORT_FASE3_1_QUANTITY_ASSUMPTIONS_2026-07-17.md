# LAPORAN IMPLEMENTASI: SS5.1.2 — Endpoint CRUD quantity_assumptions

**Tanggal:** 2026-07-17
**Agent:** Antigravity (Claude Sonnet 4.6 Thinking)
**Orkestrasi:** Sonnet 5
**Branch:** `feat/pckm-phase3-synthesis`
**Tugas:** Big Plan Fase 3 — SS5.1 poin 2: endpoint CRUD untuk `quantity_assumptions`

---

## 1. Yang Dibangun

### 1.1 Endpoint Baru di `services/db/src/paax_db/main.py`

| Method | Path | Roles yang Diizinkan |
|---|---|---|
| `POST` | `/projects/{id}/project-graph/quantity-assumptions` | estimator, pm, lapangan, owner |
| `GET` | `/projects/{id}/project-graph/quantity-assumptions` | estimator, pm, lapangan, owner |
| `POST` | `/projects/{id}/project-graph/quantity-assumptions/{assumption_id}/resolve` | owner, pm (saja) |

#### Detail POST create (main.py L875-L895)
- Validasi `project_id` di body harus cocok dengan path `id` (400 jika tidak cocok)
- Cek duplikat `id` asumsi, kembalikan 409 jika sudah ada
- Simpan murni teks asumsi manusia + status - **tidak ada kalkulasi** (Aturan Emas)

#### Detail GET list (main.py L898-L917)
- Filter opsional `?element_type_id=...` via query param
- Scoped ke proyek yang diminta - tidak bocor ke proyek lain
- List kosong (bukan 404) jika proyek belum punya asumsi

#### Detail POST resolve (main.py L920-L945)
- Status valid: `"accepted"` atau `"rejected"` (Literal, Pydantic 422 jika tidak valid)
- **D12 DIPATUHI**: tidak ada auto-accept, aksi manusia eksplisit
- assumption_id tidak ada ATAU dari proyek lain: 404 jelas

### 1.2 Schema Baru Pydantic (schemas.py L534-L536)

`QuantityAssumptionResolve` baru:
  status: Literal["accepted", "rejected"]

Schema lama (Create, Response) tidak diubah.

### 1.3 Schema Baru Zod (packages/schemas/src/index.ts L1958-L1961)

`QuantityAssumptionResolveSchema` ditambahkan bersamaan (CLAUDE.md SS2):
  status: z.enum(["accepted", "rejected"])

### 1.4 File Test Baru

services/db/tests/test_quantity_assumptions.py - **17 test cases**

---

## 2. Hasil Test

### Test baru (quantity_assumptions saja):
17 passed, 0 failed

### Full test suite (services/db) setelah perubahan:
83 passed, 1 skipped, 0 failed
Durasi: 41.55s

1 skipped = test_alembic_upgrade_and_downgrade (sudah selalu skipped, bukan regresi baru)
0 failed.

---

## 3. Keputusan yang Diambil (Ambiguitas)

### 3.1 Literal Status untuk Resolve

Dipilih `"accepted"`/`"rejected"` (bukan `"approved"`/`"rejected"` seperti RAB Bridge) karena:
- Asumsi kuantitas yang DITERIMA jadi input volume, yang DITOLAK tidak dipakai
- Konsisten dengan pola `accepted`/`rejected` di `ProjectGraphCorrection.status`
- Lebih tepat secara domain: "accepted" = diterima sebagai dasar kalkulasi, bukan sekadar "approved" hierarkis

Status `"active"` (default) tetap valid sebagai state awal pending review.

### 3.2 Roles

- Create/List: ["estimator", "pm", "lapangan", "owner"] - sama dengan rab-bridge POST
- Resolve: ["owner", "pm"] - sama dengan corrections resolve dan rab-bridge resolve

### 3.3 Tidak Ada Migrasi Baru

Tabel `quantity_assumptions` sudah ada dari migrasi `0013_review_workflow_quantity_readiness.py`.

---

## 4. File yang Diubah

- services/db/src/paax_db/main.py (tambah 3 endpoint, L875-L948)
- services/db/src/paax_db/schemas.py (tambah QuantityAssumptionResolve, L534-L536)
- packages/schemas/src/index.ts (tambah QuantityAssumptionResolveSchema, L1958-L1961)
- services/db/tests/test_quantity_assumptions.py (file baru, 17 test cases)

---

## 5. Yang Belum Selesai (Bukan Scope Tugas Ini)

- SS5.1.1: Pemetaan node graph ke kandidat AHSP
- SS5.1.3: Endpoint materialize proposal ke RAB draft lines
- SS5.1.4: UI review-sebelum-kirim (frontend)
- SS5.2: Unifikasi dua jalur import RAB (butuh keputusan owner)

---

## 6. Aturan yang Dipatuhi

- Aturan Emas: endpoint tidak menghitung, murni simpan teks asumsi + status [PASS]
- D12: tidak ada auto-accept, approval selalu aksi manusia eksplisit [PASS]
- CLAUDE.md SS2: perubahan Pydantic dan Zod bersamaan [PASS]
- Graphify-first: query dijalankan sebelum coding [PASS]
- Tidak commit/push [PASS]
- Tidak panggil API eksternal [PASS]
- Tidak menyentuh frontend [PASS]
- graphify update . setelah selesai edit [PASS]
- 0 failed sebelum menyatakan selesai: 83 passed, 0 failed [PASS]
