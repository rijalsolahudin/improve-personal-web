# QA report - #104 Overview: samakan detail visual dengan source-ui/Desktop.dc.html

## Verdict

**LULUS**

- Tier: T1
- Delta: `apps/web/app/pages/app/overview.vue` (hunk hanya blok `<style scoped>`, baris 320+)
- Gate: `pnpm gate:delta --tier t1 --files apps/web/app/pages/app/overview.vue` -> PASS (49s, exit 0), prettier + eslint + vitest 1 file / 19 test

## Acceptance criteria

| AC | Hasil | Bukti |
| --- | --- | --- |
| gap 16 + margin 4 (header & statistik) | pass | `overview.vue:323` gap 16, `:335` header margin-bottom 4, `:393` stats margin-bottom 4 -> 16+4 = 20 = main gap sumber (Desktop.dc.html:1298) |
| range pill 3/2 + opsi 7x14 | pass | `overview.vue:380-387`; sumber 1311 (`padding:3px;gap:2px`) & 1313 (`7px 14px`); override menang spesifisitas atas `.segmented.framed` + `.option` |
| next disabled opacity .35 | pass | `overview.vue:367`; sumber 3200 `nextOp` .35; `IconButton` meneruskan attr `disabled` ke root `.icon-btn` (fallthrough), dan test `overview.range.qa.test.ts:178` membuktikan attr itu ada |
| bar chart radius bawah 3 | pass | `overview.vue:491`; sumber 1335 |
| streak note 12 / rekor 76 | pass | `overview.vue:514,577`; sumber 1345, 1360 |
| chip heatmap 6x12 + dot 9 | pass | `overview.vue:597-606` (`min-height:0` menetralkan `.chip-pick` 34px); sumber 1372 (`6px 12px`, dot 9 radius 3) |
| mood tanpa border | pass | `overview.vue:651`; sumber 1391 (tanpa border) |
| total jadwal 18 display | pass | `overview.vue:463-467` (keluar dari grup `.mute`, warna jadi ink seperti sumber 1422) |
| goal gap 12 / judul 14 baseline | pass | `overview.vue:757-779`; sumber 1435, 1438 |
| chart head wrap | pass | `overview.vue:473-475`; sumber 1332 `flex-wrap:wrap` |

## Bug

Tidak ada bug blocking.

## Tiga pilar

- **Keamanan:** tidak tersentuh - delta murni CSS, tanpa perubahan input/auth/API.
- **Performa:** tidak ada JS/template berubah, hanya +/- selector CSS; tidak menyentuh jalur agregasi.
- **Kerapian:** prettier + eslint `--max-warnings 0` PASS. Semua selector baru menunjuk markup yang benar-benar ada (`.icon-btn` root IconButton, `.option` Segmented, `.chip` Chip, `.dot`) -> tanpa CSS mati. Komentar menjelaskan "kenapa" (selisih 4px, penyimpangan dari nilai komponen). Tanpa `.only`/`.skip`.

## Regresi data

Template/script tidak berubah: `git diff -U0` hanya hunk di baris 320-891 (blok style layout) - script (`useOverview`, `rangeOptions`) dan template (header/nav, ranges, stat, chart, streak, heatmap, mood, eisenhower, scheduled, goals, late, countdown) utuh. Bukti perilaku: 19 test `overview.range.qa.test.ts` hijau (rentang & prev/next, metrik/streak, agregasi per ganti rentang, 5 `.stat` + `.heatmap` + `.habit-streak`).

## Sisa risiko / tidak diuji

- Visual browser tidak dicek: tidak ada sesi login di environment QA, jadi tidak ada screenshot. Verifikasi visual = pemetaan selector -> nilai sumber, bukan render nyata.
- Override `:deep()` bergantung pada class internal komponen UI (`.icon-btn`, `.option`, `.chip`); kalau komponen itu mengganti nama class, override hilang tanpa test gagal.
- Temuan di luar AC (pre-existing, bukan delta): `.stat-label` memakai `text-transform: uppercase` sedangkan sumber 1322 hanya `letter-spacing:.1em` -> usul task terpisah.
