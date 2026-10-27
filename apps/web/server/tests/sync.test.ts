// @vitest-environment node
//
// Sync (T21) - sisi server. Level SERVICE terhadap Postgres nyata.
//
// Tiga hal yang hanya bisa dibuktikan dengan DB nyata: (1) `server_seq` naik saat record yang sudah
// ada menang lagi, (2) ciphertext yang tersimpan identik dengan yang dikirim klien, (3) tombstones
// ikut pada pull. Test untuk `409 SYNC_RESET_REQUIRED` lewat HTTP ada di `http.test.ts`.
import { randomUUID } from 'node:crypto'

import {
  compareHlc,
  RECORD_V2_CIPHERTEXT_OFFSET,
  SEALED_RECORD_MAX_BLOB_BYTES,
  SYNC_MAX_BATCH,
  SYNC_MAX_PULL_BYTES,
  syncPullResultSchema,
  syncPushInputSchema,
  type SealedRecordDto,
} from '@improve-personal/contracts'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { pullRecords, pushRecords } from '../services/sync'
import { base64ToBytes, bytesToBase64 } from '../utils/crypto'
import { records, syncWatermarks } from '../db/schema'
import {
  claimedUserId,
  closeTestDb,
  FIXED_NOW,
  informationSchemaColumns,
  sealedBlobBase64,
  testDb,
} from './helpers/harness'
import { captureProblem, testScope } from './helpers/scope'

const scope = testScope()

function sealedRecord(input: {
  readonly id: string
  readonly hlc: string
  readonly text?: string
  readonly deleted?: boolean
  readonly blob?: string
}): SealedRecordDto {
  return {
    id: input.id,
    hlc: input.hlc,
    deleted: input.deleted ?? false,
    blob: input.blob ?? sealedBlobBase64(input.text ?? `ciphertext-${input.id}`),
  }
}

