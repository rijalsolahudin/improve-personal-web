// @vitest-environment node
//
// Sync (T21) - sisi server. Level SERVICE terhadap Postgres nyata.
//
// Tiga hal yang hanya bisa dibuktikan dengan DB nyata: (1) `server_seq` naik saat record yang sudah
// ada menang lagi, (2) ciphertext yang tersimpan benar-benar disegel server (bukan payload polos),
// (3) tombstones ikut pada pull. Test untuk `409 SYNC_RESET_REQUIRED` lewat HTTP ada di `http.test.ts`.
import { randomUUID } from 'node:crypto'

import {
  compareHlc,
  RECORD_PAYLOAD_MAX_BYTES,
  SYNC_MAX_BATCH,
  SYNC_MAX_PULL_BYTES,
  syncPullResultSchema,
  syncPushInputSchema,
  type SyncRecordDto,
} from '@improve-personal/contracts'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { pullRecords, pushRecords } from '../services/sync'
import { records, syncWatermarks } from '../db/schema'
import { RECORD_CIPHER_OVERHEAD_BYTES } from '../utils/record-crypto'
import {
  closeTestDb,
  FIXED_NOW,
  informationSchemaColumns,
  openStoredPayload,
  testDb,
  testPayload,
} from './helpers/harness'
import { captureProblem, testScope } from './helpers/scope'

const scope = testScope()

function recordDto(input: {
  readonly id: string
  readonly hlc: string
  readonly text?: string
  readonly deleted?: boolean
  readonly payload?: SyncRecordDto['payload']
}): SyncRecordDto {
  return {
    id: input.id,
    hlc: input.hlc,
    deleted: input.deleted ?? false,
    payload: input.payload ?? testPayload(input.text ?? `isi-${input.id}`),
  }
}

async function storedRecord(userId: string, id: string) {
  const rows = await testDb()
    .select()
    .from(records)
    .where(and(eq(records.userId, userId), eq(records.id, id)))

  return rows.at(0)
}

/** Payload yang dibuka dari `records.blob` - bentuk yang sama dengan yang dikirim client. */
function storedPayload(row: Awaited<ReturnType<typeof storedRecord>>): unknown {
  if (row === undefined) throw new Error('record tidak ditemukan')
  return openStoredPayload(row)
}

afterEach(async () => {
  await scope.dispose()
})

afterAll(async () => {
  await closeTestDb()
})

