const TRAILING_NUMBER = /(\d+(?:\.\d+)?)(?:px)?\)?$/

/**
 * Token web berupa string CSS (`'22px'`, `'var(--fs-display-30)'`). RN butuh angka, jadi ambil angka
 * terakhirnya - sumber nilainya tetap `@improve-personal/tokens`, bukan salinan manual.
 */
export function tokenPx(value: string): number {
  const match = TRAILING_NUMBER.exec(value.trim())
  if (!match?.[1]) throw new Error(`Token tidak berisi angka px: "${value}"`)
  return Number(match[1])
}
