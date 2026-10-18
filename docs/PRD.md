# PRD — Improve Personal (Aplikasi Produktivitas Personal)

## Konteks
Individu butuh satu tempat buat ngatur goal jangka panjang, jadwal (sekali & rutin), to-do, prioritas (Eisenhower), fokus (Pomodoro), momen penting (countdown), habit, dan refleksi harian (journal: niat, perasaan, afirmasi, syukur). Sekarang tersebar di banyak app. Target: pengguna personal, satu akun dipakai di banyak perangkat (laptop, HP). Isinya personal (journal, mood, goal hidup), jadi user harus yakin datanya cuma bisa dibaca dia sendiri.

## Tujuan & kriteria sukses
Satu app di **web desktop, PWA, dan aplikasi native Android (APK) & iOS** yang bikin user bisa rencanain hari, eksekusi dengan fokus, dan refleksi. Semua data saling terhubung (jadwal ↔ task ↔ journal ↔ goal), tersinkron antar perangkat, dan terenkripsi end-to-end.
- User bisa bikin jadwal rutin "tiap 2 minggu, Senin & Kamis, 09:00–10:30" dan jadwal itu muncul benar di kalender view hari/pekan/bulan.
- User bisa bikin task urgent dari Daily, lihat sisa waktunya turun real-time, taruh di kuadran Eisenhower, lalu fokusin lewat Pomodoro — tanpa pindah konteks data.
- User bisa bikin main goal dengan 2 chapter + item "Sepanjang goal", nyelesaiin task/habit di dalamnya, dan progress chapter & main goal berubah sesuai rumus.
- Task yang dibuat di HP (offline) muncul di web desktop setelah online, dan database server cuma berisi data terenkripsi (nggak ada judul/isi yang terbaca).
- User yang kehilangan akses ke email bisa membuka data lewat device lain yang masih login, passkey, atau recovery key — tanpa kehilangan data.

