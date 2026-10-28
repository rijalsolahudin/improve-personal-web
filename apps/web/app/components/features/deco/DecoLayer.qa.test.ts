import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DecoLayer from './DecoLayer.vue'
import { DECO_STORAGE_KEY, useDeco } from '~/composables/useDeco'
import type { DecoItem } from '~/utils/deco'

/**
 * AC T24 di level komponen (halaman jurnal = route `/app/memo`, anchor kartu jurnal):
 * - set hiasan per ukuran layar (desktop vs HP) yang dirender memang berbeda,
 * - tempel / ganti / hapus sticker,
 * - 100 sticker ter-render & cuma satu listener scroll (tidak ada kerja per sticker),
 * - geser sticker tidak me-render ulang halaman (cuma layer), storage ditulis sekali saat dilepas,
 * - anchor hilang → sticker disembunyikan, bukan dihapus.
 *
 * Catatan: rute `/app/**` dijaga middleware sesi, jadi `$fetch` sesi di-mock (bukan guard-nya).
 */
const fetchMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    data: {
      user: { id: '018f2b3c-4d5e-7f80-9abc-def012345678', email: 'kamu@email.com' },
      device: { id: '018f2b3c-4d5e-7f80-9abc-def012345678', name: 'Chrome di Linux' },
      expiresAt: '2026-05-10T09:00:00.000Z',
    },
  }),
)
mockNuxtImport('$fetch', () => fetchMock)

const STATE_KEYS = [
  'deco-items',
  'deco-hidden',
  'deco-editing',
  'deco-selected',
  'sticker-recent',
  'deco-copy-skip',
]

const HOST_W = 1200
const HOST_H = 2000
const CARD = { left: 100, top: 100, width: 400, height: 300 }

const matchMediaQueries: Array<{ listeners: Array<() => void> }> = []

function rectOf(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    left: x,
    top: y,
    width,
    height,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  } as DOMRect
}

function stubRects(): void {
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    writable: true,
    value: function (this: Element) {
      if (this.hasAttribute('data-deco-item')) return rectOf(140, 130, 96, 96)
      if (this.hasAttribute('data-anchor'))
        return rectOf(CARD.left, CARD.top, CARD.width, CARD.height)
      return rectOf(0, 0, HOST_W, HOST_H)
    },
  })
}

function stubObservers(): void {
  class NoopObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): [] {
      return []
    }
  }
  vi.stubGlobal('ResizeObserver', NoopObserver)
  vi.stubGlobal('MutationObserver', class extends NoopObserver {})
}

function setWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
}

function fireBreakpoints(): void {
  for (const query of matchMediaQueries) for (const listener of query.listeners) listener()
}

const ITEM: Omit<DecoItem, 'id'> = {
  sid: 'mood/bahagia',
  page: 'memo',
  bucket: 'desktop',
  anchor: 'journal-feeling',
  px: 40,
  py: 30,
  w: 0.12,
  rot: 5,
  z: 1,
}

function makeItem(overrides: Partial<DecoItem> & { id: string }): DecoItem {
  return { ...ITEM, ...overrides }
}

function seed(items: DecoItem[]): void {
  useState<DecoItem[]>('deco-items').value = items
}

const renders = { count: 0 }

const Harness = defineComponent({
  setup() {
    return () => {
      renders.count += 1
      return h('div', { class: 'host' }, [
        h('main', { 'data-anchor': 'page', 'data-anchor-kind': 'page' }, [
          h('header', { 'data-anchor': 'header', 'data-anchor-kind': 'header' }),
          h('section', {
            'data-anchor': 'journal-feeling',
            'data-anchor-kind': 'content',
            class: 'journal-card',
          }),
          h('section', { 'data-anchor': 'overview-focus', 'data-anchor-kind': 'content' }),
          h('section', { 'data-anchor': 'goals-list', 'data-anchor-kind': 'content' }),
          h('section', { 'data-anchor': 'daily-todo', 'data-anchor-kind': 'content' }),
        ]),
        h(DecoLayer),
      ])
    }
  },
})

