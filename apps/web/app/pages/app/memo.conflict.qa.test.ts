import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MEMO_DRAFT_PREFIX } from '~/composables/useMemoDraft'
import { useMemos } from '~/composables/useMemos'
import { resetSchedulesHydrationForTest } from '~/composables/useSchedules'
import type { JournalDay } from '~/utils/journal'
import type { Memo, MoodByDate } from '~/utils/memo'
import type { Schedule } from '~/utils/schedule'

import { createMemoryLocalSession } from '../../../tests/nuxt/memo-session'
import MemoPage from './memo.vue'

/**
 * Sesi data lokal sungguhan (in-memory) supaya "Simpan ke jurnal" benar-benar menulis - kegagalan
 * sesi kini diperlakukan sebagai gagal simpan (BUG-71-01), bukan sukses.
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
        deviceId: 'memo-conflict-qa',
        userId: '018f2c4e-0000-7000-8000-00000000000a',
        error: null,
      },
    },
  }),
}))

/**
 * BUG-54-01 (QA #54) - satu halaman jurnal punya dua penulis: editor memo dan penulis otomatis
 * (kartu Daily Goal Review -> `memos.append`). Sebelum perbaikan, draf editor yang dimuat sebelum
 * catatan review masuk menimpa seluruh halaman saat disimpan: catatan review hilang tanpa peringatan.
 *
 * Test ini menjaga tiga jalur yang dulu kehilangan data:
 * 1. draf belum disimpan -> catatan review masuk -> kembali ke editor -> simpan
 * 2. halaman sudah tersimpan -> catatan review masuk -> simpan tanpa mengedit apa pun
 * 3. catatan review masuk saat editor masih terbuka (tanpa mount ulang) -> simpan
 * Ditambah: halaman yang diganti penulis lain tidak boleh ditimpa diam-diam.
 */

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn(async () => {}) }))
mockNuxtImport('navigateTo', () => navigateToMock)

/** Rabu, 10 September 2025, 10:00 waktu perangkat. */
const NOW = new Date(2025, 8, 10, 10, 0, 0).getTime()
const TODAY = '2025-09-10'
const YESTERDAY = '2025-09-09'
/** Catatan dari penulis lain (mis. halaman/jurnal yang sama, perangkat lain). */
const REVIEW = 'Catatan review goal'
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
  // Store sudah "terhidrasi": hydrate tidak boleh mengganti halaman yang disemai test dengan isi
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
 * Navigasi SPA: pergi ke Home lalu kembali ke `/app/memo`. Komponen editor di-mount ulang,
 * sementara state Nuxt (jurnal + draf) tetap - persis alur reproduksi BUG-54-01.
 */
async function remountPage(): Promise<VueWrapper> {
  mounted?.unmount()
  mounted = null
  await flushPromises()
  return mountPage()
}

const keyOf = (day: string): string => MEMO_DRAFT_PREFIX + day
const editor = (wrapper: VueWrapper) => wrapper.find('section.sheet textarea.paper')
const titleInput = (wrapper: VueWrapper) => wrapper.find('section.sheet input.title-input')
const dateButtons = (wrapper: VueWrapper) => wrapper.findAll('.strip .date')
const valueOf = (wrapper: VueWrapper): string =>
  (editor(wrapper).element as HTMLTextAreaElement).value

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

async function clickSave(wrapper: VueWrapper): Promise<void> {
  const save = wrapper.findAll('button').find((item) => item.text() === 'Simpan ke jurnal')
  if (!save) throw new Error('tombol simpan tidak ada')
  await save.trigger('click')
  await flushPromises()
}

async function clickFeeling(wrapper: VueWrapper, feeling: string): Promise<void> {
  const button = wrapper.findAll('.feelings button').find((item) => item.text() === feeling)
  if (!button) throw new Error(`tombol perasaan ${feeling} tidak ada`)
  await button.trigger('click')
  await flushPromises()
}

