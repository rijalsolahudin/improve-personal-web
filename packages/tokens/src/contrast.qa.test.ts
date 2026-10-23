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

function violations(pairs: readonly Pair[], threshold: number = AA_NORMAL): string[] {
  const found: string[] = []
  for (const style of STYLE_NAMES) {
    for (const theme of THEME_NAMES) {
      const tokens = tokensFor(style, theme)
      for (const pair of pairs) {
        const fg = token(tokens, pair.fg)
        const bg = token(tokens, pair.bg)
        const ratio = contrastRatio(fg, bg)
        if (ratio < threshold) {
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
 * terpilih), `--hover` (slot jam yang di-hover), dan `--chip` (badge arsip). Di sana latarnya lebih
 * gelap, jadi pasangan yang "lulus di paper" bisa gagal:
 * - `--mute-3` di `--soft`: 21/21 gagal, terendah 3,51:1 (`CalendarTimeGrid.vue` `.head.selected`).
 * - `--accent` di `--soft`: 16/21 gagal, terendah 3,87:1 (`.head.today .num`).
 * - `--mute` di `--hover`: 4/21 gagal (`CalendarTimeGrid.vue` `.slot:hover`).
 * - `--ink-2` di `--dash`: 2/21 gagal (`PomodoroHistory.vue` badge sesi dilewati).
 *
 * Dua lapis perbaikannya: token redup/aksen digelapkan sampai lulus di permukaan state (supaya
 * pemakaian baru tidak langsung melanggar), dan komponen memakai token yang setara dengan perannya
 * (`--mute-2` untuk caption di state terpilih, `--deep` untuk aksen, `--chip` untuk badge arsip).
 *
 * Pasangan state diuji dengan ambang lebih tinggi dari AA (`STATE_MARGIN`, 4,62:1): setelah token
 * digelapkan, sisa ruang di atas 4,5:1 hanya 0,005-0,08 untuk tiga pasangan - pembulatan atau satu
 * langkah penggelapan berikutnya bisa langsung menjatuhkannya di bawah AA tanpa ada yang sadar.
 */
const STATE_MARGIN = 4.62

/** Permukaan yang benar-benar menampung teks di aplikasi. */
const STATE_SURFACES = ['soft', 'hover', 'chip'] as const

/** Seluruh ramp teks yang dipakai di atas permukaan state (lihat komponen kalender, chip, kartu). */
const STATE_TEXT = ['ink', 'ink-2', 'mute', 'mute-2', 'mute-3', 'accent', 'deep', 'deeper'] as const

describe('kontras AA di permukaan state (QA T16 MAYOR-2)', () => {
  it('caption redup tetap terbaca di permukaan state terpilih (soft/hover)', () => {
    expect(
      violations(
        [
          { fg: 'mute-3', bg: 'soft', label: 'caption di kepala hari terpilih' },
          { fg: 'mute-3', bg: 'hover', label: 'caption di slot jam hover' },
          { fg: 'mute', bg: 'soft', label: 'teks redup di kartu soft' },
          { fg: 'mute', bg: 'hover', label: 'teks redup di baris hover' },
          { fg: 'mute-2', bg: 'soft', label: 'caption tegas di permukaan soft' },
          { fg: 'mute-2', bg: 'hover', label: 'caption tegas di permukaan hover' },
        ],
        STATE_MARGIN,
      ),
    ).toEqual([])
  })

  it('teks utama & sekunder di permukaan state memenuhi ambang', () => {
    expect(
      violations(
        [
          { fg: 'ink', bg: 'soft', label: 'teks utama di permukaan soft' },
          { fg: 'ink-2', bg: 'soft', label: 'teks sekunder di permukaan soft' },
          { fg: 'ink-2', bg: 'hover', label: 'teks sekunder di permukaan hover' },
        ],
        STATE_MARGIN,
      ),
    ).toEqual([])
  })

  it('aksen sebagai teks di permukaan state memenuhi ambang', () => {
    expect(
      violations(
        [
          // `.head.today .num` (22px, bobot < 700) dan `.status-via` (chip "lewat" di Panduan).
          { fg: 'accent', bg: 'soft', label: 'angka hari ini di kepala soft' },
          { fg: 'deep', bg: 'soft', label: 'aksen gelap di permukaan soft' },
          { fg: 'deep', bg: 'hover', label: 'aksen gelap di permukaan hover' },
          { fg: 'deeper', bg: 'soft', label: 'aksen tergelap di permukaan soft' },
        ],
        STATE_MARGIN,
      ),
    ).toEqual([])
  })

  /**
   * `--dash` adalah token GARIS (pemisah dashed, scrollbar, sel habit kosong, batas check-in), bukan
   * permukaan teks - dan tidak bisa dirangkap jadi keduanya:
   * - supaya `--mute-3` (L≈0,13) lulus 4,5:1, `--dash` harus ≥L 0,65-0,75 (~#E0E0E0) di SEMUA gaya;
   * - sebagai garis, `--dash` justru harus tetap lebih gelap dari kertas (sekarang 1,3-2,9:1).
   * Nilai yang memenuhi keduanya tidak ada. Karena itu teks redup tidak boleh ditaruh di atas `--dash`
   * (satu-satunya pemakaian, badge sesi Pomodoro yang dilewati, sudah pindah ke `--chip`), sementara
   * teks kuat (`--ink`/`--ink-2`) tetap dijaga lulus di atasnya.
   */
  it('badge arsip di atas chip & tanda garis (dash) memenuhi ambang', () => {
    expect(
      violations(
        [
          { fg: 'ink-2', bg: 'dash', label: 'badge arsip di atas dash' },
          { fg: 'ink-2', bg: 'chip', label: 'badge arsip di atas chip' },
          { fg: 'mute', bg: 'chip', label: 'teks redup di atas chip' },
        ],
        STATE_MARGIN,
      ),
    ).toEqual([])
  })

  it('seluruh ramp teks lulus di setiap permukaan state (24 pasangan x 21 kombinasi)', () => {
    const pairs = STATE_TEXT.flatMap((fg) =>
      STATE_SURFACES.map((bg) => ({ fg, bg, label: `ramp ${fg} di ${bg}` })),
    )
    expect(violations(pairs, STATE_MARGIN)).toEqual([])
  })
})

/**
 * QA #67 - teks di atas permukaan `--primary` (blok fitur: strip "Sekarang", ringkasan hari di
 * kalender, kartu langkah & kartu "Berikutnya" di landing, StatTile `tone="primary"`).
 *
 * `--primary` adalah pastel signature, bukan permukaan teks netral. Diukur di 21 kombinasi
 * gaya x tema: `--accent` 3,58:1, `--mute-3` 3,57:1, `--mute` 3,82:1, `--deep` 3,98:1,
 * `--mute-2` 4,15:1, `--paper` 1,02:1 - semuanya gagal 4,5:1. Yang lulus cuma tinta kuat:
 * `--ink` >=7,72:1 dan `--deeper` >=5,09:1 (juga `--ink-2` 4,59:1, tapi terlalu mepet ambang
 * `STATE_MARGIN` sehingga tidak diizinkan sebagai teks di permukaan ini).
 *
 * Karena itu komponen memakai `--deeper` untuk label/caption dan `--ink` untuk judul di atas
 * `--primary` (bukan `--deep`). Ambang `STATE_MARGIN` dipakai supaya token tidak "pas-pasan" -
 * kedua tinta yang diizinkan menyisakan >=0,47 di atas AA.
 */
const PRIMARY_PAIRS: readonly Pair[] = [
  { fg: 'ink', bg: 'primary', label: 'judul di blok fitur primary' },
  { fg: 'deeper', bg: 'primary', label: 'label/caption di blok fitur primary' },
]

describe('kontras AA teks di permukaan primary (QA #67)', () => {
  it('label & judul di blok fitur primary lulus ambang state (2 pasangan x 21 kombinasi)', () => {
    expect(violations(PRIMARY_PAIRS, STATE_MARGIN)).toEqual([])
  })
})

/**
 * QA #62 - teks state "selesai"/arsip tidak boleh diredupkan lewat `opacity`.
 *
 * Pola lama `opacity: 0.5-0.6` pada judul to-do/habit/goal membuat `--ink` (11-13:1) jatuh ke
 * 2,8-3,7:1, di bawah AA - dan `opacity` tidak bisa diaudit dari token. Penggantinya token teks
 * yang sudah diukur: `--mute-3` untuk permukaan `paper`/`alt` (>= 5,39:1), `--mute` untuk latar
 * campuran warna kategori/jadwal atau kartu arsip yang tint-nya bervariasi (>= 4,89:1), karena
 * `--mute-3` di campuran `#0A55E6`/`#E2445C` 15% turun ke 4,32-4,46:1.
 *
 * Ambang tetap `STATE_MARGIN` supaya token tidak "pas-pasan" di 4,5:1.
 */
describe('teks state selesai & arsip (QA #62)', () => {
  it('judul selesai di permukaan kertas/inset/menu memenuhi ambang', () => {
    expect(
      violations(
        [
          { fg: 'mute-3', bg: 'paper', label: 'judul to-do selesai' },
          { fg: 'mute-3', bg: 'bg', label: 'judul selesai di halaman' },
          { fg: 'mute-3', bg: 'alt', label: 'baris selesai di inset / tanggal luar bulan' },
          { fg: 'mute-3', bg: 'soft', label: 'judul selesai di kartu soft / opsi terpilih' },
        ],
        STATE_MARGIN,
      ),
    ).toEqual([])
  })

  it('teks redup di kartu arsip & kartu jadwal (latar tint kategori) memenuhi ambang', () => {
    expect(
      violations(
        [
          { fg: 'mute', bg: 'paper', label: 'judul selesai di kartu jadwal' },
          { fg: 'mute', bg: 'alt', label: 'teks redup di latar inset' },
          { fg: 'mute', bg: 'hover', label: 'teks redup di baris hover' },
          { fg: 'mute', bg: 'chip', label: 'teks redup di badge arsip' },
        ],
        STATE_MARGIN,
      ),
    ).toEqual([])
  })
})
