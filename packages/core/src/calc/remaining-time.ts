import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_MONTH,
  MS_PER_YEAR,
  splitDuration,
} from './duration.ts'

/**
 * F2 "Sisa Waktu Dinamis" - AC T5.
 *
 * Aturan PRD:
 * - Satuan terbesar relevan + satu di bawahnya.
 * - "2 bulan 3 hari", "5 hari 4 jam", "3 jam 12 menit", "8 menit".
 * - Lewat deadline -> "Terlambat 2 jam" (merah).
 * - AC T5 menyebut batas yang harus diuji: 59 menit, 1 jam, 1 hari, 1 bulan, dan kondisi lewat.
 *
 * Dua keputusan yang diambil dari dokumen (dan diuji):
 *
 * 1. **"8 menit" untuk sisa < 1 jam tanpa bagian kedua.** PRD menulis "8 menit" (bukan
 *    "8 menit 30 detik"), jadi begitu kurang dari satu jam, bagian kedua ditampilkan HANYA kalau dia
 *    memang lebih besar dari nol dan satuan di bawahnya satu tingkat - di sini menit adalah satuan
 *    terkecil untuk sisa waktu task. Detik tidak dipakai: sisa waktu task yang berdenyut tiap detik
 *    itu gangguan, dan PRD tidak memintanya. (Beda dengan countdown F5 yang MEMANG minta detik.)
 * 2. **Ambang "1 hari" = 24 jam penuh.** Sisa 23 jam tetap "23 jam ...", bukan "1 hari". Ini yang
 *    membuat ambang di AC T5 bisa diuji persis.
 */

/** Bentuk hasil sisa waktu, siap dirender UI tanpa perhitungan tambahan. */
export type RemainingTime = {
  /** Sudah lewat deadline. */
  readonly isOverdue: boolean
  /** Teks siap tampil, mis. "2 bulan 3 hari" atau "Terlambat 2 jam". */
  readonly text: string
  /** Satuan terbesar yang terpakai; UI memakainya untuk memutuskan warna/gaya. */
  readonly largestUnit: 'tahun' | 'bulan' | 'hari' | 'jam' | 'menit' | 'none'
  /** Selisih absolut dalam ms (selalu >= 0). */
  readonly absoluteMs: number
}

/**
 * Hitung sisa waktu sampai `deadlineMs` pada `nowMs`.
 *
 * Murni: dua-duanya masuk sebagai parameter, jadi satu ticker global bisa memanggilnya untuk semua
 * item dan unit test-nya deterministik.
 */
export function remainingTime(deadlineMs: number, nowMs: number): RemainingTime {
  const delta = deadlineMs - nowMs
  const isOverdue = delta < 0
  const absoluteMs = Math.abs(delta)

  if (isOverdue) {
    return {
      isOverdue: true,
      text: formatOverdue(absoluteMs),
      largestUnit: largestUnitOf(absoluteMs),
      absoluteMs,
    }
  }

  return {
    isOverdue: false,
    text: formatRemaining(absoluteMs),
    largestUnit: largestUnitOf(absoluteMs),
    absoluteMs,
  }
}

/** "Terlambat 2 jam", "Terlambat 1 hari 3 jam". */
function formatOverdue(absoluteMs: number): string {
  // Lewat < 1 menit tetap harus terbaca; "Terlambat 0 menit" lebih baik daripada teks kosong.
  if (absoluteMs < MS_PER_MINUTE) return 'Terlambat kurang dari 1 menit'
  return `Terlambat ${largestTwoUnits(absoluteMs)}`
}

/** Teks sisa waktu (belum lewat). */
function formatRemaining(absoluteMs: number): string {
  if (absoluteMs < MS_PER_MINUTE) return 'kurang dari 1 menit'
  return largestTwoUnits(absoluteMs)
}

/**
 * Satuan terbesar + satu di bawahnya, dengan dua pengecualian yang disengaja:
 *
 * - **< 1 jam**: cuma menit ("8 menit", bukan "8 menit 30 detik") sesuai teks PRD F2.
 * - **Nilai 0 pada bagian kedua dibuang** ("2 bulan" kalau sisanya nol), supaya tidak ada "2 bulan 0 hari".
 */
function largestTwoUnits(absoluteMs: number): string {
  const parts = splitDuration(absoluteMs)

  if (absoluteMs < MS_PER_HOUR) {
    return `${parts.minutes} menit`
  }

  if (absoluteMs < MS_PER_DAY) {
    return joinUnits([
      [parts.hours, 'jam'],
      [parts.minutes, 'menit'],
    ])
  }

  if (absoluteMs < MS_PER_MONTH) {
    return joinUnits([
      [parts.days, 'hari'],
      [parts.hours, 'jam'],
    ])
  }

  if (absoluteMs < MS_PER_YEAR) {
    return joinUnits([
      [parts.months, 'bulan'],
      [parts.days, 'hari'],
    ])
  }

  return joinUnits([
    [parts.years, 'tahun'],
    [parts.months, 'bulan'],
  ])
}

/** Gabungkan pasangan (nilai, satuan) dengan aturan "yang 0 dibuang, tapi minimal satu tersisa". */
function joinUnits(pairs: readonly (readonly [number, string])[]): string {
  const segments: string[] = []
  for (const [value, unit] of pairs) {
    if (value > 0) segments.push(`${value} ${unit}`)
  }
  if (segments.length > 0) return segments.join(' ')

  // Bagian pertama 0 karena pembulatan ke bawah (mis. 59 menit 59 detik pada jalur < 1 jam sudah
  // ditangani di atas) - tampilkan yang pertama sebagai 0 supaya teksnya tetap bermakna.
  const first = pairs[0]
  return first === undefined ? '' : `${first[0]} ${first[1]}`
}

/** Satuan terbesar yang terpakai - dipakai UI untuk memilih gaya/warna tanpa mem-parsing teks. */
function largestUnitOf(absoluteMs: number): RemainingTime['largestUnit'] {
  if (absoluteMs < MS_PER_MINUTE) return 'menit'
  if (absoluteMs < MS_PER_HOUR) return 'menit'
  if (absoluteMs < MS_PER_DAY) return 'jam'
  if (absoluteMs < MS_PER_MONTH) return 'hari'
  if (absoluteMs < MS_PER_YEAR) return 'bulan'
  return 'tahun'
}

/**
 * Urutan sort F2: deadline terdekat dulu.
 *
 * Task tanpa deadline selalu di BELAKANG - bukan di depan - karena "tanpa deadline" tidak punya
 * jarak yang bisa dibandingkan; menaruhnya di depan akan menutupi task yang punya tenggat.
 * Tie-break `id` supaya urutannya sama di web dan mobile.
 */
export function compareByDeadline(
  a: { readonly id: string; readonly deadlineAt: number | null },
  b: { readonly id: string; readonly deadlineAt: number | null },
): number {
  if (a.deadlineAt === null && b.deadlineAt === null) return compareId(a.id, b.id)
  if (a.deadlineAt === null) return 1
  if (b.deadlineAt === null) return -1
  if (a.deadlineAt !== b.deadlineAt) return a.deadlineAt - b.deadlineAt
  return compareId(a.id, b.id)
}

function compareId(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}
