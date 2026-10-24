import type { Clock } from '@improve-personal/core'

import {
  DEFAULT_POMODORO_CONFIG,
  POMODORO_TARGET_MODES,
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
  type PomodoroState,
  type PomodoroTargetKind,
  type PomodoroTargetMode,
} from '~/utils/pomodoro'
import type { LocalDataSession } from '~/utils/storage/session'
import {
  isReloadSessionActive,
  readAfterWrites,
  registerSyncReloader,
  reloadSession,
} from '~/utils/sync/refresh'
import { createUuidV7Generator } from '~/utils/storage/uuid'

import { useLocalData } from './useLocalData'

/** Preferensi & state timer aktif (bukan data sensitif) → localStorage, divalidasi saat dibaca. */
export const POMODORO_CONFIG_KEY = 'ip-pomo-config'
export const POMODORO_STATE_KEY = 'ip-pomo-state'
export const POMODORO_SOUND_KEY = 'ip-pomo-sound'
export const POMODORO_TARGET_MAX = 120
const DEFAULT_TARGET = 'Fokus'
const PHASES: readonly PomodoroPhase[] = ['focus', 'short', 'long']

/**
 * Jam untuk generator UUIDv7.
 *
 * Ditulis lokal, bukan `createSystemClock()` dari core: `usePomodoro` dipanggil plugin yang jalan di
 * SETIAP rute (termasuk landing yang tidak punya timer), dan mengimpor barrel core hanya untuk
 * `Date.now()` menyeret skema zod + repository ke JS awal - 11 KB gzip untuk fitur yang tidak dipakai
 * di sana. Pola yang sama ada di `utils/device-installation.ts`.
 */
const SYSTEM_CLOCK: Clock = {
  nowMs: () => Date.now(),
  monotonicMs: () => Date.now(),
}

type PomodoroPersistence = typeof import('~/utils/pomodoro/persistence')

/**
 * Persistensi riwayat dimuat malas, alasannya sama dengan jam di atas: modul itu menarik skema
 * `pomodoro_session` + `createRepository` dari core, sedangkan riwayat baru dibaca/ditulis setelah
 * dashboard terbuka. Kedua pemanggilnya sudah async, jadi tidak ada perubahan perilaku.
 */
let persistenceModule: Promise<PomodoroPersistence> | null = null

function loadPersistence(): Promise<PomodoroPersistence> {
  persistenceModule ??= import('~/utils/pomodoro/persistence')
  return persistenceModule
}

export type PomodoroNotice = 'focusDone' | 'focusSkipped' | 'breakDone' | null

export type UsePomodoroOptions = {
  /** Sumber sesi; disuntik di test supaya bisa memakai adaptor memori core. */
  readonly session?: () => Promise<LocalDataSession | null>
}

let historyInFlight: Promise<void> | null = null
/** Reload setelah pull; satu pun untuk seluruh komponen. */
let reloadInFlight: Promise<void> | null = null
/** Antrean tulis riwayat: sesi yang selesai berurutan, dan reload menunggu antrean ini kosong. */
let historyQueue: Promise<void> = Promise.resolve()

/** Dipakai test supaya hydrate riwayat antar kasus tidak saling mewarisi. */
export function resetPomodoroHistoryForTest(): void {
  historyInFlight = null
  reloadInFlight = null
  historyQueue = Promise.resolve()
}

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

type PomodoroTarget = {
  readonly target: string | null
  readonly targetKind: PomodoroTargetKind | null
  readonly targetMode: PomodoroTargetMode
}

type StoredTimer = PomodoroTarget & { readonly state: PomodoroState }

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * Baca state timer aktif dari localStorage.
 *
 * Ini yang membuat sesi yang sedang berjalan tetap ada setelah refresh: `endsAt` disimpan, bukan
 * sisa waktu, jadi timer tetap akurat walau halaman ditutup beberapa lama. Data tak dikenal
 * diabaikan (mulai dari state baru), bukan dipercaya mentah.
 */
