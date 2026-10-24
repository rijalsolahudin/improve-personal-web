# Security review #78 — hardening sync: identitas wajib, pemulihan index, test plugin

**Tanggal:** 2026-10-24 · **Reviewer:** Arif (Security Engineer) · **Mode:** READ-ONLY (tidak ada kode produk yang diubah)
**Scope:** `git diff ab6c47d..HEAD` (`3e2f578` bagian A+B, `ab34f38` bagian C) — 28 berkas.
**Rules dibaca:** `CLAUDE.md` (root), `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/security.md` (+ `performance.md` / `code-quality.md` untuk klaim perf & kerapian). `apps/mobile` tidak disentuh, jadi rules mobile tidak dimuat.

**Verdict keamanan: LOLOS** — 0 Critical, 0 High, 2 Medium (satu di antaranya **bukan** temuan keamanan melainkan AC fungsional yang tidak tercapai), 4 Low. Tidak ada jalur lintas-akun/kebocoran data baru; sisa temuan soal daya tahan (data tidak tampil / sync macet) dan cakupan deteksi.

> **Addendum (2026-10-24, commit `9cf6037`):** L1 **tertutup**, L3 **tertutup**, M2 **tertutup sebagian**. Verifikasi ulang + 4 temuan baru (2 Low, 2 informational) ada di **§9**. Verdict tetap **LOLOS**.

> **Catatan tata kelola:** M2 (di bawah) bukan kerentanan, tetapi membuat AC "pemulihan index gagal" tidak tercapai pada kasus yang wajar. Saya sarankan task ini **tidak** dipindahkan ke `done` sebelum M2 diperbaiki — keputusan itu milik QA/PO. Saya tidak memindahkan status Ergonio.

---

## 0. Pertanyaan terbuka (menentukan severity, bukan verdict)

1. **Kapan jalur pemulihan kunci / re-key (passkey, recovery key, QR) mendarat?**
   - A. Belum di rencana dekat → M1 tetap **potensial** (tidak bisa dicapai hari ini).
   - B. Sudah dekat (T22 lanjutan) → M1 naik jadi **blocking-soft**: karantina akan menyembunyikan record yang *sudah* bisa dibuka lagi setelah kunci dipulihkan, permanen, tanpa jalur retry di UI.
   - **Default saya:** A, dengan M1 tetap ditulis karena perbaikannya ~10 baris dan biayanya nol.
2. **Apakah "browser" boleh ditentukan dari header request, padahal server sudah tahu `sessions.client`?**
   - A. Ya (implementasi sekarang): `Origin`/`Sec-Fetch-*` → wajib header.
   - B. Pakai `auth.client === 'web'` (otoritatif, sudah ada di `AuthenticatedSession`) → L1 hilang dan klaim "klien browser WAJIB" jadi benar tanpa syarat.
   - **Default saya:** B direkomendasikan (L1). A dapat diterima untuk rilis ini karena semua browser modern mengirim Fetch Metadata.
3. **Berapa batas browser yang didukung?** Kalau floor proyek ≥ Safari 17, L1 turun jadi informational murni.
   - **Default:** tidak ada floor tertulis (`compatibilityDate: '2026-10-01'`, tanpa `.browserslistrc`) → saya perlakukan sebagai Low.
4. **Apakah `blockedCount` boleh menampilkan angka milik akun sebelumnya selama window sebelum `startSync`?**
   - A. Tidak apa-apa (hanya angka, perangkat & user fisik sama).
   - B. Gate pembacaan pada pemilik yang cocok (L3).
   - **Default:** A untuk rilis ini, B kalau ada keluhan UI.

---

## 1. Ringkasan risiko & verdict

| # | Sev | Temuan | Sifat |
|---|---|---|---|
| M1 | Medium (potensial) | Karantina tidak pernah dicoba ulang: begitu id masuk daftar, `buildIndex` melewati record itu selamanya. Kunci yang pulih / konteks kunci yang berubah tidak membebaskannya. | Desain; belum bisa direproduksi end-to-end hari ini |
| M2 | Medium (bukan keamanan) | Karantina tidak pernah terpicu kalau record rusak adalah **satu-satunya kandidat** di halamannya (`decoded === 0` di setiap siklus) → pull macet permanen, retry tidak pernah berhasil | Terbukti (test QA paralel, 2 kasus `it.fails`) |
| L1 | Low | "Request dari browser" disimpulkan dari `Origin`/`Sec-Fetch-*`, bukan dari `sessions.client` yang sudah otoritatif → browser tanpa Fetch Metadata tetap boleh tanpa header (kontrol H1 tidak berlaku untuknya) | Baru |
| L2 | Low | Daftar karantina penuh (200) + retry tanpa backoff → loop sync tanpa akhir pada halaman berisi >200 record gagal-dekripsi; status tidak pernah `error` | Baru (butuh input abnormal) |
| L3 | Low | `isQuarantined()`/`quarantinedCount()` tidak memeriksa pemilik daftar → angka akun lama bisa tampil untuk akun baru sampai `startSync` mengadopsi; atribusi daftar bisa salah kalau penulisan owner gagal sebagian | Baru |
| L4 | Low | `refresh()` gagal jaringan mengosongkan `auth.session` tab penerima **dan** memicu pengumuman "identitas berubah" ke tab lain (false logout + sinyal palsu) | Baru (perilaku, bukan kebocoran) |

Tidak ada temuan pada: bypass kewajiban header oleh browser modern, kebocoran lintas akun, CSRF/`Origin` check, open redirect pada reload, PII/id record di log/analytics/UI, regresi abort controller & isolasi akun #76/#77, `runtimeConfig`/secret, CSP, cookie flags, cache PWA `/v1/**`.

---

## 2. Threat model singkat (fokus yang berubah)

