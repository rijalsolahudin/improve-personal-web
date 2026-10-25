import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EMPTY_DAILY_DAY, type DailyDay, type RoutineStep } from '~/utils/dailyRoutine'
import type { Task } from '~/utils/tasks'
import { MS_PER_HOUR, addDays, fromIsoDate, toIsoDate } from '~/utils/time'

import { clearAppStorage, useLogout } from './useLogout'
import type { AuthGateway } from './auth/gateway'
import { useAuthSession } from './useAuthSession'
import { DAILY_STORAGE_KEY, useDailyRoutine } from './useDailyRoutine'

/**
 * QA T14 putaran 2 (Ergonio #28) - B3: state harian harus bertahan setelah reload
 * (`localStorage` `ip-daily`) dan dibuang saat logout.
 *
 * Sengaja terpisah dari 5 file QA putaran 1 supaya baseline putaran 1 tetap utuh; file ini
 * hanya menambah bukti yang belum bisa dibuat saat state masih in-memory.
 */
const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

const TODAY = '2026-10-19' // Senin
const START = fromIsoDate(TODAY).getTime()
const NOW = START + 9 * MS_PER_HOUR

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    priority: 'medium',
    deadline: null,
    done: false,
    scheduleId: null,
    quadrant: null,
    position: 0,
    ...patch,
  }
}

const SESSION_DTO = {
  user: { id: '018f2b3c-4d5e-7f80-9abc-def012345678', email: 'kamu@email.com' },
  device: { id: '018f2b3c-4d5e-7f80-9abc-def012345678', name: 'Chrome di Linux' },
  expiresAt: '2026-05-10T09:00:00.000Z',
  client: 'web' as const,
}

function stubGateway(): AuthGateway {
  return {
    requestEmailOtp: vi.fn(async () => {}),
    verifyEmailOtp: vi.fn(async () => SESSION_DTO),
    startGoogleLogin: vi.fn(async () => {}),
    currentSession: vi.fn(async () => null),
    signOut: vi.fn(async () => {}),
  }
}

/** Isi `localStorage` seperti sesi sebelumnya, tanpa lewat composable. */
function seedStoredDay(day: Partial<DailyDay>): void {
  localStorage.setItem(
    DAILY_STORAGE_KEY,
    JSON.stringify({ [TODAY]: { ...EMPTY_DAILY_DAY, ...day } }),
  )
}

beforeEach(() => {
  localStorage.clear()
  clearNuxtState([
    'tasks',
    'tasksStatus',
    'tasksError',
    'schedules',
    'schedule-attendance',
    'schedulesStatus',
    'schedulesError',
    'habits',
    'habitsCheckIns',
    'habitsStatus',
    'habitsError',
    'daily-routine',
    'now',
  ])
  navigateToMock.mockReset()
  useState<number>('now').value = NOW
})

