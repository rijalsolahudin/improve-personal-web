# Security review #181 F5 slice 2 - library adapter platform mobile

Reviewer: Arif (security). Tanggal: 2026-11-24. Branch `feat/181-mobile-sync`. Bukti: `npm view` + isi tarball (`npm pack` di scratchpad, tidak di-install), `pnpm audit --audit-level=high --json`.

## Pertanyaan terbuka

1. **Background sync vs kunci terikat biometrik.** Kalau Device Key/MK hanya ada di item `requireAuthentication`, task latar F7 (backup Drive, sync) tidak bisa membuka DB tanpa user.
   - A: semua jalur latar menunggu app dibuka (paling aman). B: item kedua `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` tanpa biometrik khusus untuk Sync Key/Backup Key (bukan MK DB).
   - **Rekomendasi + asumsi default: A** untuk slice 2. B hanya lewat ADR terpisah.
2. **Fork libsodium di mana.** Opsi: `apps/mobile/modules/sodium` (Expo local module) atau `packages/sodium-native`. **Default: `apps/mobile/modules/sodium`** (hanya mobile yang memakai).

## Ringkasan & verdict

**Aman dengan catatan - 1 blocking.** `react-native-libsodium` 1.7.0 **tidak punya** `crypto_secretstream_xchacha20poly1305_*` dan `crypto_hash_sha256` (keduanya dipakai web: `apps/web/app/utils/crypto/backup-cipher.ts`, `provider.ts`), jadi ADR 8 / §7 (backup, transfer QR, segmen sync) tidak bisa dipenuhi apa adanya. Library lain layak dengan syarat.

| Kebutuhan | Pilihan | Verdict |
|---|---|---|
| DB + SQLCipher | expo-sqlite 58.0.18 | **PAKAI DENGAN SYARAT** |
| DB alternatif | @op-engineering/op-sqlite 19.0.6 | TOLAK (bukan karena cacat; lihat §2) |
| Kunci | expo-secure-store 58.0.3 | **PAKAI DENGAN SYARAT** |
| Kunci alternatif | react-native-keychain 11.0.0 | TOLAK (tidak perlu) |
| Kripto | react-native-libsodium 1.7.0 dari npm | **TOLAK** -> fork terkunci (lihat §1) |
| Kripto alternatif | react-native-quick-crypto 1.1.10 | TOLAK |
| Biometrik | expo-local-authentication 58.0.3 | PAKAI DENGAN SYARAT |
| FLAG_SECURE | expo-screen-capture 58.0.6 | PAKAI DENGAN SYARAT |
| OAuth | expo-auth-session 58.0.19 + expo-web-browser 58.1.0 | PAKAI DENGAN SYARAT |

Threat model singkat: aset = MK/Data Key, Device Sign Key, Sync Key, Backup Key, plaintext record. Aktor = pencuri perangkat (terkunci/tidak), app lain di device, penyerang supply chain (npm/Maven/CocoaPods), pemegang backup OS. Trust boundary = JS (Hermes heap, tidak bisa di-zeroize) <-> native (Keystore/Keychain, SQLCipher, libsodium) <-> OS backup <-> jaringan (OAuth, relay).

## 1. Kripto - react-native-libsodium (jawaban Q1)

Fakta (tarball 1.7.0):
- Ekspor native (`src/lib.native.ts`, `cpp/react-native-libsodium.cpp`): aead xchacha20, box, secretbox, kdf, pwhash, sign, generichash, hkdf. **Tidak ada secretstream, `crypto_hash_sha256`, `memzero`, konstanta `*_MODERATE`.**
- `postinstall: tar -xzf libsodium/build.tgz`; `build.tgz` (19,6 MB) berisi `.so`/`.a`/`Clibsodium.xcframework` **prebuilt di Mac maintainer** (ada file AppleDouble `._*`, `.DS_Store`). `minisig` di `build.sh` hanya memverifikasi tarball sumber saat maintainer build - binary yang kita terima tidak bisa diverifikasi, tidak reproducible, npm tanpa provenance attestation.
- Podspec `prepare_command` mengekstrak ulang walau postinstall dimatikan -> `allowBuilds: false` tidak menghentikan pemakaian binary itu.
- 1 maintainer (`nikgraf`), rilis 1.7.0 2026-02-09 (angka raka benar). Pakai `NativeModules` + `RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(install)` (arsitektur lama) - di RN 0.88 New-Arch-only bergantung interop layer; **potensial** gagal di bridgeless, belum terbukti.
- `peerDependencies` `*`; ikut menarik `libsodium-wrappers` + `-sumo` ^0.8.2 (web sumo 0.8.4).

