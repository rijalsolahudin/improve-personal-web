# Security review #79 — pemulihan record terkarantina tanpa menunggu server

**Tanggal:** 2026-10-24 · **Reviewer:** Arif (Security Engineer) · **Mode:** READ-ONLY (tidak ada kode produk yang diubah)
**Scope:** `git diff c267a45..HEAD` (`40a1d96`) — 31 berkas, 2.626 insertions.
**Rules dibaca:** `CLAUDE.md` (root), `.claude/rules/shared-security.md`, `.claude/rules/shared-code-quality.md`, `.claude/rules/ergonio-status-flow.md`, `apps/web/AGENTS.md`, `apps/web/CLAUDE.md`, `apps/web/.claude/rules/security.md`. `apps/mobile` tidak disentuh, jadi rules mobile tidak dimuat.

**Verdict keamanan: LOLOS** — 0 Critical, 0 High, 0 Medium. 3 Low (semuanya *hardening/consistency*, bukan jalur eksploit) + 5 informational. Tidak ada jalur lintas-akun baru, tidak ada PII baru yang bocor, tidak ada pelemahan kontrol #76–#78.

> Catatan tata kelola: saya **tidak** memindahkan status Ergonio. Verdict ini soal keamanan; keputusan `done` tetap milik QA/PO.

---

## 0. Pertanyaan terbuka (menentukan severity, bukan verdict)

1. **Apakah `putRecordIndex` akan segera dipakai jalur lain (mobile adapter, import/restore)?**
   - A. Hanya reindex web (kondisi hari ini) → L2 tetap **Low**.
   - B. Akan dipakai lebih luas (mis. "sembunyikan record" atau rebuild massal dari import) → L2 naik jadi **Medium**: API-nya mengizinkan penghapusan index tanpa jejak, dan tiap pemakai baru wajib tahu aturan "jangan kirim `null` untuk record yang ada".
   - **Asumsi saya: A.**
2. **Apakah `clearAppStorage` satu-satunya jalur "lupakan akun ini" (vs. ada pembersihan parsial lain di masa depan)?**
   - A. Ya (logout + hapus akun) → L3 cukup ditutup dengan test regresi.
   - B. Akan ada pembersihan selektif → butuh daftar key eksplisit, bukan hanya prefix.
   - **Asumsi saya: A.**
3. **Native/WebView yang membawa cookie jar: apakah didukung?**
   - A. Tidak (mobile = `Authorization: Bearer`, tanpa cookie jar) → L1 murni konsistensi, tidak perlu buru-buru.
   - B. Ya (PWA/WebView) → L1 jadi **Medium** karena A2 tidak tercapai untuk `POST/PUT` (klien sah tetap 403 dari middleware CSRF, bukan dari auth).
   - **Asumsi saya: A hari ini.** Kalau B, perbaiki L1 di task yang sama.

---

## 1. Ringkasan risiko & verdict

| # | Sev | Temuan | Sifat |
|---|---|---|---|
| L1 | Low | Middleware CSRF masih menentukan "request ini membawa kredensial ambient" dari **keberadaan** cookie (`getCookie`), sedangkan authz sekarang dari **sumber token** (`auth.source`). Untuk klien bearer yang kebetulan membawa cookie `ip_session` pendek/asing, `push`/`pull` mutasi tetap ditolak 403 oleh middleware — perbaikan A2 baru berlaku untuk `GET`. Fail-closed (tidak ada bypass), tetapi dua lapisan kini punya definisi berbeda soal hal yang sama. | Baru (inkonsistensi yang diperkenalkan A2) |
| L2 | Low | Port `putRecordIndex(recordId, index \| null)` mengizinkan **menghapus** baris `record_index` milik record yang ada, tanpa menyentuh `record`/`sync_state` dan tanpa penanda apa pun. Pemanggil produksi satu-satunya (`reindex.ts`) selalu mengirim entri non-null, jadi belum ada dampak hari ini — tapi ini API "sembunyikan record" yang siap dipakai keliru. | Baru (permukaan API) |
| L3 | Low | Key karantina baru (`ip-sync-quarantine-due`) benar tersapu `clearAppStorage` **karena kebetulan prefix-nya sama**; tidak ada test yang mengunci itu. Rename key tanpa prefix `ip-` akan meninggalkan UUID record + id akun di perangkat bersama setelah logout, tanpa ada yang gagal. | Baru (celah test, bukan celah kode) |

