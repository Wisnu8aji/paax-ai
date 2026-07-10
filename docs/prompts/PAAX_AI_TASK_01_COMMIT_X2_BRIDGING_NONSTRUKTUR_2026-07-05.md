# PROMPT SAYA — Task 1/3: Verifikasi & Commit Pekerjaan X2 Bridging Non-Struktur (Dinding/Atap/Kusen/MEP)

> Ditulis Saya, 2026-07-05, reasoning tinggi. **Ini task PALING URGENT
> dari 3 task berantai** — melindungi pekerjaan yang SUDAH selesai &
> teruji tapi BELUM PERNAH di-commit (risiko nyata hilang kalau working
> tree berubah/direset — pernah terjadi di repo ini sebelumnya, lihat
> catatan insiden "untracked docs lost" di memori sesi lama).
>
> **Setelah task ini selesai DAN report ditulis (§6), WAJIB langsung
> lanjut ke** `docs/prompts/PAAX_SAYA_TASK_02_BRIDGING_KUDA_KUDA_BAJA_PROFIL_2026-07-05.md`
> **di branch yang SAMA** (jangan checkout ke branch/worktree lain dulu).

---

## 0. LANGKAH PERTAMA WAJIB — cek dulu apakah pekerjaannya ADA

**Sebelum apa pun lain**, jalankan di working tree kamu:
```
git status
git diff --stat
```

Task ini mengasumsikan working tree kamu SUDAH berisi perubahan
UNCOMMITTED berikut (dikerjakan langsung oleh Saya sesi-sesi
sebelumnya, BUKAN Saya — lihat `docs/ai-map/STATE.md` §RANGKAIAN
BRIDGING NON-STRUKTUR & §KOREKSI POLA KERJA):

File baru yang HARUS ada (kalau tidak ada, lihat §0.1 di bawah):
```
services/document-intelligence/app/perception/ai_assist/
  (client.py, dimension_assist.py, zone_assist.py, wall_assist.py,
   roof_frame_assist.py, kusen_assist.py, mep_assist.py)
services/document-intelligence/app/perception/bridging_dinding.py
services/document-intelligence/app/perception/bridging_atap.py
services/document-intelligence/app/perception/bridging_kusen.py
services/document-intelligence/app/perception/bridging_mep.py
services/document-intelligence/tests/test_perception_ai_assist.py
services/document-intelligence/tests/test_perception_bridging_dinding.py
services/document-intelligence/tests/test_perception_bridging_atap.py
services/document-intelligence/tests/test_perception_bridging_kusen.py
services/document-intelligence/tests/test_perception_bridging_mep.py
```

Dan modifikasi (bukan file baru) di:
```
services/document-intelligence/app/perception/consolidate.py
services/document-intelligence/app/perception/consolidated_models.py
services/document-intelligence/app/perception/work_items.py
services/document-intelligence/app/api/drawing_routes.py
services/document-intelligence/app/api/tkg_routes.py
services/document-intelligence/tests/test_perception_consolidate.py
packages/schemas/src/index.ts
```

Plus dokumentasi (`SAYA.md`, `AGENTS.md`, `docs/MASTER_PLAN.md`,
`docs/BRAIN_ALIGNMENT.md`, `docs/ai-map/*.md`, `docs/plans/*.md`,
`docs/strategy/*.md`) dan file baru di `docs/prompts/` +
`report-remote/REPORT_X2_*_SAYA_2026-07-05.md` (4 file: DINDING, ATAP,
KUSEN, MEP) + `report-remote/REPORT_FASE_X2_AI_ASSIST_BINDING_SAYA_2026-07-05.md`.

### 0.1 KALAU file-file di atas TIDAK ADA di working tree kamu

