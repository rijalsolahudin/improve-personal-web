# Security re-review #76 (putaran 2) — sync engine → shell web

**Tanggal:** 2026-10-24 · **Reviewer:** Arif (Security Engineer) · **Mode:** READ-ONLY (tidak ada kode produk yang diubah)
**Scope:** verifikasi perbaikan H1 (identitas per siklus + abort), M2 (baca ulang kandidat setelah `indexFor`), M3 (`'keep'` pada kegagalan index), plus permukaan baru di sekitarnya.
**Verdict: LOLOS** (aman dengan catatan; 0 Critical, 0 High, 2 Medium, 5 Low — tidak ada yang blocking).

---

## 0. Pertanyaan terbuka (jawaban memengaruhi severity, bukan verdict)

1. **Apakah header `x-expected-user-id` boleh tetap opsional selamanya?**
   - A. Tetap opsional (rekomendasi untuk task ini — kompatibilitas klien lama, dan header bukan kredensial).
   - B. Wajibkan untuk sesi `client = 'web'` setelah tanggal cut-off (penutup residu lintas-akun untuk klien lama).
   - **Default yang saya pakai:** A, dengan catatan B dijadikan task lanjutan (Low-3).
2. **Pull harus berhenti total pada setiap `RecordKeyError`, atau hanya kalau satu halaman gagal seluruhnya?**
   - A. Seperti sekarang: satu blob gagal buka = pull berhenti (aman untuk data, tapi bisa macet permanen).
   - B. Berhenti hanya bila seluruh record di halaman gagal (indikasi kunci salah), selain itu `'keep'` per record.
   - **Default:** A diterima untuk putaran ini (trade-off data-safety ditulis eksplisit di kode); B direkomendasikan sebagai hardening (Medium-2).
3. **Berapa browser floor yang didukung?** `mergeSignal` mengorbankan sinyal abort saat `AbortSignal.any` tidak ada (Safari 16–17.3, Firefox ≤123, Chrome ≤115). Kalau floor proyek ≥ Safari 17.4, Medium-1 turun jadi informational.
   - **Default:** tidak ada floor tertulis → saya perlakukan sebagai Medium.
4. **Apakah `touchSession` (UPDATE `last_used_at`) dihitung sebagai "menyentuh data"?** Komentar `server/utils/auth.ts:50-51` mengklaim pemeriksaan header terjadi "sebelum … query DB apa pun". Secara teknis tidak benar (lihat Low-4).
   - **Default:** komentar yang diperbaiki, bukan kode.

---

## 1. Ringkasan risiko & verdict

| # | Severity | Temuan | Status |
|---|---|---|---|
| M1 | Medium | Sinyal abort pemanggil dibuang kalau `AbortSignal.any` tidak ada → `stopSync`/ganti akun tidak benar-benar membatalkan request yang sedang jalan | Baru (bukan regresi H1; integritas tetap dijaga server) |
| M2 | Medium | Satu blob yang gagal dibuka membuat pull berhenti permanen (cursor tidak pernah maju, tanpa jalur pulih di UI) | Konsekuensi desain M3 |
| L1 | Low | Guard yang memenuhi AC (1) & (3) hidup di `plugins/sync.client.ts` yang **tanpa test**; "tidak ada request baru setelah `stopSync`" juga tidak diuji | Gap bukti |
| L2 | Low | Watch auth hanya `stopSync()` tanpa re-attach → setelah sesi auth transien `null` (mis. `refresh()` gagal jaringan), sync bisa tetap mati di rute itu | Baru |
| L3 | Low | Header opsional = klien lama tetap bisa menulis lintas akun (integritas) sampai reload; perlu rencana enforcement | Residu terdokumentasi |
| L4 | Low | Request dengan header salah tidak terkena rate limit (by design) tetapi tetap melakukan query + tulis sesi; klaim komentar "tanpa query DB apa pun" tidak akurat | Klaim berlebih |
| L5 | Low | `record_index` untuk tombstone dibuat ulang oleh pull, sedangkan hapus lokal menghapusnya (`index: null`) → perilaku index tidak konsisten | Baru (kecil) |

