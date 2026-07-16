# PAAX Auth Concept

Tanggal: 2026-07-14
Status: konsep awal
Scope: autentikasi aplikasi PAAX AI lintas `apps/web` dan backend services

## Tujuan

Merapikan konsep autentikasi PAAX sebelum implementasi. Fokus awal adalah memastikan user yang login di frontend bisa mengakses backend dengan Firebase ID token, sementara komunikasi internal antar service tetap memakai internal service key yang tidak pernah terekspos ke browser.

Dokumen ini hanya plan. Tidak ada secret, token, API key, atau data privat yang boleh dimasukkan ke sini.

## Prinsip Utama

1. Firebase Auth menjadi sumber identitas user.
2. Backend menjadi authority untuk authorization dan RBAC.
3. Frontend hanya membaca session, mengambil ID token, dan meneruskan token ke API.
4. `X-Internal-Key` hanya untuk server-to-server, tidak boleh dikirim dari browser.
5. Secret tidak boleh di-commit. Gunakan environment variable dan secret manager.
6. Auth tidak boleh mengubah aturan emas repo: angka RAB/HSP/BoQ/jadwal tetap hanya dari deterministic engine.

## Kondisi Saat Ini

Backend sudah memiliki pola auth:

- `services/core-engine/app/auth.py`
- `services/document-intelligence/app/auth.py`
- `services/db/src/paax_db/auth.py`
- `services/ai-orchestrator/src/auth.ts`

Pola yang sudah ada:

- Firebase JWT via `Authorization: Bearer <token>`;
- service-to-service bypass via `X-Internal-Key`;
- test mode memakai token/internal key khusus test;
- `services/db` punya `RoleChecker` untuk RBAC project.

Gap utama ada di frontend:

- belum ada auth client/session layer yang konsisten di `apps/web`;
- `apps/web/src/lib/projects/db-api.ts` belum mengirim Firebase ID token ke DB API;
- UI masih banyak memakai mock current user.

## Target Arsitektur

### Browser User Flow

1. User membuka `apps/web`.
2. Frontend mengecek Firebase Auth session.
3. Jika belum login, user diarahkan ke login flow.
4. Jika sudah login, frontend mengambil Firebase ID token.
5. API client mengirim request ke backend dengan:

```http
Authorization: Bearer <firebase-id-token>
```

6. Backend memverifikasi token memakai Firebase Admin SDK.
7. Backend mengambil `uid` dan menjalankan RBAC.

### Server-to-Server Flow

1. Next.js route handler atau service internal memanggil service backend.
2. Caller server-side membaca `INTERNAL_SERVICE_KEY`.
3. Request internal dikirim dengan:

```http
X-Internal-Key: <internal-service-key>
X-User-Id: <firebase-uid atau service-account>
```

4. Backend menerima request internal hanya bila key cocok.
5. `INTERNAL_SERVICE_KEY` tidak boleh masuk client bundle.

## Komponen yang Direncanakan

### Frontend Auth Helper

Target lokasi:

- `apps/web/src/lib/auth/firebase-client.ts`
- `apps/web/src/lib/auth/auth-token.ts`

Tanggung jawab:

- initialize Firebase client dari `NEXT_PUBLIC_FIREBASE_*`;
- expose helper untuk membaca current user;
- expose helper untuk mengambil `getIdToken()`;
- tidak menyimpan token secara manual di localStorage.

### Frontend API Auth Fetch

Target lokasi:

- `apps/web/src/lib/auth/authed-fetch.ts`

Tanggung jawab:

- mengambil ID token sebelum request;
- menambahkan `Authorization: Bearer <token>`;
- menjaga header existing seperti `Content-Type`;
- memberi error jelas bila user belum login saat endpoint membutuhkan auth.

### DB API Repository

Target lokasi:

- `apps/web/src/lib/projects/db-api.ts`

Tanggung jawab:

- memakai auth fetch untuk request ke `NEXT_PUBLIC_DB_API_URL`;
- mempertahankan normalisasi snake_case ke camelCase;
- tidak menghitung angka RAB/HSP/BoQ di frontend.

### Auth State UI

Target fase berikutnya:

- login page;
- logout action;
- loading state session;
- redirect dashboard jika belum login.

Catatan: detail UX/frontend sebaiknya direview terpisah karena menyentuh desain aplikasi.

## RBAC Minimum

Backend tetap authority. Frontend hanya menyesuaikan tampilan.

Role minimum:

- `owner`: akses penuh project;
- `pm`/`editor`: ubah data project sesuai izin backend;
- `lapangan`: input data lapangan/progress, bukan angka engine final;
- `viewer`: baca saja.

Endpoint yang mengubah data wajib cek membership/role di backend.

## Fase Implementasi

### Phase 1 - Token Wiring

Scope:

- tambah helper Firebase client;
- tambah helper `getCurrentUserIdToken`;
- ubah DB API client agar mengirim `Authorization`;
- test header bearer terkirim.

Tidak termasuk:

- desain login page;
- auth guard dashboard;
- migrasi tenant besar.

### Phase 2 - Login UI

Scope:

- halaman login minimal;
- logout;
- session loading state;
- redirect sederhana untuk halaman dashboard.

### Phase 3 - Tenant dan Project Membership

Scope:

- organization/project selector;
- integrasi user dengan project membership;
- UI state untuk `401` dan `403`.

### Phase 4 - Hardening

Scope:

- audit log untuk aksi penting;
- rate limit per user/tenant;
- review environment variable;
- deploy checklist.

## Testing Plan

Minimal test Phase 1:

- auth helper mengembalikan token dari current Firebase user;
- `authedFetch` menambahkan `Authorization: Bearer <token>`;
- `db-api.ts` mempertahankan `Content-Type: application/json` untuk write request;
- behavior unauthenticated eksplisit, tidak silent-success;
- backend tetap mengembalikan `401` untuk missing/invalid token;
- internal service key tidak diuji dari browser path.

## Security Notes

- Jangan commit `.env.local`, service account JSON, token, internal key, atau kredensial pribadi.
- `NEXT_PUBLIC_FIREBASE_*` boleh publik sesuai model Firebase client config, tetapi tetap jangan mencampurnya dengan private key.
- `INTERNAL_SERVICE_KEY` harus hanya tersedia di server runtime.
- Jangan log token penuh di console, server log, atau audit trail.
- Jangan membuat fallback yang melewati auth di production.

## Non-Goals

Dokumen ini tidak mencakup:

- perubahan rumus engine;
- perubahan output RAB/HSP/BoQ/jadwal;
- auto-approval AI untuk input engine;
- penyimpanan secret di repo;
- commit, push, PR, atau merge.

## Rekomendasi Eksekusi

Jika nanti implementasi dimulai, kerjakan sebagai PR kecil:

1. buat branch baru;
2. tulis test gagal untuk auth header;
3. implement helper auth minimal;
4. wire `db-api.ts`;
5. jalankan test relevan;
6. jalankan `graphify update .`;
7. push branch dan buka PR;
8. berhenti menunggu review owner/Claude.