describe('POST /v1/sync/push - LWW', () => {
  it('jebakan HLC: "999-0-a" vs "1000-0-b" dibandingkan sebagai tuple, bukan string', async () => {
    // Perbandingan string akan salah di sini: '999-0-a' > '1000-0-b' secara leksikografis, padahal
    // 999 ms lebih tua daripada 1000 ms.
    expect('999-0-a' > '1000-0-b').toBe(true)
    expect(compareHlc('999-0-a', '1000-0-b')).toBe(-1)

    const fixture = scope.fixture({ prefix: 'sync-hlc-trap' })
    const userId = await fixture.userId()
    const id = randomUUID()

    const olderFirst = await pushRecords(fixture.ctx(), userId, [
      recordDto({ id, hlc: '999-0-a', text: 'versi-a' }),
    ])
    expect(olderFirst.results).toEqual([
      { id, status: 'applied', serverSeq: expect.any(Number) as unknown as number },
    ])

    // HLC yang lebih baru (wall_ms 1000 > 999) harus MENANG, walau sebagai string ia lebih kecil.
    const newerSecond = await pushRecords(fixture.ctx(), userId, [
      recordDto({ id, hlc: '1000-0-b', text: 'versi-b' }),
    ])
    expect(newerSecond.results.at(0)).toMatchObject({ id, status: 'applied' })

    const stored = await storedRecord(userId, id)
    expect(stored?.hlc).toBe('1000-0-b')
    expect(stored?.hlcWallMs).toBe(1000)
    expect(stored?.hlcDevice).toBe('b')
    expect(storedPayload(stored)).toEqual(testPayload('versi-b'))
  })

  it('hlc lebih lama -> stale, dan data yang tersimpan TIDAK berubah (server_seq tetap)', async () => {
    const fixture = scope.fixture({ prefix: 'sync-stale' })
    const userId = await fixture.userId()
    const id = randomUUID()

    const winner = await pushRecords(fixture.ctx(), userId, [
      recordDto({ id, hlc: '1000-0-b', text: 'versi-baru' }),
    ])
    const winnerSeq = winner.results.at(0)?.serverSeq

    const stale = await pushRecords(fixture.ctx(), userId, [
      recordDto({ id, hlc: '999-0-a', text: 'versi-lama' }),
    ])

    expect(stale.results.at(0)).toMatchObject({ id, status: 'stale', serverHlc: '1000-0-b' })
    expect(stale.results.at(0)?.serverSeq).toBeUndefined()

    const stored = await storedRecord(userId, id)
    expect(stored?.hlc).toBe('1000-0-b')
    expect(stored?.serverSeq).toBe(winnerSeq)
    expect(storedPayload(stored)).toEqual(testPayload('versi-baru'))
  })

  it('hlc sama -> stale (tie-break tidak membuat dua perangkat saling menimpa)', async () => {
    const fixture = scope.fixture({ prefix: 'sync-tie' })
    const userId = await fixture.userId()
    const id = randomUUID()

    await pushRecords(fixture.ctx(), userId, [recordDto({ id, hlc: '1500-0-a', text: 'pemenang' })])
    const tied = await pushRecords(fixture.ctx(), userId, [
      recordDto({ id, hlc: '1500-0-a', text: 'penantang' }),
    ])

    expect(tied.results.at(0)).toMatchObject({ status: 'stale', serverHlc: '1500-0-a' })
    expect(storedPayload(await storedRecord(userId, id))).toEqual(testPayload('pemenang'))
  })

  it('record yang menang lagi dapat `server_seq` BARU supaya perangkat lain menariknya', async () => {
    const fixture = scope.fixture({ prefix: 'sync-reseq' })
    const userId = await fixture.userId()
    const id = randomUUID()

    const first = await pushRecords(fixture.ctx(), userId, [
      recordDto({ id, hlc: '1000-0-a', text: 'v1' }),
    ])
    const second = await pushRecords(fixture.ctx(), userId, [
      recordDto({ id, hlc: '2000-0-a', text: 'v2' }),
    ])

    const firstSeq = first.results.at(0)?.serverSeq ?? 0
    const secondSeq = second.results.at(0)?.serverSeq ?? 0
    expect(secondSeq).toBeGreaterThan(firstSeq)
  })

  it('ciphertext tersimpan dalam format server dan tidak memuat teks payload', async () => {
    const fixture = scope.fixture({ prefix: 'sync-ciphertext' })
    const userId = await fixture.userId()
    const id = randomUUID()
    const text = 'isi-yang-tidak-boleh-terbaca-di-kolom-blob'

    await pushRecords(fixture.ctx(), userId, [
      recordDto({ id, hlc: '1000-0-a', payload: testPayload(text) }),
    ])

    const stored = await storedRecord(userId, id)
    expect(stored?.keyVersion).toBe(1)
    expect(
      Buffer.from(stored?.blob ?? new Uint8Array())
        .subarray(0, 4)
        .toString('ascii'),
    ).toBe('ips1')
    expect(Buffer.from(stored?.blob ?? new Uint8Array()).toString('utf8')).not.toContain(text)

    const pulled = await pullRecords(fixture.ctx(), userId, { cursor: 0, limit: 10 })
    expect(pulled.records.find((record) => record.id === id)?.payload).toEqual(testPayload(text))
    expect(syncPullResultSchema.safeParse(pulled).success).toBe(true)
  })

  it('hlc rusak ditolak SATU record saja (`rejected`), record lain dalam batch tetap masuk', async () => {
    const fixture = scope.fixture({ prefix: 'sync-rejected' })
    const userId = await fixture.userId()
    const goodId = randomUUID()
    const badId = randomUUID()

    const result = await pushRecords(fixture.ctx(), userId, [
      recordDto({ id: badId, hlc: '999-0-a' }),
      {
        id: badId,
        hlc: 'bukan-hlc-sama-sekali',
        deleted: false,
        payload: testPayload('x'),
      },
      recordDto({ id: goodId, hlc: '1000-0-a' }),
    ])

    expect(result.results.map((entry) => entry.status)).toEqual(['applied', 'rejected', 'applied'])
    expect(await storedRecord(userId, badId)).toBeDefined()
  })

  it('payload melebihi batas ditolak permanen (`rejected`), bukan disimpan setengah', async () => {
    const fixture = scope.fixture({ prefix: 'sync-oversize' })
    const userId = await fixture.userId()
    const id = randomUUID()

    const result = await pushRecords(fixture.ctx(), userId, [
      recordDto({
        id,
        hlc: '1000-0-a',
        payload: 'A'.repeat(RECORD_PAYLOAD_MAX_BYTES),
      }),
    ])

    expect(result.results.at(0)).toEqual({ id, status: 'rejected' })
    expect(await storedRecord(userId, id)).toBeUndefined()
  })

  it('deviceId di HLC dinormalkan (lowercase, tanpa dash) supaya tie-break konsisten', async () => {
    const fixture = scope.fixture({ prefix: 'sync-hlc-normalize' })
    const userId = await fixture.userId()
    const id = randomUUID()

    await pushRecords(fixture.ctx(), userId, [recordDto({ id, hlc: '1000-0-ABCD-1234' })])

    const stored = await storedRecord(userId, id)
    expect(stored?.hlcDevice).toBe('abcd1234')
    expect(stored?.hlc).toBe('1000-0-ABCD-1234')
  })

  it('batch di atas SYNC_MAX_BATCH ditolak schema', () => {
    const tooMany = Array.from({ length: SYNC_MAX_BATCH + 1 }, (_, index) =>
      recordDto({ id: randomUUID(), hlc: `1000-${index}-a` }),
    )

    expect(syncPushInputSchema.safeParse({ records: tooMany }).success).toBe(false)
    expect(
      syncPushInputSchema.safeParse({ records: tooMany.slice(0, SYNC_MAX_BATCH) }).success,
    ).toBe(true)
    expect(syncPushInputSchema.safeParse({ records: [] }).success).toBe(false)
  })

  it('batch yang tidak terurut naik berdasarkan hlc ditolak schema', () => {
    const unsorted = [
      recordDto({ id: randomUUID(), hlc: '2000-0-a' }),
      recordDto({ id: randomUUID(), hlc: '1000-0-a' }),
    ]

    expect(syncPushInputSchema.safeParse({ records: unsorted }).success).toBe(false)
  })

  it('user lain tidak bisa menimpa record user ini walau `id`-nya sama', async () => {
    const alice = scope.fixture({ prefix: 'sync-alice' })
    const bob = scope.fixture({ prefix: 'sync-bob' })
    const aliceId = await alice.userId()
    const bobId = await bob.userId()
    const sharedId = randomUUID()

    await pushRecords(bob.ctx(), bobId, [
      recordDto({ id: sharedId, hlc: '1000-0-a', text: 'milik-bob' }),
    ])
    const alicePush = await pushRecords(alice.ctx(), aliceId, [
      recordDto({ id: sharedId, hlc: '2000-0-b', text: 'milik-alice' }),
    ])

    expect(alicePush.results.at(0)?.status).toBe('applied')
    expect(storedPayload(await storedRecord(bobId, sharedId))).toEqual(testPayload('milik-bob'))
    expect(storedPayload(await storedRecord(aliceId, sharedId))).toEqual(testPayload('milik-alice'))
  })
})

