import type { ScheduleException, ScheduleOccurrence } from '../domain/entities/schedule.ts'
import type { Record } from '../domain/envelope.ts'

import type { ExpansibleSchedule, ExpansionRange, Occurrence } from './expand.ts'
import { expandOccurrenceTimes } from './expand.ts'

/**
 * Lapisan exception & status di atas pola murni - PRD F1 (tiga opsi edit/hapus) + status kejadian.
 *
 * Pemisahannya disengaja: `expand.ts` hanya tahu POLA, dan file ini yang tahu bahwa pola itu bisa
 * ditimpa (`schedule_exception`) atau ditandai (`schedule_occurrence`). Dengan begitu aturan pola
 * bisa diuji tanpa exception, dan aturan exception bisa diuji tanpa menyentuh kalender.
 */

/**
 * Kejadian siap tampil: pola + override + status.
 *
 * `occurrenceAt` = waktu occurrence ASAL (kunci ke exception dan ke `schedule_occurrence`), sedangkan
 * `startAt`/`endAt` sudah memakai override. Dua hal ini dipisah karena kalau digabung, menggeser satu
 * kejadian akan membuat exception-nya sendiri "hilang" pada ekspansi berikutnya.
 */
export type ExpandedOccurrence = {
  readonly scheduleId: string
  /** Waktu asal dari pola - kunci ke `schedule_exception` & `schedule_occurrence`. */
  readonly occurrenceAt: number
  /** Waktu mulai efektif (setelah `start_at_override`). */
  readonly startAt: number
  readonly endAt: number
  readonly localDate: string
  readonly title: string
  readonly isCancelled: boolean
  readonly status: OccurrenceStatusOrNull
  /** Id exception yang berlaku, `null` kalau kejadian murni dari pola. */
  readonly exceptionId: string | null
}

type OccurrenceStatusOrNull = ScheduleOccurrence['status'] | null

/** Exception yang sudah dikaitkan ke jadwalnya (dari hasil baca repository). */
export type ExceptionRecord = Record<ScheduleException>
export type OccurrenceRecord = Record<ScheduleOccurrence>

/**
 * Ekspansi lengkap: pola + exception + status untuk satu jadwal dalam rentang.
 *
 * Aturan yang ditegakkan:
 * - Exception dengan `is_cancelled` MEMBUANG kejadiannya (bukan menghasilkan kejadian kosong).
 * - Exception `only_this` mengubah satu kejadian; `this_and_following` mengubah dari titik itu ke
 *   depan (dipakai saat pola induk belum dipotong - lihat `splitForThisAndFollowing`).
 * - Status dicocokkan lewat `occurrence_at` EFEKTIF (setelah override), sesuai
 *   `unique(schedule_id, occurrence_at)` di DBML: kalau kejadian digeser, statusnya ikut kunci baru.
 */
export function expandWithExceptions(input: {
  readonly schedule: ExpansibleSchedule & { readonly title: string }
  readonly recurrence: Parameters<typeof expandOccurrenceTimes>[1]
  readonly exceptions: readonly ExceptionRecord[]
  readonly occurrences: readonly OccurrenceRecord[]
  readonly range: ExpansionRange
}): readonly ExpandedOccurrence[] {
  const base = expandOccurrenceTimes(input.schedule, input.recurrence, input.range)
  const applicable = input.exceptions.filter(
    (exception) => exception.data.scheduleId === input.schedule.id && !exception.deleted,
  )
  const statusByOccurrenceAt = indexOccurrenceStatus(input.schedule.id, input.occurrences)

  const results: ExpandedOccurrence[] = []
  for (const occurrence of base) {
    const exception = findApplicableException(applicable, occurrence, input.schedule)
    if (exception !== null && exception.data.isCancelled) continue

    const startAt = exception?.data.startAtOverride ?? occurrence.startAt
    const durationMs = exception?.data.durationOverrideMs ?? occurrence.endAt - occurrence.startAt
    const endAt = startAt + durationMs
    const title = exception?.data.titleOverride ?? input.schedule.title

    // Kejadian yang digeser bisa keluar dari rentang yang diminta - jangan ditampilkan kalau begitu,
    // karena kalender memilih kejadian berdasarkan waktu EFEKTIF.
    if (endAt < input.range.fromMs || startAt > input.range.toMs) continue

    results.push({
      scheduleId: input.schedule.id,
      occurrenceAt: occurrence.occurrenceAt,
      startAt,
      endAt,
      localDate: occurrence.localDate,
      title,
      isCancelled: false,
      status: statusByOccurrenceAt.get(startAt) ?? null,
      exceptionId: exception?.id ?? null,
    })
  }

  results.sort((a, b) => {
    if (a.startAt !== b.startAt) return a.startAt - b.startAt
    return a.occurrenceAt - b.occurrenceAt
  })
  return results
}

