import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MEMO_DRAFT_PREFIX } from '~/composables/useMemoDraft'
import { resetSchedulesHydrationForTest } from '~/composables/useSchedules'
import type { JournalDay } from '~/utils/journal'
import type { Memo, MoodByDate } from '~/utils/memo'
import type { Schedule } from '~/utils/schedule'

import { createMemoryLocalSession } from '../../../tests/nuxt/memo-session'
import MemoPage from './memo.vue'

/**
 * Sesi data lokal sungguhan (in-memory) supaya "Simpan ke jurnal" benar-benar menulis. Tanpa sesi,
 * simpan memang gagal (BUG-71-01) dan draf sengaja dipertahankan - bukan yang mau diuji di sini.
 */
const { ensureMock } = vi.hoisted(() => ({ ensureMock: vi.fn() }))
vi.mock('~/composables/useLocalData', () => ({
  useLocalData: () => ({
    ensure: ensureMock,
    current: () => null,
    state: {
      value: {
        status: 'ready',
        isFreshKey: false,
        deviceId: 'memo-draft-qa',
        userId: '018f2c4e-0000-7000-8000-00000000000a',
        error: null,
      },
    },
  }),
}))

/**
 * QA #54 / BUG-T11-02 - draf diary harus bertahan saat pindah tanggal dan reload.
 *
 * Test composable (`useMemoDraft.test.ts`) membuktikan logikanya; test ini membuktikan
 * WIRING-nya di halaman: textarea editor, tombol tanggal di strip, dan tombol simpan.
 * Kegagalan yang mungkin lolos dari test composable (watch `day` tidak jalan, v-model tidak
 * terhubung, `load()` tidak dipanggil setelah simpan) tertangkap di sini.
 */

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn(async () => {}) }))
mockNuxtImport('navigateTo', () => navigateToMock)

/** Rabu, 10 September 2025, 10:00 waktu perangkat. */
const NOW = new Date(2025, 8, 10, 10, 0, 0).getTime()
const TODAY = '2025-09-10'
const YESTERDAY = '2025-09-09'
const LAST_WEEK = '2025-09-03'
const DRAFT_STATES = ['memo-draft', 'memo-draft-day', 'memo-draft-saved', 'memo-draft-held']

const memo = (overrides: Partial<Memo> = {}): Memo => ({
  id: 'memo',
  date: TODAY,
  createdAt: new Date(2025, 8, 10, 20, 0).getTime(),
  title: '',
  text: '',
  feelings: [],
  paper: 'krem',
  ...overrides,
})

let mounted: VueWrapper | null = null

interface MemoStore {
  memos: Memo[]
  moods: MoodByDate
}

function seed(memos: Memo[], moods: MoodByDate = {}): void {
  useState<number>('now').value = NOW
  useState<Schedule[]>('schedules').value = []
  useState('goals').value = []
  useState<MemoStore>('memos').value = { memos, moods }
  // store sudah "terhidrasi": hydrate tidak boleh mengganti halaman yang disemai test dengan isi
  // sesi in-memory yang kosong.
  useState<'idle' | 'loading' | 'ready' | 'error'>('memosStatus').value = 'ready'
  useState<Record<string, JournalDay>>('journal-days').value = {}
  useState<string>('memo-selected').value = TODAY
  useState('memo-draft').value = { title: '', text: '', feelings: [] }
  useState<string>('memo-draft-day').value = ''
  useState('memo-draft-saved').value = { title: '', text: '', feelings: [] }
  useState<string>('calendar-selected').value = TODAY
  useState<string>('calendar-anchor').value = TODAY
}

async function mountPage(): Promise<VueWrapper> {
  const wrapper = await mountSuspended(MemoPage)
  await flushPromises()
  mounted = wrapper
  return wrapper
}

/**
 * Reload penuh: state in-memory dibuang, localStorage bertahan. Jurnal tersimpan sendiri hidup di
 * IndexedDB terenkripsi (`useMemos.hydrate`), tetapi di harness ini tidak ada sesi data lokal, jadi
 * yang diuji di sini adalah perilaku DRAF - bukan persistensi halaman (itu `useMemos.test.ts`).
 */
async function reloadPage(): Promise<VueWrapper> {
  mounted?.unmount()
  mounted = null
  clearNuxtState(['memos', ...DRAFT_STATES])
  await flushPromises()
  return mountPage()
}

const keyOf = (day: string): string => MEMO_DRAFT_PREFIX + day
const editor = (wrapper: VueWrapper) => wrapper.find('section.sheet textarea.paper')
const titleInput = (wrapper: VueWrapper) => wrapper.find('section.sheet input.title-input')
const dateButtons = (wrapper: VueWrapper) => wrapper.findAll('.strip .date')

async function typeText(wrapper: VueWrapper, text: string): Promise<void> {
  await editor(wrapper).setValue(text)
  await flushPromises()
}

