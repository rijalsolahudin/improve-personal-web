/**
 * Satuan waktu untuk teks manusiawi (F2 & F5).
 *
 * Batasnya memakai rata-rata (bukan calendar-aware) karena ini untuk MENAMPILKAN sisa waktu, bukan
 * menghitung tanggal: "1 bulan" = 30 hari, "1 tahun" = 365 hari. Aturan reminder F2/F5 memang
 * menyebut ambang ("≥ 1 bulan", "≥ 1 jam"), bukan tanggal kalender - jadi rata-rata justru yang
 * cocok, dan tidak ada tz yang perlu di-inject ke `calc/`.
 */

export const MS_PER_SECOND = 1_000
export const MS_PER_MINUTE = 60 * MS_PER_SECOND
export const MS_PER_HOUR = 60 * MS_PER_MINUTE
export const MS_PER_DAY = 24 * MS_PER_HOUR

/** Bulan rata-rata (30 hari) - dipakai ambang "≥ 1 bulan" F2/F5. */
export const MS_PER_MONTH = 30 * MS_PER_DAY

/** Tahun rata-rata (365 hari) - dipakai ambang "≥ 1 tahun" F5. */
export const MS_PER_YEAR = 365 * MS_PER_DAY

/**
 * Pecah durasi jadi bagian kalender untuk teks "2 bulan 3 hari".
 *
 * Urutan penguraian: tahun -> bulan -> hari -> jam -> menit -> detik. Dipakai kedua format F2 & F5
 * supaya keduanya tidak mungkin berbeda pendapat soal berapa hari dalam sebulan.
 */
export type DurationParts = {
  readonly years: number
  readonly months: number
  readonly days: number
  readonly hours: number
  readonly minutes: number
  readonly seconds: number
}

/**
 * Pecah durasi non-negatif.
 *
 * Sisa setelah tahun diambil bulan (30 hari), lalu hari, jam, menit, detik - jadi hasilnya tidak
 * pernah tumpang tindih dan jumlahnya kembali ke durasi mula-mula.
 */
export function splitDuration(durationMs: number): DurationParts {
  let remaining = Math.max(0, Math.trunc(durationMs))

  const years = Math.floor(remaining / MS_PER_YEAR)
  remaining -= years * MS_PER_YEAR

  const months = Math.floor(remaining / MS_PER_MONTH)
  remaining -= months * MS_PER_MONTH

  const days = Math.floor(remaining / MS_PER_DAY)
  remaining -= days * MS_PER_DAY

  const hours = Math.floor(remaining / MS_PER_HOUR)
  remaining -= hours * MS_PER_HOUR

  const minutes = Math.floor(remaining / MS_PER_MINUTE)
  remaining -= minutes * MS_PER_MINUTE

  const seconds = Math.floor(remaining / MS_PER_SECOND)

  return { years, months, days, hours, minutes, seconds }
}

/** Bentuk bagian menjadi teks Indonesia; satuan yang nilainya 0 dilewati. */
export function formatDurationParts(
  parts: DurationParts,
  units: readonly (keyof DurationParts)[],
): string {
  const labels: Record<keyof DurationParts, readonly [string, string]> = {
    years: ['tahun', 'tahun'],
    months: ['bulan', 'bulan'],
    days: ['hari', 'hari'],
    hours: ['jam', 'jam'],
    minutes: ['menit', 'menit'],
    seconds: ['detik', 'detik'],
  }

  const segments: string[] = []
  for (const unit of units) {
    const value = parts[unit]
    if (value <= 0) continue
    const [singular, plural] = labels[unit]
    segments.push(`${value} ${value === 1 ? singular : plural}`)
  }

  return segments.join(' ')
}
