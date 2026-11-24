import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native'

import { useThemedStyles } from '@/hooks/useThemedStyles'
import type { Theme } from '@/theme'

type CardVariant = 'paper' | 'soft' | 'primary'

export type CardProps = ViewProps & {
  /** paper = kontainer list; soft/primary = blok fitur berwarna tema. */
  variant?: CardVariant
  style?: StyleProp<ViewStyle>
}

export function Card({ variant = 'paper', style, ...props }: CardProps) {
  const styles = useThemedStyles(createStyles)
  return <View style={[styles.base, styles[variant], style]} {...props} />
}

const createStyles = (theme: Theme) => ({
  base: {
    padding: theme.spacing[16],
    gap: theme.spacing[12],
  },
  paper: {
    borderWidth: theme.border.thin,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.hero,
    backgroundColor: theme.colors.paper,
  },
  soft: {
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.soft,
  },
  primary: {
    borderRadius: theme.radius.hero,
    backgroundColor: theme.colors.primary,
  },
})
