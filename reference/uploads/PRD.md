# PRD — Improve Personal (Aplikasi Produktivitas Personal)

## Konteks
Individu butuh satu tempat buat ngatur goal jangka panjang, jadwal (sekali & rutin), to-do, prioritas (Eisenhower), fokus (Pomodoro), momen penting (countdown), habit, dan refleksi harian (memo + mood). Sekarang tersebar di banyak app. Target: pengguna personal, satu orang per perangkat.

## Tujuan & kriteria sukses
Satu app web yang bikin user bisa rencanain hari, eksekusi dengan fokus, dan refleksi — semua data saling terhubung (jadwal ↔ task ↔ memo).
- User bisa bikin jadwal rutin "tiap 2 minggu, Senin & Kamis, 09:00–10:30" dan jadwal itu muncul benar di kalender view hari/pekan/bulan.
- User bisa bikin task urgent dari Home, lihat sisa waktunya turun real-time, taruh di kuadran Eisenhower, lalu fokusin lewat Pomodoro — tanpa pindah konteks data.
- User bisa bikin main goal dengan 2 chapter + item "Sepanjang goal", nyelesaiin task/habit di dalamnya, dan progress chapter & main goal berubah sesuai rumus F13.
- Export → hapus data → import file yang sama mengembalikan seluruh data 100% identik.

## Cakupan
**Masuk:**
- Jadwal (sekali & recurring), To-do, Eisenhower, Pomodoro, Countdown, Kalender, Habit, Memo + mood, Goals (main goal + chapter), Panduan, Import/Export, Overview, Home.

**TIDAK dikerjakan sekarang:**
- Kolaborasi/sharing.
- Akun/login & sync antar perangkat — belum diputuskan, ikut diskusi penyimpanan.
- Notifikasi push/reminder sistem (cuma notifikasi in-app + suara saat Pomodoro selesai).
- Integrasi Google Calendar (import format .ics ditunda).
- Aplikasi mobile native (cukup web responsif).

## Spesifikasi fitur

### F1. Jadwal
- Field: judul, deskripsi, warna/kategori, tanggal mulai, waktu.
- Mode waktu: **mulai–selesai** (09:00–10:30) **atau** **mulai + durasi menit** (09:00 + 90). Disimpan sebagai start + durasi; dua mode cuma beda input.
- Opsi all-day.
- Recurrence (ala Google Calendar):
  - Sekali (tidak berulang).
  - **Harian:** tiap N hari, N = 1–6.
  - **Mingguan:** tiap 1 atau 2 minggu, pilih satu/lebih hari (Sen–Min).
  - **Bulanan:** tiap bulan di tanggal X (mis. tgl 15) **atau** di "minggu ke-N hari Y" (mis. Selasa ke-2). Tanggal 29–31 di bulan pendek → dilewati (sama kayak Google Calendar).
  - Berakhir: tidak pernah / sampai tanggal / setelah N kali.
- Edit/hapus jadwal rutin: **hanya kejadian ini / kejadian ini & berikutnya / semua**.
- Satu jadwal bisa ditautkan ke banyak task (lihat F2). Di detail jadwal tampil checklist task-nya.
- Tiap kejadian bisa ditandai **selesai/hadir** (dipakai progress Goals, F13).
- Field opsional "Untuk goal" (F13).

### F2. To-do list
- Field: judul, catatan, deadline (tanggal + jam, opsional), prioritas **low / medium / urgent**, status selesai, tautan ke jadwal (opsional, bisa ke kejadian tertentu dari jadwal rutin).
- **Sisa waktu dinamis**, satuan terbesar yang relevan + satu di bawahnya: "2 bulan 3 hari", "5 hari 4 jam", "3 jam 12 menit", "8 menit". Lewat deadline → "Terlambat 2 jam" (merah).
- Filter: semua / hari ini / mendatang / terlambat / selesai; sort: deadline, prioritas.
- Bisa bikin task langsung dari dalam detail jadwal (otomatis tertaut).
- Field opsional "Untuk goal" (F13).

### F3. Eisenhower matrix
- 4 kuadran: Penting & Mendesak (Kerjakan), Penting & Tidak Mendesak (Jadwalkan), Tidak Penting & Mendesak (Delegasikan), Tidak Penting & Tidak Mendesak (Hapus).
- Tambah item **wajib pilih dari to-do list** yang belum ada di matrix (bukan teks bebas).
- **Drag & drop** antar kuadran (mouse + touch). Posisi tersimpan.
- Task selesai tampil tercoret; opsi "bersihkan yang selesai".

