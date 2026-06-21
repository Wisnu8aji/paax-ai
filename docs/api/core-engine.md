# PAAX AI — Core Engine API Documentation

> API reference untuk Core Engine (FastAPI / Python).
> Service ini menangani semua kalkulasi deterministik: RAB, jadwal, validasi, dan export.

**Base URL**: `http://localhost:8000` (development) | `https://core-engine-xxxxx.run.app` (production)

---

## 1. Overview

Core Engine adalah service Python yang bertanggung jawab untuk:
- Kalkulasi RAB (Rencana Anggaran Biaya) secara deterministik
- AHSP (Analisa Harga Satuan Pekerjaan) lookup dan computation
- Schedule generation menggunakan CPM (Critical Path Method)
- Export ke Excel menggunakan template tetap
- Validasi data input

> **Prinsip Utama**: Semua kalkulasi di Core Engine bersifat **deterministik**.
> Input yang sama SELALU menghasilkan output yang sama. Tidak ada LLM yang terlibat dalam perhitungan angka.

---

## 2. Authentication

Semua endpoint memerlukan Firebase Auth JWT token:

```http
Authorization: Bearer <firebase-jwt-token>
```

Header tambahan yang diperlukan:

```http
X-Project-Id: <project-id>
X-Org-Id: <organization-id>
Content-Type: application/json
```

---

## 3. Endpoints

### 3.1 Health Check

```
GET /health
```

**Description**: Cek status service dan dependencies.

**Response** `200 OK`:
```json
{
  "status": "healthy",
  "version": "0.3.0",
  "services": {
    "firestore": "connected",
    "storage": "connected"
  },
  "uptime": 3600,
  "timestamp": "2026-06-21T10:00:00Z"
}
```

---

### 3.2 Generate RAB

```
POST /rab/generate
```

**Description**: Generate RAB baru dari data volume dan AHSP. Membuat versi baru di Firestore.

**Request Body**:
```json
{
  "projectId": "proj_abc123",
  "volumes": [
    {
      "itemCode": "01.01",
      "itemName": "Pembersihan Lahan",
      "volume": 500,
      "unit": "m²",
      "ahspCode": "AHSP-2023-A.01.01",
      "source": "manual"
    },
    {
      "itemCode": "02.01",
      "itemName": "Galian Tanah Pondasi",
      "volume": 45.6,
      "unit": "m³",
      "ahspCode": "AHSP-2023-B.02.01",
      "source": "ai_extracted"
    }
  ],
  "options": {
    "wilayahHarga": "Kota Bandung 2026",
    "sniVersion": "SNI 2023",
    "ppnRate": 0.11,
    "overheadRate": 0.10,
    "includePPN": true,
    "includeOverhead": true
  }
}
```

**Response** `201 Created`:
```json
{
  "success": true,
  "data": {
    "rabId": "rab_v3_xyz",
    "projectId": "proj_abc123",
    "version": 3,
    "status": "draft",
    "divisions": [
      {
        "code": "01",
        "name": "Pekerjaan Persiapan",
        "subtotal": 23500000,
        "items": [
          {
            "code": "01.01",
            "name": "Pembersihan Lahan",
            "volume": 500,
            "unit": "m²",
            "hsp": 15000,
            "total": 7500000,
            "ahspCode": "AHSP-2023-A.01.01",
            "ahspBreakdown": {
              "materials": [
                { "name": "Alat bantu", "coefficient": 0.05, "price": 50000, "subtotal": 2500 }
              ],
              "labor": [
                { "name": "Pekerja", "coefficient": 0.1, "price": 120000, "subtotal": 12000 }
              ],
              "equipment": [
                { "name": "Bulldozer", "coefficient": 0.001, "price": 500000, "subtotal": 500 }
              ]
            }
          }
        ]
      }
    ],
    "summary": {
      "subtotal": 4850000000,
      "ppn": 533500000,
      "overhead": 485000000,
      "grandTotal": 5868500000,
      "itemCount": 156,
      "divisionCount": 8
    },
    "metadata": {
      "sniVersion": "SNI 2023",
      "wilayahHarga": "Kota Bandung 2026",
      "calculatedAt": "2026-06-21T10:05:00Z",
      "calculationEngine": "paax-core-engine-0.3.0",
      "checksum": "sha256:a1b2c3d4..."
    }
  }
}
```

