import { prettierCompat, sharedRules, typescriptRules } from '@improve-personal/config/eslint'
import expoConfig from 'eslint-config-expo/flat.js'
import { defineConfig } from 'eslint/config'

/** Modul native hanya boleh diimpor dari `src/platform/` (code-quality.md: Struktur folder). */
const NATIVE_MODULES = [
  'expo-font',
  'expo-splash-screen',
  'expo-sqlite',
  'expo-secure-store',
  'expo-local-authentication',
  'expo-notifications',
  'expo-screen-capture',
  'react-native-libsodium',
]

const navigationRestriction = {
  group: ['@react-navigation/*'],
  message: 'Satu library navigasi: pakai API expo-router (code-quality.md: Navigasi).',
}

export default defineConfig([
  { ignores: ['.expo/**', 'dist/**', 'android/**', 'ios/**', 'expo-env.d.ts'] },
  ...expoConfig,
  {
    // Versi eksplisit: deteksi otomatis eslint-plugin-react memakai API yang dihapus di ESLint 10.
    settings: { react: { version: '19.3' } },
    rules: {
      ...sharedRules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            navigationRestriction,
            { group: NATIVE_MODULES, message: 'Modul native hanya lewat src/platform/.' },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: typescriptRules,
  },
  {
    files: ['src/platform/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [navigationRestriction] }],
    },
  },
  {
    // Route tipis: tanpa akses core/storage langsung (ARCHITECTURE.md mobile §7).
    files: ['app/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            navigationRestriction,
            { group: NATIVE_MODULES, message: 'Modul native hanya lewat src/platform/.' },
            {
              group: ['@improve-personal/core', '@improve-personal/core/*', '@/platform/*'],
              message: 'app/** hanya route: logika & storage lewat src/features.',
            },
          ],
        },
      ],
    },
  },
  {
    // File konfigurasi tooling berjalan di Node (CommonJS).
    files: ['*.config.js', 'jest.setup.ts'],
    languageOptions: {
      globals: { require: 'readonly', module: 'writable', __dirname: 'readonly' },
    },
  },
  prettierCompat,
])