async function storedRecord(userId: string, id: string) {
  const rows = await testDb()
    .select()
    .from(records)
    .where(and(eq(records.userId, userId), eq(records.id, id)))

  return rows.at(0)
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
    const userId = await claimedUserId(fixture)
    const id = randomUUID()

    const olderFirst = await pushRecords(fixture.ctx(), userId, [
      sealedRecord({ id, hlc: '999-0-a', text: 'versi-a' }),
    ])
    expect(olderFirst.results).toEqual([
      { id, status: 'applied', serverSeq: expect.any(Number) as unknown as number },
    ])

    // HLC yang lebih baru (wall_ms 1000 > 999) harus MENANG, walau sebagai string ia lebih kecil.
    const newerSecond = await pushRecords(fixture.ctx(), userId, [
      sealedRecord({ id, hlc: '1000-0-b', text: 'versi-b' }),
    ])
    expect(newerSecond.results.at(0)).toMatchObject({ id, status: 'applied' })

    const stored = await storedRecord(userId, id)
    expect(stored?.hlc).toBe('1000-0-b')
    expect(stored?.hlcWallMs).toBe(1000)
    expect(stored?.hlcDevice).toBe('b')
    expect(bytesToBase64(stored?.blob ?? new Uint8Array())).toBe(sealedBlobBase64('versi-b'))
  })

  it('hlc lebih lama -> stale, dan data yang tersimpan TIDAK berubah (server_seq tetap)', async () => {
    const fixture = scope.fixture({ prefix: 'sync-stale' })
    const userId = await claimedUserId(fixture)
    const id = randomUUID()

    const winner = await pushRecords(fixture.ctx(), userId, [
      sealedRecord({ id, hlc: '1000-0-b', text: 'versi-baru' }),
    ])
    const winnerSeq = winner.results.at(0)?.serverSeq

    const stale = await pushRecords(fixture.ctx(), userId, [
      sealedRecord({ id, hlc: '999-0-a', text: 'versi-lama' }),
    ])

    expect(stale.results.at(0)).toMatchObject({ id, status: 'stale', serverHlc: '1000-0-b' })
    expect(stale.results.at(0)?.serverSeq).toBeUndefined()

    const stored = await storedRecord(userId, id)
    expect(stored?.hlc).toBe('1000-0-b')
    expect(stored?.serverSeq).toBe(winnerSeq)
    expect(bytesToBase64(stored?.blob ?? new Uint8Array())).toBe(sealedBlobBase64('versi-baru'))
  })

  it('hlc sama -> stale (tie-break tidak membuat dua perangkat saling menimpa)', async () => {
    const fixture = scope.fixture({ prefix: 'sync-tie' })
    const userId = await claimedUserId(fixture)
    const id = randomUUID()

    await pushRecords(fixture.ctx(), userId, [
      sealedRecord({ id, hlc: '1500-0-a', text: 'pemenang' }),
    ])
    const tied = await pushRecords(fixture.ctx(), userId, [
      sealedRecord({ id, hlc: '1500-0-a', text: 'penantang' }),
    ])

    expect(tied.results.at(0)).toMatchObject({ status: 'stale', serverHlc: '1500-0-a' })
    const stored = await storedRecord(userId, id)
    expect(bytesToBase64(stored?.blob ?? new Uint8Array())).toBe(sealedBlobBase64('pemenang'))
  })

  it('record yang menang lagi dapat `server_seq` BARU supaya perangkat lain menariknya', async () => {
    const fixture = scope.fixture({ prefix: 'sync-reseq' })
    const userId = await claimedUserId(fixture)
    const id = randomUUID()

    const first = await pushRecords(fixture.ctx(), userId, [
      sealedRecord({ id, hlc: '1000-0-a', text: 'v1' }),
    ])
    const second = await pushRecords(fixture.ctx(), userId, [
      sealedRecord({ id, hlc: '2000-0-a', text: 'v2' }),
    ])

    const firstSeq = first.results.at(0)?.serverSeq ?? 0
    const secondSeq = second.results.at(0)?.serverSeq ?? 0
    expect(secondSeq).toBeGreaterThan(firstSeq)
  })

  it('ciphertext tersimpan apa adanya: server tidak mengubah dan tidak mendekripsi apa pun', async () => {
    const fixture = scope.fixture({ prefix: 'sync-ciphertext' })
    const userId = await claimedUserId(fixture)
    const id = randomUUID()
    const plaintextLikePayload = 'XChaCha20-Poly1305|type=memo|isi=yang-tidak-boleh-dibaca-server'
    const blob = sealedBlobBase64(plaintextLikePayload)

    await pushRecords(fixture.ctx(), userId, [{ id, hlc: '1000-0-a', deleted: false, blob }])

    const stored = await storedRecord(userId, id)
    expect(bytesToBase64(stored?.blob ?? new Uint8Array())).toBe(blob)

    const pulled = await pullRecords(fixture.ctx(), userId, { cursor: 0, limit: 10 })
    const pulledRecord = pulled.records.find((record) => record.id === id)
    expect(pulledRecord?.blob).toBe(blob)
    expect(syncPullResultSchema.safeParse(pulled).success).toBe(true)
  })

  it('hlc rusak ditolak SATU record saja (`rejected`), record lain dalam batch tetap masuk', async () => {
    const fixture = scope.fixture({ prefix: 'sync-rejected' })
    const userId = await claimedUserId(fixture)
    const goodId = randomUUID()
    const badId = randomUUID()

    const result = await pushRecords(fixture.ctx(), userId, [
      sealedRecord({ id: badId, hlc: '999-0-a' }),
      {
        id: badId,
        hlc: 'bukan-hlc-sama-sekali',
        deleted: false,
        blob: sealedBlobBase64('x'),
      },
      sealedRecord({ id: goodId, hlc: '1000-0-a' }),
    ])

    expect(result.results.map((entry) => entry.status)).toEqual(['applied', 'rejected', 'applied'])
    expect(await storedRecord(userId, badId)).toBeDefined()
  })

  it('blob melebihi batas ditolak permanen (`rejected`), bukan disimpan setengah', async () => {
    const fixture = scope.fixture({ prefix: 'sync-oversize' })
    const userId = await claimedUserId(fixture)
    const id = randomUUID()
    const tooBig = bytesToBase64(new Uint8Array(SEALED_RECORD_MAX_BLOB_BYTES + 1))

    const result = await pushRecords(fixture.ctx(), userId, [
      sealedRecord({ id, hlc: '1000-0-a', blob: tooBig }),
    ])

    expect(result.results.at(0)).toEqual({ id, status: 'rejected' })
    expect(await storedRecord(userId, id)).toBeUndefined()
  })

  it('deviceId di HLC dinormalkan (lowercase, tanpa dash) supaya tie-break konsisten', async () => {
    const fixture = scope.fixture({ prefix: 'sync-hlc-normalize' })
    const userId = await claimedUserId(fixture)
    const id = randomUUID()

    await pushRecords(fixture.ctx(), userId, [sealedRecord({ id, hlc: '1000-0-ABCD-1234' })])

    const stored = await storedRecord(userId, id)
    expect(stored?.hlcDevice).toBe('abcd1234')
    expect(stored?.hlc).toBe('1000-0-ABCD-1234')
  })

  it('batch di atas SYNC_MAX_BATCH ditolak schema', () => {
    const tooMany = Array.from({ length: SYNC_MAX_BATCH + 1 }, (_, index) =>
      sealedRecord({ id: randomUUID(), hlc: `1000-${index}-a` }),
    )

    expect(syncPushInputSchema.safeParse({ records: tooMany }).success).toBe(false)
    expect(
      syncPushInputSchema.safeParse({ records: tooMany.slice(0, SYNC_MAX_BATCH) }).success,
    ).toBe(true)
    expect(syncPushInputSchema.safeParse({ records: [] }).success).toBe(false)
  })

  it('batch yang tidak terurut naik berdasarkan hlc ditolak schema', () => {
    const unsorted = [
      sealedRecord({ id: randomUUID(), hlc: '2000-0-a' }),
      sealedRecord({ id: randomUUID(), hlc: '1000-0-a' }),
    ]

    expect(syncPushInputSchema.safeParse({ records: unsorted }).success).toBe(false)
  })

  it('user lain tidak bisa menimpa record user ini walau `id`-nya sama', async () => {
    const alice = scope.fixture({ prefix: 'sync-alice' })
    const bob = scope.fixture({ prefix: 'sync-bob' })
    const aliceId = await claimedUserId(alice)
    const bobId = await claimedUserId(bob)
    const sharedId = randomUUID()

    await pushRecords(bob.ctx(), bobId, [
      sealedRecord({ id: sharedId, hlc: '1000-0-a', text: 'milik-bob' }),
    ])
    const alicePush = await pushRecords(alice.ctx(), aliceId, [
      sealedRecord({ id: sharedId, hlc: '2000-0-b', text: 'milik-alice' }),
    ])

    expect(alicePush.results.at(0)?.status).toBe('applied')
    expect(bytesToBase64((await storedRecord(bobId, sharedId))?.blob ?? new Uint8Array())).toBe(
      sealedBlobBase64('milik-bob'),
    )
    expect(bytesToBase64((await storedRecord(aliceId, sharedId))?.blob ?? new Uint8Array())).toBe(
      sealedBlobBase64('milik-alice'),
    )
  })
})