**Informational (bukan temuan):** I1 prioritas cookie atas bearer tanpa fallback (availability), I2 drift dok/behavior di `useKeyRecovery`, I3 drift dok di test QA, I4 isi `localStorage` karantina, I5 biaya 200 transaksi `strict` di tombol manual.

Tidak ada temuan pada: kebocoran lintas akun lewat reindex/karantina, penulisan index lintas DB, `putRecordIndex` dipakai untuk menyembunyikan record yang ada, PII/id record di log/analytics/UI, salah tentukan `source` (TOCTOU, cookie kosong, header ganda, prioritas cookie), regresi #76–#78.

---

## 2. Threat model singkat (fokus yang berubah)

- **Aset baru di permukaan:** baris `record_index` (metadata tampilan: tipe entitas + rentang waktu + `updatedAtMs`) yang sekarang bisa ditulis **tanpa** menulis `record`/`outbox`.
- **Aktor:**
  (a) **tab basi** akun A yang masih hidup setelah user login sebagai B di tab lain (threat H1 — kesalahan, bukan penyerang);
  (b) **user lain di perangkat/origin yang sama** (shared device);
  (c) **script same-origin (XSS)** — di luar batas desain, tapi dipakai sebagai pembanding "apakah kontrol baru menambah kemampuan";
  (d) **server/penyusup yang mengontrol ciphertext** — bisa mengirim blob yang tidak bisa dibuka, memicu karantina.
- **Trust boundary baru:** `localStorage` (daftar karantina + antrean "due") → `reindexQuarantined()` → IndexedDB akun **saat ini**. Ini boundary yang paling perlu dijaga: input dari `localStorage` (bisa ditulis siapa pun yang bisa jalan di origin) dipakai untuk memilih record mana yang index-nya ditulis.
- **Kenapa boundary itu aman** (lima lapis, semuanya independen):
  1. `current()` menolak sesi lokal yang `userId`-nya ≠ sesi auth (`useLocalData.ts:186-191`) → reindex tidak pernah jalan untuk akun yang tidak sedang login;
  2. daftar karantina difilter per pemilik: `listQuarantined(session.userId)` (`reindex.ts:62`, `quarantine.ts:521-551`) → id akun lain tidak pernah jadi kandidat;
  3. nama database memuat `userId` dan divalidasi UUID (`database-names.ts:15-37`) → id akun A tidak bisa menunjuk DB akun B;
  4. `putRecordIndex` **memeriksa keberadaan record di dalam transaksi yang sama** sebelum menulis index (`indexeddb.ts:337-352`, `memory.ts:142-156`) → id "asing" tidak meninggalkan baris index yatim;
  5. index dibangun dari **hasil dekripsi dengan `session.dataKey`** (`reindex.ts:136`) → record milik akun lain tidak bisa didekripsi, jadi `null`/tidak ada yang ditulis.

  Kombinasi 2+4+5 menutup skenario yang ditanyakan: *"id karantina akun A + sesi akun B"* berakhir sebagai **no-op**, bukan index lintas akun.
- **Perubahan pada kontrol header (A2):** yang menentukan kewajiban `x-expected-user-id` sekarang **sumber token** (`auth.source`), bukan keberadaan cookie. Ini **bukan** pelonggaran terhadap threat H1: cookie yang benar-benar dipakai untuk autentikasi selalu panjang ≥ `SESSION_TOKEN_MIN_LENGTH` (token sesi = base64url 32 byte = 43 karakter, `server/utils/crypto.ts:25`), dan justru kondisi itulah yang membuat `source === 'cookie'`.

---

## 3. Jawaban atas enam fokus review

