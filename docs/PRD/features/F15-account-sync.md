# F15. Account, Sync & Security

Web + PWA (Nuxt) dan native Android/iOS (React Native), dengan logika inti di-share. Local-first: data utama di perangkat (SQLite native, IndexedDB web/PWA), sync ke server terenkripsi, akun dengan login OTP + Google SSO, E2EE pembuka berlapis.

## Platform
- **Web desktop:** Nuxt (Vue + TypeScript), IndexedDB local storage
- **PWA:** same web, manifest + service worker + offline
- **Native Android (APK):** React Native, SQLite local storage
- **Native iOS:** React Native, SQLite local storage
- UI dua codebase (Nuxt & React Native); logika inti (repository, kripto, sync) + design token di package TypeScript bersama, adapter repository per platform

## Login (Tanpa Password)

### Email OTP
- Daftar pakai email
- Setiap login: kirim kode 6 digit ke inbox
- OTP kedaluwarsa ≤ 10 menit
- Dikirim via Resend/SendGrid (service)
- Rate limit per email (prevent brute force)

### OTP per Environment
| Environment | OTP | Email dikirim? |
|---|---|---|
| `production` | Random 6 digit, sekali pakai, ≤ 10 menit | Ya (Resend/SendGrid) |
| Selain production (`development`, `staging`, `test`, preview) | Fix **`777777`** | Nggak |

- Tujuan: dev/QA/e2e test bisa login tanpa inbox beneran.
- Flow & UI tetap sama di semua environment (email → OTP); yang beda cuma generate + kirim kode.
- Rate limit & expiry tetap jalan di non-production (biar perilakunya identik).
- **Fail-closed:** OTP fix cuma aktif kalau env server **eksplisit** non-production (mis. `APP_ENV`). Env kosong/nggak dikenal = dianggap production. Nggak ada flag client/header/query yang bisa nyalain.
- Build/deploy production wajib gagal (atau server nolak start) kalau mode OTP fix kebaca aktif.
- Kode `777777` nggak pernah diterima di production, walau dikirim manual.

### Google SSO
- Daftar/login lewat Google, aktif di **semua environment** (production & non-production)
- OAuth2 standard flow (Authorization Code + PKCE, validasi `state` & ID token)
- Email auto-filled dari Google account
- Client ID/secret & redirect URI terpisah per environment, cuma dari env

### Sidik Jari / Face ID
- Native & PWA support (WebAuthn API)
- Setelah login pertama, user bisa setup biometric
- Login cepat tanpa OTP (local check)
- Keychain (iOS) / Keystore (Android) / WebCrypto (web)

### Login di Web Browser
- Email OTP (standard flow)
- **atau** scan QR dari HP yang sudah login (ala WhatsApp)

### Halaman Perangkat
- Daftar perangkat yang login sekarang
- Nama perangkat, waktu login terakhir, lokasi (dari IP)
- Logout dari jauh per perangkat

### Hapus Akun Permanen
- Minta konfirmasi (email OTP ulang)
- Hapus semua data user di server
- Hapus akun permanen

## E2EE (End-to-End Encryption)

### Kunci Utama
- Random 32-byte key (per akun)
- Semua data user dienkripsi pakai kunci ini (client-side)
- **Kunci ini nggak pernah dikirim ke server polos**

### Kunci Utama Disimpan dalam Salinan Berlapis
Tiap salinan digembok dengan pembuka berbeda:

#### Salinan 1: Digembok OTP (dari email login)
- OTP diturunkan pakai PBKDF2 atau Argon2id
- Disimpan terenkripsi salinan kunci di server
- Digunakan saat login pertama kali

#### Salinan 2: Digembok Sidik Jari / Face ID
- Kunci local di Keychain (iOS) / Keystore (Android) / WebCrypto (web)
- Non-extractable (nggak bisa ambil raw key)
- Disimpan di perangkat saja
- Cepet login berikutnya (biometric local check)

#### Salinan 3: Digembok Passkey
- iCloud Keychain (iOS) / Google Password Manager (Android/web)
- Backup kalau email nggak bisa akses
- Disimpan di cloud provider

#### Salinan 4: Digembok Recovery Key (24 kata)
- Emergency final
- User simpan di ≥2 tempat
- Server juga simpan terenkripsi untuk bantuan

