# Security review #77 — refresh store setelah pull sync

**Tanggal:** 2026-10-24 · **Reviewer:** Arif (Security Engineer) · **Mode:** READ-ONLY (tidak ada kode produk yang diubah)
**Scope:** `apps/web/app/utils/sync/refresh.ts` (+ test), `events.ts`, `controller.ts`, `ShellSyncStatus.vue`, dan `reload()`/`load()` di 9 composable (`useTasks`, `useSchedules`, `useHabits`, `useGoals`, `useGoalLinks`, `useCountdowns`, `useMemos`, `usePomodoro`, `useAppearancePrefs`).
**Verdict: LOLOS** dari sisi keamanan (0 Critical, 0 High, 1 Medium, 5 Low). Medium-1 bukan kebocoran data, tetapi amplifikasi request/CPU yang saya sarankan diperbaiki di task ini sebelum merge.

---

## 0. Pertanyaan terbuka (jawaban memengaruhi severity, bukan verdict)

1. **Bolehkah `reload()` memakai `localData.ensure()` (yang menulis `status = 'loading'`), atau harus `localData.current()`?**
   - A. **`current()`** (rekomendasi) — reload adalah pembaca, bukan pembuka sesi; `ensure()` sengaja dihindari oleh `ShellSyncStatus` karena alasan yang sama (`ShellSyncStatus.vue:18-20`).
   - B. Tetap `ensure()`, tetapi ubah `ensure()` agar tidak menulis `loading` bila `cached`/`opened` sudah ada.
   - **Default yang saya pakai:** A; temuan Medium-1 saya nilai dengan asumsi ini perilaku tak diinginkan (komentar kode sendiri menyebutnya).
2. **Apakah event `window` adalah kanal yang tepat untuk memicu reload, atau sebaiknya callback in-process?**
   - A. Tetap event (konsisten dengan `SYNC_STATE_EVENT`, dan `ShellSyncStatus` satu-satunya pendengar).
   - B. Panggil `runSyncReloaders()` langsung dari controller (import dinamis), event hanya untuk UI.
   - **Default:** A diterima; konsekuensi (bisa dipalsukan, tanpa payload) sudah ditangani benar — lihat §3.
3. **Bila sesi berganti di tengah `reload()`, apa yang benar: batalkan tulisan state, atau tulis lalu biarkan watcher membersihkan?**
   - A. **Batalkan** (rekomendasi) — cek `localData.current()?.userId === session.userId` sebelum menulis state.
   - B. Biarkan watcher ganti akun yang membersihkan (sekarang: hanya `goalLinks`, `goals`, `appearance` yang punya watcher; task/habit/jadwal/jurnal/countdown/pomodoro tidak).
   - **Default:** A sebagai guard murah (Low-1), karena jalur ganti akun tanpa reload penuh hari ini **tidak terbukti ada** (lihat §4 L1).

---

## 1. Ringkasan risiko & verdict

| # | Severity | Temuan | Status |
|---|---|---|---|
| M1 | Medium | `reload()` memakai `ensure()` → tiap reloader membalik `localData.status` ke `loading` → `plugins/sync.client.ts` memanggil `stopSync()` lalu `attach()` → `startSync` autoStart **pull baru**. Satu event = sampai 9 siklus sync (9× `GET /v1/sync/pull`) | Baru (root cause lama, pemicu baru) |
| L1 | Low | `reload()` menulis state setelah beberapa `await` tanpa memverifikasi sesi masih milik akun yang sama; watcher ganti akun bisa dibatalkan olehnya. Belum ada jalur ganti-akun-tanpa-reload yang bisa direproduksi hari ini | Latent (defense in depth) |
| L2 | Low | Event jendela bisa dipalsukan (tanpa payload — benar) dan **tanpa throttle** → DoS lokal: tiap dispatch = satu putaran baca ulang seluruh store, dan lewat M1 = burst request | Baru |
| L3 | Low | Registry tidak pernah melepas reloader saat komponen unmount/navigasi → reloader halaman lama tetap jalan; closure disimpan permanen. Tidak menahan data user, hanya `useState` + `getSession` | Baru |
| L4 | Low | `reload()` memunculkan banner `status = 'error'` + `cause.message` kapan saja karena data perangkat lain. Isi pesan hanya id record/tipe/nama field skema (bukan plaintext/PII) | Baru (kecil) |
| L5 | Low | `reloadInFlight`/`writeQueue` level modul tidak direset saat ganti akun; antrean tulis yang menggantung membuat reload menunggu selamanya | Baru (kecil) |