### F4. Pomodoro
- Setting: durasi fokus, istirahat pendek, istirahat panjang, jumlah sesi sebelum istirahat panjang (default 25/5/15/4).
- Target fokus: **pilih task** dari to-do **atau tulis teks bebas**.
- Kontrol: start/pause/reset/skip. Suara + notifikasi in-app pas fase berakhir.
- Timer akurat walau tab di-background (hitung dari timestamp, bukan setInterval).
- Riwayat sesi disimpan (tanggal, durasi, target) → dipakai Overview & Home.
- Widget mini di Home (state sama dengan halaman Pomodoro).

### F5. Countdown
- Field: nama momen, tanggal + jam target, warna/emoji opsional.
- **Unit dinamis:**
  - ≥ 1 tahun → "1 tahun 3 bulan lagi"
  - ≥ 1 bulan → "2 bulan 10 hari lagi"
  - ≥ 1 hari → "4 hari 6 jam lagi"
  - ≥ 1 jam → "3 jam 20 menit lagi"
  - < 1 jam → "12 menit 30 detik lagi"
  - Lewat → "Sudah lewat 3 hari" + opsi arsipkan.
- Sort dari yang paling dekat.

### F6. Kalender
- View **hari / pekan / bulan**, navigasi prev/next/hari ini.
- Menampilkan: kejadian jadwal (termasuk hasil ekspansi recurring), task ber-deadline, countdown.
- Klik tanggal (view bulan/pekan) → panel/detail hari itu: daftar jadwal + to-do + memo hari itu.
- Klik slot kosong → bikin jadwal baru di jam itu.
- Recurring di-expand **hanya untuk rentang yang sedang dilihat** (bukan semua kejadian sampai selamanya).

### F7. Habit
*(Tersirat dari Home — lihat Asumsi.)*
- Field: nama, ikon, frekuensi (tiap hari / hari-hari tertentu dalam seminggu), target per hari (default 1x).
- Check-in harian; **streak** = hari berturut-turut yang target terpenuhi (hari yang bukan jadwal habit tidak memutus streak).
- Riwayat check-in untuk heatmap di Overview.
- Field opsional "Untuk goal" (F13).

### F8. Memo / Jurnal
- Satu atau lebih entri per hari: judul opsional, isi teks (markdown sederhana).
- **Mood hari ini:** 5 skala emoji (😞 😕 😐 🙂 😄) + catatan opsional; satu mood per hari.
- **Mention jadwal:** ketik `@` → muncul pilihan jadwal (kejadian di sekitar tanggal memo) → jadi chip yang bisa diklik ke detail jadwal. Jadwal dihapus → chip tampil "jadwal dihapus", tidak error.
- Daftar memo per tanggal + pencarian teks.

### F9. Panduan
- Halaman statis, satu section per fitur (F1–F13) + FAQ + cara backup (export/import). Ada daftar isi yang bisa diklik.

### F10. Import & Export
- Export: semua data → satu file JSON (ada `version` skema + tanggal export).
- Import: pilih file JSON → validasi skema → preview jumlah data → pilih **gabung** atau **ganti semua** (konfirmasi dulu sebelum ganti).
- File tidak valid / versi tidak dikenal → ditolak dengan pesan jelas, data lama aman.

### F11. Overview (usulan isi)
Dashboard analitik dengan pilihan rentang: **Keseluruhan / Harian / Pekanan / Bulanan / Tahunan**, plus navigasi prev/next per rentang (mis. pekan lalu, bulan depan). Semua widget ikut rentang terpilih.
- **Ringkasan angka:** task selesai, % task selesai tepat waktu, total menit fokus Pomodoro, jumlah sesi, habit completion rate.
- **Streak:** streak aktif & streak terpanjang per habit, streak "hari produktif" (ada task selesai atau sesi fokus), streak menulis memo. Di rentang Keseluruhan tampil rekor sepanjang masa.
- **Grafik fokus:** menit Pomodoro per unit waktu — per jam (Harian), per hari (Pekanan/Bulanan), per bulan (Tahunan/Keseluruhan).
- **Habit heatmap** ala GitHub contribution per habit.
- **Tren mood:** garis mood harian + korelasi sederhana (rata-rata mood di hari dengan fokus tinggi vs rendah).
- **Distribusi Eisenhower:** jumlah task per kuadran (indikator lo kebanyakan "pemadam kebakaran" atau nggak).
- **Waktu terjadwal:** total jam jadwal per kategori/warna.
- **Task terlambat** & **countdown terdekat** (3 teratas).
- **Progress goal:** progress tiap goal aktif + chapter berjalan di rentang terpilih.