### Lupa OTP / Email Nggak Bisa Akses
- Buka pakai passkey atau recovery key
- Dapat kunci utama
- Set password ulang (hanya gembok OTP yang dibuat ulang, data nggak dienkripsi ulang)

### Semua Pembuka Hilang
- Data nggak bisa dipulihkan
- User dijelaskan jujur di onboarding & Panduan (F9)

## Recovery Key (24 Kata)

### Saat Daftar
- Recovery key ditunjukin (24 kata)
- **Wajib backup di ≥2 tempat:**
  - Salin manual (clipboard)
  - Download file encrypted (user simpan di cloud/lokal)
  - Email ke diri sendiri (encrypted, di inbox user)
  - Print QR code (simpan fisik)
  - Password manager (1Password, LastPass, dll)
- User **wajib pilih minimal 2 opsi** sebelum selesai setup
- Nggak boleh skip

### Server Simpan Recovery Key Terenkripsi
- Kalau user lupa di mana nyimpen
- Minta bantuan: konfirmasi email + OTP → server kirim ulang (encrypted)
- Recovery key di-encrypt dengan kunci terpisah (bukan master key)

## Tambah Perangkat (ala WhatsApp)

### Di Web
- Login pakai email OTP

### Di HP / Device Baru
- Login pakai email OTP
- **atau** scan QR dari HP yang sudah login
  - HP kirim salinan kunci utama via QR (encrypted)
  - Device baru terima & decrypt
  - Device baru jadi trusted (setup sidik jari/Face ID)
  - Alternatif: passkey atau recovery key

## Sync

### Data Flow
- Tiap perubahan disimpan lokal dulu (instant UI feedback)
- Lalu dikirim ke server sebagai record terenkripsi (queue lokal)
- Server simpan → reply konfirmasi
- Device lain tarik perubahan (delta, berhalaman)

### Konflik
- Per record: **update terakhir menang** (timestamp + ID perangkat)
- Record yg conflict: server assign-nya ke device dengan timestamp terbaru
- Harmonisasi di perangkat lain saat pull berikutnya

### Hapus
- Hapus = tanda hapus (tombstone)
- Tombstone ikut tersinkron ke device lain
- Hard delete (purge) bisa nanti kalau space butuh

### Pull Perubahan
- Cuma ambil yang **baru** sejak cursor terakhir (delta sync)
- Berhalaman (page size ~100–1000 record)
- Bukan semua data (performa)

### Status Sync Terlihat
- Indicator UI: tersinkron / menunggu / offline / gagal (+ coba lagi)
- User tahu kapan data up-to-date

## Database Server
- Cuma simpan ciphertext (terenkripsi)
- Metadata minimal: ID record, `updatedAt`, ID perangkat, tombstone flag
- **Nggak ada plaintext data di server** (judul, isi, memo, dsb)

## Keamanan

### Kunci & Secret
- Kunci utama nggak pernah logged
- OTP nggak pernah di-log
- Recovery key hanya tersimpan encrypted
- Secret (API key, dsb) cuma dari env
- OTP fix `777777` cuma di non-production, ditentukan env server (fail-closed) — lihat [OTP per Environment](#otp-per-environment)

### HTTPS & Rate Limit
- Semua lalu lintas HTTPS
- Login: rate limit per email
- Recovery key attempt: rate limit (max 3–5x, lock sebentar)

### Biometric Local
- Di native: Keychain/Keystore menangani security
- Di web: WebAuthn API (browser handle)

## UI/UX

### Daftar Flow
1. Email
2. OTP kirim 30 detik
3. Ketik OTP
4. Setup recovery key (≥2 format wajib)
5. Onboarding tanya "Aktifin sidik jari/Face ID?" (opsional)
6. Selesai

### Login Flow
- Email → OTP
- atau Google SSO
- atau sidik jari/Face ID (kalau sudah aktif)

### Lupa OTP
- Email → "Pakai passkey atau recovery key?"
- Ke flow masing-masing

### Pesan Error
- Nggak membocorkan apakah email terdaftar ("Email nggak ditemukan vs Email terdaftar")
- Semua pesan generik buat security

## Performa
- Enkripsi/dekripsi di client (bukan server)
- Sync non-blocking (background, nggak freeze UI)
- Local query instant (SQLite/IndexedDB)
- Tarik delta sekali per app launch + interval (mis. 5 menit)
