import { AppText, Card, Screen, StickerIcon } from '@/components/ui'
import { useTheme } from '@/providers/ThemeProvider'

/** Kerangka F5 - editor jurnal asli menyusul di F6. */
export function JournalScreen() {
  const theme = useTheme()

  return (
    <Screen eyebrow="Fokus" title="Jurnal">
      <Card>
        <StickerIcon icon="notebook-pen" color={theme.colors['icon-more']} />
        <AppText variant="h3">Tulis jurnal pertamamu</AppText>
        <AppText tone="muted">Catatan harian tersimpan terenkripsi di perangkat ini.</AppText>
      </Card>
    </Screen>
  )
}