| # | Fokus | Hasil |
|---|---|---|
| 1 | Kebocoran lintas akun lewat reindex/karantina | **Tidak ada jalur.** Reindex tidak pernah menyentuh jaringan: masukannya `localStorage` (**per pemilik**), keluarannya `record_index` di DB akun yang sedang terbuka, dan sesi lokal wajib cocok dengan sesi auth (`useLocalData.ts:186-191`). Id karantina akun lain yang entah bagaimana masuk ke daftar akun ini tetap **no-op** karena `putRecordIndex` menghitung dulu keberadaan record di transaksi yang sama (`indexeddb.ts:343`, `memory.ts:147`). Record yang tidak bisa didekripsi dengan kunci akun ini tidak pernah menghasilkan index (`reindex.ts:135-140`). Satu-satunya jalur "memunculkan record" adalah record yang memang sudah ada di DB akun itu dan bisa dibuka kuncinya — yaitu data user itu sendiri. Tombol/auto-reindex memakai `localData.current()` yang sudah parity-checked (`ShellSyncStatus.vue:74-82,116-121`). |
| 2 | `localStorage` karantina (dua key) | **Tidak menambah permukaan berarti.** Isinya: `userId` (UUID akun sendiri) + UUID record + `atMs`. Tidak ada blob, plaintext, atau potongan kunci (`quarantine.ts:36-38,60`). UUID record **sudah** ada di IndexedDB (`record` row key) dan di payload SSR setiap halaman yang menampilkan record, jadi daftar ini tidak memberi kemampuan baca baru; `atMs` hanya mengungkap kapan sync gagal (kategori metadata yang sama dengan `createdAtMs`/`updatedAtMs` di `record`). Batas 200 id × 3 pemilik (`quarantine.ts:70,77`) mencegah pembengkakan. **`clearAppStorage` menyapu keduanya** — `ip-sync-quarantine` dan `ip-sync-quarantine-due` sama-sama berprefix `ip-` (`quarantine.ts:47,62`), dan `clearAppStorage` membuang semua key berprefix itu (`useLogout.ts:12-17`), dipanggil saat logout (`useLogout.ts:43`) dan hapus akun (`useAccountDeletion.ts:162`). **Celahnya hanya test** (L3). Anomali kecil: `stringIds` tidak membatasi panjang id (`quarantine.ts:128-132`), jadi daftar yang ditulis script same-origin bisa berisi string sangat panjang — self-DoS, bukan eskalasi (I4). |
| 3 | Sumber token (`source`) | **Tidak bisa salah untuk kasus yang dijaga.** `source` **ditentukan di fungsi yang sama** yang memilih token (`session-cookie.ts:84-99`) dan ditempel ke hasil `requireSession` (`auth.ts:35-44`), jadi tidak ada pembacaan cookie kedua yang bisa berbeda → **tidak ada TOCTOU**: header request immutable setelah masuk. **Cookie kosong** (`Max-Age=0` sisa `clearSessionCookie`) → falsy → jatuh ke bearer, dan memang tidak ada kredensial ambient yang dipakai. **Cookie pendek (<32)** tidak mungkin token sah (token = 43 char) → aman jatuh ke bearer. **Cookie panjang tapi bukan sesi** → `findSessionByToken` gagal → `UNAUTHENTICATED`, *tidak* fallback ke bearer (fail-closed; I1). **Header ganda** (`Authorization: Bearer a, Bearer b`): Node menggabung nilai → string hasil gabungan tidak mungkin cocok dengan hash sesi mana pun → 401; sumber tetap header itu sendiri, jadi `source` tidak bisa "berpindah" ke cookie. **Prioritas cookie** benar untuk aturan header: cookie valid + bearer akun lain → sesi = pemilik cookie, header wajib, dan header identitas bearer tetap 403 — dikunci test `http.test.ts` "bearer sah + cookie VALID milik user lain". **Konsumen `source` tunggal** (`requireExpectedUserId`, `auth.ts:91-100`); tidak ada tempat lain yang menebak kanal. **Satu inkonsistensi tersisa di lapisan lain** (bukan di `source`): middleware CSRF masih memakai keberadaan cookie → L1. |
| 4 | Integritas data (`putRecordIndex` tanpa outbox) | **Tidak ada pemanggil yang mengirim `null`.** `grep putRecordIndex` → satu-satunya pemakaian produksi adalah `reindex.ts:96-98` dengan `index` hasil `indexOf()` yang **selalu** entri nyata (dikembalikan `null` hanya saat gagal, dan `null` itu berujung `continue`, bukan penulisan — `reindex.ts:91-92`). Jalur "payload/skema tidak dikenal" sengaja **tidak** menulis apa pun sehingga index lama tetap ada (`reindex.ts:29-31`, diuji `reindex.test.ts:227`). Penghapusan index hanya mungkin lewat API (`null`), bukan lewat data masukan — dan `null` di kontrak dijelaskan sebagai "record ini tidak punya dimensi waktu", bukan "sembunyikan" (`ports.ts:103-123`). Konsekuensi lain yang saya periksa dan aman: tombstone (`deleted: true`) yang index-nya dibangun ulang **tidak** muncul di UI karena `queryByRange` menyaring `row.deleted` (`indexeddb.ts:475`); `updatedAtMs` index tidak dipakai untuk urutan (`compareIndexEntries` mengurutkan `rangeStartMs`, `repository/index-entry.ts:89-98`); `record.updatedAtMs` tidak ikut bergeser (kontrak diuji `contract.ts:308-310`). **Sisa risiko = bentuk API** (L2). |
| 5 | Log/PII | **Bersih.** Tidak ada `console.*`, logger, analytics, atau breadcrumb di seluruh berkas baru/berubah (`grep`), tidak ada pelaporan error klien. Pesan error baru tidak memuat id: `reindex` menelan error tanpa argumen (`reindex.ts:99-102,138-140`), `ShellSyncStatus` menelan kegagalan import/eksekusi (`:87-91`), `useKeyRecovery` menelan kegagalan pemulihan record (`:91-93,105-107`). UI hanya menampilkan **jumlah** (`i18n/locales/id.json:89-90`, template `ShellSyncStatus.vue:208-212`), dan label transaksi IndexedDB konstan (`'sync.reindex'`, `reindex.ts:96`) — tidak ada id di label. Tidak ada id record/blob/kunci yang dikirim ke server oleh fitur ini: reindex **tidak melakukan request apa pun**. `RecordKeyError.message` memuat id record, tapi tidak pernah dicetak/diserialisasi di jalur ini. |
| 6 | Regresi #76–#78 | **Utuh, dan sebagian membaik.** H1 tetap berlaku: cookie valid → header wajib → tab basi ditolak `FORBIDDEN` sebelum rate limit/body/DB (`auth.ts:91-100`, test 49 lulus termasuk "cookie sesi + header user lain"). A1 (bukti kunci tidak diwariskan siklus basi) tidak berubah — `reindex` tidak menyentuh `keyFailures`/`consecutiveKeyFailures`, ia hanya membaca/menulis lokal. Abort controller & `stopSync` tidak berubah. Isolasi akun **menguat**: `blockedCount` sekarang dihitung dari `listQuarantined(ownerId)` yang terfilter pemilik (`useSyncStatus.ts:69-70`), menggantikan `quarantinedCount(ownerId)` yang dulu juga terfilter — tidak ada regresi pada L3 #78. `refresh.ts` melepas reloader saat scope dispose (perubahan kecil, tidak menyentuh auth). Test #77/#78 yang diubah hanya penyesuaian hitungan pull/sesi, dan lulus. |