Tidak ada temuan pada: kebocoran secret/`runtimeConfig`, PII di log, bundle sync bocor ke rute publik, CSP, flag cookie, CSRF, cache PWA untuk `/v1/**`, dan refleksi header ke respons.

---

## 2. Threat model singkat (fokus yang berubah)

- **Aset:** ciphertext record + metadata (id/hlc/tombstone) di server; data terdekripsi + kunci data di memori tab; `sync_state.cursor`.
- **Aktor:** (a) user yang sama di beberapa tab (cookie ambient), (b) user lain di perangkat/browser yang sama, (c) server/penyusup yang mengontrol ciphertext (bisa mengirim blob rusak), (d) XSS di origin sendiri (di luar jangkauan desain ini).
- **Trust boundary:** tab ↔ jaringan ↔ `requireSession` (cookie) — **batas yang diperbaiki H1**; `pull` ↔ storage lokal (kripto + transaksi); UI ↔ server (`user_id` selalu dari sesi).
- **Sifat kontrol H1:** `x-expected-user-id` **bukan kredensial dan bukan authz**. Nilainya hanya bisa cocok dengan `auth.userId` milik cookie; ia menutup *kesalahan* (tab basi), bukan *penyerang* (klien yang bisa menghilangkan header tetap diproses sebagai sesi cookie-nya sendiri). Ini penting supaya tidak ada yang kelak menganggapnya lapisan otorisasi.

Alur yang diverifikasi: `writeRecord` → `notifyLocalWrite` → debounce `SYNC_DEBOUNCE_MS` → `pushOutbox` (sealed) → `POST /v1/sync/push` (header identitas) → `pullDelta` → `buildIndex` (di luar transaksi) → `runTransaction('sync.pull.merge')` (record + index + cursor).

---

## 3. Verifikasi acceptance criteria putaran 1

| AC | Hasil | Bukti |
|---|---|---|
| (1) Tidak ada request setelah `stopSync`/logout/ganti akun | **PASS** (dengan catatan M1) | `apps/web/app/utils/sync/controller.ts:147-163` melepas listener, clear debounce+interval, `abort.abort()`, `inFlight = null`; `runSync` menolak jalan saat `active === null` (`:175-176`); `execute` putus di setiap batas await (`:216-221`, `:236-253`, `:257`, `:273`). Request in-flight *dibatalkan* hanya bila `AbortSignal.any` ada (M1). |
| (2) Identitas diverifikasi per siklus sebelum request | **PASS** | Klien: `isStale()` sebelum tiap batch push & sebelum pull (`controller.ts:237,257`), header per sesi (`client.ts:67,84`, `controller.ts:95`). Server: `requireExpectedUserId` di baris ke-2 tiap route (`server/routes/v1/sync/push.post.ts:32-33`, `pull.get.ts:36-37`), implementasi fail-closed (`server/utils/auth.ts:55-64`). Client tidak bisa membaca cookie (`HttpOnly`) — jadi verifikasi cookie memang milik server, dan itu memang desainnya. |
| (3) `localData.current() === null` memicu stop | **PASS** (dengan catatan L2) | `plugins/sync.client.ts:55-74` — cabang `status !== 'ready'`, path di luar `/app`, atau `session === null` semuanya `stopSync()`; `attach` memeriksa ulang setelah `import()` (`:36-41`). |
| (4) Tidak ada await non-storage di `runTransaction` + merge recheck | **PASS** | `packages/core/src/sync/pull.ts:181-194` menghitung index & membaca ulang kandidat **sebelum** `runTransaction` (`:199-222`); adapter hanya melakukan operasi store (`apps/web/app/utils/storage/indexeddb.ts:289-327`, lock diambil sebelum transaksi dibuka `:355-401`). Dikunci test `packages/core/src/sync/pull.index-order.qa.test.ts`. |
| (5) Kegagalan index tidak menghapus index lama | **PASS** | `RecordWrite['index']` = `RecordIndexEntry \| null \| 'keep'` (`packages/core/src/ports.ts:47-67`); adapter memori `packages/core/src/adapters/memory.ts:114-122`; IndexedDB `indexeddb.ts:307-317`; kontrak diuji untuk kedua adapter (`packages/core/src/adapters/contract.ts:232-263`). |
| (6) Stop/start idempoten | **PASS** | `stopSync` early-return saat `active === null` (`controller.ts:148-149`); test `controller.test.ts:242-253` (dua stop lalu start lagi tetap sync). |
| (7) Test regresi lulus + tidak ada `console.*` | **PASS** | `pnpm --filter @improve-personal/core test` → 22 file / 379 test lulus; web terarah (`app/utils/sync`, `app/utils/storage`, `app/utils/io`) → 13 file / 104 test lulus; `server/tests/http.test.ts -t x-expected-user-id` → 4 lulus. Grep `console.` di semua file baru/berubah: kosong. |

