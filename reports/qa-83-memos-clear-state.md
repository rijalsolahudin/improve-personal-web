# QA report - #83 B1: `useMemos` melempar setelah state Nuxt dibuang

## Verdict

**LULUS DENGAN CATATAN** (0 bug blocking; 1 catatan kerapian Low non-blocking).

- Tier: T2 · Delta: `apps/web/app/composables/useMemos.ts`, `apps/web/app/composables/useMemos.test.ts`
- Gate: `pnpm gate:delta --tier t2 --files ...` -> PASS (43s): prettier 0s, eslint 3s,
  vitest 20 file/159 test, typecheck 16s, exit 0

## Acceptance criteria

| AC | Hasil | Bukti |
| --- | --- | --- |
| 1. Exit code repro = 0 | pass | `cd apps/web && pnpm exec vitest run app/composables/useMemoDraft.test.ts` -> `EXIT_CODE=0`, `Tests 13 passed (13)`, tanpa unhandled |
| 2. Mutation: cabut guard -> test BUG-83 merah | pass | guard `failWrite`+`applyWritten` dikembalikan ke `store.value.memos` (sementara) -> `EXIT_CODE=1`, `Tests 2 failed \| 17 skipped`, `TypeError: Cannot read properties of undefined (reading 'memos')`; restore -> `useMemos.test.ts` `EXIT_CODE=0`, `Tests 19 passed (19)` |
| 2b. Working tree identik sebelum/sesudah mutasi | pass | sha256 `useMemos.ts` `02be2bb6...`, test `df7f2cbc...`, hash diff `a889db52...` sama sebelum & sesudah; `git diff --stat -- apps/web` tetap 2 file |
| 3. Kontrak antrean tidak berubah | pass | 4 file (`useMemos.writefix.qa71`, `useMemos.write.qa`, `useMemoDraft`, `useMemos`) -> `EXIT_CODE=0`, `Test Files 4 passed`, `Tests 54 passed`: promise gagal selesai `false` (bukan reject), draf pemanggil utuh, `hasUnsaved`/`pendingWrites` tercatat selama store hidup |
| 4. Tidak menyentuh jalur auth/pomodoro | pass | `git diff --stat -- apps/web/app/composables/useAuthSession.ts .../usePomodoro.ts` -> kosong; diff apps/web hanya 2 file di atas. (Tree penuh punya 14 file docs/gate #82 milik task lain - bukan delta ini.) |
| 5. Gate t2 PASS | pass | blok gate di atas, exit 0 |
| 6. Kerapian | pass | tidak ada `any`/`@ts-ignore`/`@ts-expect-error`/`eslint-disable`/`.only`/`.skip`/`console.log` baru (grep diff -> NONE); `load()` mati dihapus; komentar guard menjelaskan "kenapa" (BUG-83), bukan "apa" |

## Bug

Tidak ada bug blocking.

| # | Severity | Ringkas | Bukti |
| --- | --- | --- | --- |
| N1 | Low | Guard di `apply()` sekarang tidak terjangkau: dua pemanggilnya sudah `if (!store.value) return` tepat sebelumnya (tanpa `await` di antaranya). Defensif, bukan salah - calon dead code saat refactor | `useMemos.ts:288-292` vs `:319-320`, `:364-367` |
| N2 | Low | `pendingWrites` (module-level, memuat teks jurnal plaintext) tidak dibersihkan eksplisit saat logout; hanya hilang lewat full reload. Sudah di-disclose developer sebagai sisa risiko | `useMemos.ts:104`; mitigasi `useLogout.ts:59` (`navigateTo(..., external: true)`) |

## Tiga pilar

- **Keamanan:** tidak menambah permukaan baru; guard justru mencegah reject/unhandled rejection. Tidak ada secret/log. Catatan N2 (plaintext di memori sampai reload) sudah ada sebelumnya dan terdokumentasi.
- **Performa:** tidak ada perubahan jalur panas; guard O(1) + satu alokasi `Set` yang sudah ada. Angka gate: vitest 24s, typecheck 16s.
- **Kerapian:** prettier/eslint/typecheck PASS lewat gate; test regresi mengunci bug (terbukti merah saat guard dicabut); tidak ada disable/lint escape baru.

## Sisa risiko / tidak diuji

- Skenario "instance basi me-render setelah `clearNuxtState`" (komponen lama masih ter-mount) tidak diuji - butuh env Nuxt/DOM penuh, di luar T2.
- `pendingWrites` sebelum logout: tidak ada test lintas-user dalam satu tab tanpa reload (real logout selalu `external: true`, jadi reload membuang map). Bila nanti logout dibuat SPA, perlu task terpisah.
- IndexedDB nyata dan e2e/PWA tidak dijalankan; itu T3/task payung.
