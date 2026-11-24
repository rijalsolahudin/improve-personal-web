// Mock native module terpusat (code-quality.md: Testing). Test komponen tidak me-mock sendiri.
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock'

import { fakeSqlite } from './jest/fakeExpoSqlite'
import { fakeSecureStore } from './jest/fakeSecureStore'

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext)

// Font dianggap sudah dimuat: test memeriksa perilaku UI, bukan pemuatan aset native.
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
}))

// SQLite asli (node:sqlite) + emulasi SQLCipher; kendalinya `fakeSqlite`.
jest.mock('expo-sqlite', () => jest.requireActual('./jest/fakeExpoSqlite'))

// Keychain/Keystore in-memory dengan simulasi biometrik berubah; kendalinya `fakeSecureStore`.
jest.mock('expo-secure-store', () => jest.requireActual('./jest/fakeSecureStore'))

jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  hasHardwareAsync: jest.fn(async () => true),
  getEnrolledLevelAsync: jest.fn(async () => 3),
}))

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
  enableAppSwitcherProtectionAsync: jest.fn(async () => undefined),
  disableAppSwitcherProtectionAsync: jest.fn(async () => undefined),
}))

// State fake native dan riwayat panggilan mock tidak boleh bocor antar test.
beforeEach(() => {
  jest.clearAllMocks()
  fakeSqlite.reset()
  fakeSecureStore.reset()
})
