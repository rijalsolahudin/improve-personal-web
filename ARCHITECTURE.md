# Architecture — Improve Personal

Pegangan arsitektur. Sumber kebenaran produk: `docs/PRD.md`. Aturan tiga pilar: `CLAUDE.md` + `apps/<app>/.claude/rules/`.
Kalau dokumen ini bentrok sama kode, update salah satunya di PR yang sama - jangan dibiarkan beda.

---

## 0. Pertanyaan terbuka

### Sudah diputuskan (dulu daftarnya di sini)

**Keputusan terbaru: ADR 15 (2026-11-16) - local-only + E2E, dijual sekali beli.** Menggantikan ADR 14.
Data user tidak pernah meninggalkan perangkat dalam bentuk terbaca: tidak ada akun, tidak ada sync
server, tidak ada enkripsi at-rest di server. Domain tetap menyajikan app (kunjungan pertama + update)
dan menerbitkan lisensi; setelah itu app jalan penuh lokal. Pindah perangkat lewat **transfer QR**
(WebRTC + relay ciphertext, fallback animated QR full offline) atau **berkas backup terenkripsi kata
sandi**, plus **backup terjadwal ke Google Drive milik user**. Konsekuensinya jujur: perangkat hilang
tanpa backup = data hilang, dan tidak ada pihak yang bisa memulihkannya.

**Revisi harga: ADR 16 (2026-11-17) - tiga paket prabayar.** Bulanan Rp19.000 (30 hari), tahunan
Rp99.000 (365 hari), lifetime Rp249.000. Tanpa perpanjangan otomatis: perpanjang = beli lagi. Token
lisensi kini membawa tanggal habis; lisensi habis = app **baca-saja** (data tetap bisa dilihat,
diekspor, di-backup, dan dipindah), bukan terkunci. Bagian lain ADR 15 tetap berlaku.

### Default (diasumsikan, bisa diganti)

| # | Topik | Rekomendasi = default |
|---|---|---|
| Q3 | Stack server | **Nitro/H3** di dalam `apps/web` (`server/routes/v1/**`) + **PostgreSQL** + **Drizzle**. Tipis: webhook pembayaran + aktivasi lisensi via email OTP/Google + relay transfer (ciphertext, tanpa simpan) + proxy cuaca. Tidak ada data user (ADR 15). Nggak ada app server terpisah (ADR 7 direvisi). |
| Q4 | Mobile | **Expo** (dev build, Expo Router, EAS Build/Update). |
| Q5 | Monorepo tool | **pnpm workspaces + Turborepo**. |
| Q6 | Library kripto | **libsodium** (`libsodium-wrappers-sumo` di web, `react-native-libsodium` di native) untuk salinan lokal, berkas backup (Argon2id + XChaCha20-Poly1305), dan kanal transfer (`secretstream`). Server hanya memakai Ed25519 untuk menandatangani lisensi. |
| Q7 | Data lokal di web terenkripsi? | Ya: IndexedDB menyimpan ciphertext dengan kunci perangkat yang dibuat otomatis. Native: SQLite + SQLCipher. |

---

## 1. Prinsip

1. **Local-only.** DB lokal adalah satu-satunya sumber kebenaran. Semua baca/tulis lokal → UI instan, jalan penuh offline. Tidak ada sync server (ADR 15).
2. **Data tidak pernah keluar dalam bentuk terbaca.** Yang meninggalkan perangkat hanya ciphertext dengan kunci yang tidak pernah dipegang server: berkas backup (kunci dari kata sandi), Google Drive (sama), dan transfer QR (kunci sekali pakai di QR).
3. **Lisensi = akses.** Tidak ada akun yang membuka data. Login email (OTP/Google) hanya membuktikan email pembeli saat aktivasi; token lisensi ditandatangani server sekali, lalu diverifikasi offline dengan public key yang ditanam di app.
4. **Logika sekali, UI dua kali.** Domain, repository, sync, kripto ditulis sekali di `packages/*` (TS murni). Nuxt & RN cuma UI + adapter platform.
5. **Tiga pilar wajib** (keamanan, performa, kerapian) di setiap perubahan.

---

## 2. Konteks sistem

```mermaid
flowchart LR
  U((User))
  subgraph Device["Perangkat user (trusted)"]
    W[Web / PWA - Nuxt]
    M[Android / iOS - RN]
    LDB[(DB lokal terenkripsi)]
    KS[[Keychain / Keystore / WebCrypto]]
  end
  subgraph Cloud["Server di domain (tidak pernah melihat data user)"]
    API[API v1 - Nitro/H3 di apps/web/server]
    PG[(Postgres: lisensi + aktivasi)]
    RL[Relay transfer - ciphertext, tanpa simpan]
  end
  PAY[Payment provider]
  GD[(Google Drive milik user)]
  D2[Perangkat baru]
  U --> W & M
  W & M --> LDB
  W & M --> KS
  W -- "kunjungan pertama + update: aset app" --> API
  W & M -- "sekali: aktivasi lisensi" --> API
  PAY -- webhook --> API
  API --> PG
  W & M -- "backup terenkripsi (langsung, tanpa server kita)" --> GD
  W & M <-- "transfer QR: WebRTC P2P, fallback lewat relay" --> D2
  W & M -.-> RL -.-> D2
```

