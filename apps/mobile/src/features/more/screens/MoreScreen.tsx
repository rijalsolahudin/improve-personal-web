import { useRouter } from 'expo-router'

import { AppText, Card, Chip, Row, Screen, StickerIcon } from '@/components/ui'
import { useTheme } from '@/providers/ThemeProvider'

/** Kerangka F5 - menu lengkap (backup, sinkron, tema, panduan) menyusul di F6/F7. */
export function MoreScreen() {
  const theme = useTheme()
  const router = useRouter()

  return (
    <Screen title="Lainnya">
      <Card>
        <Row gap={12}>
          <StickerIcon icon="flame" color={theme.colors['icon-habit']} />
          <AppText variant="h3">Habit</AppText>
        </Row>
        <Chip label="Buka habit" onPress={() => router.push('/habit')} />
      </Card>
      <Card variant="soft">
        <AppText tone="muted">Backup, sinkron, dan tema menyusul.</AppText>
      </Card>
    </Screen>
  )
}
