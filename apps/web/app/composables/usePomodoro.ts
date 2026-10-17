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
  type PomodoroTargetKind,
  type PomodoroTargetMode,
} from '~/utils/pomodoro'
import { MS_PER_MINUTE } from '~/utils/time'

/** Preferensi (bukan data sensitif) → localStorage, divalidasi saat dibaca. */
export const POMODORO_CONFIG_KEY = 'ip-pomo-config'
export const POMODORO_SOUND_KEY = 'ip-pomo-sound'
export const POMODORO_TARGET_MAX = 120
const DEFAULT_TARGET = 'Fokus'

export type PomodoroNotice = 'focusDone' | 'focusSkipped' | 'breakDone' | null

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

/** Riwayat contoh fase 1 (design: dua sesi pagi ini + riwayat hari sebelumnya). Diganti repository lokal (packages/core). */
const HISTORY_DAYS = 90
const HISTORY_TARGETS = [
  'Belajar AWS',
  'Nulis laporan',
  'Baca buku',
  'Latihan soal',
  'Rapikan catatan',
]
const HISTORY_DURATIONS = [25, 25, 25, 50]

function seedHistory(now: number): FocusSession[] {
  const at = (dayOffset: number, hour: number, minute: number): number =>
    new Date(new Date(now).setDate(new Date(now).getDate() - dayOffset)).setHours(
      hour,
      minute,
      0,
      0,
    )
  const sessions: FocusSession[] = [
    {
      id: 'p2',
      startedAt: at(0, 10, 0),
      endedAt: at(0, 10, 25),
      target: 'Kirim draft laporan',
      status: 'selesai',
    },
    {
      id: 'p1',
      startedAt: at(0, 9, 30),
      endedAt: at(0, 9, 55),
      target: 'Selesai modul 4 — VPC',
      status: 'selesai',
    },
  ]
  // Riwayat deterministik (pseudo-random ber-seed) untuk hari-hari sebelumnya.
  let seed = 20_261_011
  const random = (): number => {
    seed = (seed * 9301 + 49_297) % 233_280
    return seed / 233_280
  }
  for (let offset = 1; offset <= HISTORY_DAYS; offset += 1) {
    const count = Math.floor(random() * 5)
    for (let index = 0; index < count; index += 1) {
      const startedAt = at(
        offset,
        7 + Math.floor(random() * 14),
        [0, 15, 30, 45][Math.floor(random() * 4)] ?? 0,
      )
      const duration = HISTORY_DURATIONS[Math.floor(random() * HISTORY_DURATIONS.length)] ?? 25
      sessions.push({
        id: `p${offset}-${index}`,
        startedAt,
        endedAt: startedAt + duration * MS_PER_MINUTE,
        target: HISTORY_TARGETS[Math.floor(random() * HISTORY_TARGETS.length)] ?? 'Fokus',
        status: 'selesai',
      })
    }
  }
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
  const targetKind = useState<PomodoroTargetKind | null>('pomodoro-target-kind', () => null)
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
    targetKind: readonly(targetKind),
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
    /** `kind` kosong = asal tidak diketahui (mis. tombol "▶ Fokus" dari halaman lain). */
    setTarget(label: string, kind: PomodoroTargetKind | null = null): void {
      target.value = label.trim().slice(0, POMODORO_TARGET_MAX) || null
      targetKind.value = target.value ? kind : null
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