**Trust boundary:** server hanya tahu akun login (email), lisensi, dan perangkat yang diaktivasi. Isi data hanya ada di perangkat; semua salinan di luar perangkat (berkas backup, Drive, aliran transfer) dienkripsi dengan kunci yang tidak pernah dikirim ke server. Relay hanya meneruskan byte terenkripsi dan tidak menyimpannya.

---

## 3. Struktur monorepo

```
improve-personal/
├── apps/
│   ├── web/                 # Nuxt 4 - web desktop + PWA; API v1 (auth + sync relay) jalan di server/ (Nitro/H3)  (+ ARCHITECTURE.md, docs/PRD.md)
│   └── mobile/              # Expo / React Native - Android + iOS  (+ ARCHITECTURE.md, docs/PRD.md)
├── packages/
│   ├── core/                # domain + use case + repository interface + merge, io, transfer, license
│   ├── (crypto lokal hidup di `apps/web/app/utils/crypto` sampai mobile mulai)
│   ├── contracts/           # schema zod API + DTO + versi protokol
│   ├── tokens/              # design token → CSS vars (web) & theme object (RN)
│   └── config/              # tsconfig, eslint, prettier, vitest preset bersama
├── docs/PRD.md              # sumber kebenaran produk - di-symlink ke docs/ tiap app
├── CLAUDE.md                # aturan bersama (per app: apps/<app>/CLAUDE.md)
├── ARCHITECTURE.md          # arsitektur root - cuma hal lintas app (per app: §10)
├── pnpm-workspace.yaml · turbo.json
└── .claude/                 # settings, agents
```

Nggak ada app server terpisah: `apps/server` tidak ada dan tidak akan dibuat - API (lisensi + relay transfer + proxy cuaca) tinggal di `apps/web/server/**` dan dilayani Nitro/H3 di app yang sama (ADR 7 direvisi). Karena itu `apps/web` di-build sebagai preset server (Node), bukan situs statis di CDN.

### Aturan dependensi

```mermaid
flowchart TD
  web[apps/web] --> core
  mobile[apps/mobile] --> core
  web --> tokens
  mobile --> tokens
  web --> contracts
  core --> crypto
  core --> contracts
```

- `packages/*` **dilarang** import Vue, React, Nuxt, React Native, Node API (`fs`, `crypto` Node), atau DOM. Kebutuhan platform masuk lewat interface (lihat §5).
- Kode server di `apps/web/server/**` **cuma boleh** import `contracts` - **dilarang** import `core` / `crypto`, karena server nggak boleh punya kemampuan dekripsi. Nggak ada app server terpisah, jadi aturan ini berlaku untuk folder `server/` di dalam app web (ADR 7 direvisi).
- `apps/web` dan `apps/mobile` nggak saling import.
- Dicek otomatis di CI (`eslint-plugin-boundaries` atau `dependency-cruiser`).

---

## 4. `packages/core` - isi modul

```
packages/core/src/
├── domain/        # entitas + aturan murni: schedule, todo, eisenhower, pomodoro,
│                  # countdown, habit, memo, goal, sticker, decoration
├── recurrence/    # engine F1 (ekspansi per rentang, exception, edit 3 opsi)
├── calc/          # sisa waktu, countdown unit, streak, progress goal, agregasi Overview
├── repository/    # interface Repository<T> + query by range
├── sync/          # HLC + LWW merge (dipakai import "gabung" & transfer); outbox/push/pull dihapus (ADR 15)
├── io/            # import/export JSON + berkas backup terenkripsi + validasi skema + migrasi versi
├── transfer/      # protokol transfer QR: payload QR, framing, fountain code animated QR (tanpa I/O)
├── license/       # verifikasi token lisensi Ed25519 (murni, public key di-inject)
└── ports.ts       # interface yang diimplementasi tiap platform
```

Semua fungsi di `domain/`, `recurrence/`, `calc/` **murni** (input → output, tanpa I/O, tanpa `Date.now()` langsung - waktu di-inject). Ini yang bikin unit test PRD (recurrence, streak, progress, dll) gampang dan deterministik.

---

## 5. Port & adapter

| Port (di `core/ports.ts`) | Web (Nuxt) | Mobile (Expo) |
|---|---|---|
| `StorageAdapter` | IndexedDB via `idb` | SQLite via `expo-sqlite` + SQLCipher |
| `SecureKeyStore` | WebCrypto non-extractable key di IndexedDB + WebAuthn | `expo-secure-store` (Keychain/Keystore) + biometrik |
| `CryptoProvider` | libsodium-wrappers | react-native-libsodium |
| `Clock` | `Date.now` + HLC | sama |
| `HttpClient` | `$fetch` | `fetch` |
| `Scheduler` | `setTimeout` + `visibilitychange` | `AppState` |

Satu **contract test suite** di `packages/core/test/adapters/` dijalankan ke tiap `StorageAdapter` - IndexedDB dan SQLite harus lolos test yang sama (AC T23).

