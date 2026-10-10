import { MS_PER_MINUTE } from './time'

/**
 * State mesin Pomodoro (murni, waktu di-inject). Sisa waktu dihitung dari `endsAt`, bukan
 * dari interval, supaya tetap akurat saat tab di-background (PRD F4, ARCHITECTURE §10).
 */

export type PomodoroPhase = 'focus' | 'short' | 'long'

export interface PomodoroConfig {
  /** Durasi dalam menit. */
  focus: number
  short: number
  long: number
  /** Jumlah sesi fokus sebelum istirahat panjang. */
  every: number
}

export interface PomodoroState {
  phase: PomodoroPhase
  running: boolean
  /** Epoch ms saat fase berakhir; hanya terisi saat `running`. */
  endsAt: number | null
  /** Sisa waktu saat dijeda. */
  remainingMs: number
  completedFocus: number
  /** Epoch ms pertama kali fase ini dimulai (untuk durasi aktual di riwayat). */
  startedAt: number | null
}

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = { focus: 25, short: 5, long: 15, every: 4 }

export function phaseDuration(phase: PomodoroPhase, config: PomodoroConfig): number {
  return config[phase] * MS_PER_MINUTE
}

export function createPomodoro(config: PomodoroConfig, completedFocus = 0): PomodoroState {
  return {
    phase: 'focus',
    running: false,
    endsAt: null,
    remainingMs: phaseDuration('focus', config),
    completedFocus,
    startedAt: null,
  }
}

export function pomodoroRemaining(state: PomodoroState, now: number): number {
  if (state.running && state.endsAt !== null) return Math.max(0, state.endsAt - now)
  return state.remainingMs
}

/** Progres fase berjalan, 0–1. */
export function pomodoroProgress(
  state: PomodoroState,
  config: PomodoroConfig,
  now: number,
): number {
  const total = phaseDuration(state.phase, config)
  return Math.min(1, Math.max(0, 1 - pomodoroRemaining(state, now) / total))
}

export function startPomodoro(state: PomodoroState, now: number): PomodoroState {
  if (state.running) return state
  return {
    ...state,
    running: true,
    endsAt: now + state.remainingMs,
    startedAt: state.startedAt ?? now,
  }
}

export function pausePomodoro(state: PomodoroState, now: number): PomodoroState {
  if (!state.running) return state
  return { ...state, running: false, endsAt: null, remainingMs: pomodoroRemaining(state, now) }
}

export function resetPomodoro(state: PomodoroState, config: PomodoroConfig): PomodoroState {
  return {
    ...state,
    running: false,
    endsAt: null,
    remainingMs: phaseDuration(state.phase, config),
    startedAt: null,
  }
}

/**
 * Selesaikan fase: fokus → istirahat (panjang tiap `every` sesi), istirahat → fokus.
 * `completed = false` (Skip): sesi fokus tidak dihitung, lanjut istirahat pendek.
 */
export function completePhase(
  state: PomodoroState,
  config: PomodoroConfig,
  completed = true,
): PomodoroState {
  if (state.phase === 'focus') {
    const completedFocus = state.completedFocus + (completed ? 1 : 0)
    const phase: PomodoroPhase = completed && completedFocus % config.every === 0 ? 'long' : 'short'
    return {
      phase,
      running: false,
      endsAt: null,
      remainingMs: phaseDuration(phase, config),
      completedFocus,
      startedAt: null,
    }
  }
  return {
    phase: 'focus',
    running: false,
    endsAt: null,
    remainingMs: phaseDuration('focus', config),
    completedFocus: state.phase === 'long' ? 0 : state.completedFocus,
    startedAt: null,
  }
}

/** Pilih fase manual (design: tab fase); diabaikan saat timer jalan. */
export function selectPhase(
  state: PomodoroState,
  phase: PomodoroPhase,
  config: PomodoroConfig,
): PomodoroState {
  if (state.running) return state
  return {
    ...state,
    phase,
    endsAt: null,
    remainingMs: phaseDuration(phase, config),
    startedAt: null,
  }
}

/** Setelah pengaturan berubah: fase yang belum jalan ikut durasi baru. */
export function applyConfig(state: PomodoroState, config: PomodoroConfig): PomodoroState {
  if (state.running || state.startedAt !== null) return state
  return { ...state, remainingMs: phaseDuration(state.phase, config) }
}

// ---- Pengaturan ----------------------------------------------------------------------

export type PomodoroSetting = keyof PomodoroConfig

/** Batas & langkah tiap pengaturan (design): [min, max, step]. */
export const POMODORO_LIMITS: Record<PomodoroSetting, readonly [number, number, number]> = {
  focus: [5, 90, 5],
  short: [1, 30, 1],
  long: [5, 60, 5],
  every: [2, 8, 1],
}

export const POMODORO_SETTINGS = Object.keys(POMODORO_LIMITS) as PomodoroSetting[]

export function adjustSetting(
  config: PomodoroConfig,
  key: PomodoroSetting,
  direction: -1 | 1,
): PomodoroConfig {
  const [min, max, step] = POMODORO_LIMITS[key]
  return { ...config, [key]: Math.min(max, Math.max(min, config[key] + direction * step)) }
}

/** Validasi pengaturan dari storage (data tak tepercaya): di luar batas di-clamp, rusak → default. */
export function parsePomodoroConfig(raw: unknown): PomodoroConfig {
  const data = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const config = { ...DEFAULT_POMODORO_CONFIG }
  for (const key of POMODORO_SETTINGS) {
    const value = data[key]
    const [min, max] = POMODORO_LIMITS[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      config[key] = Math.min(max, Math.max(min, Math.round(value)))
    }
  }
  return config
}

// ---- Riwayat -------------------------------------------------------------------------

export interface FocusSession {
  id: string
  startedAt: number
  endedAt: number
  /** Judul task atau teks bebas. */
  target: string
  status: 'selesai' | 'dilewati'
}

export function sessionMinutes(session: FocusSession): number {
  return Math.max(0, Math.round((session.endedAt - session.startedAt) / MS_PER_MINUTE))
}

/** Menit fokus yang benar-benar selesai di hari yang sama dengan `now`. */
export function focusMinutesOn(sessions: readonly FocusSession[], now: number): number {
  const day = new Date(now).toDateString()
  return sessions
    .filter((session) => session.status === 'selesai')
    .filter((session) => new Date(session.endedAt).toDateString() === day)
    .reduce((sum, session) => sum + sessionMinutes(session), 0)
}

/** Nomor sesi dalam siklus, 1..every (mis. "3/4"). */
export function sessionInCycle(state: PomodoroState, config: PomodoroConfig): number {
  return Math.min((state.completedFocus % config.every) + 1, config.every)
}
