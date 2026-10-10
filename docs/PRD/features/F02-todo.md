# F2. To-do list

Task dengan deadline, prioritas, sisa waktu dinamis, filter/sort, tautan jadwal, dan link ke goal.

## Field
- **Judul** (wajib)
- **Catatan** (opsional)
- **Deadline** (opsional) — tanggal + jam
- **Prioritas:** low / medium / urgent
- **Status selesai** (boolean)
- **Tautan jadwal** (opsional) — bisa ke kejadian tertentu dari jadwal rutin
- **Untuk goal** (opsional) — link ke main goal (Sepanjang goal) atau chapter (F13)

## Sisa Waktu Dinamis
Satuan terbesar relevan + satu di bawahnya:
- "2 bulan 3 hari"
- "5 hari 4 jam"
- "3 jam 12 menit"
- "8 menit"
- Lewat deadline → "Terlambat 2 jam" (merah)

Satu timer global (bukan interval per item) untuk efisiensi.

## Filter & Sort
- **Filter:** semua / hari ini / mendatang / terlambat / selesai
- **Sort:** deadline, prioritas

## Tautan Jadwal
- Task bisa tertaut ke satu jadwal (atau nggak tertaut)
- Di detail jadwal (F1) tampil checklist task yang tertaut dengan checkbox

## Bikin Task dari Jadwal
- Di detail jadwal ada tombol "+ Tambah task"
- Form cepat: judul + deadline + prioritas
- Task otomatis tertaut ke jadwal itu

## UI
- List view: tampil judul, deadline, prioritas, sisa waktu
- Checkbox buat tandai selesai
- Sort/filter dropdown atau tab
- Input teks di-escape (no HTML injection)

## Perhitungan Sisa Waktu
- Update real-time di satu timer global
- Bukan per-item setInterval (performa)
