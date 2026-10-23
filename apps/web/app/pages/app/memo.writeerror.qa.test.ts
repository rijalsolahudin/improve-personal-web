import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MEMO_DRAFT_PREFIX } from '~/composables/useMemoDraft'
import { resetSchedulesHydrationForTest } from '~/composables/useSchedules'
import type { JournalDay } from '~/utils/journal'
import type { Memo, MoodByDate } from '~/utils/memo'
import { loadMemoRecords } from '~/utils/memo/persistence'
import type { Schedule } from '~/utils/schedule'

import { createMemoryLocalSession } from '../../../tests/nuxt/memo-session'
import MemoPage from './memo.vue'

/**
 * QA #71 / BUG-65-01 - kegagalan tulis harus TERLIHAT di editor.
 *
 * Test composable (`useMemos.write.qa.test.ts`) membuktikan state & penyimpanannya; test ini
 * membuktikan WIRING-nya: banner "belum tersimpan" muncul saat tanggal itu punya tulisan tertunda,
 * tombol "coba lagi" memakai jalur simpan yang sama, dan setelah berhasil banner hilang serta draf
 * dibuang. Sejak BUG-71-01, "coba lagi" wajib terbukti MENULIS (sesi data lokal nyata), bukan lolos
 * lewat cabang "tidak ada sesi = sukses".
 */

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn(async () => {}) }))
mockNuxtImport('navigateTo', () => navigateToMock)

const { ensureMock } = vi.hoisted(() => ({ ensureMock: vi.fn() }))
vi.mock('~/composables/useLocalData', () => ({
  useLocalData: () => ({
    ensure: ensureMock,
    current: () => null,
    state: {
      value: {
        status: 'ready',
        isFreshKey: false,
        deviceId: 'memo-writeerror-qa',
        userId: '018f2c4e-0000-7000-8000-00000000000a',
        error: null,
      },
    },
  }),
}))

/** Rabu, 10 September 2025, 10:00 waktu perangkat. */
const NOW = new Date(2025, 8, 10, 10, 0, 0).getTime()
const TODAY = '2025-09-10'
const DRAFT_TEXT = 'Tulisan yang gagal tersimpan.'
const DRAFT_STATES = ['memo-draft', 'memo-draft-day', 'memo-draft-saved', 'memo-draft-held']
const keyOf = (day: string): string => MEMO_DRAFT_PREFIX + day

let mounted: VueWrapper | null = null
let session = createMemoryLocalSession(NOW)

interface MemoStore {
  memos: Memo[]
  moods: MoodByDate
}

/** Draf yang belum tersimpan + tanda bahwa tulisan terakhirnya gagal. */
function seed(options: { failed: boolean }): void {
  useState<number>('now').value = NOW
  useState<Schedule[]>('schedules').value = []
  useState('goals').value = []
  useState<MemoStore>('memos').value = { memos: [], moods: {} }
  useState<'idle' | 'loading' | 'ready' | 'error'>('memosStatus').value = 'ready'
  useState<Record<string, JournalDay>>('journal-days').value = {}
  useState<string>('memo-selected').value = TODAY
  useState<string>('calendar-selected').value = TODAY
  useState<string>('calendar-anchor').value = TODAY
  useState<string[]>('memosUnsaved').value = options.failed ? [TODAY] : []

  localStorage.setItem(
    keyOf(TODAY),
    JSON.stringify({
      values: { title: '', text: DRAFT_TEXT, feelings: [] },
      base: { title: '', text: '', feelings: [] },
    }),
  )
}

async function mountPage(): Promise<VueWrapper> {
  const wrapper = await mountSuspended(MemoPage)
  await flushPromises()
  mounted = wrapper
  return wrapper
}

const alert = (wrapper: VueWrapper) => wrapper.find('section.sheet [role="alert"]')
const findButton = (wrapper: VueWrapper, label: string) =>
  wrapper.findAll('button').find((item) => item.text() === label)

beforeEach(() => {
  localStorage.clear()
  clearNuxtState([
    'memos',
    'memosStatus',
    'memosError',
    'memosUnsaved',
    'journal-days',
    ...DRAFT_STATES,
  ])
  resetSchedulesHydrationForTest()
  navigateToMock.mockClear()
  session = createMemoryLocalSession(NOW)
  ensureMock.mockReset()
  ensureMock.mockResolvedValue(session)
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
  vi.restoreAllMocks()
})

describe('QA #71 editor jurnal saat tulis gagal', () => {
  it('menampilkan banner "belum tersimpan" dan tombol coba lagi, bukan diam saja', async () => {
    seed({ failed: true })
    const wrapper = await mountPage()

    expect(alert(wrapper).exists()).toBe(true)
    expect(alert(wrapper).text()).toContain('Belum tersimpan')
    expect(findButton(wrapper, 'Coba lagi')).toBeDefined()
    // Draf masih ada: tulisan user belum tersimpan di mana pun.
    expect(localStorage.getItem(keyOf(TODAY))).not.toBeNull()
  })

  it('coba lagi berhasil: banner hilang, draf dibuang, dan halaman benar-benar tertulis', async () => {
    seed({ failed: true })
    const wrapper = await mountPage()

    const retry = findButton(wrapper, 'Coba lagi')
    if (!retry) throw new Error('tombol coba lagi tidak ada')
    await retry.trigger('click')
    await flushPromises()

    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, 'krem')).entries[0]?.text).toBe(DRAFT_TEXT)
    })
    await vi.waitFor(() => {
      expect(alert(wrapper).exists()).toBe(false)
    })
    expect(localStorage.getItem(keyOf(TODAY))).toBeNull()
    // Halaman yang disimpan tetap terbuka di editor supaya bisa dikoreksi.
    expect(
      (wrapper.find('section.sheet textarea.paper').element as HTMLTextAreaElement).value,
    ).toBe(DRAFT_TEXT)
  })

  it('tanpa tulisan tertunda, editor tidak menampilkan banner', async () => {
    seed({ failed: false })
    const wrapper = await mountPage()

    expect(alert(wrapper).exists()).toBe(false)
  })
})
