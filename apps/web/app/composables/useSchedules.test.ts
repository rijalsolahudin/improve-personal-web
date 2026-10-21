import { beforeEach, describe, expect, it, vi } from 'vitest'

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
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { addDays, deviceTimeZone } from '~/utils/time'

import { resetSchedulesHydrationForTest, useSchedules } from './useSchedules'

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

    const { save, hydrate } = useSchedules({ session: async () => session })
    await hydrate()

    const occurrence = '2026-10-12'
    const draft = { ...newScheduleDraft(occurrence, '10:00'), title: 'Kelas (pindah)' }
    // Task tertaut tetap menempel ke seri asal, bukan ke jadwal pecahan.
    expect(save(draft, { id: original.id, occurrence, scope: 'this' })).toEqual({
      id: original.id,
    })

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
