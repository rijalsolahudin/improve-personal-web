/**
 * QA T25 (F16) - kontras teks WCAG AA di SETIAP kombinasi gaya × tema.
 *
 * Yang diuji adalah teks yang benar-benar dipakai aplikasi, bukan semua pasangan warna yang mungkin:
 * - `--ink` / `--ink-2`: teks utama & sekunder (main.css `body { color: var(--ink) }`).
 * - `--mute` / `--mute-2` / `--mute-3`: teks redup - dipakai di 72/26/40 tempat, ukuran 10.5-14px
 *   (mis. `CalendarTimeGrid.vue:220`, `CalendarGridTask.vue:119`, `DailyCardHead.vue`).
 * - `--accent`: warna tautan global (`main.css:22-25`) dan teks di opsi terpilih
 *   (`Segmented/index.vue` `[aria-pressed='true']`).
 * - `--paper` di atas `--accent`: teks di atas tombol/badge beraksen (`Segmented`, `E2eeExplainer.vue:48`).
 * - `--placeholder`: placeholder input (`main.css:50-52`).
 * - chip prioritas & status: teks chip yang dipakai di To-do/Daily.
 *
 * Ambang: 4.5:1 untuk teks normal (WCAG 2.1 SC 1.4.3 AA). Semua teks di atas berukuran < 18.66px
 * bold / < 24px, jadi ambang "large text" 3:1 TIDAK berlaku.
 */
import { describe, expect, it } from 'vitest'

import { THEME_NAMES, palette, themes, type ThemeName } from './colors.ts'
import { STYLE_NAMES, uiStyles, type StyleName } from './styles.ts'

const AA_NORMAL = 4.5

type Pair = Readonly<{ fg: string; bg: string; label: string }>

function channels(value: string): [number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim())
  if (hex) {
    const digits = hex[1]
    if (!digits) throw new Error(`warna tidak bisa dibaca: ${value}`)
    const n = Number.parseInt(digits, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value.trim())
  if (rgb) {
    const parts = (rgb[1] ?? '').split(',').map((part) => Number.parseFloat(part.trim()))
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
  }
  throw new Error(`warna tidak bisa dibaca: ${value}`)
}

function luminance(value: string): number {
  const linear = channels(value).map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const [r, g, b] = [linear[0] ?? 0, linear[1] ?? 0, linear[2] ?? 0]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(fg)
  const b = luminance(bg)
  const [light, dark] = a > b ? [a, b] : [b, a]
  return (light + 0.05) / (dark + 0.05)
}

/** Nilai token efektif: palet tetap + ramp tema, ditimpa neutrals & brand gaya. */
function tokensFor(style: StyleName, theme: ThemeName): Record<string, string> {
  return {
    ...palette,
    ...themes[theme],
    ...uiStyles[style].neutrals,
    ...(uiStyles[style].brand?.[theme] ?? {}),
  }
}

function token(tokens: Record<string, string>, key: string): string {
  const value = tokens[key]
  if (!value) throw new Error(`token --${key} tidak punya nilai`)
  return value
}

function violations(pairs: readonly Pair[]): string[] {
  const found: string[] = []
  for (const style of STYLE_NAMES) {
    for (const theme of THEME_NAMES) {
      const tokens = tokensFor(style, theme)
      for (const pair of pairs) {
        const fg = token(tokens, pair.fg)
        const bg = token(tokens, pair.bg)
        const ratio = contrastRatio(fg, bg)
        if (ratio < AA_NORMAL) {
          found.push(
            `${style}/${theme} · ${pair.label}: ${pair.fg} (${fg}) di ${pair.bg} (${bg}) = ${ratio.toFixed(2)}:1`,
          )
        }
      }
    }
  }
  return found
}

describe('kontras AA di semua kombinasi gaya × tema (F16)', () => {
  it('teks utama (ink, ink-2) memenuhi 4.5:1', () => {
    expect(
      violations([
        { fg: 'ink', bg: 'paper', label: 'teks utama di kartu' },
        { fg: 'ink', bg: 'bg', label: 'teks utama di halaman' },
        { fg: 'ink', bg: 'alt', label: 'teks utama di inset' },
        { fg: 'ink-2', bg: 'paper', label: 'teks sekunder di kartu' },
        { fg: 'deep', bg: 'paper', label: 'teks aksen gelap di kartu' },
        { fg: 'deeper', bg: 'soft', label: 'teks terpilih di latar soft' },
      ]),
    ).toEqual([])
  })

  it('teks redup 10.5-14px (mute, mute-2) memenuhi 4.5:1', () => {
    expect(
      violations([
        { fg: 'mute', bg: 'paper', label: 'teks redup di kartu' },
        { fg: 'mute', bg: 'bg', label: 'teks redup di halaman' },
        { fg: 'mute-2', bg: 'paper', label: 'teks redup-2 di kartu' },
      ]),
    ).toEqual([])
  })

  it('teks halus / caption (mute-3) memenuhi 4.5:1', () => {
    expect(
      violations([
        { fg: 'mute-3', bg: 'paper', label: 'caption di kartu' },
        { fg: 'mute-3', bg: 'bg', label: 'caption di halaman' },
      ]),
    ).toEqual([])
  })

  it('tautan & aksen sebagai teks memenuhi 4.5:1', () => {
    expect(
      violations([
        { fg: 'accent', bg: 'paper', label: 'tautan di kartu' },
        { fg: 'accent', bg: 'bg', label: 'tautan di halaman' },
      ]),
    ).toEqual([])
  })

  it('teks di atas tombol beraksen (paper di accent) memenuhi 4.5:1', () => {
    expect(violations([{ fg: 'paper', bg: 'accent', label: 'teks tombol beraksen' }])).toEqual([])
  })

  it('placeholder input memenuhi 4.5:1', () => {
    expect(violations([{ fg: 'placeholder', bg: 'paper', label: 'placeholder' }])).toEqual([])
  })

  it('teks chip prioritas & status memenuhi 4.5:1', () => {
    expect(
      violations([
        { fg: 'prio-urgent-fg', bg: 'prio-urgent-bg', label: 'chip urgent' },
        { fg: 'prio-medium-fg', bg: 'prio-medium-bg', label: 'chip medium' },
        { fg: 'prio-low-fg', bg: 'prio-low-bg', label: 'chip low' },
        { fg: 'success', bg: 'paper', label: 'teks sukses' },
        { fg: 'success', bg: 'success-soft', label: 'teks sukses di latar lembut' },
        { fg: 'danger', bg: 'paper', label: 'teks bahaya' },
      ]),
    ).toEqual([])
  })
})

