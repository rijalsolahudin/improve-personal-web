import type { ExpoConfig } from 'expo/config'

// Satu-satunya tempat konfigurasi native + deep link (code-quality.md: Navigasi). Isinya publik:
// DILARANG menaruh secret di sini (security.md §2).
//
// New Architecture dan Hermes adalah satu-satunya mode di SDK 58 (tidak ada opsi untuk mematikan),
// jadi tidak ada flag `newArchEnabled`/`jsEngine` di bawah.

/**
 * Permission yang ditarik library/template tapi tidak dipakai fitur mana pun (security.md §10,
 * reports/security-181-native.md §4). `blockedPermissions` menulis `tools:node="remove"`, jadi
 * permission ini hilang dari manifest final walau ada di manifest library.
 */
const BLOCKED_ANDROID_PERMISSIONS = [
  // expo-local-authentication: deprecated sejak API 28; USE_BIOMETRIC tetap dipakai.
  'android.permission.USE_FINGERPRINT',
  // expo-screen-capture: hanya untuk listener screenshot, yang tidak dipakai (cukup FLAG_SECURE).
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.DETECT_SCREEN_CAPTURE',
  // Template prebuild: app tidak menulis ke storage bersama dan tidak menggambar overlay.
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
]

const config: ExpoConfig = {
  name: 'Improve Personal',
  slug: 'improve-personal',
  version: '0.0.0',
  // Custom scheme hanya untuk navigasi non-sensitif; alur sensitif nanti lewat App/Universal Links.
  scheme: 'improvepersonal',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'id.stackinnov.improvepersonal',
    supportsTablet: false,
  },
  android: {
    package: 'id.stackinnov.improvepersonal',
    // DB + prefs tidak boleh ikut Auto Backup (security.md §1). Device-to-device transfer di
    // Android 12+ tetap dibatasi aturan ekstraksi expo-secure-store: hanya sharedpref non-SecureStore.
    allowBackup: false,
    blockedPermissions: BLOCKED_ANDROID_PERMISSIONS,
  },
  platforms: ['ios', 'android'],
  plugins: [
    'expo-router',
    'expo-font',
    'expo-splash-screen',
    // Tanpa properti ini Android memakai AAR prebuilt TANPA SQLCipher (fail-open). Adapter tetap
    // menolak membuka DB kalau `PRAGMA cipher_version` kosong - lihat src/platform/db/open.ts.
    ['expo-sqlite', { useSQLCipher: true }],
    [
      'expo-secure-store',
      {
        faceIDPermission:
          'Face ID dipakai untuk membuka kunci data Improve Personal yang tersimpan di perangkat ini.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
}

export default config
