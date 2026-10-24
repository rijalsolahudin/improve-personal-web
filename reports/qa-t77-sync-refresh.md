# QA T77 — Refresh store setelah pull sync (data lintas perangkat tanpa reload)

**Tanggal:** 2026-10-24 · **QA:** Fajar · **Task:** Ergonio #77 (`5afe7cd8-c0ba-4852-9fdb-07556f281974`)
**Lingkup uji:** delta T77 saja (registry reload, `notifyRemoteApplied`, `reload()` 9 store, `ensure()` idempoten, listener shell) + regresi area sync/composable yang disentuh.
**Mode:** hanya menambah test. Tidak ada kode produk yang diubah (dibuktikan dengan `sha256sum` sebelum/sesudah mutation check).

---

## Verdict

**LULUS** — 6/6 AC terbukti, 0 bug blocking, tidak ada regresi (181 file test / 1267 test hijau, typecheck + eslint + prettier hijau).

Catatan non-blocking (severity Low, di luar AC — silakan jadi task terpisah):

1. `useTasks.ts:197-198` komentar duplikat (kerapian).
2. `reload-pull-count.qa.test.ts` lemah sebagai bukti AC5: tetap hijau walau pemicu reload dicabut (dibuktikan mutation check M2).
3. Registry reload tidak pernah melepas reloader (L3 security review) — kontradiksi kecil dengan alasan desain di header `refresh.ts`.
4. `'deco'` ada di `RELOAD_ORDER` tetapi tidak pernah didaftarkan di produksi (hanya dipakai test sebagai penanda putaran selesai).

---

## 1. Scope & test plan

**Diuji (level integration, bukan hanya baca kode):**

| Area | Cara |
|---|---|
| AC1/AC2/AC3 alur dua perangkat | Dua `StorageAdapter` memori terpisah + satu server palsu di batas `HttpClient`; push/pull memakai controller produksi; listener event = `ShellSyncStatus` asli (`refresh.cross-device.qa.test.ts`, ditambah test QA baru lewat jalur sesi produksi) |
| AC5 (1 event = 1 siklus sync) | `session-call-count.qa.test.ts`: 5 reloader nyata, hitung `ensure()` + transisi `localData.status` |
| AC4 (hydrate tidak regresi) | Suite `app/composables` + `app/utils/sync` penuh, plus test persistence/composable yang sudah ada |
| AC6 (3 pilar) | Baca diff + grep `console`/timer + mutation check |
| Risiko `readAfterWrites` | `useTasks.sync-refresh.qa.test.ts` (tulisan masuk saat pembacaan berjalan) + `useTasks.test.ts`/`useSchedules.test.ts`/`useMemos.test.ts` (antrean tulis ditahan) |
| Risiko urutan `RELOAD_ORDER` / progress goal basi | `useGoals.sync-refresh.qa.test.ts` (dua putaran, angka presentation berubah) |
| Risiko throttle menelan pull nyata | `refresh-throttle.qa.test.ts` (baru, QA): event jendela → pull nyata < 1 dtk; 100 event beruntun |
| Listener menumpuk / timer bocor | `refresh.cross-device.qa.test.ts` (mount/unmount 3×) + `ShellSyncStatus.qa.test.ts` |

**Tidak diuji (dan alasannya):**

- `plugins/sync.client.ts` secara langsung: plugin `.client` tidak dieksekusi environment `nuxt` test (test yang ada memanggil `startSync` manual untuk mensimulasikan pemicu plugin). AC5 karena itu dibuktikan lewat **mekanisme** (nol `ensure()`, nol transisi status) bukan lewat hitungan `GET /v1/sync/pull` sungguhan. Ini juga gap yang dicatat security review (§6).
- Uji jaringan/dua browser sungguhan, Lighthouse, build: di luar tier task ini dan AC tidak menyebut angka performa.
- Mobile: task murni web.

---

## 2. Hasil per acceptance criteria

### AC1 — Tulis todo di A, tampil di B tanpa reload: **PASS**
`refresh.cross-device.qa.test.ts` (sesi suntikan) dan `refresh.cross-device-session.qa.test.ts` (QA baru, sesi lewat `useLocalData.ensure()` + `current()` seperti produksi):
`persistTask(A)` → push → `runSync({pull:true})` di B → `store.tasks` berisi `'Beli susu'` tanpa memuat ulang halaman. Pembacaan storage perangkat B bertambah **tepat 1×** (`repos.todo.listAll`).

