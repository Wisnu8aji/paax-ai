# PAAX UI Utama - Fable Premium Redesign

Status: kanonik mulai 2026-07-07.

UI dasar dan utama PAAX adalah hasil Fable premium redesign yang mengikuti referensi `G:\Dashboard`.

## Pegangan Utama

- Shell aktif memakai `apps/web/src/components/app-shell/side-rail.tsx`.
- Layout aktif memakai `apps/web/src/app/(dashboard)/layout.tsx` dengan `SideRail`.
- Halaman chat utama premium adalah `apps/web/src/app/(dashboard)/command-room/page.tsx`.
- Styling dasar premium ada di `apps/web/src/app/globals.css`.
- Topbar aktif ada di `apps/web/src/components/app-shell/topbar.tsx`.

## Yang Tidak Dipakai Lagi

File berikut bukan dasar UI utama dan tidak boleh dihidupkan kembali sebagai shell dashboard:

- `apps/web/src/components/app-shell/icon-rail.tsx`
- `apps/web/src/components/app-shell/nav-panel.tsx`
- `apps/web/src/components/app-shell/sidebar.tsx`

Jika task berikutnya perlu menyambungkan backend, chat, project, atau data real, lakukan di atas UI Fable premium ini. Jangan mengganti shell kembali ke dashboard lama.

## Referensi Visual

- `G:\Dashboard\dashboard utama\Gelap.png`
- `G:\Dashboard\dashboard utama\light mode.png`
- `G:\Dashboard\Engineering chat\engineering chat.txt`
- `G:\Dashboard\Engineering chat\cchat.png`
- `G:\Dashboard\palette warna\warna.txt`
- `G:\Dashboard\animasi\animasi sidebar.txt`

## Catatan Integrasi

Bagian Antigravity yang berupa wiring data/backend boleh dipertahankan jika masih berguna, tetapi visual shell tidak boleh mengalahkan Fable premium redesign.
