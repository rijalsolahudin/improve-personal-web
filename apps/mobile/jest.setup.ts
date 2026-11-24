// Mock native module terpusat (code-quality.md: Testing). Test komponen tidak me-mock sendiri.
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock'

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext)

// Font dianggap sudah dimuat: test memeriksa perilaku UI, bukan pemuatan aset native.
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
}))
