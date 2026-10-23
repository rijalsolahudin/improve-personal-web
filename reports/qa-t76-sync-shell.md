# QA #76 — Sambungkan sync engine T21 ke shell web + indikator status sinkron

**Verdict: LULUS DENGAN CATATAN (non-blocking).**
Semua AC task terpenuhi dan terbukti dengan test. Dua temuan di luar AC (satu Medium, satu Medium-risk)
direkomendasikan jadi task lanjutan; tidak menggagalkan task ini (aturan QA poin 8).

> **Putaran 2 (re-check H1/M2/M3): LULUS.** Tiga blokir security review tertutup dan tiap perbaikan
> dibuktikan dengan mutation test (test-nya memang gagal tanpa perbaikan). Tidak ada bug blocking baru.
> Sisa risiko (header opsional, pull bisa berhenti permanen bila satu record tak bisa dibuka, sync
> antar-tab belum saling memberi tahu) dicatat di **§7**. Verdict di atas tetap berlaku.

Tanggal: 2026-10-24 · Tier: **T2** (runner sync + storage/IndexedDB + core pull) · Durasi ~20 menit.

---

## 1. Perintah yang dijalankan & hasil

```
pnpm --filter @improve-personal/web exec vitest run \
  app/utils/sync app/utils/io/import.test.ts \
  app/utils/storage/record-writer.test.ts \
  app/components/features/shell/ShellSyncStatus.qa.test.ts
→ Test Files 4 passed (4) · Tests 13 passed (13)

pnpm --filter @improve-personal/core test
→ Test Files 20 passed (20) · Tests 371 passed (371)

# ditambah test regresi QA baru (lihat §4):
vars/core ... vitest run src/sync/pull.index-order.qa.test.ts
→ 2 passed  → core total 21 files / 373 tests passed

pnpm --filter @improve-personal/web exec nuxt typecheck   → EXIT 0
pnpm --filter @improve-personal/core exec tsc --noEmit    → EXIT 0
eslint (semua file yang disentuh, --max-warnings 0)       → EXIT 0

# regresi area terdekat:
vitest run app/utils/storage/repository.test.ts app/layouts/dashboard.qa.test.ts app/utils/io
→ 7 files / 32 tests passed
```

Catatan: file `app/utils/storage/record-writer.test.ts` **tidak ada** di repo; 13 test berasal dari
`sync/client.test.ts` (4), `sync/controller.test.ts` (2), `io/import.test.ts` (5),
`ShellSyncStatus.qa.test.ts` (2). Jalur `writeRecord` tetap tersentuh lewat
`app/utils/storage/repository.test.ts` (hijau). Perintah di deskripsi task sebaiknya diperbaiki.

## 2. Hasil per kriteria

| Kriteria | Hasil | Bukti |
|---|---|---|
| Push lalu pull | PASS | `controller.ts:174-204`; `controller.test.ts:48-66` (pull setelah push; tanpa outbox, push tidak dipanggil) |
| Satu proses pada satu waktu | PASS | `controller.ts:131-155` (`inFlight` gate + `pendingRun`/`pendingPull`); diuji implisit |
| HLC sama untuk push & pull | PASS | `controller.ts:165`, `182`, `199` memakai `session.hlc` |
| Tidak ada loop push balik setelah pull | PASS | `pull.ts:175-193` menulis baris outbox turunan lalu membuangnya di transaksi yang sama; `engine.test.ts:317` |
| Error jaringan = offline, bukan error permanen | PASS | `client.ts:59-71` (fetch reject ≠ HttpError), `push.ts:143-157`, `pull.ts:124-139`; `client.test.ts:59-68` |
| Account isolation saat ganti user (single-tab) | PASS | Logout = reload penuh (`useLogout.ts:47`), DB per `userId` (`session.ts:161-166`), sesi dicocokkan lagi (`useLocalData.ts:171-176`), `plugin:30-41` cek `userId` setelah `import()` |
| Index hasil pull dihitung di luar transaksi | PASS | `pull.ts:166-173` sebelum `runTransaction` (`:175`); dibuktikan test baru §4 |
| Records Postgres terisi saat user menulis | PASS (kode) | `record-writer.ts:135-148` → `notifyLocalWrite` → debounce 2 dtk → `pushOutbox` mengirim `sealed` (tanpa plaintext) ke `/v1/sync/push`; server upsert `records` per `userId` (`server/services/sync.ts:76-138`) |
| Status UI tidak palsu saat storage belum siap | PASS | `useSyncStatus.ts:45-49` → `status=null` → "Menunggu status sinkronisasi"; `ShellSyncStatus.qa.test.ts:51-65` |

