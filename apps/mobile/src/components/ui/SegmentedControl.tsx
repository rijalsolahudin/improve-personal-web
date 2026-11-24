import { Pressable, View } from 'react-native'

import { useThemedStyles } from '@/hooks/useThemedStyles'
import type { Theme } from '@/theme'

import { AppText } from './AppText'

export type SegmentOption<T extends string> = Readonly<{ value: T; label: string }>

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Nama grup untuk pembaca layar, mis. "Tampilan kalender". */
  accessibilityLabel: string
}

/** Pilihan tunggal berbentuk pil. Controlled: state dipegang pemanggil. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const styles = useThemedStyles(createStyles)

  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.track}>
      {options.map((option) => {
        const isSelected = option.value === value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            onPress={() => {
              if (!isSelected) onChange(option.value)
            }}
            style={[styles.segment, isSelected && styles.selected]}
          >
            <AppText variant="bodyStrong" tone={isSelected ? 'ink' : 'muted'} style={styles.label}>
              {option.label}
            </AppText>
          </Pressable>
        )
      })}
    </View>
  )
}

const createStyles = (theme: Theme) => ({
  track: {
    flexDirection: 'row' as const,
    padding: theme.spacing[4],
    gap: theme.spacing[4],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.chip,
  },
  segment: {
    flex: 1,
    minHeight: theme.layout.tapMin,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.radius.pill,
  },
  selected: {
    backgroundColor: theme.colors.paper,
    boxShadow: theme.shadow.drop,
  },
  label: { fontSize: theme.fontSize.bodySm },
})
