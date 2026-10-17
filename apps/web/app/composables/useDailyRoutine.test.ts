import { beforeEach, describe, expect, it } from 'vitest'

import { useDailyRoutine } from './useDailyRoutine'

describe('useDailyRoutine', () => {
  beforeEach(() => {
    clearNuxtState(['daily-routine', 'tasks', 'schedules', 'schedule-attendance', 'habits'])
  })

  it('centang dari Daily: task prioritas tetap tampil dicoret sampai ganti hari', () => {
    const { priorities, toggleTask } = useDailyRoutine()
    const first = priorities.value[0]
    if (!first) throw new Error('mock kosong')

    toggleTask(first.task.id)
    expect(priorities.value.find(({ task }) => task.id === first.task.id)?.task.done).toBe(true)
  })

  it('quick add tanpa deadline, tetap muncul di to-do hari ini', () => {
    const { addTodayTask, todayList } = useDailyRoutine()
    expect(addTodayTask('   ')).toBe(false)
    expect(addTodayTask('Bayar listrik')).toBe(true)

    const added = todayList.value.find(({ task }) => task.title === 'Bayar listrik')
    expect(added?.task.deadline).toBeNull()
    expect(added?.isOverdue).toBe(false)
  })

  it('langkah rutinitas bisa dicentang dan menaikkan progres', () => {
    const { currentBlock, toggleRoutineItem, progress } = useDailyRoutine()
    const item = currentBlock.value.nextItem
    if (!item) throw new Error('blok sekarang kosong')
    const before = progress.value.done

    toggleRoutineItem(item)
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
})
