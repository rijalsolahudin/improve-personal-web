import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createManualClock, type ManualClock } from '@improve-personal/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MEMO_DRAFT_PREFIX } from '~/composables/useMemoDraft'
import { resetMemosHydrationForTest } from '~/composables/useMemos'
import { resetSchedulesHydrationForTest } from '~/composables/useSchedules'
import type { JournalDay } from '~/utils/journal'
import type { Memo, MoodByDate } from '~/utils/memo'
import type { Schedule } from '~/utils/schedule'
import { loadMemoRecords } from '~/utils/memo/persistence'
import { openLocalDataSession, type LocalDataSession } from '~/utils/storage/session'
import MemoPage from '~/pages/app/journal.vue'

import { diaryValue, typeDiary } from '../../memo-diary'

/**
 * QA #71 - WIRING editor jurnal saat tulis gagal/berjalan, di atas sesi data lokal SUNGGUHAN
 * (fake-indexeddb + sodium asli). Yang dipalsukan hanya `useLocalData().ensure` (pintu masuk sesi)
 * supaya penyimpanan bisa dibuat gagal/lambat - composable jurnal, repository, dan enkripsi asli.
 *
 * Yang dibuktikan:
 * a. tulis gagal -> banner `role="alert"` dengan copy generik, draf tetap, teks tetap di editor;
 *    "Coba lagi" memakai jalur simpan yang sama dan benar-benar menulis ke IndexedDB.
 * b. tanggal lain tidak menampilkan banner tanggal yang gagal.
 */

Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
Object.defineProperty(globalThis.navigator, 'locks', {
  value: { request: (_name: string, work: () => unknown) => work() },
  configurable: true,
})

const { navigateToMock, ensureMock } = vi.hoisted(() => ({
  navigateToMock: vi.fn(async () => {}),
  ensureMock: vi.fn(),
}))

mockNuxtImport('navigateTo', () => navigateToMock)

vi.mock('~/composables/useLocalData', () => ({
  useLocalData: () => ({
    ensure: ensureMock,
    current: () => null,
    state: {
      value: {
        status: 'ready',
        deviceId: 'qa71',
        userId: '018f2c4e-0000-7000-8000-00000000000a',
        error: null,
      },
    },
  }),
}))

const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const NOW = new Date(2025, 8, 10, 10, 0, 0).getTime()
const TODAY = '2025-09-10'
const YESTERDAY = '2025-09-09'
const PAPER = 'krem'
const DRAFT_KEY = MEMO_DRAFT_PREFIX + TODAY

const STATES = [
  'memos',
  'memosStatus',
  'memosError',
  'memosUnsaved',
  'memo-paper',
  'memo-draft',
  'memo-draft-day',
  'memo-draft-saved',
  'memo-draft-held',
  'now',
  'memo-selected',
  'schedules',
  'goals',
  'journal-days',
]

type TestSession = LocalDataSession & { readonly clock: ManualClock }

type Gate = {
  readonly session: TestSession
  allow: () => void
  hold: () => () => void
}

let counter = 0
let base: TestSession | null = null
let wrapper: VueWrapper | null = null

async function open(): Promise<TestSession> {
  counter += 1
  const clock = createManualClock(NOW)
  const session = await openLocalDataSession({
    userId: USER_ID,
    clock,
    databaseName: `ip-memo71-ui-${counter}`,
    keysDatabaseName: `ip-memo71-ui-${counter}-keys`,
  })
  return { ...session, clock }
}

function gated(session: TestSession): Gate {
  let blocked = true
  let pending: Promise<void> | null = null
  let release: (() => void) | null = null

  const beforeWrite = async (): Promise<void> => {
    if (blocked) throw new Error('QuotaExceededError: storage penuh')
    if (pending !== null) await pending
  }

  const writer = {
    ...session.writer,
    write: async (input: Parameters<typeof session.writer.write>[0]) => {
      await beforeWrite()
      return session.writer.write(input)
    },
    remove: async (input: Parameters<typeof session.writer.remove>[0]) => {
      await beforeWrite()
      return session.writer.remove(input)
    },
  }

  return {
    session: { ...session, writer },
    allow: () => {
      blocked = false
    },
    hold: () => {
      pending = new Promise<void>((resolve) => {
        release = () => {
          pending = null
          resolve()
        }
      })
      return () => release?.()
    },
  }
}

