import { describe, expect, it } from 'vitest'

import {
  SEALED_RECORD_MAX_BLOB_BASE64_LENGTH,
  SEALED_RECORD_MAX_BLOB_BYTES,
  SYNC_MAX_BATCH,
  SYNC_MAX_PULL_BYTES,
  SYNC_MAX_PULL_LIMIT,
  SYNC_RECORD_STATUSES,
  sealedRecordDtoSchema,
  serverRecordSchema,
  serverSeqSchema,
  syncPullQuerySchema,
  syncPullResultSchema,
  syncPushInputSchema,
  syncPushResultSchema,
  syncRecordResultSchema,
} from './sync.ts'

function record(hlc: string, overrides: Record<string, unknown> = {}) {
  return {
    id: '018fabc1-def2-7abc-8def-0123456789ab',
    hlc,
    deleted: false,
    blob: 'AAAA',
    ...overrides,
  }
}

describe('sealedRecordDtoSchema', () => {
  it('menerima record ter-seal dan memaknai tombstone', () => {
    expect(sealedRecordDtoSchema.parse(record('1000-0-a')).deleted).toBe(false)
    expect(sealedRecordDtoSchema.parse(record('1000-0-a', { deleted: true })).deleted).toBe(true)
  })

  it('menolak id non-uuid, hlc tak terbaca, dan blob yang bukan base64', () => {
    expect(sealedRecordDtoSchema.safeParse(record('1000-0-a', { id: 'record-1' })).success).toBe(
      false,
    )
    expect(sealedRecordDtoSchema.safeParse(record('999-0-a b')).success).toBe(false)
    expect(sealedRecordDtoSchema.safeParse(record('1000-0-a', { blob: 'AAA' })).success).toBe(false)
  })

  it('menolak blob di atas batas ukuran (server menolak sebelum decode)', () => {
    const kebesaran = 'A'.repeat(SEALED_RECORD_MAX_BLOB_BASE64_LENGTH + 4)

    expect(sealedRecordDtoSchema.safeParse(record('1000-0-a', { blob: kebesaran })).success).toBe(
      false,
    )
    expect(SEALED_RECORD_MAX_BLOB_BYTES).toBe(1_048_576)
  })

  it('menolak field asing dan field teks polos yang bisa bocor ke server', () => {
    expect(
      sealedRecordDtoSchema.safeParse(record('1000-0-a', { type: 'todo', title: 'Belanja' }))
        .success,
    ).toBe(false)
    expect(
      sealedRecordDtoSchema.safeParse(record('1000-0-a', { userId: '018fabc1-def2-7abc-8def-012' }))
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
    expect(SYNC_MAX_PULL_BYTES).toBeLessThan(SYNC_MAX_PULL_LIMIT * SEALED_RECORD_MAX_BLOB_BYTES)
  })

  it('plafon byte tidak lebih kecil dari satu blob maksimum (halaman tidak bisa kosong)', () => {
    // Server selalu menyertakan MINIMAL satu record, jadi kalau plafonnya di bawah satu record
    // terbesar, halaman dengan satu record besar pun tidak bisa dikirim - klien akan macet di cursor
    // yang sama selamanya.
    expect(SYNC_MAX_PULL_BYTES).toBeGreaterThanOrEqual(SEALED_RECORD_MAX_BLOB_BYTES)
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