**Error Responses**:

| Status | Description |
|--------|-------------|
| `400` | Invalid input (missing volumes, invalid AHSP code) |
| `404` | Project or AHSP not found |
| `422` | Validation error (negative volume, unknown unit) |
| `500` | Internal calculation error |

---

### 3.3 Recalculate RAB

```
POST /rab/recalculate
```

**Description**: Recalculate RAB yang sudah ada dengan perubahan volume atau harga. Membuat versi baru.

**Request Body**:
```json
{
  "projectId": "proj_abc123",
  "baseRabId": "rab_v2_xyz",
  "changes": [
    {
      "action": "update_volume",
      "itemCode": "02.01",
      "newVolume": 50.0
    },
    {
      "action": "update_price",
      "itemCode": "03.01",
      "materialName": "Semen Portland",
      "newPrice": 75000
    },
    {
      "action": "add_item",
      "itemCode": "04.05",
      "itemName": "Pekerjaan Railing Tangga",
      "volume": 12.5,
      "unit": "m",
      "ahspCode": "AHSP-2023-D.04.05"
    },
    {
      "action": "remove_item",
      "itemCode": "01.03"
    }
  ]
}
```

**Response** `201 Created`: Same structure as Generate RAB, with incremented version.

---

### 3.4 Review RAB

```
POST /rab/review
```

**Description**: Analisis RAB untuk validasi, benchmark comparison, dan identifikasi item berisiko. Response bersifat **deterministik** (rule-based checks), bukan AI-generated.

**Request Body**:
```json
{
  "projectId": "proj_abc123",
  "rabId": "rab_v3_xyz",
  "checks": ["completeness", "benchmark", "outlier", "unit_price"]
}
```

**Response** `200 OK`:
```json
{
  "success": true,
  "data": {
    "rabId": "rab_v3_xyz",
    "reviewResult": {
      "completeness": {
        "score": 0.85,
        "missingDivisions": ["Pekerjaan Luar / Site Work"],
        "warnings": [
          "Divisi pekerjaan luar (site work) belum ada",
          "Item pekerjaan mobilisasi belum dimasukkan"
        ]
      },
      "benchmark": {
        "pricePerM2": 3912333,
        "benchmarkRange": { "low": 3500000, "high": 5000000 },
        "assessment": "within_range",
        "note": "Harga per m² dalam rentang wajar untuk gedung komersial di Bandung"
      },
      "outliers": [
        {
          "itemCode": "03.02",
          "itemName": "Pekerjaan Kolom K-350",
          "hsp": 4500000,
          "expectedRange": { "low": 2800000, "high": 3800000 },
          "deviation": "+18.4%",
          "severity": "warning"
        }
      ],
      "unitPriceChecks": [
        {
          "material": "Besi Beton D16",
          "currentPrice": 14000,
          "marketPrice": 12500,
          "deviation": "+12%",
          "note": "Harga di atas rata-rata pasar"
        }
      ]
    }
  }
}
```

---

### 3.5 Optimize RAB

```
POST /rab/optimize
```

**Description**: Identifikasi peluang penghematan biaya secara deterministik (substitusi material, optimasi volume).

**Request Body**:
```json
{
  "projectId": "proj_abc123",
  "rabId": "rab_v3_xyz",
  "optimizationTargets": ["material_substitution", "volume_efficiency", "method_alternative"],
  "budgetConstraint": 5000000000
}
```