**Rekomendasi tegas: jangan `allowBuilds` paket npm ini. Fork terkunci sebagai Expo local module di repo:**
1. Salin binding C++ (MIT) ke `apps/mobile/modules/sodium`, ubah ke Expo Module/JSI (New Arch native), tambah binding `crypto_secretstream_xchacha20poly1305_{init_push,push,init_pull,pull,keygen}`, `crypto_hash_sha256`, konstanta pwhash MODERATE.
2. libsodium **dibangun dari sumber di CI**: unduh tarball rilis 1.0.21-stable, verifikasi `minisign` dengan public key libsodium.org yang di-commit + SHA-256 dipin di repo; hasil build tidak di-commit sebagai blob tanpa checksum. Tanpa postinstall, tanpa `prepare_command` yang mengekstrak blob asing.
3. Test vektor silang wajib (Jest web + smoke device): output byte-identik dengan `libsodium-wrappers-sumo` 0.8.4 untuk Argon2id (`password.normalize('NFC')`, opslimit/memlimit dari header), secretstream (header + chunk 64 KB + tag FINAL + AAD header), kdf subkey `data`/`sync`, Ed25519 detached, BLAKE2b SAS.

Alternatif ditolak: `libsodium-wrappers-sumo` murni JS di Hermes (Hermes tanpa WebAssembly; Argon2id MODERATE 256 MiB via asm.js - **potensial** terlalu lambat/OOM, melanggar target <= 3 detik); `react-native-quick-crypto` (tidak punya Argon2id/XChaCha/secretstream - harus merakit sendiri = "membuat algoritma sendiri", dilarang §7); merakit secretstream dari `@noble/ciphers` (alasan sama).

## 2. DB - expo-sqlite vs op-sqlite (jawaban Q2)

- Keduanya menerima kunci sebagai **string JS** (heap Hermes, tidak bisa di-zeroize) - risiko kunci "hidup lama" setara.
- op-sqlite: `sqlite3_key_v2` dengan buffer + panjang (`cpp/OPBridge.cpp:166-175`), SQLCipher 4.19.0. Lebih rapi, tapi 1 maintainer, iOS menarik pod `OpenSSL-Universal`, Android `io.github.ronickg:openssl:3.6.2-3` (Maven pihak ketiga).
- expo-sqlite: kunci lewat `PRAGMA key` di SQL (bentuk injeksi kalau kunci diinterpolasi dari input; tidak berlaku bila kita yang membangkitkan hex). Pesan error native tidak memuat teks SQL (`SQLExceptions.kt`). iOS pakai CommonCrypto (`-DSQLCIPHER_CRYPTO_CC`), Android OpenSSL prefab `io.github.ronickg:openssl:3.3.2-1` (lebih tua, Low/potensial - SQLCipher hanya memakai AES/HMAC/PBKDF2). SQLCipher 4.17.0, SQLite 3.53.3.
- **Temuan Medium (fail-open):** `android/shouldUsePublication.groovy` memakai AAR **prebuilt tanpa SQLCipher** (dicek: tidak ada string `sqlcipher` di `.so`) kalau properti `expo.sqlite.useSQLCipher` tidak ada. Plugin config yang hilang/typo = DB plaintext diam-diam.

