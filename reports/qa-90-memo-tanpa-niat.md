# QA report - #90 Hapus kartu "Niat hari ini" dari halaman Memo

## Verdict

**LULUS** (catatan non-blocking di bawah)

- Tier: T2
- Delta: `app/pages/app/memo.vue`, `app/utils/journal.ts` (+test), `app/composables/useJournalDay.ts`, `app/pages/app/memo.qa.test.ts`, `app/utils/guide.ts`, `i18n/locales/id.json`, `docs/PRD.md`; dihapus: 3 komponen `JournalIntention*`
- Gate: `pnpm gate:delta --tier t2 --files ...` -> PASS (40s): prettier PASS 1s (7 file), eslint PASS 3s, vitest PASS 21s (10 file/84 test), typecheck PASS 15s
- Commit `b12244b`, tree bersih saat gate; setelah QA hanya laporan ini yang belum di-commit (file test sementara sudah dihapus).

## Acceptance criteria

| AC | Hasil | Bukti |
| --- | --- | --- |
| 1. Tidak ada sisa niat/kata hari ini | pass | `grep -rnE "JournalIntention\|word-input\|journal\.intentions\|journal\.word\|journal\.leadIn\|intentionsToday\|newIntention\|goalCycle" app i18n` -> 0 baris; `ls app/components/features/journal/` -> hanya 5 komponen non-niat; `git show b12244b -- memo.vue` -> tag + attr `journal-intentions` ikut terhapus; grep repo-wide (tanpa reports/node_modules) juga 0 |
| 2. Kode mati hilang | pass | `journal.ts` (50 baris) tanpa `word`/`intentions`/`INTENTION_*`/`JOURNAL_WORD_MAX`/`nextGoalId`; `useJournalDay.ts:26-34` hanya `day`, `setNote`, `setListItem`; grep `addIntention|updateIntention|removeIntention|Intention` -> 0; typecheck PASS = tidak ada import menggantung |
| 3. Bagian lain tetap jalan & bisa diedit | pass | 82 test hijau termasuk `memo.qa.test.ts` "perasaan + mood, afirmasi, refleksi (3 daftar), dan diary tampil terisi"; test sementara: klik mood, isi cerita perasaan/afirmasi/refleksi/3 daftar -> state `journal-days[TODAY]` berisi 6 field persis (1 file, 1 test PASS, file dihapus) |
| 4. Isian per tanggal | pass | `memo.qa.test.ts:279` "satu isian per tanggal" PASS: isi afirmasi -> `Object.keys(days) = [TODAY]`, pindah tanggal -> isi terpisah, balik -> `'Cukup hari ini'` tetap |
| 5. Data lama (`word`/`intentions`) | pass | test sementara menyemai `journal-days` bentuk lama: halaman render tanpa error, 4 bagian terisi (afirmasi/refleksi/cerita/mood/3 daftar/diary), edit afirmasi tetap 1 tanggal (`Object.keys = [TODAY]`); 1 file/1 test PASS, file dihapus |
| 6. Dokumen | pass | `docs/PRD.md:317-352` F8 = 4 bagian (perasaan, afirmasi, refleksi, diary), tanpa niat/kata; `grep -n "niat" docs/PRD.md` -> hanya `:1081` catatan milestone T11 (sejarah, boleh); `guide.ts:185` copy Journal diganti "catatan bebas, mood, afirmasi, dan refleksi"; grep `niat\|kata hari` di `i18n`+`app` -> hanya komentar "niat user" yang tak terkait |
| 7. Test + gate | pass | `pnpm exec vitest run` 12 file (memo.*, journal, guide*, GuidePage.qa, locales, MemoGoalMention.qa) -> 12 passed / 82 test, 11.27s; gate t2 PASS (lihat atas) |
| 8. Kerapian | pass | `git show b12244b \| grep '^+'` untuk `any`/`@ts-ignore`/`eslint-disable`/`.only(`/`.skip(`/`console.log` -> 0 baris; eslint+prettier via gate PASS |

## Bug

Tidak ada bug blocking.

## Tiga pilar

- **Keamanan:** tidak tersentuh delta ini; guard `v-html`/`innerHTML` di `memo.qa.test.ts:261` tetap PASS.
- **Performa:** tidak ada perubahan jalur panas; delta menghapus 3 komponen (~430 baris) dan 11 key i18n -> bundle hanya mengecil. Tidak ada pengukuran Lighthouse (tidak diminta AC, itu T3).
- **Kerapian:** gate eslint/prettier/typecheck PASS, tanpa simbol mati tersisa, key `journal.*` yang tersisa (12) semuanya dipakai (2 akses dinamis `journal.${kind}`/`journal.list.${key}` di `JournalNote.vue:40,57` & `JournalLists.vue:18`).

## Sisa risiko / tidak diuji

- Catatan non-blocking: komentar docblock `app/pages/app/memo.qa.test.ts:16` masih menulis "5 bagian harian" (seharusnya 4) - kosmetik, tidak memengaruhi test.
- Data lama: field `word`/`intentions` tidak dibuang dari state (hanya tidak dibaca); `setNote`/`setListItem` memakai spread sehingga field lama tetap tersimpan. Tidak merusak, tapi bukan pembersihan migrasi.
- Persistensi `journal-days` masih in-memory (fase 1, di luar scope #90) - reload = kosong; tidak diuji ulang.
- Verifikasi visual browser (posisi kartu setelah niat dicabut, layout dua kolom) tidak dijalankan - tidak ada AC visual; e2e/Lighthouse wilayah T3.
