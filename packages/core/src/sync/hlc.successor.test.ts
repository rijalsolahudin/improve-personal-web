import {
  HLC_MAX_COUNTER,
  HLC_MAX_WALL_MS,
  compareHlc,
  formatHlc,
  parseHlc,
} from '@improve-personal/contracts'
import { describe, expect, it } from 'vitest'

import { minimalSuccessorHlc } from './hlc.ts'

/**
 * W1a: HLC penerus minimal untuk re-seal v1 -> v2. Overflow counter/wall tidak boleh diam-diam
 * menghasilkan HLC rusak; pemanggil harus menerima sinyal untuk mengarantina record-nya.
 */

const WALL_MS = 1_700_000_000_000
const OTHER_DEVICE = 'deviceb'
const THIS_DEVICE = 'devicea'

describe('minimalSuccessorHlc', () => {
  it('wallMs sama, counter + 1, deviceId perangkat yang me-re-seal', () => {
    const old = formatHlc({ wallMs: WALL_MS, counter: 4, deviceId: OTHER_DEVICE })

    const result = minimalSuccessorHlc(old, THIS_DEVICE)

    expect(result.ok && parseHlc(result.hlc)).toEqual({
      wallMs: WALL_MS,
      counter: 5,
      deviceId: THIS_DEVICE,
    })
    expect(result.ok && compareHlc(result.hlc, old)).toBe(1)
  })

  it('selalu lebih besar dari HLC lama walau deviceId perangkat ini lebih kecil (tie-break)', () => {
    const old = formatHlc({ wallMs: WALL_MS, counter: 0, deviceId: 'zzzz' })

    const result = minimalSuccessorHlc(old, 'aaaa')

    expect(result.ok && compareHlc(result.hlc, old)).toBe(1)
  })

  it('counter di HLC_MAX_COUNTER: wallMs maju satu, counter 0 - tidak pernah counter di atas batas', () => {
    const old = formatHlc({ wallMs: WALL_MS, counter: HLC_MAX_COUNTER, deviceId: OTHER_DEVICE })

    const result = minimalSuccessorHlc(old, THIS_DEVICE)

    expect(result.ok && parseHlc(result.hlc)).toEqual({
      wallMs: WALL_MS + 1,
      counter: 0,
      deviceId: THIS_DEVICE,
    })
    expect(result.ok && compareHlc(result.hlc, old)).toBe(1)
  })

  it('wallMs maksimum + counter maksimum: tidak ada penerus -> exhausted (bukan HLC rusak)', () => {
    const old = formatHlc({
      wallMs: HLC_MAX_WALL_MS,
      counter: HLC_MAX_COUNTER,
      deviceId: OTHER_DEVICE,
    })

    expect(minimalSuccessorHlc(old, THIS_DEVICE)).toEqual({ ok: false, reason: 'exhausted' })
  })

  it('wallMs maksimum tapi counter masih longgar tetap punya penerus', () => {
    const old = formatHlc({
      wallMs: HLC_MAX_WALL_MS,
      counter: HLC_MAX_COUNTER - 1,
      deviceId: OTHER_DEVICE,
    })

    const result = minimalSuccessorHlc(old, THIS_DEVICE)

    expect(result.ok && parseHlc(result.hlc).counter).toBe(HLC_MAX_COUNTER)
  })

  it('HLC lama yang tidak terbaca -> invalid, tidak melempar', () => {
    expect(minimalSuccessorHlc('rusak', THIS_DEVICE)).toEqual({ ok: false, reason: 'invalid' })
    expect(minimalSuccessorHlc('', THIS_DEVICE)).toEqual({ ok: false, reason: 'invalid' })
  })
})