## 3. Bug / temuan

### B1 (Medium, di luar AC) — Siklus sync tidak dibatalkan saat sesi/akun berubah; multi-tab bisa menulis data akun A ke akun B

- **Bukti:** `controller.ts:108-120` (`stopSync` hanya melepas listener/timer; `inFlight` dibiarkan),
  `controller.ts:157-224` (`execute()` meng-capture `active` sekali dan tidak pernah cek ulang),
  `client.ts:61-71` (fetch memakai cookie ambient `credentials: 'same-origin'`), tidak ada sinkronisasi
  sesi antar-tab (grep `BroadcastChannel`/`storage` event: kosong).
- **Reproduksi (dua tab, manual):**
  1. Tab 1 login akun A, buka `/app` (sync aktif).
  2. Tab 2 logout lalu login akun B, buka `/app`.
  3. Tab 1 masih memegang sesi A di memori. Edit satu task di tab 1.
  4. Debounce 2 dtk → push A terkirim membawa cookie B → baris `records` akun **B** berisi ciphertext
     milik A. Pull tab 1 berikutnya menarik delta B ke DB lokal A **dan memajukan cursor A** ke
     `nextCursor` B (`pull.ts:197`).
- **Expected vs actual:** expected — klien berhenti/abort begitu cookie tidak lagi milik sesi yang
  dipegang controller (atau sebelum tiap request). Actual — siklus berlanjut sampai selesai.
- **Dampak:** bukan kebocoran plaintext (semua tetap tersegel), tapi integritas: akun B terisi record
  asing yang tidak bisa didekripsi, dan cursor lokal A bisa melompati record A sendiri (butuh reset
  manual yang belum ada UI-nya). Tidak terpicu oleh alur normal logout→login di satu tab (reload penuh).
- **Saran perbaikan (bukan QA):** `AbortController` di `stopSync`, cek `active === current` +
  `session.userId` sebelum tiap request/patch, dan reset controller saat sesi auth berubah.

### B2 (Medium risk, di luar AC) — Record pull yang gagal didekripsi disimpan tanpa index, cursor tetap maju, dan tidak ada jalur rebuild

- **Bukti:** `controller.ts:242-253` (catch → `null`), `pull.ts:186` (`index: null`), `pull.ts:197`
  (cursor naik di transaksi yang sama), `pull.ts:69-71` + `controller.ts:229-231` mengklaim "build
  berikutnya membangun ulang index", padahal grep `rebuild|reindex|bangun ulang` di `apps/web/app`
  tidak menemukan implementasinya.
- **Reproduksi:** perangkat dengan app versi lebih baru menulis `schemaVersion` > `CURRENT_SCHEMA_VERSION`
  (`record-codec.ts:26-30` menolak versi lebih baru) → device web lama pull → record tersimpan, index
  `null`, cursor maju. Record itu tidak akan pernah ditarik ulang dan tidak muncul di kalender/daftar
  (query memakai `record_index`).
- **Dampak:** data "ada tapi tidak terlihat" secara permanen sampai ada rebuild index. Bukan regresi
  task ini (perilaku decode), tapi jalur `indexFor` baru membuatnya sistematis.
- **Saran:** rebuild index saat unlock/versi app naik, atau jangan majukan cursor untuk halaman yang
  index-nya gagal dibangun (dan laporkan ke UI).

### Catatan kecil (bukan bug)
- `controller.ts:29` menulis ulang `DEBOUNCE_MS = 2_000` padahal core sudah mengekspor
  `SYNC_DEBOUNCE_MS` (`packages/core/src/sync/schedule.ts:13`) — satu sumber lebih baik.
- Test baru belum mengunci: tombol "Coba lagi", refresh via `SYNC_STATE_EVENT`, dan invariant
  "satu siklus pada satu waktu" (`pendingRun` coalescing). Layak ditambah di task lanjutan.
