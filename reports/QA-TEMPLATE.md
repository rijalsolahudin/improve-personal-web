# Template report QA

Salin ke `reports/qa-<nomor-task>.md` (mis. `reports/qa-82-gate-delta.md`), isi, hapus
bagian yang tidak relevan. **Cap: ~80 baris.** Report yang lebih panjang tidak membuat
keputusan lebih baik - yang membuat keputusan lebih baik adalah perintah + angka.

Yang **tidak** perlu ditulis ulang di report:

- teks acceptance criteria (sudah ada di task) - cukup nomornya,
- teori test design, definisi severity, atau penjelasan metode,
- narasi urutan langkah kerja.

Output mentah yang panjang (log vitest penuh, stack trace, screenshot) taruh di
`reports/qa-<nomor-task>.log` lalu sebut path-nya, atau tempel ringkasannya di komentar
task (maks 5000 karakter).

---

# QA report - #<nomor> <judul task>

## Verdict

**LULUS** | **LULUS DENGAN CATATAN** | **GAGAL (blocking)** | **BLOCKED**

- Tier: T1 | T2 | T3
- Delta: `<file1>`, `<file2>`, `<file3>` (maks 6, sisanya `...`)
- Gate: `pnpm gate:delta --tier t1` -> PASS (21s) / FAIL / tidak dijalankan + alasan

## Acceptance criteria

| AC | Hasil | Bukti |
| --- | --- | --- |
| <satu baris ringkas AC> | pass / fail | `<perintah>` -> `Tests 9 passed` / `path:line` |

## Bug

Kalau tidak ada: tulis "Tidak ada bug blocking." lalu selesai (jangan bikin tabel kosong).

| # | Severity | Ringkas | Reproduksi | Bukti |
| --- | --- | --- | --- | --- |
| 1 | Critical/High/Medium/Low | <gejala satu baris> | 1. ... 2. ... | `path:line`, log singkat |

## Tiga pilar

- **Keamanan:** <yang dicek + hasil, atau "tidak tersentuh delta ini">
- **Performa:** <angka bila AC menyebut angka, atau "tidak ada perubahan jalur panas">
- **Kerapian:** <lint/typecheck/dead code - ambil dari gate, jangan diulang manual>

## Sisa risiko / tidak diuji

- <area yang sengaja dilewati + alasan, mis. "e2e PWA tidak dijalankan, itu T3">
- <kalau verdict BLOCKED: apa yang menghambat + info yang dibutuhkan>
