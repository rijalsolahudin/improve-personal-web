import { useRouter } from 'expo-router'
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui'
import { useCallback } from 'react'

import { Dock, DockItem, Fab } from '@/components/ui'
import { useThemedStyles } from '@/hooks/useThemedStyles'
import { useTheme } from '@/providers/ThemeProvider'
import type { Theme } from '@/theme'

import { DOCK_TABS } from '../dockTabs'

/** Navigator tab utama: konten tab + dock mengambang + FAB Quick add terpisah (opsi C). */
export function AppTabs() {
  const styles = useThemedStyles(createStyles)
  const theme = useTheme()
  const router = useRouter()
  const handleQuickAdd = useCallback(() => router.push('/quick-add'), [router])

  return (
    <Tabs style={styles.root}>
      <TabSlot />
      <TabList asChild style={styles.dock}>
        <Dock
          accessibilityLabel="Navigasi utama"
          trailing={<Fab accessibilityLabel="Tambah cepat" onPress={handleQuickAdd} />}
        >
          {DOCK_TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <DockItem label={tab.label} icon={tab.icon} color={theme.colors[tab.color]} />
            </TabTrigger>
          ))}
        </Dock>
      </TabList>
    </Tabs>
  )
}

const createStyles = (theme: Theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  dock: { position: 'absolute' as const, left: 0, right: 0, bottom: 0 },
})
