import { isScheduled, type CheckIns, type Habit, type HabitIcon } from '~/utils/habits'
import { addDays } from '~/utils/time'

/** Riwayat contoh dibangkitkan untuk sekian hari ke belakang. */
const HISTORY_DAYS = 120

interface Seed {
  habit: Habit
  /** Streak sebelum hari ini. */
  streak: number
  /** Peluang tercapai di hari lain (0–1). */
  rate: number
  /** Check-in hari ini. */
  today: number
}

/**
 * Habit contoh fase 1 (isi Home Desktop.dc.html `genHist`): riwayat deterministik
 * (pseudo-random ber-seed) relatif ke `today`. Diganti repository lokal (packages/core).
 */
export function createHabitsMock(today: string): { habits: Habit[]; checkIns: CheckIns } {
  const habit = (
    id: string,
    name: string,
    icon: HabitIcon,
    color: number,
    extra: Partial<Habit> = {},
  ): Habit => ({
    id,
    name,
    icon,
    sticker: null,
    color,
    days: null,
    target: 1,
    goalId: null,
    ...extra,
  })
  const seeds: Seed[] = [
    {
      habit: habit('h1', 'Belajar 1 jam', 'book-open', 0, {
        sticker: 'aktivitas/belajar',
        goalId: 'aws',
      }),
      streak: 8,
      rate: 0.9,
      today: 1,
    },
    {
      habit: habit('h2', 'Olahraga', 'heart', 1, { days: [1, 3, 5], goalId: 'run' }),
      streak: 3,
      rate: 0.7,
      today: 0,
    },
    { habit: habit('h3', 'Baca 10 hal', 'star', 2), streak: 12, rate: 0.8, today: 0 },
    {
      habit: habit('h4', 'Tidur ≤ 23:00', 'moon', 3, { goalId: 'aws' }),
      streak: 5,
      rate: 0.75,
      today: 1,
    },
    {
      habit: habit('h5', 'Minum air', 'droplet', 7, { target: 8 }),
      streak: 0,
      rate: 0.6,
      today: 3,
    },
  ]

  const checkIns: CheckIns = {}
  seeds.forEach(({ habit: item, streak, rate, today: countToday }, index) => {
    let seed = 17 + index * 31
    const random = (): number => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    const days: Record<string, number> = {}
    let scheduledSeen = 0
    for (let offset = 1; offset <= HISTORY_DAYS; offset += 1) {
      const day = addDays(today, -offset)
      if (!isScheduled(item, day)) continue
      scheduledSeen += 1
      // Hari terjadwal ke-(streak+1) sengaja terlewat supaya streak contoh pas.
      const isMet =
        scheduledSeen <= streak ? true : scheduledSeen === streak + 1 ? false : random() < rate
      if (isMet) days[day] = item.target
    }
    if (countToday > 0) days[today] = countToday
    checkIns[item.id] = days
  })

  return { habits: seeds.map((seed) => seed.habit), checkIns }
}