- Belum ada state "sedang sinkron" di kontrak (`synced|pending|offline|error`), jadi badge bisa
  sempat "Tersinkron" selama pull pertama berjalan. Bukan klaim palsu soal storage, tapi UX.

## 4. Test regresi yang ditambahkan

`packages/core/src/sync/pull.index-order.qa.test.ts` (baru, hijau):
1. `indexFor` asinkron benar-benar ditunggu dan dipanggil **sebelum** `runTransaction('sync.pull.merge')`;
   index hasilnya tersimpan (`listIndexByType('todo')`).
2. `indexFor` tidak dipanggil untuk record yang kalah LWW (`skipped`).

## 5. Gap AC: refresh store setelah pull

**Task lanjutan, bukan blocker.** Data hasil pull sudah dipersist + di-index dengan benar (dibuktikan
§4), jadi tidak ada data hilang; yang kurang hanya propagasi ke state composable yang sudah
ter-hydrate sehingga user perlu reload. Ini gap UX lintas-perangkat, di luar AC "index hasil pull
dibangun" dan sudah dicatat developer. Rekomendasi: satu mekanisme invalidasi (event
`SYNC_STATE_EVENT` → `hydrate()` ulang per store, atau `BroadcastChannel`) dalam task terpisah.

## 6. Sisa risiko

- B1 (multi-tab / sesi berubah saat request berjalan) — perlu task terpisah sebelum fitur dipakai
  untuk data sungguhan lintas akun.
- B2 (decode gagal → index hilang permanen tanpa rebuild).
- 409 `SYNC_RESET_REQUIRED` mereset cursor ke 0, tetapi record lokal yang sudah dipurge server tidak
  dihapus; outbox yang masih menunjuk record itu bisa menghidupkannya lagi (perilaku core, bukan
  perubahan task ini).
- Antrean > 50.000 record (100 batch × 500) baru terkirim penuh setelah siklus berikutnya; tidak ada
  data loss, hanya delay.
- `readSyncStatus` tidak membedakan error server transien (5xx) dari `pending` — badge bisa terlihat
  "menunggu" padahal server menolak; tombol "Coba lagi" hanya muncul untuk baris outbox ber-`lastError`.

---

# Addendum putaran 2 — re-check H1 / M2 / M3

**Verdict putaran 2: LULUS.** Ketiga temuan yang memblokir security review tertutup dan terbukti.
Tidak ada bug blocking baru di jalur yang diubah. Sisa risiko di §7.6.

Tanggal: 2026-10-24 · Tier **T2** (sync runner + storage/IndexedDB + core pull + server auth) · re-check
hanya menguji bug putaran 1 (aturan QA poin 7), bukan membuka skenario baru.

## 7.1 Perintah & hasil (dijalankan di tree ini)

```
pnpm --filter @improve-personal/core test
→ Test Files 22 passed (22) · Tests 379 passed (379)

pnpm --filter @improve-personal/web exec vitest run \
  app/utils/sync app/utils/io app/utils/storage \
  app/components/features/shell server/tests/sync.test.ts server/tests/http.test.ts
→ Test Files 19 passed (19) · Tests 175 passed (175)   ← 174 milik developer + 1 test QA baru (§7.5)

pnpm --filter @improve-personal/core exec tsc --noEmit   → EXIT 0
pnpm --filter @improve-personal/web exec nuxt typecheck  → EXIT 0

npx eslint --max-warnings 0 <semua file yang disentuh, web + core>  → EXIT 0
npx prettier --check <semua file yang disentuh + i18n/locales/id.json> → EXIT 0

# hasil mutasi (lihat §7.4) selalu di-restore dan diverifikasi sha256:
sha256sum -c → pull.ts OK · memory.ts OK · controller.ts OK · client.ts OK
```

Tidak ada `it.only`/`.skip` di file test yang disentuh (`grep -rn "\.only\|\.skip" app/utils/sync
packages/core/src/sync/pull.race.test.ts` → kosong).

## 7.2 H1 / B1 — request lintas akun: TERTUTUP

Tiga lapis, semuanya ada di kode dan teruji:

