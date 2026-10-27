import { describe, expect, it } from 'vitest'

import { decideMerge, type RecordVersion } from './merge.ts'

/** M3: remote terautentikasi menang atas record lokal `opaque`; selain itu LWW biasa tidak berubah. */

const ID = '018f2c4e-0000-7000-8000-00000000000a'
const HIGH_HLC = '1800000000000-0-deviceb'
const LOW_HLC = '1700000000000-0-devicea'

function version(hlc: string, opaque?: boolean): RecordVersion {
  return { id: ID, hlc, deleted: false, ...(opaque === undefined ? {} : { opaque }) }
}

describe('decideMerge: lokal opaque', () => {
  it('remote terautentikasi ber-HLC lebih rendah tetap menang', () => {
    expect(
      decideMerge(version(HIGH_HLC, true), version(LOW_HLC), { incomingAuthenticated: true }),
    ).toEqual({ action: 'replace', reason: 'local_opaque', winner: 'incoming' })
  })

  it('remote tanpa bukti autentikasi memakai LWW biasa (tombstone keep #111 tidak berubah)', () => {
    expect(decideMerge(version(HIGH_HLC, true), version(LOW_HLC)).action).toBe('skip')
    expect(decideMerge(version(LOW_HLC, true), version(HIGH_HLC)).action).toBe('replace')
  })

  it('lokal non-opaque tidak terpengaruh walau remote terautentikasi', () => {
    for (const local of [version(HIGH_HLC), version(HIGH_HLC, false)]) {
      expect(decideMerge(local, version(LOW_HLC), { incomingAuthenticated: true })).toEqual({
        action: 'skip',
        reason: 'local_newer',
        winner: 'local',
      })
    }
  })

  it('HLC remote rusak tetap ditolak walau terautentikasi', () => {
    expect(
      decideMerge(version(HIGH_HLC, true), version('rusak'), { incomingAuthenticated: true })
        .reason,
    ).toBe('incoming_invalid')
  })

  it('tanpa versi lokal tetap insert', () => {
    expect(decideMerge(null, version(LOW_HLC), { incomingAuthenticated: true }).action).toBe(
      'insert',
    )
  })
})
