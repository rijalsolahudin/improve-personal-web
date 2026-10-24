# Verifikasi perbaikan security review #77 — reload store setelah pull

**Tanggal:** 2026-10-24 · **Reviewer:** Arif (Security Engineer) · **Mode:** READ-ONLY (tidak ada kode produk yang diubah, tidak ada status Ergonio yang dipindahkan)
**Scope verifikasi:** `apps/web/app/utils/sync/{refresh.ts,events.ts,controller.ts}` + seluruh test barunya, `useLocalData.ensure()`, guard di 9 composable, `plugins/sync.client.ts`, `ShellSyncStatus.vue`, fixture `apps/web/tests/nuxt/local-session.ts`.
**Rujukan temuan lama:** `reports/security-t77-refresh-store.md` (M1, L1, L2, L3, L4, L5).

**Snapshot yang diverifikasi:** `refresh.ts` (mtime 08:17:27), `useLocalData.ts` (08:18:10), `useTasks.ts` (08:18:47), `events.ts` (08:19:48), `controller.ts` (08:22:16). Working tree **sedang diedit** selama verifikasi (lihat §7 catatan proses) — semua angka di laporan ini diambil dari snapshot di atas, dan suite dijalankan ulang setelah edit terakhir.

**Verdict: LOLOS.** M1 **tertutup** (dibuktikan kode + test + pengukuran ulang). L1 **tertutup untuk 9 `reload()`**, tetapi masih ada **satu jalur tulis ke-10 yang tidak dijaga** (Low). L2 **tertutup untuk burst**, tetapi throttle **masih bisa dilewati bila event dikirim saat putaran berjalan** (Low, tanpa amplifikasi jaringan lagi). L3/L4/L5 tetap terbuka → layak jadi task lanjutan `#78`, bukan blocker T77. Tidak ada Critical/High, tidak ada kebocoran data baru.

---

## 0. Pertanyaan terbuka (jawaban memengaruhi severity, bukan verdict)

1. **`isReloadSessionActive()` melewati cek untuk sesi yang BUKAN hasil `current()` (`isOpened === false`). Boleh dipertahankan?**
   - A. **Pertahankan hanya untuk sesi suntikan test** (rekomendasi): tambahkan penanda asal sesi (`'opened' | 'injected'`) dan tetap bandingkan `userId` untuk sesi `fallback` produksi. Bug ini tidak bisa dipicu hari ini, tetapi `fallback` di produksi = `localData.ensure()` (sesi nyata), bukan sesi test.
   - B. Biarkan; anggap `isOpened === false` selalu berarti test.
   - **Default yang saya pakai:** A. Selama B, L1 hanya tertutup untuk jalur `current()`, dan jalur `current() === null` (tepatnya keadaan setelah ganti akun) kembali ke perilaku pra-perbaikan.
