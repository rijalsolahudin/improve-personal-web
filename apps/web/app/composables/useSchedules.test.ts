import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'

import { newScheduleDraft, type Schedule } from '~/utils/schedule'
import { attendanceKey, loadScheduleData, persistSchedule } from '~/utils/schedules/persistence'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import type { LocalDataSession } from '~/utils/storage/session'
import { resetSyncReloadersForTest } from '~/utils/sync/refresh'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { addDays, deviceTimeZone } from '~/utils/time'

import { resetSchedulesHydrationForTest, useSchedules } from './useSchedules'
import { TEST_KID_WIRE } from '../../tests/nuxt/record-key'

const START_MS = 1_700_000_000_000
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const TZ = deviceTimeZone()

const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }

function memorySession(): LocalDataSession {
  const clock = createManualClock(START_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: USER_ID, clock })

  return {
    storage,
    provider: fakeProvider,
    clock,
    dataKey: DATA_KEY,
    kid: TEST_KID_WIRE,
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

function storedSchedule(session: LocalDataSession, overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: session.newId(),
    title: 'Kelas',
    color: 0,
    start: '2026-10-05',
    time: '09:00',
    dur: 60,
    allDay: false,
    rec: { type: 'weekly', days: [1], interval: 1 },
    ends: { type: 'never' },
    exceptions: [],
    goalId: null,
    tz: TZ,
    ...overrides,
  }
}

beforeEach(() => {
  clearNuxtState([
    'schedules',
    'schedule-attendance',
    'schedulesStatus',
    'schedulesError',
    'localData',
  ])
  resetSchedulesHydrationForTest()
})

describe('useSchedules', () => {
  it('simpan jadwal baru: state langsung berubah dan tersimpan di belakang layar', async () => {
    const session = memorySession()
    const { schedules, save, hydrate } = useSchedules({ session: async () => session })
    await hydrate()

    expect(save(newScheduleDraft('2026-10-10', '09:00'), null)).toEqual({ error: 'titleRequired' })

    const result = save({ ...newScheduleDraft('2026-10-10', '09:00'), title: 'Rapat' }, null)
    expect(schedules.value).toHaveLength(1)
    // Id dipakai form untuk menautkan task ke jadwal yang baru dibuat.
    expect(result).toEqual({ id: schedules.value[0]?.id })

    await vi.waitFor(async () => {
      const data = await loadScheduleData(session, TZ)
      expect(data.schedules.map((schedule) => schedule.title)).toContain('Rapat')
    })
  })

  it('hydrate memuat jadwal yang sudah tersimpan', async () => {
    const session = memorySession()
    const existing = storedSchedule(session, { title: 'Tersimpan' })
    await persistSchedule(session, existing, TZ)

    const { schedules, hydrate, status } = useSchedules({ session: async () => session })
    await hydrate()

    expect(status.value).toBe('ready')
    expect(schedules.value).toEqual([existing])
  })

  it('edit "kejadian ini" menambah exception dan jadwal sekali', async () => {
    const session = memorySession()
    const original = storedSchedule(session)
    await persistSchedule(session, original, TZ)

    const { save, hydrate, schedules } = useSchedules({ session: async () => session })
    await hydrate()

    const occurrence = '2026-10-12'
    const draft = { ...newScheduleDraft(occurrence, '10:00'), title: 'Kelas (pindah)' }
    const result = save(draft, { id: original.id, occurrence, scope: 'this' })

    // Task tertaut harus ikut ke jadwal pecahan: seri lama tidak lagi muncul di tanggal itu.
    const split = schedules.value.find((schedule) => schedule.id !== original.id)
    expect(result).toEqual({ id: split?.id })
    expect(split).toMatchObject({ start: occurrence, rec: { type: 'once' } })

    await vi.waitFor(async () => {
      const data = await loadScheduleData(session, TZ)
      expect(data.schedules.find((schedule) => schedule.id === original.id)?.exceptions).toEqual([
        occurrence,
      ])
      expect(data.schedules).toHaveLength(2)
    })
  })

  it('hapus seluruh seri menghilangkan jadwal & exception-nya', async () => {
    const session = memorySession()
    const original = storedSchedule(session, { exceptions: ['2026-10-12'] })
    await persistSchedule(session, original, TZ)

    const { schedules, remove, hydrate } = useSchedules({ session: async () => session })
    await hydrate()

    remove(original.id, original.start, 'all')
    expect(schedules.value).toEqual([])

    await vi.waitFor(async () => {
      expect((await loadScheduleData(session, TZ)).schedules).toEqual([])
    })
  })

  it('retime mengubah jam & durasi seri, lalu menyimpannya', async () => {
    const session = memorySession()
    const original = storedSchedule(session)
    await persistSchedule(session, original, TZ)

    const { schedules, retime, hydrate } = useSchedules({ session: async () => session })
    await hydrate()

    retime(original.id, 9 * 60 + 30, 45)
    expect(schedules.value[0]).toMatchObject({ time: '09:30', dur: 45 })

    retime(original.id, 9 * 60 + 30, 5)
    expect(schedules.value[0]?.dur).toBe(15)

    await vi.waitFor(async () => {
      const data = await loadScheduleData(session, TZ)
      expect(data.schedules[0]).toMatchObject({ time: '09:30', dur: 15 })
    })
  })

  it('tandai hadir tersimpan dan terbaca lagi setelah hydrate', async () => {
    const session = memorySession()
    const original = storedSchedule(session)
    await persistSchedule(session, original, TZ)
    const day = addDays(original.start, 7)

    const { toggleAttendance, hydrate } = useSchedules({ session: async () => session })
    await hydrate()

    toggleAttendance(attendanceKey(original.id, day))

    await vi.waitFor(async () => {
      expect(
        (await loadScheduleData(session, TZ)).attendance[attendanceKey(original.id, day)],
      ).toBe(true)
    })
  })

  it('tanpa sesi (SSR): daftar kosong dan status idle, bukan error', async () => {
    const { schedules, hydrate, status } = useSchedules({ session: async () => null })
    await hydrate()

    expect(schedules.value).toEqual([])
    expect(status.value).toBe('idle')
  })
})

