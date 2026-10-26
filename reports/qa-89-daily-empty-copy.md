# QA report - #89 Empty state Daily: jangan bilang "beres semua" saat belum ada item

## Verdict

**LULUS**

- Tier: T1 (UI/copy web)
- Delta: `DailyNowStrip.vue`, `DailyNowStrip.test.ts` (baru), `i18n/locales/id.json` (+1 key)
- Commit: `365e9a7` (ancestor HEAD `c2dcf88`; ketiga file tidak berubah setelah commit)
- Gate: tidak diulang - handoff T1 PASS (prettier+eslint+vitest 2 file/8 test).

## Acceptance criteria

| AC | Hasil | Bukti |
|---|---|---|
| Blok tanpa item -> copy netral, bukan klaim selesai | PASS | `DailyNowStrip.vue:38` `isBlockEmpty = current.total === 0`; `:69` cabang `v-else-if` -> `$t('daily.noItems')`; `DailyNowStrip.test.ts:62-67` mengunci copy netral + `not.toContain(ALL_DONE_COPY)` |
| Blok dengan item semua selesai -> tetap "beres semua" | PASS | `DailyNowStrip.vue:70` cabang `v-else` -> `daily.allDone`; `DailyNowStrip.test.ts:69-74` |
| Ada test untuk dua keadaan | PASS | 3 test: kosong, selesai semua, item tersisa (+ emit `toggle-item`, `:76-88`) |
| Copy lewat i18n, tidak hardcode | PASS | Komponen hanya `$t('daily.noItems')`/`$t('daily.allDone')`; key di `i18n/locales/id.json` (`daily.noItems` = "Belum ada jadwal atau langkah untuk blok ini.") |
| Key tidak yatim | PASS | `daily.noItems` dipakai hanya di `DailyNowStrip.vue:69`; seluruh key `daily.*` yang dipakai komponen ada di `id.json` (satu-satunya locale) |

## Regresi area terdekat

`pnpm exec vitest run app/components/features/daily/DailyNowStrip.test.ts i18n/locales.test.ts` -> 2 files / 8 tests passed, exit 0.
Area habit+daily (11 file, 43 test) hijau termasuk `--sequence.shuffle`, exit 0.

## Temuan di luar AC (saran task terpisah)

- Meta blok kosong masih "0/0 selesai · 05:00–11:59" (sudah dicatat handoff) - kosmetik.
- Test mengunci string copy literal (bukan membaca locale); perubahan copy yang disengaja memang harus menyentuh test - bukan bug, tapi duplikasi string di 1 file.

## Sisa risiko

- `isBlockEmpty` bergantung pada `total` = jumlah item blok (`useDailyRoutine.itemsOf`: jadwal + langkah, `currentBlock` di `useDailyRoutine.ts:95-107`). Kalau `total` nanti diisi sumber lain (mis. jadwal all-day), pembeda kosong/selesai perlu ditinjau ulang.
- Verifikasi manual browser (akun baru, tanpa jadwal/langkah) BELUM DIVERIFIKASI - butuh dev server + akun kosong di luar timebox T1; perilaku render sudah dikunci test komponen `mountSuspended`.
