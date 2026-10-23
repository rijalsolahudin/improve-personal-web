# Ergonio status flow - shared (web + mobile)

Berlaku untuk semua agent di monorepo. Project: `personal-productivity`.
Sumber kebenaran kolom: `getProject("personal-productivity")` - jangan tebak key.

## Peta status

| key | label | arti | pemilik |
|---|---|---|---|
| `backlog` | Backlog | belum siap dikerjakan | developer |
| `todo` | To Do | diambil, jadi antrean berikutnya | developer |
| `prog` | In Progress | sedang dikerjakan | developer |
| `status-1792622088574` | Ready to Review | selesai, antre QA | developer |
| `review` | In Review | QA sedang mengecek | QA |
| `status-1792622168795` | Failed | QA menemukan bug | QA |
| `done` | Done | QA lulus | QA |

Kalau `updateTask` menolak satu key, jalankan `getProject` dan pakai key terbaru.
Jangan pakai label sebagai key.

## Progress

`progressPct` **tidak bisa di-set** lewat MCP: nilainya dihitung server dari status
task ("Progress is not settable: it follows the task's status"). Jangan kirim field
itu di `createTask`/`updateTask` - cukup pindahkan `status`-nya. Kalau perlu detail
kemajuan, tulis di `description` atau komentar task, bukan di angka progress.

## Developer (semua agent selain QA)

Transisi yang boleh: `backlog` -> (`todo`) -> `prog` -> `status-1792622088574`.
`todo` opsional - pakai kalau task belum langsung dikerjakan.

1. Ambil task dari `backlog`, pindah ke `todo` saat jadi antrean berikutnya. Kalau
   langsung dikerjakan, `backlog` -> `prog` boleh sekalian.
2. Mulai kerja: `prog`.
3. "Selesai" berarti kode + test + lint/typecheck sudah jalan. Pindah ke
   `status-1792622088574`, lalu tambah
   `<p><strong>Hasil:</strong> ...</p>` di `description`: file yang diubah, cara
   verifikasi, trade-off tiga pilar.
4. DILARANG set `review` atau `done` - itu wilayah QA.
5. Task `status-1792622168795` (Failed): baca komentar bug QA dulu, **pindah ke
   `prog` dulu saat mulai memperbaiki** (jangan langsung ke Ready to Review), lalu
   ke `status-1792622088574` lagi setelah beres + komentar balasan berisi apa yang
   diubah dan test mana yang sekarang hijau.

## QA

Transisi yang boleh: `status-1792622088574` -> `review` -> (`done` | `status-1792622168795`).

1. Ambil task dari `status-1792622088574`, pindah ke `review` saat mulai mengecek.
2. Lulus: `done` + verdict & bukti di `description` atau report,
   plus komentar ringkas `LULUS` + perintah yang membuktikannya.
3. Gagal: `status-1792622168795` + catat tiap bug di komentar (langkah reproduksi,
   expected vs actual, severity, bukti `path:line`); ringkasan panjang di
   `reports/**`. Bug terpisah boleh jadi subtask.