### 3.1 Apakah test baru membuktikan klaimnya?

| Test | Membuktikan | Catatan |
|---|---|---|
| `packages/core/src/sync/pull.race.test.ts:65-106` (M2) | Ya, mutation-sensitive: tanpa re-cek, `toApply` berisi record remote → `applied=1` dan blob kembali `'AAAAAAAA'`; test menuntut `applied=0`, `skipped=1`, blob `'EDIT-LOKAL'`. Prasyarat `compareHlc(localHlc, remoteHlc) > 0` membuat balapan benar-benar terjadi di jendela `indexFor`. | Kuat. |
| `pull.race.test.ts:110-139` & `:141-157` (M3) | Ya: `'keep'` mempertahankan baris index lama, dan `'keep'` tanpa baris lama tidak mengarang index. | Diuji di adapter memori; adapter IndexedDB lewat contract suite (bukan end-to-end controller). |
| `pull.race.test.ts:159-184` | Ya: `null` tetap menghapus index (membedakan dua nilai). | Bagus — mencegah "perbaikan" yang menyamakan keduanya. |
| `apps/web/app/utils/sync/controller.test.ts:162-186` | Ya: `stopSync` membuat promise siklus resolve `null` dan `signal.aborted === true`. | Membuktikan abort **dengan** `AbortSignal.any` (Node punya). |
| `controller.test.ts:188-217` | Ya: siklus akun B tidak mewarisi `inFlight` A, A di-abort, storage A tidak dibaca lagi. | Bukti kuat untuk RC generasi. |
| `controller.test.ts:219-240` | Ya: client bawaan mengirim `x-expected-user-id` = `session.userId`. | Tidak menguji `mergeSignal`. |
| `controller.test.ts:256-301` | Ya: `RecordKeyError` → tidak ada tulisan + status `error`, cursor tetap 0; skema lebih baru → `index: 'keep'` dan record tetap diterapkan. | Bukti M3 di tingkat controller. |
| `apps/web/server/tests/http.test.ts:818-920` | Ya: cocok → 200; tanpa header → 200 (kompatibilitas); header user lain → 403 `FORBIDDEN`, respons tidak memantulkan nilai, rate-limit user tetap 0, tidak ada baris tertulis; header kosong → 403 (fail-closed). | Klaim "sebelum body di-parse" tidak diuji langsung (tidak bisa diamati dari luar), wajar. |

**Belum dibuktikan test:** `plugins/sync.client.ts` sama sekali (tidak ada `sync.client.test.ts`), termasuk AC (3) dan re-attach setelah akun berganti tanpa reload; "tidak ada request baru setelah `stopSync`" pada level timer/debounce; perilaku `mergeSignal` saat `AbortSignal.any` absen.

---

## 4. Temuan

### M1 — Sinyal abort pemanggil dibuang bila `AbortSignal.any` tidak tersedia

