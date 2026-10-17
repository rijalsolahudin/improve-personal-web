import {
  countdownFromDraft,
  countdownTarget,
  countdownTint,
  validateCountdownDraft,
  type Countdown,
  type CountdownDraft,
  type CountdownDraftError,
} from '~/utils/countdown'
import { MS_PER_DAY } from '~/utils/time'

import { createCountdownsMock } from './countdown/mock'

/**
 * Data countdown (PRD F5) untuk halaman Countdown, Kalender, dan Overview. Fase 1:
 * in-memory dari mock, sama seperti store lain, sampai packages/core siap.
 */
export function useCountdowns() {
  const countdowns = useState<Countdown[]>('countdowns', () => createCountdownsMock(Date.now()))
  const now = useNow()

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

  function find(id: string): Countdown | undefined {
    return countdowns.value.find((countdown) => countdown.id === id)
  }

  /** Simpan momen baru (`id` null) atau update; error validasi dikembalikan. */
  function save(
    draft: CountdownDraft,
    id: string | null,
  ): { ok: true } | { error: CountdownDraftError } {
    const error = validateCountdownDraft(draft, Date.now(), id !== null)
    if (error) return { error }
    const existing = id ? find(id) : undefined
    countdowns.value = existing
      ? countdowns.value.map((countdown) =>
          countdown.id === existing.id
            ? { ...countdownFromDraft(draft, existing.id), archived: countdown.archived }
            : countdown,
        )
      : [...countdowns.value, countdownFromDraft(draft, crypto.randomUUID())]
    return { ok: true }
  }

  function remove(id: string): void {
    countdowns.value = countdowns.value.filter((countdown) => countdown.id !== id)
  }

  function toggleArchive(id: string): void {
    countdowns.value = countdowns.value.map((countdown) =>
      countdown.id === id ? { ...countdown, archived: !countdown.archived } : countdown,
    )
  }

  return {
    countdowns: computed(() => countdowns.value),
    upcoming,
    find,
    save,
    remove,
    toggleArchive,
  }
}