- **Aset:** ciphertext + metadata record di server; plaintext + kunci data di memori tab; `sync_state.cursor`; daftar record yang tidak bisa dibuka di perangkat.
- **Aktor:** (a) tab basi dengan cookie ambient (threat H1 — *kesalahan*, bukan penyerang), (b) user lain di perangkat yang sama, (c) server/penyusup yang mengontrol ciphertext & urutan (bisa mengirim blob rusak atau memalsukan HLC), (d) script same-origin (XSS) — di luar batas desain ini, tapi dipakai sebagai pembanding "apakah kontrol baru menambah kemampuan".
- **Trust boundary baru di diff ini:** (i) tab ↔ `requireExpectedUserId` (server), (ii) tab ↔ tab (`BroadcastChannel`/`storage`), (iii) `localStorage` ↔ controller sync (daftar karantina).
- **Sifat kontrol `x-expected-user-id`:** tetap **bukan kredensial dan bukan authz** (sama seperti catatan #76). Yang berubah: sekarang ia *wajib* untuk request yang tampak berasal dari browser. Penyerang yang memegang cookie tidak mendapat apa pun dari melewatinya; yang ditutup adalah tab basi.
- Alur yang diverifikasi: `startSync` → `adoptQuarantineAccount` → `runSync` → `pullDelta` (`indexFor` = `buildIndex`) → `guardPullMerge` (`sync.pull.merge` ditolak bila ada kegagalan kunci yang belum diputuskan) → `putRecord(index: 'keep'|entry)` + `patchSyncState(cursor)` dalam satu transaksi; karantina hanya menulis `localStorage`, tidak pernah menyentuh blob/cursor.

---

## 3. Jawaban atas enam fokus review

| # | Fokus | Hasil |
|---|---|---|
| 1 | Bypass kewajiban header | **Tidak ada bypass dari browser modern.** `Origin`, `Sec-Fetch-Site`, `Sec-Fetch-Mode` adalah *forbidden header*: JS halaman tidak bisa menambah, mengubah, atau menghapusnya; `no-cors`/form/sendBeacon/`keepalive` juga tetap membawa Fetch Metadata, dan service worker punya rule `NetworkOnly` untuk `/v1/**` (`nuxt.config.ts:265-275`) sehingga header asli tidak diubah. **Catatan L1:** browser yang tidak mengirim Fetch Metadata (Safari < 16.4 dan WebView turunannya) pada `GET` same-origin tidak mengirim `Origin` → request-nya dianggap "bukan browser" → boleh tanpa header. Bukan eskalasi (sebelum perubahan pun opsional untuk semua), tapi klaim "klien browser WAJIB" tidak tercakup universal. Urutan route benar: `requireSession` → `requireExpectedUserId` → rate limit → body/query di **kedua** route (`push.post.ts:33-39`, `pull.get.ts:38-45`); tidak ada route sync lain. |
| 2 | Karantina sebagai jalur kehilangan data | **Cursor tidak pernah maju tanpa menulis record** (merge ditolak sebelum transaksi, `controller.ts:444-456` + `pull.ts:209-232`), jadi tidak ada ciphertext yang terlewat. **Record sehat tidak bisa dikarantina selama konteks kunci stabil** (kegagalan `openRecord` deterministik; `decoded === 0` menahan karantina saat kunci salah — diuji `controller.test.ts` "SEMUA record gagal"). **M1:** karantina tidak pernah dicoba ulang, jadi ia bisa *menjadi* permanen setelah konteks kunci berubah. **M2 (kebalikannya):** kalau record rusak adalah satu-satunya kandidat di halamannya, `decoded === 0` di setiap siklus → tidak pernah dikarantina → pull macet permanen (terbukti, lihat §4). **Batas 200:** id tertua dibuang (`slice(-200)`, `quarantine.ts:142`); pada halaman dengan >200 record gagal + ≥1 sukses, daftar berputar (evict ↔ karantina ulang) sehingga pull tidak pernah lewat halaman itu dan `pendingRun` memicu siklus berikutnya tanpa jeda (L2). **Tabrakan id antar akun:** tidak praktis (UUIDv7) dan daftar diadopsi per akun (`quarantine.ts:103-116`). |
| 3 | `localStorage` berisi id record | **Tidak menambah permukaan berarti.** Id record sudah ada di IndexedDB (`record`, plaintext metadata) dan di payload SSR mana pun yang menampilkan record; id tidak rahasia, tidak bisa dipakai membaca isi (AAD = `recordId`, blob tetap butuh kunci data). Pengikatan akun **nyata** untuk penulisan (`activeOwnerId` + `ip-sync-quarantine-owner`) dan daftar dibuang saat ganti akun atau logout (`clearAppStorage` menyapu `ip-*`). **Celah kecil (L3):** pembacaan (`isQuarantined`, `quarantinedCount`) tidak memeriksa pemilik, jadi window antara "akun berganti tanpa reload" dan `startSync` memperlihatkan jumlah milik akun lama. |
| 4 | Sesi antar-tab | **Tidak ada DoS reload.** Reload hanya terjadi kalau server menyatakan identitas **berbeda** (`session-sync.ts:225-242`); sinyal palsu dari script same-origin hanya memicu `refresh()` yang diserialisasi (`isReconciling`), dan script itu sudah bisa memanggil `$fetch` sendiri. **Tidak ada open redirect:** target = `safeRedirectPath(route.fullPath, '/app')` → hanya path `/app*`, menolak absolut/`//`/`\` (`validation.ts:19-32`, diuji `validation.test.ts:27-41`). **Temuan L4:** kegagalan `refresh()` mengosongkan `session` lalu watcher mengumumkan "identitas berubah" — false logout di tab itu, plus sinyal palsu ke tab lain (berakhir, tidak berulang). |
| 5 | Log/PII | **Bersih.** Tidak ada `console.*`/analytics di seluruh berkas baru/berubah (grep), tidak ada pelaporan error klien sama sekali (hanya `server/utils/server-log.ts` untuk error server). `RecordKeyError.message` **memuat id record**, tetapi error itu tidak pernah dicetak, diserialisasi, atau dikirim: `controller.ts:336` menangkapnya tanpa argumen, `markError` hanya menulis `status: 'error'`, dan UI hanya menampilkan jumlah (`i18n/locales/id.json:89`, diuji `ShellSyncStatus.qa.test.ts` "id record tidak pernah bocor ke UI"). |
| 6 | Regresi #76/#77 | **Utuh.** `x-expected-user-id` tetap dikirim klien untuk setiap push/pull (`client.ts:84`, `controller.ts:141`, diuji `controller.test.ts:241`); `stopSync`/`AbortController`/`isStale()` tidak berubah (`controller.ts:193-209, 262-267`); isolasi akun di `plugins/sync.client.ts:39-53` tidak berubah; `pullDelta` tetap menerima `signal: abort.signal` lewat storage yang dibungkus (spread objek adapter aman karena adapter berupa object literal closure, `indexeddb.ts:375+`); test #76/#77 tetap lulus. |

---

## 4. Temuan

### M1 — Karantina tidak punya jalur keluar: record yang sudah bisa dibuka lagi tetap disembunyikan selamanya · **Medium (potensial)**

**Lokasi:** `apps/web/app/utils/sync/quarantine.ts:103-116` (adopsi daftar: hanya dibuang bila *pemilik* berubah), `apps/web/app/utils/sync/quarantine.ts:119-124` (`isQuarantined` = anggota daftar, tanpa kedaluwarsa/versi kunci), `apps/web/app/utils/sync/controller.ts:409` (`if (isQuarantined(remote.id)) return RECORD_INDEX_KEEP` — **tidak pernah mencoba `decodeRecord` lagi**), `apps/web/app/utils/sync/controller.ts:481-496`.

**Dampak:** record tetap tersimpan (blob di `record` **dan** di server), tetapi tidak pernah masuk `record_index` → tidak muncul di kalender/daftar/export, dan `blockedCount` hanya memberi tahu jumlah. Tidak ada aksi di UI yang bisa membebaskannya; satu-satunya jalur adalah logout (menyapu `ip-*`) atau ganti akun — dan bahkan setelah logout, cursor sudah melewati record itu sehingga pull tidak mengirimnya lagi (index hanya dibangun saat pull; `index-decision.ts` mencatat "tidak ada jalur rebuild di web").

**Skenario (potensial — belum bisa saya reproduksi penuh hari ini):** dibutuhkan satu halaman pull yang memuat **sekaligus** record yang gagal dibuka dengan kunci sekarang dan record lain yang berhasil (supaya `decoded > 0`, syarat karantina). Itu berarti dua kunci data berbeda untuk satu akun, yaitu kondisi transisi: kunci perangkat dibuat ulang/dipulihkan, atau re-key. Hari ini `openLocalDataSession` menolak kunci baru kalau sudah ada record lokal (`storage/session.ts:172`) dan `useLocalData.isFirstDeviceOfAccount` menolak kunci baru kalau akun sudah punya envelope (`useLocalData.ts:87-97`), jadi jalur ini baru terbuka begitu pemulihan kunci mendarat (passkey/recovery/QR). Setelah kunci yang benar dipulihkan di perangkat itu, record-record tersebut **bisa** dibuka — tetapi karantina tidak pernah dicoba ulang, jadi tetap tak terlihat. Itu tepat kelas kehilangan data yang diminta dicek pada fokus 2.

**Perbaikan konkret (kecil, tanpa mengubah perilaku anti-macet):**
```ts
// quarantine.ts
export function releaseQuarantine(recordId: string): void { /* hapus 1 id, idempoten */ }

// controller.ts:409 — coba SEKALI per siklus, jangan dihitung sebagai kegagalan
if (isQuarantined(remote.id)) {
  try {
    const record = await decodeRecord(...)
    releaseQuarantine(remote.id)          // terbuka lagi → index normal
    return indexEntryForRecord(record, now)
  } catch {
    return RECORD_INDEX_KEEP              // tetap rusak → pull tetap maju
  }
}
```
Alternatif yang setara biayanya: simpan *fingerprint kunci* (mis. 8 byte pertama `SHA-256(dataKey)`) di samping daftar, dan buang seluruh daftar bila fingerprint berubah saat `startSync`.

**Verifikasi:** test baru — (a) record dikarantina → `openRecord` dibuat berhasil → siklus berikutnya id keluar dari daftar dan `index` menjadi entri (bukan `'keep'`); (b) saat masih gagal, jumlah karantina tidak bertambah dan pull tetap maju.

---

### M2 — Karantina tidak pernah terpicu bila record rusak sendirian di halamannya → pull macet permanen · **Medium (bukan temuan keamanan; AC fungsional gagal)**

**Lokasi:** `apps/web/app/utils/sync/controller.ts:469-479` (`if (keyFailures.decoded === 0) { abortedWith = firstFailure; return firstFailure }` — keluar **sebelum** penghitung `consecutiveKeyFailures` dinaikkan), `:399-433` (`decoded` hanya bertambah untuk record yang benar-benar didekripsi **sebagai kandidat** di siklus itu), `:444-456` (merge selalu ditolak), `:343-353` (status tidak ditandai `error` hanya bila karantina baru terjadi — di sini tidak pernah terjadi).

**Dampak:** satu record yang gagal didekripsi dan **tidak punya kawan sehat sebagai kandidat** di halaman yang sama membuat `decoded` selalu 0 → `consecutiveKeyFailures` berhenti di 1 → tidak pernah mencapai 3 → tidak pernah dikarantina → merge selalu ditolak → cursor tidak pernah maju. User melihat "Gagal sinkron", menekan "Coba lagi", dan hasilnya selalu sama: **record-record setelahnya tidak pernah masuk**. Ini bukan kehilangan data (blob & cursor aman, tidak ada record terlewat), tetapi memperbaiki `M2` dari #76 (pull macet total) hanya untuk kasus "ada record sehat di halaman yang sama".

**Kasus yang bisa direproduksi (terbukti):**
1. **Akun kecil / halaman terakhir:** halaman berisi **satu** record, dan record itu rusak → `isQuarantined` tetap `false` setelah 4 siklus, `cursor` tetap 0, `status: 'error'`.
2. **Halaman sehat lalu halaman rusak:** halaman 0 sehat (cursor jadi 1), halaman 1 berisi satu record rusak → kunci **terbukti benar** (record sehat di siklus pertama berhasil didekripsi), tetapi `decoded` dihitung **per siklus**, bukan "pernah berhasil sebelumnya" → karantina tidak pernah terjadi, cursor berhenti di 1.

**Bukti:** `apps/web/app/utils/sync/controller.quarantine-solo.qa.test.ts` (berkas **untracked**, ditulis QA paralel; **tidak** termasuk diff yang saya review — saya hanya membaca dan menjalankannya, tidak mengubahnya) memuat dua kasus sebagai `it.fails`. Saya jalankan: `pnpm exec vitest run app/utils/sync/controller.quarantine-solo.qa.test.ts` → **2 expected fail**, artinya kedua bug masih hidup. Analisis statis saya di atas independen dan konsisten dengan hasil itu.

**Perbaikan konkret (dua pilihan, pilih satu):**
- (a) Pisahkan "apakah kuncinya benar" dari "apakah halaman ini punya record sehat": simpan penanda **per sesi**, bukan per siklus — mis. `sessionHasDecodedRecord = true` begitu ada satu record berhasil dibuka (di-reset saat `startSync`), lalu pakai itu untuk memutuskan karantina: `if (!keyFailures.hasDecodedAnywhere) return firstFailure` dengan `hasDecodedAnywhere ||= keyFailures.decoded > 0`.
- (b) Tetap per siklus, tetapi beri jalan keluar deterministik: setelah N siklus `decoded === 0` **dengan kursor yang sama** (tidak ada kemajuan), karantina record itu dan tandai `blockedCount` — karena urutan pengambilan halaman bersifat deterministik, tidak ada kemajuan berarti memang record itu penyebabnya.

**Verifikasi:** ubah dua `it.fails` menjadi `it` di berkas QA itu (atau pindahkan ke `controller.test.ts`): (1) satu record rusak, 3 siklus → `isQuarantined === true`, `cursor: 1`, `status: 'synced'`; (2) halaman sehat + halaman rusak → `cursor: 2`, `status: 'synced'`; dan kasus "kunci salah" (semua record di **setiap** halaman gagal) tetap **tidak** mengarantina apa pun.

---

### L1 — Deteksi "browser" dari header, padahal server sudah punya `sessions.client` · **Low**

**Lokasi:** `apps/web/server/utils/auth.ts:36-50` (`BROWSER_REQUEST_HEADERS`, `isBrowserRequest`), `:76-90` (cabang fail-closed), dibanding `apps/web/server/services/session.ts:34-50` (`AuthenticatedSession.client: ClientKind`) dan `server/services/session.ts:217` (`client: 'web'` untuk sesi cookie).

**Dampak:** kewajiban header hanya berlaku pada request yang membawa `Origin`/`Sec-Fetch-*`. Browser yang tidak mengirim Fetch Metadata (Safari < 16.4 dan WebView turunannya) pada `GET /v1/sync/pull` same-origin tidak mengirim `Origin` → dianggap klien native → header opsional → tab basi di browser itu tetap bisa menarik/menulis lintas akun. Bukan eskalasi dibanding sebelum perubahan, tetapi janji di komentar ("Request dari BROWSER … WAJIB") tidak tercakup penuh, dan penentunya metadata request yang bisa berubah-ubah (proxy korporat yang menyuntik `Origin` justru membuat klien native ditolak 403).

**Mengapa bukan High:** dari browser modern tidak ada cara menghilangkan penanda (forbidden header), dan tanpa cookie penyerang tidak mendapat apa pun. Jadi ini soal *cakupan*, bukan *bypass aktif*.

**Perbaikan konkret:** jadikan `client` sesi sumber keputusan, bukan header:
```ts
export function requireExpectedUserId(event: H3Event, auth: AuthenticatedSession): void {
  const expected = getHeader(event, EXPECTED_USER_ID_HEADER)
  if (expected === auth.userId) return
  if (expected === undefined && auth.client !== 'web' && !isBrowserRequest(event)) return
  throw apiProblem('FORBIDDEN')
}
```
(atau bentuk opsi `{ required: auth.client === 'web' }`). Semua klien web sudah mengirim header (`client.ts:84`; satu-satunya pembuat client adalah `controller.ts:141`), jadi ini tidak memutus klien sah dan menghapus ketergantungan pada heuristik.

**Verifikasi:** test `server/tests/http.test.ts` — sesi `client:'web'` + cookie + **transport `node`** (tanpa `Origin`/`Sec-Fetch-*`) + tanpa header → **403** dan `rateLimitCount === 0`; sesi `client:'mobile'` + bearer tanpa header → tetap 200. Dua kasus ini belum ada sekarang (yang diuji hanya "browser dengan Origin" dan "native dengan bearer"), sehingga aturan baru belum mengunci kombinasi cookie+tanpa-penanda.

---

### L2 — Daftar karantina penuh + retry tanpa backoff = loop sync tanpa akhir · **Low**

**Lokasi:** `apps/web/app/utils/sync/quarantine.ts:39,142` (`QUARANTINE_MAX_RECORDS = 200`, `slice(-200)` membuang yang tertua), `apps/web/app/utils/sync/controller.ts:343-353` (`pendingRun = true; pendingPull = true` → siklus susulan **segera**, tanpa jeda), `:481-496` (semua kegagalan dihitung & dikarantina dalam satu siklus).

**Dampak:** bila satu halaman memuat >200 record yang gagal dibuka **dan** minimal satu yang berhasil, tiap siklus mengarantina ≥201 id → 200 pertama langsung terevakuasi oleh 200 terakhir → siklus berikutnya record yang terevakuasi gagal lagi dari nol → karantina ulang → evakuasi lagi. Hasilnya: pull tidak pernah melewati halaman itu, `pendingRun` memicu siklus berikutnya seketika, dan status tidak pernah `error` (karena `keyFailures.quarantined === true`) sehingga tombol "Coba lagi" pun tidak muncul. Efeknya denyut jaringan/CPU/baterai berkelanjutan selama app terbuka.

**Mengapa Low:** butuh input abnormal (halaman dengan >200 blob tak terbuka + setidaknya satu yang valid) — server rusak/bermusuhan atau penyimpanan korup. Penyebab lain (kunci salah) berhenti di `decoded === 0` dan tidak mengarantina apa pun.

**Perbaikan konkret:** (a) jangan pakai `pendingRun` untuk siklus susulan; jadwalkan dengan jeda (`setTimeout`, mis. `SYNC_DEBOUNCE_MS`) dan maksimum satu susulan per event karantina; (b) jangan evakuasi id yang masih ada di himpunan kegagalan siklus berjalan — atau batasi N karantina baru per siklus supaya ada kemajuan monoton. Tambahkan test: 250 record gagal + 1 sukses → jumlah siklus terbatas dan `sync_state.status` berakhir `error` (bukan loop diam).

---

### L3 — Kepemilikan daftar karantina hanya dijaga saat menulis · **Low**

**Lokasi:** `apps/web/app/utils/sync/quarantine.ts:119-124` (`isQuarantined` tidak melihat owner), `:146-151` (`quarantinedCount` tidak melihat owner), `:110-115` (`writeIds([])` dan `setItem(owner)` dua langkah terpisah, masing-masing bisa gagal sendiri), dipakai UI di `apps/web/app/composables/useSyncStatus.ts:49-52`.

**Dampak:** (a) pada pergantian akun **tanpa reload** (login akun lain di tab ini), antara detik akun berganti dan `startSync` akun baru, shell menampilkan "N data tidak bisa dibuka" milik akun sebelumnya — hanya angka, tanpa id, di perangkat dan user fisik yang sama; (b) bila `writeIds([])` gagal (kuota) tetapi `setItem(owner)` berhasil, daftar lama diatribusikan ke akun baru; tabrakan id UUIDv7 membuat record akun baru terlewat praktis tidak mungkin, tetapi atribusinya salah secara prinsip.

**Perbaikan konkret:** jadikan pembacaan sadar-pemilik:
```ts
function ownedIds(store: Storage): string[] {
  if (activeOwnerId === null || readOwner(store) !== activeOwnerId) return []
  return readIds(store)
}
```
dan panggil `adoptQuarantineAccount` lebih awal (saat `useLocalData.ensure()` membuka sesi) supaya UI tidak pernah membaca daftar akun lain. Verifikasi: test "akun B dibuka tanpa `startSync` → `quarantinedCount() === 0` walau daftar akun A masih ada".

---

### L4 — `refresh()` gagal jaringan mengosongkan sesi tab penerima lalu mengumumkan "identitas berubah" · **Low**

**Lokasi:** `apps/web/app/composables/useAuthSession.ts:39-53` (`load()` menulis `session.value = null` di setiap kegagalan), `apps/web/app/utils/auth/session-sync.ts:223-233` (`reconcile` memanggil `auth.refresh()`), `:250-255` (watcher `session.user.id` → `announceSessionChange`), dampak lanjut di `apps/web/app/plugins/sync.client.ts:50-53` (perubahan identitas auth → `stopSync()`).

**Dampak:** satu sinyal antar-tab yang tiba bersamaan dengan gangguan jaringan/502 membuat tab penerima: (1) membuang `auth.session` → UI berperilaku seperti logout (guard berikutnya mengarahkan ke `/login`, badge akun kosong) padahal cookie masih sah; (2) mematikan controller sync untuk sisa umur halaman; (3) **mengumumkan** perubahan identitas ke tab lain — padahal identitas tidak berubah — sehingga tab lain ikut `refresh()`, ikut gagal, ikut mengosongkan sesi. Rantainya berhenti (setelah `before === after === null` tidak ada pengumuman lagi) jadi bukan loop, tetapi satu gangguan jaringan singkat bisa melumpuhkan sync di semua tab sampai reload manual.

**Perbaikan konkret:** di `reconcile`, jangan biarkan kegagalan mengubah state yang diumumkan:
```ts
const before = auth.session.value
const current = await auth.refresh()
if (auth.error.value !== null) {
  if (before !== null && auth.session.value === null) auth.setSession(before) // pulihkan tampilan
  return
}
```
atau tambahkan flag yang menekan `announceSessionChange()` selama `isReconciling`. (Siklus normal tidak terpengaruh; `refresh()` sukses dengan id sama tetap tidak mengumumkan — sudah diuji.)

**Verifikasi:** test baru di `auth-session.client.test.ts` — sinyal masuk, `$fetch` menolak dengan error jaringan → `session.value?.user.id` tetap `USER_A`, tidak ada reload, **dan** tab lain tidak menerima sinyal (pasang `otherTab()` lalu hitung `message`).

---

### L5 (informational) — Kontrak "klien native boleh tanpa header" bertumpu pada asumsi yang tidak diuji

Klien native tidak menyentuh `/v1/sync/*` hari ini (grep `apps/mobile`: nihil), jadi ini belum berdampak. Tetapi aturan sekarang mengklasifikasikan **berdasarkan ada/tidaknya header**, bukan jenis klien: klien native yang (karena proxy/WebView/versi RN tertentu) mengirim `Origin` atau `Sec-Fetch-*` akan ditolak 403 sampai ia mengirim `x-expected-user-id`. Itu arah yang aman (fail-closed), tetapi harus jadi acceptance criterion T23: **klien mobile WAJIB selalu mengirim `x-expected-user-id`** dan tidak bergantung pada pengecualian ini. Catat di kontrak API, bukan hanya di komentar server.

---

## 5. Acceptance criteria keamanan untuk implementasi ini

1. **Urutan penolakan:** setiap route `/v1/sync/*` memanggil `requireSession` → `requireExpectedUserId` → rate limit → body/query; penolakan tidak menulis apa pun dan tidak memakai jatah. **Terbukti:** `push.post.ts:33-39`, `pull.get.ts:38-45`; test "browser tanpa header → 403 … `rateLimitCount === 0`" + "tidak ada record tertulis".
2. **Tidak ada jalur maju cursor tanpa menulis record:** kegagalan kunci harus membatalkan `sync.pull.merge` sebelum transaksi; `index: 'keep'` hanya untuk record yang tetap ditulis. **Terbukti:** `controller.ts:444-456` + `pull.ts:209-232`; test "dua siklus pertama: `cursor: 0`, `writes: []`".
3. **Kunci salah ≠ record rusak:** `decoded === 0` tidak boleh mengarantina apa pun. **Terbukti:** `controller.ts:476-479`; test 4 siklus semua gagal → `quarantinedCount() === 0`.
4. **Pemulihan benar-benar terjadi (AC #2 task):** setelah 3 siklus berturut-turut, record rusak dikarantina **dan** pull maju — termasuk bila record itu satu-satunya kandidat di halamannya. **BELUM TERPENUHI (M2):** dua kasus `it.fails` di `controller.quarantine-solo.qa.test.ts` masih gagal.
5. **Karantina tidak menyentuh isi data:** blob tetap ditulis, index lama tidak dihapus. **Terbukti:** test `bad.index === 'keep'`, `bad.sealed.blob === 'AAAA'`.
6. **Identitas per akun:** daftar karantina dan penghitung kegagalan direset saat sesi berganti. **Terbukti:** `controller.ts:135-136`, `quarantine.ts:103-116`; test "ganti sesi … tidak bocor".
7. **Tidak ada PII/id record di log, analytics, atau UI:** pesan UI hanya jumlah; `RecordKeyError.recordId` tidak pernah dicetak/diserialisasi. **Terbukti:** grep `console.`/analytics di semua berkas berubah = kosong; `ShellSyncStatus.qa.test.ts` menolak id di teks; `id.json:89` hanya `{n}`.
8. **Reload antar-tab tidak bisa jadi open redirect:** target selalu lewat `safeRedirectPath` (allowlist `/app*`). **Terbukti:** `session-sync.ts:239`; `validation.test.ts`.
9. **Signal tanpa payload:** pesan hanya `'identity-changed'`, penerima tidak membaca isi. **Terbukti:** `session-sync.ts:44`, test "sinyal yang dikirim tidak membawa data user".
10. **CI:** `pnpm typecheck` web & core bersih, `eslint --max-warnings 0` bersih, suite sync/server lulus (lihat §7).

---

## 6. Hardening non-blocking

1. **Catat `x-expected-user-id` sebagai kontrak wajib di `packages/contracts`** (komentar kontrak sync), bukan hanya di `server/utils/auth.ts`. Klien berikutnya (mobile, import tool) harus tahu tanpa membaca implementasi.
2. **Batasi umur karantina:** simpan `{ id, at }` atau fingerprint kunci (lihat M1). Membebaskan record yang terbukti terbuka lagi lebih murah daripada dukungan "data saya hilang".
3. **`isQuarantined` O(n) per record pull:** `readIds()` melakukan `JSON.parse` untuk **setiap** record kandidat (≤500 per halaman) → ~500 parse × ≤200 id tiap siklus. Bukan masalah keamanan, tapi mudah dihindari: cache `Set<string>` di modul dan invalidasi saat `writeIds`/`adopt`.
4. **Jangan tulis blob yang sudah diketahui tidak bisa dibuka di atas salinan lokal yang sehat.** Setelah karantina, record tetap ditulis (`decideMerge` memutuskan lebih dulu). Bila kelak ada re-key (dua versi blob untuk id sama, satu terbaca satu tidak), versi tak terbaca bisa menimpa salinan lokal yang sehat. Mitigasi termurah: bila record dikarantina **dan** ada salinan lokal dengan id sama, biarkan lokal menang (butuh hook `skipIds` di core) — atau setidaknya tulis test yang mengunci keputusan ini sekarang.
5. **Test gap yang sebaiknya ditutup:** (a) cookie + tanpa penanda browser + tanpa header → 403 (L1); (b) daftar 200 penuh / >200 kegagalan → siklus terbatas (L2); (c) `refresh()` gagal → sesi tab tidak berubah (L4); (d) record karantina yang berhasil dibuka lagi (M1).
6. **`blockedCount` sebagai jalur komunikasi, bukan sekadar angka:** sertakan satu aksi ("coba buka ulang" / "unduh data mentah") saat M1 dan L2 tersedia; saat ini user tidak punya jalan apa pun dari pesan itu.
7. **`/v1/**` non-sync juga memakai cookie ambient.** `GET /v1/keys/envelopes` dan `GET /v1/devices` tetap bisa dibaca tab basi (envelope opak / nama perangkat). Bukan regresi dan bukan prioritas, tetapi kalau kontrol H1 mau konsisten, `requireExpectedUserId` (atau ekuivalen `client==='web'`) bisa dipasang di semua route yang membaca data per akun — bukan hanya sync.

---

## 7. Bukti eksekusi (read-only, tanpa mengubah kode)

| Perintah | Hasil |
|---|---|
| `pnpm exec vitest run app/utils/sync/quarantine.test.ts app/utils/sync/controller.test.ts app/utils/auth/session-sync.test.ts` | 3 berkas / **33 test lulus** |
| `pnpm exec vitest run app/plugins/auth-session.client.test.ts app/plugins/sync.client.test.ts app/composables/useSyncStatus.test.ts app/components/features/shell` | 8 berkas / **35 test lulus** |
| `pnpm exec vitest run server/tests/http.test.ts -t "x-expected-user-id"` (Nitro + Postgres test nyata) | **5 lulus**, 40 dilewati |
| `pnpm exec vitest run app/utils/sync/controller.quarantine-solo.qa.test.ts` (berkas QA **untracked**, di luar diff; hanya dijalankan) | **2 expected fail** → M2 terbukti masih hidup |
| `pnpm typecheck` (apps/web) | **EXIT=0** |
| `pnpm typecheck` (packages/core, `tsc -p tsconfig.json`) | **EXIT=0** |
| `pnpm exec eslint` pada seluruh berkas baru/berubah (sync, auth, plugins, composables, ShellSyncStatus, `server/utils/auth.ts`, storage) | **EXIT=0** |
| Grep `console.`/`Sentry`/`analytics` di semua berkas baru/berubah | kosong |

Catatan: `Safari < 16.4` pada L1 tidak bisa saya buktikan dengan test di lingkungan ini (tidak ada browser matrix); klaimnya bersandar pada spesifikasi Fetch Metadata, dan itulah sebabnya severity-nya Low.

---

## 8. Kesimpulan

Perubahan ini menutup sisa H1 dengan cara yang benar untuk sasaran yang benar: **bukan** mencegah penyerang (yang toh memegang cookie sendiri), melainkan mencegah **tab basi** mengotori akun lain — dan lapisan pertahanannya sekarang tiga (server menolak header yang tidak cocok, browser wajib mengirimnya, tab lain memicu reload saat identitas berubah). Bagian karantina memilih trade-off yang bisa dipertahankan: **cursor tidak pernah melewati record yang belum ditulis**, dan satu-satunya yang "hilang" adalah tampilan record yang memang tidak bisa dibuka dengan kunci sekarang. Yang perlu dibereskan bukan hari ini, tapi sebelum jalur pemulihan kunci hidup: karantina harus punya jalan keluar (M1), dan heuristik deteksi browser sebaiknya diganti `sessions.client` (L1).

**Verdict keamanan: LOLOS.** Tidak ada Critical/High, tidak ada bypass lintas-akun yang bisa direproduksi; M1 dicatat sebagai utang yang harus dibayar sebelum re-key/recovery dirilis.

**Catatan terpisah (bukan keamanan):** M2 membuat janji utama bagian C — "pull terhenti oleh record rusak sekarang bisa pulih" — tidak berlaku bila record rusak sendirian di halamannya (termasuk akun dengan satu record, atau halaman terakhir). Secara keamanan ini "hanya" macet (data tidak hilang, cursor tidak maju), tetapi secara produk itu regresi yang harus diperbaiki sebelum task ditutup. Saya tidak memindahkan status Ergonio; keputusan `review`/`Failed`/`done` ada di QA.

---

## 9. Addendum — verifikasi perbaikan (commit `9cf6037`)

**Tanggal:** 2026-10-24 · **Reviewer:** Arif (Security Engineer) · **Mode:** READ-ONLY (tidak ada kode produk/test yang saya ubah; satu-satunya berkas yang ditulis adalah report ini)
**Scope commit:** `9cf6037` — `server/utils/auth.ts` (aturan L1), `server/tests/http.test.ts`, `app/utils/sync/{controller,quarantine}.ts` + test, `useSyncStatus`, `ShellSyncStatus`, komentar route sync, `reports/qa-t78-hardening.md`.
**Rules dibaca ulang:** `CLAUDE.md` (root), `.claude/rules/{shared-security,shared-code-quality,ergonio-status-flow}.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/{security,code-quality}.md`. `apps/mobile` tidak disentuh.

**Verdict commit ini: LOLOS** — 0 Critical, 0 High, **1 Low baru** (A1), 3 informational. L1 dan L3 tertutup; M2 tertutup untuk bentuk yang paling umum, dengan dua bentuk sisa yang **sengaja** fail-closed (bukan regresi).

### 9.1 L1 — TERTUTUP

| Pertanyaan | Jawaban |
|---|---|
| Apakah browser tanpa Fetch Metadata kini ditolak? | **Ya.** Penentunya sekarang keberadaan cookie sesi (`server/utils/auth.ts:43-45`), bukan `Origin`/`Sec-Fetch-*`. `BROWSER_REQUEST_HEADERS`/`isBrowserRequest` sudah tidak ada (grep bersih). |
| Bukti test | `server/tests/http.test.ts:1113-1136` — cookie + `transport: 'node'` (benar-benar tanpa `Origin`/`Sec-Fetch-*`) tanpa header → **403**, `rateLimitCount === 0`; request identik **dengan** header → **200**. |
| Sisa jalur browser yang tidak membawa cookie? | **Tidak ada yang masih terautentikasi.** Semua jalur yang membuat cookie absen juga membuat request tidak punya kredensial: `credentials:'omit'`, `SameSite=Lax` lintas situs, cookie diblokir (Safari "block all"/third-party), WebView tanpa cookie jar → `requireSession` sudah `401 UNAUTHENTICATED` sebelum aturan ini relevan. Ancaman "tab basi" justru **membutuhkan** cookie ambient, jadi jalur tanpa cookie bukan varian ancaman ini. |
| Apakah ada klien web yang bisa melewatkan header? | Tidak untuk klien yang sah: satu-satunya pembuat client sync memakai `credentials: 'same-origin'` + header (`app/utils/sync/client.ts:84,89`), dan service worker punya `NetworkOnly` untuk `/v1/**` (`nuxt.config.ts:283-286`) sehingga header asli tidak diubah. |
| Cakupan nyata sebelum perbaikan | Terbatas pada **GET** (`Origin` tidak dikirim Safari < 16.4 hanya pada GET same-origin); POST selalu membawa `Origin` dan sudah ditolak CSRF. Jadi yang terekspos dulu adalah `pull` (membaca data akun baru), sekarang tertutup. |
| Efek samping positif | Klien native/CLI di belakang proxy yang menyuntik `Origin` tidak lagi ditolak 403 — L5 (informational) lama otomatis gugur. |

**Catatan batas yang tetap berlaku (bukan temuan baru):** script same-origin (XSS) tetap bisa memanggil endpoint ini dengan `credentials:'same-origin'` dan mengirim header yang benar; kontrol ini memang untuk *kesalahan* tab basi, bukan penyerang. Sudah dicatat di §2 laporan utama.

### 9.2 `cookie kosong` vs `cookie tidak ada` (diverifikasi, bukan asumsi)

`getCookie` (h3 1.15.11 → `cookie-es@1.2.3`) mengembalikan `''` untuk `ip_session=`, `ip_session=""`, dan `a=1; ip_session=` (diverifikasi langsung dengan `parse()`), dan `Boolean('')` = false → `carriesSessionCookie()` menganggapnya **tidak ada**. Itu **konsisten** dengan dua pembaca lain:

- `readSessionToken` (`server/utils/session-cookie.ts:71-72`) juga mengabaikan cookie kosong, jadi cookie kosong tidak pernah menjadi kredensial;
- middleware CSRF (`server/middleware/10-csrf.ts:63`) memakai tes yang sama (`!getCookie(...)`).

Konsekuensinya: tidak ada asimetri yang bisa dipakai — request dengan cookie kosong **tidak terautentikasi** (401 bila tanpa bearer), sehingga "melewatkan kewajiban header" tidak memberi akses apa pun. Perilaku `parse` juga *first-occurrence-wins*; menaruh `ip_session=` lebih dulu hanya membuat request jadi unauthenticated, bukan bypass (dan JS tidak bisa menimpa cookie `HttpOnly` — RFC 6265bis §5.4, entri dengan nama/domain/path sama dari API non-HTTP diabaikan).

**Yang belum ada test-nya (hardening, bukan blocker):** pin `ip_session=` + bearer → 200 tanpa header, dan `ip_session=` tanpa bearer → **401** (bukan 403/500).

### 9.3 Cek regresi klien sah — tidak ditemukan regresi baru

1. **Cookie kedaluwarsa/tidak valid + bearer valid.** Tidak berubah dan **bukan** akibat commit ini: `readSessionToken` memprioritaskan cookie (`session-cookie.ts:71-72`), jadi cookie basi panjang-valid sudah lebih dulu membuat request `401` sebelum `requireExpectedUserId` dipanggil. Aturan baru tidak menambah penolakan di jalur ini.
2. **Cookie basi setelah logout.** `clearSessionCookie` mengirim `Max-Age=0` (cookie dihapus browser), `clearAppStorage` menyapu `ip-*` termasuk daftar karantina. Tab yang tertinggal tetap ditolak 403 oleh aturan L1 bila mengirim header akun lama — perilaku yang diinginkan.
3. **Middleware CSRF.** Tidak berubah; keduanya kini memakai pemicu yang sama ("ada cookie sesi"), sehingga tidak ada kombinasi yang lolos satu lapisan lalu mati di lapisan lain secara tak terduga. POST dari browser lama tetap membawa `Origin` (POST selalu mengirimnya) → CSRF tetap lulus.
4. **Bearer murni (native/CLI).** Tetap bebas header: `http.test.ts:1002-1030` (sesi `client:'mobile'`) dan `:1031-1059` (sesi `client:'web'` lewat bearer) → 200.
5. **Satu-satunya bentuk false-block baru:** lihat **A2** (cookie pendek/asing yang tidak dipakai untuk autentikasi, bersama bearer valid).

### 9.4 Temuan baru

#### A1 — `keyProvenForSession` adalah state modul, bukan state sesi → siklus basi bisa "meminjamkan" bukti kunci ke sesi akun berikutnya · **Low**

**Lokasi:** `apps/web/app/utils/sync/controller.ts:121` (module-level), `:155` (satu-satunya reset, di `startSync`), `:448` (`true` di dalam `buildIndex`, **tanpa** cek `isStale()`), `:503` (dipakai `decidePullKeyFailures`).

**Dampak:** `buildIndex` dipanggil dari `indexFor` **di luar transaksi dan setelah HTTP selesai** (`packages/core/src/sync/pull.ts:196-201`), jadi siklus milik akun lama masih bisa menyelesaikan `decodeRecord` setelah `stopSync()` + `startSync(akunBaru)`. `startSync` sudah mereset flag ke `false`, tetapi siklus basi itu menulisnya kembali ke `true` — sesi akun baru lalu **dianggap sudah membuktikan kunci** padahal belum pernah membuka satu record pun. Akibatnya, sesi dengan kunci salah/absen bisa "membakar" 3 siklus lalu mengarantina record yang sebetulnya hanya butuh kunci yang benar (index-nya tidak pernah dibangun → record tidak tampil), yaitu tepat kelas kehilangan-tampilan yang penjagaan ini dimaksudkan mencegah. Tidak ada kebocoran lintas akun: penulisan karantina tetap memakai `keyFailures.ownerId` = `mySession.userId` (`:298`), dan id record tidak bisa dibaca tanpa kunci data.

**Sifat:** race sempit (butuh pull yang sedang berjalan saat akun berganti), **belum saya reproduksi dengan test** — analisis statis, ditandai potensial.

**Perbaikan minimal:** jangan jadikan flag global; ikat ke sesi/generasi:
```ts
// ActiveSync / execute
let keyProven = false            // per siklus-sesi, bukan modul
// buildIndex: setelah decode sukses
keyProven = true                 // dan kembalikan lewat objek keyFailures
// decidePullKeyFailures: if (!keyFailures.keyProven) ...
```
Alternatif setara: `if (isStale()) return` sebelum menulis flag, atau `keyProvenByGeneration.set(myGeneration, true)` dan baca dengan generasi aktif. Tambahan pengaman: `stopSync()` juga mereset flag.

**Verifikasi:** test — mulai siklus A yang `indexFor`-nya di-*defer*, `stopSync()` + `startSync(B)`, selesaikan dekripsi A, lalu jalankan 3 siklus B dengan semua record gagal → `quarantinedCount(B) === 0` dan `status: 'error'`.

#### A2 — Kewajiban header dipicu "ada cookie", bukan "cookie itulah yang mengautentikasi" · **Low (potensial, fail-closed)**

**Lokasi:** `apps/web/server/utils/auth.ts:43-45` + `:88`, dibanding `apps/web/server/utils/session-cookie.ts:71-80`.

**Dampak:** `readSessionToken` memakai cookie hanya bila panjangnya `>= SESSION_TOKEN_MIN_LENGTH`; kalau tidak, ia jatuh ke bearer. `carriesSessionCookie` hanya memeriksa *keberadaan* nilai non-kosong. Jadi klien bearer sah yang membawa cookie `ip_session` pendek/asing (mis. artefak aplikasi lain di origin yang sama, WebView hybrid, atau sisa tooling) akan **403** walau sama sekali tidak memakai cookie itu dan tidak punya kredensial ambient. Arahnya fail-closed sehingga bukan celah keamanan, tetapi ini false-block yang tidak perlu dan menyulitkan diagnosis (klien "native" tiba-tiba 403).

**Perbaikan minimal:** bawa sumber token dari `requireSession` (mis. `source: 'cookie' | 'bearer'`), lalu:
```ts
if (expected === undefined && auth.source !== 'cookie') return
```
Efeknya sama untuk semua klien yang ada sekarang (web selalu cookie, native selalu bearer), tetapi tidak lagi bergantung pada keberadaan cookie yang tidak dipakai.

**Verifikasi:** test — `Cookie: ip_session=abc` + bearer sah tanpa header → **200**; cookie sah + tanpa header → tetap **403**.

#### A3 — Id record milik sampai 3 akun kini bertahan bersamaan di `localStorage` setelah ganti akun tanpa logout · **Informational (tidak blocking)**

**Lokasi:** `apps/web/app/utils/sync/quarantine.ts:50` (`QUARANTINE_MAX_OWNERS = 3`), `:108-120`, `:162-180`; penyapu tetap ada di `app/composables/useLogout.ts:12-17` (+ `useAccountDeletion.ts:162`).

**Dampak:** desain lama menghapus daftar saat pemilik berganti; sekarang daftar per pemilik dipertahankan (memang itu tujuannya, supaya tab A tidak kehilangan daftarnya karena tab B). Konsekuensi: pada perangkat yang dipakai bergantian tanpa logout, `localStorage` memuat `{userId → [recordId…]}` untuk ≤3 akun. Isinya hanya UUID record + id akun, tanpa blob/plaintext/PII, dan penyapu `ip-*` tetap membersihkannya saat logout/hapus akun. Tidak ada jalur lintas-akun baru: `isQuarantined`/`quarantinedCount` selalu dipanggil dengan pemilik sesi aktif (`controller.ts:298,428,516,522`, `useSyncStatus.ts:63-64`), dan tabrakan id UUIDv7 tidak praktis.

**Rekomendasi:** pertahankan, tetapi (a) tulis eksplisit di `shared-security.md`/komentar bahwa daftar karantina boleh memuat id ≤3 akun sampai logout; (b) kalau nanti ada persyaratan "tidak ada jejak akun lain", hapus pemilik lain saat akun aktif diketahui berbeda **dan** tidak ada tab lain (bisa lewat `BroadcastChannel`, bukan timer).

#### A4 — Karantina: dua detail kecil yang memperpanjang waktu pemulihan (bukan kebocoran) · **Informational**

**Lokasi:** `quarantine.ts:168-179` (early-return bila id sudah ada → **recency pemilik tidak diperbarui**), `:108-110` (`parsed.version !== 1` → seluruh daftar dibaca kosong sehingga data bentuk lama dibuang), `controller.ts:362-365` (`pendingRun` langsung, tanpa jeda — L2 lama tetap berlaku per pemilik).

**Dampak:** (a) akun yang daftarnya paling lama bisa tergusur oleh dua akun lain walau masih aktif, lalu harus mengulang 3 siklus (churn hanya kalau >3 akun aktif bersamaan — tidak realistis, tetapi mudah dihindari dengan menyentuh ulang urutan peta saat id sudah ada); (b) upgrade dari bentuk lama membuang daftar → record rusak dicoba ulang 3 siklus lalu dikarantina lagi (self-healing, tanpa kehilangan data), dan key `ip-sync-quarantine-owner` lama tertinggal sampai logout (tidak berbahaya, hanya sampah).

**Rekomendasi:** sentuh urutan pemilik walau id sudah ada (`owners.delete(ownerId); owners.set(ownerId, ids)` tanpa menambah id), dan hapus `QUARANTINE_OWNER_KEY` lama secara eksplisit saat `writeOwners` pertama.

#### A5 — (test, informational) satu kegagalan nondeterministik pada test QA yang belum di-track

`apps/web/app/utils/sync/controller.quarantine-edges.qa.test.ts` (berkas **untracked**, bukan bagian commit, saya hanya menjalankannya) gagal **satu kali** di run gabungan 19 berkas: `expect(quarantinedCount(USER_A)).toBe(200)` menerima **0** (test "201 record rusak + 1 sehat"). Tiga run identik berikutnya (19 berkas yang sama, dan berkas itu sendirian) **lulus**. Tidak deterministik, penyebab belum pasti (kemungkinan interaksi state antar-berkas di environment `nuxt` atau siklus susulan `pendingRun` yang belum selesai saat assertion). Tidak menggugurkan commit — berkas ini artefak QA dan akan di-track terpisah — tetapi kalau muncul lagi, perlu dipin (`expect.poll`/`vi.waitFor` pada `sync_state`, bukan hanya pada jumlah karantina) sebelum dipakai sebagai gerbang.

### 9.5 Status temuan laporan utama setelah commit ini

| # | Status | Catatan |
|---|---|---|
| M1 (karantina tanpa jalan keluar) | **Terbuka** (tidak berubah) | Tidak disentuh commit ini. Tetap harus dibayar sebelum jalur pemulihan kunci/re-key hidup. |
| M2 (record rusak sendirian) | **Tertutup sebagian** | Bentuk "halaman sehat lalu halaman rusak" dan "3 record rusak satu halaman" kini pulih (`keyProvenForSession`). Dua bentuk sisa **sengaja** fail-closed dan dipin: (a) halaman **pertama** seluruhnya rusak, (b) bukti kunci hilang saat reload karena flag hanya di memori — keduanya tidak bisa dibedakan dari kunci salah tanpa kontrol tambahan. Usulan (hardening): simpan bukti "kunci pernah membuka record" per akun di IndexedDB/`sync_state` (bukan `localStorage`, agar tidak bisa dipalsukan untuk memicu karantina) dan reset saat fingerprint kunci berubah. AC #2 sebaiknya ditulis ulang: "pulih untuk halaman selain halaman pertama tanpa bukti kunci sebelumnya". |
| L1 (deteksi browser dari header) | **Tertutup** | §9.1. |
| L2 (daftar penuh + retry tanpa jeda) | **Terbuka** (skala per pemilik) | `pendingRun` segera masih ada; batas 200 kini per pemilik sehingga loop hanya untuk satu akun dengan >200 kegagalan/halaman. |
| L3 (kepemilikan daftar hanya saat menulis) | **Tertutup** | Daftar per pemilik + pembacaan sadar-pemilik (`quarantine.ts:146-193`, `useSyncStatus.ts:63-64` via `localData.state.userId`) → angka akun lama tidak lagi tampil. |
| L4 (`refresh()` gagal → false logout) | **Terbuka** (tidak berubah) | Tidak disentuh commit ini. |
| L5 (kontrak native boleh tanpa header) | **Gugur / dibalik** | Penentu sekarang transport (cookie), bukan penanda browser: klien native di belakang proxy yang menyuntik `Origin` tidak lagi 403. Kontrak baru yang perlu didokumentasikan di `packages/contracts`: **"membawa cookie sesi ⇒ WAJIB `x-expected-user-id`"**. |

### 9.6 Acceptance criteria tambahan (untuk commit ini)

1. **Penentu kewajiban header adalah cookie sesi, bukan metadata browser.** `auth.ts:43-45,88`; dua test baru (`http.test.ts:1113-1136`, `:1031-1059`).
2. **Penolakan tetap sebelum rate limit/body/query.** `pull.get.ts:38-45`, `push.post.ts:33-39`; test `rateLimitCount === 0`.
3. **Jalur bearer tanpa cookie tetap dilayani.** `http.test.ts:1002-1059`.
4. **Cookie kosong diperlakukan sama oleh auth, token, dan CSRF.** `auth.ts:43-45` ↔ `session-cookie.ts:71-72` ↔ `10-csrf.ts:63`; (belum ada test — tambahkan).
5. **State karantina terikat pemilik, tanpa kebocoran lintas akun.** `quarantine.ts:146-193`; test `quarantine.test.ts:84-136`; `quarantinedCount` hanya menerima pemilik aktif.
6. **Bukti kunci tidak boleh diwarisi antar-sesi.** **BELUM TERPENUHI** untuk jalur siklus basi (A1).
7. **Tidak ada log/PII baru.** Grep `console.`/analytics pada berkas yang berubah: kosong.

### 9.7 Bukti eksekusi (read-only)

| Perintah | Hasil |
|---|---|
| `pnpm --filter @improve-personal/web exec vitest run server/tests` | **12 berkas / 202 test lulus** (Nitro + Postgres nyata) |
| `pnpm exec vitest run app/utils/sync app/composables/useSyncStatus.test.ts app/components/features/shell` | **19 berkas / 88 test lulus** |
| `pnpm exec vitest run app/plugins app/utils/auth` | **3 berkas / 24 test lulus** |
| `pnpm exec vitest run app/utils/sync/controller.quarantine-edges.qa.test.ts` (berkas QA **untracked**, hanya dijalankan) | 5 lulus pada run terisolasi; 1 kegagalan nondeterministik pada satu run gabungan (A5) |
| Verifikasi `parse()` cookie-es untuk `ip_session=`, `ip_session=""`, dan duplikat | `''` (falsy) — sesuai §9.2 |
| Grep sisa `BROWSER_REQUEST_HEADERS`, `isBrowserRequest`, `adoptQuarantineAccount`, `QUARANTINE_OWNER_KEY`, `quarantinedCount()` tanpa argumen | **kosong** (tidak ada referensi mati) |

Tidak ada kode produk maupun test yang saya ubah; `git status` hanya memuat berkas report ini (dan berkas QA untracked yang sudah ada sebelumnya).

### 9.8 Kesimpulan addendum

Perbaikan L1 dilakukan dengan **penentu yang benar**: bukan metadata request yang bisa tidak dikirim/diubah proxy, melainkan kredensial ambient yang memang menjadi akar ancamannya. Tidak ada jalur browser terautentikasi yang bisa melewatinya, dan penolakan tetap terjadi sebelum jatah/body/query. Perbaikan karantina per pemilik menutup L3 dan menghapus satu sumber churn antar-tab; harga yang dibayar adalah retensi id ≤3 akun di `localStorage` sampai logout (A3, informational).

Yang perlu dibereskan (tidak blocking): **A1** — jadikan bukti kunci milik sesi/generasi, bukan modul, supaya penjagaan "kunci salah vs record rusak" tidak bisa diwarisi siklus basi; **A2** — picu kewajiban header dari *sumber token* (`cookie` vs `bearer`), bukan dari keberadaan cookie yang mungkin tidak dipakai.

**Verdict addendum: LOLOS** untuk commit `9cf6037`. Status Ergonio tidak saya pindahkan; keputusan `review`/`done`/`Failed` milik QA.
