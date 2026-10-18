import { describe, expect, it } from 'vitest'

import {
  HLC_MAX_COUNTER,
  HlcFormatError,
  compareHlc,
  formatHlc,
  hlcSchema,
  isValidHlc,
  normalizeDeviceId,
  parseHlc,
  tryParseHlc,
} from './hlc.ts'

/** Alasan kegagalan terstruktur, dipakai untuk memastikan pesan/kategori error tepat. */
function reasonOf(value: unknown): string {
  const result = tryParseHlc(value)
  return result.ok ? 'valid' : result.reason
}

describe('formatHlc / parseHlc', () => {
  it('round-trip: hasil formatHlc selalu bisa dibaca ulang parseHlc', () => {
    const hlc = formatHlc({ wallMs: 1_700_000_000_123, counter: 7, deviceId: 'a1b2' })

    expect(hlc).toBe('1700000000123-7-a1b2')
    expect(parseHlc(hlc)).toEqual({ wallMs: 1_700_000_000_123, counter: 7, deviceId: 'a1b2' })
  })

  it('menormalkan deviceId: lowercase, tanpa tanda hubung', () => {
    expect(normalizeDeviceId('018F-ABC1-DEF2')).toBe('018fabc1def2')
    expect(formatHlc({ wallMs: 1, counter: 0, deviceId: '018F-ABC1' })).toBe('1-0-018fabc1')
    expect(parseHlc('1-0-018F-ABC1')).toEqual({ wallMs: 1, counter: 0, deviceId: '018fabc1' })
  })

  it('menerima deviceId yang memuat tanda hubung (id perangkat boleh UUID)', () => {
    const result = tryParseHlc('1000-2-018fabc1-def2-4abc-8def-0123456789ab')

    expect(result.ok).toBe(true)
    expect(result).toMatchObject({ deviceId: '018fabc1def24abc8def0123456789ab' })
  })

  it('menolak input invalid dan menyebut alasannya', () => {
    const cases: readonly [unknown, string][] = [
      ['', 'empty'],
      ['   ', 'missing_parts'],
      ['abc', 'missing_parts'],
      ['1000', 'missing_parts'],
      ['1000-0', 'missing_parts'],
      ['-1-0-a', 'missing_parts'],
      ['1000--a', 'missing_parts'],
      ['1000-0-', 'invalid_device_id'],
      ['1000-0-a b', 'invalid_device_id'],
      ['1000-0-A_B', 'invalid_device_id'],
      [' 1000-0-a', 'invalid_wall_ms'],
      ['1000.5-0-a', 'invalid_wall_ms'],
      ['99999999999999999-0-a', 'invalid_wall_ms'],
      ['1000--1-a', 'missing_parts'],
      ['1000-2147483648-a', 'invalid_counter'],
      ['1000-0-a'.padEnd(300, 'a'), 'too_long'],
      [42, 'not_a_string'],
      [null, 'not_a_string'],
      [undefined, 'not_a_string'],
    ]

    for (const [value, reason] of cases) {
      expect(reasonOf(value), `harus ditolak: ${String(value)}`).toBe(reason)
    }
  })

  it('parseHlc melempar HlcFormatError dengan pesan yang jelas, tanpa memuat nilai utuh', () => {
    expect(() => parseHlc('abc')).toThrow(HlcFormatError)
    expect(() => parseHlc('abc')).toThrow(/hlc tidak valid \(tidak berbentuk/)

    const panjang = '9'.repeat(400)
    // Cuplikan dipotong supaya pesan log tidak ikut membengkak mengikuti input.
    expect(() => parseHlc(panjang)).toThrow(/\.\.\./)
  })

  it('formatHlc menolak bagian yang tidak masuk akal (bug programmer, bukan input user)', () => {
    expect(() => formatHlc({ wallMs: -1, counter: 0, deviceId: 'a' })).toThrow(HlcFormatError)
    expect(() => formatHlc({ wallMs: 1.5, counter: 0, deviceId: 'a' })).toThrow(HlcFormatError)
    expect(() => formatHlc({ wallMs: 1, counter: -1, deviceId: 'a' })).toThrow(HlcFormatError)
    expect(() => formatHlc({ wallMs: 1, counter: HLC_MAX_COUNTER + 1, deviceId: 'a' })).toThrow(
      HlcFormatError,
    )
    expect(() => formatHlc({ wallMs: 1, counter: 0, deviceId: 'a b' })).toThrow(HlcFormatError)
    expect(() => formatHlc({ wallMs: 1, counter: 0, deviceId: '' })).toThrow(HlcFormatError)
  })

  it('isValidHlc tidak pernah melempar, walau inputnya bukan string', () => {
    expect(isValidHlc('1000-0-a')).toBe(true)
    expect(isValidHlc('1000-0-')).toBe(false)
    expect(isValidHlc({ hlc: '1000-0-a' })).toBe(false)
    expect(isValidHlc(undefined)).toBe(false)
  })
})

describe('compareHlc', () => {
  it('membandingkan tuple, BUKAN string mentah (digit lebih panjang != lebih besar)', () => {
    expect(compareHlc('999-0-a', '1000-0-b')).toBe(-1)
    expect(compareHlc('1000-0-b', '999-0-a')).toBe(1)

    // Kalau dibandingkan sebagai string, hasilnya kebalikan - inilah bug yang dicegah.
    expect('999-0-a' < '1000-0-b').toBe(false)
  })

  it('wallMs sama: counter yang menentukan', () => {
    expect(compareHlc('1000-1-a', '1000-2-a')).toBe(-1)
    expect(compareHlc('1000-2-a', '1000-1-a')).toBe(1)
    expect(compareHlc('1000-2-a', '1000-2-a')).toBe(0)
  })

  it('tie wallMs + counter: deviceId kanonik yang menang (banding leksikografis)', () => {
    expect(compareHlc('1000-0-a', '1000-0-b')).toBe(-1)
    expect(compareHlc('1000-0-B', '1000-0-a')).toBe(1)
    expect(compareHlc('1000-0-AB-C', '1000-0-abd')).toBe(-1)
    expect(compareHlc('1000-0-a', '1000-0-a')).toBe(0)
  })

  it('hlc tidak valid tidak pernah menang atas hlc valid, dan tidak melempar', () => {
    expect(compareHlc('rusak', '1000-0-a')).toBe(-1)
    expect(compareHlc('1000-0-a', 'rusak')).toBe(1)
    expect(compareHlc('rusak', 'rusak')).toBe(0)
  })

  it('bisa dipakai sebagai komparator sort: urutannya kronologis', () => {
    const urut = ['1000-0-b', '999-0-a', '1000-1-a', '1000-0-a', '100-9-z']

    expect([...urut].sort(compareHlc)).toEqual([
      '100-9-z',
      '999-0-a',
      '1000-0-a',
      '1000-0-b',
      '1000-1-a',
    ])
  })
})

describe('hlcSchema', () => {
  it('menerima hlc valid dan menolak yang tidak bisa dibandingkan', () => {
    expect(hlcSchema.safeParse('1000-0-a').success).toBe(true)
    expect(hlcSchema.safeParse('1000-0-').success).toBe(false)
    expect(hlcSchema.safeParse(1000).success).toBe(false)
    expect(hlcSchema.safeParse('a'.repeat(500)).success).toBe(false)
  })
})
