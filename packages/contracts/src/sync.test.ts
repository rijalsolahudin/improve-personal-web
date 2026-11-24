import { describe, expect, it } from 'vitest'

import {
  SYNC_ACK_MAX_IDS,
  SYNC_CLOSE_CODES,
  SYNC_FRAME_MAX_BYTES,
  SYNC_RELAY_ERROR_CODES,
  SYNC_RELAY_FALLBACK_CODES,
  encodeSyncAuthMessage,
  formatSyncDriveFileName,
  parseSyncDriveFileName,
  syncClientMessageSchema,
  syncSegmentHeaderSchema,
  syncServerMessageSchema,
  type SyncDriveFile,
} from './sync.ts'

const DEVICE = '018f2c4e-0000-7000-8000-0000000000d1'
const PEER = '018f2c4e-0000-7000-8000-0000000000d2'
const LICENSE = '018f2c4e-0000-7000-8000-00000000000a'
const HLC_MIN = '1700000000123-0-a1b2'
const HLC_MAX = '1700000000999-3-a1b2'

const DELTA_HEADER = {
  format: 'ip-sync-seg',
  v: 1,
  kind: 'delta',
  epoch: 1,
  deviceId: DEVICE,
  seq: 42,
  hlcMin: HLC_MIN,
  hlcMax: HLC_MAX,
  count: 3,
}

const SNAPSHOT_HEADER = {
  format: 'ip-sync-seg',
  v: 1,
  kind: 'snapshot',
  epoch: 1,
  deviceId: DEVICE,
  snapshotId: '018f2c4e-0000-7000-8000-00000000005a',
  asOfSeq: 41,
  part: 1,
  parts: 2,
  hlcMin: HLC_MIN,
  hlcMax: HLC_MAX,
  count: 0,
}

const SEGMENT_BYTES = 'AAAA'

/** 64 byte (panjang tanda tangan Ed25519) dalam base64 standar. */
const SIGNATURE = `${'A'.repeat(86)}==`

describe('syncSegmentHeaderSchema', () => {
  it('menerima header delta dan snapshot yang sah', () => {
    expect(syncSegmentHeaderSchema.safeParse(DELTA_HEADER).success).toBe(true)
    expect(syncSegmentHeaderSchema.safeParse(SNAPSHOT_HEADER).success).toBe(true)
  })

  it('menolak delta kosong (flush tanpa perubahan tidak boleh memakan seq)', () => {
    expect(syncSegmentHeaderSchema.safeParse({ ...DELTA_HEADER, count: 0 }).success).toBe(false)
  })

  it('menolak delta tanpa seq dan snapshot dengan part > parts', () => {
    const noSeq = Object.fromEntries(Object.entries(DELTA_HEADER).filter(([key]) => key !== 'seq'))
    expect(syncSegmentHeaderSchema.safeParse(noSeq).success).toBe(false)
    expect(syncSegmentHeaderSchema.safeParse({ ...SNAPSHOT_HEADER, part: 3 }).success).toBe(false)
  })

  it('menolak field asing dan versi format lain', () => {
    expect(syncSegmentHeaderSchema.safeParse({ ...DELTA_HEADER, data: 'x' }).success).toBe(false)
    expect(syncSegmentHeaderSchema.safeParse({ ...DELTA_HEADER, v: 2 }).success).toBe(false)
    expect(
      syncSegmentHeaderSchema.safeParse({ ...DELTA_HEADER, format: 'ip-backup' }).success,
    ).toBe(false)
  })

  it('menolak hlc rusak dan epoch 0', () => {
    expect(syncSegmentHeaderSchema.safeParse({ ...DELTA_HEADER, hlcMin: 'nope' }).success).toBe(
      false,
    )
    expect(syncSegmentHeaderSchema.safeParse({ ...DELTA_HEADER, epoch: 0 }).success).toBe(false)
  })
})

