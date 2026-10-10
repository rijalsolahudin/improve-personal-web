# F12. Home

Halaman utama dengan sapaan, habit today, task progress, streak, quick add, memo cepat, Pomodoro widget, goal aktif widget.

## Konten

### Sapaan + Tanggal
- "Pagi, Rijal" atau "Sore, Rijal" (tergantung jam)
- Tanggal hari ini (Senin, 15 Januari 2025)

### Habit Hari Ini
- Widget: daftar habit jadwal hari ini
- **Quick habit check:** 1 klik centang → update target
- Tampil ikon + nama + progress (N/target)

### Task Selesai Hari Ini
- **Progress bar:** selesai / total task hari ini
- Angka: "5 dari 10 task"
- Link ke "Lihat semua task hari ini"

### Streak
- **Streak terpanjang aktif** (dari habit)
- **Streak "hari produktif"** (ada task selesai OR sesi fokus)
- Format: "🔥 12 hari" atau icon streak

### Jadwal Berikutnya
- Jadwal / task deadline paling dekat hari ini
- Tampil: "10:00 – Meeting" atau "Deadline Task (3 jam lagi)"

### Quick Add Task Penting
- Input judul + deadline + prioritas → langsung masuk to-do
- Tombol "Langsung ke Eisenhower?" (opsi taruh di kuadran Penting)

### Memo Cepat + Mood
- Form cepat: textarea + sticker picker + mood selector
- Save → entri baru di F8
- Minimal: text + mood (sticker opsional)

### Pomodoro Widget
- Compact timer + start button
- Pilih task dari dropdown kecil
- State sinkron dengan halaman F4
- Tombol "Buka Pomodoro" (full page)

### Goal Aktif Widget
- Chapter yang sedang berjalan (dari F13)
- Progress bar goal
- Item hari ini dari chapter itu (max 3)
- Link "Lihat goals"

### Review Berkala (Opsional)
- Kalau ada chapter berakhir/terlewat atau akhir pekan → kartu review
- "Gimana progress [goal]/[chapter]?" dengan opsi perpanjang/geser/tutup
- (Dari F13)

## UI Layout
- Responsive: stacked di HP, 2-col grid di tablet, 3-col desktop
- Card per widget
- Scroll panjang kalau banyak widget
- Action button prominent (warna)

## Performa
- Load sekali (no polling)
- Real-time update kalau ada perubahan tab lain
- Widget independen (bisa lazy load widget berat)

## Integrasi
- Widget Pomodoro ↔ halaman F4 (sinkron state)
- Widget habit → link F7
- Widget task → link F2
- Widget goal → link F13
- Memo cepat → F8 (new entry)
- Quick add task → F2 (new task)
