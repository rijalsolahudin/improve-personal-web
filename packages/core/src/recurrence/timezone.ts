import {
  formatLocalDate,
  parseLocalDate,
  type LocalDateParts,
} from '../domain/entities/primitives.ts'

/**
 * Aritmetika kalender ber-tz, MURNI.
 *
 * `Intl.DateTimeFormat` adalah standar ECMA-402 (`lib: ES2023` sudah memuatnya), jadi ini tetap sah
 * di `packages/*` tanpa DOM maupun Node - dan ini yang bikin ekspansi recurrence tetap murni walau
 * memakai tz perangkat (ARCHITECTURE.md §11: "Ekspansi recurrence pakai zona waktu perangkat").
 *
 * Aturan penting:
 * - Tidak ada `Date.now()` di sini. Waktu "sekarang" selalu masuk lewat parameter.
 * - Tiap fungsi memakai `Date` dibuat dari angka yang sudah tervalidasi; tidak ada parsing string
 *   tanggal yang formatnya bisa berbeda antar engine.
 * - Cache formatter: membuat `Intl.DateTimeFormat` itu mahal, dan ekspansi rentang 1 tahun bisa
 *   memanggilnya ribuan kali (jalur panas kalender, AC T9 "render bulan < 100ms").
 */

/** Bagian waktu lokal (wall clock) di sebuah tz, hasil pembacaan `Intl`. */
export type LocalDateTimeParts = {
  readonly localDate: string
  readonly hour: number
  readonly minute: number
  readonly second: number
  readonly millisecond: number
  readonly weekday: string
}

const FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>()

function getFormatter(tz: string): Intl.DateTimeFormat {
  const cached = FORMATTER_CACHE.get(tz)
  if (cached !== undefined) return cached

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  FORMATTER_CACHE.set(tz, formatter)
  return formatter
}

/**
 * Apakah `tz` nama zona waktu IANA yang benar-benar dikenali engine ini.
 *
 * Dipakai jalur non-panas (validasi import) - sengaja tidak dipakai di dalam ekspansi, karena
 * `Intl.DateTimeFormat` untuk tz tak dikenal akan melempar `RangeError` yang lebih jelas daripada
 * pengecekan diam-diam ini.
 */
export function isKnownTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * Baca wall clock di `tz` untuk sebuah instan.
 *
 * `hour` sengaja bisa bernilai 24 pada sebagian engine karena `hourCycle` bawaan; karena itu hasilnya
 * dinormalkan ke 0-23 sebelum dipakai (`hour % 24`), kalau tidak, pukul tengah malam akan terbaca
 * sebagai hari berikutnya dan ekspansi mingguan bisa salah satu hari.
 */
export function toLocalDateTime(instantMs: number, tz: string): LocalDateTimeParts {
  const parts = getFormatter(tz).formatToParts(new Date(instantMs))

  let year = 0
  let month = 1
  let day = 1
  let rawHour = 0
  let minute = 0
  let second = 0
  let weekday = 'senin'

  for (const part of parts) {
    switch (part.type) {
      case 'year':
        year = Number(part.value)
        break
      case 'month':
        month = Number(part.value)
        break
      case 'day':
        day = Number(part.value)
        break
      case 'hour':
        rawHour = Number(part.value)
        break
      case 'minute':
        minute = Number(part.value)
        break
      case 'second':
        second = Number(part.value)
        break
      case 'weekday':
        weekday = part.value.toLowerCase()
        break
      default:
        break
    }
  }

  return {
    localDate: formatLocalDate({ year, month, day }),
    hour: rawHour % 24,
    minute,
    second,
    // `Intl` tanpa `fractionalSecondDigits` tidak melaporkan ms; ms diambil dari sisa modulo detik
    // supaya pembulatan tetap benar untuk instan yang punya milidetik.
    millisecond: instantMs % 1000,
    weekday,
  }
}

/** Tanggal lokal (`YYYY-MM-DD`) untuk sebuah instan di `tz`. Ini "hari" versi user, bukan versi UTC. */
export function localDateOf(instantMs: number, tz: string): string {
  return toLocalDateTime(instantMs, tz).localDate
}