### Aturan penyimpanan lokal (wajib)

Keamanan data di sini tidak datang dari pilihan library, tapi dari cara pakainya. Library yang benar tetap bisa kehilangan data kalau aturan ini dilanggar.

- **Perangkat adalah satu-satunya salinan hidup.** Prinsip induk sejak ADR 15; semua aturan di bawah ikut dari sini.
- **Tulis lokal dulu, selalu.** UI tidak pernah menunggu jaringan.
- **Satu penulis per origin di web** (`navigator.locks`, mis. lock `ip-writer`). IndexedDB tidak punya lock antar tab, jadi dua tab bisa saling menimpa. `BroadcastChannel` cuma memberi tahu, bukan mengunci.
- **Dilarang `await` non-IndexedDB di dalam transaksi** (fetch, timer, apa pun). Transaksi IndexedDB auto-commit begitu tidak ada request pending, jadi tulisan sisanya hilang tanpa error.
- **Durability transaksi tulis: `strict`.** Default Chrome sekarang `relaxed` - commit terakhir bisa hilang saat mati listrik, OS crash, atau disk penuh.
- **Mobile: `synchronous = FULL`** untuk transaksi tulis record. WAL dengan `NORMAL` masih bisa kehilangan transaksi terakhir saat mati listrik.
- **`navigator.storage.persist()` wajib dipanggil** dan PWA didorong untuk di-install. Tanpa itu browser bisa menghapus storage (Safari membersihkan situs yang tidak dibuka ~7 hari kalau tidak di-install).
- **Tulis per record.** Dilarang pola hapus-semua-lalu-tulis-ulang.
- **Restore wajib diuji, bukan diasumsikan.** Drill: hapus total storage di perangkat bersih, lalu pulihkan dari berkas backup terenkripsi, dari Google Drive, dan lewat transfer QR - ketiganya harus menghasilkan data identik. Tanpa server, backup adalah satu-satunya jaring pengaman.
- **Pengingat backup wajib.** App melacak waktu backup terakhir; lewat ambang (default 7 hari) → pengingat yang tidak bisa disembunyikan permanen. Gagal `persist()` → pengingat lebih keras.
- Dilarang mengirim kunci perangkat, kunci backup, atau plaintext record ke server mana pun.

---

## 6. Model data

### Envelope record (sama untuk semua entitas)

```ts
// lokal (setelah decrypt, cuma di memori)
type Record<T> = {
  id: string            // UUIDv7 (urut waktu, dibuat di client)
  type: EntityType      // 'todo' | 'schedule' | 'memo' | ...
  hlc: string           // hybrid logical clock: `${wallMs}-${counter}-${deviceId}`
  deleted: boolean      // tombstone
  schemaVersion: number
  data: T               // isi entitas
}

// yang ditulis ke disk LOKAL (disegel kunci perangkat)
type SealedRecord = { id, hlc, deleted, blob }
```

- Tidak ada DTO record ke server (ADR 15). Record keluar perangkat hanya di dalam berkas backup terenkripsi atau aliran transfer terenkripsi, dengan bentuk dokumen backup yang sama (`io/backup.ts`).
- Salinan lokal memakai blob v2 (XChaCha20-Poly1305, AAD mengikat KID lokal, profil, record, HLC, `deleted`, padding 256 B) - konstanta di `packages/contracts/src/record-format.ts`. Slot "akun" di AAD diisi ID profil lokal (dibuat sekali per perangkat), bukan `userId` server.
- Index lokal untuk query rentang tanggal disimpan di tabel index terpisah; jalur panas = query index, bukan decrypt semua record.

### Entitas utama

`Schedule` (+ `ScheduleException`, `Occurrence` status) · `Todo` · `EisenhowerPlacement` · `PomodoroSession` · `PomodoroSettings` · `Countdown` · `Habit` (+ `HabitCheckin`) · `Memo` (mood, mention) · `Goal` (+ `Chapter`, `GoalLink`, `GoalCategory`) · `Decoration` (per breakpoint) · `UserPrefs`.
Relasi pakai ID (`todo.scheduleId`, `goalLink.itemId`). Referensi ke record yang udah dihapus wajib ditangani aman (PRD: mention ke jadwal terhapus nggak error).

### Server (Postgres)

```
users(id, email, created_at)                                   -- login OTP/Google
devices(id, user_id, name, platform, installation_id, ...)     -- perangkat yang pernah login
sessions(id, device_id, token_hash, expires_at, ...)           -- sesi login (bukan akses data)
otp_challenges(id, email_hash, code_hash, expires_at, attempts)
oauth_states(...)                                              -- PKCE Google
purchases(id, email, plan, amount, status pending|paid|failed, mayar_id, payment_url, expires_at, paid_at)
licenses(id, email, edition, max_activations, expires_at, revoked_at, created_at)  -- satu per email; expires_at NULL = lifetime
license_grants(order_ref, license_id, plan, granted_at)        -- PK order_ref: pembelian lunas -> perpanjangan, idempoten
license_activations(license_id, device_id, activated_at)       -- PK (license_id, device_id)
rate_limits(scope, bucket, window_start, count)
```

