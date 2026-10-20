import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'

import { loadFocusSessions } from '~/utils/pomodoro/persistence'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import type { LocalDataSession } from '~/utils/storage/session'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { MS_PER_MINUTE } from '~/utils/time'

import {
  POMODORO_CONFIG_KEY,
  POMODORO_STATE_KEY,
  resetPomodoroHistoryForTest,
  usePomodoro,
} from './usePomodoro'

const START_MS = 1_700_000_000_000
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }

const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

function memorySession(): LocalDataSession {
  const clock = createManualClock(START_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: USER_ID, clock })

  return {
    storage,
    provider: fakeProvider,
    clock,
    dataKey: DATA_KEY,
    hlc,
    deviceId: USER_ID,
    userId: USER_ID,
    isFreshKey: true,
    keyStore: {
      has: async () => false,
      put: async () => undefined,
      get: async () => null,
      remove: async () => undefined,
    },
    newId: createUuidV7Generator({ clock }),
    withMasterKey: async (work) => work(new Uint8Array(32)),
    repos: createRepositorySet({ storage, provider: fakeProvider, dataKey: DATA_KEY }),
    writer: createRecordWriter({ storage, provider: fakeProvider, dataKey: DATA_KEY, hlc, clock }),
  }
}

const HISTORY_KEYS = [
  'pomodoro',
  'pomodoro-config',
  'pomodoro-target',
  'pomodoro-target-kind',
  'pomodoro-history',
  'pomodoro-history-status',
  'pomodoro-history-error',
  'pomodoro-sound',
  'pomodoro-notice',
]

beforeEach(() => {
  localStorage.clear()
  clearNuxtState(HISTORY_KEYS)
  resetPomodoroHistoryForTest()
  // Isi ulang langsung: plugin pomodoro global ikut membaca state ini di tick berikutnya.
  usePomodoro({ session: async () => null })
})

