# F10. Import & Export

Export semua data → JSON (terbaca, peringatan). Import: validasi, preview, pilih gabung/ganti semua.

## Export
- **Target:** semua data (jadwal, task, habit, memo, goal, countdown, Pomodoro history, sticker placement)
- **Format:** JSON dengan metadata:
  - `version` skema (string, mis. "1.0.0")
  - `exportDate` (timestamp)
  - `dataCount` per tipe entitas
- **File:** `improve-personal-backup-YYYY-MM-DD.json`
- **Peringatan sebelum export:** "File ini berisi data terbaca (tidak terenkripsi). Simpan dengan aman atau kasih ke orang terpercaya saja."
- **Konten:** data dalam plaintext, readable

## Import
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

## Round-trip Test
- Export → wipe (hapus semua) → import → identik dengan asli (unit test)

## Edge Cases
- File versi lama/asing → ditolak, user minta upgrade
- File corrupt → ditolak dengan pesan "File rusak"
- File terlalu besar → warn user, offer partial import (opsional fase 2)

## UI
- Button "Export" → download file auto
- Button "Import" → file picker → preview → confirm
- Progress bar saat import berjalan
- Toast notify "Import selesai"
