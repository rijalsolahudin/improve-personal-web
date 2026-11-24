import type { IconName } from '@improve-personal/tokens/icons'
import { Pressable, type PressableProps } from 'react-native'

import { useThemedStyles } from '@/hooks/useThemedStyles'
import { useTheme } from '@/providers/ThemeProvider'
import type { Theme } from '@/theme'

import { Icon } from './Icon'

// Lebih besar dari target tap minimum supaya aksi utama mudah dijangkau jempol.
const FAB_SIZE = 56
const FAB_ICON_SIZE = 26
const FAB_ICON_STROKE = 2.5

export type FabProps = Omit<PressableProps, 'children' | 'style'> & {
  /** Label pembaca layar - FAB hanya berisi ikon. */
  accessibilityLabel: string
  icon?: IconName
}

/** Tombol aksi utama mengambang (Quick add). */
export function Fab({ icon = 'plus', ...props }: FabProps) {
  const styles = useThemedStyles(createStyles)
  const theme = useTheme()

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
      {...props}
    >
      <Icon
        name={icon}
        color={theme.colors.paper}
        size={FAB_ICON_SIZE}
        strokeWidth={FAB_ICON_STROKE}
      />
    </Pressable>
  )
}

const createStyles = (theme: Theme) => ({
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.radius.pill,
    borderWidth: theme.border.base,
    borderColor: theme.colors.ink,
    backgroundColor: theme.colors.accent,
    boxShadow: theme.shadow.drop,
  },
  pressed: { opacity: theme.pressedOpacity },
})