**Pilih expo-sqlite** (Expo-maintained, sesuai ARCHITECTURE §5, CommonCrypto di iOS). Syarat:
- Plugin `["expo-sqlite", { useSQLCipher: true }]` di `app.config.ts`.
- Kunci = 32 byte acak sebagai raw key: `PRAGMA key = "x'<64 hex>'"` (lewati PBKDF2 SQLCipher), dibangun dari bytes di `src/platform/` saja, tidak pernah dari input user, tidak di-log, string dilepas segera.
- Fail-closed saat open: `PRAGMA cipher_version` harus non-kosong dan `SELECT count(*) FROM sqlite_master` sukses setelah key; kalau tidak -> throw, jangan buka DB plaintext. Test regresi untuk ini.
- `PRAGMA synchronous = FULL` + `journal_mode = WAL` dicek nilainya (read-back) saat open.
- Error dari open/key dibungkus pesan generik (tidak meneruskan objek error mentah ke log/Sentry).

## 3. Kunci - expo-secure-store vs react-native-keychain (jawaban Q3)

- expo-secure-store: iOS `SecAccessControlCreateWithFlags(..., .biometryCurrentSet)` + `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` (`ios/SecureStoreModule.swift:229-232`); Android `setUserAuthenticationRequired(true)` tanpa validity window -> auth per pemakaian lewat `BiometricPrompt.CryptoObject` (`AuthenticationPrompt.kt:42`), `BIOMETRIC_STRONG`, dan default Android `invalidatedByBiometricEnrollment = true`. Memenuhi "invalidate saat biometrik berubah" di kedua OS. Tanpa permission manifest.
- react-native-keychain 11.0.0: kontrol lebih banyak (StrongBox, `BIOMETRY_CURRENT_SET`), tapi 1 maintainer, rilis 2026-11-06, menambah `USE_FINGERPRINT`. Tidak ada kebutuhan yang tidak dipenuhi expo-secure-store -> TOLAK.

Syarat expo-secure-store: item kunci pakai `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` + `requireAuthentication: true`; tangani `KeyPermanentlyInvalidated` / item hilang sebagai "kunci rusak -> pulihkan dari backup/QR" (bukan crash, bukan bikin MK baru diam-diam di atas DB lama); jangan mengandalkan `isEnrolledAsync` sebagai gerbang. Plugin `faceIDPermission` dengan teks spesifik.

## 4. Lainnya

- **expo-local-authentication**: hanya untuk cek ketersediaan/UI; gerbang sebenarnya = item secure-store terikat biometrik (rules §3). Menambah `USE_FINGERPRINT` (deprecated) - blok lewat `android.blockedPermissions`.
- **expo-screen-capture**: menambah `READ_EXTERNAL_STORAGE` (<=32), `READ_MEDIA_IMAGES` (33), `DETECT_SCREEN_CAPTURE` (34+) untuk listener screenshot - tidak dipakai -> wajib `blockedPermissions`. FLAG_SECURE dipasang global di root layout (app switcher ikut tertutup). iOS: aktifkan proteksi app switcher bila API tersedia di SDK 58, kalau tidak, overlay privasi saat `AppState` inactive.
- **expo-auth-session**: PKCE S256 (default `usePKCE`), validasi `state`, tanpa client secret, tanpa proxy `auth.expo.io`, redirect = reverse client ID / App Link, bukan scheme `improvepersonal`. ID token diverifikasi **di server** (`iss`, `aud` = client ID Android/iOS, `exp`, `nonce`); code verifier hanya di memori.
- **allowBackup**: `android.allowBackup: false` di `app.config.ts` belum ada (`apps/mobile/app.config.ts`). Sebelum adapter apa pun menulis data.
- Semua paket Expo di atas: tanpa install script, 13 maintainer Expo, npm signature ada, rilis November 2026.

## 5. Audit dependency (jawaban Q4)

`pnpm audit --audit-level=high` exit 1: 18 high, 0 critical (ignore GHSA-86w9 masih aktif).

