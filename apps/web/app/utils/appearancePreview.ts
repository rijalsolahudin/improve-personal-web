import {
  STYLE_FAMILIES,
  STYLE_NAMES,
  uiStyles,
  type StyleFamily,
  type StyleName,
} from '@improve-personal/tokens'

/**
 * Preview mini gaya di menu Tampilan.
 *
 * Dihitung dari definisi gaya (bukan dengan memasang `data-style` di elemen preview): gaya default
 * hidup di `:root`, jadi `[data-style='clean']` bersarang tidak punya blok CSS untuk diterapkan -
 * preview gaya default akan salah tampil saat gaya lain aktif. Nilai px di sini = ukuran mockup
 * kartu kecil, dikali pengali gaya seperti token aslinya.
 */

/** Radius & tebal garis kartu mini sebelum dikali pengali gaya (`--rk`/`--bk`). */
const PREVIEW_RADIUS_PX = 12
const PREVIEW_BORDER_PX = 2
/** Offset bayangan dasar kartu mini (setara `--shadow-drop` yang diperkecil). */
const PREVIEW_SHADOW_PX = 4
/** Warna bayangan keras bawaan komponen saat gaya tidak menyetel warnanya. */
const DEFAULT_SHADOW_COLOR = 'rgba(47,42,36,.18)'

export type StylePreview = Readonly<{
  fontFamily: string
  fontWeight: string
  borderRadius: string
  border: string
  boxShadow: string
  isPatterned: boolean
}>

const px = (value: number): string => `${Number(value.toFixed(2))}px`

export function stylePreview(name: StyleName): StylePreview {
  const style = uiStyles[name]
  const { x, y, blur, color } = style.shadow
  const borderWidth = PREVIEW_BORDER_PX * style.borderScale
  const outline = style.outline ?? 'var(--ink)'

  return {
    fontFamily: style.fonts.display,
    fontWeight: style.weights.display,
    borderRadius: px(PREVIEW_RADIUS_PX * style.radiusScale),
    border: borderWidth > 0 ? `${px(borderWidth)} solid ${outline}` : 'none',
    boxShadow:
      color === 'transparent'
        ? 'none'
        : `${px(PREVIEW_SHADOW_PX * x)} ${px(PREVIEW_SHADOW_PX * y)} ${px(PREVIEW_SHADOW_PX * blur)} ${color ?? DEFAULT_SHADOW_COLOR}`,
    isPatterned: style.isPatterned,
  }
}

export type StyleGroup = Readonly<{ family: StyleFamily; styles: readonly StyleName[] }>

/** Gaya dikelompokkan per keluarga, urutan keluarga & gaya mengikuti token. */
export function styleGroups(): readonly StyleGroup[] {
  return STYLE_FAMILIES.map((family) => ({
    family,
    styles: STYLE_NAMES.filter((name) => uiStyles[name].family === family),
  }))
}

export function familyOf(name: StyleName): StyleFamily {
  return uiStyles[name].family
}
