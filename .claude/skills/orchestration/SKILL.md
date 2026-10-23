---
name: orchestration
description: Orkestrasi multi-agent untuk mengerjakan beberapa task Ergonio sekaligus. Pakai untuk /orchestration, "gas semua task", "kerjakan paralel", "bagi ke agent", atau saat 2+ task siap dikerjakan bersamaan. Mengatur pembagian task ke subagent, batas file, dan transisi status Ergonio (transisi status & komentar task tetap milik orchestrator).
---

# Orkestrasi agent

Project: `personal-productivity`. Alur status: `.claude/rules/ergonio-status-flow.md`.

## Batasan (jawab jujur ke user dulu)

- Subagent jalan **blocking**: satu `Agent` call harus selesai sebelum turn lanjut. Tidak ada mode background. Paralel hanya antar beberapa `Agent` call dalam **satu** pesan.
- Subagent bisa saja memegang tool MCP ergonio: Claude Code/Qoder/Command Code membatasinya lewat `tools:`, tapi OpenCode membuang field itu saat sync sehingga subagent mewarisi MCP sesi induk. Batasnya aturan, bukan sandbox:
  - **Boleh** tool baca: `getTask`, `getTaskComments`, `searchTasks`, `queryTasks`, `getProject`, `listFields`.
  - **DILARANG** tool yang mengubah data: `createTask`, `updateTask`, `deleteTask` (menghapus seluruh subtask), `createSubtasks`, `createComment`, `updateComment`, `deleteComment`, `createMilestone`, `updateMilestone`, `deleteMilestone`. Semua tool di luar daftar baca di atas dianggap terlarang - daftar ini contoh minimum, bukan izin.
  - Orchestrator pemilik transisi status **dan** satu-satunya yang memposting komentar task (sebut nama agent di komentar) - supaya tidak ada dua penulis status/komentar.
- "Sambil tanya-tanya" berarti: jawab pertanyaan dulu, baru dispatch. Bukan dua-duanya serentak.

## Peta agent

| Agent | Wilayah | Output |
|---|---|---|
| `yoga` | analisis, spesifikasi | report |
| `bayu` | `apps/web/server/**`, `apps/web/shared/**`, `packages/contracts/src/**`, `packages/core/src/**` | kode |
| `dimas` | `apps/web/app/**` | kode |
| `raka` | `apps/mobile/**` | kode |
| `arif` | audit keamanan | report |
| `fajar` | test & QA | test |

## Alur

1. **Baca board** - `queryTasks` project, ambil `backlog` + `todo`. Urutkan `high`/`crit` dulu, lalu nomor task.
2. **Pecah per wilayah file.** Satu task = satu agent. Dua task yang menyentuh file sama dijalankan berurutan, bukan paralel.
3. **Baca aturan app sebelum dispatch** - kalau agent akan menyentuh `apps/<app>/**`, orchestrator wajib baca `apps/<app>/AGENTS.md` + 3 rules app itu (lihat `AGENTS.md` root).
4. **Update Ergonio sebelum dispatch** - `backlog`/`todo` -> `prog` (progress mengikuti status; jangan kirim `progressPct`).
5. **Dispatch paralel** - maksimal 3 `Agent` call dalam satu pesan. Tiap prompt wajib berisi: nomor task, scope file, acceptance criteria, perintah verifikasi, dan larangan menyentuh wilayah agent lain.
6. **Setelah semua kembali** - cek klaim subagent dengan bukti (jalankan test/lint area itu bila perlu), baru pindahkan `prog` -> `status-1792622088574` (Ready to Review) + `<p><strong>Hasil:</strong> ...</p>` **+ komentar handoff** (apa yang selesai, file, perintah verifikasi, bagian yang minta dites).
7. **QA** - dispatch `fajar` untuk task Ready to Review. Pindahkan ke `review` **+ komentar "mulai cek"**; lulus -> `done` + komentar verdict; gagal -> `status-1792622168795` (Failed) + komentar bug (reproduksi, expected vs actual, severity, bukti `path:line`), lalu balik ke agent pemilik: `Failed` -> `prog` dulu saat fix, lalu balas komentar QA dan naikkan lagi ke Ready to Review.
8. **Lapor** tabel: task, agent, status akhir, file, hasil verifikasi, sisa risiko.

## Aturan

- DILARANG menyerahkan dua task ke dua agent kalau file yang disentuh beririsan.
- DILARANG menandai Ready to Review tanpa membaca ringkasan subagent dan menjalankan verifikasinya.
- Kalau subagent gagal atau tidak selesai, task tetap `prog` dan dicatat di ringkasan - jangan dinaikkan statusnya.
- `arif` dan `yoga` tidak mengubah kode produk; hasilnya report, transisi status tetap lewat orchestrator.
- **QA per modul + tier.** `fajar` hanya mengecek delta task (file + test yang disentuh) + regresi area terdekat, bukan sidak seluruh app. Tier: T1 cepat (test file terkait, <= 10 menit) untuk UI/util/copy; T2 sedang (+typecheck/build bila relevan, <= 20 menit) untuk server/auth/kripto/storage/skema/data-loss; T3 rilis (suite penuh + build + Lighthouse) hanya di task payung seperti T16/#30. DILARANG suite penuh/Lighthouse di T1-T2; orchestrator menjalankan suite penuh + typecheck sekali per batch sebelum beberapa task naik ke Ready to Review.
- **Satu putaran QA + satu re-check.** Re-check hanya untuk bug yang dilaporkan; skenario/area baru jadi task baru, bukan alasan `Failed`. Temuan di luar AC tidak menggagalkan task: buat task terpisah, task tetap `done`.
- **Task docs-only/deps-only** diverifikasi orchestrator lewat script gate (perintah + hasil ditulis di komentar), tanpa antre QA manual.
- **Komentar task = jalur komunikasi resmi developer <-> QA.** Aturan lengkap: `.claude/rules/ergonio-status-flow.md` bagian "Komentar task". Wajib baca `getTaskComments` sebelum rework atau QA.
- Komentar tidak menggantikan `description`: ringkasan durable (Hasil/verdict) tetap di `description`, detail panjang di `reports/**`.
- Satu pesan dispatch = satu blok `Agent` calls, tanpa narasi panjang di antaranya.
