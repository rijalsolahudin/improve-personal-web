import { ICONS, type IconName } from '@improve-personal/tokens/icons'
import Svg, { Circle, Ellipse, Path } from 'react-native-svg'

const VIEWBOX = '0 0 24 24'

export type IconProps = {
  name: IconName
  color: string
  size?: number
  strokeWidth?: number
  /** Isi bentuk dengan warna garis (mis. pip habit yang tercapai). */
  isFilled?: boolean
}

/**
 * Ikon garis dari data SVG bersama (`@improve-personal/tokens/icons`). Dekoratif: makna dibawa teks
 * pendamping, jadi disembunyikan dari pembaca layar.
 */
export function Icon({ name, color, size = 18, strokeWidth = 2, isFilled = false }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={VIEWBOX}
      fill={isFilled ? color : 'none'}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {ICONS[name].map((element, index) => {
        // Daftar elemen statis per ikon (tidak pernah diurut ulang), jadi indeks aman sebagai key.
        const key = `${name}-${index}`
        switch (element.tag) {
          case 'path':
            return <Path key={key} d={element.d} />
          case 'circle':
            return <Circle key={key} cx={element.cx} cy={element.cy} r={element.r} />
          case 'ellipse':
            return (
              <Ellipse key={key} cx={element.cx} cy={element.cy} rx={element.rx} ry={element.ry} />
            )
        }
      })}
    </Svg>
  )
}
