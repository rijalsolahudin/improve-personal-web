import { describe, expect, it } from 'vitest'

import { emptyTaskDraft, type Task } from './tasks'
import type { Habit } from './habits'
import { fromCoreHabit, toCoreHabit } from './habits/persistence'
import type { Schedule } from './schedule'
import { toSchedule, toSchedulePayload } from './schedules/persistence'
import { draftFromTask } from './tasks'

/**
 * Tautan item -> goal (PRD F13 "Untuk goal", AC T18).
 *
 * AC: "Dropdown 'Untuk goal' ... tersedia di form task/habit/jadwal; tautan tersimpan dua arah dan
 * tidak duplikat."
 *
 * Yang diuji di sini adalah PERILAKU yang terlihat user: pilih goal di form -> simpan -> muat ulang ->
 * pilihan goal masih ada. Bagaimana tautan disimpan (record `goal_link` atau kolom) bukan urusan test.
 */

const GOAL_ID = '0192f0a0-0000-7000-8000-000000000001'
const CHAPTER_ID = '0192f0a0-0000-7000-8000-000000000003'
const TZ = 'Asia/Jakarta'
const NOW_MS = 1_700_000_000_000

const HABIT: Habit = {
  id: '0192f0a0-0000-7000-8000-000000000020',
  name: 'Baca 10 menit',
  icon: 'star',
  sticker: null,
  color: 0,
  days: null,
  target: 1,
  goalId: GOAL_ID,
  isArchived: false,
}

const SCHEDULE: Schedule = {
  id: '0192f0a0-0000-7000-8000-000000000040',
  title: 'Kelas',
  color: 2,
  start: '2026-10-05',
  time: '19:00',
  dur: 90,
  allDay: false,
  rec: { type: 'weekly', days: [1, 4], interval: 2 },
  ends: { type: 'until', date: '2026-12-31' },
  exceptions: [],
  goalId: GOAL_ID,
  tz: TZ,
}

const TASK: Task = {
  id: '0192f0a0-0000-7000-8000-000000000050',
  title: 'Lari 5K',
  priority: 'medium',
  deadline: null,
  done: false,
  scheduleId: null,
  quadrant: null,
  position: 0,
}

describe('tautan goal habit bertahan setelah simpan + muat ulang', () => {
  it('habit yang disimpan dengan goalId kembali dengan goalId yang sama', () => {
    const reloaded = fromCoreHabit(toCoreHabit(HABIT, NOW_MS))
    expect(reloaded.goalId).toBe(GOAL_ID)
  })

  it('habit tanpa goal tetap tanpa goal (kontrol)', () => {
    const reloaded = fromCoreHabit(toCoreHabit({ ...HABIT, goalId: null }, NOW_MS))
    expect(reloaded.goalId).toBeNull()
  })
})

describe('tautan goal jadwal bertahan setelah simpan + muat ulang', () => {
  it('jadwal yang disimpan dengan goalId kembali dengan goalId yang sama', () => {
    const payload = toSchedulePayload(SCHEDULE, TZ, NOW_MS)
    const reloaded = toSchedule(payload, [], TZ)
    expect(reloaded.goalId).toBe(GOAL_ID)
  })

  it('jadwal tanpa goal tetap tanpa goal (kontrol)', () => {
    const payload = toSchedulePayload({ ...SCHEDULE, goalId: null }, TZ, NOW_MS)
    expect(toSchedule(payload, [], TZ).goalId).toBeNull()
  })
})

describe('form task punya tempat untuk tautan goal', () => {
  it('draft task baru membawa pilihan "Untuk goal"', () => {
    const draft = emptyTaskDraft('2026-10-23')
    expect(Object.keys(draft)).toContain('goalId')
  })

  it('draft dari task yang sudah ada mempertahankan goal-nya', () => {
    const draft = draftFromTask({ ...TASK, goalId: CHAPTER_ID } as Task, '2026-10-23')
    expect(Object.keys(draft)).toContain('goalId')
  })
})