**Response** `200 OK`:
```json
{
  "success": true,
  "data": {
    "currentTotal": 5868500000,
    "targetBudget": 5000000000,
    "gap": 868500000,
    "optimizations": [
      {
        "type": "material_substitution",
        "itemCode": "05.01",
        "description": "Ganti keramik 60x60 merk A → merk B (kualitas setara)",
        "currentCost": 450000000,
        "optimizedCost": 380000000,
        "savings": 70000000,
        "riskLevel": "low"
      },
      {
        "type": "volume_efficiency",
        "itemCode": "03.04",
        "description": "Optimasi volume bekisting dengan metode knock-down",
        "currentCost": 180000000,
        "optimizedCost": 155000000,
        "savings": 25000000,
        "riskLevel": "low"
      }
    ],
    "totalPotentialSavings": 285000000,
    "achievable": false,
    "note": "Total potensi penghematan Rp 285 juta. Masih ada gap Rp 583.5 juta untuk mencapai target budget."
  }
}
```

---

### 3.6 Generate Schedule

```
POST /schedule/generate
```

**Description**: Generate jadwal pelaksanaan dari item RAB menggunakan CPM.

**Request Body**:
```json
{
  "projectId": "proj_abc123",
  "rabId": "rab_v3_xyz",
  "startDate": "2026-01-15",
  "scenario": "normal",
  "workingDaysPerWeek": 6,
  "holidays": ["2026-01-01", "2026-03-31"],
  "constraints": {
    "maxDuration": 365,
    "concurrentTasks": 3
  }
}
```

**Response** `201 Created`:
```json
{
  "success": true,
  "data": {
    "scheduleId": "sched_v1_abc",
    "projectId": "proj_abc123",
    "version": 1,
    "scenario": "normal",
    "startDate": "2026-01-15",
    "endDate": "2026-12-28",
    "durationDays": 298,
    "tasks": [
      {
        "id": "task_001",
        "name": "Pembersihan & Pengukuran",
        "rabItemCode": "01.01",
        "startDate": "2026-01-15",
        "endDate": "2026-01-28",
        "duration": 14,
        "dependencies": [],
        "isCritical": true,
        "earlyStart": "2026-01-15",
        "earlyFinish": "2026-01-28",
        "lateStart": "2026-01-15",
        "lateFinish": "2026-01-28",
        "totalFloat": 0
      }
    ],
    "criticalPath": ["task_001", "task_003", "task_005", "task_008", "task_012"],
    "totalFloat": 15,
    "summary": {
      "totalTasks": 45,
      "criticalTasks": 12,
      "parallelGroups": 8
    }
  }
}
```

---

### 3.7 Schedule Scenario

```
POST /schedule/scenario
```

**Description**: Generate scenario alternatif (accelerated, delay recovery).

**Request Body**:
```json
{
  "projectId": "proj_abc123",
  "baseScheduleId": "sched_v1_abc",
  "scenario": "accelerated",
  "targetEndDate": "2026-09-30",
  "options": {
    "allowOvertime": true,
    "maxOvertimeHours": 3,
    "allowWeekendWork": true,
    "additionalCrews": 2
  }
}
```

**Response** `201 Created`: Similar to Generate Schedule with adjusted dates and cost implications.

---

### 3.8 Delay Recovery

```
POST /schedule/delay-recovery
```

**Description**: Analisis keterlambatan dan generate recovery plan.

**Request Body**:
```json
{
  "projectId": "proj_abc123",
  "scheduleId": "sched_v1_abc",
  "currentDate": "2026-06-15",
  "actualProgress": {
    "task_001": 100,
    "task_003": 100,
    "task_005": 75,
    "task_008": 0
  },
  "targetEndDate": "2026-12-28"
}
```

**Response** `200 OK`:
```json
{
  "success": true,
  "data": {
    "delayAnalysis": {
      "currentDelay": 21,
      "delayUnit": "days",
      "affectedTasks": ["task_005", "task_008"],
      "impactOnEndDate": "2027-01-18",
      "criticalPathImpacted": true
    },
    "recoveryPlan": {
      "feasible": true,
      "strategy": "fast_track_and_crash",
      "adjustments": [
        {
          "taskId": "task_005",
          "action": "crash",
          "originalDuration": 28,
          "newDuration": 21,
          "additionalCost": 15000000,
          "method": "Tambah 1 tim tukang"
        },
        {
          "taskId": "task_008",
          "action": "fast_track",
          "overlapWith": "task_007",
          "overlapDays": 7,
          "risk": "medium"
        }
      ],
      "recoveredDays": 21,
      "newEndDate": "2026-12-28",
      "additionalCost": 45000000
    }
  }
}
```

