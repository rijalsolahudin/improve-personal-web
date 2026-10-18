/**
 * `calc/` - perhitungan murni (ARCHITECTURE.md §4).
 *
 * Sisa waktu (F2), unit countdown (F5), streak (F7), dan agregasi. Semua fungsi di sini menerima
 * "sekarang" sebagai parameter - tidak ada `Date.now()` - supaya satu ticker global (ARCHITECTURE §11)
 * bisa memakainya untuk semua item dan test-nya deterministik.
 */

export {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_MONTH,
  MS_PER_SECOND,
  MS_PER_YEAR,
  formatDurationParts,
  splitDuration,
  type DurationParts,
} from './duration.ts'

export { compareByDeadline, remainingTime, type RemainingTime } from './remaining-time.ts'

export {
  countdownUnits,
  sortedCountdownRows,
  topCountdowns,
  type CountdownRow,
  type CountdownUnitText,
} from './countdown.ts'

export {
  DEFAULT_MAX_LOOKBACK_DAYS,
  habitAmountOn,
  habitStreak,
  longestHabitStreak,
  type StreakInput,
  type StreakResult,
} from './streak.ts'