### AC2 — Edit dan hapus ikut terlihat: **PASS**
Judul + `done` berubah di A → tampil di B (`'Beli susu oat'`, `done: true`). `removeTask` di A (tombstone) → daftar B kosong. Dua record dalam satu pull tetap **satu** pembacaan (bukan per record).

### AC3 — Pull 0 record tidak memicu pembacaan ulang: **PASS**
Panggilan pull kedua tanpa record baru: `listAll` tetap 1×. Di level controller: `controller.test.ts:352-366` mengunci `applied === 0` → 0 event.

### AC4 — `hydrate()` tidak regresi: **PASS**
Refactor `hydrate()` → `read()/load()/apply()` di tasks/schedules/habits/memos/pomodoro/countdowns/appearance: seluruh test composable + persistence lama hijau (`app/composables` 49 file / 325 test; gabungan `app/utils/sync` + `app/components/features/shell` + `app/composables` = 63 file / 376 test). Tidak ada test lama yang dilemahkan (diff hanya menambah; tidak ada `.only`/`.skip` baru).

### AC5 — Satu perubahan = tepat satu siklus sync tambahan: **PASS (dengan batas alat ukur)**
`session-call-count.qa.test.ts`: 5 reloader terdaftar, satu event → `ensure()` **0×**, transisi `localData.status` **kosong**, `listAll` **1×**. Rantai M1 (`ensure()` menulis `loading` → plugin `stopSync`/`attach` → `startSync` pull) putus di dua titik: `reload()` memakai sesi yang sudah terbuka (`refresh.ts:200-210`) **dan** `ensure()` tidak lagi menulis status untuk sesi yang sudah terbuka (`useLocalData.ts:112-116`).
Mutation check membuktikan angka ini bisa gagal (lihat §5 M1).

### AC6 — Tiga pilar: **PASS**
- **Keamanan:** event `new Event(...)` tanpa payload (`cross-device.qa.test.ts` memeriksa `instanceof Event`, bukan `CustomEvent`, dan isi serialisasinya tidak memuat judul record). Event hanya memerintahkan baca ulang dari storage akun aktif; `isReloadSessionActive()` mencegah tulisan lintas akun setelah `await` (`reload-account-switch.qa.test.ts`). Tidak ada `console.*` baru (grep kosong).
- **Performa:** tidak ada `setInterval`/`setTimeout` baru di `refresh.ts`/`events.ts`/`ShellSyncStatus.vue` (throttle memakai `Date.now()`, bukan timer). Reload tidak menulis `loading` → tidak ada skeleton/kedip; tidak ada request per reloader.
- **Kerapian:** logika muat tidak bercabang — `read/load/apply` dipakai `hydrate` dan `reload` di tasks, schedules, habits, memos, pomodoro, countdowns, appearance; `readAfterWrites`/`reloadSession`/`isReloadSessionActive` satu tempat. Temuan kerapian kecil ada di §4.

---

## 3. Evaluasi desain (risiko yang diminta dicek)

