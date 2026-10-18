import type { Habit, HabitCheckin } from '../domain/entities/habit.ts'
import { checkinAmountForDate, isDayTargetMet, isScheduledDay } from '../domain/entities/habit.ts'
import { addLocalDays, diffLocalDays } from '../domain/entities/primitives.ts'
import { weekdayOfLocalDate } from '../recurrence/calendar.ts'

/**
 * F7 "Streak" - AC T10.
 *
 * Aturan PRD:
 * - "Streak aktif = hari berturut-turut yang target terpenuhi".
 * - "**Hari yang bukan jadwal habit tidak memutus streak**" (habit Senin-Jumat tidak putus di akhir pekan).
 * - "per habit, cukup runut ke belakang sampai streak break".
 *
 * Cara kerjanya: mulai dari hari ini (tanggal lokal perangkat, di-inject) lalu jalan MUNDUR hari per
 * hari; tiap hari yang BUKAN jadwal dilewati tanpa memutus; tiap hari yang jadwal harus memenuhi target.
 *
 * Tiga keputusan yang penting dan diuji:
 *
 * 1. **Hari ini yang belum terpenuhi belum memutus streak.** Kalau pagi-pagi semua streak jadi 0
 *    karena "hari ini belum dicentang", fitur ini tidak bisa dipakai. Jadi hari ini yang belum
 *    terpenuhi cukup dihentikan (streak dihitung sampai kemarin), bukan dianggap putus.
 * 2. **Hari yang jadwalnya "akan datang" tidak dihitung** kecuali hari ini. Kalau habit baru dibuat
 *    hari ini, hari-hari sebelum `createdAt` tidak boleh dikira "terlewat" - karena itu pencarian
 *    berhenti di `createdDateLocal` (diturunkan pemanggil dari `createdAt` + tz).
 * 3. **Hari yang di-skip karena bukan jadwal tetap masuk `longest`? Tidak.** Streak = hari terpenuhi
 *    berturut-turut; hari non-jadwal di antaranya diabaikan, tapi harinya sendiri tidak dihitung.
 *    Jadi habit Senin-Jumat yang konsisten 3 pekan punya streak 15, bukan 21.
 */

/** Tanggal lokal (YYYY-MM-DD) untuk sebuah instan di tz tertentu disuplai pemanggil. */
export type StreakInput = {
  readonly habit: Pick<Habit, 'frequencyType' | 'frequencyDays' | 'targetPerDay'>
  readonly checkins: readonly HabitCheckin[]
  /** Tanggal lokal "hari ini" di tz perangkat (bukan UTC). */
  readonly todayLocalDate: string
  /**
   * Tanggal lokal saat habit dibuat. Pencarian berhenti di sini supaya hari sebelum habit ada tidak
   * dihitung sebagai "terlewat". `undefined` = tidak dibatasi (dipakai saat import data lama).
   */
  readonly createdLocalDate?: string | undefined
  /** Batas maksimum hari mundur - pengaman supaya data rusak tidak membuat loop panjang. */
  readonly maxLookbackDays?: number
}

export type StreakResult = {
  /** Hari jadwal berturut-turut yang targetnya terpenuhi, berakhir di hari ini atau kemarin. */
  readonly current: number
  /** Hari jadwal yang terpenuhi hari ini. */
  readonly metToday: boolean
  /** Rincian dihitung dari hari ini mundur sampai putus - berguna untuk heatmap/debug. */
  readonly checkedDays: number
}

/** Pengaman: 10 tahun. Lebih dari cukup dan menjaga loop tetap terbatas. */
export const DEFAULT_MAX_LOOKBACK_DAYS = 3_650

/**
 * Hitung streak berjalan.
 *
 * `checkins` boleh memuat check-in habit lain; yang dipakai cuma yang `habitId`-nya cocok. Filter itu
 * dilakukan di sini supaya pemanggil tidak perlu membangun map sendiri (dan tidak ada dua cara
 * menyaring yang bisa berbeda).
 */
