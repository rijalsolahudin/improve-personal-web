# F13. Goals

2 tingkat: main goal → chapter. Lapisan konteks "kenapa" untuk task/habit/jadwal. Progress & review berkala.

## Struktur

### Main Goal
- **Judul** (wajib)
- **Alasan** ("Kenapa penting?") — teks singkat
- **Kategori:** karier / kesehatan / keuangan / diri / relasi
- **Sticker sampul** (opsional) — dekorasi dari F14
- **Tanggal mulai & target** (wajib)
- **Status:** aktif / selesai / ditunda / dibatalkan
- **Jumlah aktif:** bebas (unlimited)

### Chapter (Opsional)
- **Judul** (wajib kalau ada chapter)
- **Periode mulai–selesai** (wajib di dalam rentang main goal)
- **Urutan:** bisa drag untuk reorder
- Goal bisa tanpa chapter (langsung item)

### Sepanjang Goal (Virtual Chapter)
- Chapter bayangan yang berisi item ditaut **langsung ke main goal**
- Tanpa periode sendiri (ikut rentang main goal)
- Tampil paling atas, bukan chapter bernomor

## Tautan Item
- Task/habit/jadwal punya field opsional **"Untuk goal"**
- Pilih: main goal (Sepanjang goal) ATAU salah satu chapter
- **Satu item cuma di satu tempat** (nggak dobel hitung)
- Task, habit, jadwal dipilih dari dropdown → link ke goal itu

## Progress

### Chapter / Sepanjang Goal Progress
Rata-rata dari item di dalamnya:
- **Task:** selesai / total
- **Habit:** % hari target tercapai selama periode chapter (sampai hari ini)
- **Jadwal:** % kejadian ditandai selesai/hadir selama periode chapter (sampai hari ini)

### Main Goal Progress
- **Tanpa chapter:** progress langsung dari item-itemnya
- **Ada chapter:** rata-rata semua chapter **termasuk Sepanjang goal** (kalau ada isinya), bobot sama

### Chapter Selesai Manual
- Bisa ditandai selesai manual → progress = 100%
- Termasuk chapter tanpa item

## Status Chapter (Otomatis dari Tanggal)
- **Belum mulai:** hari ini < tanggal mulai
- **Berjalan:** tanggal mulai ≤ hari ini ≤ tanggal selesai
- **Selesai:** hari ini > tanggal selesai AND progress = 100%
- **Terlewat:** hari ini > tanggal selesai AND progress < 100%

## Review Berkala
- Saat chapter berakhir / terlewat, dan **tiap akhir pekan** untuk goal aktif
- Muncul kartu review di Home: "Gimana progress [goal]/[chapter]?"
- Opsi chapter terlewat: **perpanjang / geser periode / tutup**
- Jawaban review **disimpan sebagai Memo** dengan auto-mention goal-nya

## Integrasi

### Memo (F8)
- Mention `#goal` / chapter → jadi chip navigasi ke goal detail

### Countdown (F5)
- Tombol "Buat countdown" dari tanggal target goal

### Kalender (F6)
- Tanggal target goal & batas chapter tampil sebagai penanda

### Overview (F11)
- Widget "Progress goal": tiap goal aktif + chapter berjalan di rentang terpilih

### Home (F12)
- Widget "Goal aktif": chapter sedang berjalan + progress, item hari ini dari chapter

## Halaman Goals
1. **Daftar goal** — filter status/kategori + progress bar
2. **Detail goal** — stepper/timeline chapter:
   - Selesai → Berjalan → Belum mulai (urutan visual)
   - Per chapter: daftar item + progress

## Edge Cases

### Hapus Main Goal
- Chapter ikut terhapus
- Item tetap ada (tautan dilepas)
- Konfirmasi dulu ke user

### Hapus Chapter
- Item bisa:
  - Pindah ke Sepanjang goal (default)
  - Dilepas (user pilih)
- Konfirmasi opsi

### Geser Periode Main Goal
- Kalau chapter jadi di luar rentang main goal → **ditolak dengan pesan jelas**
- "Chapter X enddate (15 Mar) > main goal enddate (10 Mar)"

## UI
- Halaman Goals: card per goal, expand → chapter list
- Detail goal: stepper visual (selesai ← berjalan → belum mulai)
- Form goal: input judul, alasan, kategori, tanggal, sticker picker
- Form chapter: input judul, tanggal mulai–selesai
- Drag reorder chapter (long press / handle)
- Item list: checkbox selesai + link task/habit/jadwal
