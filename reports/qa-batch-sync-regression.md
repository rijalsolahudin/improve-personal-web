# QA report - batch re-check #76 #77 #78 #79 #80 (regresi 2 commit pasca-QA)

## Verdict

**LULUS DENGAN CATATAN** untuk kelima task: AC aslinya tidak berubah dan area sync/auth tetap hijau.
**1 bug baru (High, B1) berasal dari commit `9d3e3fc`** - deterministik, bukan flaky - sehingga gate
`vitest related` di HEAD merah. Jangan menyatakan "tree hijau" sampai B1 ditutup.

- Tier: T2 · Delta: `useAuthSession.ts`, `usePomodoro.ts`, `useAuthSession.test.ts`,
  `usePomodoro.session-gate.test.ts`, `pages/index.session.test.ts`, `DecoLayer.qa.test.ts` (+2 test lain)
- Gate: `pnpm gate:delta --tier t2 --files ...` -> **FAIL** (85s): prettier PASS 1s, eslint PASS 5s,
  typecheck PASS 16s, **vitest FAIL 63s** (100 file / 526 test lulus, 2 *unhandled error* -> exit 1)
- Catatan penting: `8d82089` **tidak** mengubah `pages/index.vue`, `KeyRecoveryGate`, `RecoveryBackupCard`,
  `DecoLayer` - yang berubah hanya test-nya (timeout/stub). Produksi: hanya `usePomodoro.ts`.

## Acceptance criteria

| AC | Hasil | Bukti |
| --- | --- | --- |
| Sesi belum terbuka saat shell mount: landing tidak menyentuh storage | pass | `vitest run app/composables/usePomodoro.session-gate.test.ts` -> 4/4; `ensure` & `loadFocusSessions` 0 panggilan, status `idle` |
| `current()` vs `ensure()` idempoten + satu request dibagi pemanggil | pass | `useAuthSession.test.ts:31,58` -> `fetch` 1x, `ensureLoaded` kedua tanpa request (`--reporter` 10 file / 68 test) |
| Guard pemilik akun tetap menolak sesi basi setelah pull | pass | `app/utils/sync/refresh.test.ts:180` "sesi dari `current()` ditolak kalau tidak ada sesi terbuka lagi" |
| Event `sync-remote-applied` tetap terkirim + reloader Pomodoro terdaftar | pass | `registerSyncReloader('pomodoro', reload)` di `usePomodoro.ts:475` (di luar gerbang sesi); `refresh.test.ts:151`, `refresh.cross-device.qa.test.ts:177` hijau |
| Dua commit tidak menambah impor statis ke JS awal landing (<= 170 KB) | pass | `bundle-budget.test.ts` 6/6; ukur ulang artefak: **125,90 KB gzip / 19 berkas** (budget 170 KB) |
| Suite terarah sync+auth hijau | pass | `vitest run` 10 berkas: `useAuthSession`, `usePomodoro{,.session-gate}`, `index.session`, `refresh{,.cross-device}`, `controller`, `session-call-count`, `ShellSyncStatus.qa`, `bundle-budget` -> **68 passed, 7.03s** |
| #79 AC8 (budget + gate hijau) | budget pass, gate **fail** | 125,90 KB; artefak build 03:33 > mtime sumber terakhir 03:22 (tidak rebuild, lihat §Risiko) |

## Bug

| # | Severity | Ringkas | Reproduksi | Bukti |
| --- | --- | --- | --- | --- |
| B1 | **High** | `useMemos.failWrite` melempar `TypeError: Cannot read properties of undefined (reading 'memos')` setelah state Nuxt di-`clearNuxtState`; promise antrean tulis (dokumen: "TIDAK pernah reject") jadi unhandled rejection -> `vitest` exit 1 | 1. `cd apps/web && pnpm exec vitest run app/composables/useMemoDraft.test.ts` (HEAD) -> exit 1, 13/13 test lulus, 1 unhandled. 2. Ulang 3x: selalu sama. 3. Kembalikan hanya `useAuthSession.ts` ke `9d3e3fc^` -> exit 0. 4. Kembalikan hanya `usePomodoro.ts` -> tetap exit 1 | `apps/web/app/composables/useMemos.ts:400` (`store.value` undefined), dipanggil `useMemos.ts:442`; pemicu: `resolveGateway()` lazy `import()` di `useAuthSession.ts:62` menambah satu hop async sehingga `failWrite` mendarat setelah `clearNuxtState(['memos'])` di test berikutnya. Preseden guard yang sudah ada: `useMemoDraft.ts:156` |

Severity High: gate/CI merah deterministik + kontrak "antrean tidak pernah reject" jebol. **Tidak**
menyebabkan data-loss yang terlihat user (tidak ada jalur produksi yang memanggil `clearNuxtState`,
biarpun `useMemoDraft.ts:156` memperlakukannya sebagai skenario logout/test). Bukan AC #76-#80 -> §9
rule: #76-#80 tetap lulus, B1 jadi task bug terpisah (pemilik: `dimas`; perbaikan minimal = guard
`store.value?.memos` + jangan biarkan `enqueue` reject).

## Tiga pilar

- **Keamanan:** tidak tersentuh - `inFlight` per instance Nuxt justru menutup kebocoran sesi lintas
  request SSR (`useAuthSession.ts:28`), guard basi (`load()`) mencegah sesi baru ditimpa hasil bacaan lama.
- **Performa:** budget landing 125,90 KB gzip (headroom ~44 KB); chunk gateway/persistence tidak masuk
  modulepreload; typecheck 16s. Tidak ada pengukuran ulang Lighthouse (di luar tier).
- **Kerapian:** prettier + eslint + typecheck PASS; 1 celah test: guard basi `load()` (`useAuthSession.ts:84,90`)
  belum punya test pin - perilaku baru tanpa penjaga regresi (**Low**, non-blocking).

## Sisa risiko / tidak diuji

- Suite penuh / build / Lighthouse tidak dijalankan (T3). Artefak `.output` dipakai apa adanya:
  build 03:33, seluruh sumber delta <= 03:22, jadi budget sah tanpa rebuild - tapi bukan bukti build baru.
- Klaim "suite penuh 215/215 hijau" **tidak tereproduksi** untuk `useMemoDraft.test.ts`: file itu gagal
  sendiri _dan_ di run 100 file, dua kali. Kegagalan bukan flaky-versi-beban.
- Tidak diuji: e2e PWA, SSR smoke `/` `/login`, mobile.