---

## 4. Temuan

### L1 — Dua lapisan punya definisi berbeda soal "membawa kredensial ambient"

- **Lokasi:** `apps/web/server/middleware/10-csrf.ts:63` (`if (!getCookie(event, SESSION_COOKIE_NAME)) return`) vs `apps/web/server/utils/auth.ts:98` (`if (expected === undefined && auth.source === 'bearer') return`).
- **Dampak:** bukan kebocoran. Middleware memakai **keberadaan** cookie; authz memakai **sumber token**. Untuk request mutasi (`POST/PUT/PATCH/DELETE`) dari klien bearer yang membawa cookie `ip_session` pendek/asing — skenario yang persis jadi motivasi A2 — middleware **masih** menolak `FORBIDDEN` karena tidak ada bukti same-origin. Artinya perbaikan A2 baru efektif untuk `GET /v1/sync/pull`; `POST /v1/sync/push` tetap gagal untuk klien itu.
- **Bukti bahwa ini nyata (dan kenapa test tidak menangkapnya):** test A2 memakai helper `api()` yang **menambahkan `sec-fetch-site: same-origin` setiap kali ada cookie pada method mutasi** (`server/tests/http.test.ts:145-163`). Jadi assertion `200` di test "bearer sah + cookie `ip_session` pendek/asing" bergantung pada header yang dikirim harness, bukan pada perilaku klien nyata (native tidak mengirim Fetch Metadata).
- **Skenario:** WebView/PWA memakai `Authorization: Bearer`; cookie `ip_session` sisa percobaan login sebelumnya (pendek/garbage). `pull` (GET) → 200. `push` (POST) → 403 tanpa penjelasan, user melihat "Gagal sinkron" padahal tokennya sah.
- **Perbaikan (1 baris, satu sumber kebenaran):**
  ```ts
  // 10-csrf.ts
  import { readSessionToken } from '../utils/session-cookie'
  ...
  if (readSessionToken(event)?.source !== 'cookie') return
  ```
  Alasan aman: cookie yang tidak dipakai sebagai token tidak bisa dipakai penyerang lintas situs (tidak ada autentikasi dari cookie), sedangkan cookie yang dipakai selalu `source: 'cookie'` sehingga cek same-origin tetap berlaku untuk semua request yang benar-benar meminjam sesi ambient.