/**
 * Cari exception yang berlaku untuk sebuah kejadian.
 *
 * Pencocokan utama: `occurrence_at` sama persis dengan waktu ASAL kejadian. Kalau tidak ada, exception
 * `this_and_following` dianggap berlaku untuk semua kejadian mulai dari `occurrence_at`-nya -
 * inilah arti "kejadian ini & berikutnya" pada pola yang BELUM dipotong (mis. ketika pengguna baru
 * mengubah satu kali dari satu kejadian, belum melakukan pemotongan).
 *
 * Yang paling spesifik menang: exception `only_this` dengan waktu sama mengalahkan
 * `this_and_following`.
 */
function findApplicableException(
  exceptions: readonly ExceptionRecord[],
  occurrence: Occurrence,
  schedule: ExpansibleSchedule,
): ExceptionRecord | null {
  let exact: ExceptionRecord | null = null
  let trailing: ExceptionRecord | null = null

  for (const exception of exceptions) {
    const at = exception.data.occurrenceAt

    if (at === occurrence.occurrenceAt) {
      if (exception.data.mode === 'only_this') return exception
      exact ??= exception
      continue
    }

    if (exception.data.mode === 'this_and_following' && at <= occurrence.startAt) {
      if (trailing === null || at > trailing.data.occurrenceAt) trailing = exception
    }
  }

  void schedule
  return exact ?? trailing
}

/** Indeks status per `occurrence_at` EFEKTIF; yang paling baru menang kalau ada duplikat. */
function indexOccurrenceStatus(
  scheduleId: string,
  occurrences: readonly OccurrenceRecord[],
): Map<number, ScheduleOccurrence['status']> {
  const map = new Map<number, ScheduleOccurrence['status']>()
  for (const occurrence of occurrences) {
    if (occurrence.data.scheduleId !== scheduleId || occurrence.deleted) continue
    map.set(occurrence.data.occurrenceAt, occurrence.data.status)
  }
  return map
}

/** Kejadian yang dihasilkan pola untuk SATU titik waktu asal (dipakai resolusi exception). */
export function occurrenceAtExact(
  schedule: ExpansibleSchedule,
  recurrence: Parameters<typeof expandOccurrenceTimes>[1],
  occurrenceAt: number,
): Occurrence | null {
  // Rentang tepat di sekitar satu kejadian; pola tetap yang menghitung, bukan pencocokan jam manual.
  const widened: ExpansionRange = { fromMs: occurrenceAt - 1, toMs: occurrenceAt + 1 }
  const found = expandOccurrenceTimes(schedule, recurrence, widened)
  for (const occurrence of found) {
    if (occurrence.occurrenceAt === occurrenceAt) return occurrence
  }
  return null
}

/** Exception per mode - dipakai `edit strategy` di bawah. */
export function exceptionForOnlyThis(
  input: {
    readonly id: string
    readonly scheduleId: string
    readonly occurrenceAt: number
    readonly createdAt: number
  },
  patch: {
    readonly titleOverride?: string | null
    readonly startAtOverride?: number | null
    readonly durationOverrideMs?: number | null
    readonly isCancelled?: boolean
  },
): ScheduleException {
  return {
    id: input.id,
    scheduleId: input.scheduleId,
    occurrenceAt: input.occurrenceAt,
    mode: 'only_this',
    isCancelled: patch.isCancelled ?? false,
    titleOverride: patch.titleOverride ?? null,
    startAtOverride: patch.startAtOverride ?? null,
    durationOverrideMs: patch.durationOverrideMs ?? null,
    createdAt: input.createdAt,
  }
}

/**
 * Hasil "Kejadian ini & berikutnya" (PRD F1).
 *
 * Pemotongan pola diwakili oleh DUa hal, dan keduanya harus ada:
 * 1. `truncateEndDate` - batas akhir untuk aturan induk yang baru (pola lama berhenti sehari sebelum
 *    titik potong). Pola lama harus dipangkas, bukan dibiarkan jalan, supaya tidak ada dua pola yang
 *    menghasilkan kejadian di rentang yang sama.
 * 2. `exceptionsToDrop` - baris exception lama yang titiknya >= titik potong sudah tidak relevan dan
 *    harus dibuang, karena exception itu milik pola lama (kalau dibiarkan, dia akan menimpa kejadian
 *    dari pola BARU - hasil edit baru jadi tidak kelihatan).
 */