describe('syncClientMessageSchema', () => {
  it('menerima auth dengan token + tanda tangan 64 byte', () => {
    expect(
      syncClientMessageSchema.safeParse({ t: 'auth', v: 1, token: 'YWJj.ZGVm', sig: SIGNATURE })
        .success,
    ).toBe(true)
  })

  it('auth tidak menerima lid/did terpisah (identitas hanya dari token)', () => {
    const message = { t: 'auth', v: 1, token: 'YWJj.ZGVm', sig: SIGNATURE, did: DEVICE }
    expect(syncClientMessageSchema.safeParse(message).success).toBe(false)
  })

  it('send delta wajib seq dan selalu broadcast', () => {
    const send = { t: 'send', clientRef: 'c1', epoch: 1, kind: 'delta', seq: 1, to: null }
    expect(syncClientMessageSchema.safeParse({ ...send, bytes: SEGMENT_BYTES }).success).toBe(true)
    expect(
      syncClientMessageSchema.safeParse({ ...send, seq: null, bytes: SEGMENT_BYTES }).success,
    ).toBe(false)
    expect(
      syncClientMessageSchema.safeParse({ ...send, to: PEER, bytes: SEGMENT_BYTES }).success,
    ).toBe(false)
  })

  it('send snapshot tanpa seq, boleh unicast', () => {
    const send = { t: 'send', clientRef: 'c2', epoch: 1, kind: 'snapshot', seq: null, to: PEER }
    expect(syncClientMessageSchema.safeParse({ ...send, bytes: SEGMENT_BYTES }).success).toBe(true)
    expect(
      syncClientMessageSchema.safeParse({ ...send, seq: 5, bytes: SEGMENT_BYTES }).success,
    ).toBe(false)
  })

  it('menolak segmen melebihi batas frame sebelum decode', () => {
    const tooBig = 'A'.repeat(Math.ceil(SYNC_FRAME_MAX_BYTES / 3) * 4 + 4)
    const send = { t: 'send', clientRef: 'c3', epoch: 1, kind: 'delta', seq: 1, to: null }
    expect(syncClientMessageSchema.safeParse({ ...send, bytes: tooBig }).success).toBe(false)
  })

  it('ack dibatasi jumlah id', () => {
    expect(syncClientMessageSchema.safeParse({ t: 'ack', ids: [1, 2] }).success).toBe(true)
    expect(syncClientMessageSchema.safeParse({ t: 'ack', ids: [] }).success).toBe(false)
    const tooMany = Array.from({ length: SYNC_ACK_MAX_IDS + 1 }, (_, index) => index + 1)
    expect(syncClientMessageSchema.safeParse({ t: 'ack', ids: tooMany }).success).toBe(false)
  })
})

describe('syncServerMessageSchema', () => {
  it('ready membawa pemberitahuan expired per pengirim', () => {
    const ready = { t: 'ready', epoch: 2, readOnly: false, expired: [{ from: PEER, upToSeq: 74 }] }
    expect(syncServerMessageSchema.safeParse(ready).success).toBe(true)
  })

  it('frame dan error berbentuk tetap', () => {
    const frame = {
      t: 'frame',
      id: 9,
      from: PEER,
      epoch: 1,
      kind: 'delta',
      seq: 75,
      bytes: SEGMENT_BYTES,
    }
    expect(syncServerMessageSchema.safeParse(frame).success).toBe(true)
    expect(
      syncServerMessageSchema.safeParse({ t: 'error', code: 'quota_daily', clientRef: 'c1' })
        .success,
    ).toBe(true)
    expect(
      syncServerMessageSchema.safeParse({ t: 'error', code: 'boom', clientRef: null }).success,
    ).toBe(false)
  })
})

describe('kode error relay', () => {
  it('kode fallback dan close code hanya memakai kode yang terdaftar', () => {
    for (const code of SYNC_RELAY_FALLBACK_CODES) expect(SYNC_RELAY_ERROR_CODES).toContain(code)
    for (const code of Object.keys(SYNC_CLOSE_CODES)) expect(SYNC_RELAY_ERROR_CODES).toContain(code)
  })

  it('close code berada di rentang aplikasi WebSocket', () => {
    for (const value of Object.values(SYNC_CLOSE_CODES)) {
      expect(value).toBeGreaterThanOrEqual(4000)
      expect(value).toBeLessThan(5000)
    }
  })
})

describe('encodeSyncAuthMessage', () => {
  it('string kanonik berlabel dan berversi', () => {
    expect(encodeSyncAuthMessage('bm9uY2U=', LICENSE, DEVICE)).toBe(
      `ip-sync-auth|v1|bm9uY2U=|${LICENSE}|${DEVICE}`,
    )
  })
})

describe('nama berkas Drive', () => {
  const files: SyncDriveFile[] = [
    { kind: 'key', epoch: 3 },
    { kind: 'pack', deviceId: DEVICE, seqFrom: 10, seqTo: 42 },
    { kind: 'snapshot', epoch: 3, hlc: HLC_MAX },
  ]

  it.each(files)('format lalu parse kembali ke nilai yang sama: %j', (file) => {
    expect(parseSyncDriveFileName(formatSyncDriveFileName(file))).toEqual(file)
  })

  it.each([
    'backup-2026.ipbackup',
    'sync-key.e0',
    `pack-${DEVICE}-42-10`,
    'pack-bukan-uuid-1-2',
    'snap-1-hlc-rusak',
  ])('menolak %j', (name) => {
    expect(parseSyncDriveFileName(name)).toBeNull()
  })
})
