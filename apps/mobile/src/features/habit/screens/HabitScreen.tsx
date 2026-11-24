import { AppText, Card, Screen, StickerIcon } from '@/components/ui'
import { useTheme } from '@/providers/ThemeProvider'

/** Kerangka F5 - daftar habit asli menyusul di F6. */
export function HabitScreen() {
  const theme = useTheme()

  return (
    <Screen eyebrow="Fokus" title="Habit">
      <Card variant="primary">
        <StickerIcon icon="flame" color={theme.colors['icon-habit']} />
        <AppText variant="h3">Belum ada habit</AppText>
        <AppText>Habit yang kamu bangun akan tampil di sini.</AppText>
      </Card>
    </Screen>
  )
}