/** Jam lokal 0-23 di `tz`. */
export function localHourOf(instantMs: number, tz: string): number {
  return toLocalDateTime(instantMs, tz).hour
}

/** Cari offset (ms) yang berlaku di `tz` pada instan tertentu, dengan membandingkan hasil `Intl`. */
function offsetAt(instantMs: number, tz: string): number {
  const parts = toLocalDateTime(instantMs, tz)
  const asUtc = Date.UTC(
    parseLocalDate(parts.localDate).year,
    parseLocalDate(parts.localDate).month - 1,
    parseLocalDate(parts.localDate).day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  )
  return asUtc - instantMs
}

/**
 * Ubah wall clock lokal di `tz` jadi instan UTC (epoch ms).
 *
 * Dua pass: pass pertama memakai offset pada tebakan awal, pass kedua mengoreksi dengan offset pada
 * hasilnya. Ini yang membuat perhitungan tetap benar di sekitar DST (offset berubah), tanpa perlu
 * tabel tz di dalam core.
 *
 * Ambigu/inexact time (jam yang dilewati saat DST mulai) diselesaikan dengan memilih instan yang
 * lebih besar - konsisten dengan perilaku Google Calendar: kejadian pukul 02:30 yang tidak ada tetap
 * muncul, digeser ke jam berikutnya, bukan hilang.
 */
export function fromLocalDateTime(parts: {
  readonly localDate: string
  readonly hour: number
  readonly minute: number
  readonly second?: number
  readonly millisecond?: number
  readonly tz: string
}): number {
  const { year, month, day } = parseLocalDate(parts.localDate)
  const naiveUtc = Date.UTC(
    year,
    month - 1,
    day,
    parts.hour,
    parts.minute,
    parts.second ?? 0,
    parts.millisecond ?? 0,
  )

  const firstGuess = naiveUtc - offsetAt(naiveUtc, parts.tz)
  const corrected = naiveUtc - offsetAt(firstGuess, parts.tz)
  if (corrected === firstGuess) return firstGuess

  // Konfirmasi pass kedua benar-benar menghasilkan wall clock yang diminta; kalau tidak (kasus jam
  // yang dilewati), pilih instan yang lebih besar supaya kejadiannya tetap muncul.
  const verified = toLocalDateTime(corrected, parts.tz)
  if (
    verified.localDate === parts.localDate &&
    verified.hour === parts.hour &&
    verified.minute === parts.minute
  ) {
    return corrected
  }
  return Math.max(firstGuess, corrected)
}

/** Awal hari (00:00:00.000) di `tz` untuk tanggal lokal `localDate`. */
export function startOfLocalDay(localDate: string, tz: string): number {
  return fromLocalDateTime({ localDate, hour: 0, minute: 0, second: 0, millisecond: 0, tz })
}

/**
 * Akhir hari (23:59:59.999) di `tz`.
 *
 * Dipakai filter "hari ini" (F2) dan rentang ekspansi satu hari kalender.
 */
export function endOfLocalDay(localDate: string, tz: string): number {
  return fromLocalDateTime({ localDate, hour: 23, minute: 59, second: 59, millisecond: 999, tz })
}

/**
 * Jam + menit wall clock di `tz` untuk sebuah instan.
 *
 * Dipakai ekspansi recurrence: pola ditentukan jam LOKAL ("tiap Senin 09:00"), bukan jam UTC, jadi
 * kejadian tetap di pukul 09:00 lokal walau offset tz berubah.
 */
export function localTimeOf(
  instantMs: number,
  tz: string,
): { readonly hour: number; readonly minute: number } {
  const parts = toLocalDateTime(instantMs, tz)
  return { hour: parts.hour, minute: parts.minute }
}

/** Susun `YYYY-MM-DD` dari bagian tanggal; re-export supaya `recurrence/` tidak perlu impor dalam. */
export function localDateFromParts(parts: LocalDateParts): string {
  return formatLocalDate(parts)
}