**Tidak ada temuan** pada: payload event (nol — benar), registrasi SSR (di-skip, tidak ada state request yang tersimpan), `console.*` (tidak ada), kebocoran secret/`runtimeConfig`, dan injeksi data lewat event.

---

## 2. Threat model singkat (delta dari #76)

- **Aset baru yang bergerak:** plaintext record akun yang sedang terbuka, yang kini dibaca **berulang** (bukan hanya saat muat halaman) dan hasilnya ditulis ke `useState` global.
- **Aktor:** (a) script same-origin — XSS atau extension yang menembak `window.dispatchEvent`; (b) perangkat lain dalam akun yang sama (penulis data remote pemicu reload); (c) pengguna lain di browser yang sama (ganti akun).
- **Trust boundary:** `window` (tidak tepercaya) → `runSyncReloaders()` → storage lokal (terenkripsi, per akun) → `useState` global → UI. Event **tidak** melewati batas data: ia hanya memerintahkan "baca ulang dari sumber kebenaran", dan sumber itu dipilih dari sesi akun aktif (`ensure()`), bukan dari event. Ini keputusan desain yang benar.
- **Properti yang diuji:** (1) event tidak boleh menyuntik data; (2) event tidak boleh membuat UI membaca storage akun lain; (3) event tidak boleh jadi pengganda kerja jaringan/CPU yang tak terkendali; (4) tidak ada plaintext/PII yang naik ke log atau pesan error.

---

## 3. Verifikasi klaim desain (yang memang benar)

| Klaim | Hasil | Bukti |
|---|---|---|
| Event tidak membawa payload | **BENAR** | `events.ts:27-30` (`new Event(name)`), `events.ts:36-39`; listener `onRemoteApplied()` tidak pernah menyentuh argumen (`ShellSyncStatus.vue:68-70`) |
| Event hanya memicu "baca ulang", bukan menulis data | **BENAR** | `runSyncReloaders()` hanya memanggil reloader terdaftar (`refresh.ts:75-99`); semua reloader membaca `session.repos.*.listAll()` |
| Sumber data = akun aktif, bukan data dari event | **BENAR** | Tiap `reload()` memanggil `getSession()` = `localData.ensure()` (`useTasks.ts:176`, `useGoals.ts:174`, `useGoalLinks.ts:74`, dst.), dan `ensure()` memilih `userId` dari sesi server (`useLocalData.ts:101-140`) |
| Pull kosong tidak memicu reload | **BENAR** | `controller.ts:279` (`summary.applied > 0`), dikunci `controller.test.ts:352-366` |
| Siklus basi (stop/ganti akun saat pull) tidak memicu reload | **BENAR** | `controller.ts:272-279` (cek `isStale()` sebelum dispatch), test `controller.test.ts:369-400` |
| Listener dilepas saat unmount, tanpa duplikasi | **BENAR** | `ShellSyncStatus.vue:82,91`, test `ShellSyncStatus.qa.test.ts:96-110` |
| SSR tidak menyimpan state request | **BENAR** | `refresh.ts:58-63` early-return saat `typeof window === 'undefined'`; `runSyncReloaders()` hanya dipanggil dari listener client (`ShellSyncStatus.vue:69`); `readAfterWrites` tidak menyimpan apa pun |
| Tidak ada `console.*` baru | **BENAR** | grep di semua file baru/berubah → kosong |
| Coalescing mencegah antrean reload tanpa batas | **BENAR (untuk satu burst)** | `refresh.ts:75-99`; test `refresh.test.ts:54-76` (3 permintaan = 1 putaran tambahan) |

