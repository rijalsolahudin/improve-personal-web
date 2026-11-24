import * as ScreenCapture from 'expo-screen-capture'
import { useEffect } from 'react'
import { Platform } from 'react-native'

/**
 * Proteksi layar global (security.md §1, reports/security-181-native.md §4).
 *
 * - Android: `FLAG_SECURE` di window - screenshot/rekaman diblok dan pratinjau app switcher kosong.
 * - iOS: screenshot/rekaman diblok (iOS 13+) + overlay blur saat app tidak aktif, karena iOS tidak
 *   punya padanan FLAG_SECURE untuk snapshot app switcher.
 *
 * Dipasang sekali di provider akar supaya semua layar ikut, bukan per layar.
 */

/** Satu kunci untuk seluruh app: tidak ada layar yang boleh mencabut proteksi sendiri. */
const PROTECTION_KEY = 'improve-personal.global'

/** Blur penuh: pratinjau app switcher tidak boleh menyisakan teks yang terbaca. */
const APP_SWITCHER_BLUR = 1

export function useScreenProtection(): void {
  useEffect(() => {
    // Gagal memasang proteksi tidak boleh membuat app crash; tidak ada aksi pemulihan di runtime.
    ScreenCapture.preventScreenCaptureAsync(PROTECTION_KEY).catch(() => undefined)
    if (Platform.OS === 'ios') {
      ScreenCapture.enableAppSwitcherProtectionAsync(APP_SWITCHER_BLUR).catch(() => undefined)
    }

    return () => {
      ScreenCapture.allowScreenCaptureAsync(PROTECTION_KEY).catch(() => undefined)
      if (Platform.OS === 'ios') {
        ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => undefined)
      }
    }
  }, [])
}
