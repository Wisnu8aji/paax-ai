---
name: paax-connector-foundry
description: Bangun koneksi baru antara Command Room dan service PAAX (core-engine, services/db, document-intelligence) atau service eksternal -- adaptasi mcp-builder Anthropic untuk arsitektur PAAX (bukan MCP server berdiri sendiri, tapi tool ai-orchestrator + endpoint FastAPI). WAJIB dipakai saat owner minta "sambungkan Command Room ke X", "AI perlu akses data Y", atau menyebut integrasi/koneksi service baru untuk chat AI.
---

# PAAX Connector Foundry

Kontrol plane untuk membangun jembatan data baru antara Command Room dan sumber data (internal atau eksternal). Berbeda dari `paax-skill-forge` (yang menambah *kemampuan* lewat tool yang sudah punya endpoint backend) -- connector foundry dipakai saat **endpoint backend-nya sendiri belum ada** dan perlu dibangun dulu, atau saat menyambungkan ke service eksternal (API pihak ketiga).

## Arsitektur yang harus dipahami dulu

PAAX **tidak** memakai MCP server generik untuk Command Room production (beda dari `mcp-builder` asli yang menghasilkan MCP server stdio/HTTP berdiri sendiri). Pola PAAX adalah:

```
Command Room (route.ts, apps/web)
  -> tool-calling native provider (OpenRouter/Anthropic)
  -> tool registry in-process (@paax/ai-orchestrator/tools)
  -> fetch ke service FastAPI (core-engine :8081 / services/db :8001 / document-intelligence :8083)
```

Kalau data yang dibutuhkan belum punya endpoint FastAPI, connector foundry berarti **dua pekerjaan**:
1. Bangun endpoint FastAPI baru di service yang relevan (auth via `get_current_user`, pola `X-Internal-Key`/Firebase JWT -- lihat `services/core-engine/app/auth.py` atau `services/db/src/paax_db/main.py`)
2. Bangun tool `ai-orchestrator` yang memanggilnya (setelah endpoint ada, lanjutkan ke `paax-skill-forge`)

## Kapan connector eksternal (bukan internal PAAX)

Untuk API pihak ketiga (bukan service PAAX sendiri), pertimbangkan lebih hati-hati:
- API key harus disimpan server-side (`.env.local` di `apps/web`, JANGAN PERNAH kirim ke client) -- ikuti pola `DEEPSEEK_API_KEY`/`ANTHROPIC_API_KEY` di `route.ts`
- Rate limit & cost harus dipertimbangkan (lihat `services/db` `ai_usage_log`/`tenant_quota` untuk pola metering yang sudah ada)
- Kalau connector menghasilkan angka yang mempengaruhi RAB/BOQ/jadwal -- itu MELANGGAR Aturan Emas CLAUDE.md §1 kalau bukan lewat core-engine. STOP dan diskusikan dengan owner dulu.

## Alur kerja

### 1. Pahami kebutuhan data
- Data apa, dari mana, format apa
- Baca-saja (read-only) atau perlu tulis? Write action ke data proyek (RAB/jadwal final) butuh approval flow terpisah (blueprint §5 Level 3 Controlled) -- jangan bangun write-tanpa-approval untuk data proyek final.

### 2. Endpoint backend (kalau belum ada)
Pola FastAPI yang WAJIB diikuti (bukan didesain ulang):
- Auth: `dependencies=[Depends(get_current_user)]` di route atau router-level
- Response model Pydantic eksplisit (bukan `dict` polos) untuk validasi otomatis
- Untuk services/db: tambah model SQLAlchemy di `models.py` + schema Pydantic di `schemas.py` + migrasi Alembic baru (`alembic revision`, JANGAN edit migrasi lama yang sudah ada)
- Test: `services/db/tests/` atau `services/core-engine/tests/` sesuai service, pola `httpx.AsyncClient` + header auth test (`X-Internal-Key: test-internal-key`)

### 3. Tool ai-orchestrator
Setelah endpoint ada dan diuji, lanjutkan proses di `paax-skill-forge` (declaration, registry, system prompt, live-test 3 model).

### 4. Verifikasi tuntas
```
# Kalau menyentuh Python service:
cd services/<nama-service> && python -m pytest -q

# Kalau menyentuh ai-orchestrator/apps/web:
cd services/ai-orchestrator && npx tsc --noEmit && npx vitest run
cd apps/web && npx tsc --noEmit && npx vitest run
```
Live-test lewat ketiga model (Lucent/Arete berat, Noir ringan) SEBELUM menyatakan connector selesai -- endpoint yang lulus test Python tapi belum pernah dipanggil model asli sering menyimpan bug integrasi tersembunyi (contoh nyata yang pernah terjadi: endpoint core-engine sudah benar, tapi tool tidak kirim header auth sehingga selalu 401 saat dipanggil dari Command Room -- lulus test unit, gagal live).

## Checklist keamanan sebelum merge

- [ ] Tidak ada API key/secret di kode (semua lewat env var, `.env.example` diupdate dengan placeholder)
- [ ] Endpoint baru punya auth (tidak publicly accessible tanpa key)
- [ ] Tool baru tidak bisa dipakai untuk menghitung/mengarang angka RAB/BOQ/HSP/jadwal (Aturan Emas)
- [ ] Write action (kalau ada) tidak langsung eksekusi tanpa approval untuk data proyek final
- [ ] Rate limit/quota dipertimbangkan kalau connector ke API eksternal berbayar