Tidak ada isi data aplikasi. Email disimpan apa adanya (keputusan 2026-11-16): login lama dipakai ulang
dan email asli dibutuhkan untuk support, refund, dan kirim ulang konfirmasi pembelian. `licenses`
dikunci ke email (bukan `users.id`) karena pembelian terjadi sebelum pembeli pernah login.
Sesi relay transfer hidup di memori server (TTL pendek), tidak pernah di database.

---

## 7. Kripto & kunci

Tiga kunci, masing-masing untuk satu keperluan. Tidak ada kunci utama user, tidak ada kode pemulihan,
dan tidak ada kunci yang dipegang server (ADR 15).

```mermaid
flowchart LR
  MK[Master Key perangkat - 32 byte acak] -->|KDF subkey 'data'| DK[Data Key lokal]
  DK -->|XChaCha20-Poly1305| IDB[Ciphertext di IndexedDB / SQLite]
  DEV[Device Key - WebCrypto non-extractable / Keystore] -->|wrap| MK
  PW[Kata sandi backup] -->|Argon2id + salt| BK[Backup Key]
  BK -->|XChaCha20-Poly1305 secretstream| BF[Berkas backup / Google Drive]
  QR[Kunci sesi 32 byte di QR] -->|XChaCha20-Poly1305 secretstream| TX[Aliran transfer]
```

**Salinan lokal (sudah ada).**
- MK 32 byte acak per perangkat, dibungkus `CryptoKey` non-extractable (AES-KW). Turunannya menyegel `record` di IndexedDB; native memakai SQLCipher + Keystore/Keychain.
- MK hilang (data situs dihapus) = salinan lokal tidak bisa dibuka. **Tidak ada full pull dari server lagi**; pemulihan hanya dari backup atau transfer.

**Berkas backup (`ip-backup-enc`).**
- Header polos: `format`, `version`, `kdf: { alg: 'argon2id13', opslimit, memlimit, salt }`, `createdAt`. Isi: dokumen `ip-backup` (format yang sama dengan export plaintext) → gzip → `crypto_secretstream_xchacha20poly1305` per chunk 64 KB. Header ikut sebagai AAD chunk pertama.
- Kata sandi minimal 12 karakter + meter kekuatan; parameter Argon2id minimal `OPSLIMIT_MODERATE`/`MEMLIMIT_MODERATE` (diuji di HP kelas bawah ≤ 3 detik).
- Backup terjadwal (Drive) butuh kunci tanpa mengetik kata sandi tiap kali: Backup Key hasil Argon2id disimpan lokal **dibungkus Device Key**, bukan kata sandinya. Ganti kata sandi = backup baru dengan salt baru.
- Export plaintext JSON tetap ada untuk keterbacaan, dengan peringatan lama.

**Kanal transfer.**
- Kunci sesi 32 byte acak dibuat perangkat lama, hanya ada di QR dan di memori kedua perangkat, dibuang setelah selesai atau 10 menit.
- Semua yang lewat relay/WebRTC (termasuk pesan kontrol setelah handshake) dienkripsi kunci ini. Kode verifikasi 6 digit = `BLAKE2b(key, 'ip-sas')` dipotong, ditampilkan di dua layar dan dikonfirmasi user di perangkat lama sebelum data dikirim.

**Lisensi.** Server menandatangani token dengan Ed25519; private key hanya di env server, public key ditanam di build app.

**Dilarang:** log kunci/kata sandi/payload/ciphertext, mengirim kunci apa pun ke server, menyimpan kata sandi backup, atau membuat algoritma sendiri.

## 8. Lisensi

Tiga paket prabayar (ADR 16), semuanya berlaku di semua platform:

| Paket | Harga | Masa aktif |
|---|---|---|
| `monthly` | Rp19.000 | 30 hari |
| `yearly` | Rp99.000 | 365 hari |
| `lifetime` | Rp249.000 | tanpa batas |

Harga & masa aktif satu sumber di `packages/contracts` (`LICENSE_PLANS`); server tidak pernah menerima
nominal dari client. Identitas pembeli = **email yang dipakai saat membeli**; tidak ada kode lisensi
untuk diketik. Login di sini hanya membuktikan "email ini sudah membeli" - tidak membuka data dan tidak
membuat sesi.

- **Satu lisensi per email.** Setiap pembelian lunas mencatat `license_grants(order_ref)` (idempoten:
  webhook ulang tidak memperpanjang dua kali) lalu memperpanjang `licenses.expires_at` dari
  `max(sekarang, expires_at)` sebanyak masa aktif paket. `lifetime` men-set `expires_at = NULL` dan
  tidak bisa turun lagi. Tidak ada prorata: naik ke lifetime = bayar penuh Rp249.000.
- **Tanpa auto-debit.** QRIS/VA tidak bisa ditagih ulang otomatis; perpanjangan = checkout baru
  (endpoint & webhook yang sama, `plan` di body). Pengingat habis ditampilkan di app mulai H-7.
