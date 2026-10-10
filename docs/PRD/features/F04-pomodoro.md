# F4. Pomodoro

Timer fokus dengan setting fleksibel, target task/teks bebas, riwayat sesi, widget di Home.

## Setting
- **Durasi fokus** (default 25 menit)
- **Istirahat pendek** (default 5 menit)
- **Istirahat panjang** (default 15 menit)
- **Jumlah sesi sebelum istirahat panjang** (default 4)
- Setting tersimpan & dipersisten

## Target Fokus
- **Opsi 1:** pilih task dari to-do
- **Opsi 2:** tulis teks bebas (mis. "Baca artikel")
- Terlihat saat timer berjalan

## Kontrol
- **Start / Pause / Reset / Skip**
- Tombol jelas di timer

## Akurasi Timer
- Hitung dari **timestamp**, bukan `setInterval`
- Tetap akurat walau tab/app di-background hingga 5 menit+
- Sinkron dengan sistem waktu perangkat

## Notifikasi
- Suara + notifikasi in-app saat fase berakhir
- Tipe notif: fokus → istirahat / istirahat → fokus

## Riwayat Sesi
Setiap sesi dicatat:
- Tanggal
- Durasi aktual (start → end)
- Target (task link atau teks)
- Status (selesai / skipped)

Dipakai Overview (F11) & Home (F12) untuk grafik & metrik.

## Widget di Home (F12)
- State sama dengan halaman Pomodoro
- Start langsung dari Home
- Pilih task dari dropdown kecil
- Minimal: show current phase + waktu sisa

## UI
- Halaman Pomodoro: timer besar, setting button, riwayat list
- Widget Home: compact timer + start button
- Responsif di semua ukuran
