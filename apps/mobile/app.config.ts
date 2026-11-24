import type { ExpoConfig } from 'expo/config'

// Satu-satunya tempat konfigurasi native + deep link (code-quality.md: Navigasi). Isinya publik:
// DILARANG menaruh secret di sini (security.md §2).
//
// New Architecture dan Hermes adalah satu-satunya mode di SDK 58 (tidak ada opsi untuk mematikan),
// jadi tidak ada flag `newArchEnabled`/`jsEngine` di bawah.
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
  },
  platforms: ['ios', 'android'],
  plugins: ['expo-router', 'expo-font', 'expo-splash-screen'],
  experiments: {
    typedRoutes: true,
  },
}

export default config
