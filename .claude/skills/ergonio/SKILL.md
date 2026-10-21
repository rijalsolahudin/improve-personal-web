---
name: ergonio
description: Lacak setiap task kerja di Ergonio (project personal-productivity) lewat MCP ergonio. Pakai di awal setiap task implementasi/perbaikan/riset di repo ini - bikin task dulu, lalu update status & progress sampai selesai. Juga pakai kalau user sebut Ergonio, "bikin task", atau "update task".
---

# Ergonio task tracking

Project: `personal-productivity` (Ergonio MCP, tools `mcp__ergonio__*`).

## Status keys

| key | label | kapan |
|---|---|---|
| `backlog` | Backlog | ide/ditunda, belum dikerjain |
| `todo` | To Do | akan dikerjakan **berikutnya**, setelah task pendahulunya sudah masuk In Review (atau done) |
| `prog` | In Progress | sedang dikerjain, sudah mulai |
| `review` | In Review | kode selesai, nunggu verifikasi/review user |
| `done` | Done | terverifikasi selesai |

Label & custom field: belum ada. Jangan isi `labels`/`customFields` (pass `null`) kecuali `listFields` menunjukkan sudah ada.

## Kapan dipakai

- **Pakai:** task yang mengubah kode/config, bug fix, riset/analisis yang menghasilkan keputusan.
- **Skip:** pertanyaan singkat, penjelasan, perintah sekali jalan (mis. "jalankan test"). Kalau ragu, tanya user sekali.

## Alur

1. **Cek duplikat** - `searchTasks` dengan kata kunci task. Kalau sudah ada task yang cocok dan belum `done`, pakai itu (lanjut ke langkah 3).
2. **Buat task** - `createTask`:
   - `projectId`: `"personal-productivity"`
   - `title`: imperatif, singkat, ≤ 80 char (mis. "Tambah validasi email di form register")
   - `description`: HTML (`<p>`, `<ul><li>`), isi: tujuan, scope (web/mobile), acceptance criteria
   - `status`: `"prog"` kalau langsung dikerjain, selain itu `null`
   - `priority`: sesuai urgensi (`medium` default), sisanya `null`
   - Task besar (>3 langkah jelas) → `createSubtasks` (maks 10 judul).
   - Simpan task id/number dari hasil, sebut ke user.
3. **Update selama kerja** - `updateTask` di titik penting, bukan tiap edit kecil:
   - Mulai kerja → `status: "prog"`
   - Milestone tercapai → `progressPct` (25/50/75)
   - Kode selesai, test/verifikasi jalan → `status: "review"`, `progressPct: 90`
   - User konfirmasi / verifikasi lolos → `status: "done"`, `progressPct: 100`
   - Task berikutnya siap dikerjakan (pendahulu sudah `review`/`done`) → `status: "todo"`
   - Belum bisa dimulai (pendahulu belum `review`), ide, atau ditunda → `status: "backlog"`, tulis alasan/pendahulu di `description`
   - Field yang tidak diubah wajib `null`.
4. **Ringkasan akhir** - saat `review`/`done`, update `description`: tambah `<p><strong>Hasil:</strong> ...</p>` berisi file yang diubah + catatan trade-off (tiga pilar: keamanan, performa, kerapian).

## Catatan

- `createTask`/`updateTask`/`createSubtasks` butuh approval user - kalau ditolak, lanjut kerja tanpa retry, sebut di akhir bahwa Ergonio tidak ter-update.
- Batch update: gabungkan perubahan status + progress + description dalam satu `updateTask`.
- Status key bisa berubah - kalau `updateTask` gagal karena status, cek ulang `getProject("personal-productivity")`.
