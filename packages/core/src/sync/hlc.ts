import { HLC_MAX_COUNTER, formatHlc, tryParseHlc, type HlcTuple } from '@improve-personal/contracts'

import type { Clock } from '../ports.ts'

/**
 * Generator HLC (ARCHITECTURE.md §9, AC T21) - bagian "menandai kapan sebuah tulisan terjadi".
 *
 * Aturan yang dipegang di sini:
 * - **Waktu masuk lewat `Clock`**, tidak ada `Date.now()`. Test bisa memajukan waktu sesukanya.
 * - **Jam fisik dari `clock.monotonicMs()`**, bukan `nowMs`: jam perangkat boleh ngaco, dan HLC tidak
 *   boleh ikut ngaco. `ports.ts` mendefinisikan `monotonicMs` sebagai "epoch ms yang tidak mundur" -
 *   itu yang dipakai.
 * - **Counter naik kalau jam fisik tidak maju** (dua tulisan dalam milidetik yang sama, atau jam
 *   dimundurkan user). Counter jugalah yang dipakai saat `observe` menarik waktu dari perangkat lain.
 * - **Format/parse/compare tidak ditulis ulang di sini**: semuanya dari `@improve-personal/contracts`
 *   (`formatHlc`, `tryParseHlc`). Menyalin aturan HLC adalah cara paling gampang membuat data
 *   divergen permanen (`hlc.ts` di contracts).
 *
 * `deviceId` jadi tie-break terakhir, jadi dua perangkat dengan `wallMs` + `counter` identik tetap
 * menghasilkan urutan yang sama di semua perangkat (ARCHITECTURE.md §9: "Tie -> deviceId terbesar").
 */

export type HlcGeneratorOptions = {
  /** UUID perangkat (akan dinormalkan `formatHlc` ke bentuk kanonik). */
  readonly deviceId: string
  readonly clock: Clock
}

export interface HlcGenerator {
  /** Device id seperti yang dipakai generator ini. */
  readonly deviceId: string
  /**
   * HLC baru untuk satu tulisan lokal. Hasilnya SELALU lebih besar dari HLC mana pun yang sudah
   * pernah di-`tick`/di-`observe` generator ini.
   */
  readonly tick: () => string
  /**
   * Tarik waktu dari HLC perangkat lain (dari pull, atau dari HLC lokal tertinggi saat app dibuka).
   *
   * HLC yang tidak bisa dibaca diabaikan - bukan melempar error, dan bukan diam-diam menaikkan
   * counter. Record rusak tidak boleh memaksa perangkat ini memakai waktu palsu.
   */
  readonly observe: (hlc: string) => void
  /** Keadaan sekarang (untuk debug/persistensi perangkat). */
  readonly peek: () => HlcTuple
}

export function createHlcGenerator(options: HlcGeneratorOptions): HlcGenerator {
  let lastWallMs = 0
  let counter = 0

  /** Counter lewat batas kolom `int4` server: majukan wall satu langkah dan mulai counter dari 0. */
  function bumpCounter(): void {
    if (counter >= HLC_MAX_COUNTER) {
      lastWallMs += 1
      counter = 0
      return
    }
    counter += 1
  }

  function currentTuple(): HlcTuple {
    return { wallMs: lastWallMs, counter, deviceId: options.deviceId }
  }

  return {
    deviceId: options.deviceId,

    tick: () => {
      const nowMs = options.clock.monotonicMs()
      if (nowMs > lastWallMs) {
        lastWallMs = nowMs
        counter = 0
      } else {
        bumpCounter()
      }
      return formatHlc(currentTuple())
    },

    observe: (hlc: string) => {
      const parsed = tryParseHlc(hlc)
      if (!parsed.ok) return

      const nowMs = options.clock.monotonicMs()
      const previousWallMs = lastWallMs
      const wallMs = Math.max(previousWallMs, parsed.wallMs, nowMs)
      lastWallMs = wallMs

      // Aturan HLC standar: kalau wall ikut perangkat lain, counter kita mulai dari counter mereka
      // supaya tulisan berikutnya pasti lebih besar; kalau wall kita sendiri, cukup naikkan counter.
      if (wallMs === previousWallMs && wallMs === parsed.wallMs) {
        counter = Math.max(counter, parsed.counter)
        bumpCounter()
      } else if (wallMs === previousWallMs) {
        bumpCounter()
      } else if (wallMs === parsed.wallMs) {
        counter = parsed.counter
        bumpCounter()
      } else {
        counter = 0
      }
    },

    peek: () => currentTuple(),
  }
}