**STOP. JANGAN mencoba menulis ulang kode ini dari deskripsi di prompt
ini.** Ini bukan spek untuk implementasi baru — ini adalah kode yang
SUDAH ditulis, diuji manual (229 test lulus, dikonfirmasi Saya via
`pytest -q` langsung), dan cuma menunggu di-commit. Menuliskannya ulang
dari nol berisiko menghasilkan versi yang SEDIKIT BERBEDA dari yang sudah
diverifikasi (risiko subtle bug). Kalau working tree kamu bersih/tidak
punya perubahan ini (kemungkinan besar krn kamu jalan di
checkout/worktree yang berbeda dari sesi Saya sebelumnya): laporkan di
`report-remote/REPORT_TASK01_COMMIT_X2_BRIDGING_SAYA_<tanggal>.md` bahwa
perubahan yang diharapkan TIDAK DITEMUKAN, sebutkan `git status` mentah
yang kamu lihat, dan BERHENTI — jangan lanjut ke Task 2 sampai masalah ini
diselesaikan (butuh Saya/owner memindahkan perubahan itu ke tempat yang
bisa kamu akses, mis. lewat patch/diff).

---

## 1. Scope task ini

1. **Verifikasi** (bukan percaya begitu saja) bahwa semua perubahan di
   §0 benar ada & valid: jalankan test suite penuh, cek tidak ada
   `apps/web/**` ikut berubah.
2. **Commit** perubahan itu — dipecah jadi BEBERAPA commit kecil logis
   (bukan satu commit raksasa), mengikuti urutan yang sudah dikerjakan:
   - Commit 1: Fase X2 asli (dimension_assist + zone_assist, slice
     footplat+zona) — file `dimension_assist.py`, `zone_assist.py`,
     `client.py`, wiring awal `consolidate.py`/`consolidated_models.py`,
     test terkait.
   - Commit 2: Slice dinding (`wall_assist.py`, `bridging_dinding.py`,
     wiring, test).
   - Commit 3: Slice atap (`roof_frame_assist.py`, `bridging_atap.py`,
     wiring, test).
   - Commit 4: Slice kusen (`kusen_assist.py`, `bridging_kusen.py`,
     wiring, test).
   - Commit 5: Slice MEP (`mep_assist.py`, `bridging_mep.py`, wiring,
     test).
   - Commit 6: Dokumentasi (`SAYA.md`, `AGENTS.md`, `docs/**`).

   **Kalau memisah persis sejauh itu terlalu rumit karena perubahan saling
   tumpang tindih di file yang sama** (mis. `consolidate.py` diubah di
   setiap slice): BOLEH digabung jadi lebih sedikit commit (mis. 1 commit
   per slice tanpa split dimension/zone terpisah, atau bahkan 1 commit
   gabungan kalau terlalu sulit dipisah bersih) — YANG PENTING pesan
   commit jujur menjelaskan isinya, JANGAN paksakan split yang berisiko
   pecah kode di titik commit.
3. **Buka branch baru DARI branch yang benar** (§2 — PENTING, baca dulu
   sebelum membuat branch, salah base branch akan menyebabkan konflik).
4. **Buka PR draft**.
5. Tulis report (§6).

**JANGAN**: menulis kode baru/fitur baru apa pun di task ini (murni
verifikasi + commit pekerjaan yang SUDAH ada), mengubah logika apa pun
dari yang sudah ada (kalau kamu menemukan bug saat verifikasi, JANGAN
diperbaiki sendiri — laporkan di report, biarkan Saya/owner memutuskan
perbaikannya di task terpisah), menyentuh `apps/web/**`.

---

## 2. Branch — PENTING, baca dgn cermat

Perubahan di §0 dibangun DI ATAS kode Fase X1/X1B (`bridging_tanah.py`,
WBS di `paax_schemas`, dll) yang **BELUM ADA di `main`** — X1/X1B masih
draft PR #37/#38 di branch `feat/fase-x1-bridging-galian-footplat` /
`feat/fase-x1b-packaging-binding-footplat`. Karena kode di §0 MEMANGGIL
fungsi dari `bridging_tanah.py` (mis. `bridge_galian_footplat`,
`_collect_detail_texts` yang dipakai ulang oleh slice atap) yang HANYA
ada di branch X1B, **JANGAN branch dari `main`** — working tree kamu
SAAT INI kemungkinan besar SUDAH checkout di branch
`feat/fase-x1b-packaging-binding-footplat` (cek `git branch --show-
current`). Kalau benar:

```
git checkout -b feat/x2-bridging-non-struktur-dinding-atap-kusen-mep
# (branch baru dari HEAD saat ini, yaitu ujung feat/fase-x1b-packaging-binding-footplat)
```

