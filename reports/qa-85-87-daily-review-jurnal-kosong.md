# QA report - batch #85 + #87 (Daily review goal, jurnal tanpa seed)

## Verdict

- **#85 hapus kartu Review goal dari Daily: GAGAL** - AC 1-4 & 6 lulus, AC 5 (PRD konsisten) gagal:
  2 baris PRD masih menjanjikan review di Daily + jawaban masuk jurnal. Tidak ada bug runtime.
- **#87 hapus isian jurnal contoh: LULUS** - semua AC terbukti, gate T2 PASS.
- Tier: #85 T1, #87 T2. Delta #85: `app/pages/app/index.vue`, `app/utils/goals.ts(+test)`,
  `useMemos.test.ts`, `memo.conflict.qa.test.ts`, `i18n/locales/id.json`, `docs/PRD.md`,
  hapus `DailyGoalReviewCard.vue(+qa.test)` | Delta #87: `app/composables/useJournalDay.ts`,
  hapus `app/composables/journal/mock.ts`
- Gate #85: `pnpm gate:delta --tier t1 --files ...` -> prettier PASS 1s, eslint PASS 4s,
  vitest **FAIL** 213 test (1 gagal: `app/components/features/habit/HabitForm.test.ts:72`,
  pre-existing #86, bukan regresi delta ini). Test terarah tanpa file itu: **82/82 PASS**.
- Gate #87: `pnpm gate:delta --tier t2 --files apps/web/app/composables/useJournalDay.ts`
  -> **PASS 47s** (prettier 1s, eslint 3s, vitest 6 file/45 test, typecheck 18s).

## Acceptance criteria

| AC | Hasil | Bukti |
| --- | --- | --- |
| #85.1 kartu + test tidak ada, index.vue bersih | pass | `git ls-files \| grep -E "DailyGoalReviewCard\|composables/journal"` -> none; `DailyGoalReviewCard.vue` & `.qa.test.ts` tak ada; `grep review app/pages/app/index.vue` -> 0; render Daily hanya Header/NowStrip/Priority/Todo/Habit/Schedule |
| #85.2 key i18n yatim hilang, JSON valid | pass | `node -e require(...id.json)` -> valid, `daily` tanpa `goalReview`; `git grep "daily.goalReview"` -> none; `vitest run i18n/locales.test.ts` hijau (bagian dari 82) |
| #85.3 kode mati hilang, tanpa import menggantung | pass | `grep goalReviewTargets\|GoalReviewTarget\|isWeekend apps/web/app/utils/goals.ts` -> 0; typecheck web **PASS** (gate #87, tree sama) |
| #85.4 aksi review & chip tetap ada | pass | `GoalDetail.vue:60` (`extend/shift/close` -> `GoalSection.vue:70-83`); `GoalListCard.vue:45` chip `goals.needsReview`; `goals.test.ts:113-114` hijau |
| #85.5 PRD tidak kontradiktif | **fail** | `docs/PRD.md:1108` "Daily hanya butuh kartu review"; `docs/PRD.md:1165` "Review berkala muncul di Daily ... jawabannya disimpan di jurnal" (F8/F12/F13 sendiri sudah benar) |
| #85.6 test goals/i18n/daily/memo | pass | `vitest run goals{,.parity,.lifecycle,.links}.test.ts i18n/locales.test.ts useMemos memo.conflict useDailyRoutine* dailyWidgets` -> 10 file / **82 passed** |
| #87.1 hari baru kosong, pakai `emptyJournalDay()` | pass | `useJournalDay.ts:26` `store[day] ?? emptyJournalDay()`; `useState('journal-days')` mulai `{}`; `createJournalMock` & folder `journal/` tak ada (`git grep` none) |
| #87.2 seed literal hilang dari produksi | pass | `git grep "Pelan-pelan\|Fokus satu hal dulu\|Makan siang tanpa HP" -- apps/web/app ':!*.test.ts'` -> none (sisa hanya fixture `memo.qa.test.ts:59`) |
| #87.3 isolasi per tanggal (isi A, B kosong, balik A utuh) | pass | test sementara `useJournalDay.qa87.tmp.test.ts` -> **2/2 passed** (word/affirm/reflect/feelingNote/grat/sad/better/intentions; tanggal B tetap berbeda); file sementara dihapus, tree bersih |
| #87.4 test memo/journal + gate | pass | `vitest run app/pages/app/memo*.test.ts app/utils/journal.test.ts` -> 6 file / **40 passed**; gate T2 PASS (di atas) |

## Bug

| # | Severity | Ringkas | Reproduksi | Bukti |
| --- | --- | --- | --- | --- |
| 1 | Medium | PRD masih menjanjikan kartu review Daily + jawaban review masuk jurnal, bertentangan dengan F8/F12/F13 yang sudah dicabut | 1. `grep -n "review" docs/PRD.md` 2. baca baris 1108 & 1165 3. bandingkan dengan F13 `Review Berkala` (657-659) | `docs/PRD.md:1108`, `docs/PRD.md:1165` |

Dampak: PRD jadi sumber kebenaran yang saling bertentangan; developer berikutnya bisa
mengimplementasikan ulang kartu yang baru dicabut. Perbaikan cukup 2 baris dokumen (di luar
wewenang QA). Tidak memblokir runtime.

## Tiga pilar

- **Keamanan:** delta tidak menyentuh auth/input/server; penghapusan seed jurnal hanya mengurangi
  data contoh in-memory. Tidak ada secret/PII baru.
- **Performa:** tidak ada jalur panas berubah; satu komponen (~189 baris) + util review keluar dari
  bundle web. Tidak ada pengukuran angka (AC tidak meminta, T1/T2).
- **Kerapian:** prettier & eslint PASS (delta #85 & #87), typecheck web PASS, dead code
  (`goalReviewTargets`, `GoalReviewTarget`, `isWeekend`, `createJournalMock`) hilang, tidak ada
  `.only`/`.skip`. Sisa: kontradiksi dokumen di bug 1.

## Sisa risiko / tidak diuji

- **#86 pre-existing:** `HabitForm.test.ts` gagal saat dijalankan sendiri (`:72`), muncul di gate
  #85 sebagai 1/213. Bukan regresi #85 (terbukti di-stash developer) dan tidak dijadikan alasan gagal.
- Tidak diuji manual di browser (render Daily/Memo, pindah tanggal lewat UI) - T1/T2 mengandalkan
  test; e2e ada di T3.
- Persistensi jurnal setelah reload tidak diuji: fase 1 masih in-memory (sudah tercatat sebagai
  sisa risiko handoff #87, di luar task).
- Suite penuh, build, Lighthouse tidak dijalankan (T3, instruksi batch).
