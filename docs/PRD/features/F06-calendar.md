# F6. Calendar

3 view (hari / pekan / bulan) dengan recurring expansion, detail hari, bikin jadwal di slot kosong.

## View
1. **Hari:** fokus satu hari, timeline jam
2. **Pekan:** 7 hari dalam grid, slot jam minimal
3. **Bulan:** 30-31 hari, view keseluruhan

## Navigasi
- Prev / Next (pekan/bulan)
- Tombol "Hari ini" → kembali ke hari sekarang

## Konten yang Ditampilkan
- **Jadwal (recurring di-expand):** kejadian dari F1, hasil expand hanya rentang yang sedang dilihat
- **Task ber-deadline:** dari F2, tampil di tanggal deadline
- **Countdown:** dari F5, tampil di tanggal target

## Interaksi
- **Klik tanggal** (view bulan/pekan) → panel/detail hari itu: daftar jadwal + to-do + memo hari itu
- **Klik slot kosong** (view hari/pekan) → bikin jadwal baru di jam itu
- **Klik event** → detail jadwal/task/countdown

## Recurring Expansion
- Di-expand **hanya untuk rentang yang sedang dilihat** — bukan semua kejadian sampai selamanya
- View hari: expand 1 hari
- View pekan: expand 7 hari
- View bulan: expand 30-31 hari dari tanggal pilihan

## Performa
- Render bulan < 100ms untuk 500 kejadian (bisa pakai virtualization kalau perlu)
- Recurring engine (F1) pakai T3 buat expand efisien

## UI
- Responsive di semua ukuran (HP: view hari/pekan utama, desktop: pilihan 3 view)
- Warna jadwal (kategori)
- Marker countdown & late task
- Panel detail hari: stacked list jadwal + task + memo
