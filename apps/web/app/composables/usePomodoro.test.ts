import { beforeEach, describe, expect, it } from 'vitest'

import { POMODORO_CONFIG_KEY, usePomodoro } from './usePomodoro'

describe('usePomodoro', () => {
  beforeEach(() => {
    localStorage.clear()
    clearNuxtState([
      'pomodoro',
      'pomodoro-config',
      'pomodoro-target',
      'pomodoro-history',
      'pomodoro-sound',
      'pomodoro-notice',
    ])
    // Isi ulang langsung: plugin pomodoro global ikut membaca state ini di tick berikutnya.
    usePomodoro()
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
})