- **Cara verifikasi:** test baru di `http.test.ts` — `api('/v1/sync/push', { cookie: 'ip_session=abc', token, sameOriginProof: false, transport: 'node' })` harus `200` **tanpa** `sec-fetch-site`; dan test lama "cookie VALID tanpa header" harus tetap `403` dari `requireExpectedUserId` (bukan dari middleware) — bedakan lewat `problemOf(...).error.code` + `rateLimitCount === 0`.

### L2 — `putRecordIndex(recordId, null)` = hapus index tanpa jejak, tersedia sebagai API publik

- **Lokasi:** `packages/core/src/ports.ts:123`; implementasi `apps/web/app/utils/storage/indexeddb.ts:337-353` dan `packages/core/src/adapters/memory.ts:141-155`; kontrak mengunci perilaku ini di `packages/core/src/adapters/contract.ts:352-367`.
- **Dampak:** siapa pun yang memanggil `putRecordIndex(id, null)` untuk record yang **ada** menghapus baris `record_index`-nya: record lenyap dari `queryByRange`, `listAll`, kalender, dan export, sementara `record`, `sync_outbox`, dan `sync_state` tidak berubah — jadi tidak ada error, tidak ada badge, tidak ada sinyal apa pun. Ini persis kelas bug yang dijaga `RECORD_INDEX_KEEP` (`storage/index-decision.ts:5-18`).
- **Skenario eksploit:** tidak ada hari ini — satu-satunya pemanggil produksi selalu non-null (`reindex.ts:96-98`), dan tidak ada input dari jaringan/user yang bisa memilih `null`. Jadi ini **bukan** kerentanan yang bisa direproduksi, melainkan permukaan API yang salah bentuk: jalur "rebuild" tidak pernah butuh `null` (index selalu bisa diturunkan dari `indexEntryForRecord`, yang tidak pernah mengembalikan `null` — `io/index-entry.ts:24-37`).
- **Perbaikan:** persempit port menjadi `putRecordIndex: (recordId: string, index: RecordIndexEntry) => Promise<void>`. Penghapusan index tetap milik `putRecord(index: null)`, jalur yang memang punya konteks "tulisan user mengubah dimensi waktu". Kalau `null` tetap dipertahankan (mis. untuk adapter mobile nanti), tambahkan komentar eksplisit "JANGAN dipakai untuk menyembunyikan record" + test yang menegaskan reindex tidak pernah mengirim `null`.
- **Cara verifikasi:** `tsc -p packages/core` gagal kalau adapter masih menerima `null`; `reindex.test.ts:227` ("payload/skema tidak dikenal … tidak menulis null") tetap lulus.

### L3 — Key karantina "due" hanya tersapu logout karena kebetulan prefix-nya sama (tidak terkunci test)