4. DILARANG `done` tanpa menjalankan verifikasi; DILARANG memperbaiki kode produk.
5. **Cek per modul, bukan seluruh app.** QA memverifikasi delta task itu (file + test yang disentuh) plus regresi area terdekat. Sidak end-to-end semua AC hanya di task payung (mis. T16/#30), dijalankan sekali setelah turunannya `done`. Task docs-only/deps-only diverifikasi orchestrator lewat script gate (perintahnya ditulis di komentar verdict), tidak perlu antre QA manual.
6. **Tier verifikasi - pilih yang paling ringan yang masih membuktikan AC:**

   | Tier | Kapan dipakai | Yang dijalankan | Batas waktu |
   |---|---|---|---|
   | **T1 cepat** (default) | UI, komponen, composable, util, copy | test file yang disentuh + 2-3 file test area terdekat; eslint/prettier file itu; baca diff | <= 10 menit |
   | **T2 sedang** | server, auth, kripto, storage/IndexedDB, skema, perbaikan data-loss | T1 + `typecheck` + build/audit bila relevan | <= 20 menit |
   | **T3 rilis** | task payung (T16/#30) | suite penuh, build, Lighthouse, e2e/PWA | sekali per rilis |

   DILARANG menjalankan suite penuh, `build`, atau Lighthouse di T1/T2. Suite penuh + typecheck dijalankan orchestrator **sekali per batch** sebelum beberapa task naik ke `status-1792622088574`, bukan per task.
7. **Satu putaran QA + satu re-check.** Re-check hanya menguji bug yang dilaporkan pada putaran sebelumnya; DILARANG membuka area atau skenario baru saat re-check. Skenario baru = task baru.
8. **Temuan di luar AC tidak menggagalkan task.** Kalau kriteria task lulus tetapi QA menemukan isu lain: orchestrator membuat task terpisah, lalu task tetap `done`. Status `Failed` hanya untuk AC gagal, regresi, atau data-loss **di jalur yang diubah task itu**.
9. **Hemat alat ukur.** Build/Lighthouse/benchmark hanya bila AC-nya memang menyebut angka itu; selain itu pakai test yang sudah ada. Jangan mengulang pengukuran yang sudah dibuktikan task lain di tree yang sama.

## Komentar task (handoff developer <-> QA)

Komentar task adalah jalur komunikasi resmi antar agent. Status bilang "di mana",
komentar bilang "kenapa / apa / buktinya". Orchestrator pemilik transisi status dan
**satu-satunya** yang memposting komentar task.

Subagent bisa saja punya tool MCP ergonio: Claude Code/Qoder/Command Code membatasi
lewat daftar `tools:`, tapi OpenCode membuang field itu saat sync sehingga subagent
mewarisi MCP sesi induk. Batasnya karena itu aturan, bukan sandbox:

- Subagent **boleh** memakai tool baca (`getTask`, `getTaskComments`, `searchTasks`,
  `queryTasks`, `getProject`, `listFields`) untuk konteks pekerjaannya.
- Subagent **DILARANG** memanggil tool yang mengubah data (`createTask`,
  `updateTask`, `deleteTask`, `createSubtasks`, `createComment`, `updateComment`,
  `deleteComment`, `createMilestone`, `updateMilestone`, `deleteMilestone`) -
  termasuk memindahkan status, menulis komentar, atau menghapus task/milestone.
  `deleteTask` ikut terlarang karena menghapus seluruh subtask di semua kedalaman.
  Anggap **semua** tool di luar daftar baca di atas terlarang - daftar ini contoh
  minimum, bukan izin.
- Orchestrator memposting komentar atas nama hasil subagent dan menyebut agent
  asalnya, supaya tidak ada dua penulis komentar untuk satu task.

1. **Sebelum mulai / rework** - baca `getTaskComments` dulu, jangan mengulang bug
   yang sudah dilaporkan.
2. **Developer selesai, butuh dites** - saat pindah ke
   `status-1792622088574`, posting komentar handoff: apa yang selesai, file yang
   diubah, perintah verifikasi yang sudah dijalankan, dan bagian mana yang minta
   dites ulang.
3. **QA mulai** - saat pindah ke `review`, komentar singkat "mulai cek" + lingkup
   yang dicek (biar tidak dua QA mengerjakan bagian sama).
4. **QA gagal** - satu komentar berisi daftar bug (reproduksi, expected vs actual,
   severity, bukti `path:line`); balasan/reply untuk bug turunan.
5. **Developer memperbaiki** - pindah ke `prog` dulu, lalu balas komentar QA
   (atau komentar baru di thread yang sama) berisi akar masalah, file yang diubah,
   test yang sekarang hijau, dan sisa risiko.
6. **QA lulus** - komentar verdict `LULUS` + bukti perintah, lalu `done`.

Aturan komentar:

- Satu komentar per milestone, bukan chatter per edit. Jangan spam.
- Maks 5000 karakter; detail panjang taruh di `reports/**` dan sebut path-nya.
- `updateComment`/`deleteComment` hanya untuk komentar sendiri; jangan mengubah
  komentar agent/orang lain - balas saja.
- Fallback kalau tool komentar tidak tersedia di sesi: taruh catatan yang sama di
  `description` dan sebut alasannya (jangan diam-diam skip).

## Kerja paralel

- Task tanpa ketergantungan dikerjakan bersamaan, bukan antre. Urutan blok: lihat
  `### PARALEL` di `docs/PRD.md`.
- Satu task = satu agent. Dua agent jangan mengedit file yang sama di waktu yang
  sama - pecah per file atau urutkan.
- Perubahan bersama (`packages/contracts`, `packages/core`) dikerjakan lebih dulu,
  konsumennya menyusul.
- `apps/web` dan `apps/mobile` boleh paralel selama kontraknya sudah ada.

## Wajib

- Satu `updateTask` per transisi: gabung status + `description` (tanpa
  `progressPct`, field itu dihitung dari status).
- Field yang tidak diubah pass `null`.
- Task `prog` yang ditinggal lama: tulis kondisi terakhir di `description`, jangan
  biarkan status bohong.
