import {
  DEFAULT_THEME,
  THEME_NAMES,
  palette,
  semanticColors,
  themes,
  type ThemeName,
} from './colors.ts'
import { border, fontFamily, motion, radius, shadow, space, typography } from './scale.ts'
import { DEFAULT_STYLE, STYLE_NAMES, uiStyles, type StyleName } from './styles.ts'

type TokenGroup = Readonly<Record<string, string>>

const declarations = (group: TokenGroup, indent = '  '): string =>
  Object.entries(group)
    .map(([name, value]) => `${indent}--${name}: ${value};`)
    .join('\n')

const aliases = (group: TokenGroup): TokenGroup =>
  Object.fromEntries(Object.entries(group).map(([name, source]) => [name, `var(--${source})`]))

/** `13px 13px 13px 5px` → tiap nilai px dikali `var(--rk)` (atau `--bk`). */
const scaleBy = (multiplier: string, group: TokenGroup): TokenGroup =>
  Object.fromEntries(
    Object.entries(group).map(([name, value]) => [
      name,
      value.replace(/(\d*\.?\d+)px/g, (_, px: string) => `calc(${px}px * var(${multiplier}))`),
    ]),
  )

/** Bayangan offset `0 Ypx 0 color` → offset/blur ikut pengali gaya; warna bisa ditimpa gaya. */
const scaleShadows = (group: TokenGroup): TokenGroup =>
  Object.fromEntries(
    Object.entries(group).map(([name, value]) => {
      const drop = /^0 (\d+)px 0 (.+)$/.exec(value)
      if (drop) {
        const [, px, color] = drop
        const offset = (axis: string) => `calc(${px}px * var(${axis}))`
        return [
          name,
          `${offset('--sx')} ${offset('--sy')} ${offset('--sbl')} var(--shadow-color, ${color})`,
        ]
      }
      return [name, value.replace(/-(\d+)px/, (_, px: string) => `calc(-${px}px * var(--bev))`)]
    }),
  )

const DOT_PATTERN = 'radial-gradient(rgba(255,255,255,.35) 1.2px, transparent 1.2px)'

/** Gaya tanpa dekorasi: ikon nav polos tanpa tile warna (Desktop.dc.html `navbg/navin/navbd`). */
const PLAIN_NAV_ICON = {
  'nav-icon-bg': 'transparent',
  'nav-icon-inner-bg': 'transparent',
  'nav-icon-inner-border': '0px',
  'nav-icon-scale': '1.55',
  'nav-icon-fg': 'var(--mute-2)',
  'nav-icon-fg-active': 'var(--accent)',
  'logo-bg': 'var(--accent)',
  'logo-fg': '#FFFFFF',
} as const

/** Elemen dekorasi bawaan (washi tape, maskot) ditandai atribut ini di komponen. */
const DECO_BUILTIN_SELECTOR = '[data-deco-builtin]'

function styleVariables(name: StyleName): TokenGroup {
  const style = uiStyles[name]
  const vars: Record<string, string> = {
    'font-display': style.fonts.display,
    'font-body': style.fonts.body,
    'font-hand': style.fonts.hand,
    'fw-display': style.weights.display,
    'fw-strong': style.weights.strong,
    'fw-body': style.weights.body,
    'fw-medium': style.weights.medium,
    rk: String(style.radiusScale),
    bk: String(style.borderScale),
    sx: String(style.shadow.x),
    sy: String(style.shadow.y),
    sbl: String(style.shadow.blur),
    bev: style.isDecorated ? '1' : '0',
    outline: style.outline ?? 'var(--ink)',
    'pattern-dots': style.isDecorated ? DOT_PATTERN : 'none',
    ...(style.isDecorated ? {} : PLAIN_NAV_ICON),
    ...style.neutrals,
  }
  if (style.shadow.color) vars['shadow-color'] = style.shadow.color
  if (!style.isPatterned) vars.grid = 'transparent'
  return vars
}

const block = (selector: string, group: TokenGroup): string =>
  `${selector} {\n${declarations(group)}\n}`

const themeBlock = (name: ThemeName): string => block(`[data-theme='${name}']`, themes[name])

/**
 * Gaya non-default. Aksen per tema butuh selector gabungan supaya menang dari `[data-theme]`;
 * tanpa atribut tema berarti tema default.
 */
/** PRD F16: maskot & washi tape bawaan hanya tampil di gaya berdekorasi (Cute, Cute Pure). */
const decoRule = (name: StyleName): string[] =>
  uiStyles[name].isDecorated
    ? []
    : [`[data-style='${name}'] ${DECO_BUILTIN_SELECTOR} {\n  display: none;\n}`]

function styleBlocks(name: StyleName): string[] {
  const { brand } = uiStyles[name]
  const base = { ...styleVariables(name), ...brand?.[DEFAULT_THEME] }
  const themed = brand
    ? THEME_NAMES.filter((theme) => theme !== DEFAULT_THEME).map((theme) =>
        block(`[data-style='${name}'][data-theme='${theme}']`, brand[theme]),
      )
    : []
  return [block(`[data-style='${name}']`, base), ...themed, ...decoRule(name)]
}

/**
 * Render semua token jadi CSS custom properties.
 * Tema & gaya default ada di `:root`; tema lain di-override lewat `[data-theme]`, gaya lewat `[data-style]`.
 */
export function toCssVariables(): string {
  // Digabung jadi satu objek: gaya default menimpa font/bobot dasar tanpa deklarasi ganda.
  const root = declarations({
    ...palette,
    ...themes[DEFAULT_THEME],
    ...fontFamily,
    ...typography,
    ...styleVariables(DEFAULT_STYLE),
    ...scaleBy('--rk', radius),
    ...scaleBy('--bk', border),
    ...scaleShadows(shadow),
    ...motion,
    ...space,
    ...aliases(semanticColors),
  })

  const themeOverrides = THEME_NAMES.filter((name) => name !== DEFAULT_THEME).map(themeBlock)
  const styleOverrides = STYLE_NAMES.filter((name) => name !== DEFAULT_STYLE).flatMap(styleBlocks)

  return [
    '/* Generated by @improve-personal/tokens - jangan diedit manual. */',
    `:root {\n${root}\n}`,
    ...themeOverrides,
    ...styleOverrides,
    '',
  ].join('\n')
}
