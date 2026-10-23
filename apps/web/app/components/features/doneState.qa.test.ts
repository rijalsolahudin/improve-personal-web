import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { PriorityTask } from '~/utils/dailyRoutine'
import type { Task } from '~/utils/tasks'

import DailyPriorityRow from './daily/DailyPriorityRow.vue'
import TodoRow from './todo/TodoRow.vue'

/**
 * QA #62 - state "selesai" harus tetap terbedakan TANPA menurunkan kontras teks.
 *
 * Dua lapis:
 * 1. Perilaku: baris selesai masih membawa kelas `done` + checkbox tercentang, jadi coret/ikon
 *    (penanda visual state) tetap dirender.
 * 2. Penjaga statis: aturan CSS untuk state persisten (`done`/`dim`/`outside`/`revoked`) tidak boleh
 *    memakai `opacity` lagi, dan aturan judul selesai harus memakai token teks (`--mute-*`) sambil
 *    mempertahankan `line-through`. Ini menangkap pola `opacity: 0.5` yang sebelumnya tersebar di
 *    15+ komponen (teks `--ink` turun ke 2,8-3,7:1).
 *
 * `opacity` pada komponen disabled, dekorasi (washi tape, garis, handle, maskot, animasi) dan
 * state drag transien tidak masuk cakupan - lihat catatan di laporan #69.
 */

/** `pnpm --filter @improve-personal/web ...` menjalankan vitest dari root package web. */
function appRoot(): string {
  const fromPackage = resolve(process.cwd(), 'app')
  return existsSync(fromPackage) ? fromPackage : resolve(process.cwd(), 'apps/web/app')
}

/** Aturan state yang menampung teks konten aktif (bukan disabled/dekorasi). */
const PERSISTENT_STATE = /\.(done|dim|outside|revoked)\b/
/** Aturan yang menargetkan teks judul yang dicoret saat selesai. */
const DONE_TITLE = /\.done\b[^{]*\.(title|name|task-title|item-title|note-text)\b/
/** Aturan redup non-selesai (arsip / tanggal luar bulan / perangkat dicabut). */
const DIM_TEXT = /\.(dim|outside|revoked)\b/

type CssRule = Readonly<{ selector: string; body: string; file: string }>

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

function styleRules(source: string, file: string): CssRule[] {
  const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match) => (match[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, ''))
    .join('\n')
  return [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? '').trim(),
    body: match[2] ?? '',
    file: file.slice(appRoot().length),
  }))
}

function opacityOf(body: string): number | null {
  const match = /opacity:\s*([0-9.]+)/.exec(body)
  return match?.[1] === undefined ? null : Number.parseFloat(match[1])
}

const mounted: VueWrapper[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount()
})

function task(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    title: 'Tulis laporan',
    priority: 'medium',
    deadline: null,
    done: false,
    scheduleId: null,
    quadrant: null,
    position: 0,
    ...overrides,
  }
}

async function mountTodo(t: Task): Promise<VueWrapper> {
  const wrapper = await mountSuspended(TodoRow, { props: { task: t, now: Date.now() } })
  mounted.push(wrapper)
  return wrapper
}

describe('state selesai tetap terbedakan (QA #62)', () => {
  it('TodoRow: state selesai membawa kelas done + centang, judul tetap dirender', async () => {
    const done = await mountTodo(task({ done: true }))
    const open = await mountTodo(task({ done: false }))

    expect(done.get('.row').classes()).toContain('done')
    expect(open.get('.row').classes()).not.toContain('done')
    expect(done.get('[role="checkbox"]').attributes('aria-checked')).toBe('true')
    expect(open.get('[role="checkbox"]').attributes('aria-checked')).toBe('false')
    expect(done.get('.title').text()).toBe('Tulis laporan')
    expect(open.get('.title').text()).toBe('Tulis laporan')
  })

  it('DailyPriorityRow: state selesai membawa kelas done + centang, judul & nomor tetap dirender', async () => {
    const props = (item: PriorityTask) => ({ item, index: 0, now: Date.now() })
    const done = await mountSuspended(DailyPriorityRow, {
      props: props({ task: task({ done: true }), origin: 'urgent' }),
    })
    mounted.push(done)
    const open = await mountSuspended(DailyPriorityRow, {
      props: props({ task: task({ done: false }), origin: 'urgent' }),
    })
    mounted.push(open)

    expect(done.get('.row').classes()).toContain('done')
    expect(open.get('.row').classes()).not.toContain('done')
    expect(done.get('[role="checkbox"]').attributes('aria-checked')).toBe('true')
    expect(done.get('.task-title').text()).toBe('Tulis laporan')
    expect(done.get('.num').text()).toBe('1')
  })
})

describe('penjaga CSS: redup state tidak lewat opacity (QA #62)', () => {
  const rules = vueFiles(appRoot()).flatMap((file) => styleRules(readFileSync(file, 'utf8'), file))

  it('tidak ada aturan state persisten (done/dim/outside/revoked) yang memakai opacity', () => {
    const offenders = rules
      .filter((rule) => PERSISTENT_STATE.test(rule.selector) && opacityOf(rule.body) !== null)
      .map((rule) => `${rule.file} · ${rule.selector} · opacity ${opacityOf(rule.body)}`)
    expect(offenders).toEqual([])
  })

  it('teks judul selesai memakai token teks dan tetap dicoret', () => {
    const offenders = rules
      .filter((rule) => DONE_TITLE.test(rule.selector))
      .filter((rule) => !/color:\s*var\(--mute/.test(rule.body) || !/line-through/.test(rule.body))
      .map((rule) => `${rule.file} · ${rule.selector}`)
    expect(offenders).toEqual([])
  })

  it('teks redup arsip/luar bulan/perangkat dicabut memakai token teks', () => {
    const offenders = rules
      .filter((rule) => DIM_TEXT.test(rule.selector))
      .filter((rule) => !/color:\s*var\(--mute/.test(rule.body))
      .map((rule) => `${rule.file} · ${rule.selector}`)
    expect(offenders).toEqual([])
  })
})