async function clickDay(wrapper: VueWrapper, index: number): Promise<void> {
  const button = dateButtons(wrapper)[index]
  if (!button) throw new Error(`tombol tanggal index ${index} tidak ada`)
  await button.trigger('click')
  await flushPromises()
}

/**
 * Draf sekarang dibungkus `{ values, base }` supaya base version ikut bertahan setelah reload
 * (QA #54 R2). Assertion perilaku tetap membandingkan nilai draf saja.
 */
function stored(wrapper: VueWrapper, day: string): Record<string, unknown> | null {
  const raw = localStorage.getItem(keyOf(day))
  if (raw === null) return null
  const parsed = JSON.parse(raw) as Record<string, unknown>
  const values = parsed['values']
  return typeof values === 'object' && values !== null
    ? (values as Record<string, unknown>)
    : parsed
}
const valueOf = (wrapper: VueWrapper): string =>
  (editor(wrapper).element as HTMLTextAreaElement).value
const titleValue = (wrapper: VueWrapper): string =>
  (titleInput(wrapper).element as HTMLInputElement).value

beforeEach(() => {
  localStorage.clear()
  clearNuxtState(['memos', 'journal-days', ...DRAFT_STATES])
  resetSchedulesHydrationForTest()
  navigateToMock.mockClear()
  ensureMock.mockReset()
  ensureMock.mockResolvedValue(createMemoryLocalSession(NOW))
  delete (window as unknown as { __pwned?: number }).__pwned
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('QA #54 draf diary per tanggal lewat UI', () => {
  it('bolak-balik 3 tanggal tidak menghilangkan draf; tiap tanggal punya key sendiri', async () => {
    // Hanya hari ini yang ada di strip tanpa memo; 2 tanggal lain punya halaman tersimpan.
    seed([
      memo({ id: 'y', date: YESTERDAY, text: 'Halaman kemarin.' }),
      memo({ id: 'w', date: LAST_WEEK, text: 'Halaman pekan lalu.' }),
    ])
    const wrapper = await mountPage()

    // TODAY (index 0).
    await typeText(wrapper, 'Tulisan hari ini, belum disimpan')
    await titleInput(wrapper).setValue('Judul hari ini')
    await flushPromises()
    expect(stored(wrapper, TODAY)).toEqual({
      title: 'Judul hari ini',
      text: 'Tulisan hari ini, belum disimpan',
      feelings: [],
    })

    // YESTERDAY (index 1).
    await clickDay(wrapper, 1)
    expect(valueOf(wrapper)).toBe('Halaman kemarin.')
    await typeText(wrapper, 'Tulisan kemarin, belum disimpan')
    expect(stored(wrapper, YESTERDAY)?.text).toBe('Tulisan kemarin, belum disimpan')

    // LAST_WEEK (index 2).
    await clickDay(wrapper, 2)
    expect(valueOf(wrapper)).toBe('Halaman pekan lalu.')
    await typeText(wrapper, 'Tulisan pekan lalu, belum disimpan')
    expect(stored(wrapper, LAST_WEEK)?.text).toBe('Tulisan pekan lalu, belum disimpan')

    // Kembali: isi + judul tiap tanggal utuh dan tidak saling menimpa.
    await clickDay(wrapper, 0)
    expect(valueOf(wrapper)).toBe('Tulisan hari ini, belum disimpan')
    expect(titleValue(wrapper)).toBe('Judul hari ini')

    await clickDay(wrapper, 1)
    expect(valueOf(wrapper)).toBe('Tulisan kemarin, belum disimpan')

    await clickDay(wrapper, 2)
    expect(valueOf(wrapper)).toBe('Tulisan pekan lalu, belum disimpan')

    await clickDay(wrapper, 0)
    expect(valueOf(wrapper)).toBe('Tulisan hari ini, belum disimpan')
  })

  it('draf yang diketik tetap ada setelah reload halaman', async () => {
    seed([])
    let wrapper = await mountPage()

    await typeText(wrapper, 'Draf yang belum disimpan, harus selamat dari reload')
    expect(localStorage.getItem(keyOf(TODAY))).not.toBeNull()

    wrapper = await reloadPage()

    expect(valueOf(wrapper)).toBe('Draf yang belum disimpan, harus selamat dari reload')
    expect(titleValue(wrapper)).toBe('')
  })

  it('simpan menghapus draf tanggal itu saja, halaman tersimpan normal', async () => {
    seed([memo({ id: 'y', date: YESTERDAY, text: 'Halaman kemarin.' })])
    const wrapper = await mountPage()

    await typeText(wrapper, 'Hari ini tenang.')
    await clickDay(wrapper, 1)
    await typeText(wrapper, 'Draf kemarin yang belum disimpan.')
    expect(localStorage.getItem(keyOf(YESTERDAY))).not.toBeNull()

    await clickDay(wrapper, 0)
    const save = wrapper.findAll('button').find((item) => item.text() === 'Simpan ke jurnal')
    if (!save) throw new Error('tombol simpan tidak ada')
    await save.trigger('click')
    await flushPromises()

    // Simpan sukses: draf hari ini hilang, entri muncul, draf kemarin tidak tersentuh.
    expect(localStorage.getItem(keyOf(TODAY))).toBeNull()
    expect(localStorage.getItem(keyOf(YESTERDAY))).not.toBeNull()
    expect(wrapper.findAll('.pages > .entry')).toHaveLength(1)
    expect(wrapper.find('.pages > .entry .body').text()).toContain('Hari ini tenang.')
    // Editor tetap menampilkan isi yang baru disimpan supaya bisa dikoreksi.
    expect(valueOf(wrapper)).toBe('Hari ini tenang.')
  })

  it('setelah simpan, reload tidak memunculkan lagi draf yang sudah dibuang', async () => {
    seed([])
    let wrapper = await mountPage()

    await typeText(wrapper, 'Sudah disimpan.')
    const save = wrapper.findAll('button').find((item) => item.text() === 'Simpan ke jurnal')
    if (!save) throw new Error('tombol simpan tidak ada')
    await save.trigger('click')
    await flushPromises()

    wrapper = await reloadPage()
    // Reload: draf lama tidak boleh "hidup lagi" dari localStorage lalu menimpa halaman tersimpan.
    // (Persistensi halaman itu sendiri tidak bisa diuji di harness ini - tidak ada sesi data lokal.)
    expect(valueOf(wrapper)).toBe('')
    expect(localStorage.getItem(keyOf(TODAY))).toBeNull()
  })

  it('draf tanggal lain tidak bocor ke tanggal yang sedang dibuka', async () => {
    // Mood membuat tanggal kemarin muncul di strip walau belum punya halaman jurnal.
    seed([], { [YESTERDAY]: 2 })
    const wrapper = await mountPage()

    await typeText(wrapper, 'Isi tanggal 10.')
    await clickDay(wrapper, 1)
    // Tanggal kemarin tidak punya draf: editor kosong, bukan mewarisi isi tanggal 10.
    expect(valueOf(wrapper)).toBe('')
    expect(localStorage.getItem(keyOf(YESTERDAY))).toBeNull()

    await typeText(wrapper, 'Isi tanggal 9.')
    await clickDay(wrapper, 0)
    expect(valueOf(wrapper)).toBe('Isi tanggal 10.')

    await clickDay(wrapper, 1)
    expect(valueOf(wrapper)).toBe('Isi tanggal 9.')
  })
})

describe('QA #54 draf rusak / tidak tepercaya', () => {
  it('JSON rusak dan tipe salah diabaikan: editor memakai halaman tersimpan', async () => {
    seed([memo({ id: 'm', date: TODAY, text: 'Isi tersimpan.' })])
    localStorage.setItem(keyOf(TODAY), '{rusak')
    const wrapper = await mountPage()
    expect(valueOf(wrapper)).toBe('Isi tersimpan.')

    // Key rusak dibersihkan (bukan dibiarkan menumpuk) karena draf sama dengan halaman tersimpan.
    expect(localStorage.getItem(keyOf(TODAY))).toBeNull()
  })

  it('perasaan di luar whitelist dibuang, perasaan sah tetap dipakai', async () => {
    seed([])
    localStorage.setItem(
      keyOf(TODAY),
      JSON.stringify({ title: '', text: 'Draf', feelings: ['tenang', 'perasaan-palsu', 42] }),
    )
    const wrapper = await mountPage()

    expect(valueOf(wrapper)).toBe('Draf')
    const pressed = wrapper
      .findAll('.feelings button[aria-pressed="true"]')
      .map((item) => item.text())
    expect(pressed).toEqual(['tenang'])
    // Draf yang ditulis ulang hanya berisi perasaan yang dikenal.
    expect(stored(wrapper, TODAY)).toEqual({
      title: '',
      text: 'Draf',
      feelings: ['tenang'],
    })
  })

  it('isi draf berisi HTML dirender sebagai teks di textarea, bukan elemen', async () => {
    seed([])
    localStorage.setItem(
      keyOf(TODAY),
      JSON.stringify({
        title: '<img src=x onerror="window.__pwned=1">',
        text: '<script>window.__pwned=2</script><b>tebal</b>',
        feelings: [],
      }),
    )
    const wrapper = await mountPage()

    expect(valueOf(wrapper)).toBe('<script>window.__pwned=2</script><b>tebal</b>')
    expect(titleValue(wrapper)).toBe('<img src=x onerror="window.__pwned=1">')
    expect(wrapper.find('section.sheet img').exists()).toBe(false)
    expect(wrapper.find('section.sheet script').exists()).toBe(false)
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })
})
