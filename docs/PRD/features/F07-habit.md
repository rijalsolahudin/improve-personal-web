# F7. Habit

Kebiasaan harian dengan frekuensi, check-in, streak, riwayat heatmap, link ke goal.

## Field
- **Nama** (wajib)
- **Ikon** (sticker/emoji) (opsional) — dekorasi
- **Frekuensi:**
  - Tiap hari
  - Hari-hari tertentu dalam seminggu (Senin–Minggu, multi-select)
- **Target per hari** (default 1x, bisa disesuaikan)
- **Untuk goal** (opsional) — link ke main goal (Sepanjang goal) atau chapter (F13)

## Check-in
- Satu check-in per hari (bisa berkali-kali, accumulate ke target)
- UI: tombol "+1" atau input jumlah
- Waktu check-in tercatat

## Streak
- **Streak aktif** = hari berturut-turut yang target terpenuhi
- **Catatan:** hari yang bukan jadwal habit tidak memutus streak
  - Misal: habit "Senin–Jum'at" → weekend nggak break streak
- Unit test: streak benar untuk multi-day frekuensi

## Riwayat Check-in
- Per hari: actual count vs target
- Disimpan buat heatmap di Overview (F11)

## Integrasi
- **Home (F12):** "Habit hari ini" widget + "quick habit check" (satu klik centang)
- **Overview (F11):** habit heatmap ala GitHub contribution per habit, completion rate
- **Goals (F13):** progress goal dari habit = % hari tercapai

## UI
- Halaman Habit: list habit, card per habit tampil ikon + nama + streak + tombol check
- Check-in form: input jumlah atau toggle
- Riwayat: mini heatmap per habit
- Responsive di semua ukuran

## Performa
- Streak calculation: per habit, cukup runut ke belakang sampai streak break
- Unit test wajib: streak multi-hari, streak dengan weekend exception
