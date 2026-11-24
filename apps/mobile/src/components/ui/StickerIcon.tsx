import { shadow } from '@improve-personal/tokens'
import type { IconName } from '@improve-personal/tokens/icons'
import { View } from 'react-native'

import { useTheme } from '@/providers/ThemeProvider'

import { Icon } from './Icon'

// Proporsi tile "daun" dari desain (sama dengan AppIcon web): sudut besar, sudut kiri-bawah lancip,
// kotak dalam miring sedikit, ikon garis ~0,65 sisi kotak dalam.
const OUTER_RADIUS_RATIO = 0.34
const LEAF_RADIUS_RATIO = 0.125
const INNER_RATIO = 0.63
const INNER_RADIUS_RATIO = 0.35
const ICON_RATIO = 0.65
const INNER_TILT = '-6deg'

export type StickerIconProps = {
  icon: IconName
  /** Warna tile, mis. `theme.colors['icon-todo']`. */
  color: string
  size?: number
}

/** Ikon "stiker" berwarna di kepala kartu & dock. Dekoratif - label ada di teks pendamping. */
export function StickerIcon({ icon, color, size = 32 }: StickerIconProps) {
  const theme = useTheme()
  const outer = Math.round(size * OUTER_RADIUS_RATIO)
  const inner = Math.round(size * INNER_RATIO)

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color,
        borderTopLeftRadius: outer,
        borderTopRightRadius: outer,
        borderBottomRightRadius: outer,
        borderBottomLeftRadius: Math.round(size * LEAF_RADIUS_RATIO),
        boxShadow: shadow['shadow-icon-inset'],
      }}
    >
      <View
        style={{
          width: inner,
          height: inner,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: Math.round(inner * INNER_RADIUS_RATIO),
          borderWidth: theme.border.thin,
          borderColor: theme.colors.ink,
          backgroundColor: theme.colors.paper,
          transform: [{ rotate: INNER_TILT }],
        }}
      >
        <Icon name={icon} color={theme.colors.ink} size={Math.round(inner * ICON_RATIO)} />
      </View>
    </View>
  )
}