beforeEach(() => {
  localStorage.clear()
  clearNuxtState(['memos', 'journal-days', ...DRAFT_STATES])
  resetSchedulesHydrationForTest()
  navigateToMock.mockClear()
  ensureMock.mockReset()
  ensureMock.mockResolvedValue(createMemoryLocalSession(NOW))
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('BUG-54-01 draf editor vs penulis eksternal (review goal)', () => {
  it('draf belum disimpan digabung dengan catatan review, bukan menimpanya', async () => {
    seed([])
    const memos = useMemos()
    let wrapper = await mountPage()

    await typeText(wrapper, 'Draf saya yang belum disimpan')
    expect(localStorage.getItem(keyOf(TODAY))).not.toBeNull()

    // Pindah ke Home, jawab kartu Daily Goal Review: komponen lain menulis halaman hari ini.
    memos.append(TODAY, REVIEW)
    expect(memos.memoOn(TODAY)?.text).toBe(REVIEW)

    // Kembali ke /app/memo: draf masih terbuka, dan catatan review ikut terlihat (tidak hilang).
    wrapper = await remountPage()
    expect(valueOf(wrapper)).toBe(`${REVIEW}\n\nDraf saya yang belum disimpan`)

    await clickSave(wrapper)

    expect(memos.memoOn(TODAY)?.text).toBe(`${REVIEW}\n\nDraf saya yang belum disimpan`)
    // Satu halaman per tanggal: penggabungan tidak membuat entri baru.
    expect(wrapper.findAll('.pages > .entry')).toHaveLength(1)
    expect(wrapper.find('.pages > .entry .body').text()).toContain(REVIEW)
    // Draf tanggal itu sudah tersimpan, jadi salinan lokalnya dibuang.
    expect(localStorage.getItem(keyOf(TODAY))).toBeNull()
  })

  it('simpan tanpa mengedit setelah catatan review masuk tidak menghapus catatan itu', async () => {
    seed([memo({ id: 'm', date: TODAY, text: 'Tulisan awal.' })])
    const memos = useMemos()
    let wrapper = await mountPage()
    expect(valueOf(wrapper)).toBe('Tulisan awal.')

    // Jalur B: halaman sudah pernah disimpan, lalu kartu review menambah catatan.
    memos.append(TODAY, REVIEW)
    wrapper = await remountPage()
    expect(valueOf(wrapper)).toBe(`Tulisan awal.\n\n${REVIEW}`)

    // Klik simpan tanpa mengubah apa pun (draf == halaman saat dimuat).
    await clickSave(wrapper)

    expect(memos.memoOn(TODAY)?.text).toBe(`Tulisan awal.\n\n${REVIEW}`)
    // Tidak diduplikasi: penggabungan dengan versi yang sama tidak menempel dua kali.
    expect(memos.memoOn(TODAY)?.text.match(new RegExp(REVIEW, 'g'))).toHaveLength(1)
  })

  it('perubahan luar saat editor masih terbuka ikut digabung ketika menyimpan', async () => {
    seed([])
    const memos = useMemos()
    const wrapper = await mountPage()

    await typeText(wrapper, 'Draf saya')
    // Tanpa mount ulang: editor masih memegang draf lama saat penulis lain menyisipkan catatan.
    memos.append(TODAY, REVIEW)
    await clickSave(wrapper)

    expect(memos.memoOn(TODAY)?.text).toBe(`${REVIEW}\n\nDraf saya`)
  })

  it('halaman yang diganti penulis lain tidak ditimpa diam-diam: kedua versi tetap ada', async () => {
    seed([memo({ id: 'm', date: TODAY, text: 'Isi lama.' })])
    const memos = useMemos()
    const wrapper = await mountPage()

    await typeText(wrapper, 'Draf saya yang baru')
    memos.save({
      date: TODAY,
      title: '',
      text: 'Halaman dari penulis lain.',
      feelings: [],
      paper: 'krem',
    })
    await clickSave(wrapper)

    const text = memos.memoOn(TODAY)?.text ?? ''
    expect(text).toContain('Halaman dari penulis lain.')
    expect(text).toContain('Draf saya yang baru')
  })

  it('judul & perasaan draf tetap ikut saat isi digabung dengan catatan review', async () => {
    seed([])
    const memos = useMemos()
    let wrapper = await mountPage()

    await titleInput(wrapper).setValue('Judul draf')
    await typeText(wrapper, 'Draf hari ini')
    await clickFeeling(wrapper, 'tenang')

    memos.append(TODAY, REVIEW)
    wrapper = await remountPage()
    await clickSave(wrapper)

    const page = memos.memoOn(TODAY)
    expect(page?.title).toBe('Judul draf')
    expect(page?.feelings).toEqual(['tenang'])
    expect(page?.text).toBe(`${REVIEW}\n\nDraf hari ini`)
  })

  it('penggabungan hanya menyentuh tanggal yang dibuka; draf tanggal lain aman', async () => {
    seed([memo({ id: 'y', date: YESTERDAY, text: 'Halaman kemarin.' })])
    const memos = useMemos()
    let wrapper = await mountPage()

    await typeText(wrapper, 'Draf hari ini')
    await clickDay(wrapper, 1)
    await typeText(wrapper, 'Draf kemarin')
    await clickDay(wrapper, 0)

    memos.append(TODAY, REVIEW)
    wrapper = await remountPage()
    await clickSave(wrapper)

    expect(memos.memoOn(TODAY)?.text).toBe(`${REVIEW}\n\nDraf hari ini`)
    expect(memos.memoOn(YESTERDAY)?.text).toBe('Halaman kemarin.')
    expect(localStorage.getItem(keyOf(YESTERDAY))).toContain('Draf kemarin')
  })
})
