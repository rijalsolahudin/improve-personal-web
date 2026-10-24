# QA T79 — pemulihan record terkarantina + sisa risiko sync

**Tanggal:** 2026-10-24 · **QA:** Fajar · **Task:** Ergonio #79 (`3007d685-e313-4c21-a056-f948fc89250b`)
**Commit yang dinilai:** `40a1d96` (`feat(web): pulihkan record terkarantina tanpa menunggu server`), diff `c267a45..HEAD` — 31 berkas, +2.626/−124.
**Mode:** READ-ONLY untuk kode produk. Yang ditambahkan hanya dua berkas test QA (lihat §8).

**Rules dibaca:** `CLAUDE.md` (root), `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,performance,code-quality}.md`. `apps/mobile` tidak disentuh → rules mobile tidak dimuat.

---

## 0. Verdict

# ❌ GAGAL (blocking) — 1 bug blocking

| AC | Hasil |
|---|---|
| AC1 pulih dari blob lokal, tanpa minta server, outbox tidak bertambah | **LULUS** |
| AC2 yang bisa dibuka pulih, sisanya tetap terkarantina & tetap terhitung | **LULUS** |
| AC3 retry otomatis entri >7 hari, sekali per shell, tanpa putaran tanpa jeda | **LULUS** (dengan catatan N1) |
| AC4 tombol "Coba buka ulang" memulihkan + memuat ulang store tanpa reload | **LULUS** |
| AC5 karantina penuh (200) tidak memicu siklus susulan | **LULUS** |
| AC6 `x-expected-user-id` berdasarkan sumber token | **LULUS untuk GET/pull**; jalur push punya celah tersisa → **B2** (Low, non-blocking) |
| AC7 reloader dilepas saat scope hilang, kunci `'deco'` hilang | **LULUS** |
| AC8 tiga pilar: tanpa log/PII, **bundle dalam budget**, typecheck/lint/test hijau | **GAGAL → B1** (bundle 170,82 KB > 170 KB) |

Satu-satunya alasan `Failed`: **B1** — commit ini menaikkan JS awal landing dari **169,92 KB** (lolos, sisa 77 B) ke **170,82 KB** gzip (28 berkas), melewati budget 170 KB yang di `apps/web/.claude/rules/performance.md` §Budget ditulis eksplisit "gagal = blocker merge". Sisanya lulus, termasuk seluruh bukti data-loss/konsistensi/loop yang diminta.

> Catatan tata kelola: MCP `ergonio` **tidak bisa dihubungi** dari sesi saya (`ECONNREFUSED`), jadi saya tidak membaca komentar task maupun menulis komentar. Status tidak saya pindahkan (bukan wewenang QA subagent).

---

## 1. Scope & test plan

**Diuji (delta task):**

| Area | Berkas |
|---|---|
| Reindex dari blob lokal | `app/utils/sync/reindex.ts` |
| Karantina + TTL + antrean due | `app/utils/sync/quarantine.ts` |
| Port `putRecordIndex` (web + memori) | `app/utils/storage/indexeddb.ts`, `packages/core/src/{ports,adapters/*}.ts` |
| Controller: `quarantineFull` (L2) | `app/utils/sync/controller.ts` |
| UI shell: auto-retry, tombol, `blockedCount` | `components/features/shell/ShellSyncStatus.vue`, `composables/useSyncStatus.ts` |
| Pemulihan kunci | `composables/useKeyRecovery.ts` |
| Registry reloader + `'deco'` | `app/utils/sync/refresh.ts`, `composables/useDeco.ts` |
| Server: sumber token | `server/utils/{auth,session-cookie}.ts`, `routes/v1/sync/{pull,push}` |

