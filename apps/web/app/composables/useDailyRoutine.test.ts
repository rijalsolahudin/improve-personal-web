import { beforeEach, describe, expect, it } from 'vitest'

import type { RoutineStep } from '~/utils/dailyRoutine'
import { parseDailyDays } from '~/utils/dailyRoutine'
import { MS_PER_HOUR, toIsoDate } from '~/utils/time'

import { DAILY_STORAGE_KEY, useDailyRoutine } from './useDailyRoutine'
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

  it('task prioritas tanpa deadline hanya tampil di panel Prioritas, tidak dobel di To-do', () => {
    const { add, setQuadrant } = useTasks()
    const doId = add('Rapikan meja', 'medium', null)
    const urgentId = add('Bayar pajak', 'urgent', null)
    const lateId = add('Kirim laporan', 'medium', Date.now() - MS_PER_HOUR)
    if (!doId || !urgentId || !lateId) throw new Error('task uji tidak terbentuk')
    setQuadrant(doId, 'do')

    const { priorities, todayList } = useDailyRoutine()

    expect(priorities.value.map(({ task }) => task.id)).toEqual([doId, urgentId])
    // Task ber-deadline hari ini tetap di To-do; dua task prioritas di atas tidak muncul lagi.
    expect(todayList.value.map(({ task }) => task.id)).toEqual([lateId])
    const overlap = priorities.value.filter(({ task }) =>
      todayList.value.some(({ task: todo }) => todo.id === task.id),
    )
    expect(overlap).toEqual([])
  })

  it('centang task prioritas dicatat per hari, jadi tidak hilang dari panel setelah diklik', () => {
    const { add, setQuadrant } = useTasks()
    const id = add('Rapikan meja', 'medium', null)
    if (!id) throw new Error('task uji tidak terbentuk')
    setQuadrant(id, 'do')

    const { priorities, toggleTask, todayList } = useDailyRoutine()
    toggleTask(id)

    expect(priorities.value.map(({ task }) => task.id)).toEqual([id])
    expect(priorities.value[0]?.task.done).toBe(true)
    // Tetap tidak dobel di To-do walau sudah selesai.
    expect(todayList.value.map(({ task }) => task.id)).not.toContain(id)
  })

  it('progres hari menghitung task prioritas sekali, bukan dua kali (prioritas + to-do lepas)', () => {
    const { add } = useTasks()
    const routine = useDailyRoutine()
    const before = routine.progress.value

    // Task ber-deadline hari ini juga memenuhi syarat To-do: tanpa `excludeIds` ia akan
    // terhitung di dua daftar. Progres harus naik satu, bukan dua.
    const id = add('Kirim laporan', 'urgent', Date.now())
    if (!id) throw new Error('task uji tidak terbentuk')
    expect(useDailyRoutine().priorities.value.map(({ task }) => task.id)).toContain(id)

    const after = useDailyRoutine().progress.value
    expect(after.total).toBe(before.total + 1)

    useDailyRoutine().toggleTask(id)
    expect(useDailyRoutine().progress.value.done).toBe(before.done + 1)
  })

  it('quick add tanpa deadline (PRD F12): tetap muncul di to-do karena id dicatat hari ini', () => {
    const { addTodayTask, todayList } = useDailyRoutine()
    expect(addTodayTask('   ')).toBe(false)
    expect(addTodayTask('Bayar listrik')).toBe(true)

    const added = todayList.value.find(({ task }) => task.title === 'Bayar listrik')
    if (!added) throw new Error('task hasil quick add tidak muncul di to-do hari ini')
    expect(added.task.deadline).toBeNull()
    expect(added.isOverdue).toBe(false)

    const today = toIsoDate(new Date())
    const stored = parseDailyDays(JSON.parse(localStorage.getItem(DAILY_STORAGE_KEY) ?? 'null'))
    expect(stored[today]?.addedTaskIds).toContain(added.task.id)
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