| Risiko | Hasil | Bukti |
|---|---|---|
| `readAfterWrites` melindungi tulisan lokal yang masih mengantre | **Benar.** Menunggu antrean, lalu baca; kalau antrean bertambah selama baca, tunggu dan baca sekali lagi. Dua skenario diuji: tulisan belum mendarat sebelum reload (`useTasks.test.ts`, `useSchedules.test.ts`, `useMemos.test.ts`) dan tulisan mendarat **saat** reload membaca (`useTasks.sync-refresh.qa.test.ts`) | Mutation M4: `readAfterWrites` dicabut → 2 test gagal (`[]` vs `['Baru diklik']`) |
| `reload()` no-op saat `status === 'idle'`: store ter-hydrate tapi `'error'` tidak pulih? | **Tidak ada bug.** Guard hanya `'idle'`; `'error'` tetap direload dan pada sukses kembali `'ready'` + `error=null` (test "reload yang gagal menandai status error" + kode `reload()` tiap store). Store `'loading'` boleh ikut reload (dua pembacaan bersamaan, hasil akhir tetap data storage) | `useTasks.ts:181-183`, `useHabits.ts:292-294`, dst. |
| Urutan `RELOAD_ORDER` & presentation `useGoals` basi satu putaran | **Tidak basi.** `goals.reload()` membangun ulang dari `records` + snapshot lama, lalu watcher `deep` di `useGoals.ts:347-370` menghitung ulang presentation setiap kali tasks/habits/schedules/links berubah; urutan `goals` sebelum sumbernya justru yang membuat watcher itu punya data baru untuk dipakai | `useGoals.sync-refresh.qa.test.ts` (dua putaran reload: `done` false → true) |
| `ensure()` idempoten: ada pemanggil yang mengandalkan transisi `loading`? | **Tidak ada.** grep `'loading'` di `app/**` (non-test): hanya status internal tiap store + `localData`. Konsumen status `localData` (`KeyRecoveryGate`, `PasskeyOnboarding`, `ShellSyncStatus`) hanya peduli `locked`/`ready`; berkurangnya transisi `loading` justru menghilangkan kedip | `useLocalData.ts:112-116`, `local-data-ensure.qa.test.ts` |
| Throttle 1 dtk bisa menelan pull nyata? | **Tidak.** Penanda `markTrustedSyncReload()` hidup hanya selama dispatch; `notifyRemoteApplied()` selalu menyalakannya. Diuji campuran: putaran dari event jendela lalu pull nyata < 1 dtk → 2 putaran. 100 event jendela beruntun → ≤ 2 putaran | `refresh-throttle.qa.test.ts`; mutation M5 (penanda dicabut → test gagal) |
| `reload()` 9 store: lupa `apply()` / menulis sebelum guard | **Benar semua.** Tiap reload melakukan `read` → `isReloadSessionActive()` → baru `apply`/`status='ready'`. `useGoalLinks` juga menaruh guard sebelum menulis `links`/`hydratedSession`. Tidak ada store yang menulis state sebelum guard | diff 9 store + `reload-account-switch.qa.test.ts` |
| Listener `ShellSyncStatus` menumpuk / timer bocor | **Tidak.** Handler `onRemoteApplied` adalah fungsi modul per instance, `add`/`remove` berpasangan; interval lama sudah dibersihkan di `onBeforeUnmount`. Throttle tidak memakai timer, jadi tidak ada timer yang bisa bocor | `refresh.cross-device.qa.test.ts` (3× mount/unmount → reload 1×), `ShellSyncStatus.vue:82,91` |

---

## 4. Temuan (tidak menggagalkan AC)

| # | Severity | Temuan | Bukti |
|---|---|---|---|
| F1 | Low | Komentar duplikat dua baris identik di `reload()` task | `apps/web/app/composables/useTasks.ts:197-198` |
| F2 | Low | `reload-pull-count.qa.test.ts` tidak menjaga klaim yang tersirat dari namanya. Test hanya menghitung `http.getJson`; dengan pemicu reload di controller dicabut, test ini **tetap hijau** (lihat M2) karena `notifyRemoteApplied()` dipanggil manual dan tidak ada asersi bahwa store benar-benar dimuat ulang. Bukti AC5 yang sah ada di `session-call-count.qa.test.ts` | `apps/web/app/utils/sync/reload-pull-count.qa.test.ts:86-103` |
| F3 | Low | Registry reloader tidak punya `unregister`: reloader dari halaman yang sudah ditinggalkan tetap jalan tiap pull, padahal header `refresh.ts` menyatakan "hanya store yang dipakai halaman yang sedang terbuka". Ini L3 security review yang belum ditutup. Dampak: kerja baca+dekripsi tambahan, bukan kebocoran data | `apps/web/app/utils/sync/refresh.ts:48,95-101`; header `:6-9` |
| F4 | Low | `'deco'` ada di `RELOAD_ORDER` (`refresh.ts:45`) tetapi tidak pernah didaftarkan di produksi (`useDeco` memang localStorage-only, `useDeco.ts:17-21`). Di produksi entri ini hanya "lubang" urutan; keberadaannya berguna sebagai penanda akhir putaran di test. Kalau `decoration` (record type sudah ada di `packages/core/src/domain/envelope.ts:31` dan `repository.ts:153`) kelak dipakai UI, halaman akan diam-diam tidak ikut ter-refresh | `refresh.ts:24-45` |
| F5 | Low | `reloadSession(current, fallback)` memprioritaskan `localData.current()` walau store dibuat dengan `options.session` (API khusus test). Di produksi tidak ada pemanggil `options.session`, jadi ini hanya bisa membingungkan test baru yang mencampur sesi nyata + sesi suntikan | `refresh.ts:200-210`; `useGoals.ts:72`, `useTasks.ts:97` |

