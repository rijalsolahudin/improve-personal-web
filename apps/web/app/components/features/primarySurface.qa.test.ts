import { mountSuspended } from '@nuxt/test-utils/runtime'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import Card from '../ui/Card/index.vue'
import StatTile from '../ui/StatTile/index.vue'

/**
 * QA #67 - permukaan `--primary` hanya boleh menampung tinta kuat.
 *
 * `--primary` pastel: di 21 kombinasi gaya x tema, `--deep` 3,98:1, `--mute` 3,82:1,
 * `--mute-3` 3,57:1, `--accent` 3,58:1 (semua gagal AA 4,5:1). Yang lulus `--ink` (>=7,72) dan
 * `--deeper` (>=5,09) - angka diuji di `packages/tokens/src/contrast.qa.test.ts`.
 *
 * Test ini menjaga dua hal yang tidak bisa dilihat test token:
 * 1. Aturan CSS yang memasang teks di atas `var(--primary)` memakai token yang diizinkan.
 * 2. Primitif yang terdampak tetap merender label/nilai saat memakai varian primary.
 */

function appRoot(): string {
  const fromPackage = resolve(process.cwd(), 'app')
  return existsSync(fromPackage) ? fromPackage : resolve(process.cwd(), 'apps/web/app')
}

type CssRule = Readonly<{ selector: string; body: string }>

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

function styleRules(source: string): CssRule[] {
  const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match) => (match[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, ''))
    .join('\n')
  return [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? '').trim(),
    body: match[2] ?? '',
  }))
}

function rulesOf(relativePath: string): CssRule[] {
  return styleRules(readFileSync(join(appRoot(), relativePath), 'utf8'))
}

function colorTokenOf(body: string): string | null {
  return /(?:^|;)\s*color:\s*var\((--[a-z0-9-]+)/i.exec(body)?.[1] ?? null
}

/** Token teks yang lolos 4,5:1 di atas `--primary` (lihat tabel QA #67). */
const ALLOWED_ON_PRIMARY = new Set(['--ink', '--deeper'])

/** Setiap aturan yang memasang latar `--primary` sekaligus warna teks di aturan yang sama. */
const SAME_RULE = vueFiles(appRoot())
  .flatMap((file) =>
    styleRules(readFileSync(file, 'utf8')).map((rule) => ({
      ...rule,
      file: file.slice(appRoot().length),
    })),
  )
  .filter(
    (rule) =>
      /background(?:-color)?:\s*var\(--primary\)/.test(rule.body) &&
      /(?:^|;)\s*color:/.test(rule.body),
  )
  .map((rule) => ({
    file: rule.file,
    selector: rule.selector,
    token: colorTokenOf(rule.body),
  }))

/** Teks di elemen turunan dari kontainer `--primary` (tidak terdeteksi aturan yang sama). */
const DESCENDANT_TEXT = [
  { file: '/components/ui/StatTile/index.vue', selector: '.tile-primary .label' },
  { file: '/components/features/calendar/CalendarDayPanel.vue', selector: '.dow' },
  { file: '/components/features/landing/LandingSteps.vue', selector: '.kicker' },
  { file: '/components/features/landing/LandingPreviewCard.vue', selector: '.next-label' },
  { file: '/components/features/daily/DailyWeatherPicker.vue', selector: '.option.on' },
] as const

describe('teks di atas permukaan primary (QA #67)', () => {
  it('aturan berlatar primary memakai token teks yang lulus AA', () => {
    expect(SAME_RULE.length).toBeGreaterThan(0)
    const violations = SAME_RULE.filter(
      (rule) => rule.token === null || !ALLOWED_ON_PRIMARY.has(rule.token),
    ).map((rule) => `${rule.file} · ${rule.selector} · color: ${rule.token ?? '(tidak terbaca)'}`)
    expect(violations).toEqual([])
  })

  it('label/caption di kontainer primary memakai --deeper, bukan --deep', () => {
    const violations = DESCENDANT_TEXT.flatMap((target) => {
      const rule = rulesOf(target.file).find((candidate) => candidate.selector === target.selector)
      if (!rule) return [`${target.file} · ${target.selector} tidak ditemukan`]
      const token = colorTokenOf(rule.body)
      return token === '--deeper' ? [] : [`${target.file} · ${target.selector} · color: ${token}`]
    })
    expect(violations).toEqual([])
  })

  it('StatTile tone primary merender label & nilai di atas tile-primary', async () => {
    const wrapper = await mountSuspended(StatTile, {
      props: { value: 12, unit: 'hari', label: 'Streak', tone: 'primary' },
    })
    expect(wrapper.classes()).toContain('tile-primary')
    expect(wrapper.find('.value').text()).toBe('12hari')
    expect(wrapper.find('.label').text()).toBe('Streak')
  })

  it('Card variant primary tetap merender isi slot', async () => {
    const wrapper = await mountSuspended(Card, {
      props: { variant: 'primary' },
      slots: { default: 'Ringkasan hari' },
    })
    expect(wrapper.classes()).toContain('card-primary')
    expect(wrapper.text()).toBe('Ringkasan hari')
  })
})