- **Lisensi habis = baca-saja**, tidak terkunci: data tetap bisa dilihat, diekspor, di-backup, dan
  dipindah perangkat; menambah/mengubah data diblokir sampai diperpanjang. Data tidak pernah dihapus
  atau disandera.

- **Beli (Mayar, pola Ergonio):** `/beli` (nama, email, nomor WA) → `POST /v1/purchase/checkout` (publik, rate limit per email & IP, nominal dari server) → baris `purchases` + payment request Mayar `hl/v1/payment/create` dengan `description` berakhiran `[wh:product=<NUXT_MAYAR_PRODUCT>;env=<NUXT_MAYAR_ENVIRONMENT>]` (produk default `improve-personal`) untuk webhook-gateway → pembeli bayar → `POST /v1/payments/webhook/mayar` (token rahasia dari `?token=`/Bearer/header "token", dibandingkan timing-safe; token kosong = tolak semua) → hanya `payment.received` + `SUCCESS`/`paid` + nominal ≥ harga yang melunasi (atomik) → `grantLicense(email, order_ref = purchases.id)`. Nomor WA hanya diteruskan ke Mayar, tidak disimpan. Manual/kompensasi: `license license-grant <email> <order-ref>`.
- **Aktivasi (sekali per perangkat, online):** login OTP/Google lama (`/v1/auth/**`) → `POST /v1/license/token` (sesi wajib, tanpa body) → server cari lisensi aktif untuk email sesi (kunci baris `FOR UPDATE`), catat `(license, device)` bila belum ada, cek batas (default 5) → token `{ v: 2, lid, did, iat, ed, plan, exp }` + tanda tangan Ed25519 (`exp` detik unix, `null` untuk lifetime). Perangkat yang sama minta ulang tidak memakai jatah.
- **Penyegaran (online, tanpa login ulang):** `POST /v1/license/refresh` dengan token lama sebagai bukti (tanda tangan dicek, `lid`+`did` harus masih tercatat di `license_activations`, lisensi belum dicabut) → token baru dengan `exp` terkini. App memanggilnya otomatis saat online kalau sisa masa aktif < 7 hari atau sudah habis, jadi perpanjangan dari perangkat lain langsung terbawa tanpa OTP.
- Email yang belum membeli → setelah OTP lolos, tampil "Email ini belum terdaftar membeli" + tombol beli. Status pembelian hanya terungkap ke pemilik email (sudah membuktikan OTP), jadi tidak bocor ke pihak lain; permintaan OTP sendiri tetap selalu dijawab generik.
- App menyimpan token lokal dan memverifikasinya **offline** di setiap start; `exp` dibandingkan dengan jam perangkat. Tidak ada heartbeat; satu-satunya panggilan online adalah penyegaran di atas.
- Jam perangkat bisa dimundurkan untuk memperpanjang paket bulanan/tahunan secara offline. Diterima sebagai risiko (sama seperti patch JS): lisensi menyasar user jujur, dan app tetap butuh online untuk transfer/backup Drive/update.
- Token tidak memuat email atau fingerprint; `did` hanya id baris `devices` di server. Token disimpan di `localStorage` (bukan rahasia; keaslian dijamin tanda tangan) dan diverifikasi dengan WebCrypto Ed25519 di `middleware/license.global.ts`.
- Transfer QR ikut membawa token lisensi, jadi perangkat baru yang menerima transfer tidak perlu aktivasi ulang.
- Pembajakan lewat patch JS diterima sebagai risiko: sasaran lisensi adalah user jujur, bukan DRM.
- **Native:** aktivasi dengan email yang sama. Risiko kebijakan toko (Apple 3.1.3(b) "multiplatform services" umumnya mensyaratkan produk yang sama juga tersedia lewat IAP; Google Play punya aturan serupa) wajib dicek ulang sebelum rilis native - bisa berarti IAP tetap disediakan sebagai jalur beli kedua yang menulis ke tabel `licenses` yang sama.
- Rate limit OTP per email + per IP (logika OTP lama dipakai ulang); kode `777777` tetap hanya non-production tanpa SMTP.

## 9. Pindah perangkat & backup

Pengganti sync (ADR 15). Tiga jalur, satu format isi (dokumen `ip-backup`), satu logika penerapan
(`io/import.ts`: "ganti semua" untuk perangkat kosong, "gabung" pakai LWW HLC - ADR 3).

### Transfer QR

```mermaid
sequenceDiagram
  participant Old as Perangkat lama
  participant R as Relay (domain)
  participant New as Perangkat baru
  Old->>R: buka sesi (sessionId acak)
  Old-->>New: QR: ipt1 | sessionId | key | relayUrl
  New->>R: gabung sesi
  R-->>Old: signaling WebRTC (SDP/ICE, dienkripsi key)
  New-->>Old: kode verifikasi 6 digit tampil di dua layar
  Old->>Old: user konfirmasi kode cocok
  Old->>New: dokumen backup (secretstream) via DataChannel P2P
  Note over Old,New: gagal P2P dalam 8 detik → frame yang sama diteruskan relay
  New->>New: validasi skema → terapkan → segel ulang dengan kunci perangkat sendiri
  New-->>Old: ack (hash isi) → kedua sisi buang kunci
```