### F12. Home
- Sapaan + tanggal hari ini.
- **Habit hari ini** + **quick habit check** (satu klik centang).
- **Task selesai hari ini** & **progress bar** (selesai / total task hari ini).
- **Streak** (streak habit terpanjang aktif + streak "hari produktif").
- **Jadwal berikutnya** hari ini.
- **Quick add task penting:** input judul + deadline + prioritas → langsung masuk to-do (opsi langsung taruh di kuadran Eisenhower "Penting").
- **Memo cepat** + pilih mood hari ini.
- **Widget Pomodoro** (start langsung, pilih task).
- **Goal aktif:** chapter yang sedang berjalan + progress-nya, dan item hari ini dari chapter itu.

### F13. Goals
Lapisan paling atas: ngasih "kenapa" ke task/habit/jadwal. Goal **nggak bikin item baru**, cuma nautin item yang sudah ada.

**Struktur (2 tingkat):**
```
Main Goal        "Lulus AWS SAA"            target 31 Mar 2027
 ├─ Sepanjang goal                          ← item yang ditaut langsung ke main goal
 │   └─ Habit    Tidur ≤ 23:00
 ├─ Chapter 1    "Kuasai materi"            1–31 Jan
 │   ├─ Habit    Belajar 1 jam/hari
 │   ├─ Jadwal   Kelas online Sel & Kam 19:00
 │   └─ Task     Selesai modul 1–6
 └─ Chapter 2    "Latihan soal"             1–28 Feb
     └─ Task     Tryout 1, 2, 3
```

- **Main Goal:** judul, alasan ("kenapa penting"), kategori (karier / kesehatan / keuangan / diri / relasi), tanggal mulai & target, status (aktif / selesai / ditunda / dibatalkan). Jumlah goal aktif **bebas**.
- **Chapter:** judul, periode mulai–selesai (wajib di dalam rentang main goal), urutan bisa diatur (drag). Opsional — goal boleh tanpa chapter.
- **Tautan item:** task/habit/jadwal punya field opsional "Untuk goal" → pilih **main goal (Sepanjang goal)** atau **salah satu chapter**. Satu item cuma di **satu tempat** (nggak dobel hitung).
- **Sepanjang goal** = chapter bayangan berisi item yang ditaut langsung ke main goal; tanpa periode sendiri (ikut rentang main goal); tampil paling atas, bukan chapter bernomor.

**Progress:**
- **Chapter / Sepanjang goal** = rata-rata dari item di dalamnya:
  - Task: selesai / total.
  - Habit: % hari target tercapai selama periode chapter (sampai hari ini).
  - Jadwal: % kejadian yang ditandai selesai/hadir selama periode chapter (sampai hari ini).
- Chapter bisa **ditandai selesai manual** (progress = 100%), termasuk chapter tanpa item.
- **Main Goal:**
  - Tanpa chapter → progress langsung dari item-itemnya.
  - Ada chapter → rata-rata semua chapter **termasuk Sepanjang goal** (kalau ada isinya), bobot sama.

**Status chapter otomatis** dari tanggal: belum mulai / berjalan / selesai / **terlewat** (periode lewat, progress < 100%).

**Review berkala:**
- Pas chapter berakhir / terlewat, dan tiap akhir pekan untuk goal aktif → muncul kartu review di Home: "Gimana progress <goal/chapter>?".
- Pilihan untuk chapter terlewat: **perpanjang / geser periode / tutup**.
- Jawaban review tersimpan sebagai **Memo** yang otomatis ter-mention goal-nya.

**Integrasi:**
- **Memo:** mention `#goal` / chapter (mirip `@jadwal`), jadi chip ke detail goal.
- **Countdown:** tombol "buat countdown" dari tanggal target goal.
- **Kalender:** tanggal target goal & batas chapter tampil sebagai penanda.
- **Overview:** progress tiap goal aktif di rentang terpilih.
- **Home:** lihat F12.

**Halaman Goals:** daftar main goal (filter status/kategori) + progress bar; detail goal = stepper/timeline chapter (✓ selesai → **berjalan** → belum mulai) + daftar item per chapter.

