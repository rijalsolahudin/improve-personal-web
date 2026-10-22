---
name: orchestration
description: Orkestrasi multi-agent untuk mengerjakan beberapa task Ergonio sekaligus. Pakai untuk /orchestration, "gas semua task", "kerjakan paralel", "bagi ke agent", atau saat 2+ task siap dikerjakan bersamaan. Mengatur pembagian task ke subagent, batas file, dan transisi status Ergonio (subagent tidak punya MCP ergonio).
---

# Orkestrasi agent

Project: `personal-productivity`. Alur status: `.claude/rules/ergonio-status-flow.md`.

## Batasan (jawab jujur ke user dulu)

- Subagent jalan **blocking**: satu `Agent` call harus selesai sebelum turn lanjut. Tidak ada mode background. Paralel hanya antar beberapa `Agent` call dalam **satu** pesan.
- Subagent **tidak punya tool MCP ergonio** (tools-nya: Read, Glob, Grep, Bash, Write, dan `Edit` - kecuali `arif`/`yoga` yang tanpa `Edit`). Orchestrator yang memindahkan status; subagent tidak.
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
4. **Update Ergonio sebelum dispatch** - `backlog`/`todo` -> `prog`, `progressPct` sesuai kondisi.
5. **Dispatch paralel** - maksimal 3 `Agent` call dalam satu pesan. Tiap prompt wajib berisi: nomor task, scope file, acceptance criteria, perintah verifikasi, dan larangan menyentuh wilayah agent lain.
6. **Setelah semua kembali** - cek klaim subagent dengan bukti (jalankan test/lint area itu bila perlu), baru pindahkan `prog` -> `status-1792622088574` (Ready to Review) + `progressPct: 90` + `<p><strong>Hasil:</strong> ...</p>`.
7. **QA** - dispatch `fajar` untuk task Ready to Review. Pindahkan ke `review` saat mulai mengecek; lulus -> `done` + `progressPct: 100`; gagal -> `status-1792622168795` (Failed) + catatan bug, lalu balik ke agent pemilik.
8. **Lapor** tabel: task, agent, status akhir, file, hasil verifikasi, sisa risiko.

## Aturan

- DILARANG menyerahkan dua task ke dua agent kalau file yang disentuh beririsan.
- DILARANG menandai Ready to Review tanpa membaca ringkasan subagent dan menjalankan verifikasinya.
- Kalau subagent gagal atau tidak selesai, task tetap `prog` dan dicatat di ringkasan - jangan dinaikkan statusnya.
- `arif` dan `yoga` tidak mengubah kode produk; hasilnya report, transisi status tetap lewat orchestrator.
- Satu pesan dispatch = satu blok `Agent` calls, tanpa narasi panjang di antaranya.