- **Lokasi:** `apps/web/app/utils/sync/client.ts:150-161`.
- **Fakta:** `mergeSignal` mengembalikan `timeout` saja ketika `AbortSignal.any` tidak ada (`:158`). Di browser yang punya `AbortSignal.timeout` tetapi belum punya `AbortSignal.any` (Safari 16–17.3, Firefox ≤123, Chrome ≤115), `stopSync()` **tidak** membatalkan request yang sedang menunggu jaringan — bertentangan dengan klaim di `controller.ts:57-61` dan `:144-146`.
- **Dampak:** request lama berlanjut sampai timeout 20 dtk (atau selesai). Integritas/kerahasiaan **tetap** terjaga karena server menolak header ≠ cookie (403) dan `execute` tidak memakai hasilnya (`isStale()`), tetapi:
  - kuota `sync:push`/`sync:pull` akun baru bisa terpakai oleh request akun lama (mismatch ditolak sebelum limiter, jadi praktis tidak);
  - `pullOutboxId` / baris outbox akun lama tetap ditulis ke DB akun lama (tidak lintas akun);
  - jaminan "logout = tidak ada request yang masih berbicara ke server" tidak lagi benar secara klien.
- **Perbaikan minimal (disarankan):**
  ```ts
  // ganti cabang `return timeout` dengan bridge manual
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  timeout?.addEventListener('abort', abort, { once: true })
  // bila `signal` sudah aborted sebelum dipasang, panggil abort() segera
  return controller.signal
  ```
  (atau naikkan browser floor & hapus fallback yang menyesatkan).
- **Verifikasi:** unit test di `client.test.ts` yang menghapus `AbortSignal.any` (`vi.stubGlobal`/`Object.defineProperty`), fetcher menggantung, lalu `controller.abort()`; harus `rejects` dan fetcher menerima `signal.aborted === true`.

### M2 — Satu blob yang tidak bisa dibuka menghentikan pull selamanya (availability)

- **Lokasi:** `apps/web/app/utils/sync/controller.ts:336-347` (`RecordKeyError` → `throw`), `packages/core/src/sync/pull.ts:181-186` (indexFor di luar try, throw membatalkan halaman), `:221` (cursor hanya maju di transaksi yang sama).
- **Fakta:** semua kegagalan `provider.openRecord` dipetakan ke `RecordKeyError` (`apps/web/app/utils/storage/record-codec.ts:141-154`), dan controller melempar untuk *satu* record pun. Karena cursor tidak maju, siklus berikutnya menarik halaman yang sama dan gagal lagi — selamanya. Tidak ada jalur pulih di UI (`markError` hanya menandai `status='error'`).
- **Dampak:** server (atau blob yang terpotong karena bug tulis) dapat melumpuhkan sync perangkat secara permanen; data **tidak** hilang (tidak ada cursor yang melompati record), tapi user berhenti menerima/mengirim data tanpa cara memperbaiki selain update app/reset.
- **Catatan:** untuk kasus kunci salah, berhenti memang benar (alternatifnya: kehilangan data permanen). Yang kurang adalah pembedaan "satu blob rusak" vs "kunci tidak cocok".
- **Perbaikan (follow-up, non-blocking):** heuristik per halaman — kalau **semua** blob di halaman gagal dibuka, itu kunci salah → berhenti; kalau sebagian, kembalikan `'keep'` + hitung kegagalan, dan tampilkan diagnostik ("n record tidak bisa dibuka") supaya ada jalur tindakan. Alternatif: batas kegagalan beruntun sebelum status `error` permanen + tombol reset cursor eksplisit.
- **Verifikasi:** test di `pull.race.test.ts` dengan dua record (satu `RecordKeyError`, satu sukses) → record sukses tetap diterapkan dan status bukan `error` permanen.

### L1 — Guard AC (1)/(3) tidak punya test; "tanpa request baru setelah stop" tidak diuji

- **Lokasi:** `apps/web/app/plugins/sync.client.ts` (tidak ada test), `controller.test.ts` (tidak ada kasus timer/debounce setelah `stopSync`).
- **Dampak:** aturan paling penting untuk H1 (plugin yang memutuskan attach/stop, termasuk pemeriksaan ulang setelah `import()` di `:36-41`) bisa rusak tanpa satu test pun gagal. Ini risiko regresi, bukan kerentanan hari ini.
- **Perbaikan:** `apps/web/app/plugins/sync.client.test.ts` dengan `mountSuspended`-style atau ekstraksi fungsi murni `shouldAttach({status, path, sessionUserId, localUserId})`; plus satu test controller: dispatch `LOCAL_WRITE_EVENT` → `stopSync()` → majukan timer → `http.postJson`/`getJson` tidak dipanggil.