describe('state harian bertahan setelah reload (B3)', () => {
  it('centang task & cuaca ditulis ke localStorage lalu terbaca lagi setelah state halaman kosong', () => {
    useState<Task[]>('tasks').value = [task('do-1', { quadrant: 'do', title: 'Kirim laporan' })]
    const before = useDailyRoutine()

    before.toggleTask('do-1')
    before.setWeather('hujan')

    const stored = localStorage.getItem(DAILY_STORAGE_KEY)
    expect(stored).toContain('do-1')
    expect(stored).toContain('hujan')

    // Reload: hanya state in-memory yang hilang, storage perangkat tetap.
    clearNuxtState(['daily-routine'])
    const after = useDailyRoutine()

    expect(after.weather.value).toBe('hujan')
    // Task selesai tetap tampil tercoret di Prioritas (perilaku "sampai ganti hari").
    const priority = after.priorities.value.find(({ task: item }) => item.id === 'do-1')
    expect(priority?.task.done).toBe(true)
  })

  it('centang langkah rutinitas juga bertahan setelah reload', () => {
    const before = useDailyRoutine()
    const block = before.currentBlock.value.block
    // Langkah rutinitas tidak lagi disemai mock di produksi; test menyuntik sendiri supaya
    // perilaku centang + persistensi tetap terjaga.
    const step: RoutineStep = { id: 'qa-step', title: 'Langkah QA', block }
    const store = useState<{ steps: readonly RoutineStep[] }>('daily-routine')
    store.value = { ...store.value, steps: [step] }

    const doneBefore = before.currentBlock.value.done
    before.toggleRoutineItem({ kind: 'step', id: step.id, title: step.title, isDone: false })
    expect(before.currentBlock.value.done).toBe(doneBefore + 1)

    clearNuxtState(['daily-routine'])
    const after = useDailyRoutine()
    // Langkah rutinitas bukan data user (dulu datang dari mock): setelah reload, sumbernya
    // disuntik ulang - yang harus bertahan adalah centangnya (`doneSteps` di localStorage).
    const afterStore = useState<{ steps: readonly RoutineStep[] }>('daily-routine')
    afterStore.value = { ...afterStore.value, steps: [step] }

    expect(after.currentBlock.value.done).toBe(doneBefore + 1)
    expect(after.currentBlock.value.nextItem?.id).not.toBe(step.id)
  })

  it('storage rusak tidak menggagalkan halaman (mulai kosong)', () => {
    localStorage.setItem(DAILY_STORAGE_KEY, '{rusak')

    const daily = useDailyRoutine()

    expect(daily.weather.value).toBeNull()
    expect(daily.priorities.value).toEqual([])
  })

  it('storage yang disemai manual terbaca (format dari sesi/perangkat sebelumnya)', () => {
    seedStoredDay({ weather: 'mendung', checkedTaskIds: ['do-1'] })
    useState<Task[]>('tasks').value = [
      task('do-1', { quadrant: 'do', done: true, title: 'Sudah dikerjakan' }),
    ]

    const daily = useDailyRoutine()

    expect(daily.weather.value).toBe('mendung')
    expect(daily.priorities.value.map(({ task: item }) => item.id)).toEqual(['do-1'])
  })
})

describe('logout membuang state harian (B3)', () => {
  it('logout menghapus `ip-daily` tanpa menyentuh key situs lain', async () => {
    const gateway = stubGateway()
    const daily = useDailyRoutine()
    daily.setWeather('hujan')
    expect(localStorage.getItem(DAILY_STORAGE_KEY)).not.toBeNull()
    localStorage.setItem('other-site', 'keep')

    await useLogout(gateway).logout()

    expect(localStorage.getItem(DAILY_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem('other-site')).toBe('keep')
    expect(useAuthSession(gateway).session.value).toBeNull()
  })

  it('`clearAppStorage` hanya menghapus key ber-prefix app (dipakai logout & hapus akun)', () => {
    localStorage.setItem(DAILY_STORAGE_KEY, '{}')
    localStorage.setItem('ip-theme', 'ungu')
    localStorage.setItem('other-site', 'keep')

    clearAppStorage(localStorage)

    expect(localStorage.getItem(DAILY_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem('ip-theme')).toBeNull()
    expect(localStorage.getItem('other-site')).toBe('keep')
  })
})

describe('quick add lintas hari (AC3)', () => {
  it('task quick add punya deadline 23:59 hari ini, tetap di To-do besok dan jadi terlambat', () => {
    const today = useDailyRoutine()
    today.addTodayTask('Bayar listrik')

    const added = today.todayList.value.find(({ task: item }) => item.title === 'Bayar listrik')
    expect(added).toBeDefined()
    expect(added?.isOverdue).toBe(false)
    expect(added?.task.deadline && toIsoDate(new Date(added.task.deadline))).toBe(TODAY)
    expect(new Date(added?.task.deadline ?? 0).getHours()).toBe(23)
    expect(new Date(added?.task.deadline ?? 0).getMinutes()).toBe(59)

    // Ganti hari: task yang sama tetap muncul sebagai terlambat, bukan hilang.
    useState<number>('now').value = fromIsoDate(addDays(TODAY, 1)).getTime() + 9 * MS_PER_HOUR
    const besok = useDailyRoutine()

    const overdue = besok.todayList.value.find(({ task: item }) => item.title === 'Bayar listrik')
    expect(overdue).toBeDefined()
    expect(overdue?.isOverdue).toBe(true)
  })
})
