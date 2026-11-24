import { Text, type TextProps } from 'react-native'

import { useThemedStyles } from '@/hooks/useThemedStyles'
import type { Theme } from '@/theme'

type AppTextVariant = 'h1' | 'h2' | 'h3' | 'body' | 'bodyStrong' | 'caption' | 'eyebrow'
type AppTextTone = 'ink' | 'muted' | 'accent'

export type AppTextProps = TextProps & {
  variant?: AppTextVariant
  tone?: AppTextTone
}

/** Teks dengan font & ukuran dari tokens. Judul (`h1`-`h3`) otomatis berperan header. */
export function AppText({ variant = 'body', tone = 'ink', style, ...props }: AppTextProps) {
  const styles = useThemedStyles(createStyles)
  const isHeading = variant === 'h1' || variant === 'h2' || variant === 'h3'

  return (
    <Text
      accessibilityRole={isHeading ? 'header' : undefined}
      style={[styles[variant], styles[tone], style]}
      {...props}
    />
  )
}

const createStyles = (theme: Theme) => ({
  h1: { fontFamily: theme.fonts.display, fontSize: theme.fontSize.h1 },
  h2: { fontFamily: theme.fonts.display, fontSize: theme.fontSize.h2 },
  h3: { fontFamily: theme.fonts.display, fontSize: theme.fontSize.h3 },
  body: { fontFamily: theme.fonts.body, fontSize: theme.fontSize.body },
  bodyStrong: { fontFamily: theme.fonts.strong, fontSize: theme.fontSize.body },
  caption: { fontFamily: theme.fonts.body, fontSize: theme.fontSize.caption },
  eyebrow: {
    fontFamily: theme.fonts.strong,
    fontSize: theme.fontSize.eyebrow,
    textTransform: 'uppercase' as const,
  },
  ink: { color: theme.colors.ink },
  muted: { color: theme.colors.mute },
  accent: { color: theme.colors.deep },
})