function readTimer(): StoredTimer | null {
  const raw = readStorage(POMODORO_STATE_KEY)
  if (raw === null) return null

  try {
    const data = JSON.parse(raw) as Record<string, unknown>
    const state = data.state as Record<string, unknown> | undefined
    if (typeof state !== 'object' || state === null) return null
    if (!PHASES.includes(state.phase as PomodoroPhase)) return null
    if (typeof state.running !== 'boolean') return null
    if (state.endsAt !== null && !isFiniteNumber(state.endsAt)) return null
    if (state.running && state.endsAt === null) return null
    if (!isFiniteNumber(state.remainingMs) || state.remainingMs < 0) return null
    if (!isFiniteNumber(state.completedFocus) || state.completedFocus < 0) return null
    if (state.startedAt !== null && !isFiniteNumber(state.startedAt)) return null

    const targetMode = POMODORO_TARGET_MODES.includes(data.targetMode as PomodoroTargetMode)
      ? (data.targetMode as PomodoroTargetMode)
      : 'task'
    const targetKind =
      data.targetKind === 'task' ||
      data.targetKind === 'jadwal' ||
      data.targetKind === 'habit' ||
      data.targetKind === 'teks'
        ? (data.targetKind as PomodoroTargetKind)
        : null
    const target =
      typeof data.target === 'string' && data.target.trim()
        ? data.target.slice(0, POMODORO_TARGET_MAX)
        : null

    return {
      state: {
        phase: state.phase as PomodoroPhase,
        running: state.running,
        endsAt: state.endsAt as number | null,
        remainingMs: state.remainingMs,
        completedFocus: Math.trunc(state.completedFocus),
        startedAt: state.startedAt as number | null,
      },
      target,
      targetKind: target === null ? null : targetKind,
      targetMode,
    }
  } catch {
    return null
  }
}

/**
 * State Pomodoro bersama (widget Home ↔ halaman F4). Penyelesaian fase otomatis ada di
 * `plugins/pomodoro.client.ts` (satu pengamat untuk seluruh app).
 *
 * Riwayat sesi disimpan ke record `pomodoro_session` (IndexedDB terenkripsi), bukan lagi data
 * contoh. Timer sendiri tetap dihitung dari timestamp (`endsAt`) supaya akurat saat tab background.
 */
