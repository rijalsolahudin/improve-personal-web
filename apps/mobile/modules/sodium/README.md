# modules/sodium - libsodium untuk mobile (#181)

Expo local module (Expo Modules API, New Architecture) yang membungkus **libsodium 1.0.21 yang
dibangun dari sumber terverifikasi**. Menggantikan `react-native-libsodium` dari npm yang ditolak
review keamanan (`reports/security-181-native.md` §1: tanpa secretstream/SHA-256, binary prebuilt
tanpa provenance, arsitektur lama).

App hanya boleh memakai modul ini lewat `src/platform/sodium.ts`.

## Struktur

| Path | Isi |
|---|---|
| `cpp/ip_sodium.{h,c}` | Lapisan C bersama: validasi panjang, output ke buffer pemanggil, `sodium_memzero` temporari |
| `android/` | Lem JNI (`ip_sodium_jni.c`), `IpSodiumModule.kt`, CMake, test instrumented |
| `ios/` | `IpSodiumModule.swift`, XCTest; podspec ada di akar modul (`IpSodium.podspec`) |
| `index.ts` | Tipe kontrak native (`IpSodiumNativeModule`) |
| `__mocks__/index.ts` | Native tiruan untuk Jest, menjawab dari `vectors.json` |
| `scripts/` | `libsodium.lock` (pin), `build-libsodium.sh`, `verify-minisign.mjs` |
| `test-vectors/` | `generate.mjs` -> `vectors.json`; `host/` uji lapisan C di mesin host |
| `vendor/` | Hasil build (di-.gitignore, tidak pernah di-commit) |

## Fungsi

Daftar diambil dari pemakaian nyata di `apps/web/app/utils/crypto/**`, `utils/storage/session.ts`,
`utils/drive/config-store.ts`, dan rencana ADR 17 / ARCHITECTURE §7.

| Fungsi (`platform/sodium.ts`) | libsodium | Pemakai di web / alasan |
|---|---|---|
| `randomBytes` | `randombytes_buf` | master key, nonce, salt |
| `memzero` | `sodium_memzero` | kunci backup setelah dipakai |
| `aeadEncrypt` / `aeadDecrypt` | `crypto_aead_xchacha20poly1305_ietf_*` | record lokal (`provider.ts`) |
| `kdfDeriveFromKey` | `crypto_kdf_derive_from_key` | `ip-data-`, `ip-keyid`, `ip-sync-` |
| `pwhash` (+ `encodePassword` NFC) | `crypto_pwhash` Argon2id13 | kunci backup (`backup-cipher.ts`) |
| `secretstreamInitPush/Push/InitPull/Pull/Dispose` | `crypto_secretstream_xchacha20poly1305_*` | backup, transfer, segmen sync |
| `pad` / `unpad` | `sodium_pad` / `sodium_unpad` | blob record v2 (blok 256) |
| `toBase64` / `fromBase64` | `sodium_bin2base64` / `sodium_base642bin` (ORIGINAL) | blob record, salt |
| `signKeypair/SeedKeypair/Detached/VerifyDetached` | `crypto_sign_ed25519_*` | Device Sign Key + lisensi (web memakai WebCrypto; Hermes tidak punya Ed25519) |
| `genericHash` | `crypto_generichash` | kode verifikasi transfer `BLAKE2b(key, 'ip-sas')` (§7) |
| `hashSha256` | `crypto_hash_sha256` | diminta keputusan #181; belum ada pemakai di web |

## Build libsodium

```sh
bash modules/sodium/scripts/build-libsodium.sh fetch    # unduh + verifikasi saja
bash modules/sodium/scripts/build-libsodium.sh host     # + make check, untuk uji vektor host
ANDROID_NDK_HOME=... bash modules/sodium/scripts/build-libsodium.sh android
bash modules/sodium/scripts/build-libsodium.sh ios      # macOS + Xcode
```

Sebelum ada yang diekstrak, script memeriksa **SHA-256** tarball terhadap pin dan **tanda tangan
minisign** dengan public key resmi yang dipin (`minisign` bila terpasang, kalau tidak
`verify-minisign.mjs`). Trusted comment harus menyebut nama tarball. Tiap target menulis
`vendor/<target>/BUILD-MANIFEST.txt` (versi, SHA-256 sumber, toolchain, SHA-256 artefak).
`SOURCE_DATE_EPOCH`, `-ffile-prefix-map`, dan `ranlib -D` membuat hasil build bisa diulang.

Variabel opsional: `LIBSODIUM_WORK_DIR` (direktori kerja), `LIBSODIUM_VENDOR_DIR` (keluaran; perlu
di filesystem yang menolak chmod, mis. NTFS), `LIBSODIUM_RUN_CHECK=0` (lewati `make check`).

Mengganti versi: unduh versi baru, verifikasi minisign, tulis SHA-256 yang lolos ke
`libsodium.lock`, regenerate & cek vektor, lalu review keamanan. Pin NDK ada di `libsodium.lock` dan
`android/build.gradle` - ubah keduanya bersamaan.

## Vektor uji (tiga lapis)

`test-vectors/vectors.json` dibuat dari `libsodium-wrappers-sumo` yang dipakai web:

```sh
node apps/mobile/modules/sodium/test-vectors/generate.mjs          # tulis
node apps/mobile/modules/sodium/test-vectors/generate.mjs --check  # gagal bila web berubah
```

| Lapis | Yang dibuktikan | Perintah |
|---|---|---|
| Jest | wrapper TS (`platform/sodium.ts`) memanggil native dengan argumen/ukuran yang menghasilkan byte web | `pnpm --filter @improve-personal/mobile test` |
| Host | `cpp/ip_sodium.c` + libsodium hasil build = byte web | `node test-vectors/host/verify-host.mjs vendor/host` |
| Perangkat | lem JNI/Swift + libsodium NDK/xcframework = byte web | androidTest `IpSodiumVectorsTest`, XCTest `IpSodiumVectorsTests` |

Jest memakai native tiruan; kesamaan byte native **hanya** terbukti lewat lapis host dan perangkat.

## Job CI yang dibutuhkan (terpisah dari job JS)

1. **vectors** (Linux, tiap PR yang menyentuh `apps/web/**/crypto`, lockfile, atau modul ini):
   `generate.mjs --check`.
2. **libsodium-host** (Linux): `build-libsodium.sh host` + `verify-host.mjs vendor/host`.
3. **libsodium-android** (Linux + NDK `27.1.12297006`): `build-libsodium.sh android`, prebuild, lalu
   `connectedAndroidTest` modul di emulator x86_64 (dan arm64 bila runner tersedia). Simpan
   `vendor/android/**/BUILD-MANIFEST.txt` sebagai artefak.
4. **libsodium-ios** (macOS + Xcode): `build-libsodium.sh ios`, `pod install`, jalankan test_spec
   `IpSodium/Tests` di simulator. Simpan manifest sebagai artefak.
5. Build EAS memakai artefak job 3/4 (atau membangun ulang dengan script yang sama) - tidak pernah
   binary dari luar pipeline ini.
