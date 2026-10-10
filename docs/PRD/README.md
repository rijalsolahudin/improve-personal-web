# PRD — Improve Personal (Aplikasi Produktivitas Personal)

## Konteks
Individu butuh satu tempat buat ngatur goal jangka panjang, jadwal (sekali & rutin), to-do, prioritas (Eisenhower), fokus (Pomodoro), momen penting (countdown), habit, dan refleksi harian (memo + mood). Sekarang tersebar di banyak app. Target: pengguna personal, satu akun dipakai di banyak perangkat (laptop, HP). Isinya personal (journal, mood, goal hidup), jadi user harus yakin datanya cuma bisa dibaca dia sendiri.

## Tujuan & kriteria sukses
Satu app di **web desktop, PWA, dan aplikasi native Android (APK) & iOS** yang bikin user bisa rencanain hari, eksekusi dengan fokus, dan refleksi. Semua data saling terhubung (jadwal ↔ task ↔ memo ↔ goal), tersinkron antar perangkat, dan terenkripsi end-to-end.
- User bisa bikin jadwal rutin "tiap 2 minggu, Senin & Kamis, 09:00–10:30" dan jadwal itu muncul benar di kalender view hari/pekan/bulan.
- User bisa bikin task urgent dari Home, lihat sisa waktunya turun real-time, taruh di kuadran Eisenhower, lalu fokusin lewat Pomodoro — tanpa pindah konteks data.
- User bisa bikin main goal dengan 2 chapter + item "Sepanjang goal", nyelesaiin task/habit di dalamnya, dan progress chapter & main goal berubah sesuai rumus.
- Task yang dibuat di HP (offline) muncul di web desktop setelah online, dan database server cuma berisi data terenkripsi (nggak ada judul/isi yang terbaca).
- User yang lupa OTP bisa buka akun lewat device lain yang masih login, passkey, atau recovery key — tanpa kehilangan data.

## Cakupan
**Masuk:**
- Platform: **web desktop**, **PWA** (bisa di-install, jalan offline), **native Android (APK) & iOS**. Web pakai Nuxt, native pakai React Native, logika inti di-share.
- Fitur: [F1 Schedule](#f1-schedule), [F2 To-do](#f2-to-do), [F3 Eisenhower](#f3-eisenhower), [F4 Pomodoro](#f4-pomodoro), [F5 Countdown](#f5-countdown), [F6 Calendar](#f6-calendar), [F7 Habit](#f7-habit), [F8 Memo](#f8-memo), [F9 Guide](#f9-guide), [F10 Import/Export](#f10-importexport), [F11 Overview](#f11-overview), [F12 Home](#f12-home), [F13 Goals](#f13-goals), [F14 Sticker](#f14-sticker), [F15 Account](#f15-account-sync--security).
- Akun + sync antar perangkat + enkripsi end-to-end (E2EE) dengan pemulihan berlapis.

**TIDAK dikerjakan sekarang:**
- Kolaborasi/sharing.
- Mode "titip kunci ke server" (server bisa bantu pulihin akun) dan brankas HSM — biar klaim "kami nggak bisa baca data lo" tetap konsisten.
- Notifikasi push dari server (cuma notifikasi in-app + suara saat Pomodoro selesai).
- Integrasi Google Calendar (import format .ics ditunda).
- Upload sticker sendiri (cuma sticker bawaan).

## Fitur

### [F1. Schedule](features/F01-schedule.md)
Jadwal sekali & recurring (harian, mingguan, bulanan) dengan mode waktu fleksibel (mulai–selesai atau mulai + durasi), edit 3 opsi (ini saja/ini & berikutnya/semua), tautan ke task, dan tandai kejadian selesai/hadir.

### [F2. To-do list](features/F02-todo.md)
Task dengan deadline, prioritas, sisa waktu dinamis, filter/sort, tautan jadwal, dan field "Untuk goal".

### [F3. Eisenhower matrix](features/F03-eisenhower.md)
4 kuadran prioritas dengan drag & drop antar kuadran, posisi tersimpan, dan opsi bersihkan yang selesai.

### [F4. Pomodoro](features/F04-pomodoro.md)
Timer fokus dengan setting fleksibel, target task/teks bebas, riwayat sesi, dan widget di Home. Timer tetap akurat walau tab/app background.

### [F5. Countdown](features/F05-countdown.md)
Momen penting dengan unit dinamis (tahun/bulan/hari/jam/menit), sort terdekat, dan status "sudah lewat".

### [F6. Calendar](features/F06-calendar.md)
View hari/pekan/bulan, tampilkan jadwal (expanded recurring), task ber-deadline, countdown. Klik hari → detail, klik slot kosong → bikin jadwal.

### [F7. Habit](features/F07-habit.md)
Kebiasaan harian dengan frekuensi, check-in, streak, dan riwayat heatmap. Field "Untuk goal".

### [F8. Memo](features/F08-memo.md)
Entri harian dengan markdown, sticker, mood 5 skala emoji, mention jadwal (`@`), dan pencarian lokal.

### [F9. Guide](features/F09-guide.md)
Halaman statis: section tiap fitur, FAQ, backup, dan "Gimana data lo dijaga" (E2EE dalam bahasa awam). Daftar isi navigasi.

### [F10. Import & Export](features/F10-import-export.md)
Export semua data → JSON (terbaca, peringatan sebelum export). Import: validasi, preview, pilih gabung/ganti semua.

### [F11. Overview](features/F11-overview.md)
Dashboard 5 rentang (Keseluruhan/Harian/Pekanan/Bulanan/Tahunan). Widget: ringkasan, streak, grafik fokus, habit heatmap, tren mood, distribusi Eisenhower, waktu terjadwal, late task, countdown, goal progress. Agregasi di perangkat.

### [F12. Home](features/F12-home.md)
Sapaan, habit hari ini + quick check, task selesai hari ini + progress bar, streak, jadwal berikutnya, quick add task, memo cepat + sticker + mood, Pomodoro widget, goal aktif widget.

### [F13. Goals](features/F13-goals.md)
2 tingkat: main goal → chapter. Struktur "Sepanjang goal" buat item ditaut langsung. Progress = rata-rata item. Review berkala saat chapter berakhir/terlewat. Integrasi ke memo, countdown, kalender, Overview, Home.

### [F14. Sticker](features/F14-sticker.md)
Koleksi bawaan per pack. Dipakai: memo, ikon item, hias halaman. Mode hias per halaman. Disimpan per ukuran layar. Bebas total posisi & jumlah, sticker tembus tap di luar mode hias.

### [F15. Account, Sync & Security](features/F15-account-sync.md)
Login email OTP + Google SSO (tanpa password); non-production OTP fix `777777`. Sidik jari/Face ID optional. Recovery key 24 kata wajib ≥2 backup. E2EE pembuka berlapis. Sync offline → online. QR tambah perangkat.

---

## Kebutuhan, Asumsi & Pertanyaan Terbuka

- **[Requirements (Task Table)](requirements.md)** — Tabel T1–T24, modul, AC, owner, dependencies, size, paralel, Definition of Done.
- **[Assumptions & Open Questions](assumptions.md)** — Asumsi login, penyimpanan, features. Pertanyaan default.

---

## Update struktur ini
- Edit fitur: ubah file di `features/Fxx-*.md`.
- Update tabel task: edit `requirements.md`.
- Update asumsi: edit `assumptions.md`.
- Update index ini (README.md): link feature baru atau ubah konteks/tujuan.