export function usePomodoro(options: UsePomodoroOptions = {}) {
  const localData = useLocalData()
  const getSession = options.session ?? localData.ensure

  const now = useNow()
  const config = useState<PomodoroConfig>('pomodoro-config', readConfig)

  // State timer terakhir (termasuk sesi yang sedang berjalan) supaya refresh tidak menghapusnya.
  const stored = readTimer()
  const state = useState('pomodoro', () => stored?.state ?? createPomodoro(config.value))
  const target = useState<string | null>('pomodoro-target', () => stored?.target ?? null)
  const targetMode = useState<PomodoroTargetMode>(
    'pomodoro-target-mode',
    () => stored?.targetMode ?? 'task',
  )
  const targetKind = useState<PomodoroTargetKind | null>(
    'pomodoro-target-kind',
    () => stored?.targetKind ?? null,
  )
  const history = useState<FocusSession[]>('pomodoro-history', () => [])
  const historyStatus = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'pomodoro-history-status',
    () => 'idle',
  )
  const historyError = useState<string | null>('pomodoro-history-error', () => null)
  const isSoundOn = useState<boolean>(
    'pomodoro-sound',
    () => readStorage(POMODORO_SOUND_KEY) !== '0',
  )
  const notice = useState<PomodoroNotice>('pomodoro-notice', () => null)

  const newSessionId = createUuidV7Generator({ clock: SYSTEM_CLOCK })

  /**
   * Majukan jam global ke waktu aksi. `now` hanya di-tick tiap detik, jadi tanpa ini sisa waktu
   * (`endsAt - now`) sesaat setelah Mulai tampil lebih besar hingga satu detik.
   */
  function syncNow(): number {
    const at = Date.now()
    now.value = at
    return at
  }

  const isTargetLocked = computed(
    () => state.value.phase === 'focus' && state.value.startedAt !== null,
  )

  const remainingMs = computed(() => pomodoroRemaining(state.value, now.value))

  /** Simpan state aktif; `endsAt` yang membuat timer tetap benar setelah refresh. */
  function saveTimer(): void {
    writeStorage(
      POMODORO_STATE_KEY,
      JSON.stringify({
        state: state.value,
        target: target.value,
        targetKind: targetKind.value,
        targetMode: targetMode.value,
      }),
    )
  }

  /**
   * Baca riwayat lalu gabungkan dengan sesi yang sudah ada di memori, TANPA menulis state.
   *
   * Riwayat bersifat append-only dan sesi lokal yang belum tersimpan tidak boleh hilang, jadi versi
   * memori yang menang untuk id yang sama.
   */
  async function read(session: LocalDataSession): Promise<FocusSession[]> {
    const { loadFocusSessions } = await loadPersistence()
    const loaded = await loadFocusSessions(session, Date.now())
    const byId = new Map<string, FocusSession>()
    for (const item of [...loaded, ...history.value]) byId.set(item.id, item)
    return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt)
  }

  function apply(loaded: FocusSession[]): void {
    history.value = loaded
  }

  async function load(session: LocalDataSession): Promise<void> {
    apply(await read(session))
  }

  /**
   * Muat riwayat sekali per muat halaman. Hasil yang sudah ada di memori ikut dipertahankan supaya
   * sesi yang baru selesai sebelum hydrate tidak hilang.
   */
  function hydrate(): Promise<void> {
    if (historyStatus.value === 'ready') return Promise.resolve()

    historyInFlight ??= (async () => {
      historyStatus.value = 'loading'
      try {
        const session = await getSession()
        if (session === null) {
          historyStatus.value = 'idle'
          return
        }

        await load(session)
        historyStatus.value = 'ready'
        historyError.value = null
      } catch (cause) {
        historyStatus.value = 'error'
        historyError.value =
          cause instanceof Error ? cause.message : 'riwayat pomodoro tidak bisa dimuat'
        historyInFlight = null
      }
    })()

    return historyInFlight
  }

  /**
   * Muat ulang riwayat setelah pull menerapkan sesi dari perangkat lain.
   *
   * Hanya riwayat yang record-backed; timer & preferensi tetap di `localStorage` (state perangkat,
   * bukan data yang disinkronkan). `historyStatus` tidak diubah ke `loading` supaya daftar tidak
   * berkedip, dan antrean tulis ditunggu supaya sesi yang baru selesai tidak tertimpa.
   */
  function reload(): Promise<void> {
    if (historyStatus.value === 'idle') return Promise.resolve()

    reloadInFlight ??= (async () => {
      try {
        const target = await reloadSession(localData.current, getSession)
        if (target === null) return

        const loaded = await readAfterWrites(
          () => historyQueue,
          () => read(target.session),
        )

        // Sesi bisa berganti pemilik selama pembacaan (lihat `isReloadSessionActive`).
        if (!isReloadSessionActive(target, localData.current)) return

        apply(loaded)
        historyStatus.value = 'ready'
        historyError.value = null
      } catch (cause) {
        historyStatus.value = 'error'
        historyError.value =
          cause instanceof Error ? cause.message : 'riwayat pomodoro tidak bisa dimuat'
      } finally {
        reloadInFlight = null
      }
    })()

    return reloadInFlight
  }

  function persistHistory(session: FocusSession): void {
    historyQueue = historyQueue.then(async () => {
      try {
        const local = await getSession()
        if (local === null) return

        const { persistFocusSession } = await loadPersistence()
        await persistFocusSession(local, session)
        historyError.value = null
      } catch (cause) {
        historyStatus.value = 'error'
        historyError.value =
          cause instanceof Error ? cause.message : 'riwayat pomodoro tidak bisa disimpan'
      }
    })
    void historyQueue
  }

  /**
   * Akhiri fase berjalan; sesi fokus dicatat ke riwayat (selesai atau dilewati).
   * `endedAt` bisa diisi `endsAt` saat fase ternyata sudah berakhir selagi app ditutup,
   * supaya durasi riwayat tidak membengkak sebesar lama app tidak dibuka.
   */
  function finish(completed: boolean, endedAt = Date.now()): void {
    const current = state.value
    recordFocus(current, completed, endedAt)
    notice.value =
      current.phase !== 'focus' ? 'breakDone' : completed ? 'focusDone' : 'focusSkipped'
    state.value = completePhase(current, config.value, completed)
    saveTimer()
  }

  /** Sesi fokus yang sudah dimulai dicatat ke riwayat atas nama target saat ini. */
  function recordFocus(current: PomodoroState, completed: boolean, endedAt: number): void {
    if (current.phase !== 'focus' || current.startedAt === null) return
    const session: FocusSession = {
      id: newSessionId(),
      startedAt: current.startedAt,
      endedAt,
      target: target.value ?? DEFAULT_TARGET,
      status: completed ? 'selesai' : 'dilewati',
    }
    history.value = [session, ...history.value]
    persistHistory(session)
  }

  function updateConfig(next: PomodoroConfig): void {
    config.value = next
    state.value = applyConfig(state.value, next)
    writeStorage(POMODORO_CONFIG_KEY, JSON.stringify(next))
    saveTimer()
  }

  // Fase yang sudah habis selagi app ditutup diselesaikan sekali di sini. Kalau tidak, plugin
  // hanya bereaksi pada PERUBAHAN sisa waktu dan timer yang sudah 00:00 bisa diam selamanya.
  if (state.value.running && state.value.endsAt !== null && state.value.endsAt <= Date.now()) {
    finish(true, state.value.endsAt)
  }

  // Di server ini tidak melakukan apa pun (sesi `null`), dan status tetap `idle`.
  void hydrate()

  // Halaman yang memakai riwayat pomodoro ikut memuat ulang saat pull menerapkan data perangkat lain.
  registerSyncReloader('pomodoro', reload)

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
    historyStatus: readonly(historyStatus),
    historyError: readonly(historyError),
    hydrate,
    reload,
    focusMinutesToday: computed(() => focusMinutesOn(history.value, now.value)),
    /**
     * Satu sesi fokus = satu target (metode Pomodoro). Setelah dimulai, target dikunci sampai
     * sesi selesai atau dibatalkan, supaya riwayat tidak mencatat semua menit ke target terakhir.
     */
    isTargetLocked,
    isSoundOn: readonly(isSoundOn),
    notice: readonly(notice),
    toggle(): void {
      const at = syncNow()
      state.value = state.value.running
        ? pausePomodoro(state.value, at)
        : startPomodoro(state.value, at)
      notice.value = null
      saveTimer()
    },
    start(): void {
      state.value = startPomodoro(state.value, syncNow())
      notice.value = null
      saveTimer()
    },
    reset(): void {
      state.value = resetPomodoro(state.value, config.value)
      saveTimer()
    },
    skip(): void {
      finish(false)
    },
    /**
     * Batalkan sesi fokus yang sedang berjalan/dijeda: dicatat "dilewati" atas nama target lama,
     * lalu timer kembali ke awal fokus (tanpa pindah ke istirahat) supaya target bisa diganti.
     */
    cancelFocus(): void {
      if (!isTargetLocked.value) return
      recordFocus(state.value, false, Date.now())
      notice.value = 'focusSkipped'
      state.value = resetPomodoro(state.value, config.value)
      saveTimer()
    },
    finish,
    selectPhase(phase: PomodoroPhase): void {
      state.value = selectPhase(state.value, phase, config.value)
      saveTimer()
    },
    adjust(key: PomodoroSetting, direction: -1 | 1): void {
      updateConfig(adjustSetting(config.value, key, direction))
    },
    /** `kind` kosong = asal tidak diketahui (mis. tombol "▶ Fokus" dari halaman lain). */
    setTarget(label: string, kind: PomodoroTargetKind | null = null): void {
      if (isTargetLocked.value) return
      target.value = label.trim().slice(0, POMODORO_TARGET_MAX) || null
      targetKind.value = target.value ? kind : null
      saveTimer()
    },
    setTargetMode(mode: PomodoroTargetMode): void {
      targetMode.value = mode
      saveTimer()
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