describe('GET /v1/sync/pull - delta berhalaman', () => {
  it('hanya record setelah cursor, urut server_seq, dan nextCursor = posisi record terakhir', async () => {
    const fixture = scope.fixture({ prefix: 'sync-pull' })
    const userId = await claimedUserId(fixture)
    const first = randomUUID()
    const second = randomUUID()
    const third = randomUUID()

    await pushRecords(fixture.ctx(), userId, [
      sealedRecord({ id: first, hlc: '1000-0-a' }),
      sealedRecord({ id: second, hlc: '1001-0-a' }),
      sealedRecord({ id: third, hlc: '1002-0-a' }),
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
    const userId = await claimedUserId(fixture)
    const id = randomUUID()

    await pushRecords(fixture.ctx(), userId, [sealedRecord({ id, hlc: '1000-0-a', text: 'hidup' })])
    const tombstone = await pushRecords(fixture.ctx(), userId, [
      sealedRecord({ id, hlc: '2000-0-a', deleted: true, text: 'sudah-dihapus' }),
    ])

    expect(tombstone.results.at(0)?.status).toBe('applied')
    const stored = await storedRecord(userId, id)
    expect(stored?.deleted).toBe(true)

    const pulled = await pullRecords(fixture.ctx(), userId, { cursor: 0, limit: 10 })
    expect(pulled.records.find((record) => record.id === id)?.deleted).toBe(true)
  })

  it('pull user A tidak pernah memuat record user B', async () => {
    const alice = scope.fixture({ prefix: 'pull-alice' })
    const bob = scope.fixture({ prefix: 'pull-bob' })
    const aliceId = await claimedUserId(alice)
    const bobId = await claimedUserId(bob)
    const bobRecordId = randomUUID()

    await pushRecords(bob.ctx(), bobId, [sealedRecord({ id: bobRecordId, hlc: '1000-0-a' })])

    const alicePull = await pullRecords(alice.ctx(), aliceId, { cursor: 0, limit: 50 })
    expect(alicePull.records).toEqual([])
    expect(alicePull.nextCursor).toBe(0)
    expect(JSON.stringify(alicePull)).not.toContain(bobRecordId)
  })

  it('cursor di bawah purged_seq -> 409 SYNC_RESET_REQUIRED; cursor di atasnya aman', async () => {
    const fixture = scope.fixture({ prefix: 'sync-reset' })
    const userId = await claimedUserId(fixture)

    const pushed = await pushRecords(fixture.ctx(), userId, [
      sealedRecord({ id: randomUUID(), hlc: '1000-0-a' }),
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
   * `count` record seukuran maksimum (masing-masing tepat `SEALED_RECORD_MAX_BLOB_BYTES`) milik satu
   * user. Inilah bentuk akun yang membuat temuan H2 berbahaya: `limit=500` pada akun seperti ini
   * berarti respons ratusan MB yang dibangun utuh di memori proses.
   */
  async function seedLargeRecords(
    fixture: ReturnType<typeof scope.fixture>,
    userId: string,
    count: number,
  ) {
    // Blob v2 sah yang panjangnya TEPAT batas maksimum (header + nonce = offset ciphertext).
    const blob = sealedBlobBase64(
      'x'.repeat(SEALED_RECORD_MAX_BLOB_BYTES - RECORD_V2_CIPHERTEXT_OFFSET),
    )
    const ids = Array.from({ length: count }, () => randomUUID())

    await pushRecords(
      fixture.ctx(),
      userId,
      ids.map((id, index) => sealedRecord({ id, hlc: `1000-${index}-a`, blob })),
    )

    return { ids, blob }
  }

  it('halaman dipotong supaya total byte tidak pernah melewati plafon, dan tidak ada record terlewat', async () => {
    const fixture = scope.fixture({ prefix: 'sync-pull-bytes' })
    const userId = await claimedUserId(fixture)
    const totalRecords = 6
    const { ids, blob } = await seedLargeRecords(fixture, userId, totalRecords)
    const perRecordBytes = base64ToBytes(blob).byteLength
    const recordsPerPage = Math.floor(SYNC_MAX_PULL_BYTES / perRecordBytes)

    expect(recordsPerPage).toBeGreaterThanOrEqual(1)
    expect(recordsPerPage).toBeLessThan(totalRecords)

    const page = await pullRecords(fixture.ctx(), userId, { cursor: 0, limit: 50 })

    // Plafonnya NYATA: halaman lebih pendek dari `limit` yang diminta, dan total byte-nya di bawah
    // plafon - bukan 50 x 1 MB seperti sebelum perbaikan.
    expect(page.records).toHaveLength(recordsPerPage)
    const bytesInPage = page.records.reduce(
      (total, record) => total + base64ToBytes(record.blob).byteLength,
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
    const userId = await claimedUserId(fixture)
    const { blob } = await seedLargeRecords(fixture, userId, 6)
    const perRecordBytes = base64ToBytes(blob).byteLength

    const page = await pullRecords(fixture.ctx(), userId, { cursor: 0, limit: 500 })

    // Inilah yang dulu menghasilkan ~500 MB untuk akun dengan 500 record 1 MB. Sekarang plafon byte
    // yang menentukan, jadi halaman terbesar yang mungkin adalah `SYNC_MAX_PULL_BYTES` (~4 MiB).
    expect(page.records.length * perRecordBytes).toBeLessThanOrEqual(SYNC_MAX_PULL_BYTES)
    expect(page.records.length).toBeLessThan(6)
  })

  it('halaman selalu berisi MINIMAL satu record (klien tidak bisa macet di cursor yang sama)', async () => {
    const fixture = scope.fixture({ prefix: 'sync-pull-bytes-progress' })
    const userId = await claimedUserId(fixture)
    const { ids } = await seedLargeRecords(fixture, userId, 1)

    const page = await pullRecords(fixture.ctx(), userId, { cursor: 0, limit: 1 })

    expect(page.records.map((record) => record.id)).toEqual(ids)
    expect(page.nextCursor).toBe(page.records.at(0)?.serverSeq)
  })
})

describe('bukti zero-knowledge pada skema DB', () => {
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
        'kid',
        'server_seq',
        'updated_at',
        'user_id',
      ].sort(),
    )

    // Kolom isi data user: kalau salah satunya muncul, ciphertext-only sudah tidak benar lagi.
    const forbidden = ['type', 'title', 'content', 'body', 'text', 'payload', 'plaintext', 'data']
    expect(recordColumns.filter((column) => forbidden.includes(column))).toEqual([])
  })
})