## Cakupan
**Masuk:**
- Platform: **web desktop**, **PWA** (bisa di-install, jalan offline), **native Android (APK) & iOS**. Web pakai Nuxt, native pakai React Native, logika inti di-share.
- Fitur: [F1 Schedule](#f1-schedule), [F2 To-do](#f2-to-do), [F3 Eisenhower](#f3-eisenhower), [F4 Pomodoro](#f4-pomodoro), [F5 Countdown](#f5-countdown), [F6 Calendar](#f6-calendar), [F7 Habit](#f7-habit), [F8 Journal](#f8-journal), [F9 Guide](#f9-guide), [F10 Import/Export](#f10-importexport), [F11 Overview](#f11-overview), [F12 Daily](#f12-daily), [F13 Goals](#f13-goals), [F14 Sticker](#f14-sticker), [F15 Account](#f15-account-sync--security), [F16 Tampilan](#f16-tampilan-tema-warna--gaya).
- Akun + sync antar perangkat + enkripsi end-to-end (E2EE) dengan pemulihan berlapis.

**TIDAK dikerjakan sekarang:**
- Kolaborasi/sharing.
- Mode "titip kunci ke server" (server bisa bantu pulihin akun) dan brankas HSM — biar klaim "kami nggak bisa baca data lo" tetap konsisten.
- Notifikasi push dari server (cuma notifikasi in-app + suara saat Pomodoro selesai).
- Integrasi Google Calendar (import format .ics ditunda).
- Upload sticker sendiri (cuma sticker bawaan).

## Fitur

## F1. Schedule

Jadwal sekali & recurring dengan recurrence engine ala Google Calendar, mode waktu fleksibel, edit 3 opsi (kejadian ini / kejadian ini & berikutnya / semua), dan tautan ke task.

### Field
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

### Recurrence
- **Sekali** (tidak berulang)
- **Harian:** tiap N hari, N = 1–6
- **Mingguan:** tiap 1 atau 2 minggu, pilih satu/lebih hari (Senin–Minggu)
- **Bulanan:**
  - Opsi A: tiap bulan di tanggal X (mis. tgl 15)
  - Opsi B: "minggu ke-N hari Y" (mis. Selasa ke-2)
  - Tanggal 29–31 di bulan pendek → dilewati (sama kayak Google Calendar)
- **Berakhir:** tidak pernah / sampai tanggal / setelah N kali

### Edit/Hapus Jadwal Rutin
Saat edit/hapus occurrence:
- **Hanya kejadian ini** — cuma ubah/hapus 1 occurrence
- **Kejadian ini & berikutnya** — ubah mulai dari occurrence ini ke depan
- **Semua** — ubah semua occurrence

### Integrasi
- Satu jadwal bisa ditautkan ke **banyak task** (F2). Di detail jadwal tampil checklist task-nya.
- Tiap kejadian bisa ditandai **selesai/hadir** (dipakai progress Goals, F13).
- Tautan task: dari detail jadwal bisa bikin task baru (otomatis tertaut).

### Konten dari detail jadwal
- Daftar task yang tertaut (dengan checkbox untuk tandai selesai/hadir).
- Tombol "+ Tambah task" → form task cepat.

### UI
- Form jadwal: dua mode waktu input, validasi selesai > mulai.
- Input teks di-escape (no HTML injection).
- Recurring diatur step-by-step (pilih tipe → pilih hari/tanggal → pilih berakhir).
- Edit/hapus: 3 opsi muncul sebagai dialog.

### Performa & Ekspansi
- Recurring di-expand **hanya untuk rentang yang sedang dilihat** (di Kalender, Daily, etc).
- Jangan expand semua kejadian sampai selamanya.
- Kalender (F6) akan expand ke view yang aktif (hari/pekan/bulan).

## F2. To-do list

Task dengan deadline, prioritas, sisa waktu dinamis, filter/sort, tautan jadwal, dan link ke goal.

### Field
- **Judul** (wajib)
- **Catatan** (opsional)
- **Deadline** (opsional) — tanggal + jam
- **Prioritas:** low / medium / urgent
- **Status selesai** (boolean)
- **Tautan jadwal** (opsional) — bisa ke kejadian tertentu dari jadwal rutin
- **Untuk goal** (opsional) — link ke main goal (Sepanjang goal) atau chapter (F13)

### Sisa Waktu Dinamis
Satuan terbesar relevan + satu di bawahnya:
- "2 bulan 3 hari"
- "5 hari 4 jam"
- "3 jam 12 menit"
- "8 menit"
- Lewat deadline → "Terlambat 2 jam" (merah)

Satu timer global (bukan interval per item) untuk efisiensi.

### Filter & Sort
- **Filter:** semua / hari ini / mendatang / terlambat / selesai
- **Sort:** deadline, prioritas

### Tautan Jadwal
- Task bisa tertaut ke satu jadwal (atau nggak tertaut)
- Di detail jadwal (F1) tampil checklist task yang tertaut dengan checkbox

### Bikin Task dari Jadwal
- Di detail jadwal ada tombol "+ Tambah task"
- Form cepat: judul + deadline + prioritas
- Task otomatis tertaut ke jadwal itu

### UI
- List view: tampil judul, deadline, prioritas, sisa waktu
- Checkbox buat tandai selesai
- Sort/filter dropdown atau tab
- Input teks di-escape (no HTML injection)

### Perhitungan Sisa Waktu
- Update real-time di satu timer global
- Bukan per-item setInterval (performa)

## F3. Eisenhower Matrix

Prioritas 4 kuadran dengan drag & drop, posisi tersimpan, bersihkan selesai.

### 4 Kuadran
1. **Penting & Mendesak (Kerjakan)**
2. **Penting & Tidak Mendesak (Jadwalkan)**
3. **Tidak Penting & Mendesak (Delegasikan)**
4. **Tidak Penting & Tidak Mendesak (Hapus)**

### Tambah Item
- **Wajib pilih dari to-do list** yang belum ada di matrix
- Bukan teks bebas
- Dropdown task yang tersedia

### Drag & Drop
- Mouse + touch support
- Antar kuadran
- Posisi tersimpan per task (posisi di kuadran, bukan pixel absolut)
- Persisten setelah reload

### Status Selesai
- Task selesai tampil **tercoret / strikethrough**
- Opsi "Bersihkan yang selesai" — hapus task selesai dari matrix

### UI
- Grid 2x2 kuadran
- Task card di dalam kuadran
- Drag handle terlihat
- Jelas responsif di berbagai ukuran layar

## F4. Pomodoro

Timer fokus dengan setting fleksibel, target task/teks bebas, riwayat sesi.

### Setting
- **Durasi fokus** (default 25 menit)
- **Istirahat pendek** (default 5 menit)
- **Istirahat panjang** (default 15 menit)
- **Jumlah sesi sebelum istirahat panjang** (default 4)
- Setting tersimpan & dipersisten

### Target Fokus
- **Opsi 1:** pilih task dari to-do
- **Opsi 2:** tulis teks bebas (mis. "Baca artikel")
- Terlihat saat timer berjalan

### Kontrol
- **Start / Pause / Reset / Skip**
- Tombol jelas di timer

### Akurasi Timer
- Hitung dari **timestamp**, bukan `setInterval`
- Tetap akurat walau tab/app di-background hingga 5 menit+
- Sinkron dengan sistem waktu perangkat

### Notifikasi
- Suara + notifikasi in-app saat fase berakhir
- Tipe notif: fokus → istirahat / istirahat → fokus

### Riwayat Sesi
Setiap sesi dicatat:
- Tanggal
- Durasi aktual (start → end)
- Target (task link atau teks)
- Status (selesai / skipped)

Dipakai Overview (F11) untuk grafik & metrik.

### UI
- Halaman Pomodoro: timer besar, setting button, riwayat list
- Responsif di semua ukuran

## F5. Countdown

Momen penting dengan unit dinamis, sort terdekat, arsipkan yang lewat.

### Field
- **Nama momen** (wajib) — "Liburan", "Ulang tahun", etc
- **Tanggal + jam target** (wajib)
- **Warna + sticker/emoji** (opsional) — dekorasi

### Unit Dinamis
Tampilkan unit terbesar relevan + satu di bawahnya:
- ≥ 1 tahun → "1 tahun 3 bulan lagi"
- ≥ 1 bulan → "2 bulan 10 hari lagi"
- ≥ 1 hari → "4 hari 6 jam lagi"
- ≥ 1 jam → "3 jam 20 menit lagi"
- < 1 jam → "12 menit 30 detik lagi"
- **Lewat:** "Sudah lewat 3 hari" (merah) + opsi **arsipkan**

### Sort
- Default: dari yang paling dekat
- Countdown "lewat" bisa diarsipkan atau tetap terlihat

### Integrasi
- **Halaman Countdown:** list dengan unit dinamis + edit/hapus
- **Halaman Overview (F11):** "countdown terdekat (3 teratas)" widget

### UI
- Card per countdown: nama, target, unit dinamis, sticker
- Edit/hapus button
- Archive button kalau sudah lewat
- Responsif di semua ukuran

### Performa
- Unit dinamis dihitung sekali per ganti countdown atau per interval (bukan tiap render)

## F6. Calendar

3 view (hari / pekan / bulan) dengan recurring expansion, detail hari, bikin jadwal di slot kosong.

### View
1. **Hari:** fokus satu hari, timeline jam
2. **Pekan:** 7 hari dalam grid, slot jam minimal
3. **Bulan:** 30-31 hari, view keseluruhan

### Navigasi
- Prev / Next (pekan/bulan)
- Tombol "Hari ini" → kembali ke hari sekarang

### Konten yang Ditampilkan
- **Jadwal (recurring di-expand):** kejadian dari F1, hasil expand hanya rentang yang sedang dilihat
- **Task ber-deadline:** dari F2, tampil di tanggal deadline
- **Countdown:** dari F5, tampil di tanggal target

### Interaksi
- **Klik tanggal** (view bulan/pekan) → panel/detail hari itu: daftar jadwal + to-do + ringkasan jurnal hari itu
- **Klik slot kosong** (view hari/pekan) → bikin jadwal baru di jam itu
- **Klik event** → detail jadwal/task/countdown

### Recurring Expansion
- Di-expand **hanya untuk rentang yang sedang dilihat** — bukan semua kejadian sampai selamanya
- View hari: expand 1 hari
- View pekan: expand 7 hari
- View bulan: expand 30-31 hari dari tanggal pilihan

### Performa
- Render bulan < 100ms untuk 500 kejadian (bisa pakai virtualization kalau perlu)
- Recurring engine (F1) pakai T3 buat expand efisien

### UI
- Responsive di semua ukuran (HP: view hari/pekan utama, desktop: pilihan 3 view)
- Warna jadwal (kategori)
- Marker countdown & late task
- Panel detail hari: stacked list jadwal + task + jurnal

## F7. Habit

Kebiasaan harian dengan frekuensi, check-in, streak, riwayat heatmap, link ke goal.

### Field
- **Nama** (wajib)
- **Ikon** (sticker/emoji) (opsional) — dekorasi
- **Frekuensi:**
  - Tiap hari
  - Hari-hari tertentu dalam seminggu (Senin–Minggu, multi-select)
- **Target per hari** (default 1x, bisa disesuaikan)
- **Untuk goal** (opsional) — link ke main goal (Sepanjang goal) atau chapter (F13)

### Check-in
- Satu check-in per hari (bisa berkali-kali, accumulate ke target)
- UI: tombol "+1" atau input jumlah
- Waktu check-in tercatat

### Streak
- **Streak aktif** = hari berturut-turut yang target terpenuhi
- **Catatan:** hari yang bukan jadwal habit tidak memutus streak
  - Misal: habit "Senin–Jum'at" → weekend nggak break streak
- Unit test: streak benar untuk multi-day frekuensi

### Riwayat Check-in
- Per hari: actual count vs target
- Disimpan buat heatmap di Overview (F11)

### Integrasi
- **Daily (F12):** widget "Habit hari ini" + "quick habit check" (satu klik centang)
- **Overview (F11):** habit heatmap ala GitHub contribution per habit, completion rate
- **Goals (F13):** progress goal dari habit = % hari tercapai

### UI
- Halaman Habit: list habit, card per habit tampil ikon + nama + streak + tombol check
- Check-in form: input jumlah atau toggle
- Riwayat: mini heatmap per habit
- Responsive di semua ukuran

### Performa
- Streak calculation: per habit, cukup runut ke belakang sampai streak break
- Unit test wajib: streak multi-hari, streak dengan weekend exception

## F8. Journal

Jurnal harian terstruktur: **satu jurnal per hari**, berisi niat hari ini, perasaan (dengan cerita detail), afirmasi, refleksi (bersyukur / sedih / bisa lebih baik), dan diary bebas tentang hari itu.

### Satu Jurnal Per Hari
- Satu jurnal per tanggal (bukan banyak entri); tanggal default hari ini, bisa pilih tanggal lain
- Bagian boleh diisi bertahap sepanjang hari (mis. niat pagi, refleksi malam); semua bagian opsional
- Edit kapan aja, otomatis tersimpan sebagai draf lokal
- Status hari: kosong / sebagian / lengkap (dipakai streak & Overview)

### Bagian Jurnal

#### 1. Hari Ini Mau Jadi Orang yang Gimana
- Teks pendek: niat/identitas yang mau dihidupi hari ini (mis. "orang yang sabar & fokus")
- Opsional: bisa ditulis ulang di akhir hari lewat refleksi ("sudah sesuai?")

#### 2. Perasaan Hari Ini
- **Mood** 5 skala emoji (satu mood per hari):
  - 😞 sangat sedih
  - 😕 sedih
  - 😐 netral
  - 🙂 bahagia
  - 😄 sangat bahagia
- **Cerita detail** (teks panjang, markdown): apa yang terjadi & apa yang dirasakan

#### 3. Afirmasi
- Satu atau lebih kalimat afirmasi untuk hari ini
- Bisa ketik sendiri atau pilih dari daftar bawaan; afirmasi favorit bisa disimpan buat dipakai ulang

#### 4. Refleksi Hari Ini
Tiga daftar (masing-masing bisa >1 poin, opsional):
- **Bersyukur karena apa aja**
- **Yang bikin sedih apa aja**
- **Yang bisa lebih baik apa aja**

#### 5. Tentang Hari Ini (Diary Book)
- Diary bebas tentang hari ini: textarea markdown (bold, italic, list, link)
- Sticker (opsional, bisa >1) dari F14
- Mention jadwal `@`: autocomplete jadwal di sekitar tanggal jurnal → chip yang bisa diklik; jadwal terhapus → chip "jadwal dihapus", nggak error
- Mention goal `#goal` (dari F13) → chip navigasi ke goal

### Diary Book (Daftar Jurnal)
- Semua jurnal tampil sebagai buku: urut per tanggal (terbaru dulu), dikelompokkan per bulan
- Satu halaman = satu hari; buka → baca semua bagian
- Pencarian teks lokal (server nggak bisa baca isi)
- Filter: mood, rentang tanggal, ada refleksi tertentu (mis. hari dengan "sedih")

### Integrasi
- **Overview (F11):** tren mood, streak menulis jurnal, korelasi mood vs hari fokus tinggi/rendah
- **Goals (F13):** jawaban review berkala disimpan sebagai bagian "Tentang Hari Ini" jurnal hari itu dengan auto-mention goal
- **Kalender (F6):** panel detail hari menampilkan ringkasan jurnal hari itu

### Rendering & Keamanan
- Markdown di-sanitasi (no script injection); input teks di-escape di form
- Semua isi jurnal terenkripsi E2EE; server tidak pernah melihat plaintext
- Pencarian client-side only (index harian atau search on-the-fly, tergantung performa)

### UI
- Halaman Journal: form jurnal hari ini (5 bagian sebagai kartu/stepper) + Diary Book di tab/panel terpisah
- Form bisa diisi per bagian tanpa harus lengkap
- Search bar & filter di Diary Book
- Responsif di semua ukuran

## F9. Guide

Halaman statis: section tiap fitur, FAQ, backup guide, keamanan data (bahasa awam).

### Isi
1. **Section per fitur:** F1–F16
   - Penjelasan singkat per fitur
   - Screenshot (opsional)
   - Tips & trik
2. **FAQ** — pertanyaan umum & jawaban
3. **Cara Backup** — export/import (F10)
4. **Gimana Data Lo Dijaga** (khusus)
   - E2EE dalam bahasa awam: "Data lo dienkripsi sebelum kirim ke server. Bahkan kami nggak bisa baca."
   - Pembuka berlapis: sidik jari, passkey, recovery key (OTP cuma buat login, bukan buka kunci)
   - Apa yang server tahu vs nggak tahu
   - Recovery key: kenapa penting, di mana simpan
   - Lupa OTP? Gimana cara pulih?

### Daftar Isi Navigasi
- Sidebar atau top menu dengan link ke section
- Bisa diklik → scroll ke section
- Collapse/expand (opsional)

### Tech Detail
- Halaman statis (bisa markdown atau hardcoded HTML)
- Search dalam panduan (opsional, buat kategori besar)
- Responsif di semua ukuran
- Readable typography

### Format
- Bahasa Indonesia santai, bukan formal
- Penjelasan E2EE pakai analogi (brankas, kunci, pembuka)
- Screenshot/diagram kalau perlu (tapi bisa ditunda ke fase polish)

## F10. Import & Export

Export semua data → JSON (terbaca, peringatan). Import: validasi, preview, pilih gabung/ganti semua.

### Export
- **Target:** semua data (jadwal, task, habit, jurnal, goal, countdown, Pomodoro history, sticker placement)
- **Format:** JSON dengan metadata:
  - `version` skema (string, mis. "1.0.0")
  - `exportDate` (timestamp)
  - `dataCount` per tipe entitas
- **File:** `improve-personal-backup-YYYY-MM-DD.json`
- **Peringatan sebelum export:** "File ini berisi data terbaca (tidak terenkripsi). Simpan dengan aman atau kasih ke orang terpercaya saja."
- **Konten:** data dalam plaintext, readable

### Import
1. **Pilih file JSON**
2. **Validasi:**
   - Schema match (version check, semua field ada/valid)
   - Tolak file invalid dengan pesan jelas
   - Data lama tetap aman (jangan touch sampai valid)
3. **Preview:**
   - Jumlah data per tipe (N jadwal, M task, etc)
   - Tanggal export file
4. **Pilih mode:**
   - **Gabung:** tambah data baru, update yang ada (by ID)
   - **Ganti semua:** hapus semua data sekarang, import file
5. **Konfirmasi dulu sebelum ganti:** "Yakin hapus semua data sekarang dan import file?"
6. **Proses:** validasi ulang → execute import → sync (kalau ada akun) → notify user "Import selesai, N data masuk"

### Round-trip Test
- Export → wipe (hapus semua) → import → identik dengan asli (unit test)

### Edge Cases
- File versi lama/asing → ditolak, user minta upgrade
- File corrupt → ditolak dengan pesan "File rusak"
- File terlalu besar → warn user, offer partial import (opsional fase 2)

### UI
- Button "Export" → download file auto
- Button "Import" → file picker → preview → confirm
- Progress bar saat import berjalan
- Toast notify "Import selesai"

## F11. Overview

Dashboard analitik 5 rentang (Keseluruhan/Harian/Pekanan/Bulanan/Tahunan) dengan metrik, streak, grafik, goal progress. Agregasi lokal.

### Rentang Waktu
User bisa pilih:
1. **Keseluruhan** — semua data sepanjang akun ada
2. **Harian** — hari tertentu (default hari ini)
3. **Pekanan** — minggu tertentu (default minggu ini)
4. **Bulanan** — bulan tertentu (default bulan ini)
5. **Tahunan** — tahun tertentu (default tahun ini)

Per rentang ada tombol **prev/next** (hari lalu/besok, pekan lalu/depan, dll).

### Widget/Metrik

#### Ringkasan Angka
- Task selesai (jumlah)
- % task selesai tepat waktu (deadline sebelum target)
- Total menit fokus Pomodoro (dari riwayat sesi)
- Jumlah sesi Pomodoro
- Habit completion rate (% hari target tercapai)

#### Streak
- **Streak aktif** & **streak terpanjang** per habit
- **Streak "hari produktif"** (ada task selesai ATAU sesi fokus)
- **Streak menulis jurnal** (hari dengan jurnal terisi)
- **Rentang Keseluruhan:** rekor sepanjang masa

#### Grafik Fokus
Menit Pomodoro per unit waktu:
- **Harian:** per jam (0:00–23:00)
- **Pekanan/Bulanan:** per hari (Mon–Sun)
- **Tahunan/Keseluruhan:** per bulan (Jan–Dec)

#### Habit Heatmap
Ala GitHub contribution:
- Per habit, grid harian/mingguan
- Warna intensity: 0% → 100% target
- Hover → detail hari itu

#### Tren Mood
- **Garis** mood harian (scatter/line chart)
- **Korelasi sederhana:** rata-rata mood di hari fokus tinggi vs rendah (insight)

#### Distribusi Eisenhower
- Jumlah task per kuadran (bar chart)
- Indicator: banyakan "Kerjakan" vs "Jadwalkan"?

#### Waktu Terjadwal
- Total jam jadwal per kategori/warna
- Breakdown: "Kerja 20h, Gym 5h, Sosial 3h, etc"

#### Task Terlambat & Countdown Terdekat
- **Task terlambat:** 3 teratas, deadline, sisa waktu
- **Countdown terdekat:** 3 teratas, target, waktu tinggal

#### Progress Goal
- **Per goal aktif:** main goal progress bar + chapter berjalan
- Filter rentang: tampil goal yang ada chapter/item di rentang terpilih
- Link ke halaman Goals (F13) detail

### Perhitungan
- **Agregasi lokal** di perangkat (bukan server)
- Kalkulasi sekali per **ganti rentang**, bukan per widget re-scan
- Efficient query (index tanggal)

### UI
- Tab/picker rentang di top
- Grid layout 2-3 kolom widget (responsive)
- Card per widget dengan title, value, mini chart
- Navigasi prev/next di header
- Responsive di semua ukuran

### Performa
- Aggregation sekali per ganti, cache hasil
- Chart library: Recharts atau similar (lite)
- Lazy load chart kalau ada banyak widget

## F12. Daily

Halaman utama (menggantikan "Home"; nama menu di sidebar: **Daily**): satu layar buat jalanin hari ini — task prioritas (Eisenhower Penting & Mendesak + task urgent), to-do hari ini, cuaca, habit hari ini, dan kalender jadwal hari ini.

### Konten

#### Prioritas
- **Tidak dibatasi 3 item** — semua task yang memenuhi kriteria masuk.
- Isi & urutan (task belum selesai, tanpa duplikat):
  1. Task di kuadran **Penting & Mendesak** (F3) — tampil paling atas, urut deadline terdekat (tanpa deadline di akhir grup)
  2. Lanjut task berprioritas **urgent** (F2) yang belum masuk grup 1, urut deadline terdekat (tanpa deadline di akhir grup)
- Tiap item diberi penanda asal: "Penting & Mendesak" atau "Urgent"
- Tampil: judul, sisa waktu dinamis, prioritas, centang selesai (1 klik)
- Task yang dicentang hari ini tetap tampil tercoret sampai ganti hari
- Daftar panjang: 7 item pertama tampil, sisanya dilipat di "Lihat N lagi" (tetap ada, bukan dipotong)
- **Bisa edit task langsung dari widget** (lihat [Edit Task dari Daily](#edit-task-dari-daily))
- Kosong → "Nggak ada yang mendesak hari ini"
- Link "Buka Eisenhower" (F3)

#### To-do Hari Ini
- Task yang deadline-nya hari ini + task terlambat yang belum selesai (ditandai)
- Progress bar selesai / total ("5 dari 10 task")
- Centang selesai langsung dari widget
- **Bisa edit task langsung dari widget** (lihat [Edit Task dari Daily](#edit-task-dari-daily))
- Quick add task (judul + deadline default hari ini + prioritas) → masuk F2
- Link "Lihat semua task" (F2)

#### Edit Task dari Daily
- Berlaku di widget **Prioritas** dan **To-do Hari Ini**
- Klik item (atau ikon edit) → form edit inline/sheet berisi field F2: judul, catatan, deadline, prioritas, tautan jadwal, untuk goal
- Opsi hapus task (dengan konfirmasi)
- Simpan → data task yang sama di F2 ter-update (bukan salinan); semua widget & halaman lain (F2, F3, F6) ikut berubah
- Item pindah/keluar otomatis kalau kriterianya berubah (mis. prioritas urgent diturunkan → keluar dari Prioritas kecuali ada di kuadran Penting & Mendesak; deadline digeser ke besok → keluar dari To-do Hari Ini)
- Validasi sama dengan F2 (judul wajib, input teks di-escape); batal → tidak ada perubahan

#### Cuaca Hari Ini
- Kondisi sekarang (ikon + suhu) + ringkasan hari ini (min/maks, peluang hujan) + prakiraan per beberapa jam
- Lokasi: kota yang dipilih user di pengaturan, atau lokasi perangkat kalau user mengizinkan
- Gagal ambil / offline → tampilkan data terakhir + label "terakhir diperbarui HH:MM"; tidak menghalangi widget lain
- Cache singkat (±30 menit), refresh manual
- Privasi: koordinat dibulatkan ke area kasar dan tidak disimpan di server

#### Habit Hari Ini
- Daftar habit yang terjadwal hari ini (ikon + nama + progress N/target)
- **Quick habit check:** 1 klik centang → update progress & streak
- Link ke F7

#### Jadwal Hari Ini (Kalender)
- Tampilan kalender/timeline **hari ini** (versi ringkas F6)
- Isi: jadwal hari ini (recurring sudah di-expand) **dan** task yang tertaut ke jadwal atau ber-deadline hari ini
- Item dibedakan jelas (jadwal = blok waktu, task = penanda deadline/tertaut); item yang sudah lewat diredupkan, penanda "sekarang" bergerak
- Klik item → detail; klik slot kosong → bikin jadwal (seperti F6)
- Link "Buka Kalender" (F6)

#### Review Berkala (kondisional)
- Kalau ada chapter berakhir/terlewat atau akhir pekan → kartu review dari F13 ("Gimana progress [goal]/[chapter]?") dengan opsi perpanjang/geser/tutup

### UI Layout
- Responsive: stacked di HP, 2-col di tablet, 3-col di desktop (kalender hari ini mendapat kolom lebar)
- Card per widget; urutan di HP: Prioritas → To-do → Jadwal → Habit → Cuaca
- Sapaan + tanggal di header

### Performa
- Load sekali (no polling), update real-time kalau ada perubahan dari tab lain
- Widget independen: cuaca dimuat belakangan dan tidak memblokir render widget lain
- Data lokal dibaca sekali dan dibagi antar widget

### Integrasi
- Task prioritas → F3 (kuadran) + F2 (prioritas urgent), to-do → F2, habit → F7, jadwal/kalender → F1 & F6
- Quick add task → F2 (task baru), edit/hapus task dari widget → F2 (task yang sama), quick check habit → F7
- Review berkala → F13

## F13. Goals

2 tingkat: main goal → chapter. Lapisan konteks "kenapa" untuk task/habit/jadwal. Progress & review berkala.

### Struktur

#### Main Goal
- **Judul** (wajib)
- **Alasan** ("Kenapa penting?") — teks singkat
- **Kategori:** karier / kesehatan / keuangan / diri / relasi
- **Sticker sampul** (opsional) — dekorasi dari F14
- **Tanggal mulai & target** (wajib)
- **Status:** aktif / selesai / ditunda / dibatalkan
- **Jumlah aktif:** bebas (unlimited)

#### Chapter (Opsional)
- **Judul** (wajib kalau ada chapter)
- **Periode mulai–selesai** (wajib di dalam rentang main goal)
- **Urutan:** bisa drag untuk reorder
- Goal bisa tanpa chapter (langsung item)

#### Sepanjang Goal (Virtual Chapter)
- Chapter bayangan yang berisi item ditaut **langsung ke main goal**
- Tanpa periode sendiri (ikut rentang main goal)
- Tampil paling atas, bukan chapter bernomor

### Tautan Item
- Task/habit/jadwal punya field opsional **"Untuk goal"**
- Pilih: main goal (Sepanjang goal) ATAU salah satu chapter
- **Satu item cuma di satu tempat** (nggak dobel hitung)
- Task, habit, jadwal dipilih dari dropdown → link ke goal itu

### Progress

#### Chapter / Sepanjang Goal Progress
Rata-rata dari item di dalamnya:
- **Task:** selesai / total
- **Habit:** % hari target tercapai selama periode chapter (sampai hari ini)
- **Jadwal:** % kejadian ditandai selesai/hadir selama periode chapter (sampai hari ini)

#### Main Goal Progress
- **Tanpa chapter:** progress langsung dari item-itemnya
- **Ada chapter:** rata-rata semua chapter **termasuk Sepanjang goal** (kalau ada isinya), bobot sama

#### Chapter Selesai Manual
- Bisa ditandai selesai manual → progress = 100%
- Termasuk chapter tanpa item

### Status Chapter (Otomatis dari Tanggal)
- **Belum mulai:** hari ini < tanggal mulai
- **Berjalan:** tanggal mulai ≤ hari ini ≤ tanggal selesai
- **Selesai:** hari ini > tanggal selesai AND progress = 100%
- **Terlewat:** hari ini > tanggal selesai AND progress < 100%

### Review Berkala
- Saat chapter berakhir / terlewat, dan **tiap akhir pekan** untuk goal aktif
- Muncul kartu review di Daily (F12): "Gimana progress [goal]/[chapter]?"
- Opsi chapter terlewat: **perpanjang / geser periode / tutup**
- Jawaban review **disimpan sebagai Journal** (bagian "Tentang Hari Ini") dengan auto-mention goal-nya

### Integrasi

#### Journal (F8)
- Mention `#goal` / chapter → jadi chip navigasi ke goal detail

#### Countdown (F5)
- Tombol "Buat countdown" dari tanggal target goal

#### Kalender (F6)
- Tanggal target goal & batas chapter tampil sebagai penanda

#### Overview (F11)
- Widget "Progress goal": tiap goal aktif + chapter berjalan di rentang terpilih

#### Daily (F12)
- Kartu review berkala saat chapter berakhir/terlewat

### Halaman Goals
1. **Daftar goal** — filter status/kategori + progress bar
2. **Detail goal** — stepper/timeline chapter:
   - Selesai → Berjalan → Belum mulai (urutan visual)
   - Per chapter: daftar item + progress

### Edge Cases

#### Hapus Main Goal
- Chapter ikut terhapus
- Item tetap ada (tautan dilepas)
- Konfirmasi dulu ke user

#### Hapus Chapter
- Item bisa:
  - Pindah ke Sepanjang goal (default)
  - Dilepas (user pilih)
- Konfirmasi opsi

#### Geser Periode Main Goal
- Kalau chapter jadi di luar rentang main goal → **ditolak dengan pesan jelas**
- "Chapter X enddate (15 Mar) > main goal enddate (10 Mar)"

### UI
- Halaman Goals: card per goal, expand → chapter list
- Detail goal: stepper visual (selesai ← berjalan → belum mulai)
- Form goal: input judul, alasan, kategori, tanggal, sticker picker
- Form chapter: input judul, tanggal mulai–selesai
- Drag reorder chapter (long press / handle)
- Item list: checkbox selesai + link task/habit/jadwal

## F14. Sticker

Koleksi bawaan per pack, dipakai di jurnal/ikon/hias halaman. Diganti kapan aja. Mode hias per halaman disimpan per ukuran layar.

### Koleksi Bawaan
- Beberapa pack (mis. mood, aktivitas, alam, hewan, perayaan, dsb)
- Ikut terbundel di app → jalan offline
- Lazy load per pack (nggak semua dimuat di awal)
- Tier 1: mood pack wajib di awal (penting buat F8)

### Picker Sticker
- Tab per pack
- "Terakhir dipakai" tab (quick access)
- Pencarian nama (search sticker)
- Grid view sticker
- Tap → pilih
- Data: hanya simpan **ID sticker** (bukan gambar)

### Dipakai Di

#### Journal (F8)
- Tempel satu/lebih sticker di jurnal
- Ganti/hapus kapan aja
- Tampil di halaman jurnal

#### Ikon Item (Habit, Countdown, Goal)
- **Habit:** ikon habit
- **Countdown:** ikon countdown
- **Goal sampul:** sticker sampul main goal
- Bisa dipilih atau gunakan emoji
- User bisa ganti kapan aja

#### Hias Halaman (Semua Halaman)
- Tempel sticker bebas di semua halaman
- Mode hias: tombol "Hias" per halaman
- Di luar mode hias: sticker cuma pajangan, nggak bisa di-tap
- **Disimpan per ukuran layar:**
  - HP (<600px)
  - Tablet (600–1024px)
  - Desktop (>1024px)
- Perangkat baru otomatis dapat hiasan sesuai ukuran layarnya
- **Posisi nempel ke elemen** (bukan pixel absolut): sticker nempel ke kartu/header/panel, posisi % di dalamnya
- Elemen pindah/melebar → sticker ikut
- **Ukuran layar belum dihias:** tawaran "Salin dari [ukuran lain]?" (posisi auto-rapih, bisa dibetulin) atau kosong
- **Bebas total:** boleh ditempel di mana aja, jumlah unlimited, posisi nggak auto-geser
- **Pengaman:** elemen tempelan hilang → sticker disembunyikan, nggak dihapus
- **Reset hiasan** per halaman + toggle global "Sembunyikan hiasan"

### Data Sticker
- Per sticker: ID, halaman, ukuran layar, ID elemen tempelan, posisi %, ukuran, rotasi, urutan tumpuk
- Ringan buat sync (cuma metadata, bukan gambar)

### ID Sticker Tak Dikenal
- Kalau ID sticker nggak ditemukan (mis. pack dihapus di versi baru)
- Tampil placeholder, nggak error
- User bisa ganti ke sticker lain atau hapus

### Performa
- Aset sticker lazy load per pack
- Offline: semua pack tersedia (bundled)
- Layer hias nggak bikin halaman re-render saat sticker digeser (render diri sendiri)
- Halaman dengan 100 sticker tetap scroll smooth

### UI
- Sticker picker: tab navigation, grid layout, search bar
- Mode hias: tombol "Hias" toggle → sticker draggable, rotateable, resizable
- Di luar mode hias: nggak ada UI hias (clean)
- Responsive di semua ukuran

## F15. Account, Sync & Security

Web + PWA (Nuxt) dan native Android/iOS (React Native), dengan logika inti di-share. Local-first: data utama di perangkat (SQLite native, IndexedDB web/PWA), sync ke server terenkripsi, akun dengan login OTP + Google SSO, E2EE pembuka berlapis.

### Platform
- **Web desktop:** Nuxt (Vue + TypeScript), IndexedDB local storage
- **PWA:** same web, manifest + service worker + offline
- **Native Android (APK):** React Native, SQLite local storage
- **Native iOS:** React Native, SQLite local storage
- UI dua codebase (Nuxt & React Native); logika inti (repository, kripto, sync) + design token di package TypeScript bersama, adapter repository per platform

### Login (Tanpa Password)

#### Email OTP
- Daftar pakai email
- Setiap login: kirim kode 6 digit ke inbox
- OTP kedaluwarsa ≤ 10 menit
- Dikirim via Resend/SendGrid (production) atau SMTP (`NUXT_SMTP_URL`, nodemailer; non-production)
- Rate limit per email (prevent brute force)

#### OTP per Environment
| Environment | OTP | Email dikirim? |
|---|---|---|
| `production` | Random 6 digit, sekali pakai, ≤ 10 menit | Ya (Resend/SendGrid) |
| Selain production (`development`, `staging`, `test`, `preview`) dengan `NUXT_SMTP_URL` terisi | Random 6 digit, sekali pakai, ≤ 10 menit | Ya (SMTP/nodemailer) |
| Selain production (`development`, `staging`, `test`, `preview`) tanpa `NUXT_SMTP_URL` | Fix **`777777`** | Nggak |

- Tujuan: dev/QA/e2e test bisa login tanpa inbox beneran.
- **Kalau `NUXT_SMTP_URL` terisi, server benar-benar mengirim email OTP lewat SMTP (nodemailer), dan mode OTP fix `777777` mati otomatis di env itu** — kode yang dikirim jadi random 6 digit seperti production.
- Konteks lokal developer: Mailpit jalan sebagai container `local-mailpit` (axllent/mailpit) — SMTP `127.0.0.1:1025`, UI inbox `http://127.0.0.1:8025`. `apps/web/.env.example` memuat `NUXT_SMTP_URL=smtp://127.0.0.1:1025`.
- `NUXT_MAIL_FROM` wajib diisi kalau ada transport email (SMTP di non-production, Resend di production).
- Flow & UI tetap sama di semua environment (email → OTP); yang beda cuma generate + kirim kode.
- Rate limit & expiry tetap jalan di non-production (biar perilakunya identik).
- **Fail-closed:** OTP fix cuma aktif kalau env server **eksplisit** non-production (mis. `APP_ENV`) **dan** `NUXT_SMTP_URL` kosong. Env kosong/nggak dikenal = dianggap production. Nggak ada flag client/header/query yang bisa nyalain.
- Build/deploy production wajib gagal (atau server nolak start) kalau mode OTP fix kebaca aktif, dan production **nolak start** kalau `NUXT_SMTP_URL` ikut terisi (tanda berkas env non-production kebaca di deployment production).
- Kode `777777` nggak pernah diterima di production, walau dikirim manual.

#### Google SSO
- Daftar/login lewat Google, aktif di **semua environment** (production & non-production)
- OAuth2 standard flow (Authorization Code + PKCE, validasi `state` & ID token)
- Email auto-filled dari Google account
- Client ID/secret & redirect URI terpisah per environment, cuma dari env

#### Sidik Jari / Face ID
- Native & PWA support (WebAuthn API)
- Setelah login pertama, user bisa setup biometric
- Login cepat tanpa OTP (local check)
- Keychain (iOS) / Keystore (Android) / WebCrypto (web)

#### Login di Web Browser
- Email OTP (standard flow)
- **atau** scan QR dari HP yang sudah login (ala WhatsApp)

#### Halaman Perangkat
- Daftar perangkat yang login sekarang
- Nama perangkat, waktu login terakhir, lokasi (dari IP)
- Logout dari jauh per perangkat

#### Hapus Akun Permanen
- Minta konfirmasi (email OTP ulang)
- Hapus semua data user di server
- Hapus akun permanen

### E2EE (End-to-End Encryption)

#### Kunci Utama
- Random 32-byte key (per akun)
- Semua data user dienkripsi pakai kunci ini (client-side)
- **Kunci ini nggak pernah dikirim ke server polos**

#### Kunci Utama Disimpan dalam Salinan Berlapis
Tiap salinan digembok dengan pembuka berbeda:

##### Salinan 1: Digembok OTP (dari email login) — DIHAPUS
- OTP/Google cuma buat **login (autentikasi)**, bukan buat **buka kunci**.
- Perangkat baru buka kunci lewat: QR dari perangkat lama, passkey PRF, atau recovery key.
- Alasan dihapus: OTP dibuat server, jadi server tahu pembukanya. Ruang OTP cuma 10⁶ → brute-force offline praktis instan walau pakai Argon2id. Lihat ADR 10 di `ARCHITECTURE.md` §14.

##### Salinan 2: Digembok Sidik Jari / Face ID
- Kunci local di Keychain (iOS) / Keystore (Android) / WebCrypto (web)
- Non-extractable (nggak bisa ambil raw key)
- Disimpan di perangkat saja
- Cepet login berikutnya (biometric local check)

##### Salinan 3: Digembok Passkey
- iCloud Keychain (iOS) / Google Password Manager (Android/web)
- Backup kalau email nggak bisa akses
- Disimpan di cloud provider

##### Salinan 4: Digembok Recovery Key (24 kata)
- Emergency final
- User simpan di ≥2 tempat
- Envelope kuncinya IKUT tersimpan di berkas backup user — server TIDAK menyimpannya (ADR 11)
- 24 kata saja tidak cukup: kunci utama dibuat acak, jadi tanpa envelope-nya recovery tidak bisa memulihkan apa pun

#### Lupa OTP / Email Nggak Bisa Akses
- Buka pakai passkey atau recovery key
- Dapat kunci utama
- Tidak ada lagi "gembok OTP yang dibuat ulang" — Salinan 1 sudah dihapus, jadi login OTP/Google murni buat sesi API dan nggak menyentuh data terenkripsi

#### Semua Pembuka Hilang
- Data nggak bisa dipulihkan
- User dijelaskan jujur di onboarding & Panduan (F9)

### Recovery Key (24 Kata)

#### Saat Daftar
- Recovery key ditunjukin (24 kata)
- **Wajib backup di ≥2 tempat:**
  - Salin manual (clipboard)
  - Download file encrypted (user simpan di cloud/lokal)
  - Email ke diri sendiri (encrypted, di inbox user)
  - Print QR code (simpan fisik)
  - Password manager (1Password, LastPass, dll)
- User **wajib pilih minimal 2 opsi** sebelum selesai setup
- Nggak boleh skip

#### Server TIDAK Menyimpan Recovery Key
- Keputusan: server nggak menyimpan recovery key dalam bentuk apa pun (ADR 11)
- Alasan: "dienkripsi dengan kunci terpisah" nggak menolong — kunci terpisahnya juga dipegang server, jadi server tetap bisa membuka
- Kalau user lupa di mana menyimpannya, nggak ada bantuan dari server. Karena itu backup ≥2 tempat wajib dan nggak boleh di-skip
- **Format yang membawa envelope kunci (ADR 12):** **QR cetak** dan **berkas terenkripsi**. Format yang cuma memuat 24 kata (salin manual, password manager) nggak bisa berdiri sendiri
- **Onboarding wajib MENOLAK** kalau user hanya memilih format yang nggak membawa envelope - minta pilih ulang. Jangan biarkan user merasa "sudah backup" padahal backup-nya nggak bisa dipakai pulih

### Tambah Perangkat (ala WhatsApp)

#### Di Web
- Login pakai email OTP

#### Di HP / Device Baru
- Login pakai email OTP
- **atau** scan QR dari HP yang sudah login
  - HP kirim salinan kunci utama via QR (encrypted)
  - Device baru terima & decrypt
  - Device baru jadi trusted (setup sidik jari/Face ID)
  - Alternatif: passkey atau recovery key

### Sync

#### Data Flow
- Tiap perubahan disimpan lokal dulu (instant UI feedback)
- Lalu dikirim ke server sebagai record terenkripsi (queue lokal)
- Server simpan → reply konfirmasi
- Device lain tarik perubahan (delta, berhalaman)

#### Konflik
- Per record: **update terakhir menang** (timestamp + ID perangkat)
- Record yg conflict: server assign-nya ke device dengan timestamp terbaru
- Harmonisasi di perangkat lain saat pull berikutnya

#### Hapus
- Hapus = tanda hapus (tombstone)
- Tombstone ikut tersinkron ke device lain
- Hard delete (purge) bisa nanti kalau space butuh

#### Pull Perubahan
- Cuma ambil yang **baru** sejak cursor terakhir (delta sync)
- Berhalaman (page size ~100–1000 record)
- Bukan semua data (performa)

#### Status Sync Terlihat
- Indicator UI: tersinkron / menunggu / offline / gagal (+ coba lagi)
- User tahu kapan data up-to-date

### Database Server
- Cuma simpan ciphertext (terenkripsi)
- Metadata minimal: ID record, `updatedAt`, ID perangkat, tombstone flag
- **Nggak ada plaintext data di server** (judul, isi, jurnal, dsb)

### Keamanan

#### Kunci & Secret
- Kunci utama nggak pernah logged
- OTP nggak pernah di-log
- Recovery key hanya ada di berkas backup user — server nggak menyimpannya sama sekali
- Secret (API key, dsb) cuma dari env
- OTP fix `777777` cuma di non-production **dan** cuma kalau `NUXT_SMTP_URL` kosong, ditentukan env server (fail-closed) — lihat [OTP per Environment](#otp-per-environment)

#### HTTPS & Rate Limit
- Semua lalu lintas HTTPS
- Login: rate limit per email
- Recovery key attempt: rate limit DI PERANGKAT (max 3–5x, lock sebentar) — server nggak mengirim envelope recovery, jadi nggak ada yang bisa di-rate-limit di server

#### Biometric Local
- Di native: Keychain/Keystore menangani security
- Di web: WebAuthn API (browser handle)

### UI/UX

#### Daftar Flow
1. Email
2. OTP kirim 30 detik
3. Ketik OTP
4. Setup recovery key (≥2 format wajib)
5. Onboarding tanya "Aktifin sidik jari/Face ID?" (opsional)
6. Selesai

#### Login Flow
- Email → OTP
- atau Google SSO
- atau sidik jari/Face ID (kalau sudah aktif)

#### Lupa OTP
- Email → "Pakai passkey atau recovery key?"
- Ke flow masing-masing

#### Pesan Error
- Nggak membocorkan apakah email terdaftar ("Email nggak ditemukan vs Email terdaftar")
- Semua pesan generik buat security

### Performa
- Enkripsi/dekripsi di client (bukan server)
- Sync non-blocking (background, nggak freeze UI)
- Local query instant (SQLite/IndexedDB)
- Tarik delta sekali per app launch + interval (mis. 5 menit)

## F16. Tampilan: Tema Warna & Gaya

Dua pilihan tampilan yang independen: **tema warna** (palet) dan **gaya** (karakter visual). Kombinasinya bebas (mis. gaya Elegan + tema Ungu).

### Tema Warna
- Palet yang sudah ada di desain: **Kuning (default)**, **Hijau**, **Ungu**
- Mengganti seluruh ramp kertas/primary/accent; mode terang/gelap mengikuti keputusan di Open Question

### Gaya
Tujuh gaya, **default: Cute**:

| Gaya | Karakter |
|---|---|
| **Cute** (default) | Kertas hangat ala stationery/bullet journal: outline tinta tebal, washi tape, maskot, sticker, font bulat |
| **Cute Pure** | Tetap imut tapi lebih bersih: pastel polos, tanpa pola grid & dekorasi berat, outline lebih tipis |
| **Kertas** | Buku catatan: tekstur kertas, garis & margin ala buku tulis, bayangan lembut, judul berfont tulisan tangan |
| **Simple** | Minimalis flat: tanpa dekorasi, border tipis, ruang kosong secukupnya |
| **Elegan** | Tipografi serif, spasi lega, garis halus, aksen kalem |
| **Vintage** | Warna redup/sepia, nuansa cetakan lama, font klasik, border ganda |
| **Tegas** | Kontras tinggi, sudut siku, border tebal, tipografi bold |

Gaya mengatur: font, radius, ketebalan border, bayangan, pola latar, dan dekorasi (maskot/washi tape). Struktur layout & fungsi fitur **sama di semua gaya**.

### Pengaturan
- Menu "Tampilan" di Akun/Pengaturan: pilih tema warna + pilih gaya, dengan **preview langsung** sebelum disimpan (kartu contoh: task, habit, jurnal)
- Berlaku langsung tanpa reload; pilihan **tersimpan per akun dan ikut sync** ke semua perangkat (terenkripsi seperti data lain)
- Pertama kali buka (belum ada pilihan): Cute + Kuning
- Pilihan tampil juga di layar login/onboarding sesuai default

### Integrasi
- **Sticker (F14):** tetap bisa dipakai di semua gaya; maskot & washi tape bawaan hanya tampil di Cute dan Cute Pure
- **Jurnal (F8):** gaya Kertas memakai tampilan garis/margin buku tulis
- **Panduan (F9):** jelaskan cara ganti tema & gaya

### Performa
- Dibangun dari design token (CSS variable) per gaya, bukan komponen terpisah per gaya → ganti gaya tanpa re-render berat dan tanpa layout shift
- Font tiap gaya di-lazy-load; hanya font gaya aktif yang diunduh dan tersedia offline setelah dipakai
- Gaya dipasang sebelum render pertama (tanpa kedip tema/gaya salah saat load)

### Keamanan & Kualitas
- Nilai gaya/tema divalidasi terhadap daftar putih; nilai tak dikenal (mis. dari sync/import versi lain) → kembali ke default tanpa error
- Kontras teks memenuhi WCAG AA di setiap kombinasi gaya × tema

---

## Requirements (Task Table)

Data utama ada di perangkat dan diakses lewat interface repository; server cuma relay + simpan data terenkripsi. `be` pegang lapisan data/logika murni, kripto, sync, dan server; `fe` pegang UI + shell platform.

| Modul | ID | Kebutuhan | Acceptance criteria | Pemilik | BlockedBy | Size |
|---|---|---|---|---|---|---|
| M1 Fondasi | T1 | Setup project, routing, layout + nav semua halaman | Semua 15 halaman (termasuk Akun & Keamanan) bisa dibuka lewat nav; lint/typecheck/build lulus; responsif ≥360px sampai desktop | `fe` | - | M |
| M1 Fondasi | T2 | Lapisan data (interface repository) + skema ber-versi + adapter IndexedDB (web/PWA) | Semua fitur akses data lewat satu interface repo; skema punya `version`; tiap record punya ID, `updatedAt`, ID perangkat, tanda hapus; query list bisa difilter per rentang tanggal (pakai index, bukan scan penuh di jalur panas) | `be` | - | M |
| M1 Fondasi | T19 | Server: akun (daftar/login email OTP + Google SSO), sesi per perangkat, logout jarak jauh, hapus akun | Production: OTP random 6 digit dikirim via service (Resend/SendGrid) dengan rate limit, sekali pakai; OTP kedaluwarsa ≤ 10 menit; non-production (env server eksplisit dev/staging/test/preview): OTP fix `777777`, email nggak dikirim, rate limit & expiry tetap jalan, TAPI kalau `NUXT_SMTP_URL` terisi maka email benar-benar dikirim via SMTP (nodemailer) dan mode fix mati otomatis (kode random 6 digit); `NUXT_MAIL_FROM` wajib kalau ada transport email; production nolak start kalau `NUXT_SMTP_URL` ikut terisi; env kosong/nggak dikenal diperlakukan production (fail-closed); `777777` ditolak di production (ada test-nya); nggak ada flag client/header/query buat nyalain OTP fix; Google SSO aktif di semua env, OAuth2 Authorization Code + PKCE dengan validasi `state` & ID token, client ID/redirect URI per env; login dibatasi rate limit per email; token sesi bisa dicabut per perangkat; tiap endpoint cek kepemilikan data di server; hapus akun menghapus semua record user; recovery key TIDAK disimpan server (ADR 11) jadi nggak ada backup kunci yang perlu dihapus; secret cuma dari env; semua lalu lintas HTTPS | `be` | - | L |
| M2 Jadwal & Task | T3 | Engine recurrence (harian N=1–6, mingguan 1/2 minggu multi-hari, bulanan tgl/minggu-ke-N, end rule, exception) | Unit test: tiap pola menghasilkan tanggal benar untuk rentang 1 tahun; tgl 31 di bulan pendek dilewati; ekspansi cuma di rentang yang diminta; edit "ini saja/berikutnya/semua" benar | `be` | T2 | L |
| M2 Jadwal & Task | T4 | UI jadwal: form (mulai–selesai / durasi), recurrence, edit/hapus 3 opsi, tautan task, tandai kejadian hadir | Dua mode waktu menghasilkan data identik; validasi selesai > mulai; input teks di-escape (no HTML injection) | `fe` | T1, T3 | L |
| M2 Jadwal & Task | T5 | To-do list: CRUD, deadline, prioritas, sisa waktu dinamis, filter/sort, tautan jadwal | Format sisa waktu sesuai F2 (unit test batas: 59 mnt, 1 jam, 1 hari, 1 bulan, lewat); satu timer global, bukan satu interval per item | `fe` | T1, T2 | M |
| M3 Fokus | T6 | Eisenhower matrix + drag & drop | Tambah cuma dari to-do; DnD mouse + touch; posisi persist setelah reload | `fe` | T5 | M |
| M3 Fokus | T7 | Pomodoro + riwayat sesi + widget | Timer tetap akurat (±1 dtk) setelah tab/app background 5 menit (web & native); setting persist; target task/teks bebas | `fe` | T5 | M |
| M3 Fokus | T8 | Countdown dengan unit dinamis | Unit test tiap ambang F5; sort terdekat; lewat → status "sudah lewat" | `fe` | T1, T2 | S |
| M4 Kalender | T9 | Kalender view hari/pekan/bulan + panel detail hari | Recurring dari T3 tampil benar di 3 view; klik hari tampilkan jadwal+todo+jurnal; render bulan < 100ms untuk 500 kejadian | `fe` | T4, T5 | L |
| M5 Refleksi, Habit & Sticker | T10 | Habit: CRUD, check-in, streak | Streak benar untuk habit hari tertentu (hari non-jadwal tidak memutus); unit test streak | `fe` | T2 | M |
| M5 Refleksi, Habit & Sticker | T11 | Journal: 5 bagian harian (niat, perasaan+mood, afirmasi, refleksi syukur/sedih/lebih baik, diary) + mention `@jadwal` + Diary Book + pencarian lokal | Mention jadi chip yang navigasi ke jadwal; jadwal terhapus tidak bikin error; isi jurnal dirender aman; satu jurnal per tanggal (simpan ulang = update, bukan duplikat) (sanitasi markdown); pencarian jalan offline | `fe` | T4 | M |
| M5 Refleksi, Habit & Sticker | T24 | Sticker: koleksi bawaan + picker + sticker di jurnal + ikon habit/countdown + **layer hias halaman** (mode hias, tempel ke elemen, simpan per ukuran layar, salin antar ukuran) dipasang di semua halaman yang sudah ada; komponen picker & layer hias dipakai ulang di Overview, Daily, Goals, Akun | Sticker bisa ditempel/diganti/dihapus di jurnal; ikon habit & countdown bisa diganti; hiasan desktop nggak muncul di HP & sebaliknya; resize jendela lintas batas ukuran ganti set hiasan; elemen melebar → sticker ikut (posisi %); sticker bisa ditaruh di posisi mana pun di semua halaman tanpa batas jumlah; di luar mode hias sticker nggak menangkap tap/klik/drag (tombol & drag di bawah sticker tetap jalan); halaman dengan 100 sticker tetap scroll mulus; ID tak dikenal → placeholder tanpa error; aset di-lazy-load per pack & tersedia offline; layer hias nggak bikin halaman re-render saat sticker digeser | `fe` | T4–T11, T15 | L |
| M6 Data | T12 | Import/export JSON (gabung / ganti semua) | Round-trip export→wipe→import identik; file invalid/versi asing ditolak tanpa mengubah data; batas ukuran file; peringatan "file tidak terenkripsi" sebelum export | `be` | T2 | M |
| M7 Dashboard | T13 | Halaman Overview (isi F11) | 5 rentang (Keseluruhan/Harian/Pekanan/Bulanan/Tahunan) + prev/next jalan; semua metrik & streak F11 benar per rentang (unit test agregasi + streak); agregasi satu kali per ganti rentang, bukan per widget re-scan | `fe` | T7, T10, T11, T24 | L |
| M7 Dashboard | T14 | Halaman Daily (isi F12) + label menu sidebar "Daily" | Widget Prioritas tanpa batas 3: task kuadran Penting & Mendesak dulu, lalu task urgent (tanpa duplikat, masing-masing urut deadline); task di Prioritas & To-do hari ini bisa diedit/dihapus dari widget dan perubahan langsung tercermin di F2/F3/F6; to-do hari ini (termasuk terlambat) + progress benar; quick add masuk to-do; quick habit check update streak; kalender hari ini menampilkan jadwal (recurring ter-expand) + task tertaut/ber-deadline hari ini; cuaca gagal/offline tidak memblokir widget lain & menampilkan data terakhir; koordinat cuaca tidak disimpan di server | `fe` | T7, T10, T11, T24 | M |
| M7 Dashboard | T15 | Halaman Panduan (termasuk "Gimana data lo dijaga") | Ada section tiap fitur F1–F16 + FAQ + backup + penjelasan E2EE & pemulihan; daftar isi bisa diklik | `fe` | T1 | S |
| M8 Goals | T17 | Model goal + chapter + tautan item, kalkulasi progress & status chapter | Unit test: progress task/habit/jadwal, Sepanjang goal ikut rata-rata, goal tanpa chapter, chapter selesai manual, status terlewat; periode chapter di luar main goal ditolak; satu item cuma satu tautan; hapus goal/chapter sesuai edge case F13 | `be` | T2 | M |
| M8 Goals | T18 | Halaman Goals + field "Untuk goal" di form task/habit/jadwal + sticker sampul + review berkala + integrasi (jurnal `#goal`, countdown, kalender, Overview, Daily) | Stepper chapter + progress tampil benar; dropdown "Untuk goal" berisi Sepanjang goal + chapter; kartu review muncul saat chapter berakhir/terlewat & akhir pekan, jawabannya jadi bagian jurnal; teks goal dirender aman (escape) | `fe` | T4, T5, T10, T11, T17, T24 | L |
| M9 Akun & Sync | T20 | Kripto E2EE: kunci utama, gembok per pembuka (kunci perangkat, passkey PRF, recovery key 24 kata), lupa akses pakai recovery key/passkey, transfer kunci via QR | Unit test: data TIDAK bisa dibuka lewat OTP (Salinan 1 dihapus); bisa dibuka lewat sidik jari/passkey setelah login pertama; recovery key salah ditolak dengan rate limit di perangkat; kunci perangkat non-extractable / di Keychain-Keystore; kunci utama & OTP nggak pernah dikirim/di-log polos; recovery key 24 kata bisa dibuka dari 5 format (plaintext, file encrypted, email encrypted, QR code, password manager), dan format yang membawa envelope kunci bisa memulihkan data; server TIDAK menyimpan recovery key; pakai library kripto teruji (bukan bikin algoritma sendiri) | `be` | T2 | L |
| M9 Akun & Sync | T21 | Sync engine: antrean lokal, push/pull delta berhalaman, konflik update-terakhir-menang, tombstone, status sync | Uji 2 perangkat: edit offline di keduanya → setelah online hasil sama di dua sisi; hapus ikut tersinkron; pull cuma ambil perubahan sejak cursor terakhir (berhalaman); isi DB server terbukti cuma ciphertext (cek manual tabel) | `be` | T19, T20 | L |
| M9 Akun & Sync | T22 | UI akun: daftar/login email OTP + Google SSO, onboarding recovery key (5 format, wajib ≥2), sidik jari/Face ID setup, tambah perangkat via QR, daftar perangkat + logout jarak jauh, lupa OTP flow, hapus akun, kunci app biometrik (native), indikator status sync | Daftar: email → OTP kirim 30 detik → ketik OTP → setup recovery key (wajib pilih ≥2 dari 5 format sebelum lanjut, dan minimal salah satunya QR cetak atau berkas terenkripsi karena itu yang membawa envelope kunci — server nggak menyimpannya; onboarding menolak kalau syarat ini nggak terpenuhi); onboarding tanya "Aktifin sidik jari/Face ID?"; login: email → OTP atau Google SSO atau sidik jari/Face ID (kalau udah aktif); lupa OTP: email → "Pakai passkey atau recovery key?" → pilihan ke masing-masing flow; QR tambah perangkat kedaluwarsa ≤ 2 menit & sekali pakai; daftar perangkat tampil nama, waktu login terakhir, lokasi (dari IP); hapus akun minta konfirmasi email + OTP ulang; pesan error nggak membocorkan apakah email terdaftar | `fe` | T19, T20, T23, T24 | L |
| M10 Platform | T23 | App native React Native (Android APK + iOS) pakai package logika bersama + PWA Nuxt (manifest, service worker, offline) + adapter SQLite di native | Build APK & iOS jalan di perangkat nyata; app RN pakai package inti yang sama dengan web (nggak ada duplikasi logika data/kripto/sync); PWA bisa di-install & dibuka offline; adapter SQLite lolos test repository yang sama dengan IndexedDB; service worker nggak cache respons API berisi data user | `fe` | T1, T2 | L |
| M10 Platform | T25 | Tampilan: tema warna (Kuning/Hijau/Ungu) + 7 gaya (Cute default, Cute Pure, Kertas, Simple, Elegan, Vintage, Tegas) sebagai design token, menu Tampilan + preview, simpan per akun & sync | Ganti gaya/tema langsung tanpa reload & tanpa layout shift; pilihan bertahan setelah restart dan tersinkron antar perangkat; default Cute + Kuning; nilai tak dikenal → default tanpa error; gaya terpasang sebelum render pertama (tanpa kedip); font gaya di-lazy-load & offline; kontras AA di semua kombinasi gaya × tema; semua halaman yang ada tampil benar di tiap gaya | `fe` | T2, T24 | L |
| M11 QA | T16 | Uji end-to-end seluruh AC + kriteria sukses di web desktop, PWA, Android, iOS | Semua AC terverifikasi dengan bukti per platform; nol `blocker`/`mayor` kebuka | `qa` | T4–T15, T17–T25 | L |

### PARALEL
- T1 ∥ T2 ∥ T19.
- T3 ∥ T5 ∥ T8 ∥ T10 ∥ T12 ∥ T15 ∥ T17 ∥ T20 ∥ T23 (setelah fondasi).
- T6 ∥ T7 (setelah T5).
- T9 ∥ T11 (setelah T4).
- T24 setelah T4–T11 & T15 (layer hias dipasang ke halaman yang sudah jadi).
- T25 setelah T2 & T24 (token gaya dipakai semua halaman; boleh paralel dengan T13/T14/T18).
- T21 setelah T19 & T20 (boleh jalan barengan grup mana pun di atas).
- T13 ∥ T14 ∥ T18 ∥ T22 (setelah T24; Overview butuh widget goal dari T18 → integrasinya dikerjain di T18, bukan T13; Daily hanya butuh kartu review).

### Definition of Done
- Semua task T1–T15, T17–T25 `done`, QA (T16) verdict LULUS.
- Lint, typecheck, unit test (recurrence, sisa waktu, countdown, streak, progress goal, import/export, kripto, sync), build web + PWA + APK + iOS lulus.
- Nggak ada `innerHTML` dari input user tanpa sanitasi; import divalidasi skema sebelum nulis apa pun.
- Database server terbukti nggak berisi data user yang terbaca; OTP & kunci utama nggak pernah di-log; recovery key nggak disimpan di server sama sekali.
- Data bertahan setelah app ditutup, jalan offline, dan tersinkron antar perangkat.
- Panduan sesuai fitur yang benar-benar jadi.

## Assumptions & Open Questions

### Assumptions

#### Login & Keamanan
- **Login = Email OTP + Google SSO (tanpa password)** — lebih simpel. Email cuma pembuka untuk **sesi API**, bukan pembuka kunci; yang membuka kunci adalah kunci perangkat, passkey, dan recovery key (ADR 10).
- **OTP non-production = email sungguhan lewat SMTP kalau `NUXT_SMTP_URL` diisi, kalau kosong fallback fix `777777` tanpa kirim email** — dev/QA login pakai email sungguhan (Mailpit) supaya jalur email benar-benar teruji, sementara `777777` tetap ada sebagai kemudahan non-production yang mati sendiri begitu ada transport email. Production tetap OTP random via Resend. Penentuan pakai env server, default (env kosong/nggak dikenal) = production. Google SSO aktif di semua environment.
- **Recovery key wajib backup di ≥2 tempat** (salin/download/email/QR/password manager) — user nggak boleh skip, dan server TIDAK menyimpan salinannya (ADR 11). Backup user harus membawa envelope kuncinya, bukan cuma 24 kata; format yang cuma memuat 24 kata (salin manual, password manager) nggak bisa berdiri sendiri.

#### Penyimpanan & Sync
- **Penyimpanan = local-first + sync + E2EE dengan pembuka berlapis** (perangkat, passkey, recovery key) + tambah perangkat via QR — hasil diskusi; sudah diputuskan.
- **Tanpa mode titip kunci & HSM** di rilis ini — biar klaim "server nggak bisa baca" konsisten dan biaya rendah.
- **Konflik sync: update terakhir menang per record** — cukup buat app personal satu orang; merge per field/CRDT ditunda.

#### Platform & Stack
- **Satu rilis buat semua platform** (web desktop, PWA, Android, iOS) — sesuai permintaan.
- **Stack client:** web + PWA pakai **Nuxt** (Vue + TypeScript); native Android & iOS pakai **React Native** (TypeScript). UI dua codebase, tapi logika murni (lapisan data/repository, kripto, sync, recurrence, dsb) + design token di-share sebagai package TypeScript tanpa ketergantungan framework UI. Stack server sudah diputuskan: API (auth + relay ciphertext) pakai **Nitro/H3** di dalam `apps/web` (`server/routes/v1/**`) + **PostgreSQL** + **Drizzle**; syaratnya tetap cuma simpan ciphertext + metadata minimal, dan nggak ada app server terpisah.

#### Fitur Khusus
- **Sticker** = koleksi bawaan buat dekorasi jurnal, ikon habit/countdown/goal, dan hias semua halaman; bisa diganti kapan aja; upload sticker sendiri ditunda (butuh validasi file + storage terenkripsi).
- **Hiasan disimpan per ukuran layar (HP/tablet/desktop) + nempel ke elemen**, bukan per device — biar ikut sync dan nggak berantakan di layar beda ukuran.
- **Hias bebas total** (posisi & jumlah nggak dibatasi) — kegunaan app dijaga lewat sticker tembus tap di luar mode hias + toggle "Sembunyikan hiasan", bukan lewat larangan.
- **Fitur Habit ditambah (F7)** — Daily minta "habit hari ini" & "quick habit check", jadi habit butuh tempat dibuat/dikelola.
- **Halaman utama = Daily** (bukan Home; dulu "Daily Routine", disingkat jadi "Daily" termasuk di sidebar): isinya cuma task prioritas, to-do hari ini, cuaca, habit hari ini, kalender hari ini. Widget lama (jurnal cepat, Pomodoro, goal aktif, streak, jadwal berikutnya) dicabut dari halaman utama — tetap ada di halaman masing-masing (F4, F8, F13) dan Overview (F11).
- **Prioritas di Daily tidak dibatasi 3** — isinya semua task Penting & Mendesak (F3) lalu semua task urgent (F2); daftar panjang dilipat, bukan dipotong, supaya task penting nggak "hilang".
- **Task bisa diedit langsung dari Daily** (Prioritas & To-do hari ini) — biar nggak perlu pindah ke F2 cuma buat ganti deadline/prioritas.
- **Cuaca** butuh sumber data eksternal; request lewat server proxy tanpa menyimpan lokasi supaya klaim E2EE tetap konsisten. Penyedia API cuaca belum dipilih.

#### Lokalisasi & Zona Waktu
- **Bahasa UI Indonesia**, minggu mulai Senin, zona waktu = zona waktu perangkat.
- **Bulanan tgl 29–31** di bulan yang nggak punya tanggal itu → dilewati (perilaku Google Calendar).
- **Countdown < 1 jam** tampil menit + detik.

#### Data & Export
- Format export **JSON** saja; .ics/CSV ditunda.

#### Tampilan
- **Tema warna dan gaya adalah dua pengaturan terpisah** (palet vs karakter visual); 7 gaya: Cute (default), Cute Pure, Kertas, Simple, Elegan, Vintage, Tegas.
- Fungsi & layout sama di semua gaya; yang beda cuma token visual (font, radius, border, bayangan, pola, dekorasi).

#### Goals & Progress
- **Goals 2 tingkat** (main goal → chapter), item boleh langsung ke main goal lewat "Sepanjang goal", bobot rata (bobot custom ditunda).
- **Menit fokus Pomodoro belum dihitung ke progress goal** — rilis pertama cuma task/habit/jadwal; nyusul kalau dibutuhkan.
- **Review berkala** muncul di Daily (bukan push), jawabannya disimpan di jurnal.

---

### Open Questions

#### Blocking
Tidak ada — semua keputusan login, penyimpanan, platform sudah final.

#### Default
1. **Notifikasi pengingat jadwal/deadline di luar app?** Di native/PWA bisa pakai notifikasi lokal tanpa server (tetap privat). Sementara: nggak, cuma in-app.
2. **Mood 5 skala emoji cukup, atau mau label sendiri?** Sementara: 5 emoji.
3. **Perlu dark mode di rilis pertama?** Sementara: ikut tema sistem (light/dark auto).
4. **Maksud "Cute Pure"?** Sementara: versi Cute yang lebih bersih/polos (pastel, tanpa dekorasi berat). Koreksi kalau yang dimaksud lain.
5. **Gaya per perangkat atau per akun?** Sementara: per akun, ikut sync.
