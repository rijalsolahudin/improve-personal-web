import type { IconName } from '@improve-personal/tokens/icons'
import type { ReactNode } from 'react'
import { Pressable, View, type PressableProps, type ViewProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useThemedStyles } from '@/hooks/useThemedStyles'
import { useTheme } from '@/providers/ThemeProvider'
import type { Theme } from '@/theme'

import { AppText } from './AppText'
import { StickerIcon } from './StickerIcon'

const DOCK_ICON_SIZE = 28

export type DockProps = ViewProps & {
  children: ReactNode
  /** Elemen di luar pil dock, mis. FAB (navigasi opsi C: dock + FAB terpisah). */
  trailing?: ReactNode
  accessibilityLabel: string
}

/** Bar navigasi bawah berbentuk pil yang mengambang di atas safe area. */
export function Dock({ children, trailing, accessibilityLabel, style, ...props }: DockProps) {
  const styles = useThemedStyles(createStyles)
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View
      style={[styles.bar, { paddingBottom: insets.bottom + theme.spacing[10] }, style]}
      {...props}
    >
      <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.pill}>
        {children}
      </View>
      {trailing}
    </View>
  )
}

export type DockItemProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string
  icon: IconName
  /** Warna stiker saat tab aktif. */
  color: string
  /** Diisi otomatis oleh `TabTrigger asChild` expo-router. */
  isFocused?: boolean
}

export function DockItem({ label, icon, color, isFocused = false, ...props }: DockItemProps) {
  const styles = useThemedStyles(createStyles)
  const theme = useTheme()

  return (
    // `props` disebar lebih dulu: style/role bawaan TabTrigger tidak boleh menimpa milik dock.
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}
    >
      <StickerIcon
        icon={icon}
        color={isFocused ? color : theme.colors['icon-off']}
        size={DOCK_ICON_SIZE}
      />
      <AppText variant="caption" tone={isFocused ? 'ink' : 'muted'} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  )
}

const createStyles = (theme: Theme) => ({
  bar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[10],
    paddingHorizontal: theme.layout.gap,
  },
  pill: {
    flex: 1,
    flexDirection: 'row' as const,
    paddingVertical: theme.spacing[6],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.tabbar,
    borderWidth: theme.border.thin,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.paper,
    boxShadow: theme.shadow.drop,
  },
  item: {
    flex: 1,
    minHeight: theme.layout.tapMin,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[4],
  },
  pressed: { opacity: theme.pressedOpacity },
})