/**
 * QA T16 MAYOR-2 / B8 - permukaan STATE, bukan cuma permukaan utama.
 *
 * Temuan T25 (441 pasangan di atas) hanya menguji teks di atas `paper`/`bg`. Yang lolos dari mata
 * adalah teks yang duduk di atas permukaan state: `--soft` (hari terpilih, kartu "soft", baris
 * terpilih) dan `--hover` (slot jam yang di-hover). Di sana latarnya lebih gelap, jadi pasangan yang
 * "lulus di paper" bisa gagal:
 * - `--mute-3` di `--soft`: 21/21 gagal, terendah 3,51:1 (`CalendarTimeGrid.vue` `.head.selected`).
 * - `--accent` di `--soft`: 16/21 gagal, terendah 3,87:1 (`.head.today .num`).
 * - `--mute` di `--hover`: 4/21 gagal (`CalendarTimeGrid.vue` `.slot:hover`).
 * - `--ink-2` di `--dash`: 2/21 gagal (`PomodoroHistory.vue` badge sesi dilewati).
 *
 * Dua lapis perbaikannya: token redup/aksen digelapkan sampai lulus di permukaan state (supaya
 * pemakaian baru tidak langsung melanggar), dan komponen memakai token yang setara dengan perannya
 * (`--mute-2` untuk caption di state terpilih, `--deep` untuk aksen, `--chip` untuk badge arsip).
 * Test ini menjaga keduanya: kalau ada yang mengembalikan nilai lama, pasangan di bawah merah lagi.
 */
describe('kontras AA di permukaan state (QA T16 MAYOR-2)', () => {
  it('caption redup tetap terbaca di permukaan state terpilih (soft/hover)', () => {
    expect(
      violations([
        { fg: 'mute-3', bg: 'soft', label: 'caption di kepala hari terpilih' },
        { fg: 'mute-3', bg: 'hover', label: 'caption di slot jam hover' },
        { fg: 'mute', bg: 'soft', label: 'teks redup di kartu soft' },
        { fg: 'mute', bg: 'hover', label: 'teks redup di baris hover' },
        { fg: 'mute-2', bg: 'soft', label: 'caption tegas di permukaan soft' },
        { fg: 'mute-2', bg: 'hover', label: 'caption tegas di permukaan hover' },
      ]),
    ).toEqual([])
  })

  it('teks utama & sekunder di permukaan state memenuhi 4.5:1', () => {
    expect(
      violations([
        { fg: 'ink', bg: 'soft', label: 'teks utama di permukaan soft' },
        { fg: 'ink-2', bg: 'soft', label: 'teks sekunder di permukaan soft' },
        { fg: 'ink-2', bg: 'hover', label: 'teks sekunder di permukaan hover' },
      ]),
    ).toEqual([])
  })

  it('aksen sebagai teks di permukaan soft memenuhi 4.5:1', () => {
    expect(
      violations([
        // `.head.today .num` (22px, bobot < 700) dan teks tautan di kartu ber-`soft`.
        { fg: 'accent', bg: 'soft', label: 'angka hari ini di kepala soft' },
        { fg: 'deep', bg: 'soft', label: 'aksen gelap di permukaan soft' },
        { fg: 'deep', bg: 'hover', label: 'aksen gelap di permukaan hover' },
        { fg: 'deeper', bg: 'soft', label: 'aksen tergelap di permukaan soft' },
      ]),
    ).toEqual([])
  })

  it('badge arsip di atas tanda garis (dash) & chip memenuhi 4.5:1', () => {
    expect(
      violations([
        // `--dash` dipakai sebagai latar badge "dilewati"; `--chip` adalah pengganti yang benar.
        { fg: 'ink-2', bg: 'dash', label: 'badge arsip di atas dash' },
        { fg: 'ink-2', bg: 'chip', label: 'badge arsip di atas chip' },
        { fg: 'mute', bg: 'chip', label: 'teks redup di atas chip' },
      ]),
    ).toEqual([])
  })
})
