import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * AC T24 "picker & layer dipakai ulang di Overview, Daily, Goals, Akun" + "aset lazy-load per pack
 * & tersedia offline".
 *
 * Yang diuji behaviour: memilih sticker lewat picker di form habit & countdown (ikon item bisa
 * diganti). Yang diuji statis (read-only): layer dipasang sekali di layout dashboard (berlaku di
 * semua halaman), picker selalu di-lazy-load, dan aset sticker ikut precache service worker.
 */
function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

const STATE_KEYS = [
  'sticker-recent',
  'deco-items',
  'habits',
  'habitsStatus',
  'localData',
  'countdowns',
]

let mounted: VueWrapper | null = null

async function settle(): Promise<void> {
  await flushPromises()
  await vi.waitFor(() => expect(true).toBe(true))
  await flushPromises()
}

beforeEach(() => {
  localStorage.clear()
  clearNuxtState(STATE_KEYS)
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

async function openPickerAndChoose(wrapper: VueWrapper, buttonLabel: string, sticker: string) {
  const trigger = wrapper.findAll('button').find((button) => button.text().includes(buttonLabel))
  expect(trigger, `tombol "${buttonLabel}"`).toBeTruthy()
  await trigger?.trigger('click')
  await settle()

  await vi.waitFor(() => expect(wrapper.findAll('button.cell').length).toBeGreaterThan(0))
  const cell = wrapper.findAll('button.cell').find((entry) => entry.text().includes(sticker))
  expect(cell, `sticker "${sticker}"`).toBeTruthy()
  await cell?.trigger('click')
  await settle()
}

describe('QA T24 · picker dipakai ulang: ikon habit & countdown bisa diganti', () => {
  it('habit: pilih sticker → label berubah jadi "Ganti sticker" & dicatat sebagai terakhir dipakai', async () => {
    const { default: HabitForm } = await import('~/components/features/habit/HabitForm.vue')
    mounted = await mountSuspended(HabitForm, { props: { habitId: null } })
    await settle()

    await openPickerAndChoose(mounted, 'Atau pakai sticker', 'Bahagia')

    expect(mounted.html()).toContain('Ganti sticker')
    expect(mounted.html()).toContain('😄')
    expect(JSON.parse(localStorage.getItem('ip-stk-recent') ?? '[]')).toContain('mood/bahagia')
  })

  it('countdown: pilih sticker → pratinjau memakai sticker itu', async () => {
    const { default: CountdownForm } =
      await import('~/components/features/countdown/CountdownForm.vue')
    mounted = await mountSuspended(CountdownForm, { props: { countdownId: null } })
    await settle()

    await openPickerAndChoose(mounted, 'Atau pakai sticker', 'Bahagia')

    expect(mounted.html()).toContain('Ganti sticker')
    expect(mounted.html()).toContain('😄')
  })
})

describe('QA T24 · layer hias dipakai ulang di semua halaman dashboard', () => {
  it('layout dashboard memasang layer sekali (berlaku untuk Overview, Daily, Goals, Akun, jurnal)', () => {
    const layout = source('../../../layouts/dashboard.vue')
    expect(layout).toContain('<LazyDecoLayer')
    expect(layout).toContain('data-anchor="page"')
  })

  it('Overview, Daily, Goals, Akun, jurnal semuanya memakai layout dashboard', () => {
    for (const page of ['index', 'overview', 'goals', 'akun', 'memo']) {
      const text = source(`../../../pages/app/${page}.vue`)
      expect(text, page).toContain("layout: 'dashboard'")
    }
  })

  it('halaman punya anchor tempelan (Akun memakai anchor halaman dari layout)', () => {
    for (const page of ['index', 'overview', 'goals', 'memo']) {
      expect(source(`../../../pages/app/${page}.vue`), page).toContain('data-anchor=')
    }
    // Akun tidak punya anchor sendiri → sticker jatuh ke anchor `page` (tetap bisa dihias).
    expect(source('../../../pages/app/akun.vue')).not.toContain('data-anchor=')
  })

  it('picker di-lazy-load di semua pemakainya, bukan diimpor langsung', () => {
    for (const file of [
      '../../../layouts/dashboard.vue',
      '../habit/HabitForm.vue',
      '../countdown/CountdownForm.vue',
      '../../../pages/app/goals.vue',
      '../../../pages/app/memo.vue',
    ]) {
      const text = source(file)
      expect(text, file).not.toMatch(/import\s+Deco(Layer|Picker)\s+from/)
    }
    expect(source('../habit/HabitForm.vue')).toContain('<LazyDecoPicker')
    expect(source('../countdown/CountdownForm.vue')).toContain('<LazyDecoPicker')
    expect(source('../../../pages/app/goals.vue')).toContain('<LazyDecoPicker')
  })
})

describe('QA T24 · di luar mode hias: layer & sticker tembus klik, UI hias tidak ada', () => {
  it('CSS layer + sticker memakai pointer-events: none; hanya sticker terpilih/editing yang menangkap', () => {
    const layer = source('./DecoLayer.vue')
    expect(layer).toMatch(/\.layer\s*\{[^}]*pointer-events:\s*none/s)

    const item = source('./DecoStickerItem.vue')
    expect(item).toMatch(/\.item\s*\{[^}]*pointer-events:\s*none/s)
    expect(item).toMatch(/\.item\.editing\s*\{[^}]*pointer-events:\s*auto/s)
  })

  it('panel "Mode hias" & picker hanya dirender saat mode hias aktif', () => {
    const layer = source('./DecoLayer.vue')
    expect(layer).toContain('<DecoTray\n    v-if="deco.isEditing.value"')
    expect(layer).toContain('<LazyDecoPicker\n    v-if="picker"')
    // Tombol hias di layout: klik = toggle mode hias, bukan elemen dekorasi.
    expect(source('../../../layouts/dashboard.vue')).toContain('data-deco-ui')
  })
})

describe('QA T24 · aset sticker offline (precache service worker)', () => {
  it('katalog sticker tidak diimpor halaman/layout mana pun (baru diunduh saat picker/layer dipakai)', () => {
    for (const file of [
      '../../../layouts/dashboard.vue',
      '../../../pages/app/index.vue',
      '../../../pages/app/overview.vue',
      '../../../pages/app/goals.vue',
      '../../../pages/app/memo.vue',
      '../../../pages/app/akun.vue',
    ]) {
      const text = source(file)
      expect(text, file).not.toContain('utils/stickerCatalog')
      expect(text, file).not.toContain('utils/stickers')
    }
  })

  it('nuxt.config mem-precache semua JS/CSS/SVG + teks i18n → sticker tetap tampil offline', () => {
    const config = source('../../../../nuxt.config.ts')
    expect(config).toContain("globPatterns: ['**/*.{js,css,html,svg}'")
    expect(config).toContain('_i18n/**/messages.json')
    // Runtime cache halaman & font, bukan data user.
    expect(config).toMatch(/runtimeCaching/)
  })
})