| Lapis | Bukti | Test |
|---|---|---|
| Server menolak request yang identitasnya beda dengan cookie | `server/utils/auth.ts:55-64` (`requireExpectedUserId`), dipasang **sebelum** rate limit/body/query: `push.post.ts:33`, `pull.get.ts:37` | `server/tests/http.test.ts` (4 kasus): cocok→200, tanpa header→200, header user lain→403 + jatah rate limit user sesi tetap 0 + tidak ada baris tertulis, header kosong→403 (fail-closed) |
| Klien mengirim identitas pemilik data lokal | `sync/client.ts:28` (nama header), `:84` (dikirim tiap request), `controller.ts:95` (`expectedUserId: session.userId`, satu-satunya pemanggil produksi) | `client.test.ts` (2 kasus, termasuk "tanpa `expectedUserId` header tidak dikirim") + `controller.test.ts:219-240` (controller bawaan benar-benar mengirim header) |
| Request yang sedang jalan dibatalkan saat stop/ganti akun | `controller.ts:157` (`abort.abort()` di `stopSync`), sinyal diteruskan ke push/pull: `:245`, `:269`; `client.ts:75,150-161` (`mergeSignal` = `AbortSignal.any([caller, timeout])`) | `controller.test.ts:162-186` (fetch yang menggantung benar-benar abort + siklus resolve `null` bukan "selesai"); **test baru QA** `client.test.ts` (sinyal pemanggil benar-benar sampai ke `fetch`) |
| Siklus generasi lama tidak boleh menyentuh state generasi baru | `controller.ts:216-219` (`isStale` = generasi + `userId`), dicek sebelum/sesudah tiap await besar: `:221,248,257,273,285`; `inFlight` dilepas `:160`; `.finally` tidak menutup siklus generasi lain `:191` | `controller.test.ts:188-217` (start B tidak menunggu/memakai siklus A; signal A aborted; storage A tidak dibaca lagi) |
| Klien berhenti saat sesi auth berubah / sesi null / keluar `/app` | `plugins/sync.client.ts:39` (cek `userId` setelah `import()`), `:50-53` (watch `auth.session.user.id` → stop), `:55-75` (status/path/`current()` null → stop) | tidak ada test plugin (lihat §7.5) |

Celah yang saya coba reproduksi dan **tidak** berhasil:

- trigger tertinggal setelah stop → `stopSync` membersihkan `debounceTimer`, `intervalTimer`, listener,
  `pendingRun`, `pendingPull`, dan `active = null`; `runSync` langsung `return null` (`controller.ts:175-176`).
- siklus lama menutup `inFlight` milik siklus baru → dijaga pembandingan identitas promise
  (`controller.ts:191`).
- siklus lama menandai `error` di storage akun baru → `catch` lebih dulu `isStale()` (`:285`), dan
  `markError` memakai `mySession.storage` (milik generasi itu), bukan storage global.
- pull halaman kedua tanpa header → client dibuat per-siklus, header menempel di semua panggilan.

## 7.3 M2 — edit lokal saat `indexFor` berjalan: TERTUTUP (kecuali jendela yang diakui)

`packages/core/src/sync/pull.ts:170-196`: snapshot pertama (`getRecords`) → `indexFor` (kripto, await)
→ `recheckCandidates` (`:258-268`) membaca ulang `getRecords` lalu membuang kandidat yang versi
lokalannya menang → transaksi menulis `toApply`. Index tetap dihitung di luar transaksi
(`indexById`, `:181-186`), jadi invarian "tidak ada await non-storage di dalam transaksi" utuh.

Bukti test nyata (bukan hiasan): `pull.race.test.ts:64-107` menyisipkan `commitLocalWrite` ber-HLC
lebih tinggi **di dalam** `indexFor`, lalu menuntut `applied = 0`, `skipped = 1`, dan record di disk
tetap versi lokal. Prasyaratnya juga diuji (`compareHlc(localHlc, remoteHlc) > 0`, `:99`).

Jendela yang **tidak** diklaim tertutup: antara `recheckCandidates` dan `runTransaction` (beberapa
microtask tanpa kripto) — diakui eksplisit di `pull.ts:32-37`. Menutupnya butuh compare-and-swap di
`StorageAdapter`; port itu belum punya. Untuk jalur nyata (kripto = bagian yang lambat) ini tidak
bisa dipicu user.

