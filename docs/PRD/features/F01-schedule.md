# F1. Schedule

Jadwal sekali & recurring dengan recurrence engine ala Google Calendar, mode waktu fleksibel, edit 3 opsi (kejadian ini / kejadian ini & berikutnya / semua), dan tautan ke task.

## Field
- **Judul** (wajib)
- **Deskripsi** (opsional)
- **Warna / Kategori** (opsional)
- **Tanggal mulai** (wajib)
- **Waktu:**
  - Mode 1: **mulai–selesai** (09:00–10:30)
  - Mode 2: **mulai + durasi menit** (09:00 + 90)
  - Disimpan sebagai `start` + `durasi`; dua mode cuma beda input.
- **All-day** (opsi)
- **Untuk goal** (opsional) — link ke main goal (Sepanjang goal) atau chapter (F13)

## Recurrence
- **Sekali** (tidak berulang)
- **Harian:** tiap N hari, N = 1–6
- **Mingguan:** tiap 1 atau 2 minggu, pilih satu/lebih hari (Senin–Minggu)
- **Bulanan:**
  - Opsi A: tiap bulan di tanggal X (mis. tgl 15)
  - Opsi B: "minggu ke-N hari Y" (mis. Selasa ke-2)
  - Tanggal 29–31 di bulan pendek → dilewati (sama kayak Google Calendar)
- **Berakhir:** tidak pernah / sampai tanggal / setelah N kali

## Edit/Hapus Jadwal Rutin
Saat edit/hapus occurrence:
- **Hanya kejadian ini** — cuma ubah/hapus 1 occurrence
- **Kejadian ini & berikutnya** — ubah mulai dari occurrence ini ke depan
- **Semua** — ubah semua occurrence

## Integrasi
- Satu jadwal bisa ditautkan ke **banyak task** (F2). Di detail jadwal tampil checklist task-nya.
- Tiap kejadian bisa ditandai **selesai/hadir** (dipakai progress Goals, F13).
- Tautan task: dari detail jadwal bisa bikin task baru (otomatis tertaut).

## Konten dari detail jadwal
- Daftar task yang tertaut (dengan checkbox untuk tandai selesai/hadir).
- Tombol "+ Tambah task" → form task cepat.

## UI
- Form jadwal: dua mode waktu input, validasi selesai > mulai.
- Input teks di-escape (no HTML injection).
- Recurring diatur step-by-step (pilih tipe → pilih hari/tanggal → pilih berakhir).
- Edit/hapus: 3 opsi muncul sebagai dialog.

## Performa & Ekspansi
- Recurring di-expand **hanya untuk rentang yang sedang dilihat** (di Kalender, Home, etc).
- Jangan expand semua kejadian sampai selamanya.
- Kalender (F6) akan expand ke view yang aktif (hari/pekan/bulan).
