import { Pressable, type PressableProps } from 'react-native'

import { useThemedStyles } from '@/hooks/useThemedStyles'
import type { Theme } from '@/theme'

import { AppText } from './AppText'

export type ChipProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string
  isActive?: boolean
}

/** Chip filter/pilihan. Status aktif diumumkan ke pembaca layar lewat `selected`. */
export function Chip({ label, isActive = false, ...props }: ChipProps) {
  const styles = useThemedStyles(createStyles)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      style={({ pressed }) => [styles.chip, isActive && styles.active, pressed && styles.pressed]}
      {...props}
    >
      <AppText variant="bodyStrong" style={isActive ? styles.activeLabel : styles.label}>
        {label}
      </AppText>
    </Pressable>
  )
}

const createStyles = (theme: Theme) => ({
  chip: {
    minHeight: theme.layout.tapMin,
    justifyContent: 'center' as const,
    paddingHorizontal: theme.spacing[14],
    borderRadius: theme.radius.pill,
    borderWidth: theme.border.base,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.paper,
  },
  active: {
    borderColor: theme.colors.ink,
    backgroundColor: theme.colors.accent,
  },
  pressed: { opacity: theme.pressedOpacity },
  label: { color: theme.colors['mute-2'], fontSize: theme.fontSize.bodySm },
  activeLabel: { color: theme.colors.paper, fontSize: theme.fontSize.bodySm },
})