let mounted: VueWrapper | null = null

async function settle(): Promise<void> {
  await flushPromises()
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  await flushPromises()
}

async function mountLayer(route = '/app/memo'): Promise<VueWrapper> {
  mounted = await mountSuspended(Harness, { route })
  await settle()
  // `elementsFromPoint` tidak ada di happy-dom; anggap kursor selalu di atas kartu jurnal.
  const card = mounted.element.querySelector('[data-anchor]')
  document.elementsFromPoint = () => (card ? [card] : [])
  return mounted
}

beforeEach(() => {
  localStorage.clear()
  clearNuxtState(STATE_KEYS)
  matchMediaQueries.length = 0
  renders.count = 0
  setWidth(HOST_W)
  vi.stubGlobal('matchMedia', (media: string) => {
    const entry = { listeners: [] as Array<() => void> }
    matchMediaQueries.push(entry)
    return {
      matches: false,
      media,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => entry.listeners.push(listener),
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }
  })
  stubRects()
  stubObservers()
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  vi.unstubAllGlobals()
  await flushPromises()
})

function itemEls(wrapper: VueWrapper): Element[] {
  return [...wrapper.element.querySelectorAll('[data-deco-item]')]
}

function pointer(type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: x },
    clientY: { value: y },
  })
  return event
}

describe('QA T24 · layer hias dipakai ulang di Overview, Daily, Goals', () => {
  const CASES = [
    { route: '/app', page: 'home', anchor: 'daily-todo' },
    { route: '/app/overview', page: 'overview', anchor: 'overview-focus' },
    { route: '/app/goals', page: 'goals', anchor: 'goals-list' },
  ] as const

  for (const testCase of CASES) {
    // Mount halaman `/app` yang sebenarnya: sendiri butuh ~2 detik (diukur standalone), dan di suite
    // paralel bisa melewati timeout default 5 detik. Batas ini hanya soal lingkungan, bukan perilaku.
    it(
      `${testCase.route}: hiasan halaman itu dirender (${testCase.page})`,
      { timeout: 20_000 },
      async () => {
        seed([
          makeItem({ id: `${testCase.page}-1`, page: testCase.page, anchor: testCase.anchor }),
          makeItem({ id: 'lain', page: 'memo', anchor: 'journal-feeling' }),
        ])
        const wrapper = await mountLayer(testCase.route)
        await settle()

        // Hanya sticker milik halaman aktif yang dirender (tidak bocor lintas halaman).
        expect(itemEls(wrapper)).toHaveLength(1)
        expect(wrapper.html()).toContain('😄')
        wrapper.unmount()
        mounted = null
      },
    )
  }
})