- Relay: WebSocket di `apps/web/server`, sesi di memori, TTL 10 menit, maks 2 peserta, batas byte per sesi, rate limit per IP. Tidak menyimpan apa pun ke disk/DB dan tidak me-log isi frame.
- Tanpa TURN: fallback relay sudah menutup kasus NAT simetris.
- **Animated QR (full offline):** dokumen dikompres + dienkripsi, dipecah dengan fountain code (urutan scan tidak penting, frame hilang tidak perlu diulang), ditampilkan sebagai rangkaian QR. Kunci sesi ada di setiap frame header (setara QR tunggal), kode verifikasi tetap wajib. Dipakai kalau dua perangkat tidak bisa online.
- Perangkat baru tidak kosong → tanya "ganti semua" atau "gabung", sama seperti import.

### Backup

- **Manual:** unduh berkas `ip-backup-enc` (default) atau export plaintext (dengan peringatan).
- **Google Drive terjadwal:** OAuth Google Identity Services langsung dari client, scope sempit (`drive.appdata` atau `drive.file` - diputuskan di task-nya), token akses hanya di memori. Berkas terenkripsi diunggah langsung browser → Drive, tidak lewat server kita. Simpan N versi terakhir (default 5).
- "Terjadwal" di web = dijalankan saat app dibuka kalau jadwalnya lewat (browser tidak bisa jalan di latar belakang secara andal); native memakai background task OS.
- Restore: pilih berkas / pilih versi dari Drive → kata sandi → preview jumlah data → terapkan.

### API (versi di path, schema di `packages/contracts`)

```
POST /v1/auth/otp/request         POST /v1/auth/otp/verify      GET /v1/auth/session
GET  /v1/auth/google/start        GET  /v1/auth/google/callback POST /v1/auth/logout
POST /v1/license/token            (sesi -> token lisensi)
POST /v1/license/refresh          (token lama -> token dengan exp terkini)
POST /v1/purchase/checkout        POST /v1/payments/webhook/mayar
POST /v1/payments/webhook        GET  /v1/transfer/relay   (upgrade WebSocket)
GET  /v1/weather                 GET  /health
```

Bentuk respons seragam untuk SEMUA endpoint: sukses `{ data: <DTO> }`, gagal `{ error: { code, message, details? } }` dengan status dari `ERROR_HTTP_STATUS`. Pembungkusan sukses terpusat di `apps/web/server/utils/api-error.ts`, schema-nya satu sumber di `packages/contracts/src/protocol.ts`.

Endpoint ini dilayani Nitro di dalam `apps/web` (`server/routes/v1/**`), bukan app terpisah.

---

## 10. Arsitektur per app

Detail tiap app ada di dokumennya sendiri. Root ini cuma nampung hal yang berlaku buat semua.

| App | Dokumen | Isi |
|---|---|---|
| `apps/web` (Nuxt 4) | [`apps/web/ARCHITECTURE.md`](apps/web/ARCHITECTURE.md) | Struktur `app/`, mode render, PWA, state (Pinia) |
| `apps/mobile` (Expo) | [`apps/mobile/ARCHITECTURE.md`](apps/mobile/ARCHITECTURE.md) | Struktur, adapter native, kunci app, build & OTA |
| API server (di dalam `apps/web`) | [`apps/web/ARCHITECTURE.md`](apps/web/ARCHITECTURE.md) | Struktur `server/**`, route `/v1/**`, lisensi, relay transfer - nggak ada app terpisah (ADR 7 direvisi) |

Aturan:

- Dokumen app boleh nambah detail, tapi **dilarang nulis ulang** hal root (§5–§9). Kalau bentrok, root yang menang dan selisihnya dibenerin di PR yang sama.
- Tiap app punya `docs/PRD.md` sebagai **symlink** ke `../../docs/PRD.md`, bukan salinan.
- Dokumen app nggak boleh nampung aturan lintas app (§11) - itu tetap di sini.

### Server DI DALAM `apps/web` (Nitro/H3)

Nggak ada app server terpisah - API (lisensi + relay transfer + proxy cuaca) tinggal di `apps/web/server/**`.

```
server/
├── routes/         # endpoint /v1/** per resource: license, payments, transfer, weather
├── services/       # logika (penerbitan & aktivasi lisensi, sesi relay di memori)
├── db/             # drizzle schema + migrasi (lisensi saja)
├── middleware/     # rate limit, request id, error handler
├── utils/          # validasi env (zod) - gagal start kalau invalid
└── tasks/          # job terjadwal (bersihkan rate limit kedaluwarsa)
```

Detail struktur server ada di [`apps/web/ARCHITECTURE.md`](apps/web/ARCHITECTURE.md) §1.

---

## 11. Hal lintas fitur

