import { describe, expect, it } from 'vitest'

import {
  DEFAULT_POMODORO_CONFIG as CONFIG,
  adjustSetting,
  applyConfig,
  completePhase,
  createPomodoro,
  focusMinutesOn,
  parsePomodoroConfig,
  pausePomodoro,
  pomodoroProgress,
  pomodoroRemaining,
  resetPomodoro,
  searchTargetOptions,
  selectPhase,
  sessionInCycle,
  startPomodoro,
  uniqueTargetOptions,
  type FocusSession,
} from './pomodoro'
import { MS_PER_MINUTE } from './time'

const T0 = 1_000_000

describe('pomodoro', () => {
  it('mulai dari fase fokus penuh dan belum jalan', () => {
    const state = createPomodoro(CONFIG)
    expect(state.phase).toBe('focus')
    expect(pomodoroRemaining(state, T0)).toBe(25 * MS_PER_MINUTE)
    expect(sessionInCycle(state, CONFIG)).toBe(1)
  })

  it('sisa waktu dihitung dari endsAt (akurat walau tab di-background)', () => {
    const running = startPomodoro(createPomodoro(CONFIG), T0)
    expect(pomodoroRemaining(running, T0 + 10 * MS_PER_MINUTE)).toBe(15 * MS_PER_MINUTE)
    expect(pomodoroProgress(running, CONFIG, T0 + 10 * MS_PER_MINUTE)).toBeCloseTo(0.4)
    expect(pomodoroRemaining(running, T0 + 99 * MS_PER_MINUTE)).toBe(0)
  })

  it('jeda menyimpan sisa, lanjut meneruskan dari sisa itu', () => {
    const paused = pausePomodoro(startPomodoro(createPomodoro(CONFIG), T0), T0 + MS_PER_MINUTE)
    expect(paused.running).toBe(false)
    expect(pomodoroRemaining(paused, T0 + 50 * MS_PER_MINUTE)).toBe(24 * MS_PER_MINUTE)
    const resumed = startPomodoro(paused, T0 + 50 * MS_PER_MINUTE)
    expect(pomodoroRemaining(resumed, T0 + 51 * MS_PER_MINUTE)).toBe(23 * MS_PER_MINUTE)
  })

  it('reset mengembalikan durasi penuh fase sekarang', () => {
    const reset = resetPomodoro(startPomodoro(createPomodoro(CONFIG), T0), CONFIG)
    expect(reset.running).toBe(false)
    expect(reset.remainingMs).toBe(25 * MS_PER_MINUTE)
  })

  it('istirahat panjang tiap 4 sesi fokus, lalu siklus mulai lagi', () => {
    let state = createPomodoro(CONFIG, 2)
    state = completePhase(state, CONFIG)
    expect(state.phase).toBe('short')
    state = completePhase(state, CONFIG)
    expect(state.phase).toBe('focus')
    expect(sessionInCycle(state, CONFIG)).toBe(4)
    state = completePhase(state, CONFIG)
    expect(state.phase).toBe('long')
    expect(state.remainingMs).toBe(15 * MS_PER_MINUTE)
    state = completePhase(state, CONFIG)
    expect(state).toMatchObject({ phase: 'focus', completedFocus: 0 })
  })
})

describe('pomodoro: skip, pilih fase, pengaturan, riwayat', () => {
  it('skip fokus tidak dihitung & lanjut istirahat pendek; istirahat panjang reset siklus', () => {
    const skipped = completePhase(createPomodoro(CONFIG, 3), CONFIG, false)
    expect(skipped).toMatchObject({ phase: 'short', completedFocus: 3 })
    const long = completePhase(createPomodoro(CONFIG, 3), CONFIG)
    expect(long.phase).toBe('long')
    expect(completePhase(long, CONFIG).completedFocus).toBe(0)
  })

  it('pilih fase cuma saat diam; startedAt diisi saat mulai', () => {
    const idle = selectPhase(createPomodoro(CONFIG), 'short', CONFIG)
    expect(pomodoroRemaining(idle, T0)).toBe(5 * MS_PER_MINUTE)
    const running = startPomodoro(idle, T0)
    expect(running.startedAt).toBe(T0)
    expect(selectPhase(running, 'long', CONFIG)).toBe(running)
    const resumed = startPomodoro(pausePomodoro(running, T0 + 1000), T0 + 5000)
    expect(resumed.startedAt).toBe(T0)
  })

  it('pengaturan dibatasi & durasi fase diam ikut berubah', () => {
    expect(adjustSetting(CONFIG, 'focus', 1).focus).toBe(30)
    expect(adjustSetting({ ...CONFIG, every: 8 }, 'every', 1).every).toBe(8)
    expect(adjustSetting({ ...CONFIG, short: 1 }, 'short', -1).short).toBe(1)
    const longer = { ...CONFIG, focus: 50 }
    expect(pomodoroRemaining(applyConfig(createPomodoro(CONFIG), longer), T0)).toBe(
      50 * MS_PER_MINUTE,
    )
    const started = startPomodoro(createPomodoro(CONFIG), T0)
    expect(applyConfig(started, longer)).toBe(started)
  })

  it('parse pengaturan dari storage', () => {
    expect(parsePomodoroConfig(null)).toEqual(CONFIG)
    expect(parsePomodoroConfig({ focus: 500, short: 'x', every: 3.4 })).toEqual({
      ...CONFIG,
      focus: 90,
      every: 3,
    })
  })

  it('menit fokus hari ini cuma dari sesi selesai di hari yang sama', () => {
    const day = new Date(2026, 9, 10, 12).getTime()
    const sessions: FocusSession[] = [
      {
        id: 'a',
        startedAt: day - 25 * MS_PER_MINUTE,
        endedAt: day,
        target: 'x',
        status: 'selesai',
      },
      {
        id: 'b',
        startedAt: day - 10 * MS_PER_MINUTE,
        endedAt: day,
        target: 'x',
        status: 'dilewati',
      },
      {
        id: 'c',
        startedAt: day - 86_400_000,
        endedAt: day - 86_000_000,
        target: 'x',
        status: 'selesai',
      },
    ]
    expect(focusMinutesOn(sessions, day)).toBe(25)
  })
})

describe('pomodoro: pilihan target fokus', () => {
  const option = (label: string, meta = '') => ({ label, color: '#000', meta })

  it('buang judul kosong & duplikat, urutan asli tetap', () => {
    expect(
      uniqueTargetOptions([option('Lari'), option(''), option('Baca'), option('Lari', 'x')]).map(
        (item) => item.label,
      ),
    ).toEqual(['Lari', 'Baca'])
  })

  it('cari tanpa peduli huruf besar; query kosong = semua', () => {
    const options = [option('Kirim draft laporan'), option('Baca buku')]
    expect(searchTargetOptions(options, '  LAPORAN ').map((item) => item.label)).toEqual([
      'Kirim draft laporan',
    ])
    expect(searchTargetOptions(options, '')).toHaveLength(2)
  })
})