describe('usePomodoro', () => {
  it('target dikunci setelah sesi fokus dimulai; riwayat mencatat target awal', () => {
    const pomodoro = usePomodoro()
    pomodoro.setTarget('Task A')
    pomodoro.start()
    pomodoro.setTarget('Task B')
    expect(pomodoro.isTargetLocked.value).toBe(true)
    expect(pomodoro.target.value).toBe('Task A')
    pomodoro.toggle()
    pomodoro.setTarget('Task B')
    expect(pomodoro.target.value).toBe('Task A')
    pomodoro.skip()
    expect(pomodoro.history.value[0]).toMatchObject({ target: 'Task A', status: 'dilewati' })
    expect(pomodoro.isTargetLocked.value).toBe(false)
  })

  it('batalkan sesi: dicatat dilewati, kembali ke awal fokus, target bisa diganti', () => {
    const pomodoro = usePomodoro()
    pomodoro.setTarget('Task A')
    pomodoro.start()
    pomodoro.cancelFocus()
    expect(pomodoro.history.value[0]).toMatchObject({ target: 'Task A', status: 'dilewati' })
    expect(pomodoro.phase.value).toBe('focus')
    expect(pomodoro.isRunning.value).toBe(false)
    expect(pomodoro.isStarted.value).toBe(false)
    pomodoro.setTarget('Task B')
    expect(pomodoro.target.value).toBe('Task B')
  })

  it('sisa waktu tidak melompat naik saat Mulai walau jam global belum tick', () => {
    const pomodoro = usePomodoro()
    const now = useNow()
    now.value = Date.now() - 900
    const before = pomodoro.remainingMs.value
    pomodoro.start()
    expect(pomodoro.remainingMs.value).toBeLessThanOrEqual(before)
  })

  it('skip sesi fokus yang sudah jalan tercatat "dilewati" + notifikasi', () => {
    const pomodoro = usePomodoro()
    const before = pomodoro.history.value.length
    pomodoro.setTarget('  Nulis bab 2  ')
    pomodoro.start()
    pomodoro.skip()
    expect(pomodoro.history.value).toHaveLength(before + 1)
    expect(pomodoro.history.value[0]).toMatchObject({ target: 'Nulis bab 2', status: 'dilewati' })
    expect(pomodoro.notice.value).toBe('focusSkipped')
    expect(pomodoro.phase.value).toBe('short')
  })

  it('selesai otomatis dihitung ke menit fokus; istirahat selesai → notifikasi', () => {
    const pomodoro = usePomodoro()
    const minutes = pomodoro.focusMinutesToday.value
    pomodoro.start()
    pomodoro.finish(true)
    expect(pomodoro.focusMinutesToday.value).toBe(minutes)
    expect(pomodoro.notice.value).toBe('focusDone')
    pomodoro.finish(true)
    expect(pomodoro.notice.value).toBe('breakDone')
    expect(pomodoro.phase.value).toBe('focus')
  })

  it('pengaturan tersimpan & dibaca ulang', () => {
    usePomodoro().adjust('focus', 1)
    expect(JSON.parse(localStorage.getItem(POMODORO_CONFIG_KEY) ?? '{}').focus).toBe(30)
    clearNuxtState(['pomodoro-config'])
    expect(usePomodoro().config.value.focus).toBe(30)
  })

  it('target ikut jenisnya; target kosong mengosongkan jenis', () => {
    const pomodoro = usePomodoro()
    pomodoro.setTarget('Gym', 'jadwal')
    expect(pomodoro.targetKind.value).toBe('jadwal')
    pomodoro.setTarget('   ', 'teks')
    expect(pomodoro.target.value).toBeNull()
    expect(pomodoro.targetKind.value).toBeNull()
  })

  it('sesi yang berjalan bertahan setelah refresh (state & target dipulihkan)', () => {
    const pomodoro = usePomodoro({ session: async () => null })
    pomodoro.setTarget('Tulis laporan', 'teks')
    pomodoro.start()

    clearNuxtState(HISTORY_KEYS)
    resetPomodoroHistoryForTest()

    const restored = usePomodoro({ session: async () => null })
    expect(restored.isRunning.value).toBe(true)
    expect(restored.phase.value).toBe('focus')
    expect(restored.remainingMs.value).toBeGreaterThan(0)
    expect(restored.target.value).toBe('Tulis laporan')
    expect(restored.targetKind.value).toBe('teks')
  })

  it('fase yang habis selagi app ditutup diselesaikan & dicatat dengan waktu berakhir asli', () => {
    const endedAt = Date.now() - 10 * MS_PER_MINUTE
    const startedAt = endedAt - 25 * MS_PER_MINUTE

    localStorage.setItem(
      POMODORO_STATE_KEY,
      JSON.stringify({
        state: {
          phase: 'focus',
          running: true,
          endsAt: endedAt,
          remainingMs: 0,
          completedFocus: 0,
          startedAt,
        },
        target: 'Baca bab 3',
        targetKind: 'teks',
        targetMode: 'free',
      }),
    )

    clearNuxtState(HISTORY_KEYS)
    resetPomodoroHistoryForTest()

    const pomodoro = usePomodoro({ session: async () => null })
    expect(pomodoro.isRunning.value).toBe(false)
    expect(pomodoro.phase.value).toBe('short')
    expect(pomodoro.history.value[0]).toMatchObject({
      target: 'Baca bab 3',
      status: 'selesai',
      endedAt,
    })
  })

  it('riwayat sesi tersimpan dan terbaca lagi setelah hydrate', async () => {
    const session = memorySession()
    const first = usePomodoro({ session: async () => session })
    await first.hydrate()

    first.setTarget('Tulis laporan')
    first.start()
    first.finish(true)

    await vi.waitFor(async () => {
      const stored = await loadFocusSessions(session, Date.now())
      expect(stored.map((item) => item.target)).toContain('Tulis laporan')
    })

    clearNuxtState(HISTORY_KEYS)
    resetPomodoroHistoryForTest()

    const second = usePomodoro({ session: async () => session })
    await second.hydrate()

    expect(second.history.value[0]).toMatchObject({
      target: 'Tulis laporan',
      status: 'selesai',
    })
    expect(second.historyStatus.value).toBe('ready')
  })

  it('tanpa sesi (SSR): riwayat kosong dan status idle, bukan error', async () => {
    clearNuxtState(HISTORY_KEYS)
    resetPomodoroHistoryForTest()

    const pomodoro = usePomodoro({ session: async () => null })
    await pomodoro.hydrate()

    expect(pomodoro.history.value).toEqual([])
    expect(pomodoro.historyStatus.value).toBe('idle')
  })
})