**Tidak diuji (dan alasannya):** Lighthouse/CWV nyata (AC tidak menyebut angka Lighthouse; budget diukur dari artefak build seperti `bundle-budget.test.ts`), E2E browser (tidak ada harness Playwright di repo ini), mobile (tidak disentuh), sinkronisasi dua perangkat nyata (butuh server + dua klien; perilaku pull sudah ditutup test #78).

**Strategi:** test yang sudah ada dijalankan apa adanya (tanpa melonggarkan assertion), ditambah test QA baru untuk celah yang tidak ditutup: kripto **sungguhan** (libsodium, bukan base64), invarian antrean due, `putRecordIndex` salah-record, dan siklus hidup reloader lewat komponen yang benar-benar unmount.

---

## 2. Perintah & hasil (angka persis)

| # | Perintah | Hasil |
|---|---|---|
| 1 | `pnpm --filter @improve-personal/web exec vitest run app server/tests` (tree sebelum test QA ditambahkan) | **208 berkas, 1.562 lulus, 1 gagal**, 2 expected-fail, 109 s. Satu-satunya merah: `bundle-budget`. |
| 1b | perintah yang sama, tree final (termasuk 2 test QA baru) | **210 berkas, 1.568 lulus, 3 gagal**, 2 expected-fail. Merah: `bundle-budget` + `server/tests/google-oauth.test.ts` + `server/tests/otp.test.ts`. |
| 1c | `vitest run server/tests/google-oauth.test.ts` dan `... otp.test.ts` (dijalankan sendiri) | **6/6 lulus** dan **20/20 lulus** → dua kegagalan di 1b adalah **flake lingkungan** (state DB/rate-limit bersama saat suite paralel), bukan regresi. |
| 2 | `pnpm --filter @improve-personal/core test` | **22 berkas, 384 tes lulus**, 1,01 s. |
| 3 | `pnpm --filter @improve-personal/web typecheck` (`nuxt typecheck`) | **exit 0**. |
| 4 | `pnpm exec eslint app server --max-warnings 0` (di `apps/web`) | **exit 0**. |
| 5 | `pnpm exec prettier --check apps/web/app apps/web/server packages/core/src` | **All matched files use Prettier code style!** |
| 6 | `pnpm --filter @improve-personal/web build` | **exit 0** (`verify-precache OK: 12 entri precache`), total server 8,27 MB / 2,22 MB gzip. |
| 7 | `vitest run app/utils/bundle-budget.test.ts` (sesudah build) | **1 gagal / 6**: `JS awal landing 170.8 KB gzip (28 berkas) melewati budget 170 KB … expected 174919 to be less than or equal to 174080` |

Flake yang sudah diketahui (`DecoLayer.qa.test.ts`, `kalender.test.ts`, `server/tests/http-hardening.test.ts`) **tidak** muncul di dua run saya.

### 2.1 Bukti B1 bukan salah ukur (build bersih, commit pembanding)

Budget ini satu-satunya AC yang butuh artefak, jadi saya ukur ulang dengan `rm -rf apps/web/.output apps/web/.nuxt` sebelum tiap build:

| Tree | Berkas | Byte gzip | Status |
|---|---|---|---|
| `c267a45` (base), build bersih | 27 | **174.003** (169,92 KB) | lolos, sisa **77 B** |
| `c267a45` (base), build bersih ke-2 | 27 | **174.004** | lolos (reproduksi +1 B) |
| `40a1d96` (HEAD), build bersih | 28 | **174.919** (170,82 KB) | **gagal, +839 B** |
| `40a1d96` (HEAD), build bersih ke-2 | 28 | **174.923** | **gagal, +843 B** |

Angka base **sama** dengan yang dilaporkan QA T78 (169,92/169,93 KB), jadi metodologi ukurnya identik dengan yang dipakai tim. Selisih +0,9 KB itu bukan derau (variasi antar-build hanya 4 B): yang berubah persis adalah pemecahan chunk runtime Vue — base memuat satu chunk 30,4 KB, HEAD memecahnya jadi 7,9 KB + 23,3 KB (+3,9 KB chunk kecil), dan jumlah berkas awal naik 27 → 28.

---

## 3. Hasil per acceptance criteria (dengan bukti)

### AC1 — record terkarantina pulih dari blob lokal tanpa meminta ulang ke server ✅

Bukti baru (test QA, kripto **libsodium sungguhan**, `XChaCha20-Poly1305`, AAD = `recordId`):
`app/utils/sync/reindex.recovery.qa.test.ts` → *"index terbentuk dari blob terenkripsi, record & sync_state utuh, outbox tidak bertambah"*.

- Keadaan awal: blob ada di `record`, `record_index` kosong → `queryByRange({entityTypes:['todo']})` **tidak** mengembalikan record.
- Sesudah `reindexQuarantined(session, { dueOnly: false })`: `recovered: 1`, record **muncul kembali** di query berbasis `record_index` (`reindex.recovery.qa.test.ts:224-232`).
- `getRecord()` **deep-equal** dengan sebelum reindex (`hlc`, `blob`, `createdAtMs`, `updatedAtMs` tidak bergeser).
- `getSyncState()` **deep-equal** (`cursor: 42`, `lastPullAtMs`, `lastPushAtMs`, `status`) — tidak ada cursor/lastPull yang bergerak.
- `countOutbox()` tetap **0** (tidak ada push baru; `reindex.ts:92-104` hanya memanggil `putRecordIndex`).
- Test pengembang senada juga lulus: `reindex.test.ts` (9 kasus), `ShellSyncStatus.reindex.test.ts` (*outbox tetap 0*).

### AC2 — setelah pemulihan kunci, yang bisa dibuka pulih; sisanya tetap terkarantina & terhitung ✅

Bukti baru: `reindex.recovery.qa.test.ts` → *"record dengan kunci lama tetap terkarantina, index lamanya tidak dihapus, dan tetap terhitung"*.
Dua record, satu disegel dengan kunci **salah** (menghasilkan `RecordKeyError` asli), satu dengan kunci sesi:

- hasil `{ recovered: 1, remaining: 1 }`;
- record yang bisa dibuka tampil di query, `isQuarantined` false;
- record yang tidak bisa dibuka: `isQuarantined` **true**, `listQuarantined()` panjang **1** → `blockedCount` di UI tetap 1 (tidak hilang diam-diam);
- **baris index lama record itu tidak dihapus** (`toEqual(previousIndex)`) — jalur `null` tidak pernah dipakai (`reindex.ts:89-92` `continue` sebelum menulis).
- Alur composable: `useKeyRecovery.reindex.test.ts` (index terbentuk, karantina bersih, satu siklus diminta) dan `useKeyRecovery.test.ts` (pemulihan gagal tidak menyentuh apa pun) lulus.

### AC3 — entri >7 hari dicoba ulang otomatis sekali per shell, lalu tetap terkarantina ✅ (catatan N1)

- `QuarantineEntry.atMs` + `QUARANTINE_TTL_MS` (7 hari) → `readEntries()` memindahkan entri basi ke `ip-sync-quarantine-due` (`quarantine.ts:173-226,281-282`).
- `ShellSyncStatus.vue:50-90`: `autoReindexQuarantined()` dijalankan sesudah `refresh()`, digerbangi `blockedCount > 0` + sesi terbuka, dan **hanya sekali per mount** (`autoReindexDone`).
- Test pengembang lulus: `ShellSyncStatus.reindex.test.ts` (*"karantina yang SELURUHNYA sudah kedaluwarsa tetap dipulihkan tanpa aksi user"*, *"hanya menyentuh karantina kedaluwarsa, sekali per mount"* — dua `dispatchEvent(SYNC_STATE_EVENT)` tidak menambah putaran, `requestSyncNow` tidak dipanggil).
- **Tidak ada putaran tanpa jeda**: `reindexQuarantined` tidak menyentuh `sync_state`/`outbox`, jadi tidak memicu siklus pull; `notifyRemoteApplied()` (`reindex.ts:113`) hanya memicu `runSyncReloaders` yang sudah di-throttle 1 detik (`refresh.ts:136-153`). Diuji juga oleh `refresh.test.ts` (*burst 20 event saat putaran berjalan → tetap 1 putaran*) dan `refresh-throttle.qa.test.ts` — lulus.
- Catatan **N1** (lihat §5): entri yang *masih* gagal **tidak** dikarantina ulang dengan `atMs` baru — ia tetap di antrean due, sehingga dicoba lagi di **setiap** mount shell (sekali per mount, bukan loop).

### AC4 — tombol "Coba buka ulang" memulihkan + memuat ulang store tanpa reload halaman ✅

`ShellSyncStatus.reindex.test.ts` → *"record kembali muncul di query index, tanpa menambah outbox, lalu satu siklus diminta"*:
klik `button.blocked-retry` → `reindexQuarantined(dueOnly:false)` → record muncul di query, `countOutbox` tetap 0, `requestSyncNow` dipanggil **1×**, dan reloader `tasks` dipanggil **1×** lewat `notifyRemoteApplied()` (event `SYNC_REMOTE_APPLIED_EVENT` ditandai *trusted* sehingga melewati throttle — `refresh.ts:79-89`, `events.ts:39-52`). Tidak ada reload halaman. Lulus.

### AC5 — karantina penuh (200) tidak memicu siklus susulan ✅

`controller.quarantine-recovery.test.ts` → *"karantina baru saat daftar 200 tidak memicu putaran kedua"*: `wasFull` dibaca **sebelum** menulis (`controller.ts:594-595`), siklus susulan tidak dijadwalkan, `http.getJson` dipanggil tepat **3×** (tiga siklus eksplisit saja), status tetap `error`, id tertua terbuang, jumlah tetap 200. Lulus.

### AC6 — `x-expected-user-id` dari sumber token ✅ (GET) / ⚠️ jalur push → B2

- `readSessionToken()` sekarang mengembalikan `{ token, source }` dari fungsi yang **sama** yang memilih token (`session-cookie.ts:83-99`), dan `requireSession` menempelkannya (`auth.ts:35-44`) → tidak ada pembacaan cookie kedua (tidak ada TOCTOU).
- `requireExpectedUserId` (`auth.ts:91-100`): `expected === userId` → lolos; `source === 'bearer'` dan header tidak ada → lolos; selain itu `FORBIDDEN` sebelum rate-limit/body/DB.
- Test pengembang lulus: *"bearer sah + cookie `ip_session` pendek/asing → tetap dilayani tanpa header (A2)"* dan *"bearer sah + cookie VALID milik user lain → cookie menang, tanpa header 403"* (header identitas bearer tetap 403; request dengan header identitas **cookie** dilayani dan record masuk ke akun cookie; rate-limit kedua akun tetap 0).
- Tidak ada pelonggaran: token sesi selalu ≥ 32 karakter (`contracts/src/auth.ts:34,195`), jadi cookie yang "dilewati" memang bukan token sah; cookie panjang tapi bukan sesi → `UNAUTHENTICATED` (fail-closed, tanpa fallback ke bearer).
- **Celah tersisa (B2, Low):** untuk `POST /v1/sync/push` skenario "bearer + cookie pendek" tetap **403** kalau request tidak membawa `Sec-Fetch-Site`/`Origin` — bukan dari authz, tetapi dari middleware CSRF (`server/middleware/10-csrf.ts:63-69`). Test A2 lolos karena helper test menambahkan `sec-fetch-site: same-origin` otomatis saat ada cookie + method mutasi (`server/tests/http.test.ts:146-160`).

### AC7 — reloader dilepas saat scope hilang, `'deco'` hilang ✅

- `refresh.ts:96-111`: `getCurrentScope()` + `onScopeDispose` dengan penjagaan identitas closure (`reloaders.get(key) === reload`).
- Bukti baru (test QA): `app/utils/sync/refresh.scope.qa.test.ts` — komponen yang mendaftar di `setup()` dimount lewat `mountSuspended`, `runSyncReloaders()` memanggilnya 1×, sesudah `unmount()` tetap 1× (**tidak** dipanggil lagi); `RELOAD_ORDER` tidak memuat `'deco'`.
- Test pengembang lulus: `refresh.test.ts` (*melepas reloader saat scope pemiliknya hilang*, *pendaftaran yang lebih baru tidak ikut tercabut*). `grep -rn "'deco'" apps/web/app` → kosong.

### AC8 — tiga pilar ❌ (bundle) / ✅ (log, typecheck, lint, test)

- **Keamanan/log:** tidak ada `console.*`, `debugger`, atau logger baru di seluruh diff (`grep` pada diff `apps/web/app`, `apps/web/server`, `packages/core`); `i18n` hanya menambah label `sync.blockedRetry`, id record tidak pernah ditampilkan (`ShellSyncStatus.reindex.test.ts` mengunci itu). Sepakat dengan review keamanan `reports/security-t79-quarantine-recovery.md` (LOLOS, 0 Critical/High/Medium).
- **Performa:** ❌ **B1** — JS awal landing 170,82 KB gzip > 170 KB (lihat §2.1). Sisa 5 test `bundle-budget` lulus (kompresi `.br`/`.gz`, chunk tunggal ≤ 100 KB, libsodium tidak diimpor statis, precache bersih, SRI font).
- **Kerapian:** `typecheck` exit 0, `eslint --max-warnings 0` exit 0, `prettier --check` bersih, tidak ada `.only`/`.skip` baru.

---

## 4. Bug

### B1 — BLOCKING / High — JS awal landing melewati budget 170 KB (regresi commit ini)

- **Lokasi (jalur yang berubah):** `apps/web/app/utils/sync/refresh.ts:1` (impor statis baru `getCurrentScope`/`onScopeDispose` dari `vue`) — **hipotesis** penyebab, lihat bukti di bawah.
- **Gerbang yang menangkap:** `apps/web/app/utils/bundle-budget.test.ts:121-142`; aturan: `apps/web/.claude/rules/performance.md` §Budget baris "JS initial per route (gzip) ≤ 170 KB" ("gagal = blocker merge").
- **Reproduksi (deterministik, 2× build bersih per tree):**
  ```bash
  git checkout c267a45 && rm -rf apps/web/.output apps/web/.nuxt
  pnpm --filter @improve-personal/web build
  # ukur modulepreload+script index.html gzip-9 -> 174.003 B / 27 berkas  (169,92 KB) = lolos, sisa 77 B
  git checkout 40a1d96 && rm -rf apps/web/.output apps/web/.nuxt
  pnpm --filter @improve-personal/web build
  pnpm --filter @improve-personal/web exec vitest run app/utils/bundle-budget.test.ts
  ```
- **Expected:** ≤ 174.080 B (170 KB) gzip untuk `modulepreload` + `<script>` awal landing.
- **Actual:** **174.919 B (170,82 KB) / 28 berkas** → `expected 174919 to be less than or equal to 174080` (+839 B).
- **Yang berubah:** jumlah berkas awal 27 → 28 dan chunk runtime Vue terpecah (base: satu chunk 30,4 KB; HEAD: 7,9 KB + 23,3 KB) dengan total ~+0,9 KB. Chunk modul baru (`reindex.ts`) **bukan** di jalur awal (ia hanya `prefetch`: `D_ikfriA.js`, dan `sync.reindex` tidak ada di chunk awal), jadi bukan ukuran fitur barunya yang salah — melainkan **pergeseran pemecahan chunk** akibat tepi impor baru ke `vue`.
- **Saran perbaikan (untuk `dimas`):** jangan menambah impor `vue` dari modul yang ikut jalur awal landing. Pilihan: (a) bungkus pelepasan scope di komponen pemilik (mis. helper kecil yang sudah ada di chunk shell), (b) `onScopeDispose` lewat `getCurrentInstance()` yang sudah diimpor modul lain, atau (c) pindahkan registry reloader ke `shallowRef`/modul yang tidak masuk graf landing. Verifikasi ulang dengan perintah di atas — headroom hanya 77 B, jadi perlu turun ≥ ~0,9 KB.

### B2 — Low (non-blocking) — AC6 jalur push tetap 403 untuk klien bearer tanpa Fetch Metadata

- **Lokasi:** `apps/web/server/middleware/10-csrf.ts:63-69` (menentukan "kredensial ambient" dari **keberadaan** cookie), berpasangan dengan `auth.ts:96-100` yang sekarang memakai **sumber token**. Ditutupi oleh `apps/web/server/tests/http.test.ts:146-160` yang menambahkan `sec-fetch-site: same-origin` otomatis saat ada cookie + method mutasi.
- **Reproduksi** (probe sementara, sudah dihapus setelah dicatat):
  ```ts
  // sesi mobile sah, cookie asing pendek, tanpa Sec-Fetch-Site/Origin
  await fetch(url('/v1/sync/push'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'ip_session=abc',
               authorization: `Bearer ${token}` },
    body: JSON.stringify({ records: [/* … */] }),
  })
  ```
  Hasil terukur: `pushTanpaBukti: 403`, `pushDenganBukti: 200`, `pull: 200`.
- **Expected (AC6):** 200 tanpa header.
- **Actual:** push 403 dari CSRF, bukan dari authz. Efeknya hanya untuk klien non-browser yang membawa cookie `ip_session` pendek/asing + tidak mengirim Fetch Metadata — kombinasi yang jarang (mobile normalnya tanpa cookie jar). **Tidak ada pelonggaran keamanan** (fail-closed) dan tidak ada percampuran akun; sama dengan temuan L1 di `reports/security-t79-quarantine-recovery.md`. Karena AC utama (pull/GET) lulus dan ini tidak melemahkan kontrol, saya masukkan sebagai temuan non-blocking yang sebaiknya ditutup task terpisah: pakai `auth.source` (atau `readSessionToken`) di middleware CSRF juga.

---

## 5. Catatan & sisa risiko (non-blocking)

| # | Sev | Temuan | Bukti | Saran |
|---|---|---|---|---|
| N1 | Low | Entri **due** yang masih gagal **tidak dikarantina ulang** dengan `atMs` baru: `reindexQuarantined()` hanya `continue` (`reindex.ts:95-102`) dan hanya melepas yang pulih (`:108`), jadi id tetap di antrean due dan **didekripsi ulang di setiap mount shell**. Tidak ada loop tanpa jeda (1×/mount, `AutoReindexDone`), dan tetap terhitung di UI. | test QA *"entri due yang masih gagal dibuka tetap terkarantina dan tetap dihitung tepat sekali"*: dua kali `reindex` = dua kali percobaan dekripsi, `remaining` tetap 1, `dueIds` tetap 1 | kalau ingin persis AC3: setelah percobaan gagal, pindahkan id kembali ke daftar utama dengan `atMs = now` (atau simpan penghitung percobaan per entri). |
| N2 | Low | Saat daftar menyentuh `QUARANTINE_MAX_RECORDS`, id **tertua dibuang** dan tidak dipindahkan ke antrean due (`quarantine.ts:139-166`) → record itu tidak tampil **dan** tidak lagi dihitung/`pernah dicoba ulang`. Perilaku lama, tapi sekarang ada tempat yang lebih tepat untuk menampungnya. | test pengembang AC5: `isQuarantined('old-0') === false` setelah 200 penuh | buang ke antrean due, bukan dibuang. |
| N3 | Low | Kalau penulisan antrean due gagal (kuota penuh), `readOwners()` mengembalikan peta **tanpa** id yang kedaluwarsa sementara `writeOwners()` sengaja dilewati (`quarantine.ts:281-282`) → `blockedCount` sesaat bisa **0** padahal ada record tak tampil. Id-nya sendiri **tidak hilang** dari `localStorage` (aman, dicoba lagi saat kuota lega). | test QA *"antrean due yang gagal ditulis tidak membuat id hilang dari penyimpanan"* | kembalikan id kedaluwarsa ke hasil `readOwners()` saat `appendDue` gagal (tandai `isDue: true`). |
| N4 | Info | `reloaders` adalah `Map` per kunci: kalau halaman B mendaftar lebih dulu lalu unmount, entri bisa hilang walau halaman A yang lebih lama masih hidup (A tidak menerima reload sampai mount ulang). Tidak ada data hilang; hanya reload tertunda. | `refresh.ts:96-111` | kalau perlu, simpan `Set` per kunci atau rujuk `getCurrentInstance()` sebagai pemilik terakhir. |
| N5 | Info | `reindexQuarantined` memakai `session.clock.nowMs()` untuk `updatedAtMs` index, dan `putRecordIndex` menimpa `updatedAtMs` index lama. Aman hari ini (`compareIndexEntries` mengurutkan `rangeStartMs`), tapi jangan dijadikan dasar urutan tampilan. | `reindex.ts:76,130-135`, `repository/index-entry.ts` | dokumentasi singkat di `ports.ts` sudah cukup. |

**Data-loss yang dicari khusus (hasil: tidak ada):**
- index untuk record **salah** → `putRecordIndex` menimpa `recordId` dengan argumen (`indexeddb.ts:337-352`, `memory.ts:142-156`); test QA baru mengunci: entri dengan `recordId` asing tetap tersimpan di bawah ID yang diperiksa.
- baris **yatim** → `count()`/`has()` di dalam transaksi yang sama; test QA baru: `putRecordIndex` untuk record yang tidak ada = no-op, `listIndexByType` kosong (kontrak core juga menguji ini untuk kedua adapter).
- index lama **terhapus padahal harus dipertahankan** → reindex tidak pernah mengirim `null`; test QA: `previousIndex` utuh setelah `RecordKeyError`.
- **rollback** saat transaksi gagal → kontrak core `contract.ts` "perubahan index ikut rollback kalau transaksi gagal" (dijalankan untuk adapter memori **dan** IndexedDB/fake-indexeddb), lulus.
- `record`/`sync_state` **berubah** setelah reindex → dibuktikan deep-equal di test QA AC1.

---

## 6. Mutation check (3 mutasi, semua tertangkap)

| # | Mutasi (kode produk, dikembalikan dengan `git checkout --`) | Hasil |
|---|---|---|
| a | `reindex.ts:96-98` — panggilan `tx.putRecordIndex(...)` dimatikan | **6 gagal / 14** (`reindex.test.ts` + `reindex.recovery.qa.test.ts`): record tidak muncul lagi di query, `recovered` tidak sesuai. |
| b | `reindex.ts:108` — `releaseQuarantined(...)` dihapus | **10 gagal / 17** di 3 berkas (`reindex*.test.ts` + `ShellSyncStatus.reindex.test.ts`): `blockedCount` tidak turun, tombol tidak hilang, `isQuarantined` tetap true. |
| c | `refresh.ts` — `'deco'` dikembalikan ke `RELOAD_ORDER` **dan** blok `onScopeDispose` dihapus | **3 gagal / 18** (`refresh.test.ts` + `refresh.scope.qa.test.ts`): reloader halaman lama tetap dipanggil sesudah unmount, `RELOAD_ORDER` memuat `'deco'`. |

Sesudah tiap mutasi, `git status` bersih untuk berkas produk (hanya 2 test QA + report ini yang untracked).

---

## 7. Cek tiga pilar (checklist rules)

**Keamanan (`apps/web/.claude/rules/security.md`):**
- [x] Tidak ada secret/PII baru di bundle atau `localStorage` (isi karantina: userId + UUID record + `atMs`; `quarantine.ts:36-38,60`).
- [x] Tidak ada log/analytics baru; pesan error kripto tidak menyebut id ke UI (`reindex.ts:130-140` menelan error).
- [x] Authz tetap per-sumber-token; tidak ada jalur lintas-akun baru (reindex tidak menyentuh jaringan; id akun lain = no-op).
- [x] Tidak ada `v-html`, cookie/auth berubah hanya di `readSessionToken`.
- [ ] **Catatan:** definisi "kredensial ambient" belum seragam antara authz dan middleware CSRF → B2 (Low).

**Performa (`apps/web/.claude/rules/performance.md`):**
- [ ] ❌ **JS awal landing 170,82 KB > 170 KB → B1 (blocking).**
- [x] Chunk tunggal ≤ 100 KB; libsodium tetap tidak diimpor statis; tidak ada dependency baru.
- [x] Reindex hanya berjalan saat dibutuhkan (gerbang `blockedCount`, sekali per mount) dan tidak memblokir render.
- [x] Tidak ada `$fetch` baru, tidak ada waterfall; reindex = N transaksi `putRecordIndex` (1 per record, `strict`) — biaya wajar untuk aksi lokal, tercatat N5/Arif I5.

**Kerapian (`apps/web/.claude/rules/code-quality.md`):**
- [x] `typecheck`, `eslint --max-warnings 0`, `prettier --check` hijau.
- [x] Nama/folder sesuai konvensi (`sync/reindex.ts`, `sync/quarantine.ts`), komentar menjelaskan "kenapa".
- [x] Tidak ada `any`/`@ts-ignore`/`eslint-disable` baru; tidak ada dead code (`'deco'` dibersihkan dari tipe + urutan).
- [x] Ada test untuk tiap perilaku baru (7 berkas test baru dari pengembang: `reindex`, `quarantine.due`, `controller.quarantine-recovery`, `useKeyRecovery` ×2, `ShellSyncStatus.reindex`, `ShellSyncStatus.blocked.qa` + 2 berkas QA); tidak ada `.only`/`.skip`.

---

## 8. Berkas test yang ditambahkan QA

| Berkas | Isi | Status |
|---|---|---|
| `apps/web/app/utils/sync/reindex.recovery.qa.test.ts` | 8 tes: AC1 + AC2 dengan **libsodium sungguhan**, isolasi akun lain, `putRecordIndex` salah-record/yatim, invarian antrean due (dobel, gagal berulang, kuota gagal) | **8/8 lulus** |
| `apps/web/app/utils/sync/refresh.scope.qa.test.ts` | 2 tes: reloader dilepas saat komponen pemilik unmount (`mountSuspended`), `RELOAD_ORDER` tanpa `'deco'` | **2/2 lulus** |

Tidak ada berkas produk yang diubah; probe server untuk B2 sudah dihapus (hasilnya dicatat di §4).

---

## 9. Rekomendasi

1. **Wajib (blocking):** turunkan JS awal landing ≥ 0,9 KB (B1). Headroom hanya 77 B, jadi perbaikan kecil pun bisa langsung merah lagi — pertimbangkan menaikkan ambang **atau** memindahkan `getCurrentScope/onScopeDispose` keluar dari graf landing. Setelah itu jalankan ulang §2 baris 6–7.
2. **Disarankan (task terpisah):** samakan definisi "kredensial ambient" di middleware CSRF dengan `auth.source` (B2), supaya AC6 berlaku juga untuk `push` dari klien bearer.
3. **Opsional:** rapikan N1 (karantina ulang setelah percobaan due gagal), N2 (id ke-201 dipindah ke antrean due, bukan dibuang), N3 (`blockedCount` jangan sesaat 0 saat penulisan antrean gagal).
4. Flake `server/tests/{google-oauth,otp}.test.ts` saat suite penuh paralel: pertimbangkan `sequence.concurrent: false` untuk berkas server atau bucket rate-limit per-worker (bukan bagian task ini).
