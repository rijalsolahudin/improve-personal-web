# F8. Memo / Jurnal

Entri harian dengan markdown, sticker, mood, mention jadwal, pencarian lokal.

## Field
- **Tanggal** (auto hari ini, bisa ubah)
- **Judul** (opsional)
- **Isi teks** (markdown sederhana: bold, italic, list, link)
- **Sticker** (opsional, bisa > 1) — dekorasi dari F14
- **Mood hari ini** (satu mood per hari) — 5 skala emoji + catatan opsional:
  - 😞 sangat sedih
  - 😕 sedih
  - 😐 netral
  - 🙂 bahagia
  - 😄 sangat bahagia

## Satu atau Lebih Entri Per Hari
- User bisa nulis berkali-kali dalam satu hari
- Tiap entri punya waktu (auto capture)

## Mention Jadwal (`@`)
- Ketik `@` → autocomplete jadwal (kejadian di sekitar tanggal memo)
- Jadi chip (badge) yang bisa diklik → detail jadwal
- **Edge case:** jadwal terhapus → chip tampil "jadwal dihapus", nggak error

## Daftar Memo
- Per tanggal (reverse order: terbaru dulu)
- Pencarian teks (lokal, karena server nggak bisa baca isi)

## Integrasi
- **Home (F12):** widget "Memo cepat" + pilih mood hari ini + tempel sticker
- **Overview (F11):** "tren mood" garis mood harian + korelasi (mood di hari fokus tinggi vs rendah)
- **Goals (F13):** review berkala → jawaban disimpan jadi memo dengan auto-mention goal

## Rendering & Keamanan
- Markdown di-sanitasi (no script injection)
- Input teks di-escape di form

## Pencarian Lokal
- Client-side only (server nggak bisa baca)
- Index harian atau search on-the-fly (tergantung performa)

## UI
- Halaman Memo: timeline entri per hari, card per entri
- Input form: textarea markdown, sticker picker, mood selector
- Edit/hapus entri
- Search bar di atas
- Responsif di semua ukuran
