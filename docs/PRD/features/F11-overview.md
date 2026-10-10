# F11. Overview

Dashboard analitik 5 rentang (Keseluruhan/Harian/Pekanan/Bulanan/Tahunan) dengan metrik, streak, grafik, goal progress. Agregasi lokal.

## Rentang Waktu
User bisa pilih:
1. **Keseluruhan** — semua data sepanjang akun ada
2. **Harian** — hari tertentu (default hari ini)
3. **Pekanan** — minggu tertentu (default minggu ini)
4. **Bulanan** — bulan tertentu (default bulan ini)
5. **Tahunan** — tahun tertentu (default tahun ini)

Per rentang ada tombol **prev/next** (hari lalu/besok, pekan lalu/depan, dll).

## Widget/Metrik

### Ringkasan Angka
- Task selesai (jumlah)
- % task selesai tepat waktu (deadline sebelum target)
- Total menit fokus Pomodoro (dari riwayat sesi)
- Jumlah sesi Pomodoro
- Habit completion rate (% hari target tercapai)

### Streak
- **Streak aktif** & **streak terpanjang** per habit
- **Streak "hari produktif"** (ada task selesai ATAU sesi fokus)
- **Streak menulis memo** (hari dengan entri memo)
- **Rentang Keseluruhan:** rekor sepanjang masa

### Grafik Fokus
Menit Pomodoro per unit waktu:
- **Harian:** per jam (0:00–23:00)
- **Pekanan/Bulanan:** per hari (Mon–Sun)
- **Tahunan/Keseluruhan:** per bulan (Jan–Dec)

### Habit Heatmap
Ala GitHub contribution:
- Per habit, grid harian/mingguan
- Warna intensity: 0% → 100% target
- Hover → detail hari itu

### Tren Mood
- **Garis** mood harian (scatter/line chart)
- **Korelasi sederhana:** rata-rata mood di hari fokus tinggi vs rendah (insight)

### Distribusi Eisenhower
- Jumlah task per kuadran (bar chart)
- Indicator: banyakan "Kerjakan" vs "Jadwalkan"?

### Waktu Terjadwal
- Total jam jadwal per kategori/warna
- Breakdown: "Kerja 20h, Gym 5h, Sosial 3h, etc"

### Task Terlambat & Countdown Terdekat
- **Task terlambat:** 3 teratas, deadline, sisa waktu
- **Countdown terdekat:** 3 teratas, target, waktu tinggal

### Progress Goal
- **Per goal aktif:** main goal progress bar + chapter berjalan
- Filter rentang: tampil goal yang ada chapter/item di rentang terpilih
- Link ke halaman Goals (F13) detail

## Perhitungan
- **Agregasi lokal** di perangkat (bukan server)
- Kalkulasi sekali per **ganti rentang**, bukan per widget re-scan
- Efficient query (index tanggal)

## UI
- Tab/picker rentang di top
- Grid layout 2-3 kolom widget (responsive)
- Card per widget dengan title, value, mini chart
- Navigasi prev/next di header
- Responsive di semua ukuran

## Performa
- Aggregation sekali per ganti, cache hasil
- Chart library: Recharts atau similar (lite)
- Lazy load chart kalau ada banyak widget
