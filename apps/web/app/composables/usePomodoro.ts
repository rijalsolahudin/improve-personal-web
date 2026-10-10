import {
  DEFAULT_POMODORO_CONFIG,
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
  selectPhase,
  sessionInCycle,
  startPomodoro,
  type FocusSession,
  type PomodoroConfig,
  type PomodoroPhase,
  type PomodoroSetting,
} from '~/utils/pomodoro'

/** Preferensi (bukan data sensitif) → localStorage, divalidasi saat dibaca. */
export const POMODORO_CONFIG_KEY = 'ip-pomo-config'
export const POMODORO_SOUND_KEY = 'ip-pomo-sound'
export const POMODORO_TARGET_MAX = 120
const DEFAULT_TARGET = 'Fokus'

export type PomodoroNotice = 'focusDone' | 'focusSkipped' | 'breakDone' | null
export type PomodoroTargetMode = 'task' | 'free'

function readStorage(key: string): string | null {
  if (!import.meta.client) return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage diblokir: preferensi berlaku untuk sesi ini saja.
  }
}

function readConfig(): PomodoroConfig {
  try {
    return parsePomodoroConfig(JSON.parse(readStorage(POMODORO_CONFIG_KEY) ?? 'null'))
  } catch {
    return { ...DEFAULT_POMODORO_CONFIG }
  }
}

/** Riwayat contoh fase 1 (design: dua sesi pagi ini). Diganti repository lokal (packages/core). */
function seedHistory(now: number): FocusSession[] {
  const at = (hour: number, minute: number): number => new Date(now).setHours(hour, minute, 0, 0)
  const sessions: FocusSession[] = [
    {
      id: 'p2',
      startedAt: at(10, 0),
      endedAt: at(10, 25),
      target: 'Kirim draft laporan',
      status: 'selesai',
    },
    {
      id: 'p1',
      startedAt: at(9, 30),
      endedAt: at(9, 55),
      target: 'Selesai modul 4 — VPC',
      status: 'selesai',
    },
  ]
  return sessions.filter((session) => session.endedAt <= now)
}

/**
 * State Pomodoro bersama (widget Home ↔ halaman F4). Penyelesaian fase otomatis ada di
 * `plugins/pomodoro.client.ts` (satu pengamat untuk seluruh app).
 */
export function usePomodoro() {
  const now = useNow()
  const config = useState<PomodoroConfig>('pomodoro-config', readConfig)
  const state = useState('pomodoro', () => createPomodoro(config.value))
  const target = useState<string | null>('pomodoro-target', () => null)
  const targetMode = useState<PomodoroTargetMode>('pomodoro-target-mode', () => 'task')
  const history = useState<FocusSession[]>('pomodoro-history', () => seedHistory(Date.now()))
  const isSoundOn = useState<boolean>(
    'pomodoro-sound',
    () => readStorage(POMODORO_SOUND_KEY) !== '0',
  )
  const notice = useState<PomodoroNotice>('pomodoro-notice', () => null)

  const remainingMs = computed(() => pomodoroRemaining(state.value, now.value))

  /** Akhiri fase berjalan; sesi fokus dicatat ke riwayat (selesai atau dilewati). */
  function finish(completed: boolean): void {
    const current = state.value
    const endedAt = Date.now()
    if (current.phase === 'focus' && current.startedAt !== null) {
      const session: FocusSession = {
        id: crypto.randomUUID(),
        startedAt: current.startedAt,
        endedAt,
        target: target.value ?? DEFAULT_TARGET,
        status: completed ? 'selesai' : 'dilewati',
      }
      history.value = [session, ...history.value]
    }
    notice.value =
      current.phase !== 'focus' ? 'breakDone' : completed ? 'focusDone' : 'focusSkipped'
    state.value = completePhase(current, config.value, completed)
  }

  function updateConfig(next: PomodoroConfig): void {
    config.value = next
    state.value = applyConfig(state.value, next)
    writeStorage(POMODORO_CONFIG_KEY, JSON.stringify(next))
  }

  return {
    config: readonly(config),
    phase: computed(() => state.value.phase),
    isRunning: computed(() => state.value.running),
    /** Sudah pernah dimulai di fase ini (untuk label "Lanjut"). */
    isStarted: computed(() => state.value.startedAt !== null),
    remainingMs,
    progress: computed(() => pomodoroProgress(state.value, config.value, now.value)),
    session: computed(() => sessionInCycle(state.value, config.value)),
    completedInCycle: computed(() => state.value.completedFocus % config.value.every),
    sessionsPerCycle: computed(() => config.value.every),
    target: readonly(target),
    targetMode: readonly(targetMode),
    history: readonly(history),
    focusMinutesToday: computed(() => focusMinutesOn(history.value, now.value)),
    isSoundOn: readonly(isSoundOn),
    notice: readonly(notice),
    toggle(): void {
      state.value = state.value.running
        ? pausePomodoro(state.value, Date.now())
        : startPomodoro(state.value, Date.now())
      notice.value = null
    },
    start(): void {
      state.value = startPomodoro(state.value, Date.now())
      notice.value = null
    },
    reset(): void {
      state.value = resetPomodoro(state.value, config.value)
    },
    skip(): void {
      finish(false)
    },
    finish,
    selectPhase(phase: PomodoroPhase): void {
      state.value = selectPhase(state.value, phase, config.value)
    },
    adjust(key: PomodoroSetting, direction: -1 | 1): void {
      updateConfig(adjustSetting(config.value, key, direction))
    },
    setTarget(label: string): void {
      target.value = label.trim().slice(0, POMODORO_TARGET_MAX) || null
    },
    setTargetMode(mode: PomodoroTargetMode): void {
      targetMode.value = mode
    },
    toggleSound(): void {
      isSoundOn.value = !isSoundOn.value
      writeStorage(POMODORO_SOUND_KEY, isSoundOn.value ? '1' : '0')
    },
    dismissNotice(): void {
      notice.value = null
    },
  }
}