describe('GET /v1/sync/pull - delta berhalaman', () => {
  it('hanya record setelah cursor, urut server_seq, dan nextCursor = posisi record terakhir', async () => {
    const fixture = scope.fixture({ prefix: 'sync-pull' })
    const userId = await fixture.userId()
    const first = randomUUID()
    const second = randomUUID()
    const third = randomUUID()

    await pushRecords(fixture.ctx(), userId, [
      recordDto({ id: first, hlc: '1000-0-a' }),
      recordDto({ id: second, hlc: '1001-0-a' }),
      recordDto({ id: third, hlc: '1002-0-a' }),
    ])

    const pageOne = await pullRecords(fixture.ctx(), userId, { cursor: 0, limit: 2 })
    expect(pageOne.records.map((record) => record.id)).toEqual([first, second])
    expect(pageOne.records.map((record) => record.serverSeq)).toEqual(
      [...pageOne.records.map((record) => record.serverSeq)].sort((left, right) => left - right),
    )
    expect(pageOne.nextCursor).toBe(pageOne.records.at(-1)?.serverSeq)

    const pageTwo = await pullRecords(fixture.ctx(), userId, {
      cursor: pageOne.nextCursor,
      limit: 2,
    })
    expect(pageTwo.records.map((record) => record.id)).toEqual([third])
    expect(pageTwo.nextCursor).toBe(pageTwo.records.at(0)?.serverSeq)

    // Halaman kosong TIDAK mereset cursor ke 0 - itu yang memicu full pull ulang tiap polling.
    const pageThree = await pullRecords(fixture.ctx(), userId, {
      cursor: pageTwo.nextCursor,
      limit: 2,
    })
    expect(pageThree.records).toEqual([])
    expect(pageThree.nextCursor).toBe(pageTwo.nextCursor)
  })

  it('tombstone ikut tersimpan dan ikut terkirim (delete tidak hilang diam-diam)', async () => {
    const fixture = scope.fixture({ prefix: 'sync-tombstone' })
    const userId = await fixture.userId()
    const id = randomUUID()

    await pushRecords(fixture.ctx(), userId, [recordDto({ id, hlc: '1000-0-a', text: 'hidup' })])
    const tombstone = await pushRecords(fixture.ctx(), userId, [
      recordDto({ id, hlc: '2000-0-a', deleted: true, text: 'sudah-dihapus' }),
    ])

    expect(tombstone.results.at(0)?.status).toBe('applied')
    expect((await storedRecord(userId, id))?.deleted).toBe(true)

    const pulled = await pullRecords(fixture.ctx(), userId, { cursor: 0, limit: 10 })
    expect(pulled.records.find((record) => record.id === id)?.deleted).toBe(true)
  })

  it('pull user A tidak pernah memuat record user B', async () => {
    const alice = scope.fixture({ prefix: 'pull-alice' })
    const bob = scope.fixture({ prefix: 'pull-bob' })
    const aliceId = await alice.userId()
    const bobId = await bob.userId()
    const bobRecordId = randomUUID()

    await pushRecords(bob.ctx(), bobId, [recordDto({ id: bobRecordId, hlc: '1000-0-a' })])

    const alicePull = await pullRecords(alice.ctx(), aliceId, { cursor: 0, limit: 50 })
    expect(alicePull.records).toEqual([])
    expect(alicePull.nextCursor).toBe(0)
    expect(JSON.stringify(alicePull)).not.toContain(bobRecordId)
  })

  it('payload dengan nama record user lain tidak bisa ditukar (AAD mengikat recordId)', async () => {
    const fixture = scope.fixture({ prefix: 'sync-swap' })
    const userId = await fixture.userId()
    const first = randomUUID()
    const second = randomUUID()

    await pushRecords(fixture.ctx(), userId, [
      recordDto({ id: first, hlc: '1000-0-a', text: 'milik-pertama' }),
      recordDto({ id: second, hlc: '1001-0-a', text: 'milik-kedua' }),
    ])

    // Tukar ciphertext antar-baris: harus GAGAL dibuka, bukan menampilkan isi record lain.
    const firstRow = await storedRecord(userId, first)
    const secondRow = await storedRecord(userId, second)
    if (firstRow === undefined || secondRow === undefined) throw new Error('fixture tidak lengkap')

    expect(() => openStoredPayload({ ...firstRow, blob: secondRow.blob })).toThrow()

    // Halaman pull tetap sehat karena AAD dibangun dari metadata barisnya sendiri.
    const pulled = await pullRecords(fixture.ctx(), userId, { cursor: 0, limit: 50 })
    expect(pulled.records.find((record) => record.id === first)?.payload).toEqual(
      testPayload('milik-pertama'),
    )
  })

  it('cursor di bawah purged_seq -> 409 SYNC_RESET_REQUIRED; cursor di atasnya aman', async () => {
    const fixture = scope.fixture({ prefix: 'sync-reset' })
    const userId = await fixture.userId()

    const pushed = await pushRecords(fixture.ctx(), userId, [
      recordDto({ id: randomUUID(), hlc: '1000-0-a' }),
    ])
    const pushedSeq = pushed.results.at(0)?.serverSeq ?? 0
    // `purged_seq` harus di ATAS `server_seq` record ini. `records_seq` adalah sequence GLOBAL, jadi
    // angka absolutnya bergeser setiap kali suite dijalankan - angka tetap (mis. 100) akan lulus di
    // run pertama dan gagal di run berikutnya begitu seq sudah melewatinya.
    const purgedSeq = pushedSeq + 10

    await fixture
      .ctx()
      .db.insert(syncWatermarks)
      .values({ userId, purgedSeq, updatedAt: FIXED_NOW })

    const problem = await captureProblem(
      pullRecords(fixture.ctx(), userId, { cursor: 0, limit: 10 }),
    )
    expect(problem).toMatchObject({ code: 'SYNC_RESET_REQUIRED', statusCode: 409 })

    const atWatermark = await pullRecords(fixture.ctx(), userId, { cursor: purgedSeq, limit: 10 })
    expect(atWatermark.records).toEqual([])
    expect(atWatermark.nextCursor).toBe(purgedSeq)

    const beyondWatermark = await pullRecords(fixture.ctx(), userId, {
      cursor: purgedSeq + 1,
      limit: 10,
    })
    expect(beyondWatermark.nextCursor).toBe(purgedSeq + 1)
  })
})

