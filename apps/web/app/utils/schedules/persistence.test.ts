// @vitest-environment node
//
// Persistensi jadwal: model presentasi <-> record core (`schedule` + exception + occurrence), lewat
// sesi data lokal nyata (IndexedDB + kripto sungguhan).
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import { createManualClock, type ManualClock } from '@improve-personal/core'

import type { Schedule } from '../schedule'
import { openLocalDataSession, type LocalDataSession } from '../storage/session'
import {
  attendanceKey,
  loadScheduleData,
  persistAttendance,
  persistSchedule,
  removeSchedule,
} from './persistence'

const START_MS = 1_700_000_000_000
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const TZ = 'Asia/Jakarta'

Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })

let counter = 0

function names() {
  counter += 1
  return {
    databaseName: `ip-schedules-test-${counter}`,
    keysDatabaseName: `ip-schedules-test-keys-${counter}`,
  }
}

type OpenSession = LocalDataSession & { readonly clock: ManualClock }

async function openSession(dbNames: ReturnType<typeof names>): Promise<OpenSession> {
  const clock = createManualClock(START_MS)
  const session = await openLocalDataSession({ userId: USER_ID, clock, ...dbNames })
  return { ...session, clock }
}

function schedule(session: LocalDataSession, overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: session.newId(),
    title: 'Kelas',
    color: 2,
    start: '2026-10-05',
    time: '19:00',
    dur: 90,
    allDay: false,
    rec: { type: 'weekly', days: [1, 4], interval: 2 },
    ends: { type: 'until', date: '2026-12-31' },
    exceptions: [],
    goalId: null,
    tz: TZ,
    ...overrides,
  }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('persistensi jadwal', () => {
  it('simpan lalu muat: jadwal kembali utuh (termasuk exception)', async () => {
    const session = await openSession(names())
    const saved = schedule(session, { exceptions: ['2026-10-12'] })

    await persistSchedule(session, saved, TZ)

    const data = await loadScheduleData(session, TZ)
    expect(data.schedules).toEqual([saved])
  })

  it('data bertahan setelah sesi dibuka ulang', async () => {
    const dbNames = names()
    const first = await openSession(dbNames)
    const saved = schedule(first, { title: 'Tetap ada' })
    await persistSchedule(first, saved, TZ)

    const reopened = await openSession(dbNames)
    expect((await loadScheduleData(reopened, TZ)).schedules).toEqual([saved])
  })

  it('recurrence bulanan ke-N & aturan count dipetakan ke payload core', async () => {
    const session = await openSession(names())
    const saved = schedule(session, {
      start: '2026-10-01',
      rec: { type: 'monthly', nth: { week: 2, weekday: 2 } },
      ends: { type: 'count', count: 5 },
    })

    await persistSchedule(session, saved, TZ)

    const record = await session.repos.schedule.getById(saved.id)
    const payload = record?.data as Record<string, unknown>
    expect(payload.recurrence).toMatchObject({
      type: 'monthly',
      monthMode: 'by_nth_weekday',
      weekOfMonth: 2,
      monthWeekday: 'selasa',
      endMode: 'after_count',
      occurrenceCount: 5,
    })
    expect((await loadScheduleData(session, TZ)).schedules).toEqual([saved])
  })

  it('jadwal sekali disimpan tanpa recurrence', async () => {
    const session = await openSession(names())
    const saved = schedule(session, { rec: { type: 'once' }, ends: { type: 'never' } })

    await persistSchedule(session, saved, TZ)

    const record = await session.repos.schedule.getById(saved.id)
    expect((record?.data as Record<string, unknown>).recurrence).toBeNull()
    expect((await loadScheduleData(session, TZ)).schedules).toEqual([saved])
  })

  it('menimpa jadwal mempertahankan description & createdAt', async () => {
    const session = await openSession(names())
    const id = session.newId()

    await session.writer.write({
      id,
      type: 'schedule',
      data: (recordId) => ({
        id: recordId,
        title: 'Lama',
        description: 'catatan yang belum ada di form',
        color: '0',
        startAt: START_MS - 500_000,
        durationMs: 3_600_000,
        isAllDay: false,
        tz: TZ,
        createdAt: START_MS - 500_000,
        updatedAt: START_MS - 500_000,
        recurrence: null,
      }),
      index: { rangeStartMs: START_MS - 500_000, rangeEndMs: START_MS + 3_100_000 },
    })

    session.clock.advance(60_000)
    await persistSchedule(session, schedule(session, { id, title: 'Baru' }), TZ)

    const payload = (await session.repos.schedule.getById(id))?.data as Record<string, unknown>
    expect(payload.description).toBe('catatan yang belum ada di form')
    expect(payload.createdAt).toBe(START_MS - 500_000)
    expect(payload.updatedAt).toBe(START_MS + 60_000)
  })

  it('kehadiran tersimpan dan bisa dibatalkan', async () => {
    const session = await openSession(names())
    const saved = schedule(session, { exceptions: [] })
    await persistSchedule(session, saved, TZ)

    await persistAttendance(session, saved, '2026-10-05', true, TZ)
    expect(
      (await loadScheduleData(session, TZ)).attendance[attendanceKey(saved.id, '2026-10-05')],
    ).toBe(true)

    await persistAttendance(session, saved, '2026-10-05', false, TZ)
    expect((await loadScheduleData(session, TZ)).attendance).toEqual({})
  })

  it('hapus jadwal ikut menghapus exception & kehadiran', async () => {
    const dbNames = names()
    const session = await openSession(dbNames)
    const saved = schedule(session, { exceptions: ['2026-10-12'] })

    await persistSchedule(session, saved, TZ)
    await persistAttendance(session, saved, '2026-10-05', true, TZ)
    await removeSchedule(session, saved.id)

    expect(await loadScheduleData(session, TZ)).toEqual({ schedules: [], attendance: {} })

    const reopened = await openSession(dbNames)
    expect(await loadScheduleData(reopened, TZ)).toEqual({ schedules: [], attendance: {} })
  })
})
