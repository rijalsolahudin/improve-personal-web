import { useMemo } from 'react'
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native'

import { useTheme } from '@/providers/ThemeProvider'
import type { Theme } from '@/theme'

type NamedStyles<T> = { [K in keyof T]: ViewStyle | TextStyle | ImageStyle }

/**
 * StyleSheet yang bergantung tema, dibuat ulang hanya saat tema berganti. `factory` WAJIB fungsi
 * level modul (referensi stabil), bukan fungsi inline di render.
 */
export function useThemedStyles<T extends NamedStyles<T>>(
  factory: (theme: Theme) => T,
): Readonly<T> {
  const theme = useTheme()
  return useMemo(() => StyleSheet.create(factory(theme)), [factory, theme])
}