**Edge case:** hapus main goal → chapter ikut terhapus, item tetap ada (tautannya dilepas, konfirmasi dulu). Hapus chapter → item-nya pindah ke Sepanjang goal (atau dilepas, user pilih). Geser periode main goal sampai chapter keluar rentang → ditolak dengan pesan jelas.

## Kebutuhan

Penyimpanan belum diputuskan (lihat Asumsi), jadi mayoritas task milik `fe`; `be` pegang lapisan data/logika murni (interface repository, skema, engine recurrence, kalkulasi progress goal, import/export).

| Modul | ID | Kebutuhan | Acceptance criteria | Pemilik | BlockedBy | Size |
|---|---|---|---|---|---|---|
| M1 Fondasi | T1 | Setup project, routing, layout + nav semua halaman | Semua 12 halaman bisa dibuka lewat nav; lint/typecheck/build lulus; responsif ≥360px | `fe` | - | M |
| M1 Fondasi | T2 | Lapisan data (interface repository) + skema ber-versi untuk semua entitas; implementasi storage menyusul keputusan penyimpanan | Semua fitur akses data lewat satu interface repo (ganti storage nggak ubah UI); skema punya `version`; query list bisa difilter per rentang tanggal (bukan scan penuh di jalur panas) | `be` | - | M |
| M2 Jadwal & Task | T3 | Engine recurrence (harian N=1–6, mingguan 1/2 minggu multi-hari, bulanan tgl/minggu-ke-N, end rule, exception) | Unit test: tiap pola menghasilkan tanggal benar untuk rentang 1 tahun; tgl 31 di bulan pendek dilewati; ekspansi cuma di rentang yang diminta; edit "ini saja/berikutnya/semua" benar | `be` | T2 | L |
| M2 Jadwal & Task | T4 | UI jadwal: form (mulai–selesai / durasi), recurrence, edit/hapus 3 opsi, tautan task | Dua mode waktu menghasilkan data identik; validasi selesai > mulai; input teks di-escape (no HTML injection) | `fe` | T1, T3 | L |
| M2 Jadwal & Task | T5 | To-do list: CRUD, deadline, prioritas, sisa waktu dinamis, filter/sort, tautan jadwal | Format sisa waktu sesuai F2 (unit test batas: 59 mnt, 1 jam, 1 hari, 1 bulan, lewat); satu timer global, bukan satu interval per item | `fe` | T1, T2 | M |
| M3 Fokus | T6 | Eisenhower matrix + drag & drop | Tambah cuma dari to-do; DnD mouse + touch; posisi persist setelah reload | `fe` | T5 | M |
| M3 Fokus | T7 | Pomodoro + riwayat sesi + widget | Timer tetap akurat (±1 dtk) setelah tab background 5 menit; setting persist; target task/teks bebas | `fe` | T5 | M |
| M3 Fokus | T8 | Countdown dengan unit dinamis | Unit test tiap ambang F5; sort terdekat; lewat → status "sudah lewat" | `fe` | T1, T2 | S |
| M4 Kalender | T9 | Kalender view hari/pekan/bulan + panel detail hari | Recurring dari T3 tampil benar di 3 view; klik hari tampilkan jadwal+todo+memo; render bulan < 100ms untuk 500 kejadian | `fe` | T4, T5 | L |
| M5 Refleksi & Habit | T10 | Habit: CRUD, check-in, streak | Streak benar untuk habit hari tertentu (hari non-jadwal tidak memutus); unit test streak | `fe` | T2 | M |
| M5 Refleksi & Habit | T11 | Memo + mood + mention `@jadwal` | Mention jadi chip yang navigasi ke jadwal; jadwal terhapus tidak bikin error; isi memo dirender aman (sanitasi markdown) | `fe` | T4 | M |
| M6 Data | T12 | Import/export JSON (gabung / ganti semua) | Round-trip export→wipe→import identik; file invalid/versi asing ditolak tanpa mengubah data; batas ukuran file | `be` | T2 | M |
| M7 Dashboard | T13 | Halaman Overview (isi F11) | 5 rentang (Keseluruhan/Harian/Pekanan/Bulanan/Tahunan) + prev/next jalan; semua metrik & streak F11 benar per rentang (unit test agregasi + streak); agregasi satu kali per ganti rentang, bukan per widget re-scan | `fe` | T7, T10, T11 | L |
| M7 Dashboard | T14 | Halaman Home (isi F12) | Quick add masuk to-do; quick habit check update streak; widget Pomodoro sinkron dengan halaman Pomodoro | `fe` | T7, T10, T11 | M |
| M7 Dashboard | T15 | Halaman Panduan | Ada section tiap fitur + FAQ + backup; daftar isi bisa diklik | `fe` | T1 | S |
| M8 Goals | T17 | Model goal + chapter + tautan item, kalkulasi progress & status chapter | Unit test: progress task/habit/jadwal, Sepanjang goal ikut rata-rata, goal tanpa chapter, chapter selesai manual, status terlewat; periode chapter di luar main goal ditolak; satu item cuma satu tautan; hapus goal/chapter sesuai edge case F13 | `be` | T2 | M |
| M8 Goals | T18 | Halaman Goals + field "Untuk goal" di form task/habit/jadwal + review berkala + integrasi (memo `#goal`, countdown, kalender, Overview, Home) | Stepper chapter + progress tampil benar; dropdown "Untuk goal" berisi Sepanjang goal + chapter; kartu review muncul saat chapter berakhir/terlewat & akhir pekan, jawabannya jadi memo; teks goal dirender aman (escape) | `fe` | T4, T5, T10, T11, T17 | L |
| M9 QA | T16 | Uji end-to-end seluruh AC + kriteria sukses | Semua AC terverifikasi dengan bukti; nol `blocker`/`mayor` kebuka | `qa` | T4–T15, T17, T18 | L |

