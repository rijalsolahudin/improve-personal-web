# Benchmark volume data local-first (#137)

Tanggal: 2026-10-30. Lingkup: `apps/web`, lapisan data (IndexedDB + libsodium), **bukan** UI render.

## Metode

- Halaman bench sementara `/bench` (sudah dihapus) memanggil jalur yang sama dengan hydrate komposabel:
  `repository.listAll()` (baca blob + dekripsi + parse JSON) lalu `schema.parse` per record.
- Data ditulis lewat `writeRecord()` (enkripsi + index + outbox) ke database IndexedDB baru per run,
  dengan master key & provider libsodium asli.
- Dijalankan di Chromium headless (Playwright) terhadap dev server, karena yang diukur hanya
  IndexedDB + kripto; modul dev hanya memengaruhi waktu muat halaman bench, bukan angka di bawah.
- Satu run per skenario (bukan p50 dari banyak run) - angka punya variasi GC beberapa puluh persen.

## Skenario 10.000 task

Isi: 10.000 `todo`, 2.000 `eisenhower_placement`, 2.000 `journal_entry`, 8 `habit` + 3 tahun check-in
(3.208 di antaranya masuk jendela baca 400 hari), 500 `schedule` + 1.000 exception + 2.000 occurrence,
200 `goal` + 400 chapter, 100 `countdown`, 721 `pomodoro_session` (30 hari).

| Domain | Baca + dekripsi + parse |
|---|---|
| task (`todo` + placement) | **708 ms** |
| schedule (+exception, occurrence) | 154 ms |
| habit (+check-in jendela 400 hari) | 167 ms |
| memo (`journal_entry`) | 89 ms |
| goal (+chapter) | 39 ms |
| countdown | 8 ms |
| pomodoro (range 30 hari) | 36 ms |

Estimasi biaya data-hydrate per halaman (jumlah domain yang dibaca halaman itu):

| Halaman | Estimasi |
|---|---|
| To-do | 708 ms |
| Daily | 1.029 ms |
| Goals | 1.068 ms |
| Memo | 1.157 ms |
| Overview | 1.201 ms |

Heap JS: 43,8 MB sebelum seed → 94,5 MB setelah seed + load (termasuk overhead proses seed).

## Skenario 50.000 task

Sama, tetapi 50.000 `todo` + 5.000 placement.

| Domain | 10k | 50k | Rasio |
|---|---|---|---|
| task | 708 ms | **2.772 ms** | 3,9x untuk 4,7x record (≈ linear) |
| per record | ~59 µs | ~50 µs | - |
| schedule | 154 ms | 732 ms | variasi GC setelah load task besar |
| habit | 167 ms | 173 ms | - |
| memo | 89 ms | 96 ms | - |

| Halaman | 10k | 50k |
|---|---|---|
| To-do | 708 ms | 2.772 ms |
| Daily | 1.029 ms | 3.677 ms |
| Goals | 1.068 ms | 3.705 ms |
| Memo | 1.157 ms | 3.801 ms |
| Overview | 1.201 ms | 3.841 ms |

Heap JS setelah load: 106,5 MB.

## Kesimpulan

1. Biaya hydrate **linear** terhadap jumlah record domain: ~50–60 µs/record di Chromium nyata
   (≈ 1,4x estimasi Node + `fake-indexeddb`).
2. Di 10.000 task, halaman pertama yang dibuka membeku ~0,7–1,2 detik hanya untuk data; di 50.000
   task ~2,8–3,8 detik. Belum termasuk render daftar (belum diukur; To-do/Goals/Memo merender semua
   baris tanpa virtualisasi).
3. **Overview selalu paling berat** (membaca hampir semua domain), disusul **Memo** karena
   `useGoals()` ikut menarik task/habit/schedule. **To-do paling ringan** (hanya task), tetapi tetap
   708 ms di 10k.
4. Domain yang sudah dibatasi jendela (check-in 400 hari, occurrence, pomodoro range) terbukti murah
   dan stabil di kedua skenario - pola ini yang seharusnya dipakai domain besar.
5. Biaya ini **berulang**, bukan sekali: setiap pull sync nyata membaca ulang semua store yang pernah
   diregistrasikan (`utils/sync/refresh.ts`), dan entri registry tidak pernah dilepas saat pindah
   halaman.

## Rekomendasi (urutan prioritas)

1. Pindahkan `todo` dan `journal_entry` dari `listAll` ke query berjendela/paginasi memakai index yang
   sudah ada (`listByRange`), plus daftar berjendela/virtual scroll di To-do/Goals/Memo.
2. Lepas reloader sync saat halaman ditinggalkan supaya pull tidak mendekripsi domain yang tidak
   sedang dipakai.
3. Jadikan sumber progres goal di halaman Memo lazy (jangan tarik task/habit/schedule kalau tidak
   ditampilkan).
4. Tambah pagar volume (test/CI) supaya regresi "listAll domain tumbuh" kelihatan sebelum jadi lambat.

## Batas pengukuran

- UI render 10k/50k baris tidak diukur di sini.
- Satu run per skenario, headless Chromium, mesin developer - bukan p75 perangkat low-end.
- Data sintetis (judul/catatan mirip asli, tapi bukan distribusi riil).