2. **Throttle event jendela: cukup "abaikan permintaan kedua dalam 1 detik" (opsi sekarang), atau "putaran maksimum 1 per 1 detik termasuk saat putaran berjalan"?**
   - A. **Batas putaran per jendela waktu, bukan per panggilan** (rekomendasi untuk #78): catat `roundStartedAtMs`, dan di cabang `round !== null` **jangan** menyalakan `repeatRequested` untuk permintaan tak-tepercaya bila putaran berjalan < 1 detik.
   - B. Biarkan: burst sinkron sudah digabung, dan tanpa amplifikasi jaringan dampaknya hanya CPU lokal.
   - **Default:** B untuk verdict (dampaknya Low, tidak menambah request), A untuk rekomendasi.
3. **`useGoalLinks.hydrate(session)` — perlu cek pemilik juga, atau cukup reloader yang dijaga?**
   - A. **Perlu** (rekomendasi): `hydrate()` kini menerima sesi dari luar, jadi ia bisa menulis `links` milik sesi basi. Guard yang sama (`isReloadSessionActive` atau perbandingan `session.userId` ↔ `localData.current()`) harus dipakai sebelum `links.value = ...`.
   - B. Cukup dokumentasikan bahwa pemanggil wajib memegang sesi yang benar.
   - **Default:** A.
4. **Apakah L3/L4/L5 dipindahkan ke `#78` atau ditahan di T77?**
   - Rekomendasi: **pindahkan ke `#78`** (ketiganya Low, tidak menahan data user, dan perbaikannya menyentuh desain registry/watcher yang lebih luas). Catat di deskripsi `#78`.

---

## 1. Ringkasan risiko & verdict

| # | Severity | Temuan | Status |
|---|---|---|---|
| M1 | ~~Medium~~ **Tertutup** | `reload()` → `ensure()` → `loading` → plugin `stopSync`/`attach` → pull baru | **Terverifikasi tertutup** (kode + test + pengukuran) |
| L1a | Low | `useGoalLinks.hydrate(session)` menulis `links`/`hydratedSession` **tanpa** cek pemilik sesi; dipanggil dari `read()` milik task/jadwal/habit | **Baru (regresi halus dari perbaikan)** |
| L1b | Low | `isReloadSessionActive()` meloloskan semua sesi `isOpened === false`; di produksi itu jalur `fallback` (`ensure()`), bukan test | Sisa L1 |
| L2 | Low | Throttle 1 detik **tidak berlaku saat putaran berjalan** → dispatch berulang menahan putaran terus hidup (terukur 81 putaran / 250 ms) | **Tertutup sebagian** |
| L3 | Low | Registry tidak dilepas saat halaman berganti; kini makin lebar karena `useGoals()` mendaftarkan 5 reloader | Tetap terbuka (`#78`) |
| L4 | Low | `error.value = cause.message` saat reload (id record/tipe/nama field skema, bukan plaintext) | Tetap terbuka (`#78`) |
| L5 | Low | `readAfterWrites` menunggu `writeQueue` tanpa timeout; `reloadInFlight` tidak direset saat ganti akun | Tetap terbuka (`#78`) |
| N1 | Nit | Komentar duplikat `useTasks.ts:197-198` | Kosmetik |
| N2 | Nit | `waitForMemosWritesForTest()` diekspor dari modul produk (`useMemos.ts:124`) | Kosmetik |

**Tidak ada temuan** pada: payload event (tetap nol), kemampuan memalsukan `markTrustedSyncReload()` dari halaman, SSR, `console.*` (masih nol), secret/`runtimeConfig`, dan **penulisan storage selama reload** (semua reloader read-only; `appearance` tidak lagi men-seed default saat reload).

---

## 2. Threat model (delta)

- **Aktor tetap:** (a) script same-origin/extension yang bisa `window.dispatchEvent`; (b) perangkat lain dalam akun yang sama (pemicu reload nyata); (c) pengguna lain di browser yang sama (ganti akun).
- **Properti yang diuji ulang:**
  1. Satu event **tidak** boleh menambah siklus sync (M1). → **terpenuhi**.
  2. Event/sesi basi **tidak** boleh menulis data akun lain ke `useState` (L1). → **terpenuhi untuk 9 `reload()`**, belum untuk `hydrate(session)`.
  3. Event tidak boleh menjadi pengganda kerja tanpa batas (L2). → **sebagian** (burst ya, berkelanjutan tidak).
  4. Reload tidak boleh menulis ke storage/kripto baru yang menambah permukaan (mis. membuat kunci). → **terpenuhi**.
- **Batas kepercayaan baru:** `hydrate(session)` — parameter sesi dari pemanggil kini menjadi "batas" yang menentukan akun mana yang datanya masuk `useState`. Batas ini belum dijaga.

---

## 3. Verifikasi klaim perbaikan

| Klaim | Hasil | Bukti |
|---|---|---|
| `ensure()` idempoten: sesi terbuka tidak menulis `state` | **BENAR** | `useLocalData.ts:112-117` (jalur cepat sebelum `state.value = ... 'loading'` di `:119`); test `local-data-ensure.qa.test.ts:61-84` (0 perubahan status, `openLocalDataSession` tidak dipanggil lagi) |
| Ganti akun tetap membuka ulang | **BENAR** | `useLocalData.ts:114` membandingkan `opened.userId` ↔ `auth.session.user.id`, lalu `:133-137` membuang `cached`/`opened` lama; test `local-data-ensure.qa.test.ts:86-98` |
| `reload()` memakai `current()`, `getSession()` hanya fallback | **BENAR** | `refresh.ts:200-209`; dipakai 9 store: `useTasks.ts:189`, `useSchedules.ts:152`, `useHabits.ts:309`, `useGoals.ts:179`, `useGoalLinks.ts:81`, `useCountdowns.ts:119`, `useMemos.ts:334`, `usePomodoro.ts:291`, `useAppearancePrefs.ts:222` |
| Satu event + 4-5 reloader = 0 `ensure()`, 0 perubahan status, 0 pull tambahan | **BENAR (terukur)** | `session-call-count.qa.test.ts:127-178` lulus; `reload-pull-count.qa.test.ts:74-104` (`getJson` tetap 1×). Saya jalankan ulang: 16 file / 87 test lulus 2× |
| Rantai M1 tidak bangkit lewat jalur lain | **BENAR** | Pemindaian semua `ensure(` (grep §7): sisa pemanggil hanya jalur **tulis** (`background`, `enqueue`, `persistHistory`, `useAccount*`, `useBackup*`, `useDevicePairing`, `useKeyRecovery`) dan hydrate awal; tidak satu pun di dalam putaran reload. `goalLinks.hydrate(session)` kini menerima sesi sehingga tidak memanggil `ensure` (`useTasks.ts:119-130`, `useSchedules.ts:95`, `useHabits.ts:222`) |
| `useGoals.reload()` tidak memicu hydrate/store lain | **BENAR** | `useGoals.ts:176-201` hanya `loadGoalRecords` + `rebuild()`; `rebuild()` membaca `useState` (`:92-110`), tidak memanggil hydrate |
| Guard pemilik sesi dipakai 9 store | **BENAR, kecuali satu jalur tulis** | 9 guard ada (`useTasks.ts:199`, `useGoals.ts:188`, `useGoalLinks.ts:87`, `useHabits.ts:318`, `useSchedules.ts:161`, `useCountdowns.ts:128`, `useMemos.ts:343`, `usePomodoro.ts:300`, `useAppearancePrefs.ts:231`); jalur ke-10 = `useGoalLinks.ts:46-58` (lihat L1a) |
| `notifyRemoteApplied()` hanya setelah `applied > 0` & tidak saat stale | **BENAR** | `controller.ts:271-279` + `controller.test.ts:322-400` |
| `markTrustedSyncReload()` tidak bisa dipanggil script same-origin | **BENAR** | Fungsi modul (`refresh.ts:81-88`), bukan API `window`; hanya dipanggil `events.ts:46-53` selama dispatch **sinkron**, lalu `clearTrustedSyncReload()` di `finally`. Event dari halaman tidak membawa penanda; di dev-server pun `import()` URL berbeda menghasilkan instance modul berbeda (penanda tidak nyambung) |
| Pull nyata tidak ditelan throttle | **BENAR** | `refresh.ts:121-130` (tanda tepercaya dikonsumsi saat putaran berjalan → `repeatTrusted`), `:173-177` (putaran susulan dijamin); test `refresh.test.ts:124-149`, `refresh-throttle.qa.test.ts:28-51` |
| Burst event tidak jadi burst putaran | **BENAR (hanya burst sinkron)** | `refresh.test.ts:114-122`, `refresh-throttle.qa.test.ts:53-74`; lihat L2 untuk batasnya |
| Reload tidak menulis storage | **BENAR** | `useAppearancePrefs.ts:209-245` tidak men-seed; store lain hanya membaca (`read`/`apply`); `applyRecord` menyetel `persisted` **sebelum** watcher `theme/style` (`:148-160` vs `:248-253`) sehingga tidak ada tulis balik |
| SSR bersih | **BENAR** | `refresh.ts:96-99` early-return tanpa `window`; tidak ada `useState` request yang tersimpan di registry |

---

## 4. Temuan

### L1a — `hydrate(session)` menulis `useState` lintas akun tanpa cek pemilik (jalur tulis ke-10)

- **Lokasi:** tulis di `apps/web/app/composables/useGoalLinks.ts:46-58` (baris 51-52: `links.value = await loadGoalLinks(active)` lalu `hydratedSession = active`); dipanggil dengan sesi dari luar oleh `useTasks.ts:120`, `useSchedules.ts:95`, `useHabits.ts:222`.
- **Fakta:** `reload()` dijaga (`useGoalLinks.ts:87`), tetapi `read(session)` yang dipanggil **di dalam** reload menjalankan `goalLinks.hydrate(sessionA)` yang **tidak** melewati guard mana pun. Sebelum perbaikan, `hydrate()` tanpa parameter selalu me-resolve sesi lewat `getSession()` **setelah** await, jadi hasilnya mengikuti akun yang aktif. Perbaikan ini menambahkan parameter sesi (agar tidak memanggil `ensure()`), dan konsekuensinya sesi basi bisa dipakai menulis.
- **Skenario (butuh ganti akun A→B di tengah `reload`, yang menurut #77 belum punya jalur nyata di produksi):**
  1. `useTasks.reload()` mengambil `target = sesi A` (`useTasks.ts:189`).
  2. Sebelum `read(sessionA)` jalan (`readAfterWrites` menunggu `writeQueue`), akun berganti ke B; watcher `useGoalLinks` (`:103-112`) mengosongkan `hydratedSession` lalu hydrate ulang untuk B → `hydratedSession = sesi B`.
  3. `read(sessionA)` → `hydrate(sesi A)` → `sesi A !== hydratedSession (B)` → `links.value = tautan akun A`.
  4. Guard di `useTasks.ts:199` **membatalkan** `tasks`, tetapi `goalLinks` (state global, dipakai semua halaman goal) sudah berisi metadata akun A: `id`, `goalId`, `chapterId`, `itemId` (UUID internal, **bukan** judul/isi).
- **Dampak:** metadata relasi item→goal milik akun A tampil di UI akun B; item B bisa tampak "tertaut" ke goal yang tidak ada. Tidak ada isi record/PII. **Naik jadi High bila `#78` (multi-akun/ganti akun in-page) benar-benar menambah jalur ganti akun tanpa reload halaman** — saat itu jalur ini menjadi kebocoran lintas akun yang dapat dipicu.
- **Perbaikan minimal:** di `hydrate()`, setelah `await loadGoalLinks(active)`:
  ```ts
  if (session !== undefined && localData.current()?.userId !== session.userId) return
  ```
  (atau bungkus parameter menjadi `ReloadSession` dan pakai `isReloadSessionActive`). Guard ini tidak boleh berlaku untuk sesi yang memang tidak punya padanan di `current()` (test) — atau lebih baik, pakai varian yang juga membandingkan `userId` (lihat L1b).
- **Verifikasi:** perluas `reload-account-switch.qa.test.ts`: tahan `loadGoalLinks`/`writeQueue` untuk sesi A, `signIn(B)`, lepaskan gate → `goalLinks.links` harus kosong (milik B), bukan tautan A. Saat ini test hanya memeriksa `tasks.tasks`, jadi jalur ini lolos dari pengujian.

### L1b — `isReloadSessionActive()` meloloskan sesi `fallback` (bukan hanya sesi test)

- **Lokasi:** `apps/web/app/utils/sync/refresh.ts:219-226` (`if (!target.isOpened) return true`) berpasangan dengan `:200-209` (`fallback()` dipanggil bila `current()` null).
- **Fakta:** `isOpened === false` **tidak** hanya berarti "sesi suntikan test". Di produksi, `current()` mengembalikan `null` bila `auth.session` kosong **atau** `opened.userId !== auth.user.id` — tepat keadaan setelah ganti akun. Saat itu `reloadSession()` memanggil `localData.ensure()` dan menandai hasilnya `isOpened: false`, sehingga guard sesudah await **dilewati total** untuk sesi nyata.
- **Dampak:** di keadaan transisi ganti akun, tulisan state setelah `await` kembali tidak dijaga (perilaku pra-perbaikan), dan `ensure()` di jalur itu juga menulis `loading` (satu siklus sync) — dapat diterima sebagai "membuka sesi akun baru", tetapi tidak boleh sekaligus mematikan guard. Rantai dua pergantian akun (A→B→C) dalam satu pembacaan akan menulis data B ke UI C.
- **Perbaikan minimal:** bedakan asal sesi. `reloadSession` mengembalikan `{ session, isOpened, isInjected }`, dan `isReloadSessionActive` membandingkan `userId` untuk semua sesi yang bukan `isInjected`.
- **Verifikasi:** test unit `refresh.test.ts`: `reloadSession(currentNull, async () => sessionB)` → `isReloadSessionActive(target, () => sessionC)` harus `false`.

### L2 — Throttle 1 detik hanya berlaku ketika **tidak ada** putaran berjalan

- **Lokasi:** `apps/web/app/utils/sync/refresh.ts:121-130` (cabang `round !== null` menyetel `repeatRequested` **sebelum** cek throttle) dan `:150-181` (`do { ... } while (repeatRequested)` + putaran susulan di `finally`).
- **Bukti terukur (probe read-only pada salinan `refresh.ts` di `/tmp`, dengan `globalThis.window = {}`):**

  | Pola dispatch | Putaran |
  |---|---|
  | 100 dispatch sinkron (seperti test yang ada) | **2** |
  | `setInterval(…, 1)` selama 250 ms dengan reloader 3 ms | **81 putaran / 250 ms** |
  | 1 event per 1,5 s (di atas throttle) | 4 (sesuai harapan) |

  Karena throttle hanya dievaluasi saat `round === null` dan `lastRoundEndedAtMs` baru diperbarui di `finally`, dispatch yang datang **selama** putaran terus menyalakan `repeatRequested`; reloader nyata melakukan I/O IndexedDB (macrotask), jadi timer penyerang punya banyak kesempatan menyisip. Test `refresh-throttle.qa.test.ts:53-74` memakai dispatch sinkron sehingga **tidak bisa** menangkap ini.
- **Dampak:** DoS lokal (CPU + baca/dekripsi semua store terdaftar berkelanjutan), dapat memicu jank/panas baterai. **Tidak ada lagi amplifikasi jaringan**: reload tidak memanggil `ensure()` dan tidak menulis record, jadi tidak ada `GET/POST /v1/sync/*` tambahan dan limiter akun tidak lagi bisa dihabiskan lewat jalur ini (dampak M1 benar-benar hilang). Tidak ada pull nyata yang tertelan (lihat §3).
- **Perbaikan minimal:** catat `roundStartedAtMs`; di cabang `round !== null`, hanya set `repeatRequested` bila `trustedRunPending` **atau** putaran sudah berjalan ≥ `RELOAD_THROTTLE_MS`. Alternatif yang lebih tuntas (hardening #77): pindahkan pemicu ke in-process/BroadcastChannel, sisakan event jendela untuk badge.
- **Verifikasi:** test dengan `setInterval` selama ±300 ms → jumlah putaran ≤ 3 (bukan puluhan).

### L3 — Registry tidak pernah melepas reloader (tetap terbuka)

- **Lokasi:** `apps/web/app/utils/sync/refresh.ts:48` (`Map` level modul), `:95-100` (tanpa `unregister`).
- **Fakta tambahan dari diff:** `useGoals()` (`useGoals.ts:74-77`) membuat `useGoalLinks`, `useTasks`, `useHabits`, `useSchedules` sekaligus → satu halaman goal mendaftarkan **5** reloader, dan `useAppearancePrefs.ts:286` selalu mendaftar. Jadi setiap pull membaca ulang + mendekripsi juga store yang tidak ditampilkan, dan reloader halaman lama tetap hidup setelah navigasi.
- **Dampak:** pemborosan CPU/IO (bukan kebocoran: closure hanya menutup `useState` ref + pembaca sesi). **Non-blocking**, pindahkan ke `#78`.

### L4 — Pesan error dari data remote muncul di UI (tetap terbuka)

- **Lokasi (baru, jalur reload):** `useTasks.ts:206`, `useGoals.ts:196`, `useHabits.ts:325`, `useSchedules.ts:168`, `useMemos.ts:350`, `useCountdowns.ts:135`, `usePomodoro.ts:308`, `useAppearancePrefs.ts:238` — semuanya `error.value = cause.message`.
- **Dampak:** id record (UUID), tipe record, dan nama field skema bisa muncul di banner kapan saja karena data perangkat lain; tidak ada isi record/PII. **Non-blocking** (UX/availability), `#78`.
- **Perbaikan:** pesan generik + jumlah ("n catatan tidak bisa dibaca"), detail hanya ke diagnostik lokal.

### L5 — `writeQueue` tanpa timeout & `reloadInFlight` tidak direset saat ganti akun (tetap terbuka)

- **Lokasi:** `refresh.ts:237-251` (`await pending.catch(...)` tanpa batas waktu; `next`/`read` kedua juga tanpa batas) dan `reloadInFlight` per store (`useTasks.ts:65`, `useGoals.ts:60`, dst.; hanya direset oleh `reset*ForTest`).
- **Dampak:** bila satu transaksi IndexedDB menggantung (`blocked`), reload menunggu selamanya → `reloadInFlight` tidak pernah `null` → store berhenti menyegarkan diri diam-diam (availability). Guard L1 **tidak** memperparah ini karena `finally` selalu membersihkan saat guard abort.
- **Catatan positif:** `reloadInFlight` yang "ditumpang" akun lain kini berakhir (guard abort → `finally`), jadi bagian L5 soal promise tertukar sudah membaik; sisanya soal timeout. `#78`.

---

## 5. Catatan kualitas (bukan temuan keamanan)

- **N1** `useTasks.ts:197-198`: komentar guard tertulis dua kali (duplikat).
- **N2** `useMemos.ts:124`: `waitForMemosWritesForTest()` diekspor dari modul produk; sebaiknya dipindah ke helper test atau diberi nama/komentar tegas (tidak membocorkan apa pun, tetapi menambah API permukaan).
- **Flakiness saat verifikasi:** pada 08:17-08:19 saya melihat 3 kegagalan berbeda (`controller.test.ts:354` hitungan listener 0; `refresh.cross-device.qa.test.ts:212` dan `:266`) dan 1 (`useTasks.test.ts` "reload menunggu tulisan lokal yang belum mendarat"). Penyebab yang saya temukan: working tree sedang diedit bersamaan, termasuk `controller.ts:279` sempat berisi `if (summary.applied > 0 && false as boolean) notifyRemoteApplied()` (kill-switch debug) selama ±10 detik. **Pada snapshot final, 16 file / 87 test lulus dua kali berturut-turut**, jadi tidak ada flakiness yang tersisa yang bisa saya buktikan. Saran proses: jangan men-commit dengan kill-switch; `false as boolean` lolos typecheck dan lint sehingga tidak ada yang menahannya.

---

## 6. Acceptance criteria keamanan (status untuk T77)

1. **Event tanpa payload** — terpenuhi (`events.ts:17-29`), tidak berubah. ✅
2. **Reload tidak pernah membuka sesi** — terpenuhi untuk 9 store (`refresh.ts:200-209` + `useLocalData.ts:112-117`); fallback hanya untuk keadaan tanpa sesi terbuka. ✅
3. **Satu event = satu siklus sync** — terpenuhi dan terukur (`session-call-count.qa.test.ts`, `reload-pull-count.qa.test.ts`). ✅
4. **Tidak ada penulisan state lintas akun** — terpenuhi untuk semua `reload()`; **belum** untuk `hydrate(session)` (L1a) dan sesi `fallback` (L1b). ⚠️
5. **Event jendela tidak bisa jadi pengganda tanpa batas** — terpenuhi untuk burst; **belum** untuk dispatch berkelanjutan (L2). ⚠️ (Low)
6. **Tidak ada plaintext/PII di pesan error/log** — terpenuhi (pesan hanya id/tipe/field), dijaga. ✅
7. **Registry tidak menahan data akun** — terpenuhi (closure hanya ref + pembaca sesi); pelepasan saat navigasi → `#78`. ✅ (L3 non-blocking)
8. **SSR bersih** — terpenuhi. ✅
9. **Reload tidak menulis storage/kripto** — terpenuhi (tidak ada seed/tulis; `appearance` hanya membaca). ✅
10. **Penanda "pull nyata" tidak bisa dipalsukan dari halaman** — terpenuhi (`markTrustedSyncReload` bukan API jendela; hidup hanya selama dispatch sinkron). ✅

---

## 7. Lampiran — perintah yang dijalankan (read-only)

```
git status --short ; git diff ; git diff --stat ; ls -l --time-style=full-iso <file>
grep -rn "ensure(" apps/web/app/composables
grep -rn "localData.current|reloadSession|isReloadSessionActive|registerSyncReloader|markTrustedSyncReload" apps/web/app
grep -rn "goalLinks.hydrate" apps/web/app/composables
grep -rn "console\." <semua file baru/berubah>                      # kosong

# probe throttle (salinan refresh.ts di /tmp/opencode/probe, globalThis.window = {})
node probe.mjs interval    -> rounds = 81   (250 ms, dispatch tiap 1 ms)
node probe.mjs burst       -> rounds = 2    (100 dispatch sinkron)
node probe.mjs idle-gap    -> rounds = 4    (1 event / 1,5 s)

cd apps/web
pnpm exec vitest run app/utils/sync app/components/features/shell/ShellSyncStatus.qa.test.ts \
  app/composables/{useTasks,useSchedules,useMemos}.test.ts \
  app/composables/{useGoals,useTasks}.sync-refresh.qa.test.ts
  -> 16 files / 87 tests passed (dijalankan 2×)
pnpm exec nuxt typecheck        -> EXIT=0
pnpm exec eslint <semua file berubah>  -> EXIT=0
```

Tidak ada perintah destruktif, tidak ada uji ke sistem live/production, tidak ada nilai secret yang disalin ke laporan ini. Status Ergonio **tidak** dipindahkan oleh reviewer ini.