describe('QA T24 · layer hias: set per ukuran layar', () => {
  it('desktop & HP punya set berbeda: yang dirender hanya milik ukuran layar aktif', async () => {
    seed([
      makeItem({ id: 'd1', bucket: 'desktop' }),
      makeItem({ id: 'h1', bucket: 'hp', sid: 'hewan/kelinci' }),
    ])
    const wrapper = await mountLayer()

    expect(itemEls(wrapper)).toHaveLength(1)
    expect(wrapper.html()).toContain('😄')

    setWidth(500)
    fireBreakpoints()
    await settle()

    expect(itemEls(wrapper)).toHaveLength(1)
    expect(wrapper.html()).not.toContain('😄')
    expect(wrapper.html()).toContain('title="Kelinci"')
  })

  it('hiasan yang tempelannya sudah tidak ada disembunyikan, bukan dihapus', async () => {
    seed([makeItem({ id: 'x1', anchor: 'kartu-yang-sudah-tidak-ada' })])
    const wrapper = await mountLayer()

    expect(itemEls(wrapper)).toHaveLength(0)
    expect(useDeco().items.value).toHaveLength(1)
  })

  it('sticker dengan ID tak dikenal tetap dirender sebagai placeholder, tidak bikin layer error', async () => {
    seed([makeItem({ id: 'u1', sid: 'pack-dihapus/stiker-lama' })])
    const wrapper = await mountLayer()

    expect(itemEls(wrapper)).toHaveLength(1)
    expect(wrapper.html()).toContain('?')
    expect(wrapper.html()).toContain('Sticker tidak dikenal')
    expect(useDeco().items.value).toHaveLength(1)
  })

  it('ukuran layar kosong menawarkan salin dari ukuran lain (posisi dirapikan ke dalam layar)', async () => {
    seed([makeItem({ id: 'd1', bucket: 'desktop', px: 180 })])
    useState<boolean>('deco-editing').value = true
    setWidth(500)
    const wrapper = await mountLayer()
    Object.defineProperty(wrapper.element, 'offsetWidth', { value: 500, configurable: true })

    const copy = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Salin dari Desktop'))
    expect(copy).toBeTruthy()
    await copy?.trigger('click')
    await settle()

    const copied = useDeco().itemsIn({ page: 'memo', bucket: 'hp' })
    expect(copied).toHaveLength(1)
    expect(copied[0]?.px).toBeGreaterThanOrEqual(0)
    expect(copied[0]?.px).toBeLessThanOrEqual(100)
    expect(copied[0]?.anchor).toBe(ITEM.anchor)
  })
})

describe('QA T24 · layer hias: tempel, ganti, hapus (halaman jurnal)', () => {
  it('mode hias: tempel sticker baru → tersimpan di halaman + ukuran layar ini', async () => {
    useState<boolean>('deco-editing').value = true
    const wrapper = await mountLayer()

    const addButton = wrapper.findAll('button').find((button) => button.text().includes('Tambah'))
    expect(addButton).toBeTruthy()
    await addButton?.trigger('click')
    await settle()

    // Picker di-lazy-load: komponennya baru ada setelah chunk-nya resolve.
    await vi.waitFor(() => expect(wrapper.findAll('button.cell').length).toBeGreaterThan(0))
    const cell = wrapper.findAll('button.cell').find((entry) => entry.text().includes('Bahagia'))
    expect(cell).toBeTruthy()
    await cell?.trigger('click')
    await settle()

    const deco = useDeco()
    expect(deco.itemsIn({ page: 'memo', bucket: 'desktop' })).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(DECO_STORAGE_KEY) ?? '[]')).toHaveLength(1)
    expect(itemEls(wrapper)).toHaveLength(1)
  })

  it('ganti (swap) hanya mengganti sticker; tempelan, posisi, rotasi tetap', async () => {
    seed([makeItem({ id: 'a1' })])
    useState<boolean>('deco-editing').value = true
    useState<string | null>('deco-selected').value = 'a1'
    const wrapper = await mountLayer()

    const swap = wrapper
      .findAll('button')
      .find((button) => button.attributes('title') === 'Ganti sticker')
    expect(swap).toBeTruthy()
    await swap?.trigger('click')
    await settle()
    await vi.waitFor(() => expect(wrapper.findAll('button.cell').length).toBeGreaterThan(0))

    const cell = wrapper.findAll('button.cell').find((entry) => entry.text().includes('Bahagia'))
    if (!cell) throw new Error('picker tidak menampilkan sticker mood')
    // Pilih sticker mood lain supaya perubahannya terlihat.
    const other = wrapper.findAll('button.cell').find((entry) => entry.text().includes('Senang'))
    await (other ?? cell).trigger('click')
    await settle()

    const [item] = useDeco().itemsIn({ page: 'memo', bucket: 'desktop' })
    expect(item?.sid).toBe(other ? 'mood/senang' : 'mood/bahagia')
    expect(item).toMatchObject({
      anchor: ITEM.anchor,
      px: ITEM.px,
      py: ITEM.py,
      w: ITEM.w,
      rot: ITEM.rot,
    })
  })

  it('hapus menghilangkan sticker dari halaman & storage', async () => {
    seed([makeItem({ id: 'a1' })])
    useState<boolean>('deco-editing').value = true
    useState<string | null>('deco-selected').value = 'a1'
    const wrapper = await mountLayer()
    expect(itemEls(wrapper)).toHaveLength(1)

    const remove = wrapper
      .findAll('button')
      .find((button) => button.attributes('title') === 'Hapus')
    expect(remove).toBeTruthy()
    await remove?.trigger('click')
    await settle()

    expect(itemEls(wrapper)).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem(DECO_STORAGE_KEY) ?? '[]')).toEqual([])
  })
})