- **Lokasi:** `apps/web/app/utils/sync/quarantine.ts:62` (`ip-sync-quarantine-due`) → `apps/web/app/composables/useLogout.ts:12-17` (prefix `ip-`, `shared/tech-identity.ts:26-32`).
- **Dampak:** hari ini **benar** — kedua key berprefix `ip-` dan `clearAppStorage` membuang semua key berprefix itu saat logout (`useLogout.ts:43`) maupun hapus akun (`useAccountDeletion.ts:162`). Risikonya laten: tidak ada test yang mengunci hubungan itu (`useLogout.test.ts:31-49` hanya menguji `ip-theme`/`ip-style`/`ip-deco`; `quarantine.test.ts:230` menguji `clearQuarantine`, bukan `clearAppStorage`). Rename key tanpa prefix (atau key baru yang lupa prefix) akan meninggalkan **id akun + UUID record** di perangkat bersama setelah logout — persis data yang #78 klaim disapu.
- **Skenario:** rename `sync-quarantine-due` → `syncQuarantineDue` (gaya yang wajar saat refactor) lolos code review, test hijau, dan perangkat pinjaman menyimpan jejak akun sebelumnya.
- **Perbaikan:** tambah satu test di `useLogout.test.ts`:
  ```ts
  localStorage.setItem(QUARANTINE_STORAGE_KEY, '{}')
  localStorage.setItem(QUARANTINE_DUE_STORAGE_KEY, '{}')
  clearAppStorage(localStorage)
  expect(localStorage.getItem(QUARANTINE_STORAGE_KEY)).toBeNull()
  expect(localStorage.getItem(QUARANTINE_DUE_STORAGE_KEY)).toBeNull()
  ```
  (impor konstanta dari `quarantine.ts`, jangan hardcode string) — plus satu assertion bahwa keduanya `startsWith(APP_STORAGE_PREFIX)`.
- **Cara verifikasi:** test di atas merah kalau prefix diubah.

---

## 5. Informational

- **I1 — Cookie panjang yang bukan sesi tidak fallback ke bearer.** `session-cookie.ts:85-88` memprioritaskan cookie begitu panjangnya ≥ 32, walau tokennya tidak ada di DB. Untuk klien bearer dengan cookie panjang sisa domain lain hasilnya `UNAUTHENTICATED` (401) — fail-closed dan perilaku ini sudah ada sebelum diff, tetapi sekarang `source` ikut bergantung padanya. Belum ada test untuk kombinasi "cookie panjang tidak valid + bearer valid". Saran: tambahkan test yang mengunci 401 (bukan fallback) supaya kalau nanti fallback ditambahkan, `source` ikut diperbarui di tempat yang sama.
- **I2 — Drift dokumen vs perilaku di `useKeyRecovery`.** Docblock `useKeyRecovery.ts:76-77` masih menulis "baru karantina sisanya dibersihkan", padahal implementasi sengaja **tidak** membersihkan (`:99-102`, dan `clearQuarantine` tidak lagi dipanggil dari sana). `const id = session.value?.user.id` (`:95`) kini hanya penjaga, nilainya tidak dipakai — pembaca berikutnya akan mengira `id` dipakai untuk membersihkan karantina akun itu. Saran: ganti guard jadi `if (session.value === undefined) return` dan perbaiki kalimat docblock. (Kerapian, bukan keamanan — tapi dokumen yang menyesatkan di jalur pemulihan kunci berbahaya.)
- **I3 — Drift dokumen di test QA.** `ShellSyncStatus.blocked.qa.test.ts:19` menyebut klik "membersihkan karantina akun aktif"; perilaku sekarang adalah reindex + rilis hanya yang pulih/hilang. Judul/komentar test sebaiknya ikut disesuaikan supaya tidak menyesatkan review berikutnya.
- **I4 — Bentuk isi `localStorage`.** `{version, owners: {userId: [{atMs, ids[]}]}}`, tanpa enkripsi. Tidak ada kemampuan baru bagi penyerang same-origin (id record & timestamp sudah ada di IndexedDB), tetapi `stringIds` tidak membatasi panjang id maupun jumlah karakter per entri (`quarantine.ts:128-132`) — script same-origin bisa memenuhi kuota `localStorage` dan membuat penulisan karantina lain gagal (efeknya: `isQuarantined()` false → pull mencoba ulang; tidak ada kehilangan data). Kalau mau dirapikan: batasi `id.length` (mis. ≤ 64) dan buang entri yang bukan UUID.
- **I5 — Biaya transaksi (performa, non-blocking).** `reindexQuarantined` melakukan **satu transaksi `durability: 'strict'` per record** (`reindex.ts:96-98`), sampai 200 transaksi pada tombol "Coba buka ulang". Di perangkat lambat itu berarti stall beberapa detik di main thread saat tombol ditekan. Kalau terukur mengganggu, gabungkan per batch 20 id dalam satu transaksi (tetap tanpa `await` non-storage di dalamnya).

---

