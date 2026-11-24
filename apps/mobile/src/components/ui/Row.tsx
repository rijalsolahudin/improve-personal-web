import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import { useTheme } from '@/providers/ThemeProvider'
import type { Theme } from '@/theme'

export type RowProps = {
  children: ReactNode
  /** Jarak antar anak, dari anak tangga spasi tema. */
  gap?: keyof Theme['spacing']
  isWrapping?: boolean
}

/** Susunan horizontal dengan jarak dari token (pengganti `style={{ flexDirection: 'row' }}`). */
export function Row({ children, gap = 8, isWrapping = false }: RowProps) {
  const theme = useTheme()
  return (
    <View style={[styles.row, isWrapping && styles.wrap, { gap: theme.spacing[gap] }]}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexWrap: 'wrap' },
})