---

## 4. Temuan

### M1 — `reload()` memakai `ensure()`: tiap store yang reload mematikan lalu menyalakan ulang sync engine

- **Lokasi:** `apps/web/app/composables/useTasks.ts:176`, `useSchedules.ts:137`, `useHabits.ts:288`, `useGoals.ts:174`, `useGoalLinks.ts:74`, `useCountdowns.ts:106`, `useMemos.ts:320`, `usePomodoro.ts:278`, `useAppearancePrefs.ts:217` → semuanya `getSession()` = `localData.ensure`; pemicunya `useLocalData.ts:101-104`; efeknya `apps/web/app/plugins/sync.client.ts:55-74` → `attach()` `:31-41` → `startSync(..., autoStart)` `controller.ts:136`.
- **Fakta berantai (bisa dibaca langsung dari kode, tidak perlu live):**
  1. `ensure()` **selalu** menulis `state.value = { ...state.value, status: 'loading' }` di baris pertama, bahkan ketika sesi sudah terbuka (`useLocalData.ts:104`).
  2. Plugin sync mengawasi `[status, userId, path]` dan, pada `status !== 'ready'`, memanggil `stopSync()` (`sync.client.ts:55-68`). `stopSync()` lokal juga mengosongkan `startingFor` (`:25-29`).
  3. `ensure()` lalu menulis `ready`; watch kedua kali ini memanggil `attach()`, yang memanggil `startSync()` dengan `autoStart` default → `runSync({ pull: true })` (`controller.ts:136`).
  4. Satu event remote-applied menjalankan **semua** reloader yang terdaftar (`refresh.ts:84-92`, serial). Tiap reloader menambah satu pasang `loading`/`ready` → satu siklus sync baru. Halaman `/app` meng-register sekurangnya `appearance` (layout), `goalLinks`, `goals`, `tasks`, `habits`, `schedules`/`countdowns`/`memos`/`pomodoro` sesuai widget — praktisnya 6–9.
- **Dampak (security-relevan, bukan kebocoran):**
  - **Amplifikasi**: satu perubahan dari perangkat lain (atau satu `dispatchEvent` lokal) menghasilkan 6–9 `GET /v1/sync/pull` + siklus push, bukan satu. Setiap `stopSync()` juga meng-abort siklus yang sedang berjalan (`controller.ts:160-167`), sehingga batch push yang belum selesai diulang.
  - **Availability akun**: limiter `sync:pull` 600/jam per akun (`apps/web/server/routes/v1/sync/pull.get.ts:1-20,44`). Script same-origin yang memicu event berulang bisa menghabiskan jatah itu dalam hitungan detik; setelah 429, sinkronisasi user berhenti dan badge `error` sampai jendela limiter lewat. Ini memperbesar dampak Low-2 dari "CPU lokal" menjadi "sync mati sementara".
  - Melanggar invarian yang ditulis sendiri di repo ini: `ShellSyncStatus.vue:18-20` menyatakan pembaca status **tidak boleh** memakai `ensure()` justru karena ia menulis `loading`.
- **Skenario reproduksi (deterministik, tanpa jaringan nyata):** daftarkan dua reloader yang memanggil `ensure()` sungguhan, mount `ShellSyncStatus`, lalu `window.dispatchEvent(new Event(SYNC_REMOTE_APPLIED_EVENT))` dengan `HttpClient` palsu yang menghitung panggilan. Hasil yang diharapkan sekarang: `stopSync` dipanggil ≥1× dan `getJson` dipanggil >1×; yang benar: tepat 1 siklus.
- **Perbaikan minimal (pilih satu):**
  1. Di `reload()` pakai sesi yang sudah terbuka, bukan pembuka sesi:
     ```ts
     const session = localData.current()
     if (session === null) return
     ```
     (untuk opsi injeksi test tetap `options.session ?? (() => localData.current())`); **atau**
  2. Ubah `useLocalData.ensure()` supaya tidak menulis `loading` saat `cached !== null && opened?.userId === userId` (perbaikan akar masalah, juga menghapus churn pada setiap tulis lokal yang sudah ada sebelum task ini).