export type ThisAndFollowingPlan = {
  /** Batas akhir inklusif untuk pola induk yang lama (epoch ms, akhir hari kejadian sebelumnya). */
  readonly truncateEndDate: number | null
  /** Titik potong: kejadian asal pertama yang pindah ke pola baru. */
  readonly splitOccurrenceAt: number
  readonly exceptionsToDrop: readonly string[]
  /** Id exception lama yang titiknya < titik potong dan harus tetap dipertahankan. */
  readonly exceptionsToKeep: readonly string[]
}

/**
 * Hitung pemotongan pola untuk "kejadian ini & berikutnya".
 *
 * Yang dihitung MURNI (tanpa menyentuh DB maupun jam): titik potong, batas akhir pola lama, dan
 * exception mana yang dibuang/dipertahankan. Pemanggil yang membuat record jadwal baru + menulisnya
 * dalam satu transaksi.
 *
 * `truncated` bernilai `null` kalau titik potongnya adalah kejadian PERTAMA - artinya tidak ada pola
 * lama yang tersisa, jadi jadwal induknya tinggal diubah, bukan dipotong.
 */
export function splitForThisAndFollowing(input: {
  readonly schedule: ExpansibleSchedule
  readonly recurrence: Parameters<typeof expandOccurrenceTimes>[1]
  readonly exceptions: readonly ExceptionRecord[]
  /** Waktu occurrence ASAL tempat pemotongan terjadi. */
  readonly splitOccurrenceAt: number
  /** Akhir hari kejadian asal - batas inklusif pola lama. */
  readonly previousOccurrenceEndMs: number | null
}): ThisAndFollowingPlan | null {
  const split = input.splitOccurrenceAt

  const previous = expandOccurrenceTimes(input.schedule, input.recurrence, {
    fromMs: 0,
    toMs: split - 1,
  })
  const lastBefore = previous.at(-1) ?? null

  const exceptionsToDrop: string[] = []
  const exceptionsToKeep: string[] = []
  for (const exception of input.exceptions) {
    if (exception.data.scheduleId !== input.schedule.id || exception.deleted) continue
    if (exception.data.occurrenceAt >= split) exceptionsToDrop.push(exception.id)
    else exceptionsToKeep.push(exception.id)
  }

  return {
    truncateEndDate:
      lastBefore === null ? null : (input.previousOccurrenceEndMs ?? lastBefore.occurrenceAt),
    splitOccurrenceAt: split,
    exceptionsToDrop,
    exceptionsToKeep,
  }
}

/**
 * "Semua" (PRD F1): ubah `schedule` induk, TANPA membuat baris exception.
 *
 * Dikembalikan sebagai daftar id exception yang harus dibuang, karena exception lama yang menimpa
 * kejadian bisa membuat perubahan "semua" tidak kelihatan. Kalau user mengubah semuanya, override
 * per-kejadian sebelumnya memang tidak relevan lagi - membuangnya eksplisit (bukan mengharapkannya
 * hilang sendiri) yang membuat perilakunya jelas.
 */
export function exceptionsToDropForAllChange(
  scheduleId: string,
  exceptions: readonly ExceptionRecord[],
): readonly string[] {
  return exceptions
    .filter((exception) => exception.data.scheduleId === scheduleId && !exception.deleted)
    .map((exception) => exception.id)
}

/**
 * Status efektif sebuah kejadian menurut waktu sekarang (dipakai UI & progress Goal F13).
 *
 * Dihitung dari `nowMs` yang di-inject. `missed` diberikan HANYA kalau `graceMs` sudah lewat -
 * memberi grace satu hari adalah perilaku yang diharapkan user (kejadian pagi tidak langsung
 * "terlewat" begitu lewat jam-nya), dan `graceMs` masuk sebagai parameter supaya bisa diuji.
 */
export function occurrenceStatusNow(
  occurrence: Pick<ExpandedOccurrence, 'startAt' | 'endAt' | 'status'>,
  nowMs: number,
  graceMs: number,
): ScheduleOccurrence['status'] {
  if (occurrence.status === 'done') return 'done'
  if (nowMs <= occurrence.endAt) return 'pending'
  if (nowMs <= occurrence.endAt + graceMs) return 'pending'
  return 'missed'
}

/** Gabungkan kejadian dari beberapa jadwal jadi satu urutan waktu (kalender, F6). */
export function mergeOccurrences(
  groups: readonly (readonly ExpandedOccurrence[])[],
): readonly ExpandedOccurrence[] {
  const all: ExpandedOccurrence[] = []
  for (const group of groups) all.push(...group)

  return all.sort((a, b) => {
    if (a.startAt !== b.startAt) return a.startAt - b.startAt
    if (a.scheduleId !== b.scheduleId) return a.scheduleId < b.scheduleId ? -1 : 1
    return a.occurrenceAt - b.occurrenceAt
  })
}