## 6. Acceptance criteria keamanan (yang harus tetap benar setelah implementasi)

1. `reindexQuarantined()` hanya membaca daftar milik `session.userId`, dan sesi itu hanya bisa diperoleh lewat `localData.current()` / `ensure()` (parity dengan sesi auth). Tidak boleh ada pemanggil yang mengoper sesi "tebakan".
2. `putRecordIndex` **tidak pernah** dipanggil dengan `null` dari jalur rebuild; index hanya ditulis setelah `decodeRecord` berhasil dengan `session.dataKey`.
3. Untuk record yang tidak ada di storage, `putRecordIndex` tidak meninggalkan baris index yatim (dijaga di dalam transaksi, bukan di pemanggil).
4. `reindexQuarantined` tidak membuat baris `sync_outbox` dan tidak menyentuh `sync_state` (diuji kontrak + `reindex.test.ts:188`).
5. Index lama **tidak** dihapus untuk record yang masih tidak bisa dibuka (payload asing, skema lebih baru, `RecordKeyError`).
6. Tidak ada id record / blob / potongan kunci di UI, log, analytics, label transaksi, atau event.
7. `source` ditentukan di `readSessionToken` dan tidak pernah dibaca ulang dari cookie di helper lain; `source === 'cookie'` ⇒ header wajib; `source === 'bearer'` ⇒ header opsional; nilai header yang tidak cocok ⇒ `FORBIDDEN` sebelum rate limit.
8. Kedua key karantina ikut tersapu logout & hapus akun (dikunci test).
9. Middleware CSRF dan `requireExpectedUserId` memakai definisi yang sama soal "membawa kredensial ambient" (setelah L1 diperbaiki).

---

## 7. Hardening yang direkomendasikan (non-blocking)

- **H1** — Persempit port `putRecordIndex` (L2). Ini perubahan tipe, bukan perilaku; biayanya paling murah sekarang selagi pemanggilnya satu.
- **H2** — Satukan predikat "cookie dipakai sebagai token" antara CSRF dan authz (L1) supaya tidak bisa menyimpang lagi.
- **H3** — Tambah test lintas-akun untuk reindex: `quarantineRecord(B, idX)` sementara sesi A → `reindexQuarantined(sessionA, {dueOnly:false})` tidak menyentuh daftar B dan tidak menulis index apa pun. Struktur kode sudah menjaminnya (lima lapis di §2), tetapi belum ada test yang mengunci.
- **H4** — Untuk record yang payload-nya lebih baru dari build ini (skema > `CURRENT_SCHEMA_VERSION`), pertimbangkan pesan yang berbeda dari "tidak bisa dibuka": user bisa saja hanya perlu memperbarui aplikasi. Ini akurasi komunikasi, bukan keamanan.
- **H5** — Batasi bentuk id yang diterima dari `localStorage` (UUID saja, panjang terbatas) untuk menutup self-DoS kuota (I4).
- **H6** — Kalau adapter mobile kelak mengimplementasikan `TransactionContext`, pastikan semantik "record tidak ada = no-op" dan "tidak menulis outbox" ikut di kontrak (sudah ada di `contract.ts`; jalankan suite itu untuk adapter baru).

---

## 8. Verifikasi yang dijalankan (read-only, pada working tree bersih / `HEAD`)

| Perintah | Hasil |
|---|---|
| `npx vitest run app/utils/sync/reindex.test.ts app/utils/sync/quarantine.test.ts app/utils/sync/quarantine.due.test.ts app/components/features/shell/ShellSyncStatus.reindex.test.ts` | 4 berkas, **29 test lulus** |
| `npx vitest run app/composables/useKeyRecovery.test.ts app/composables/useKeyRecovery.reindex.test.ts app/utils/sync/controller.quarantine-recovery.test.ts` | 3 berkas, **6 test lulus** |
| `npx vitest run server/tests/http.test.ts` | **49 test lulus** (termasuk H1, L1, dan dua test A2 baru) |
| `npx vitest run` (packages/core) | 22 berkas, **379 test lulus** (termasuk suite kontrak `putRecordIndex` untuk adapter memori) |
| `npx tsc -p tsconfig.json --noEmit` (packages/core) | lulus |
| `npx nuxt typecheck` (apps/web) | lulus (perlu `nuxt prepare` dulu — artefak `.nuxt` di mesin ini basi; `.nuxt` gitignored, tidak ada berkas produk yang berubah) |