- **Verifikasi:** test baru di `apps/web/app/plugins/sync.client.test.ts` (belum ada) atau perluasan `ShellSyncStatus.qa.test.ts`: reloader nyata → satu event → `getJson` dipanggil sekali, `stopSync`/`startSync` tidak berulang. Plus regresi: `localData.state.value.status` tidak pernah menjadi `loading` selama reload.

### L1 — `reload()` menulis state tanpa memverifikasi pemilik sesi setelah `await`

- **Lokasi:** `useTasks.ts:170-197`, `useGoals.ts:169-196`, `useGoalLinks.ts:71-88`, `useHabits.ts:277-313`, `useMemos.ts:312-338`, `useSchedules.ts:132-157`, `useCountdowns.ts:101-125`, `usePomodoro.ts:273-300`, `useAppearancePrefs.ts:212-236`.
- **Fakta:** `session` diambil sekali, lalu ada `await readAfterWrites(...)` (menunggu antrean tulis + IndexedDB + dekripsi seluruh tabel) sebelum `tasks.value = ...`/`links.value = ...`/`records.value = ...`. Tidak ada cek bahwa sesi itu masih sesi aktif. Bandingkan dengan pola yang sudah dipakai controller: `isStale()` sebelum **dan** sesudah setiap await besar (`controller.ts:216-221`).
- **Dampak bila jalur ganti-akun-tanpa-reload ada:** state akun A ditulis ke UI akun B. Yang paling jelas: `useGoalLinks` dan `useGoals` punya watcher yang **membersihkan** state saat `localData.state.userId` berubah (`useGoalLinks.ts:88-100`, `useGoals.ts:345-357`), dan reload yang mendarat setelah pembersihan itu **mengembalikan** data akun lama. `reloadInFlight` juga global, jadi reload akun B bisa "menumpang" promise reload akun A (tidak jalan sampai event berikutnya).
- **Catatan kejujuran:** saya **tidak** menemukan jalur ganti akun di satu konteks JS hari ini — logout dan hapus akun sama-sama `navigateTo(..., { external: true })` (`useLogout.ts`, `useAccountDeletion.ts:122`), dan login hanya dari `/login` yang dicapai setelah JS dibuang. Skenario "login akun lain di tab sebelah" juga tidak memperbarui `auth.session` tab ini (`ensureLoaded()` mengembalikan cache; `refresh()` tidak dipanggil di produksi). Jadi ini **latent**, bukan kerentanan hari ini — tapi murah ditutup dan menjaga invarian yang sudah dijaga watcher.
- **Perbaikan minimal:** tangkap `const owner = session.userId`; sebelum menulis state: `if (localData.current()?.userId !== owner) return`. Tambahan: reset `reloadInFlight`/`writeQueue` di watcher ganti akun.
- **Verifikasi:** test gaya `useGoals.accountSwitch.qa.test.ts`: reload dimulai untuk sesi A dengan storage yang ditahan (`withWriteGate`), ganti `localData.state.userId` ke B, lepaskan gate → `goals`/`tasks` harus tetap kosong/milik B, bukan milik A.

### L2 — Event jendela bisa dipalsukan dan tidak di-throttle (DoS lokal + pengganda M1)