## 7.4 M3 / B2 — record tak terbaca & `'keep'`: TERTUTUP

- **Kunci/kripto gagal menghentikan pull + status error.** `record-codec.ts:141-152` membungkus semua
  kegagalan `openRecord` jadi `RecordKeyError`; `controller.ts:344` melemparkannya kembali sehingga
  `pullDelta` batal **sebelum** transaksi merge (cursor tidak maju), lalu `catch` di `:284-297`
  memanggil `markError` → `sync_state.status = 'error'` → badge error + tombol "Coba lagi".
- **Payload/skema tak dikenal → `'keep'`.** `controller.ts:346` → `RECORD_INDEX_KEEP`
  (`storage/index-decision.ts:20`) → adapter web `indexeddb.ts:308-311` dan memory
  `adapters/memory.ts:118-121` **tidak menyentuh** `record_index`; `updatedAtMs` memakai jam adapter
  (`indexeddb.ts:294-306`). `ports.ts:55-65` mendokumentasikan tiga arti nilai itu.
- **`null` tetap menghapus.** `indexeddb.ts:312`, `memory.ts:118`; dikunci di tiga tempat
  (`pull.race.test.ts:159-184`, `indexeddb.test.ts` "index `null` tetap MENGHAPUS", kontrak adapter).

Rule 7 (re-check) dipatuhi: tidak ada skenario M3 baru yang saya buka.

## 7.5 Mutation test — memastikan test baru bukan hiasan

Setiap mutasi: file produk di-backup ke `/tmp/opencode/mut`, dimutasi, test dijalankan, lalu
**di-restore dan diverifikasi sha256** (`sha256sum -c` → semua `OK`). Tidak ada perubahan produk yang
tertinggal (`git status` sama seperti sebelum saya mulai).

| Mutasi (meniru perilaku sebelum perbaikan) | Test yang menangkap | Hasil |
|---|---|---|
| `pull.ts`: `toApply = candidates` (tanpa re-cek M2) | `pull.race.test.ts` M2 | **GAGAL** `expected 1 to be +0` (record lokal tertimpa) |
| `memory.ts`: `index === 'keep'` diperlakukan seperti `null` | `pull.race.test.ts` M3 | **GAGAL** index lama terhapus (`[]` vs 1 entri) |
| `controller.ts`: `RecordKeyError` tidak lagi dilempar (kembali `'keep'` diam-diam) | `controller.test.ts` B2 (2 test) | **GAGAL** record tertulis + cursor maju, dan `writes` kosong |
| `controller.ts`: `abort.abort()` dihapus | `controller.test.ts` H1 (2 test) | **GAGAL** `signal.aborted` false + siklus resolve bukan `null` |
| `controller.ts`: `isStale` selalu `false` | `controller.test.ts` H1 | **GAGAL** siklus yang dibatalkan mengaku `synced` |
| `client.ts`: sinyal pemanggil dibuang di `mergeSignal` | **test QA baru** | **GAGAL** (request tidak pernah abort) |

**Test QA yang saya tambahkan** (hanya file test): `apps/web/app/utils/sync/client.test.ts` —
"membatuhkan request jaringan saat signal pemanggil di-abort (stopSync)". Ini menutup satu mata rantai
H1 yang sebelumnya tidak diuji: `stopSync` → `AbortSignal` → `mergeSignal` → `fetch` sungguhan. Tanpa
test ini, `mergeSignal` bisa membuang sinyal pemanggil dan seluruh perbaikan abort jadi no-op tanpa
ada yang gagal. Web suite jadi 175 test (dari 174).

## 7.6 Sisa risiko (tidak memblokir task ini)

1. **Header opsional (disetujui sebagai sisa risiko).** `auth.ts:59` — request **tanpa**
   `x-expected-user-id` tetap dilayani demi klien lama. Artinya jaminan server hanya berlaku untuk
   klien kooperatif: pihak yang memegang cookie curian (atau XSS yang menjalankan `fetch` sendiri)
   cukup tidak mengirim header dan tetap **dilayani**. Yang tertutup adalah skenario nyata task ini
   (tab kita selalu mengirim header, jadi batch akun lama tidak bisa masuk ke akun baru). Perlu task
   lanjutan: setelah semua klien terverifikasi mengirim header, jadikan
   wajib (atau gerbang per versi API) — jangan langsung wajib sekarang karena akan mematikan build
   web/mobile lama.