describe('QA T24 · performa layer hias', () => {
  it('100 sticker: semua ter-render dan cuma satu listener scroll (bukan per sticker)', async () => {
    seed(Array.from({ length: 100 }, (_, i) => makeItem({ id: `s${i}`, px: (i * 7) % 100 })))
    const scrollCalls: string[] = []
    const original = window.addEventListener.bind(window)
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      if (String(type) === 'scroll') scrollCalls.push(String(type))
      original(type, listener as EventListener, options)
    })

    const start = performance.now()
    const wrapper = await mountLayer()
    const elapsed = performance.now() - start

    expect(itemEls(wrapper)).toHaveLength(100)
    expect(scrollCalls).toHaveLength(1)
    // Ambang longgar untuk happy-dom (bukan browser). Angka nyata dicatat di report.
    expect(elapsed).toBeLessThan(3000)
  })

  it('scroll dirapatkan jadi satu pengukuran per frame (tidak ada kerja per sticker)', async () => {
    seed(Array.from({ length: 100 }, (_, i) => makeItem({ id: `r${i}` })))
    const wrapper = await mountLayer()
    expect(itemEls(wrapper)).toHaveLength(100)

    // rAF tidak dijalankan otomatis: kita cuma memastikan 10 event scroll → 1 permintaan frame.
    //
    // Tunggu satu putaran event loop dulu: frame nyata yang dijadwalkan saat mount bisa mendarat
    // tepat di antara event scroll saat mesin sibuk, mereset penjaga `frame` dan membuat hitungan
    // jadi 2. Setelah itu stub dipasang dan hitungannya bersih.
    await new Promise((resolve) => setTimeout(resolve, 0))
    const raf = vi.fn(() => 1)
    vi.stubGlobal('requestAnimationFrame', raf)
    for (let i = 0; i < 10; i += 1) window.dispatchEvent(new Event('scroll'))
    expect(raf).toHaveBeenCalledTimes(1)
  })

  it('geser sticker tidak me-render ulang halaman & storage baru ditulis sekali saat dilepas', async () => {
    seed([makeItem({ id: 'a1' })])
    useState<boolean>('deco-editing').value = true
    useState<string | null>('deco-selected').value = 'a1'
    const wrapper = await mountLayer()

    const before = renders.count
    const setItemSpy = vi.spyOn(localStorage, 'setItem')
    const item = itemEls(wrapper)[0]
    expect(item).toBeTruthy()
    const styleBefore = item?.getAttribute('style')

    item?.dispatchEvent(pointer('pointerdown', 200, 150))
    await settle()

    for (let i = 0; i < 5; i += 1) {
      window.dispatchEvent(pointer('pointermove', 210 + i * 10, 160 + i * 10))
      await flushPromises()
    }

    // Sticker benar-benar bergerak (draft), tapi halaman tidak render ulang & belum ada tulis storage.
    expect(itemEls(wrapper)[0]?.getAttribute('style')).not.toBe(styleBefore)
    expect(renders.count).toBe(before)
    expect(setItemSpy.mock.calls.filter(([key]) => key === DECO_STORAGE_KEY)).toHaveLength(0)

    window.dispatchEvent(pointer('pointerup', 260, 210))
    await settle()

    expect(setItemSpy.mock.calls.filter(([key]) => key === DECO_STORAGE_KEY)).toHaveLength(1)
    expect(renders.count).toBe(before)
  })
})
