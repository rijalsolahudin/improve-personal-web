import { describe, expect, it } from 'vitest'

import {
  RECORD_PAYLOAD_MAX_BYTES,
  SYNC_MAX_BATCH,
  SYNC_MAX_PULL_BYTES,
  SYNC_MAX_PULL_LIMIT,
  SYNC_RECORD_STATUSES,
  serverRecordSchema,
  serverSeqSchema,
  syncPullQuerySchema,
  syncPullResultSchema,
  syncPushInputSchema,
  syncPushResultSchema,
  syncRecordDtoSchema,
  syncRecordResultSchema,
} from './sync.ts'

function record(hlc: string, overrides: Record<string, unknown> = {}) {
  return {
    id: '018fabc1-def2-7abc-8def-0123456789ab',
    hlc,
    deleted: false,
    payload: { type: 'todo', schemaVersion: 1, data: { title: 'Belanja' } },
    ...overrides,
  }
}

describe('syncRecordDtoSchema', () => {
  it('menerima payload JSON dan memaknai tombstone', () => {
    expect(syncRecordDtoSchema.parse(record('1000-0-a')).deleted).toBe(false)
    expect(syncRecordDtoSchema.parse(record('1000-0-a', { deleted: true })).deleted).toBe(true)
  })

  it('menolak id non-uuid, hlc tak terbaca, dan payload yang hilang', () => {
    expect(syncRecordDtoSchema.safeParse(record('1000-0-a', { id: 'record-1' })).success).toBe(
      false,
    )
    expect(syncRecordDtoSchema.safeParse(record('999-0-a b')).success).toBe(false)
    expect(syncRecordDtoSchema.safeParse(record('1000-0-a', { payload: undefined })).success).toBe(
      false,
    )
  })

  it('menolak payload di atas batas ukuran (server menolak sebelum menyegel)', () => {
    const kebesaran = 'A'.repeat(RECORD_PAYLOAD_MAX_BYTES)

    expect(syncRecordDtoSchema.safeParse(record('1000-0-a', { payload: kebesaran })).success).toBe(
      false,
    )
    expect(RECORD_PAYLOAD_MAX_BYTES).toBe(1_048_576)
    expect(
      syncRecordDtoSchema.safeParse(
        record('1000-0-a', { payload: 'A'.repeat(RECORD_PAYLOAD_MAX_BYTES - 2) }),
      ).success,
    ).toBe(true)
  })

  it('menolak field asing di luar payload', () => {
    expect(
      syncRecordDtoSchema.safeParse(record('1000-0-a', { type: 'todo', title: 'Belanja' })).success,
    ).toBe(false)
    expect(
      syncRecordDtoSchema.safeParse(record('1000-0-a', { userId: '018fabc1-def2-7abc-8def-012' }))
        .success,
    ).toBe(false)
  })
})

describe('syncPushInputSchema', () => {
  it('menolak batch kosong dan batch di atas SYNC_MAX_BATCH', () => {
    expect(SYNC_MAX_BATCH).toBe(500)
    expect(syncPushInputSchema.safeParse({ records: [] }).success).toBe(false)
    expect(syncPushInputSchema.safeParse({ records: [record('1000-0-a')] }).success).toBe(true)

    const penuh = Array.from({ length: SYNC_MAX_BATCH }, (_value, index) =>
      record(`1000-${index}-a`),
    )
    expect(syncPushInputSchema.safeParse({ records: penuh }).success).toBe(true)
    expect(
      syncPushInputSchema.safeParse({ records: [...penuh, record(`1000-${SYNC_MAX_BATCH}-a`)] })
        .success,
    ).toBe(false)
  })

  it('mewajibkan urutan hlc naik, dan menolaknya lewat compareHlc (bukan string)', () => {
    const naik = syncPushInputSchema.safeParse({
      records: [record('999-0-a'), record('1000-0-b')],
    })
    expect(naik.success).toBe(true)

    // Urutan string mentah justru menganggap '999-0-a' lebih besar dari '1000-0-b'.
    expect(
      syncPushInputSchema.safeParse({ records: [record('1000-0-b'), record('999-0-a')] }).success,
    ).toBe(false)

    // Hlc sama boleh (pengiriman ulang record yang sama bersifat idempoten).
    expect(
      syncPushInputSchema.safeParse({ records: [record('1000-0-a'), record('1000-0-a')] }).success,
    ).toBe(true)
  })

  it('menolak field asing di level batch', () => {
    expect(
      syncPushInputSchema.safeParse({ records: [record('1000-0-a')], cursor: 5 }).success,
    ).toBe(false)
  })
})