| Paket | GHSA | Jalur | Perbaikan |
|---|---|---|---|
| node-forge 1.4.0 | 7wch, jc66, 8hrf, hqq3, 5x38, rhr8, 6qrw (7 high, `<=1.4.0`, patched 1.4.1) | mobile: `expo>@expo/cli` + `@expo/cli>@expo/code-signing-certificates`; web: `listhen` | override 1.4.4 |
| node-forge | 86w9 (di-ignore) | sama | range `<=1.4.0` -> hilang di 1.4.4 |
| happy-dom 20.14.5 (dipin override) | c8p4 (`<=20.14.6`), 834v (`<=21.0.3`) | web dev/test | naik ke >=21.0.4 (major) - task web terpisah |
| undici <8.12.2 | xjj6, 4w7w, 2m5v, qrxm | web `nuxt`, `@nuxt/fonts` | override `undici` >=8.12.2 - task web |
| @intlify/* + vue-i18n <11.4.14 | 83rm | web `@nuxtjs/i18n` | override >=11.4.14 - task web |

node-forge (klaim raka terverifikasi): 1.4.1-1.4.4 sudah terbit (1.4.4 2026-11-23). Semua dependent memakai `^1.4.0` -> override aman in-range. 1.4.4 juga menambal `prng` (`randomBytes().toString('binary')`) dan menolak RSA multi-prime yang membocorkan faktor. Tanpa install script, maintainer digitalbazaar. GitHub API masih `first_patched_version: null` untuk 86w9, tapi range rentannya `<= 1.4.0` dan 1.4.1+ memverifikasi DigestInfo kanonik (`lib/rsa.js:305-316`).

**Rekomendasi persis:** `overrides: node-forge: 1.4.4` di `pnpm-workspace.yaml`; **cabut** `auditConfig.ignoreGhsas: [GHSA-86w9-cpqp-85rv]` beserta komentarnya. Trade-off: 1.4.4 baru 1 hari - kalau tim menerapkan `minimumReleaseAge`, pakai 1.4.3 (tetap menutup 7 GHSA) lalu naik ke 1.4.4 setelah masa tunggu.

## Acceptance criteria keamanan slice 2

1. DB tidak bisa dibuka tanpa kunci (test: buka file dengan sqlite3 biasa gagal; `cipher_version` non-kosong); fail-closed ter-test.
2. Tidak ada kunci/kata sandi/ciphertext di log, error, Sentry, atau state Zustand (grep + review).
3. Vektor uji lintas web<->mobile lulus byte-per-byte untuk Argon2id, secretstream, kdf, Ed25519, SAS.
4. Item kunci: `WHEN_UNLOCKED_THIS_DEVICE_ONLY` + terikat biometrik; tambah sidik jari baru -> item invalid -> alur pemulihan (diuji manual di device).
5. Manifest final tanpa `READ_*`/`USE_FINGERPRINT`/`DETECT_SCREEN_CAPTURE`; `allowBackup=false`; FLAG_SECURE aktif di semua layar.
6. `pnpm audit --audit-level=high` tanpa node-forge dan tanpa entri `ignoreGhsas`.

## Tindakan berurutan untuk orchestrator

1. Task deps: override `node-forge: 1.4.4`, cabut ignore 86w9, `pnpm install`, bukti `pnpm why node-forge` = satu versi 1.4.4 + audit.
2. Task web terpisah (bukan #181): happy-dom >=21.0.4, undici >=8.12.2, @intlify >=11.4.14 - audit tetap merah sampai beres.
3. Putuskan Pertanyaan terbuka 1 dan 2 (default: A, `apps/mobile/modules/sodium`).
4. Task fork libsodium (blocking untuk kripto): module Expo + build sumber terverifikasi di CI + vektor uji. Jangan tambahkan `react-native-libsodium` ke `allowBuilds`.
5. Slice 2 non-kripto boleh jalan paralel: `app.config.ts` (`allowBackup:false`, `blockedPermissions`, plugin `expo-sqlite` `useSQLCipher`, `expo-secure-store` `faceIDPermission`), adapter SQLite + SecureKeyStore sesuai syarat §2-§3.
6. OAuth: verifikasi ID token server-side dulu, baru UI login mobile.