Commit perubahan di §0 ke branch baru ini. **JANGAN commit langsung ke
`feat/fase-x1b-packaging-binding-footplat`** (biarkan PR #38 tetap fokus
ke packaging+investigasi footplat saja, tidak dicampur scope baru).

Kalau ternyata `git branch --show-current` menunjukkan branch LAIN (bukan
`feat/fase-x1b-packaging-binding-footplat`) — **STOP, laporkan branch apa
yang aktif** di report, jangan menebak base yang benar sendiri.

---

## 3. Verifikasi WAJIB sebelum commit

```
cd services/document-intelligence && python -m pytest -q
# Harapan: 229 passed, 5 skipped (angka PERSIS ini, laporkan kalau beda)

cd ../core-engine && python -m pytest -q
# Harapan: 280 passed (tidak berubah, service ini tidak disentuh)

cd ../../packages/schemas && pnpm build && pnpm test
# Harapan: build sukses, 12 test passed

cd ../../apps/web && pnpm vitest run && pnpm tsc --noEmit
# Harapan: 47 test passed, tsc bersih (apps/web TIDAK disentuh scope ini,
# tapi packages/schemas berubah jadi tetap perlu verifikasi kompatibilitas)
```

Kalau ADA test yang gagal/angka beda dari yang diharapkan: **JANGAN
memperbaiki sendiri** (bisa jadi ada perubahan lain yang masuk sejak
Saya terakhir verifikasi) — laporkan detail kegagalannya di report,
dan **STOP, jangan lanjut commit** sampai ini jelas.

Cek juga:
```
git diff --stat main..HEAD -- apps/web
```
HARUS kosong (tidak ada perubahan `apps/web/**`). Kalau TIDAK kosong —
STOP, laporkan, jangan commit.

---

## 4. Isi commit — larangan tegas

- **TANPA `Co-Authored-By`/signature AI apa pun** di commit manapun.
- Pesan commit format Conventional Commits (`feat(document-intelligence):
  ...`), jelaskan isi SINGKAT & jujur (mis. "feat(document-intelligence):
  add AI-assist dinding bridging" bukan generik "update files").

---

## 5. PR

- PR **draft**, **base branch = `feat/fase-x1b-packaging-binding-
  footplat`** (BUKAN `main` — karena dependency §2), head =
  `feat/x2-bridging-non-struktur-dinding-atap-kusen-mep`.
- **JANGAN merge sendiri.**
- Judul PR jelas mendeskripsikan isi (mis. "feat: AI-assist bridging
  non-struktur (dinding/atap/kusen/mep)").

---

## 6. Laporan WAJIB — `report-remote/`, JANGAN hapus/timpa riwayat lama

Nama file baru: `report-remote/REPORT_TASK01_COMMIT_X2_BRIDGING_SAYA_<tanggal>.md`.

Isi wajib: (1) hasil `git status`/`git diff --stat` SEBELUM commit
(bukti apa yang benar-benar ditemukan di working tree — salin mentah),
(2) hasil verifikasi §3 (semua angka test, salin mentah, bukan
diringkas), (3) daftar SEMUA commit yang dibuat dgn output mentah
`git log -1 --format="%H%n%s%n%n%b" <sha>` tiap satu, (4) link PR + base
branch + status, (5) konfirmasi tidak ada `apps/web/**` tersentuh, tidak
ada `Co-Authored-By`/signature AI di commit manapun, (6) kalau ada
masalah/temuan aneh yang TIDAK kamu perbaiki sendiri (sesuai larangan
§1) — sebutkan detail lengkap di sini, jangan disembunyikan.

---

## 7. Setelah task ini selesai

**LANGSUNG lanjutkan** ke
`docs/prompts/PAAX_SAYA_TASK_02_BRIDGING_KUDA_KUDA_BAJA_PROFIL_2026-07-05.md`
**DI BRANCH YANG SAMA** (`feat/x2-bridging-non-struktur-dinding-atap-kusen-mep`,
JANGAN checkout branch/worktree lain) — task itu MEMPERLUAS pekerjaan
yang baru saja kamu commit. Jangan menunggu instruksi manual, KECUALI
kamu berhenti di §0.1 atau menemukan blocker di §3.
