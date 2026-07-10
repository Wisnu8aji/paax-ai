# Report Task R14 — Scaffold Site Agent v2.0 (API Progres Lapangan)
**Tanggal:** 2026-07-07  
**Branch:** `feat/site-agent-scaffold`  
**Commit:** `5b5562f`  
**Author:** Saya (Saya)

---

## 1. Struktur Service Baru

```
services/site-agent/
├── pyproject.toml              # Konfigurasi project Python (port 8085)
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI endpoints
│   ├── models.py               # Pydantic models + konstanta ON_TRACK_THRESHOLD_PCT
│   └── store.py                # In-memory store scaffold (→ PostgreSQL di v2.0)
└── tests/
    ├── __init__.py
    └── test_site_agent.py      # 16 test cases
```

### Endpoints
| Method | Path | Deskripsi |
|--------|------|-----------|
| `GET` | `/healthz` | Health check |
| `POST` | `/site-logs` | Simpan laporan harian manusia |
| `GET` | `/site-logs?project_id=&from=&to=` | Riwayat laporan |
| `GET` | `/site-logs/{project_id}/deviation?date=&total_days=&planned_day=` | Bandingkan rencana vs realisasi |

---

## 2. Keputusan Lokasi Hitung `deviation_pct`

**Keputusan: Dihitung di site-agent itu sendiri (pengurangan sederhana).**

Alasan (konsisten dengan komentar di prompt §1.2):
> `deviation_pct = actual_progress_pct - planned_progress_pct`

Ini adalah **pengurangan dua angka yang sudah dihitung**:
- `planned_progress_pct` → dari core-engine `/schedule/s-curve` (engine deterministik)
- `actual_progress_pct` → dari input manusia terverifikasi

Pengurangan ini setara dengan frontend menampilkan selisih — **bukan pelanggaran Aturan Emas** karena:
- TIDAK ada logika perhitungan bisnis baru
- TIDAK ada angka yang "dikarang" oleh LLM atau TypeScript
- Keduanya adalah angka yang sudah ada, tinggal dikurangi

**Jika pernah ragu:** Kita bisa memindahkan kalkulasi ini ke endpoint baru di core-engine `/deviation/compare`, tapi itu overkill untuk pengurangan `a - b`.

---

## 3. Ambang `on_track` / `behind` / `ahead`

Konstanta terdokumentasi eksplisit di `app/models.py`:

```python
ON_TRACK_THRESHOLD_PCT: float = 2.0
```

**Status logic:**
- `|deviation_pct| ≤ 2.0%` → `on_track`
- `deviation_pct > 2.0%` → `ahead`
- `deviation_pct < -2.0%` → `behind`

**Alasan pemilihan 2%:**
- Toleransi umum di manajemen proyek konstruksi Indonesia untuk deviasi kecil harian
- Cukup sensitif untuk mendeteksi masalah nyata (bukan noise pengukuran)
- Konsisten dengan praktik AHSP di mana overhead/margin sudah mengakomodasi ~10-15%
- Nilai mudah dipahami tim lapangan: "2 persen masih aman"

**Nilai ini dikembalikan di setiap response** (`threshold_pct: float`) sehingga frontend dan audit bisa melihat ambang yang dipakai — tidak implisit.

---

## 4. Bukti Test Negatif "Tidak Ada Vision-LLM Diimport"

```
tests/test_site_agent.py::TestNoVisionImport::test_no_vision_imports_in_app PASSED [100%]
```

Test ini melakukan static analysis menggunakan `ast.parse()` terhadap **semua file `*.py` di `app/`** dan memverifikasi tidak ada import dari modul terlarang:
- `google.generativeai`
- `vertexai`
- `google.cloud.vision`
- `PIL`
- `cv2`

Jika ada pelanggaran, test akan `FAIL` dengan pesan eksplisit menyebut file dan modul yang melanggar.

---

## 5. Hasil Test Lengkap

```
============================= 16 passed, 1 warning in 3.66s =============================
```

| Class Test | Test | Hasil |
|------------|------|-------|
| `TestCreateSiteLog` | create_log_returns_201 | ✅ PASS |
| `TestCreateSiteLog` | photo_refs_stored_as_is | ✅ PASS |
| `TestValidation` | progress_below_zero_fails_422 | ✅ PASS |
| `TestValidation` | progress_above_100_fails_422 | ✅ PASS |
| `TestValidation` | progress_exactly_0_valid | ✅ PASS |
| `TestValidation` | progress_exactly_100_valid | ✅ PASS |
| `TestValidation` | weather_invalid_enum_fails | ✅ PASS |
| `TestListSiteLogs` | list_empty_project | ✅ PASS |
| `TestListSiteLogs` | list_returns_all_logs | ✅ PASS |
| `TestListSiteLogs` | list_filter_by_from_date | ✅ PASS |
| `TestDeviation` | deviation_ahead | ✅ PASS |
| `TestDeviation` | deviation_on_track | ✅ PASS |
| `TestDeviation` | deviation_behind | ✅ PASS |
| `TestDeviation` | deviation_threshold_boundary | ✅ PASS |
| `TestNotFound` | deviation_no_log_returns_404 | ✅ PASS |
| `TestNoVisionImport` | no_vision_imports_in_app | ✅ PASS |

**1 warning:** `StarletteDeprecationWarning` dari httpx/TestClient — pre-existing, tidak memblokir.

---

## 6. Commit dan PR

- **Branch:** `feat/site-agent-scaffold`
- **Commit:** `5b5562f` — "feat(R14): scaffold site-agent service - laporan harian + deviasi rencana-vs-realisasi"
- **File baru:** 7 files, 511 insertions
- Status: PR draft, belum merge ke main

---

## 7. Larangan yang Ditegakkan

| Larangan | Status Implementasi |
|----------|-------------------|
| TIDAK import vision/Gemini | ✅ Diverifikasi dengan test AST static analysis |
| `actual_progress_pct` tidak diisi otomatis | ✅ Field hanya menerima input dari request body manusia |
| TIDAK sentuh `apps/web/**` | ✅ Nol perubahan di frontend |
| TIDAK analisa foto | ✅ `photo_refs` hanya disimpan as-is, tanpa pemrosesan |
| Port 8085 (tidak konflik) | ✅ Ditetapkan di pyproject.toml dan komentar |

---

## 8. Catatan Pengembangan v2.0

Scaffold ini menggunakan **in-memory store** (`app/store.py`). Di v2.0:
- Store akan diganti akses PostgreSQL via `db-api` (Task R6)
- Endpoint `/deviation` akan mengambil data RAB aktual dari `db-api` lalu memanggil `core-engine /schedule/s-curve` dengan data nyata (bukan parameter `planned_day` + `total_days` manual)
- Autentikasi & otorisasi role `lapangan/pm/owner` dari Task R10 akan diintegrasikan
