# Assumptions & Open Questions

## Assumptions

### Login & Keamanan
- **Login = Email OTP + Google SSO (tanpa password)** — lebih simpel, email jadi pembuka pertama; sidik jari & passkey jadi backup.
- **OTP non-production = fix `777777`, tanpa kirim email** — biar dev/QA/e2e gampang login; production tetap OTP random via email. Penentuan pakai env server, default (env kosong/nggak dikenal) = production. Google SSO aktif di semua environment.
- **Recovery key wajib backup di ≥2 tempat** (salin/download/email/QR/password manager) — user nggak boleh skip; server juga simpan encrypted untuk bantuan; ini buat "lupa semua" jarang terjadi.

### Penyimpanan & Sync
- **Penyimpanan = local-first + sync + E2EE dengan pembuka berlapis** (OTP, perangkat, passkey, recovery key) + tambah perangkat via QR — hasil diskusi; sudah diputuskan.
- **Tanpa mode titip kunci & HSM** di rilis ini — biar klaim "server nggak bisa baca" konsisten dan biaya rendah.
- **Konflik sync: update terakhir menang per record** — cukup buat app personal satu orang; merge per field/CRDT ditunda.

### Platform & Stack
- **Satu rilis buat semua platform** (web desktop, PWA, Android, iOS) — sesuai permintaan.
- **Stack client:** web + PWA pakai **Nuxt** (Vue + TypeScript); native Android & iOS pakai **React Native** (TypeScript). UI dua codebase, tapi logika murni (lapisan data/repository, kripto, sync, recurrence, dsb) + design token di-share sebagai package TypeScript tanpa ketergantungan framework UI. Stack server ditentukan di fase kontrak, syaratnya cuma simpan ciphertext + metadata minimal.

### Fitur Khusus
- **Sticker** = koleksi bawaan buat dekorasi memo, ikon habit/countdown/goal, dan hias semua halaman; bisa diganti kapan aja; upload sticker sendiri ditunda (butuh validasi file + storage terenkripsi).
- **Hiasan disimpan per ukuran layar (HP/tablet/desktop) + nempel ke elemen**, bukan per device — biar ikut sync dan nggak berantakan di layar beda ukuran.
- **Hias bebas total** (posisi & jumlah nggak dibatasi) — kegunaan app dijaga lewat sticker tembus tap di luar mode hias + toggle "Sembunyikan hiasan", bukan lewat larangan.
- **Fitur Habit ditambah (F7)** — Home minta "habit hari ini" & "quick habit check", jadi habit butuh tempat dibuat/dikelola.
- **"Task penting" di Home** = task prioritas urgent/medium yang bisa langsung ditaruh di kuadran Penting Eisenhower.

### Lokalisasi & Zona Waktu
- **Bahasa UI Indonesia**, minggu mulai Senin, zona waktu = zona waktu perangkat.
- **Bulanan tgl 29–31** di bulan yang nggak punya tanggal itu → dilewati (perilaku Google Calendar).
- **Countdown < 1 jam** tampil menit + detik.

### Data & Export
- Format export **JSON** saja; .ics/CSV ditunda.

### Goals & Progress
- **Goals 2 tingkat** (main goal → chapter), item boleh langsung ke main goal lewat "Sepanjang goal", bobot rata (bobot custom ditunda).
- **Menit fokus Pomodoro belum dihitung ke progress goal** — rilis pertama cuma task/habit/jadwal; nyusul kalau dibutuhkan.
- **Review berkala** muncul di Home (bukan push), jawabannya disimpan sebagai memo.

---

## Open Questions

### Blocking
Tidak ada — semua keputusan login, penyimpanan, platform sudah final.

### Default
1. **Notifikasi pengingat jadwal/deadline di luar app?** Di native/PWA bisa pakai notifikasi lokal tanpa server (tetap privat). Sementara: nggak, cuma in-app.
2. **Mood 5 skala emoji cukup, atau mau label sendiri?** Sementara: 5 emoji.
3. **Perlu dark mode di rilis pertama?** Sementara: ikut tema sistem (light/dark auto).