function seedState(): void {
  useState<number>('now').value = NOW
  useState<Schedule[]>('schedules').value = []
  useState('goals').value = []
  useState<MemoStore>('memos').value = { memos: [], moods: {} }
  useState<Record<string, JournalDay>>('journal-days').value = {}
  useState<string>('memo-selected').value = TODAY
}

interface MemoStore {
  memos: Memo[]
  moods: MoodByDate
}

async function mountPage(): Promise<VueWrapper> {
  wrapper = await mountSuspended(MemoPage)
  await flushPromises()
  return wrapper
}

const alertOf = (target: VueWrapper) => target.find('section.sheet [role="alert"]')
const buttonWith = (target: VueWrapper, label: string) =>
  target.findAll('button').find((button) => button.text() === label)

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  localStorage.clear()
  clearNuxtState(STATES)
  resetMemosHydrationForTest()
  resetSchedulesHydrationForTest()
  navigateToMock.mockClear()
  ensureMock.mockReset()

  base = await open()
  seedState()
})

afterEach(async () => {
  wrapper?.unmount()
  wrapper = null
  await flushPromises()
  vi.restoreAllMocks()
})

describe('QA #71 editor jurnal: kegagalan tulis terlihat & bisa diulang', () => {
  it('(a) storage penuh: banner generik muncul, draf & teks bertahan, "Coba lagi" menyimpan', async () => {
    const session = base
    if (session === null) throw new Error('sesi tidak siap')
    const gate = gated(session)
    ensureMock.mockResolvedValue(gate.session)

    const page = await mountPage()
    await typeDiary('Tulisan yang gagal disimpan.')
    expect(localStorage.getItem(DRAFT_KEY)).toContain('Tulisan yang gagal disimpan.')

    await page.find('section.sheet').trigger('focusout')

    await vi.waitFor(() => {
      expect(alertOf(page).exists()).toBe(true)
    })
    const alert = alertOf(page)
    // Copy untuk user, bukan pesan internal storage.
    expect(alert.text()).toContain('Belum tersimpan')
    expect(alert.text()).not.toContain('QuotaExceededError')
    expect(alert.find('button').text()).toBe('Coba lagi')
    // Teks & draf masih ada: satu-satunya salinan tulisan user.
    expect(diaryValue()).toBe('Tulisan yang gagal disimpan.')
    expect(localStorage.getItem(DRAFT_KEY)).toContain('Tulisan yang gagal disimpan.')
    expect((await loadMemoRecords(session, PAPER)).entries).toHaveLength(0)

    // Storage pulih -> tombol yang sama menulis ke IndexedDB.
    gate.allow()
    const retry = buttonWith(page, 'Coba lagi')
    if (!retry) throw new Error('tombol coba lagi tidak ada')
    await retry.trigger('click')
    await flushPromises()

    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, PAPER)).entries[0]?.text).toBe(
        'Tulisan yang gagal disimpan.',
      )
    })
    await vi.waitFor(() => {
      expect(alertOf(page).exists()).toBe(false)
    })
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(diaryValue()).toBe('Tulisan yang gagal disimpan.')
  })

  it('(b) banner hanya untuk tanggal yang gagal, bukan tanggal lain', async () => {
    const session = base
    if (session === null) throw new Error('sesi tidak siap')
    const gate = gated(session)
    ensureMock.mockResolvedValue(gate.session)

    const page = await mountPage()
    await typeDiary('Tulisan yang gagal.')
    await page.find('section.sheet').trigger('focusout')
    await vi.waitFor(() => {
      expect(alertOf(page).exists()).toBe(true)
    })

    // Pindah tanggal lewat tombol strip tanggal (tanggal lain tidak punya tulisan tertunda).
    useState<string>('memo-selected').value = YESTERDAY
    await flushPromises()
    await vi.waitFor(() => {
      expect(alertOf(page).exists()).toBe(false)
    })
  })
})

