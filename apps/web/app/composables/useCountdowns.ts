import { createSystemClock } from '@improve-personal/core'

import {
  countdownFromDraft,
  countdownTarget,
  countdownTint,
  validateCountdownDraft,
  type Countdown,
  type CountdownDraft,
  type CountdownDraftError,
} from '~/utils/countdown'
import { loadCountdowns, persistCountdown, removeCountdown } from '~/utils/countdown/persistence'
import type { LocalDataSession } from '~/utils/storage/session'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { MS_PER_DAY, deviceTimeZone } from '~/utils/time'

import { useLocalData } from './useLocalData'

/**
 * Data countdown (PRD F5) untuk halaman Countdown, Kalender, dan Overview.
 *
 * Sama seperti task/jadwal: perubahan masuk state lokal lebih dulu, penyimpanan IndexedDB
 * menyusul lewat antrean tulis agar dua perubahan cepat tidak saling menimpa.
 */
export type UseCountdownsOptions = {
  /** Sumber sesi; disuntik di test supaya bisa memakai adaptor memori core. */
  readonly session?: () => Promise<LocalDataSession | null>
}

let hydrateInFlight: Promise<void> | null = null
let writeQueue: Promise<void> = Promise.resolve()

export function resetCountdownsHydrationForTest(): void {
  hydrateInFlight = null
  writeQueue = Promise.resolve()
}

export function useCountdowns(options: UseCountdownsOptions = {}) {
  const localData = useLocalData()
  const getSession = options.session ?? localData.ensure
  const tz = deviceTimeZone()

  const countdowns = useState<Countdown[]>('countdowns', () => [])
  const status = useState<'idle' | 'loading' | 'ready' | 'error'>('countdownsStatus', () => 'idle')
  const error = useState<string | null>('countdownsError', () => null)
  const now = useNow()
  const newId = createUuidV7Generator({ clock: createSystemClock() })

  /** Momen yang belum lewat & tidak diarsip, terdekat dulu (penanda Kalender). */
  const upcoming = computed(() =>
    countdowns.value
      .filter((countdown) => !countdown.archived)
      .map((countdown) => ({ countdown, at: countdownTarget(countdown, now.value) }))
      .filter(({ countdown, at }) => at + (countdown.time ? 0 : MS_PER_DAY) > now.value)
      .sort((a, b) => a.at - b.at)
      .map(({ countdown, at }) => ({
        id: countdown.id,
        title: countdown.title,
        at,
        ink: countdownTint(countdown.color)[1],
      })),
  )

  function hydrate(): Promise<void> {
    if (status.value === 'ready') return Promise.resolve()

    hydrateInFlight ??= (async () => {
      status.value = 'loading'
      try {
        const session = await getSession()
        if (session === null) {
          status.value = 'idle'
          return
        }

        countdowns.value = await loadCountdowns(session, tz)
        status.value = 'ready'
        error.value = null
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : 'countdown tidak bisa dimuat'
        hydrateInFlight = null
      }
    })()

    return hydrateInFlight
  }

  function background(work: (session: LocalDataSession) => Promise<void>, failure: string): void {
    writeQueue = writeQueue.then(async () => {
      try {
        const session = await getSession()
        if (session === null) return

        await work(session)
        error.value = null
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : failure
      }
    })
    void writeQueue
  }

  function find(id: string): Countdown | undefined {
    return countdowns.value.find((countdown) => countdown.id === id)
  }

  /** Simpan momen baru (`id` null) atau update; error validasi dikembalikan. */
  function save(
    draft: CountdownDraft,
    id: string | null,
  ): { ok: true } | { error: CountdownDraftError } {
    const draftError = validateCountdownDraft(draft, Date.now(), id !== null)
    if (draftError) return { error: draftError }

    const existing = id ? find(id) : undefined
    const saved = existing
      ? { ...countdownFromDraft(draft, existing.id), archived: existing.archived }
      : countdownFromDraft(draft, newId())

    countdowns.value = existing
      ? countdowns.value.map((countdown) => (countdown.id === saved.id ? saved : countdown))
      : [...countdowns.value, saved]

    background((session) => persistCountdown(session, saved, tz), 'countdown tidak bisa disimpan')
    return { ok: true }
  }

  function remove(id: string): void {
    countdowns.value = countdowns.value.filter((countdown) => countdown.id !== id)
    background((session) => removeCountdown(session, id), 'countdown tidak bisa dihapus')
  }

  function toggleArchive(id: string): void {
    const existing = find(id)
    if (!existing) return

    const saved = { ...existing, archived: !existing.archived }
    countdowns.value = countdowns.value.map((countdown) =>
      countdown.id === id ? saved : countdown,
    )
    background((session) => persistCountdown(session, saved, tz), 'countdown tidak bisa disimpan')
  }

  // Di server ini tidak melakukan apa pun (sesi `null`), dan `status` tetap `idle`.
  void hydrate()

  return {
    countdowns: computed(() => countdowns.value),
    upcoming,
    status: computed(() => status.value),
    error: computed(() => error.value),
    hydrate,
    find,
    save,
    remove,
    toggleArchive,
  }
}
