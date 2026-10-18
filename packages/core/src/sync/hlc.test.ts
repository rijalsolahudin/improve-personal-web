import { compareHlc, formatHlc, parseHlc } from '@improve-personal/contracts'
import { describe, expect, it } from 'vitest'

import type { Clock } from '../ports.ts'
import { createManualClock } from '../adapters/clock.ts'
import { createHlcGenerator } from './hlc.ts'

/**
 * AC T21 bagian HLC: "konflik update-terakhir-menang" hanya benar kalau HLC-nya benar.
 *
 * Yang dibuktikan di sini:
 * - HLC yang dihasilkan selalu bisa dibaca ulang (`parseHlc`) dan selalu naik.
 * - Counter naik saat jam tidak maju (dua tulisan dalam milidetik yang sama).
 * - `observe` menarik waktu dari perangkat lain, jadi tulisan sesudahnya pasti menang.
 * - **Jam perangkat ngaco TIDAK menaikkan HLC**: jam fisik diambil dari `monotonicMs`, bukan `nowMs`.
 */

const START_MS = 1_700_000_000_000

describe('createHlcGenerator', () => {
  it('menghasilkan HLC valid yang selalu naik', () => {
    const clock = createManualClock(START_MS)
    const generator = createHlcGenerator({ deviceId: 'devicea', clock })

    const first = generator.tick()
    clock.advance(1)
    const second = generator.tick()

    expect(parseHlc(first).deviceId).toBe('devicea')
    expect(parseHlc(second).deviceId).toBe('devicea')
    expect(compareHlc(second, first)).toBe(1)
  })

  it('menaikkan counter saat jam fisik tidak maju', () => {
    const clock = createManualClock(START_MS)
    const generator = createHlcGenerator({ deviceId: 'devicea', clock })

    const first = parseHlc(generator.tick())
    const second = parseHlc(generator.tick())
    const third = parseHlc(generator.tick())

    expect(second.wallMs).toBe(first.wallMs)
    expect(second.counter).toBe(first.counter + 1)
    expect(third.counter).toBe(first.counter + 2)
  })

  it('observe menarik wall dari perangkat lain, tulisan berikutnya menang', () => {
    const clock = createManualClock(START_MS)
    const generator = createHlcGenerator({ deviceId: 'devicea', clock })

    const remote = formatHlc({ wallMs: START_MS + 10_000, counter: 3, deviceId: 'deviceb' })
    generator.observe(remote)

    const next = generator.tick()
    expect(compareHlc(next, remote)).toBe(1)
  })

  it('observe HLC rusak diabaikan, bukan dianggap waktu sah', () => {
    const clock = createManualClock(START_MS)
    const generator = createHlcGenerator({ deviceId: 'devicea', clock })

    const before = generator.peek()
    generator.observe('bukan-hlc')
    generator.observe('')

    expect(generator.peek()).toEqual(before)
  })

  it('tie-break deviceId: wall + counter sama, device lebih besar menang', () => {
    const clock = createManualClock(START_MS)
    const a = createHlcGenerator({ deviceId: 'device-a', clock })
    const b = createHlcGenerator({ deviceId: 'device-b', clock })

    const hlcA = a.tick()
    const hlcB = b.tick()

    expect(parseHlc(hlcA).deviceId).toBe('devicea')
    expect(parseHlc(hlcB).deviceId).toBe('deviceb')
    expect(compareHlc(hlcB, hlcA)).toBe(1)
  })

  it('jam dinding ngaco tidak menaikkan HLC (memakai monotonicMs)', () => {
    // Perangkat dengan jam 2035, tapi jam monotonik normal: HLC-nya tetap "sekarang".
    const skewedClock: Clock = {
      nowMs: () => START_MS + 200_000_000_000,
      monotonicMs: () => START_MS + 1_000,
    }
    const normalClock = createManualClock(START_MS + 2_000)

    const skewed = createHlcGenerator({ deviceId: 'devicea', clock: skewedClock })
    const normal = createHlcGenerator({ deviceId: 'deviceb', clock: normalClock })

    const skewedHlc = skewed.tick()
    const normalHlc = normal.tick()

    expect(skewedClock.nowMs()).toBeGreaterThan(normalClock.nowMs())
    expect(compareHlc(normalHlc, skewedHlc)).toBe(1)
  })

  it('counter yang lewat batas kolom server memajukan wall, bukan melempar error', () => {
    const clock = createManualClock(START_MS)
    const generator = createHlcGenerator({ deviceId: 'devicea', clock })

    // Bawa generator ke counter maksimum lewat observe, lalu tick harus tetap menghasilkan HLC sah.
    const nearLimit = formatHlc({ wallMs: START_MS, counter: 2_147_483_647, deviceId: 'devicea' })
    generator.observe(nearLimit)

    expect(generator.peek()).toEqual({ wallMs: START_MS + 1, counter: 0, deviceId: 'devicea' })

    const next = generator.tick()
    expect(parseHlc(next).wallMs).toBe(START_MS + 1)
    expect(compareHlc(next, nearLimit)).toBe(1)
  })
})
