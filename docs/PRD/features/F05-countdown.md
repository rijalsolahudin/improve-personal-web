# F5. Countdown

Momen penting dengan unit dinamis, sort terdekat, arsipkan yang lewat.

## Field
- **Nama momen** (wajib) — "Liburan", "Ulang tahun", etc
- **Tanggal + jam target** (wajib)
- **Warna + sticker/emoji** (opsional) — dekorasi

## Unit Dinamis
Tampilkan unit terbesar relevan + satu di bawahnya:
- ≥ 1 tahun → "1 tahun 3 bulan lagi"
- ≥ 1 bulan → "2 bulan 10 hari lagi"
- ≥ 1 hari → "4 hari 6 jam lagi"
- ≥ 1 jam → "3 jam 20 menit lagi"
- < 1 jam → "12 menit 30 detik lagi"
- **Lewat:** "Sudah lewat 3 hari" (merah) + opsi **arsipkan**

## Sort
- Default: dari yang paling dekat
- Countdown "lewat" bisa diarsipkan atau tetap terlihat

## Integrasi
- **Halaman Countdown:** list dengan unit dinamis + edit/hapus
- **Halaman Overview (F11):** "countdown terdekat (3 teratas)" widget
- **Home (F12):** optional, tapi bisa link

## UI
- Card per countdown: nama, target, unit dinamis, sticker
- Edit/hapus button
- Archive button kalau sudah lewat
- Responsif di semua ukuran

## Performa
- Unit dinamis dihitung sekali per ganti countdown atau per interval (bukan tiap render)