### L2 — Watch sesi auth hanya berhenti, tidak pernah memasang ulang

- **Lokasi:** `apps/web/app/plugins/sync.client.ts:50-53`.
- **Fakta:** `useAuthSession().load()` men-set `session.value = null` pada **kegagalan apa pun** (`useAuthSession.ts:46-49`), termasuk gangguan jaringan. Watch memanggil `stopSync()` dan tidak mengevaluasi ulang attach. Bila `localData.state` (status/userId) dan `route.path` tidak berubah setelah sesi pulih, sync tidak pernah menyala lagi di rute itu.
- **Dampak:** fail-safe (tidak ada request dengan identitas salah), tapi user bisa diam-diam kehilangan sync sampai navigasi. Bukan masalah kerahasiaan.
- **Perbaikan:** jadikan sumber watch kedua sebagai tuple yang juga memuat id user auth (`[status, localUserId, authUserId, path]`), dan di callback: `stopSync()` lalu `attach` bila `status === 'ready' && path` cocok && `current() !== null`.

### L3 — Header opsional = jalur lintas-akun model lama masih terbuka untuk klien lama

- **Lokasi:** `apps/web/server/utils/auth.ts:47-60`.
- **Fakta:** tanpa header, request diproses normal. Build web lama (tab yang belum reload setelah deploy) tetap mengirim data tab basi ke akun pemilik cookie.
- **Dampak:** integritas akun korban (ciphertext asing yang tidak bisa didekripsi) dan cursor lokal pelaku melompat; **bukan** kebocoran plaintext (E2EE). Diperlukan reload untuk masuk ke build baru.
- **Perbaikan:** begitu mayoritas klien baru, ubah kontrak menjadi wajib untuk sesi `client = 'web'` (mis. `requireExpectedUserId(event, auth, { required: auth.client === 'web' })`), dengan periode cut-off. Catat sebagai task lanjutan + `CHANGELOG`.
- **Verifikasi:** test server: sesi web tanpa header → 400/403; sesi mobile tanpa header → tetap 200.

### L4 — 403 mismatch tidak di-throttle, dan komentar mengklaim lebih dari yang sebenarnya

- **Lokasi:** `server/utils/auth.ts:50-51` ("sebelum rate limit, parsing body, atau query DB apa pun"), route sync memanggil `requireExpectedUserId` sebelum `consumeRateLimit`.
- **Fakta:** `requireSession` → `findSessionByToken` melakukan SELECT join **dan** `touchSession` (UPDATE `last_used_at`, `server/services/session.ts:107-146`). Jadi request dengan header salah tetap = 1 query + 1 tulis DB, berulang tanpa batas limiter.
- **Dampak:** kecil (butuh sesi valid milik sendiri; endpoint tanpa limiter lain juga ada, dan request ini tidak menyentuh `records`). Yang perlu diperbaiki adalah akurasi klaim agar reviewer berikutnya tidak menganggapnya gratis.
- **Perbaikan:** perbaiki komentar; opsional: scope limiter khusus (mis. `sync:mismatch` per user) atau hitung mismatch ke limiter yang sama.
- **Verifikasi:** assert `rateLimitCount` untuk scope mismatch bertambah; komentar disesuaikan.

### L5 — Pull membuat ulang `record_index` untuk tombstone, hapus lokal menghapusnya

