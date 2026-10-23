---
name: ergonio
description: Lacak setiap task kerja di Ergonio (project personal-productivity) lewat MCP ergonio. Pakai di awal setiap task implementasi/perbaikan/riset di repo ini - bikin task dulu, lalu update status sampai selesai (progress mengikuti status). Juga pakai kalau user sebut Ergonio, "bikin task", atau "update task".
---

# Ergonio task tracking

Project: `personal-productivity` (Ergonio MCP, tools `mcp__ergonio__*`).

## Status keys

Alur lengkap (siapa boleh pindah ke mana + aturan paralel): `.claude/rules/ergonio-status-flow.md`.

| key | label | pemilik | kapan |
|---|---|---|---|
| `backlog` | Backlog | developer | ide/ditunda, belum siap dikerjain |
| `todo` | To Do | developer | antrean berikutnya |
| `prog` | In Progress | developer | sedang dikerjain |
| `status-1792622088574` | Ready to Review | developer | kode + verifikasi beres, antre QA |
| `review` | In Review | QA | QA sedang ngecek |
| `status-1792622168795` | Failed | QA | QA nemu bug, balik ke developer |
| `done` | Done | QA | QA lulus |

Label yang ada: `Web`, `Mobile` (dari `listFields`). Custom field: tidak ada - pass `null`.

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
   - Ambil dari backlog, jadikan antrean berikutnya → `status: "todo"`
   - Mulai kerja → `status: "prog"`
   - Milestone tercapai → tulis kemajuan di `description` (jangan kirim `progressPct` - nilainya dihitung dari status)
   - Kode selesai, test/verifikasi jalan → `status: "status-1792622088574"` (Ready to Review)
   - DILARANG set `review` atau `done` - itu wilayah QA (`fajar`)
   - Belum bisa dimulai (pendahulu belum siap), ide, atau ditunda → `status: "backlog"`, tulis alasan/pendahulu di `description`
   - Field yang tidak diubah wajib `null`.
4. **Ringkasan akhir** - sebelum pindah ke `status-1792622088574`, update `description`: tambah `<p><strong>Hasil:</strong> ...</p>` berisi file yang diubah + catatan trade-off (tiga pilar: keamanan, performa, kerapian).
5. **QA** - `fajar` ambil task dari `status-1792622088574` → `review` (+ komentar "mulai cek"), lalu `done` + komentar verdict kalau lulus, atau `status-1792622168795` (Failed) + komentar bug kalau gagal. DILARANG memperbaiki kode produk.

## Komentar task

Komentar adalah jalur komunikasi developer <-> QA (aturan lengkap: `.claude/rules/ergonio-status-flow.md` bagian "Komentar task").

- Baca `getTaskComments(taskId)` sebelum mulai atau rework - jangan ulang bug yang sudah dilaporkan.
- `createComment({ taskId, text, parentCommentId })` - `parentCommentId: null` untuk thread baru, isi id komentar untuk balasan.
- `updateComment({ commentId, text })` dan `deleteComment({ commentId })` hanya berlaku untuk komentar sendiri.
- Wajib: komentar handoff saat pindah ke `status-1792622088574`, "mulai cek" saat `review`, komentar bug saat Failed, balasan fix saat `prog` lalu Ready to Review, dan verdict saat `done`.
- Maks 5000 karakter; detail panjang di `reports/**` dan sebut path-nya. Jangan spam per edit.
- Kalau tool komentar tidak tersedia di sesi, salin catatan yang sama ke `description` dan sebut alasannya (jangan diam-diam skip).

## Catatan

- `createTask`/`updateTask`/`createSubtasks` butuh approval user - kalau ditolak, lanjut kerja tanpa retry, sebut di akhir bahwa Ergonio tidak ter-update.
- `progressPct` read-only: dihitung server dari status ("Progress is not settable"). Jangan kirim field itu - pindahkan `status` saja.
- Batch update: gabungkan perubahan status + description dalam satu `updateTask`.
- Status key bisa berubah - kalau `updateTask` gagal karena status, cek ulang `getProject("personal-productivity")`.
