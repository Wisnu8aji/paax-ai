# Engineering Chat — Asisten Lintas-Halaman

Route: `/proyek/[projectId]/chat` (entri per-proyek) — **tetapi cakupannya
lintas-proyek & lintas-halaman**. Status: **[roadmap]** (rancang sekarang,
bangun setelah v0.8 Gemini wiring).

> Baca [README.md](README.md) §1 dulu (kontrak bersama & Aturan Emas).

---

## 1. VISI (arahan owner, 2026-06-28)

Engineering Chat BUKAN sekadar kotak tanya-jawab di satu proyek. Ia **asisten
insinyur yang bisa membaca SELURUH data user** dan memberi *reasoning*:

- Membaca **RAB & schedule semua proyek** milik user.
- Membaca **notifikasi**, **warning**, dan **kebutuhan proyek**.
- Menjawab pertanyaan teknis maupun acak yang butuh menalar di atas data itu.

Contoh nyata yang harus didukung:
1. *"Bagaimana cara saya meng-adjust RAB supaya lebih murah?"*
   → AI membaca RAB, menemukan item bobot terbesar, mengusulkan opsi
   penghematan + **alasannya**, dan menampilkan angka baru **dari engine**.
2. *"Hari ini hujan, langkah apa supaya schedule tetap sesuai tanpa
   mengganggu progress?"*
   → AI menalar urutan pekerjaan (mis. geser pekerjaan dalam-ruangan maju),
   lalu **memanggil engine** untuk menghitung ulang Kurva S / dampak durasi.

---

## 2. ATURAN EMAS DI CHAT (paling penting)

Chat boleh **menalar, menyarankan, menjelaskan** — tapi **setiap angka yang
keluar harus berasal dari engine**, bukan dikarang AI.

- ✅ BOLEH: "Item pembesian menyumbang 28% biaya — ini kandidat penghematan."
  (28% dari `/rab/build`, AI hanya mengutip).
- ✅ BOLEH: AI mengusulkan "ganti AHSP X→Y" lalu **memanggil `/rab/calculate`**
  untuk menampilkan total baru → "kalau diganti, total turun jadi Rp … (hasil
  engine)".
- ❌ DILARANG: AI menyebut "kira-kira hemat 12 juta" tanpa memanggil engine.
- ❌ DILARANG: AI menulis langsung angka final ke RAB/jadwal. Ia hanya
  **mengusulkan perubahan input terstruktur**; user menyetujui; engine
  menghitung; baru tersimpan.

Pola wajib: **reasoning (AI) + angka (engine) + sumber/kutipan (grounding).**

---

## 3. ARSITEKTUR: TOOL-CALLING + RAG

Chat = LLM (Gemini) yang punya **alat (tools)** dan **konteks ter-grounding**:

### 3.1 Tools (LLM memanggil, kode yang eksekusi ke engine)
- `get_rab(project_id)` → ambil RAB tersektor (`/rab/build`).
- `recalc_rab(project_id, perubahan)` → hitung ulang dengan usulan AI
  (`/rab/calculate`) — untuk skenario "lebih murah".
- `get_schedule(project_id)` / `simulate_scenario(...)` → `/schedule/s-curve`,
  `/scenario/simulate`.
- `get_hsp(ahsp_code, region)` → `/rab/hsp`.
- `list_projects()`, `get_notifications(user)`, `get_warnings(project_id)`.
- `export_excel(project_id)` → `/rab/export/excel`.

LLM hanya memilih tool + argumen terstruktur; **kode** memanggil engine; engine
mengembalikan angka; LLM menarasikan. (= alur langkah 6 di diagram arsitektur.)

### 3.2 RAG (grounding)
- Korpus: AHSP (Permen PUPR/SE DJBK), data proyek user, catatan/komentar,
  notifikasi & warning. Jawaban menyertakan **rujukan** (proyek/koefisien/sumber).
- Tujuan: jawaban tidak mengarang; bisa ditelusuri.

---

## 4. CAKUPAN DATA (lintas-proyek) & GOVERNANCE

- Chat membaca **hanya data milik user yang login** + sesuai RBAC perannya
  (estimator/PM/lapangan/owner). Tidak boleh bocor antar-tenant/antar-user.
- Akses default = **READ** semua halaman user. **PROPOSE** (perubahan) selalu
  butuh konfirmasi user sebelum disimpan. Tindakan keluar (export, kirim,
  ubah data) tidak dijalankan diam-diam.
- Pertanyaan acak/di luar data (mis. cuaca) boleh dijawab dengan reasoning
  umum, tetapi saat menyentuh angka proyek → tetap lewat engine.

---

## 5. CONTOH ALUR LENGKAP

### 5.1 "Adjust RAB lebih murah"
1. `get_rab` semua proyek terkait → AI ranking item by bobot.
2. AI mengusulkan opsi (value engineering: substitusi material setara, kurangi
   spesifikasi berlebih, tinjau volume) + alasan tiap opsi.
3. Untuk tiap opsi → `recalc_rab` → engine kembalikan total baru.
4. AI sajikan perbandingan: total lama vs baru (angka engine) + risiko/dampak.
5. User pilih → perubahan input disimpan → RAB resmi dihitung ulang engine.

### 5.2 "Hujan, jaga schedule"
1. `get_schedule` + `get_warnings` (mis. pekerjaan luar yang terdampak).
2. AI menalar: pekerjaan apa bisa digeser/diparalelkan tanpa langgar
   ketergantungan; saran mitigasi (tenda, shift, urutan).
3. `simulate_scenario` / `get_schedule` ulang dengan urutan baru → engine
   hitung Kurva S & durasi baru.
4. AI jelaskan: dampak ke progress & tanggal selesai (angka engine) + langkah
   konkret. Tidak mengarang durasi.

---

## 6. FALLBACK MANUAL
- Tanpa API key / model gagal → chat tampil mode terbatas: tetap bisa
  menjalankan tool deterministik (tampilkan RAB/jadwal/HSP) tanpa narasi LLM.
- Semua usulan AI bisa diabaikan; user tetap bisa edit manual di halaman terkait.

## 7. STATUS & URUTAN BANGUN
- Prasyarat: wiring Gemini (v0.8) + endpoint engine (sudah ada).
- Tahap 1: chat per-proyek read-only + tool `get_rab`/`get_schedule`/`get_hsp`.
- Tahap 2: lintas-proyek + notifikasi/warning + RAG grounding.
- Tahap 3: PROPOSE + recompute (skenario "lebih murah" / mitigasi jadwal).
