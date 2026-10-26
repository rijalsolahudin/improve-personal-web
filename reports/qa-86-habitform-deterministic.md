# QA report - #86 HabitForm.test.ts gagal saat dijalankan sendiri

## Verdict

**LULUS**

- Tier: T1 (test harness web)
- Delta: `apps/web/app/components/features/habit/HabitForm.test.ts` (1 file, +40/-6, test-only)
- Commit: `df844a6` (ancestor HEAD `c2dcf88`; file tidak berubah setelah commit)
- Gate: tidak diulang - handoff T1 PASS (prettier+eslint+vitest 2 file/8 test). QA hanya menambah bukti AC.

## Acceptance criteria

| AC | Hasil | Bukti |
|---|---|---|
| Lulus deterministik saat dijalankan sendiri | PASS | `pnpm exec vitest run app/components/features/habit/HabitForm.test.ts` 3x -> `Tests 5 passed (5)`, exit 0 (2.6-3.0 s) |
| Lulus di suite area, tidak bergantung urutan/konkurensi | PASS | `vitest run app/components/features/habit app/components/features/daily --sequence.shuffle` -> 11 files / 43 tests passed, exit 0 |
| Mock/sesi eksplisit | PASS | `HabitForm.test.ts:43-48` `openSession` di-`mockRejectedValue`; `:82-98` `clearNuxtState([... 'auth-session'*])` + `resetLocalDataSessionForTest()` + `signIn(TEST_USER_A)` - tidak ada jalur jaringan |
| Assertion tidak dilemahkan | PASS | diff `df844a6`: tidak ada baris `expect` yang dihapus; `form` tetap ada + `emitted('saved'/'close')` undefined (`:115-117`), plus assertion baru rollback `useState('habits') === []` (`:119`) |
| Tidak ada perubahan kode produk | PASS | `git show df844a6 --stat` = 1 file test |

## Regresi area terdekat

- Area habit+daily (11 file, 43 test) hijau termasuk shuffle; `HabitForm` varian lain (`HabitForm.goal.qa`, `HabitForm.validation`) tidak berubah.
- Jalur sukses simpan tetap tercakup `useHabits.qa.test.ts` (sesi memori), bukan di file yang di-mock gagal.
- Tidak ada `.only`/`.skip`/test ter-comment di delta.

## Temuan di luar AC (saran task terpisah)

- Mock `~/utils/storage/session` mengganti seluruh modul; `LocalKeyMissingError` lokal (`:46`) berbeda identitas dari aslinya. Aman selama tidak ada `instanceof` lintas modul (tidak ada hari ini), tapi rapuh bila nanti dipakai.
- Jalur "tulis gagal di tengah setelah sesi terbuka" (tidak di awal) belum dicakup file ini - sudah dicatat handoff developer.

## Sisa risiko

- Determinisme bergantung pada `openLocalDataSession` tetap menjadi satu-satunya gerbang buka sesi di `useLocalData`; refactor gerbang itu akan membuat test memuji jalur yang salah tanpa gagal.