- **Waktu:** simpan instan sebagai epoch ms UTC + simpan `tz` untuk jadwal berulang. Ekspansi recurrence pakai zona waktu perangkat. Minggu mulai Senin.
- **Timer global:** satu ticker per app (bukan per item) untuk sisa waktu / countdown (AC T5).
- **Teks user:** render sebagai teks. Markdown memo lewat sanitizer (DOMPurify di web, renderer markdown tanpa HTML di RN). Dilarang `v-html` / `dangerouslySetInnerHTML` dari input mentah.
- **Import:** validasi schema penuh + cek versi **sebelum** nulis apa pun. Batas ukuran file. Berlaku sama untuk berkas backup, Drive, dan transfer QR (satu jalur `io/import.ts`). Export plaintext kasih peringatan "file nggak terenkripsi".
- **Sticker:** aset statis per pack, lazy-load, di-precache untuk offline. Layer hias: `pointer-events: none` di luar mode hias, posisi dalam % relatif elemen, disimpan per breakpoint (HP/tablet/desktop).
- **Bahasa:** UI Indonesia; string tetap lewat i18n (`@nuxtjs/i18n` / `i18next`) biar gampang ditambah.

---

## 12. Environment & deploy

| Env | Web (Nitro: UI + API) | Mobile | Host server | Lisensi |
|---|---|---|---|---|
| development | `nuxi dev` (Nitro lokal, sekaligus API) | Expo dev build | lokal + Postgres docker | keypair Ed25519 dev; webhook pembayaran mode sandbox |
| preview | per PR (Nitro Node) | EAS internal | preview | keypair dev, sandbox |
| staging | staging URL (Nitro Node) | EAS internal/TestFlight | staging | keypair staging, sandbox |
| production | Nitro Node server (sajikan UI + API `/v1/*`) | Play Store / App Store | host Node produksi + Postgres | keypair production; private key hanya di secret manager |

- Public key lisensi per env ditanam saat build; token dari env lain ditolak (fail-closed). Server **nolak start** kalau private key hilang/invalid atau kalau keypair dev kebaca di production.
- Email untuk OTP aktivasi + konfirmasi pembelian (Resend di production, SMTP/Mailpit di lokal - `NUXT_SMTP_URL`, `NUXT_MAIL_FROM`). Aturan OTP per env lama tetap berlaku: `777777` hanya non-production dengan `NUXT_SMTP_URL` kosong; production nolak start kalau `NUXT_SMTP_URL` terisi.
- `NUXT_LICENSE_SIGNING_KEY` (seed Ed25519, rahasia) + `NUXT_PUBLIC_LICENSE_PUBLIC_KEY` (ditanam di build) wajib berpasangan; tidak cocok = server nolak start. Buat dengan `license license-keygen`.
- **Konteks lokal:** Mailpit jalan sebagai container `local-mailpit` (axllent/mailpit) - SMTP `127.0.0.1:1025`, UI inbox `http://127.0.0.1:8025`.
- Web = satu Nitro Node server yang sajikan UI + API `/v1/*`; relay transfer butuh WebSocket, jadi tetap host Node (container, mis. Dokploy). Postgres managed + backup harian (isinya lisensi saja).
- **Domain wajib diperpanjang jangka panjang** (auto-renew + pengingat): origin yang jatuh ke pihak lain bisa memasang service worker baru dan membaca data lokal user. Ini komitmen produk ke pembeli, bukan sekadar urusan ops.
- Service worker: precache app shell + aset; update di latar belakang; tidak pernah cache respons `/v1/**`.
- Secret cuma dari env/secret manager. `.env*` nggak di-commit.
- Mobile OTA (EAS Update) cuma JS; ditandatangani, channel per env.

---

## 13. Quality gate (CI)

Wajib lulus sebelum merge:
1. `pnpm lint` (termasuk aturan boundary §3) + `typecheck`
2. Unit test `packages/*` (recurrence, calc, crypto, merge HLC, io + backup terenkripsi, transfer, license) - coverage ≥ 80%
3. Contract test adapter storage (IndexedDB & SQLite)
4. Test server: webhook (signature + idempoten), aktivasi via OTP/Google (batas, dicabut, email belum beli, `777777` ditolak di production), relay (TTL, maks peserta, batas byte, tidak menyimpan isi), keypair dev ditolak di production
5. Build web + PWA + Android + iOS
6. `pnpm audit` - High/Critical = blok
7. Budget performa sesuai `apps/<app>/.claude/rules/performance.md`

E2E (T16): Playwright (web/PWA) + Maestro (mobile), termasuk drill restore (berkas, Drive, transfer QR P2P, transfer lewat relay, animated QR) dan app jalan penuh dengan jaringan mati setelah aktivasi.

---

## 14. Keputusan arsitektur (ADR ringkas)