describe('syncPushResultSchema', () => {
  it('menerima status applied/stale/rejected', () => {
    expect([...SYNC_RECORD_STATUSES]).toEqual(['applied', 'stale', 'rejected'])
    expect(
      syncPushResultSchema.safeParse({
        results: [
          { id: '018fabc1-def2-7abc-8def-0123456789ab', status: 'applied', serverSeq: 12 },
          {
            id: '018fabc1-def2-7abc-8def-0123456789ab',
            status: 'stale',
            serverSeq: 12,
            serverHlc: '1000-1-b',
          },
          { id: '018fabc1-def2-7abc-8def-0123456789ab', status: 'rejected' },
        ],
      }).success,
    ).toBe(true)
  })

  it('menolak status lama/tak dikenal dan serverSeq negatif', () => {
    expect(
      syncRecordResultSchema.safeParse({
        id: '018fabc1-def2-7abc-8def-0123456789ab',
        status: 'superseded',
      }).success,
    ).toBe(false)
    expect(
      syncRecordResultSchema.safeParse({
        id: '018fabc1-def2-7abc-8def-0123456789ab',
        status: 'applied',
        serverSeq: -1,
      }).success,
    ).toBe(false)
  })
})

describe('syncPullQuerySchema', () => {
  it('query kosong memakai default: cursor 0, limit default', () => {
    expect(syncPullQuerySchema.parse({})).toEqual({ cursor: 0, limit: 200 })
  })

  it('menerima cursor & limit dari query string, dan membatasinya', () => {
    expect(syncPullQuerySchema.parse({ cursor: '7', limit: '1' })).toEqual({ cursor: 7, limit: 1 })
    expect(syncPullQuerySchema.parse({ limit: '500' })).toEqual({ cursor: 0, limit: 500 })

    for (const invalid of [
      { cursor: '-1' },
      { cursor: 'abc' },
      { cursor: '1.5' },
      { limit: '0' },
      { limit: `${SYNC_MAX_PULL_LIMIT + 1}` },
      { cursor: '0', page: '2' },
    ]) {
      expect(syncPullQuerySchema.safeParse(invalid).success, JSON.stringify(invalid)).toBe(false)
    }
  })
})

describe('syncPullResultSchema', () => {
  it('record hasil pull wajib punya serverSeq', () => {
    expect(serverRecordSchema.safeParse(record('1000-0-a', { serverSeq: 3 })).success).toBe(true)
    expect(serverRecordSchema.safeParse(record('1000-0-a')).success).toBe(false)
  })

  it('menerima halaman dengan nextCursor dan halaman kosong', () => {
    expect(
      syncPullResultSchema.safeParse({
        records: [record('1000-0-a', { serverSeq: 3 })],
        nextCursor: 3,
      }).success,
    ).toBe(true)

    // Halaman kosong: nextCursor tetap cursor lama (jangan direset ke 0 -> memicu full pull).
    expect(syncPullResultSchema.parse({ records: [], nextCursor: 3 })).toEqual({
      records: [],
      nextCursor: 3,
    })
    expect(syncPullResultSchema.safeParse({ records: [] }).success).toBe(false)
  })

  it('serverSeq 0 berarti "belum ada record", bukan nilai negatif', () => {
    expect(serverSeqSchema.safeParse(0).success).toBe(true)
    expect(serverSeqSchema.safeParse(-1).success).toBe(false)
  })
})

describe('batas tarik (SYNC_MAX_PULL_BYTES vs SYNC_MAX_PULL_LIMIT)', () => {
  it('plafon byte benar-benar mengikat: lebih kecil dari halaman record penuh', () => {
    // Kalau plafon byte lebih longgar dari `SYNC_MAX_PULL_LIMIT` x blob maksimum, ia tidak menahan
    // apa pun dan lubang H2 (satu respons ratusan MB) tetap terbuka.
    expect(SYNC_MAX_PULL_BYTES).toBeLessThan(SYNC_MAX_PULL_LIMIT * RECORD_PAYLOAD_MAX_BYTES)
  })

  it('plafon byte tidak lebih kecil dari satu blob maksimum (halaman tidak bisa kosong)', () => {
    // Server selalu menyertakan MINIMAL satu record, jadi kalau plafonnya di bawah satu record
    // terbesar, halaman dengan satu record besar pun tidak bisa dikirim - klien akan macet di cursor
    // yang sama selamanya.
    expect(SYNC_MAX_PULL_BYTES).toBeGreaterThanOrEqual(RECORD_PAYLOAD_MAX_BYTES)
  })

  it('halaman yang dipotong plafon byte tetap sah menurut kontrak', () => {
    // Inilah bentuk yang dikirim server saat plafon byte memotong halaman: array lebih pendek dari
    // `limit` yang diminta klien. Bentuk ini TIDAK boleh ditolak schema - kalau ditolak, perbaikan
    // H2 justru mematahkan kontrak.
    const page = {
      records: [record('1000-0-a', { serverSeq: 1 })],
      nextCursor: 1,
    }

    const parsed = syncPullResultSchema.safeParse(page)
    expect(parsed.success).toBe(true)
  })
})
