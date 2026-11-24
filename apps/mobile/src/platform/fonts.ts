import { Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2/800ExtraBold'
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold'
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold'
import { useFonts } from 'expo-font'

import { FONT_FAMILY } from '@/theme'

// Impor per bobot (bukan barrel paket) supaya hanya 3 berkas TTF yang ikut bundle.
const FONT_SOURCES = {
  [FONT_FAMILY.display]: Baloo2_800ExtraBold,
  [FONT_FAMILY.body]: Nunito_600SemiBold,
  [FONT_FAMILY.strong]: Nunito_800ExtraBold,
}

/** `true` setelah font siap atau gagal dimuat (fallback ke font sistem, app tetap jalan). */
export function useAppFonts(): boolean {
  const [isLoaded, error] = useFonts(FONT_SOURCES)
  return isLoaded || error !== null
}