---

### 3.9 Export to Excel

```
POST /export/excel
```

**Description**: Generate file Excel dari RAB atau jadwal menggunakan template tetap.

**Request Body**:
```json
{
  "projectId": "proj_abc123",
  "exportType": "rab",
  "sourceId": "rab_v3_xyz",
  "template": "standard_rab",
  "options": {
    "includeAHSP": true,
    "includeRates": true,
    "includeRekapitulasi": true,
    "companyName": "PT Konstruksi Maju",
    "companyLogo": "gs://paax-storage/logos/company_abc.png"
  }
}
```

**Response** `201 Created`:
```json
{
  "success": true,
  "data": {
    "exportId": "export_abc123",
    "fileName": "RAB_GedungKantor3Lantai_v3.xlsx",
    "storagePath": "exports/proj_abc123/RAB_GedungKantor3Lantai_v3.xlsx",
    "downloadURL": "https://storage.googleapis.com/paax-exports/...",
    "expiresAt": "2026-06-22T10:05:00Z",
    "fileSize": 245760,
    "sheets": [
      "Rekapitulasi",
      "RAB Detail",
      "AHSP",
      "Daftar Harga Material",
      "Daftar Harga Upah"
    ]
  }
}
```

---

### 3.10 Run Validation

```
POST /validation/run
```

**Description**: Jalankan validasi komprehensif pada data proyek.

**Request Body**:
```json
{
  "projectId": "proj_abc123",
  "targets": ["volumes", "ahsp_references", "price_data", "completeness"],
  "rabId": "rab_v3_xyz"
}
```

**Response** `200 OK`:
```json
{
  "success": true,
  "data": {
    "validationResult": {
      "overall": "warning",
      "checks": [
        {
          "target": "volumes",
          "status": "pass",
          "message": "Semua volume valid (positif, satuan benar)"
        },
        {
          "target": "ahsp_references",
          "status": "warning",
          "issues": [
            "AHSP code AHSP-2023-D.04.05 tidak ditemukan di database",
            "3 item menggunakan AHSP versi lama (2021)"
          ]
        },
        {
          "target": "price_data",
          "status": "pass",
          "message": "Semua harga satuan tersedia untuk wilayah Kota Bandung 2026"
        },
        {
          "target": "completeness",
          "status": "warning",
          "issues": [
            "Divisi MEP (Mekanikal Elektrikal Plumbing) belum ada"
          ]
        }
      ],
      "errorCount": 0,
      "warningCount": 3,
      "passCount": 2
    }
  }
}
```

---

## 4. Error Response Format

Semua error menggunakan format konsisten:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Volume tidak boleh negatif",
    "details": [
      {
        "field": "volumes[2].volume",
        "value": -10,
        "constraint": "must be positive number"
      }
    ]
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 422 | Input validation failed |
| `NOT_FOUND` | 404 | Resource not found |
| `UNAUTHORIZED` | 401 | Invalid or missing auth token |
| `FORBIDDEN` | 403 | No access to resource |
| `AHSP_NOT_FOUND` | 404 | AHSP code not in database |
| `PRICE_NOT_FOUND` | 404 | Harga satuan tidak tersedia |
| `CALCULATION_ERROR` | 500 | Internal calculation error |
| `EXPORT_ERROR` | 500 | Excel generation failed |
| `RATE_LIMITED` | 429 | Too many requests |

---

## 5. Rate Limits

| Plan | Requests/minute | RAB Generates/day | Exports/day |
|------|-----------------|-------------------|-------------|
| Free | 30 | 5 | 3 |
| Pro | 120 | 50 | 30 |
| Enterprise | 600 | Unlimited | Unlimited |

---

*API ini menggunakan versioning di header. Current version: `v1`. Breaking changes akan di-announce melalui changelog.*