- **Lokasi:** `refresh.ts:75-99`, `ShellSyncStatus.vue:68-70,82`.
- **Fakta:** `dispatchEvent` tidak butuh izin; handler tidak membedakan sumber. Coalescing hanya menggabungkan event **selama** satu putaran berjalan (`repeatRequested`); setelah putaran selesai, event berikutnya memulai putaran baru tanpa jeda minimum. Tidak ada payload yang dibaca — jadi tidak bisa menyuntik/merusak data, hanya memaksa kerja.
- **Dampak:** (a) pembacaan ulang penuh + dekripsi semua store per event (CPU/memori; dengan dataset besar, jank); (b) lewat M1, tiap event juga memicu 6–9 request sync. Penyerang yang sudah punya XSS tidak butuh ini (ia bisa membaca data langsung), tetapi dampaknya keluar dari tab (rate limit akun → sync user mati sementara). Extension content-script (isolated world, DOM bersama) bisa memicunya tanpa XSS.
- **Perbaikan minimal:** throttle lokal di `runSyncReloaders()` (mis. satu putaran per 1–2 detik; permintaan di dalam jendela itu digabung) dan/atau pindahkan pemicu ke in-process (`notifyRemoteApplied()` memanggil `runSyncReloaders` lewat import dinamis) sehingga event jendela hanya untuk UI.
- **Verifikasi:** test: 100 dispatch dalam 100 ms dengan reloader yang menghitung panggilan → jumlah putaran ≤ 2.

### L3 — Registry tidak pernah melepas reloader saat halaman berganti

- **Lokasi:** `refresh.ts:46,58-63` (tidak ada `unregister`), pendaftaran di akhir tiap composable (mis. `useTasks.ts:344`).
- **Fakta:** `reloaders` adalah `Map` level modul; tidak ada pembersihan saat komponen unmount atau rute berubah. Reloader dari halaman yang sudah ditinggalkan tetap dijalankan pada setiap pull — bertentangan dengan alasan desain di header modul (`refresh.ts:1-14`: "hanya store yang benar-benar dipakai halaman yang sedang terbuka").
- **Dampak:** kerja tambahan (baca + dekripsi tabel yang tidak ditampilkan) dan closure yang hidup selama sesi tab. Tidak menahan data user: closure hanya menutup `useState` ref dan `getSession`; tidak ada record/session yang ditangkap. Jadi **bukan** kebocoran antar akun, hanya pemborosan.
- **Perbaikan:** kembalikan fungsi `unregister` dari `registerSyncReloader` dan panggil di `onScopeDispose`/`onBeforeUnmount`, atau reset registry saat `route.path` berubah di plugin.

### L4 — Pesan error dari data remote muncul kapan saja di UI (tanpa plaintext)

- **Lokasi:** `useTasks.ts:189-192`, `useGoals.ts:188-191`, `useHabits.ts:305-308`, `useSchedules.ts:149-152`, `useMemos.ts:330-333`, `useCountdowns.ts:117-120`, `usePomodoro.ts:291-295`, `useAppearancePrefs.ts:228-231`.
- **Fakta:** `error.value = cause.message` dan `status = 'error'`. Pesan yang mungkin muncul berasal dari `record-codec.ts:100,107,122,150,160,192`: semuanya memuat **id record (UUID), tipe record, dan nama field skema** — tidak ada isi record/PII. Yang berubah: pesan ini kini bisa muncul di tengah sesi karena record dari perangkat lain (mis. perangkat dengan app lebih baru → "record … dibuat app versi lebih baru"), bukan hanya saat muat halaman.
- **Dampak:** gangguan UX/availability kecil (satu record yang tidak terbaca mengubah seluruh daftar jadi banner error), bukan kebocoran. Sebelumnya pull tetap "sukses" tanpa memberi tahu; sekarang user diberi tahu — secara keamanan lebih baik (tidak menyembunyikan), secara UX perlu diputuskan.
- **Perbaikan (opsional):** bedakan `error` fatal vs "n record tidak bisa dibaca" (pesan generik + jumlah), tanpa id record di UI.

### L5 — State modul (`reloadInFlight`, `writeQueue`) tidak direset saat ganti akun / bisa menggantung