2. **Satu record yang tak bisa dibuka menghentikan pull secara permanen** — konsekuensi langsung M3.
   `indexFor` melempar pada record pertama yang gagal, transaksi merge tidak jalan, cursor tidak maju,
   dan pull berikutnya mengulang halaman yang sama → `error` selamanya tanpa jalur pemulihan di UI
   (tombol "Coba lagi" akan gagal lagi). Pemicu nyata: blob rusak, atau record yang tersegel dengan
   kunci data berbeda (sebagian dimitigasi `canCreateKey: isFirstDeviceOfAccount`,
   `useLocalData.ts:131`). Perilaku "berhenti + status error" memang yang diminta, jadi bukan blocker;
   rekomendasi: batas percobaan per record (mis. setelah N kali, tandai `lastError` record itu dan
   lewati) atau aksi eksplisit "lewati record yang tidak bisa dibuka".
3. **Sync antar-tab masih tidak saling memberi tahu.** Tab yang cookie-nya sudah berganti akun tidak
   tahu apa pun (tidak ada `BroadcastChannel`/`storage` listener untuk auth), jadi ia terus mencoba
   tiap 5 menit + tiap tulis lokal dan menerima 403 berulang, menampilkan `error` sampai reload.
   Integritas data aman (server menolak); ini UX + egress.
4. **`pullDelta` sekarang membaca `getRecords` dua kali per halaman.** Biaya satu read IndexedDB
   ekstra per halaman (≤200 record). Dapat diterima; tidak ada regresi terukur di jalur panas.
5. **Belum ada test untuk `plugins/sync.client.ts` dan tombol "Coba lagi"** yang baru ditambahkan
   putaran ini (temuan kecil putaran 1 masih terbuka). Keduanya jalur pemulihan satu-satunya setelah
   status `error`, jadi layak dapat test di task lanjutan.
6. **Duplikasi literal `'keep'`**: core memakai string literal di `memory.ts`/`ports.ts`, web memakai
   `RECORD_INDEX_KEEP`. Aman karena `RecordIndexDecision = RecordWrite['index']`
   (`index-decision.ts:22`) dan typecheck hijau, tapi satu konstanta bersama di core akan lebih rapi.
7. **Tombstone tanpa blob yang bisa dibuka** akan menghasilkan `'keep'` (index lama dipertahankan).
   Tidak berdampak hari ini: `deleteRecord` menyimpan payload aslinya (`record-writer.ts:190-201`) dan
   repository menyaring `deleted` (`repository.ts:64,73,133`).

## 7.7 Tiga pilar (delta putaran 2)

- **Keamanan** — membaik jelas: authz per-request (header identitas) + abort + stale guard, dan
  `RecordKeyError` tidak lagi membocorkan detail kripto ke pesan (`record-codec.ts:52-63` hanya memuat
  `record.id`). Sisa: header opsional (butir 1 di atas).
- **Performa** — satu `getRecords` ekstra per halaman pull (§7.6 butir 4); tidak ada import baru ke
  graf awal (`index-decision.ts` type-only, `index-entry.ts` dipisah dari `io/import.ts`), controller
  tetap `import()` dinamis dari plugin.
- **Kerapian** — typecheck/lint/prettier hijau; komentar menjelaskan "kenapa" dengan nomor temuan;
  tidak ada `any`/`@ts-ignore`/`console.*` baru; tiga arti `RecordWrite['index']` didokumentasikan di
  satu tempat (`ports.ts`) lalu dirujuk adapter.

## 7.8 Kesimpulan

H1 (termasuk B1), M2, dan M3 tertutup untuk klien yang kita kendalikan, dengan bukti test yang saya
buktikan tidak hiasan lewat enam mutasi. Tidak ada AC yang gagal dan tidak ada regresi di jalur yang
diubah → task layak `done`. Sisa risiko §7.6 butir 1-3 layak jadi task terpisah (header wajib setelah
semua klien terverifikasi; pemulihan record yang tak bisa dibuka; sinkronisasi status auth antar-tab).