describe('QA #71 temuan QA: banner dibersihkan setelah entri dihapus', () => {
  it('tulisan yang gagal lalu dikosongkan: banner hilang dan "Coba lagi" tidak tertinggal', async () => {
    const session = base
    if (session === null) throw new Error('sesi tidak siap')
    const gate = gated(session)
    ensureMock.mockResolvedValue(gate.session)

    const page = await mountPage()
    await typeDiary('Tulisan yang gagal lalu dihapus.')
    await page.find('section.sheet').trigger('focusout')
    await vi.waitFor(() => {
      expect(alertOf(page).exists()).toBe(true)
    })

    // Storage pulih, lalu user menghapus semua tulisannya (hari ini selalu mode edit; autosave
    // mengosongkan halaman, record tetap ada supaya mood/sticker tidak ikut hilang).
    gate.allow()
    await typeDiary('')
    await page.find('section.sheet').trigger('focusout')
    await flushPromises()

    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, PAPER)).entries.map((entry) => entry.text)).toEqual([
        '',
      ])
    })

    // BUG-71-02: tanda "belum tersimpan" ikut dibersihkan bersama halamannya. Banner & tombol yang
    // tidak bisa melakukan apa pun tidak boleh tertinggal sampai reload penuh.
    await vi.waitFor(() => {
      expect(alertOf(page).exists()).toBe(false)
    })
    expect(buttonWith(page, 'Coba lagi')).toBeUndefined()
    // Draf halaman yang dihapus ikut bersih: tidak ada salinan yang bisa "hidup lagi".
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(diaryValue()).toBe('')
  })
})

describe('QA #71 temuan QA: teks yang diketik selama menyimpan', () => {
  it('ketikan baru saat tulisan berjalan dipertahankan, bukan ditimpa versi yang disimpan', async () => {
    const session = base
    if (session === null) throw new Error('sesi tidak siap')
    const gate = gated(session)
    ensureMock.mockResolvedValue(gate.session)

    const page = await mountPage()
    await typeDiary('Versi pertama.')
    // Tulisan DITAHAN (bukan ditolak): buka gerbang dulu supaya hasilnya tidak bergantung pada
    // seberapa cepat IndexedDB sampai ke `beforeWrite` sebelum `allow()` dipanggil.
    gate.allow()
    const finish = gate.hold()
    await page.find('section.sheet').trigger('focusout')

    // Selama menunggu konfirmasi, editor masih bisa diketik.
    await typeDiary('Versi pertama. Tambahan penting.')
    expect(localStorage.getItem(DRAFT_KEY)).toContain('Tambahan penting')

    finish()
    await flushPromises()
    await flushPromises()

    // BUG-71-03: yang tersimpan adalah versi yang tadi dikirim, tetapi ketikan sesudahnya TIDAK
    // ditimpa `load()` dan drafnya tidak dihapus - user tinggal menyimpan lagi.
    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, PAPER)).entries[0]?.text).toBe('Versi pertama.')
    })
    expect(diaryValue()).toBe('Versi pertama. Tambahan penting.')
    expect(localStorage.getItem(DRAFT_KEY)).toContain('Tambahan penting')
    expect(alertOf(page).exists()).toBe(false)

    // Simpan lagi menuliskan ketikan yang tadi masuk, lalu draf baru dibuang.
    await page.find('section.sheet').trigger('focusout')
    await vi.waitFor(async () => {
      expect((await loadMemoRecords(session, PAPER)).entries[0]?.text).toBe(
        'Versi pertama. Tambahan penting.',
      )
    })
    await vi.waitFor(() => {
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    })
  })
})
