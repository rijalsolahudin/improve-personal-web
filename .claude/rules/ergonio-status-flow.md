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

## Developer (semua agent selain QA)

Transisi yang boleh: `backlog` -> `todo` -> `prog` -> `status-1792622088574`.

1. Ambil task dari `backlog`, pindah ke `todo` saat jadi antrean berikutnya. Kalau
   langsung dikerjakan, `backlog` -> `prog` boleh sekalian.
2. Mulai kerja: `prog` + `progressPct` sesuai kondisi.
3. "Selesai" berarti kode + test + lint/typecheck sudah jalan. Pindah ke
   `status-1792622088574`, `progressPct: 90`, dan tambah
   `<p><strong>Hasil:</strong> ...</p>` di `description`: file yang diubah, cara
   verifikasi, trade-off tiga pilar.
4. DILARANG set `review` atau `done` - itu wilayah QA.
5. Task `status-1792622168795` (Failed): baca catatan bug QA dulu, balik ke `prog`
   saat memperbaiki, lalu ke `status-1792622088574` lagi setelah beres.

## QA

Transisi yang boleh: `status-1792622088574` -> `review` -> (`done` | `status-1792622168795`).

1. Ambil task dari `status-1792622088574`, pindah ke `review` saat mulai mengecek.
2. Lulus: `done` + `progressPct: 100` + verdict & bukti di `description` atau report.
3. Gagal: `status-1792622168795` + catat tiap bug (langkah reproduksi, expected vs
   actual, severity, bukti `path:line`). Bug terpisah boleh jadi subtask.
4. DILARANG `done` tanpa menjalankan verifikasi; DILARANG memperbaiki kode produk.

## Kerja paralel

- Task tanpa ketergantungan dikerjakan bersamaan, bukan antre. Urutan blok: lihat
  `### PARALEL` di `docs/PRD.md`.
- Satu task = satu agent. Dua agent jangan mengedit file yang sama di waktu yang
  sama - pecah per file atau urutkan.
- Perubahan bersama (`packages/contracts`, `packages/core`) dikerjakan lebih dulu,
  konsumennya menyusul.
- `apps/web` dan `apps/mobile` boleh paralel selama kontraknya sudah ada.

## Wajib

- Satu `updateTask` per transisi: gabung status + `progressPct` + `description`.
- Field yang tidak diubah pass `null`.
- Task `prog` yang ditinggal lama: tulis kondisi terakhir di `description`, jangan
  biarkan status bohong.