**PARALEL:**
- T1 ∥ T2.
- T3 ∥ T5 ∥ T8 ∥ T10 ∥ T12 ∥ T15 ∥ T17 (setelah fondasi).
- T6 ∥ T7 (setelah T5).
- T9 ∥ T11 (setelah T4).
- T13 ∥ T14 ∥ T18 (Home & Overview butuh widget goal dari T18 → integrasinya dikerjain di T18, bukan T13/T14).

## Definition of Done
- Semua task T1–T15, T17, T18 `done`, QA (T16) verdict LULUS.
- Lint, typecheck, unit test (recurrence, sisa waktu, countdown, streak, progress goal, import/export), build lulus.
- Nggak ada `innerHTML` dari input user tanpa sanitasi; import divalidasi skema sebelum nulis apa pun.
- Data bertahan setelah reload/tutup browser (detail tergantung keputusan penyimpanan).
- Panduan sesuai fitur yang benar-benar jadi.

## Asumsi & pertanyaan terbuka

### Asumsi
- **Penyimpanan ditunda** (didiskusikan nanti) — data diakses lewat interface repository, jadi pilihan storage (lokal / server + akun / sync) bisa dipasang belakangan tanpa ngubah fitur.
- **Stack:** React + TypeScript + Vite — umum, cepat, ekosistem kalender/DnD matang.
- **Fitur Habit ditambah (F7)** — Home minta "habit hari ini" & "quick habit check", jadi habit butuh tempat dibuat/dikelola.
- **"Task penting" di Home** = task prioritas urgent/medium yang bisa langsung ditaruh di kuadran Penting Eisenhower.
- **Bahasa UI Indonesia**, minggu mulai Senin, zona waktu = zona waktu perangkat.
- **Bulanan tgl 29–31** di bulan yang nggak punya tanggal itu → dilewati (perilaku Google Calendar).
- **Countdown < 1 jam** tampil menit + detik.
- Format export **JSON** saja; .ics/CSV ditunda.
- **Goals 2 tingkat** (main goal → chapter), item boleh langsung ke main goal lewat "Sepanjang goal", bobot rata (bobot custom ditunda).
- **Menit fokus Pomodoro belum dihitung ke progress goal** — rilis pertama cuma task/habit/jadwal; nyusul kalau dibutuhkan.
- **Review berkala** muncul di Home (bukan push), jawabannya disimpan sebagai memo.

### Pertanyaan terbuka
**Blocking:**
1. Penyimpanan: lokal di perangkat, atau server + akun + sync antar perangkat? (didiskusikan nanti — menentukan implementasi T2 dan cakupan "akun/sync").

**Default:**
- Butuh notifikasi pengingat jadwal/deadline di luar app (push)? Sementara: nggak.
- Mood 5 skala emoji cukup, atau mau label sendiri?
- Perlu dark mode di rilis pertama? Sementara: ikut tema sistem.
