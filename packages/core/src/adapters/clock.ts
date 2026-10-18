import type { Clock } from '../ports.ts'

/**
 * Implementasi `Clock` yang siap dipakai.
 *
 * `Clock` sengaja jadi port (ARCHITECTURE.md §5) supaya `domain/`, `recurrence/`, dan `calc/` tetap
 * murni. Tapi adapter (storage memori, test, dan shell platform) juga butuh jam - dan menyalin
 * `{ nowMs: () => Date.now() }` di tiap tempat membuat perilakunya bisa berbeda diam-diam. Dua helper
 * di sini yang jadi satu-satunya sumbernya.
 */

/**
 * Jam sistem: `Date.now()` untuk dua-duanya.
 *
 * Web dan native sama-sama punya sumber monotonik (`performance.now()`), dan adapter platform
 * sebaiknya memakai itu untuk `monotonicMs` (lihat catatan di `ports.ts`: HLC tidak boleh mundur
 * walau jam perangkat diubah). Helper ini dipakai kalau platform tidak menyediakannya - lebih baik
 * daripada tidak punya jam sama sekali.
 */
export function createSystemClock(): Clock {
  return {
    nowMs: () => Date.now(),
    monotonicMs: () => Date.now(),
  }
}

/**
 * Jam manual untuk test & adapter memori: waktu hanya bergerak kalau dimajukan pemanggil.
 *
 * `nowMs` dan `monotonicMs` sama-sama mengikuti satu nilai internal - cukup untuk test sync/io yang
 * butuh "waktu berlalu" tanpa menunggu waktu nyata, dan tidak ada `Date.now()` di jalur kode yang
 * diuji.
 */
export interface ManualClock extends Clock {
  /** Majukan jam `ms` milidetik. Negatif ditolak: waktu test juga tidak boleh mundur. */
  readonly advance: (ms: number) => void
  /** Set nilai absolut; hanya boleh maju, supaya urutan waktu di test tetap masuk akal. */
  readonly setTo: (ms: number) => void
  /** Nilai sekarang tanpa memajukan jam. */
  readonly currentMs: () => number
}

export function createManualClock(startMs = 0): ManualClock {
  if (!Number.isSafeInteger(startMs) || startMs < 0) {
    throw new Error(`createManualClock: startMs harus epoch ms non-negatif, dapat ${startMs}`)
  }

  let current = startMs

  return {
    nowMs: () => current,
    monotonicMs: () => current,
    currentMs: () => current,
    advance: (ms: number) => {
      if (!Number.isSafeInteger(ms) || ms < 0) {
        throw new Error(`ManualClock.advance: ms harus integer non-negatif, dapat ${ms}`)
      }
      current += ms
    },
    setTo: (ms: number) => {
      if (!Number.isSafeInteger(ms) || ms < current) {
        throw new Error(`ManualClock.setTo: ${ms} bukan epoch ms >= ${current}`)
      }
      current = ms
    },
  }
}
