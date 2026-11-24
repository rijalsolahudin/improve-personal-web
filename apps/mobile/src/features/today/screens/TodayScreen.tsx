import { useRouter } from 'expo-router'

import { AppText, Card, Chip, Row, Screen, StickerIcon } from '@/components/ui'
import { useTheme } from '@/providers/ThemeProvider'

/** Kerangka F5 - isi Daily asli menyusul di F6. */
export function TodayScreen() {
  const theme = useTheme()
  const router = useRouter()

  return (
    <Screen eyebrow="Hari ini" title="Halo!">
      <Card variant="soft">
        <StickerIcon icon="sun" color={theme.colors['icon-daily']} />
        <AppText variant="h3">Ringkasan harian</AppText>
        <AppText tone="muted">Jadwal, tugas, dan habit hari ini akan tampil di sini.</AppText>
      </Card>
      <Row>
        <Chip label="Lihat habit" onPress={() => router.push('/habit')} />
      </Row>
    </Screen>
  )
}