describe('useSchedules: muat ulang setelah pull (AC T77)', () => {
  beforeEach(() => {
    clearNuxtState([
      'schedules',
      'schedule-attendance',
      'schedulesStatus',
      'schedulesError',
      'localData',
      'goalLinks',
    ])
    resetSchedulesHydrationForTest()
    resetSyncReloadersForTest()
  })

  /** Sesi yang tulisannya ditahan sampai `release()` - antrean tulis yang belum mendarat. */
  function withWriteGate(session: LocalDataSession): {
    readonly session: LocalDataSession
    readonly release: () => void
  } {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const writer = session.writer

    return {
      release,
      session: {
        ...session,
        writer: {
          ...writer,
          write: async (input) => {
            await gate
            return writer.write(input)
          },
        },
      },
    }
  }

  it('reload memuat jadwal dari perangkat lain tanpa pernah berstatus loading', async () => {
    const session = memorySession()
    const existing = storedSchedule(session, { title: 'Lokal' })
    await persistSchedule(session, existing, TZ)

    const { schedules, hydrate, reload, status } = useSchedules({ session: async () => session })
    await hydrate()
    expect(schedules.value.map((schedule) => schedule.title)).toEqual(['Lokal'])

    const remote = storedSchedule(session, { title: 'Dari perangkat lain', start: '2026-10-06' })
    await persistSchedule(session, remote, TZ)

    const pending = reload()
    expect(status.value).toBe('ready')
    await pending

    expect(schedules.value.map((schedule) => schedule.title).sort()).toEqual([
      'Dari perangkat lain',
      'Lokal',
    ])
    expect(status.value).toBe('ready')
  })

  it('reload menunggu tulisan jadwal yang belum mendarat', async () => {
    const gated = withWriteGate(memorySession())
    const { schedules, save, hydrate, reload } = useSchedules({
      session: async () => gated.session,
    })
    await hydrate()

    // Spy dipasang setelah hydrate: yang diuji hanya pembacaan milik reload.
    const listAll = vi.spyOn(gated.session.repos.schedule, 'listAll')

    const result = save({ ...newScheduleDraft('2026-10-10', '09:00'), title: 'Baru' }, null)
    if ('error' in result) throw new Error('simpan gagal')
    expect(schedules.value.map((schedule) => schedule.title)).toEqual(['Baru'])

    const pending = reload()
    await flushPromises()
    // Belum membaca selama antrean tulis masih ditahan.
    expect(listAll).not.toHaveBeenCalled()
    expect(schedules.value.map((schedule) => schedule.id)).toEqual([result.id])

    gated.release()
    await pending
    expect(listAll).toHaveBeenCalled()
    expect(schedules.value.map((schedule) => schedule.id)).toEqual([result.id])
  })

  it('store yang belum pernah di-hydrate tidak memuat apa pun', async () => {
    const getSession = vi.fn(async () => null)
    const { status, reload } = useSchedules({ session: getSession })
    await vi.waitFor(() => expect(status.value).toBe('idle'))
    getSession.mockClear()

    await reload()

    expect(getSession).not.toHaveBeenCalled()
    expect(status.value).toBe('idle')
  })

  it('reload yang gagal menandai status error beserta pesannya', async () => {
    const session = memorySession()
    const { hydrate, reload, status, error } = useSchedules({ session: async () => session })
    await hydrate()

    vi.spyOn(session.repos.schedule, 'listAll').mockRejectedValue(new Error('storage rusak'))
    await reload()

    expect(status.value).toBe('error')
    expect(error.value).toBe('storage rusak')
  })
})
