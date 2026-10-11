import {
  countdownFromDraft,
  validateCountdownDraft,
  type Countdown,
  type CountdownDraft,
  type CountdownDraftError,
} from '~/utils/countdown'

import { createCountdownsMock } from './countdown/mock'

/**
 * Data countdown (PRD F5) untuk halaman Countdown, Home, dan Overview. Fase 1:
 * in-memory dari mock, sama seperti store lain, sampai packages/core siap.
 */
export function useCountdowns() {
  const countdowns = useState<Countdown[]>('countdowns', () => createCountdownsMock(Date.now()))

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

  return { countdowns: computed(() => countdowns.value), find, save, remove, toggleArchive }
}