- **Lokasi:** `useTasks.ts:59,84`, `useGoals.ts:57,63`, `useGoalLinks.ts:24,29`, `useMemos.ts:79,87`, dan pola serupa di store lain; `refresh.ts:110-125`.
- **Fakta:** `reloadInFlight` global per store; bila reload A masih berjalan saat akun berganti, `reload()` akun B mengembalikan promise A (tidak memuat apa pun). `readAfterWrites` menunggu `writeQueue` tanpa timeout, sedangkan `writeQueue` bisa menggantung permanen bila satu operasi IndexedDB tidak pernah selesai (transaksi `blocked`) — akibatnya `reload()` tidak pernah mengembalikan hasil dan `reloadInFlight` tidak pernah kembali `null` (store berhenti refresh diam-diam).
- **Dampak:** store bisa berhenti menyegarkan diri tanpa gejala. Availability, bukan kerahasiaan.
- **Perbaikan:** reset `reloadInFlight = null` di watcher ganti akun; beri batas waktu (`Promise.race`) pada penantian antrean tulis di `readAfterWrites`, atau minimal log/diagnostik saat antrean melewati ambang.

---

## 5. Acceptance criteria keamanan untuk implementasi

1. **Event tanpa payload, dan tetap begitu.** Tidak ada listener yang membaca `event.detail`/`CustomEvent` untuk data user. (sudah terpenuhi)
2. **Reload tidak pernah membuka sesi.** `reload()` memakai sesi yang sudah terbuka (`localData.current()`), sehingga tidak ada pembalikan `localData.status` dan tidak ada siklus sync tambahan per reloader (**M1**).
3. **Satu event = satu siklus sync.** Dibuktikan test: satu event remote-applied dengan reloader nyata menghasilkan tepat satu `GET /v1/sync/pull`.
4. **Tidak ada penulisan state lintas akun.** Setiap reloader memverifikasi `session.userId` masih sesi aktif sebelum menulis `useState` (**L1**), dan `reloadInFlight` direset pada ganti akun.
5. **Event jendela tidak bisa dijadikan pengganda tanpa batas.** Ada throttle/jendela minimum, dibuktikan test 100 dispatch (**L2**).
6. **Tidak ada plaintext/PII di pesan error atau log.** Pesan error reload hanya boleh memuat id record/tipe/kode, tidak boleh isi record (**L4** — saat ini terpenuhi, dijaga).
7. **Registry tidak menahan apa pun milik akun.** Closure reloader hanya boleh menutup `useState` ref dan fungsi pembaca sesi (terpenuhi), dan dibersihkan saat scope berakhir (**L3**).
8. **SSR bersih.** `registerSyncReloader` tetap early-return tanpa `window`; tidak ada registry yang terbentuk di server (terpenuhi).

---

## 6. Hardening (non-blocking)

- Pindahkan pemicu reload ke in-process (`notifyRemoteApplied()` → `runSyncReloaders()` lewat import dinamis) dan sisakan event jendela hanya untuk badge status; ini menutup L2 sekaligus memperkecil permukaan yang bisa dipanggil script same-origin.
- Turunkan `SYNC_REMOTE_APPLIED_EVENT` menjadi sinyal **per tipe record** yang berubah (dihitung dari `summary`) supaya halaman hanya me-reload store yang benar-benar terpengaruh — bukan semua yang terdaftar. Ini juga memperbaiki L3 tanpa perlu unregister.
- Saat `pull` menerapkan record, pertimbangkan `BroadcastChannel` (bukan `window` event) untuk koordinasi antar tab: sinyal tidak bisa dipalsukan dari halaman, dan tab lain bisa reload tanpa menunggu pull masing-masing.
- Tambahkan test untuk `plugins/sync.client.ts` (belum ada): status `ready`/`loading`, ganti akun, `import()` yang berjalan saat akun berganti.

---

## 7. Lampiran — perintah yang dijalankan (read-only)

```
git status --short ; git diff ; git diff --stat          # diff lengkap 18 file diubah + 2 file baru
grep -rn "console\." <semua file baru/berubah>            # kosong
grep -rn "SYNC_REMOTE_APPLIED_EVENT|notifyRemoteApplied|runSyncReloaders" apps/web
cd apps/web && pnpm exec vitest run app/utils/sync app/components/features/shell/ShellSyncStatus.qa.test.ts
  → 4 files / 33 tests passed (3.40s)
```

Tidak ada perintah destruktif, tidak ada uji ke sistem live, tidak ada nilai secret yang disalin ke laporan ini. Status Ergonio **tidak** dipindahkan oleh reviewer ini.