export function habitStreak(input: StreakInput): StreakResult {
  const habitId = (input.habit as Partial<Habit>).id
  const amountsByDate = sumAmountsByDate(input.checkins, habitId)

  const maxLookback = input.maxLookbackDays ?? DEFAULT_MAX_LOOKBACK_DAYS
  const earliestDate = input.createdLocalDate ?? null

  let current = 0
  let checkedDays = 0
  let metToday = false

  for (let offset = 0; offset < maxLookback; offset += 1) {
    const localDate = addLocalDays(input.todayLocalDate, -offset)

    // Habit belum ada di tanggal ini (dan seterusnya ke belakang) -> berhenti.
    if (earliestDate !== null && localDate < earliestDate) break

    const weekday = weekdayOfLocalDate(localDate)
    if (!isScheduledDay(input.habit, weekday)) {
      // BUKAN jadwal -> TIDAK memutus streak; harinya juga tidak dihitung.
      continue
    }

    checkedDays += 1
    const amount = amountsByDate.get(localDate) ?? 0
    const met = isDayTargetMet(input.habit, amount)

    if (offset === 0) {
      metToday = met
      if (met) current += 1
      // Hari ini belum terpenuhi -> belum putus, lanjut mundur untuk menghitung streak sampai kemarin.
      continue
    }

    if (!met) break

    current += 1
  }

  return { current, metToday, checkedDays }
}

/** Jumlahkan `amount` per `local_date` untuk satu habit. */
function sumAmountsByDate(
  checkins: readonly HabitCheckin[],
  habitId: string | undefined,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const checkin of checkins) {
    if (habitId !== undefined && checkin.habitId !== habitId) continue
    const previous = map.get(checkin.localDate) ?? 0
    map.set(checkin.localDate, previous + checkin.amount)
  }
  return map
}

/** Jumlah check-in satu hari untuk satu habit (pemakaian langsung dari UI Daily F12). */
export function habitAmountOn(
  habit: Pick<Habit, 'id'>,
  checkins: readonly HabitCheckin[],
  localDate: string,
): number {
  return checkinAmountForDate(
    checkins.filter((checkin) => checkin.habitId === habit.id),
    localDate,
  )
}

/**
 * Streak terpanjang sepanjang riwayat - dipakai Overview F11.
 *
 * Rentang pemindaian dibatasi di KEDUA ujung: mulai dari tanggal paling awal yang punya data
 * (check-in paling awal, atau tanggal pembuatan habit) dan berakhir di hari ini. Tanpa batas bawah,
 * pemindaian akan "maju" dari hari yang jauh di masa lalu dan hari-hari kosong sebelum habit pernah
 * dipakai akan memutus streak yang sebenarnya belum dimulai.
 *
 * Hari non-jadwal dilewati tanpa memutus (aturan yang sama dengan `habitStreak`), jadi habit
 * Senin-Jumat tetap dapat 5, bukan 7.
 */
export function longestHabitStreak(input: StreakInput): number {
  const habitId = (input.habit as Partial<Habit>).id
  const amountsByDate = sumAmountsByDate(input.checkins, habitId)

  const earliestCheckin = [...amountsByDate.keys()].sort()[0]
  const boundary = input.createdLocalDate ?? earliestCheckin
  if (boundary === undefined) return 0
  if (boundary > input.todayLocalDate) return 0

  const maxLookback = input.maxLookbackDays ?? DEFAULT_MAX_LOOKBACK_DAYS
  const spanDays = Math.min(maxLookback, diffLocalDays(boundary, input.todayLocalDate) + 1)

  let longest = 0
  let running = 0

  // Dibaca MAJU dari batas bawah ke hari ini supaya "berturut-turut" mudah dilacak.
  for (let offset = spanDays - 1; offset >= 0; offset -= 1) {
    const localDate = addLocalDays(input.todayLocalDate, -offset)

    const weekday = weekdayOfLocalDate(localDate)
    if (!isScheduledDay(input.habit, weekday)) continue

    if (isDayTargetMet(input.habit, amountsByDate.get(localDate) ?? 0)) {
      running += 1
      if (running > longest) longest = running
      continue
    }

    // Hari ini yang belum terpenuhi belum memutus streak (perilaku sama dengan `habitStreak`).
    if (offset === 0) continue
    running = 0
  }

  return longest
}