**Catatan desain (bukan bug, dicatat untuk sisa risiko):** `hydrate()` dan `reload()` bisa berjalan bersamaan bila pull mendarat tepat saat halaman baru membuka store (`status='loading'`). Keduanya membaca storage lalu menulis state; snapshot hydrate yang lebih tua bisa mendarat terakhir dan tampil basi sampai pull berikutnya. Tidak berhasil direproduksi dengan test yang deterministik, jendelanya sempit, dan pull menerapkan data tetap terlihat pada putaran berikutnya.

---

## 5. Mutation check (perbaikan dicabut → test harus gagal)

Setiap mutasi diterapkan satu per satu, test dijalankan, lalu file dikembalikan **dan diverifikasi** dengan `sha256sum` (4 file) + `diff` (`events.ts`).

| # | Mutasi (perbaikan dicabut) | Test yang dijalankan | Hasil |
|---|---|---|---|
| M1 | `reloadSession()` selalu memanggil fallback (`ensure()`), jalur `current()` dimatikan | `session-call-count.qa.test.ts`, `reload-pull-count.qa.test.ts` | **GAGAL** `expected 5 to be +0` (`ensureCalls.count`) — 5 reloader = 5 `ensure()`. `reload-pull-count` tetap hijau (lihat F2) |
| M2 | `if (summary.applied > 0) notifyRemoteApplied()` dicabut di `controller.ts:279` | `refresh.cross-device.qa.test.ts`, `controller.test.ts`, `reload-pull-count.qa.test.ts` | **GAGAL** 3 test: AC1 di B (`[]` vs `['Beli susu']`), event count `0` vs `1`, controller listener `0` vs `1`. `reload-pull-count` tetap hijau (F2) |
| M3 | Jalur cepat `ensure()` (idempoten) dicabut di `useLocalData.ts:112-116` | `local-data-ensure.qa.test.ts` | **GAGAL** `expected ['loading','ready'] to deeply equal []` |
| M4 | `readAfterWrites` diganti baca langsung di `useTasks.reload()` | `useTasks.sync-refresh.qa.test.ts`, `useTasks.test.ts` | **GAGAL** 2 test: toggle hilang (`done` false) dan daftar kosong saat antrean tulis ditahan |
| M5 | `markTrustedSyncReload()` dicabut di `events.ts` | `refresh-throttle.qa.test.ts` (QA baru) | **GAGAL** `expected 2 calls, got 1` — pull nyata tertelan throttle |
| M6 | M2 diulang terhadap test QA baru | `refresh.cross-device-session.qa.test.ts` (QA baru) | **GAGAL** AC1 tidak terpenuhi lewat jalur sesi produksi |

Semua file produk kembali identik: `refresh.ts`, `controller.ts`, `useLocalData.ts`, `useTasks.ts` = `sha256sum -c` OK; `events.ts` = `diff` kosong.

---

## 6. Test yang ditambahkan QA

1. `apps/web/app/utils/sync/refresh-throttle.qa.test.ts` — menutup gap throttle: (a) pull nyata tepat setelah putaran event jendela tidak ditelan, (b) 100 event jendela beruntun ≤ 2 putaran.
2. `apps/web/app/utils/sync/refresh.cross-device-session.qa.test.ts` — AC1–AC3 + M1 lewat jalur **sesi produksi** (`openLocalDataSession` dipalsukan di batas modul → `useLocalData.ensure()`/`current()`), bukan sesi suntikan: tambah/edit/hapus dari A terlihat di B, pull kosong tidak membaca ulang, `openSession` tidak dipanggil lagi dan `localData.status` tidak pernah berubah selama putaran reload.

Tidak ada test yang dihapus/dilemahkan; tidak ada `it.only`/`.skip`.

---

## 7. Perintah & hasil (angka persis)