- **Lokasi:** `packages/core/src/sync/pull.ts:210` + `controller.ts:325-350` (index dibangun juga untuk `deleted: true`), vs `apps/web/app/utils/storage/record-writer.ts:186-198` (`remove` → `index: null`).
- **Dampak:** `listIndexByType` (dipakai rebuild index di memori / jalur ekspor) berisi record terhapus setelah pull, tapi tidak setelah hapus lokal. Query berbasis rentang tetap menyaring tombstone (`includeDeleted` default `false`), jadi dampaknya kosmetik/konsistensi, bukan kebocoran.
- **Perbaikan:** di `buildIndex`, kembalikan `null` untuk `remote.deleted` (atau `'keep'` bila dekripsi gagal dan record sudah ada) supaya perilakunya sama dengan hapus lokal.
- **Verifikasi:** test `pull.race.test.ts`: pull tombstone → `listIndexByType('todo')` kosong.

---

## 5. Acceptance criteria keamanan untuk implementasi lanjutan

1. **Abort benar-benar mengikat**: untuk setiap pembatalan `stopSync()`, `fetch` menerima `signal.aborted === true` di semua browser target (dibuktikan test tanpa `AbortSignal.any`).
2. **Tidak ada request baru setelah stop**: setelah `stopSync()`, tidak ada `postJson`/`getJson` dari timer/debounce/interval, dibuktikan test dengan fake timer.
3. **Identitas per request**: setiap request `/v1/sync/*` membawa `x-expected-user-id` yang nilainya = pemilik database lokal; tidak ada jalur produksi yang membuat `createSyncHttpClient` tanpa `expectedUserId`.
4. **Guard plugin teruji**: kombinasi (status, userId lokal, userId auth, path) yang berujung attach/stop dikunci unit test, termasuk urutan "akun berganti saat `import()` berjalan".
5. **Kegagalan dekripsi tidak mematikan sync diam-diam**: minimal ada diagnostik ke UI dan/atau heuristik halaman (M2) sebelum status `error` dianggap final.
6. **`'keep'` tidak pernah berubah arti**: `null` = hapus index (pernyataan), `'keep'` = jangan sentuh (ketidaktahuan). Dikunci di contract test kedua adapter.
7. **Tidak ada PII/secret di log**: `RecordKeyError` hanya memuat `record.id`; tidak ada header/token/blob di `OutboxRow.lastError` maupun `sync_state`.
8. **Tidak ada `console.*`** di jalur sync (production build memakai `removeLoggers`).

## 6. Hardening (non-blocking)

- **Enforcement header untuk sesi web** (L3) setelah cut-off, dengan test kompatibilitas mobile.
- **Rate limit mismatch** (L4) atau perbaikan klaim komentar.
- **Reset cursor eksplisit di UI** saat `status='error'` berkepanjangan (jalan keluar dari M2) — sekaligus memenuhi sisa risiko `SYNC_RESET_REQUIRED` yang sudah dicatat QA.
- **Notifikasi lintas tab** (`BroadcastChannel`) untuk "akun berubah" agar tab basi berhenti sebelum request pertama berikutnya, bukan hanya mengandalkan 403.
- **Indikator "sedang sinkron"** terpisah dari `synced` supaya badge tidak berbohong selama pull pertama (UX, sudah dicatat QA).
- **Telemetri kegagalan sinkron** tanpa isi record (kode error + jumlah), supaya M2 bisa didiagnosis tanpa membuka ciphertext.

## 7. Lampiran — perintah yang dijalankan (read-only)

```
pnpm --filter @improve-personal/core test
  → 22 files / 379 tests passed
pnpm --filter @improve-personal/core typecheck            → EXIT 0
apps/web: pnpm exec vitest run app/utils/sync app/utils/storage app/utils/io
  → 13 files / 104 tests passed
apps/web: pnpm exec vitest run server/tests/http.test.ts -t "x-expected-user-id"
  → 4 passed (40 skipped)
apps/web: pnpm typecheck (nuxt typecheck)                 → EXIT 0
apps/web: pnpm exec eslint <file baru/berubah> --max-warnings 0 → EXIT 0
grep console.* pada semua file baru/berubah               → tidak ada
```

Tidak ada perintah destruktif, tidak ada uji ke sistem live, tidak ada nilai secret yang disalin ke laporan ini. Status Ergonio **tidak** dipindahkan oleh reviewer ini.
