import { beforeEach, describe, expect, it } from 'vitest'

import type { RoutineStep } from '~/utils/dailyRoutine'
import { END_OF_DAY, deadlineFrom } from '~/utils/tasks'
import { toIsoDate } from '~/utils/time'

import { useDailyRoutine } from './useDailyRoutine'
import { useTasks } from './useTasks'

describe('useDailyRoutine', () => {
  beforeEach(() => {
    localStorage.clear()
    clearNuxtState(['daily-routine', 'tasks', 'schedules', 'schedule-attendance', 'habits'])
  })

  it('centang dari Daily: task prioritas tetap tampil dicoret sampai ganti hari', () => {
    // Data task sekarang datang dari penyimpanan, bukan mock: test ini menyemai satu task sendiri
    // (kuadran "do" selalu masuk Prioritas) supaya tidak bergantung pada isi mock.
    const { add, setQuadrant } = useTasks()
    const seededId = add('Selesaikan modul 4', 'urgent', null)
    if (!seededId) throw new Error('task uji tidak terbentuk')
    setQuadrant(seededId, 'do')

    const { priorities, toggleTask } = useDailyRoutine()
    const first = priorities.value[0]
    if (!first) throw new Error('prioritas kosong setelah disemai')

    toggleTask(first.task.id)
    expect(priorities.value.find(({ task }) => task.id === first.task.id)?.task.done).toBe(true)
  })

  it('quick add memakai deadline akhir hari ini (PRD F12), jadi tetap muncul di to-do', () => {
    const { addTodayTask, todayList } = useDailyRoutine()
    expect(addTodayTask('   ')).toBe(false)
    expect(addTodayTask('Bayar listrik')).toBe(true)

    const today = toIsoDate(new Date())
    const added = todayList.value.find(({ task }) => task.title === 'Bayar listrik')
    expect(added?.task.deadline).toBe(deadlineFrom(today, END_OF_DAY))
    expect(added?.isOverdue).toBe(false)
  })

  it('langkah rutinitas bisa dicentang dan menaikkan progres', () => {
    // Langkah rutinitas tidak lagi disemai mock: test menyuntik satu langkah sendiri untuk
    // membuktikan perilaku centang + progres tetap benar.
    const { currentBlock, toggleRoutineItem, progress } = useDailyRoutine()
    const block = currentBlock.value.block
    const step: RoutineStep = { id: 'qa-step', title: 'Langkah QA', block }
    const store = useState<{ steps: readonly RoutineStep[] }>('daily-routine')
    store.value = { ...store.value, steps: [step] }

    const before = progress.value.done
    toggleRoutineItem({ kind: 'step', id: step.id, title: step.title, isDone: false })
    expect(progress.value.done).toBe(before + 1)
    expect(currentBlock.value.done).toBeGreaterThan(0)
  })

  it('cuaca manual per hari bisa dipilih & dikosongkan', () => {
    const { weather, setWeather } = useDailyRoutine()
    expect(weather.value).toBeNull()
    setWeather('hujan')
    expect(weather.value).toBe('hujan')
    setWeather(null)
    expect(weather.value).toBeNull()
  })

  it('centang & cuaca bertahan setelah state halaman dimuat ulang (B3)', () => {
    const { add, setQuadrant } = useTasks()
    const id = add('Selesaikan modul 4', 'urgent', null)
    if (!id) throw new Error('task uji tidak terbentuk')
    setQuadrant(id, 'do')

    const first = useDailyRoutine()
    first.toggleTask(id)
    first.setWeather('hujan')

    // Reload: state `useState` kosong lagi, yang tersisa hanya data di localStorage.
    clearNuxtState(['daily-routine'])
    const afterReload = useDailyRoutine()

    expect(afterReload.priorities.value.find(({ task }) => task.id === id)?.task.done).toBe(true)
    expect(afterReload.weather.value).toBe('hujan')
  })
})