describe('GET /v1/sync/pull - plafon BYTE halaman (H2)', () => {
  /**
   * `count` record seukuran maksimum milik satu user. Inilah bentuk akun yang membuat temuan H2
   * berbahaya: `limit=500` pada akun seperti ini berarti respons ratusan MB yang dibangun utuh di
   * memori proses.
   */
  async function seedLargeRecords(
    fixture: ReturnType<typeof scope.fixture>,
    userId: string,
    count: number,
  ) {
    // String JSON `"xxx..."` memakan 2 byte tambahan, jadi panjangnya tepat batas payload.
    const payload = 'x'.repeat(RECORD_PAYLOAD_MAX_BYTES - 2)
    const ids = Array.from({ length: count }, () => randomUUID())

    await pushRecords(
      fixture.ctx(),
      userId,
      ids.map((id, index) => recordDto({ id, hlc: `1000-${index}-a`, payload })),
    )

    return { ids, perRecordBytes: RECORD_PAYLOAD_MAX_BYTES + RECORD_CIPHER_OVERHEAD_BYTES }
  }

  it('halaman dipotong supaya total byte tidak pernah melewati plafon, dan tidak ada record terlewat', async () => {
    const fixture = scope.fixture({ prefix: 'sync-pull-bytes' })
    const userId = await fixture.userId()
    const totalRecords = 6
    const { ids, perRecordBytes } = await seedLargeRecords(fixture, userId, totalRecords)
    const recordsPerPage = Math.floor(SYNC_MAX_PULL_BYTES / perRecordBytes)

    expect(recordsPerPage).toBeGreaterThanOrEqual(1)
    expect(recordsPerPage).toBeLessThan(totalRecords)

    const page = await pullRecords(fixture.ctx(), userId, { cursor: 0, limit: 50 })

    // Plafonnya NYATA: halaman lebih pendek dari `limit` yang diminta, dan total byte-nya di bawah
    // plafon - bukan 50 x 1 MB seperti sebelum perbaikan.
    expect(page.records).toHaveLength(recordsPerPage)
    const bytesInPage = page.records.reduce(
      (total, record) => total + Buffer.byteLength(JSON.stringify(record.payload), 'utf8'),
      0,
    )
    expect(bytesInPage).toBeLessThanOrEqual(SYNC_MAX_PULL_BYTES)
    expect(page.records.length * perRecordBytes).toBeLessThanOrEqual(SYNC_MAX_PULL_BYTES)

    // Bentuk halaman yang dipotong tetap sah menurut kontrak, dan kursornya menunjuk record TERAKHIR
    // yang benar-benar dikirim.
    expect(syncPullResultSchema.safeParse(page).success).toBe(true)
    expect(page.nextCursor).toBe(page.records.at(-1)?.serverSeq)

    // Berjalan lewat SEMUA halaman: gabungannya harus persis seluruh record, urut, tanpa terlewat.
    const seen: string[] = []
    let cursor = 0
    for (let hop = 0; hop <= totalRecords; hop += 1) {
      const next = await pullRecords(fixture.ctx(), userId, { cursor, limit: 50 })
      seen.push(...next.records.map((record) => record.id))
      if (next.records.length === 0) break
      cursor = next.nextCursor
    }

    expect(seen).toEqual(ids)
  })

  it('permintaan maksimum (`limit=500`) tetap tidak bisa membangun respons ratusan MB', async () => {
    const fixture = scope.fixture({ prefix: 'sync-pull-bytes-max' })
    const userId = await fixture.userId()
    const { perRecordBytes } = await seedLargeRecords(fixture, userId, 6)

    const page = await pullRecords(fixture.ctx(), userId, { cursor: 0, limit: 500 })

    // Inilah yang dulu menghasilkan ~500 MB untuk akun dengan 500 record 1 MB. Sekarang plafon byte
    // yang menentukan, jadi halaman terbesar yang mungkin adalah `SYNC_MAX_PULL_BYTES` (~4 MiB).
    expect(page.records.length * perRecordBytes).toBeLessThanOrEqual(SYNC_MAX_PULL_BYTES)
    expect(page.records.length).toBeLessThan(6)
  })

  it('halaman selalu berisi MINIMAL satu record (klien tidak bisa macet di cursor yang sama)', async () => {
    const fixture = scope.fixture({ prefix: 'sync-pull-bytes-progress' })
    const userId = await fixture.userId()
    const { ids } = await seedLargeRecords(fixture, userId, 1)

    const page = await pullRecords(fixture.ctx(), userId, { cursor: 0, limit: 1 })

    expect(page.records.map((record) => record.id)).toEqual(ids)
    expect(page.nextCursor).toBe(page.records.at(0)?.serverSeq)
  })
})

describe('bukti isi data user tetap ciphertext di database', () => {
  it('`records` tidak punya kolom plaintext data user (tidak ada type/title/content)', async () => {
    const columns = await informationSchemaColumns()

    const recordColumns = columns
      .filter((column) => column.table_name === 'records')
      .map((column) => column.column_name)
      .sort()

    expect(recordColumns).toEqual(
      [
        'blob',
        'created_at',
        'deleted',
        'hlc',
        'hlc_counter',
        'hlc_device',
        'hlc_wall_ms',
        'id',
        'key_version',
        'server_seq',
        'updated_at',
        'user_id',
      ].sort(),
    )

    // Kolom isi data user: kalau salah satunya muncul, ciphertext-only sudah tidak benar lagi.
    const forbidden = ['type', 'title', 'content', 'body', 'text', 'payload', 'plaintext', 'data']
    expect(recordColumns.filter((column) => forbidden.includes(column))).toEqual([])
  })

  it('tabel relay kunci sudah tidak ada lagi', async () => {
    const columns = await informationSchemaColumns()
    const tables = new Set(columns.map((column) => column.table_name))

    for (const table of ['key_envelopes', 'key_transfers', 'account_keys']) {
      expect(tables.has(table), table).toBe(false)
    }
  })
})
