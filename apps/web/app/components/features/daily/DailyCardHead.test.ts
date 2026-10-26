import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import DailyCardHead from './DailyCardHead.vue'

/**
 * Regresi QA #91 BUG-1: isi bar progres kepala kartu Daily pernah 0px karena `.track` yang flex
 * menyusutkan root ProgressBar. happy-dom tidak punya layout engine (`getBoundingClientRect`
 * selalu 0), jadi unit test menjaga bagian yang bisa diamati di DOM (bar, aria, tinggi, isi pct);
 * geometri 56x7 + isi 80% = 44.8px dibuktikan di Chrome headless saat handoff.
 */
const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

async function mountHead(pct = 80) {
  const wrapper = await mountSuspended(DailyCardHead, {
    props: {
      icon: 'list-checks',
      color: '--icon-todo',
      title: 'To-do hari ini',
      titleId: 'daily-todo-title',
      linkLabel: 'Lihat semua to-do',
      linkTo: '/app/to-do',
      pct,
      meta: '8/10 selesai',
    },
  })
  mounted.push(wrapper)
  return wrapper
}

describe('DailyCardHead - bar progres (QA #91)', () => {
  it('merender bar 7px dengan isi selebar pct, bukan elemen kosong', async () => {
    const wrapper = await mountHead(80)

    const bar = wrapper.find('.track .bar')
    expect(bar.exists()).toBe(true)
    expect(bar.attributes('role')).toBe('progressbar')
    expect(bar.attributes('aria-valuenow')).toBe('80')
    expect(bar.attributes('style')).toContain('height: 7px')

    const fill = bar.find('span')
    expect(fill.attributes('style')).toContain('width: 80%')
    expect(wrapper.text()).toContain('8/10 selesai')
  })
})

/**
 * QA #93: di isi kartu <=311px (viewport <=375px) judul `nowrap` menimpa bar progres. Perbaikannya
 * murni CSS (progres pindah baris di <=400px), dan happy-dom tidak menerapkan media query maupun
 * layout - jadi tidak ada jarak piksel yang bisa diukur di sini. Yang dijaga:
 *
 * 1. Struktur DOM: progres tetap anak langsung `.head` (syarat `flex-basis: 100%` bisa melipat).
 * 2. Aturan CSS hasil build sumber: lipatan hanya ada di <=400px, dan aturan dasar (yang dipakai
 *    di atas 400px) tidak menambah `flex-wrap`/`flex-basis` - tampilan >400px tidak berubah.
 *
 * Geometri sebenarnya (judul 120px vs sisa baris 101px @375) dibuktikan di Chrome headless.
 */
function appRoot(): string {
  const fromPackage = resolve(process.cwd(), 'app')
  return existsSync(fromPackage) ? fromPackage : resolve(process.cwd(), 'apps/web/app')
}

/** Isi `<style>` tanpa komentar - komentar memuat kata kunci yang bisa mengacaukan pencocokan. */
function styleBlock(): string {
  const source = readFileSync(
    resolve(appRoot(), 'components/features/daily/DailyCardHead.vue'),
    'utf8',
  )
  return [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match) => (match[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, ''))
    .join('\n')
}

type CssRule = Readonly<{ selector: string; body: string }>

function rulesIn(css: string): CssRule[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? '').trim(),
    body: match[2] ?? '',
  }))
}

/** Indeks `}` penutup blok yang dibuka di `open` (kurung kurawal berimbang), -1 kalau tidak ada. */
function blockEnd(css: string, open: number): number {
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/** Isi blok `@media (...)` tertentu. */
function mediaBlock(css: string, query: RegExp): string {
  const start = css.search(query)
  const open = start === -1 ? -1 : css.indexOf('{', start)
  const end = open === -1 ? -1 : blockEnd(css, open)
  return end === -1 ? '' : css.slice(open + 1, end)
}

/** CSS dasar = seluruh style tanpa blok `@media`, yaitu yang berlaku di semua lebar. */
function stripMediaBlocks(css: string): string {
  let rest = css
  for (;;) {
    const start = rest.search(/@media\s*\(/)
    const open = start === -1 ? -1 : rest.indexOf('{', start)
    const end = open === -1 ? -1 : blockEnd(rest, open)
    if (end === -1) return rest
    rest = rest.slice(0, start) + rest.slice(end + 1)
  }
}

function body(rules: CssRule[], selector: string): string {
  return rules.find((rule) => rule.selector === selector)?.body ?? ''
}

describe('DailyCardHead - judul vs progres (QA #93)', () => {
  it('menjaga progres sebagai anak langsung .head supaya bisa dilipat ke baris kedua', async () => {
    const wrapper = await mountHead()
    const head = wrapper.get('.head').element

    expect(wrapper.get('.progress').element.parentElement).toBe(head)
    expect(wrapper.get('.titles').element.parentElement).toBe(head)
  })

  it('melipat progres ke baris kedua hanya di <=400px, aturan dasar tidak berubah', () => {
    const css = styleBlock()

    const media = rulesIn(mediaBlock(css, /@media\s*\(max-width:\s*400px\)/))
    expect(body(media, '.head')).toContain('flex-wrap: wrap')
    expect(body(media, '.progress')).toContain('flex-basis: 100%')
    expect(body(media, '.progress')).toContain('justify-content: flex-end')

    const base = rulesIn(stripMediaBlocks(css))
    expect(body(base, '.head')).not.toContain('flex-wrap')
    expect(body(base, '.progress')).not.toContain('flex-basis')
    // Judul & meta tetap satu baris: perbaikan tidak boleh didapat dengan memotong teks judul.
    expect(body(base, '.title')).toContain('white-space: nowrap')
    expect(body(base, '.meta')).toContain('white-space: nowrap')
  })

  it('tidak punya media query lain yang menggeser kepala kartu', () => {
    const css = styleBlock()
    const queries = [...css.matchAll(/@media\s*\(([^)]*)\)/g)].map((match) =>
      (match[1] ?? '').trim(),
    )

    expect(queries).toEqual(['max-width: 400px'])
  })
})
