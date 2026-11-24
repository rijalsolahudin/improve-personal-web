import type { ReactNode } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useThemedStyles } from '@/hooks/useThemedStyles'
import { useTheme } from '@/providers/ThemeProvider'
import type { Theme } from '@/theme'

import { AppText } from './AppText'

// Ruang bawah supaya konten terakhir tidak tertutup dock + FAB yang mengambang.
const DOCK_CLEARANCE = 112

export type ScreenProps = {
  title: string
  eyebrow?: string
  children: ReactNode
}

/** Kerangka layar: judul + konten statis yang bisa di-scroll. List dinamis pakai FlashList. */
export function Screen({ title, eyebrow, children }: ScreenProps) {
  const styles = useThemedStyles(createStyles)
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + theme.spacing[16], paddingBottom: DOCK_CLEARANCE },
      ]}
    >
      <View style={styles.heading}>
        {eyebrow ? (
          <AppText variant="eyebrow" tone="accent">
            {eyebrow}
          </AppText>
        ) : null}
        <AppText variant="h1">{title}</AppText>
      </View>
      {children}
    </ScrollView>
  )
}

const createStyles = (theme: Theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: { gap: theme.layout.gap, paddingHorizontal: theme.layout.gap },
  heading: { gap: theme.spacing[4] },
})
