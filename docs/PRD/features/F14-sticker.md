# F14. Sticker

Koleksi bawaan per pack, dipakai di memo/ikon/hias halaman. Diganti kapan aja. Mode hias per halaman disimpan per ukuran layar.

## Koleksi Bawaan
- Beberapa pack (mis. mood, aktivitas, alam, hewan, perayaan, dsb)
- Ikut terbundel di app → jalan offline
- Lazy load per pack (nggak semua dimuat di awal)
- Tier 1: mood pack wajib di awal (penting buat F8 + F12)

## Picker Sticker
- Tab per pack
- "Terakhir dipakai" tab (quick access)
- Pencarian nama (search sticker)
- Grid view sticker
- Tap → pilih
- Data: hanya simpan **ID sticker** (bukan gambar)

## Dipakai Di

### Memo (F8)
- Tempel satu/lebih sticker di entri memo
- Ganti/hapus kapan aja
- Tampil di card memo

### Ikon Item (Habit, Countdown, Goal)
- **Habit:** ikon habit
- **Countdown:** ikon countdown
- **Goal sampul:** sticker sampul main goal
- Bisa dipilih atau gunakan emoji
- User bisa ganti kapan aja

### Hias Halaman (Semua Halaman)
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

## Data Sticker
- Per sticker: ID, halaman, ukuran layar, ID elemen tempelan, posisi %, ukuran, rotasi, urutan tumpuk
- Ringan buat sync (cuma metadata, bukan gambar)

## ID Sticker Tak Dikenal
- Kalau ID sticker nggak ditemukan (mis. pack dihapus di versi baru)
- Tampil placeholder, nggak error
- User bisa ganti ke sticker lain atau hapus

## Performa
- Aset sticker lazy load per pack
- Offline: semua pack tersedia (bundled)
- Layer hias nggak bikin halaman re-render saat sticker digeser (render diri sendiri)
- Halaman dengan 100 sticker tetap scroll smooth

## UI
- Sticker picker: tab navigation, grid layout, search bar
- Mode hias: tombol "Hias" toggle → sticker draggable, rotateable, resizable
- Di luar mode hias: nggak ada UI hias (clean)
- Responsive di semua ukuran