| # | Keputusan | Alasan | Trade-off |
|---|---|---|---|
| 1 | ~~Local-first + server relay~~ **digantikan ADR 15**: local-only | - | - |
| 2 | ~~Login terpisah dari unlock~~ **digantikan ADR 14** | - | - |
| 3 | LWW per record pakai HLC - **sejak ADR 15 dipakai untuk import/transfer "gabung"** | Cukup untuk 1 user, simpel | Record yang diedit di dua perangkat lalu digabung: satu kalah utuh |
| 4 | ~~`type` ikut dienkripsi~~ **digantikan ADR 14**: `payload` disegel server | Server tetap tidak menyimpan kolom tipe | Server bisa membuka payload dengan kunci env |
| 5 | Logika di `packages/*` murni | Satu sumber logika web & mobile, test deterministik | Butuh disiplin port/adapter |
| 6 | Web app `ssr: false` - **direvisi 2026-10-17** | Data user nggak ada di server, SSR cuma risiko. Revisi: halaman app tetap `ssr: false`, tapi output build web bukan lagi static - API `/v1/*` dilayani di app yang sama (`server/routes/v1/**`), jadi build-nya preset server (Node) | SEO cuma untuk halaman publik; `apps/web` nggak bisa lagi disajikan sebagai situs statis dari CDN - butuh host Node |
| 7 | Server terpisah (`apps/server`) - **direvisi 2026-10-17** | Dulu: dipakai web & mobile, deploy & skala independen. Revisi: API (auth + relay ciphertext) tinggal DI DALAM `apps/web` (`server/routes/v1/**`, Nitro/H3) - satu app, satu deploy, kontrak & sesi lebih gampang karena nggak ada boundary app. `apps/server` tidak ada dan tidak akan dibuat | Keuntungan: nggak ada deploy kedua. Kerugian: `apps/web` nggak bisa lagi disajikan sebagai situs statis dari CDN (butuh host Node), dan mobile bergantung pada API yang di-host bareng frontend web |
| 8 | libsodium di dua platform | Primitive identik, teruji | Ukuran bundle web +~200 KB (lazy-load setelah login) |
| 9 | Pinia di web sebagai **proyeksi reaktif**, bukan pemilik data | 16 fitur saling silang (task ↔ Eisenhower/kalender/Daily/goal/Overview) butuh satu sumber reaktif + getter turunan; `useState` per-key nggak punya getter, action, plugin, atau devtools, dan makin susah dirawat di skala ini | Ada satu lapisan cache lagi di atas repo → butuh disiplin: store nggak boleh nulis langsung ke DB, semua mutasi lewat use case `core` (kalau nggak, HLC & tombstone yang dipakai merge transfer bocor) |
 10 | ~~dihapus oleh ADR 14~~ | Kunci user tidak ada lagi | - |
 11 | ~~dihapus oleh ADR 14~~ | Kunci user tidak ada lagi | - |
 12 | ~~dihapus oleh ADR 14~~ | Kunci user tidak ada lagi | - |
| 13 | ~~KID + blob record v2 di server~~ **digantikan ADR 14**: KID hanya AAD blob lokal | Server tidak lagi memvalidasi KID | Tidak ada deteksi split-brain karena tidak ada kunci user |
| 14 | ~~**Enkripsi at-rest di server** (AES-256-GCM, keyring di env) + salinan lokal berkunci perangkat; hapus passkey/recovery/QR/KID | Tujuan produk: data tidak boleh hilang karena user kehilangan kunci. E2EE membuat server tidak bisa memulihkan apa pun, dan menjaga kunci user adalah beban yang terus memakan korban | Server (pemegang env) bisa membaca data dan menjadi single point of failure; wajib backup kunci terpisah. Performa naik karena pull tidak perlu dekripsi di client untuk index~~ **digantikan ADR 15** |
| 15 | **Local-only + E2E, sekali beli** (2026-11-16; **harga & model jual direvisi ADR 16**): tanpa akun/sync/at-rest server; pindah perangkat lewat transfer QR (WebRTC P2P, fallback relay ciphertext, fallback animated QR offline) + berkas backup terenkripsi kata sandi (Argon2id) + backup terjadwal ke Google Drive user; lisensi Ed25519 diverifikasi offline; satu pembelian (Rp99.000) untuk semua platform, aktivasi lewat email pembeli (OTP/Google lama dipakai ulang hanya untuk itu). Kode server lama (sesi, perangkat, akun, sync, at-rest, tabel `users/devices/sessions/records`) dihapus | Model jual sekali beli tidak cocok dengan biaya server yang berjalan terus; data jurnal/mood paling aman kalau tidak pernah ada di server; kewajiban UU PDP jauh lebih ringan | Perangkat hilang tanpa backup = data hilang permanen, support tidak bisa membantu; tidak ada sync otomatis antar perangkat; app bergantung pada domain tetap dimiliki (risiko origin takeover); lisensi web bisa dibajak dengan patch JS |
| 16 | **Tiga paket prabayar** (2026-11-17): bulanan Rp19.000 / tahunan Rp99.000 / lifetime Rp249.000, tanpa auto-debit; satu lisensi per email diperpanjang per pembelian (`license_grants` idempoten); token v2 membawa `plan` + `exp`; `POST /v1/license/refresh` menyegarkan token dengan token lama sebagai bukti; lisensi habis = baca-saja | Pendapatan berulang menutup biaya domain/relay/support yang berjalan terus, sementara lifetime tetap ada untuk yang tidak mau langganan; prabayar cocok dengan QRIS/VA yang tidak bisa auto-debit | Perpanjangan manual = churn lebih tinggi daripada auto-debit; `exp` dicek dengan jam perangkat sehingga bisa diakali offline; baca-saja tetap memberi akses data (disengaja: data milik user) |