Tidak dijalankan: `eslint` — repo ini **tidak punya** config ESLint di root maupun `apps/web` (`eslint.config.*` tidak ada, `.eslintrc*` tidak ada), jadi script `lint` tidak bisa dipakai sebagai gate. Bukan temuan task ini, tapi berarti aturan "console dilarang" saat ini hanya dijaga lewat review + pembuangan `console.*` di minifier Rolldown (`apps/web/nuxt.config.ts:503` — `removeLoggers` nuxt-security sengaja `false` karena opsinya diabaikan Vite 8).

**Berkas yang saya baca penuh:** `packages/core/src/ports.ts` (diff), `adapters/memory.ts` (diff), `adapters/contract.ts` (diff), `apps/web/app/utils/storage/indexeddb.ts` (bagian tulis + query), `storage/session.ts`, `storage/database-names.ts`, `storage/record-codec.ts`, `storage/index-decision.ts`, `io/index-entry.ts`, `utils/sync/{reindex,quarantine,controller,events,refresh}.ts`, `composables/{useLocalData,useLogout,useSyncStatus,useKeyRecovery,useAccountDeletion}.ts`, `components/features/shell/ShellSyncStatus.vue`, `server/utils/{session-cookie,auth}.ts`, `server/middleware/10-csrf.ts`, `server/routes/v1/{sync/pull.get,sync/push.post,auth/session.get,auth/logout.post}.ts`, `server/services/session.ts` (bagian relevan), `server/tests/http.test.ts` (diff + helper), `i18n/locales/id.json` (diff).

**Cara saya memverifikasi klaim tanpa menjalankan serangan:** penelusuran jalur (input → sink) untuk setiap fokus, pembacaan test yang mengunci tiap klaim, dan `grep` seluruh repo untuk `putRecordIndex`, `SESSION_COOKIE_NAME`, `readSessionToken`, `console.`, `clearAppStorage`, dan `updatedAtMs` guna memastikan tidak ada pemanggil/konsumen yang terlewat.

---

## 9. Catatan lingkungan: perubahan tak-ter-commit saat review berjalan

Selama review ini berjalan, working tree di worktree yang sama **berubah** (agen lain — QA, "mutasi"). Ini **di luar** `c267a45..HEAD` dan **tidak** saya hitung sebagai bagian diff yang saya setujui:

```
 M apps/web/app/utils/sync/reindex.ts
?? apps/web/app/utils/sync/reindex.recovery.qa.test.ts
```

Mutasi yang terlihat pada `reindex.ts:105-111`:

```ts
-  if (releasedIds.length > 0) releaseQuarantined(session.userId, releasedIds)
+  // MUTASI QA: pelepasan karantina dihapus
+  void releasedIds
```

**Kalau ini sampai ter-commit, itu regresi integritas (bukan kebocoran):** record yang sudah pulih tetap tercatat terkarantina selamanya ⇒ `blockedCount` tidak pernah turun ⇒ UI terus bilang "n data tidak bisa dibuka" untuk data yang **sudah** tampil, dan setiap mount halaman mendekripsi ulang record yang sama (`reindexQuarantined` dipanggil lagi karena id masih ada di antrean "due"). Juga membuat `releaseQuarantined` jadi dead code.

**Kabar baiknya: mutasi ini tertangkap test.** Saya jalankan suite terkait pada tree termutasi (13:52): **10 dari 17 test gagal** di `reindex.test.ts`, `reindex.recovery.qa.test.ts`, dan `ShellSyncStatus.reindex.test.ts` — termasuk "membangun ulang index … mengeluarkannya dari karantina" dan "jumlahnya ikut turun". Sebelum mutasi (13:42) ketiganya hijau. Jadi perilaku "rilis hanya setelah index benar-benar dibangun" memang terkunci test, bukan hanya komentar.

**Verdict saya tidak berubah** (LOLOS) karena yang dinilai adalah commit `40a1d96`. Saya hanya menandai: pastikan commit akhir **tidak** membawa baris `void releasedIds`, dan jalankan ulang `app/utils/sync/reindex.test.ts` + `ShellSyncStatus.reindex.test.ts` sebelum task dipindahkan ke `review`.
