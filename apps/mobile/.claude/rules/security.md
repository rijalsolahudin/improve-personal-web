# Pilar Keamanan - apps/mobile (React Native)

Berlaku untuk semua kode di `apps/mobile` (Expo maupun bare). Acuan: OWASP MASVS v2 (L1 wajib, L2 untuk fitur sensitif).
Prinsip dasar: **bundle JS dan device dianggap milik penyerang**. Semua yang dikirim ke app bisa dibaca; semua keputusan keamanan tetap di backend.

## 1. Penyimpanan (MASVS-STORAGE)

- WAJIB: token (access/refresh), kredensial, dan kunci kripto disimpan di Keychain (iOS) / Keystore (Android) via `expo-secure-store` atau `react-native-keychain`.
- DILARANG: token/PII sensitif di `AsyncStorage`, MMKV tanpa enkripsi, Redux-persist/Zustand-persist mentah, SQLite plaintext, atau file di document dir.
- WAJIB: item secure storage pakai aksesibilitas `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (atau `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` kalau butuh background) - tidak ikut backup/iCloud.
- WAJIB: Android `android:allowBackup="false"` (atau `dataExtractionRules` yang mengecualikan data app).
- WAJIB: logout menghapus semua token, cache query (React Query/Apollo), dan state persist yang berisi data user.
- WAJIB: layar berisi data sensitif disembunyikan di app switcher / screenshot dicegah bila perlu (`FLAG_SECURE`, mis. `expo-screen-capture`).

## 2. Secret di bundle (MASVS-CODE / RESILIENCE)

- DILARANG: API secret, client secret OAuth, private key, atau kredensial pihak ketiga di kode JS, `.env` yang di-bundle (`EXPO_PUBLIC_*`, `react-native-config`), `app.json`/`app.config.ts`, atau `Info.plist`/`strings.xml`.
- ATURAN: semua yang ada di bundle = publik. Yang boleh di app hanya identifier publik (base URL, publishable key, client ID publik). Panggilan yang butuh secret wajib lewat backend.
- WAJIB: obfuscation (Hermes bytecode + R8/ProGuard `minifyEnabled true` di release) dianggap pelengkap, bukan proteksi secret.

## 3. Auth (MASVS-AUTH)

- WAJIB: OAuth/OIDC pakai Authorization Code + PKCE lewat browser sistem (`expo-auth-session` / `react-native-app-auth`); DILARANG login pihak ketiga di WebView.
- WAJIB: access token umur pendek; refresh token dirotasi dan bisa di-revoke di server.
- WAJIB: biometrik (`expo-local-authentication`) hanya sebagai pembuka kunci item Keychain/Keystore yang diikat biometrik - DILARANG sekadar `if (success) showData()`.
- WAJIB: authz tetap dicek di backend untuk tiap request; hide/disable UI bukan kontrol akses.

## 4. Jaringan (MASVS-NETWORK)

- WAJIB: semua endpoint HTTPS/TLS 1.2+. DILARANG `NSAllowsArbitraryLoads: true` dan `android:usesCleartextTraffic="true"` di build release.
- WAJIB: Android `network_security_config` tidak mempercayai user CA di release; iOS ATS aktif.
- WAJIB (L2, untuk API auth/finansial): certificate/public-key pinning (mis. `react-native-ssl-public-key-pinning`) dengan minimal 2 pin (aktif + cadangan) dan rencana rotasi tertulis.
- DILARANG: menonaktifkan validasi sertifikat di kode native/patch library.

## 5. Deep link & intent (MASVS-PLATFORM)

- WAJIB: pakai Universal Links (iOS, `apple-app-site-association`) / App Links (Android, `assetlinks.json`, `autoVerify="true"`) untuk alur sensitif; custom scheme hanya untuk navigasi non-sensitif.
- WAJIB: semua parameter deep link divalidasi schema (zod) sebelum dipakai; route yang butuh login tetap cek sesi.
- DILARANG: deep link yang langsung mengeksekusi aksi (bayar, ubah akun, hapus) tanpa konfirmasi user.
- DILARANG: token/OTP/kode OAuth lewat custom scheme tanpa PKCE.
- WAJIB: Android component (`activity`, `service`, `receiver`) `exported="false"` kecuali memang perlu; yang exported punya validasi.

## 6. WebView

- WAJIB: `react-native-webview` hanya memuat origin allowlist (`originWhitelist` + cek di `onShouldStartLoadWithRequest`).
- DILARANG: `javaScriptEnabled` + `injectedJavaScript`/`postMessage` bridge ke konten yang tidak dikontrol; `allowFileAccess`/`allowUniversalAccessFromFileURLs`/`mixedContentMode="always"`.
- WAJIB: pesan dari `onMessage` divalidasi schema dan origin-nya dicek; DILARANG mengirim token ke WebView lewat URL query.

## 7. Logging & data (MASVS-PRIVACY)

- Aturan log, PII, dan scrub crash/analytics (`beforeSend` Sentry, dsb.) bersama: lihat `.claude/rules/keamanan-bersama.md` (root).
- Build release membuang `console.*` (`babel-plugin-transform-remove-console` atau setara).
- WAJIB: clipboard tidak dipakai untuk data sensitif (atau dibersihkan).
- WAJIB: input password/OTP pakai `secureTextEntry` / `textContentType` yang benar dan `autoCorrect={false}`.

## 8. Build release (MASVS-RESILIENCE)

- WAJIB: release build `debuggable=false`, dev menu/Flipper/Reactotron hanya di debug (`__DEV__` guard), tidak ada endpoint dev/staging.
- WAJIB: keystore Android & sertifikat iOS di luar repo (secret CI / EAS credentials). DILARANG commit `*.keystore`, `*.jks`, `*.p12`, `google-services.json` berisi key privat, atau `.env`.
- WAJIB (L2): deteksi root/jailbreak/emulator (mis. `jail-monkey`) untuk fitur sensitif - sebagai sinyal ke backend, bukan satu-satunya kontrol.
- WAJIB: pertimbangkan App Attest / Play Integrity untuk endpoint bernilai tinggi.

## 9. OTA update (EAS Update / CodePush)

- WAJIB: code signing update aktif (EAS Update `codeSigningCertificate`); private key tidak di repo.
- WAJIB: channel/branch production terpisah dan hanya bisa dipublish dari CI dengan approval.
- DILARANG: OTA dipakai untuk mengubah izin native atau melewati review store; perubahan native wajib lewat rilis store.

## 10. Permission

- WAJIB: minta izin runtime saat fitur dipakai (just-in-time), bukan saat app dibuka; jelaskan alasannya (`NS*UsageDescription` spesifik).
- DILARANG: menambah permission di `AndroidManifest.xml`/`Info.plist`/`app.json` tanpa fitur yang memakainya; audit permission yang ditarik library.
- WAJIB: handle izin ditolak tanpa crash dan tanpa memaksa.

## 11. Dependency & supply chain (spesifik mobile)

- Aturan dasar (lockfile, audit, cek library): lihat `.claude/rules/keamanan-bersama.md` (root).
- WAJIB: Pod/Gradle dependency di-pin versinya.
- WAJIB: library native baru dicek permission yang ditambahkannya (lihat §10).

## Checklist review (PR yang menyentuh mobile)

- [ ] Token/kredensial hanya di Keychain/Keystore; tidak ada di AsyncStorage/persist store.
- [ ] Tidak ada secret di JS, `EXPO_PUBLIC_*`, `app.config`, atau file native.
- [ ] Semua request HTTPS; tidak ada cleartext/ATS exception baru; pinning untuk API sensitif.
- [ ] Parameter deep link divalidasi; aksi sensitif butuh konfirmasi + sesi.
- [ ] WebView dibatasi allowlist; bridge `onMessage` divalidasi.
- [ ] Tidak ada log/analytics berisi token atau PII.
- [ ] Permission baru punya alasan & dipakai fitur; komponen Android tidak exported tanpa perlu.
- [ ] Release build: debug tools mati, signing key di luar repo, OTA ter-sign.