```
pnpm --filter @improve-personal/web exec vitest run app/utils/sync app/components/features/shell app/composables
  → Test Files  63 passed (63)      Tests  376 passed (376)      21.71s
    (sebelum 2 test QA baru: 61 file / 373 test)

pnpm --filter @improve-personal/web exec vitest run app/composables
  → Test Files  49 passed (49)      Tests  325 passed (325)      13.90s

pnpm --filter @improve-personal/web exec vitest run app
  → Test Files 181 passed (181)     Tests 1267 passed (1267)     43.02s
    (sebelum 2 test QA baru: 179 file / 1264 test)

pnpm --filter @improve-personal/core test
  → Test Files  22 passed (22)      Tests  379 passed (379)       1.19s

pnpm --filter @improve-personal/web typecheck
  → exit 0 (tanpa output)

cd apps/web && pnpm exec eslint app --max-warnings 0
  → exit 0 (tanpa warning)

pnpm exec prettier --check apps/web/app
  → "All matched files use Prettier code style!" (exit 0)
```

`DecoLayer.qa.test.ts` **tidak** flaky pada kedua kali suite penuh (179 dan 181 file): semua hijau. Jadi tidak ada flake lingkungan yang perlu dicatat.

---

## 8. Coverage & celah test yang tersisa

- **Belum ada test langsung untuk `plugins/sync.client.ts`** (pemicu `stopSync`/`attach`). AC5 saat ini dijaga lewat proksi yang kuat (0 `ensure()`, 0 transisi status), tetapi regresi yang mengubah plugin (mis. watch baru yang memanggil `attach` ulang) tidak akan tertangkap. Rekomendasi: test plugin seperti yang diusulkan security review §6.
- **Belum ada test konkurensi `hydrate()` vs `reload()`** (lihat catatan §4). Bila nanti ada laporan "data perangkat lain sempat hilang sesaat saat pindah halaman", mulai dari sini.
- **Belum ada test performa** untuk pull besar (mis. 200 record sekaligus → 1 reload, bukan 200). Secara kode `applied > 0` menjamin satu event per pull, tetapi tidak ada test yang mengunci "1 reload per pull, bukan per record" di level controller (yang ada: 2 record = 1 baca, di level store).
- Reloader yang tidak pernah `unregister` (F3) belum punya test; kalau diperbaiki, tambahkan test yang memastikan reloader halaman lama tidak dipanggil setelah rute berganti.

---

## 9. Sisa risiko

1. **Rotasi akun tanpa reload** (L1 review #77): guard `isReloadSessionActive` hanya aktif untuk sesi dari `current()`. Jalur `fallback ensure()` (sesi belum terbuka) tetap tanpa cek pemilik setelah `await`. Hari ini tidak ada jalur ganti akun tanpa reload yang bisa direproduksi (logout/hapus akun = navigasi penuh), jadi latent.
2. **Beban reload per pull** = satu baca + dekripsi per store yang terdaftar (bisa 6–9 di dashboard). Untuk dataset besar ini kerja nyata di main thread setelah setiap pull yang menerapkan record; belum diukur, dan belum ada pembatasan per tipe record (usulan hardening §6 security review).
3. **Event jendela tetap bisa dipalsukan** (1 putaran/detik). Sudah dibatasi, tetapi tetap merupakan pengganda kerja lokal yang murah. In-process trigger (import dinamis dari controller) belum diambil.
4. **`decoration`/`deco`**: tidak ada konsumen record saat ini; kalau nanti ada, refresh-nya harus ditambahkan manual (F4).

---

## 10. Lampiran — file yang dinilai

Baru: `app/utils/sync/refresh.ts` + `refresh.test.ts`, `local-data-ensure.qa.test.ts`, `session-call-count.qa.test.ts`, `reload-pull-count.qa.test.ts`, `reload-account-switch.qa.test.ts`, `refresh.cross-device.qa.test.ts`, `app/composables/use{Tasks,Goals}.sync-refresh.qa.test.ts`, `tests/nuxt/local-session.ts`.
Diubah: `app/utils/sync/{events,controller}.ts` (+test), `ShellSyncStatus.vue` (+test), `useLocalData.ts`, 9 store (`useTasks`, `useGoals`, `useGoalLinks`, `useHabits`, `useSchedules`, `useMemos`, `useCountdowns`, `usePomodoro`, `useAppearancePrefs`) + `useDeco.ts` (komentar), dan test composable terkait.
Ditambah QA: `app/utils/sync/refresh-throttle.qa.test.ts`, `app/utils/sync/refresh.cross-device-session.qa.test.ts`.

Status Ergonio **tidak** dipindahkan oleh QA ini (menunggu orchestrator).
