import {
  KID_BYTES,
  RECORD_BLOB_MAGIC,
  RECORD_V2_CIPHERTEXT_OFFSET,
  RECORD_V2_KID_OFFSET,
  RECORD_V2_TAG_BYTES,
  RECORD_V2_VERSION_OFFSET,
  type ServerRecord,
} from '@improve-personal/contracts'
import { describe, expect, it, vi } from 'vitest'

import { createManualClock } from '../adapters/clock.ts'
import { createMemoryStorage } from '../adapters/memory.ts'
import type { RecordIndexEntry } from '../domain/envelope.ts'
import {
  RECORD_INDEX_KEEP,
  RECORD_PULL_FOREIGN,
  RECORD_PULL_REJECT,
  type HttpClient,
  type StorageAdapter,
} from '../ports.ts'
import { resolveBlobVerdict, type BlobKeyIdentity } from './blob-origin.ts'
import { createHlcGenerator, type HlcGenerator } from './hlc.ts'
import { pullDelta, type PullDeltaInput } from './pull.ts'

/**
 * Keputusan pull v2 (spec #120 §4.4): `'reject'` dikarantina, `'foreign'` tidak menghapus, remote sah
 * menang atas lokal `opaque` (M3), v1 tidak menimpa v2 lokal sah (W1b). Test #111 untuk jalur v1
 * ada di `pull.unreadable*.test.ts` dan TIDAK disentuh.
 */

const START_MS = 1_700_000_000_000
const ID_A = '018f2c4e-0000-7000-8000-00000000000a'
const ID_B = '018f2c4e-0000-7000-8000-00000000000b'
const UNKNOWN_VERSION = 0x03
const OLD_HLC = '1699999999999-0-deviceb'
const LOW_HLC = '1700000000500-0-deviceb'
const HIGH_HLC = '1700001000000-0-deviceb'
/** Jauh di depan jam lokal: kalau di-`observe`, `peek().wallMs` pasti ikut melompat. */
const FAR_FUTURE_HLC = '1900000000000-0-deviceb'
const NEXT_CURSOR = 9
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const OWN_KID = Uint8Array.from({ length: KID_BYTES }, (_, index) => 0x10 + index)
const LEGACY_KID = Uint8Array.from({ length: KID_BYTES }, (_, index) => 0x40 + index)
const OTHER_KID = Uint8Array.from({ length: KID_BYTES }, (_, index) => 0x70 + index)
const IDENTITY: BlobKeyIdentity = { ownKid: OWN_KID, legacyKid: LEGACY_KID }
const CIPHERTEXT_BYTES = 256 + RECORD_V2_TAG_BYTES
const V1_BLOB = 'djFkYXRhLWxhbWEtdGlkYWstYmVycHJlZmlrcy1pcHItc2FtYS1zZWthbGk='
const LOCAL_INDEX: RecordIndexEntry = {
  recordId: ID_A,
  entityType: 'todo',
  rangeStartMs: START_MS,
  rangeEndMs: null,
  updatedAtMs: START_MS,
}

function toBase64(bytes: Uint8Array): string {
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk =
      ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0)
    const remaining = bytes.length - index
    output +=
      BASE64_ALPHABET.charAt((chunk >> 18) & 63) + BASE64_ALPHABET.charAt((chunk >> 12) & 63)
    output += remaining > 1 ? BASE64_ALPHABET.charAt((chunk >> 6) & 63) : '='
    output += remaining > 2 ? BASE64_ALPHABET.charAt(chunk & 63) : '='
  }

  return output
}

function blobBytes(kid: Uint8Array, version: number): Uint8Array {
  const blob = new Uint8Array(RECORD_V2_CIPHERTEXT_OFFSET + CIPHERTEXT_BYTES).fill(0x55)
  blob.set(RECORD_BLOB_MAGIC, 0)
  blob[RECORD_V2_VERSION_OFFSET] = version
  blob.set(kid, RECORD_V2_KID_OFFSET)

  return blob
}

function v2Blob(kid: Uint8Array): string {
  return toBase64(blobBytes(kid, 0x02))
}

function remote(
  overrides: Partial<ServerRecord> & Pick<ServerRecord, 'hlc' | 'blob'>,
): ServerRecord {
  return { id: ID_A, deleted: false, serverSeq: 1, ...overrides }
}

function httpWithOnePage(records: ServerRecord[]): HttpClient {
  let call = 0

  return {
    postJson: async <T>(): Promise<T> => {
      throw new Error('pull tidak boleh memakai push')
    },
    getJson: async <T>(): Promise<T> => {
      call += 1
      return (call === 1
        ? { records, nextCursor: NEXT_CURSOR }
        : { records: [], nextCursor: NEXT_CURSOR }) as unknown as T
    },
  } as HttpClient
}

function setup() {
  const clock = createManualClock(START_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: 'device-a', clock })

  return { storage, hlc }
}

async function seedLocal(
  storage: StorageAdapter,
  input: { id?: string; blob: string; hlc?: string; opaque?: boolean; deleted?: boolean },
) {
  await storage.runTransaction('seed', async (tx) => {
    await tx.putRecord({
      sealed: {
        id: input.id ?? ID_A,
        hlc: input.hlc ?? OLD_HLC,
        deleted: input.deleted ?? false,
        blob: input.blob,
      },
      index: input.opaque === true ? RECORD_INDEX_KEEP : LOCAL_INDEX,
      ...(input.opaque === true ? { opaque: true } : {}),
      op: 'put',
      outbox: { id: 'outbox-seed', queuedAtMs: START_MS },
    })
    await tx.deleteOutboxRows(['outbox-seed'])
  })
}

function run(
  ctx: ReturnType<typeof setup>,
  records: ServerRecord[],
  extra: Partial<PullDeltaInput> = {},
) {
  return pullDelta({
    storage: ctx.storage,
    http: httpWithOnePage(records),
    url: '/v1/sync/pull',
    nowMs: START_MS,
    hlc: ctx.hlc,
    ...extra,
  })
}

function spyOnObserve(hlc: HlcGenerator, events: string[]): HlcGenerator {
  return {
    ...hlc,
    observe: (value) => {
      events.push(value)
      hlc.observe(value)
    },
  }
}

describe("pullDelta: 'reject' dikarantina, bukan dibuang (M2)", () => {
  it('blob mentah diserahkan ke onReject; tidak ditulis, tidak di-observe, cursor maju', async () => {
    const ctx = setup()
    const observed: string[] = []
    const onReject = vi.fn()
    const sampah = remote({ hlc: FAR_FUTURE_HLC, deleted: true, blob: v2Blob(OWN_KID) })

    const summary = await run(ctx, [sampah], {
      hlc: spyOnObserve(ctx.hlc, observed),
      indexFor: () => RECORD_PULL_REJECT,
      onReject,
    })

    expect(onReject).toHaveBeenCalledTimes(1)
    expect(onReject).toHaveBeenCalledWith(sampah)
    expect(observed).toEqual([])
    expect(ctx.hlc.peek().wallMs).toBeLessThan(Date.parse('2030-01-01'))
    await expect(ctx.storage.getRecord(ID_A)).resolves.toBeNull()
    expect(summary).toMatchObject({ applied: 0, skipped: 1, rejected: 1, cursor: NEXT_CURSOR })
    expect((await ctx.storage.getSyncState())?.cursor).toBe(NEXT_CURSOR)
  })

  it('tombstone reject tidak menghapus record lokal (tanpa fallback v1)', async () => {
    const ctx = setup()
    await seedLocal(ctx.storage, { blob: v2Blob(OWN_KID) })

    await run(ctx, [remote({ hlc: FAR_FUTURE_HLC, deleted: true, blob: v2Blob(OWN_KID) })], {
      indexFor: () => RECORD_PULL_REJECT,
      onReject: vi.fn(),
    })

    const stored = await ctx.storage.getRecord(ID_A)
    expect(stored).toMatchObject({ hlc: OLD_HLC, deleted: false })
    await expect(ctx.storage.listIndexByType('todo')).resolves.toEqual([LOCAL_INDEX])
  })

  it('tanpa onReject: melempar dan cursor TIDAK maju (blob tidak boleh hilang diam-diam)', async () => {
    const ctx = setup()

    await expect(
      run(ctx, [remote({ hlc: LOW_HLC, blob: V1_BLOB })], { indexFor: () => RECORD_PULL_REJECT }),
    ).rejects.toThrow(/onReject/)

    expect((await ctx.storage.getSyncState())?.cursor ?? 0).toBe(0)
  })

  it('onReject gagal (storage karantina) -> halaman diulang: cursor tidak maju, record lain tidak ditulis', async () => {
    const ctx = setup()

    await expect(
      run(ctx, [remote({ hlc: LOW_HLC, blob: V1_BLOB })], {
        indexFor: () => RECORD_PULL_REJECT,
        onReject: () => {
          throw new Error('kuota karantina')
        },
      }),
    ).rejects.toThrow('kuota karantina')

    expect((await ctx.storage.getSyncState())?.cursor ?? 0).toBe(0)
    await expect(ctx.storage.getRecord(ID_A)).resolves.toBeNull()
  })
})

describe("pullDelta: 'foreign' (KID lain) tidak menghapus", () => {
  it('tombstone foreign tidak menimpa versi lokal dan HLC-nya tidak menarik jam', async () => {
    const ctx = setup()
    const observed: string[] = []
    await seedLocal(ctx.storage, { blob: v2Blob(OWN_KID) })

    const summary = await run(
      ctx,
      [remote({ hlc: FAR_FUTURE_HLC, deleted: true, blob: v2Blob(OTHER_KID) })],
      {
        hlc: spyOnObserve(ctx.hlc, observed),
        indexFor: () => RECORD_PULL_FOREIGN,
      },
    )

    expect(await ctx.storage.getRecord(ID_A)).toMatchObject({ hlc: OLD_HLC, deleted: false })
    await expect(ctx.storage.listIndexByType('todo')).resolves.toEqual([LOCAL_INDEX])
    expect(observed).toEqual([])
    expect(summary).toMatchObject({ applied: 0, skipped: 1, foreign: 1, cursor: NEXT_CURSOR })
  })

  it('record hidup foreign dengan versi lokal dilewati walau HLC-nya lebih tinggi', async () => {
    const ctx = setup()
    await seedLocal(ctx.storage, { blob: v2Blob(OWN_KID) })

    await run(ctx, [remote({ hlc: HIGH_HLC, blob: v2Blob(OTHER_KID) })], {
      indexFor: () => RECORD_PULL_FOREIGN,
    })

    expect((await ctx.storage.getRecord(ID_A))?.blob).toBe(v2Blob(OWN_KID))
  })

  it('tanpa versi lokal: blob disimpan opaque tanpa mengarang index, HLC tidak di-observe', async () => {
    const ctx = setup()
    const observed: string[] = []

    const summary = await run(ctx, [remote({ hlc: HIGH_HLC, blob: v2Blob(OTHER_KID) })], {
      hlc: spyOnObserve(ctx.hlc, observed),
      indexFor: () => RECORD_PULL_FOREIGN,
    })

    expect(summary.applied).toBe(1)
    expect(await ctx.storage.getRecord(ID_A)).toMatchObject({
      blob: v2Blob(OTHER_KID),
      opaque: true,
    })
    await expect(ctx.storage.listIndexByType('todo')).resolves.toEqual([])
    expect(observed).toEqual([])
  })
})

describe('pullDelta: versi blob tak dikenal tidak bisa jadi tombstone palsu (H1)', () => {
  const futureBytes = blobBytes(OWN_KID, UNKNOWN_VERSION)
  const futureBlob = toBase64(futureBytes)

  // Jalur sungguhan: keputusan datang dari `resolveBlobVerdict` (v1 gagal dibuka), bukan stub.
  function indexForFuture(v1Closed: boolean): NonNullable<PullDeltaInput['indexFor']> {
    return async (record) => {
      const result = await resolveBlobVerdict({
        ...IDENTITY,
        blob: futureBytes,
        hlc: record.hlc,
        v1Closed,
        v1CutoffMs: null,
        openV2: () => ({ kind: 'failed' }),
        openV1: () => ({ kind: 'failed' }),
      })

      return result.verdict === 'accept' ? null : result.verdict
    }
  }

  it.each([false, true])(
    'tombstone versi tak dikenal ber-HLC tinggi tidak menghapus lokal v2 sah (v1Closed=%s)',
    async (v1Closed) => {
      const ctx = setup()
      const observed: string[] = []
      await seedLocal(ctx.storage, { blob: v2Blob(OWN_KID) })
      const wallBefore = ctx.hlc.peek().wallMs

      const summary = await run(
        ctx,
        [remote({ hlc: FAR_FUTURE_HLC, deleted: true, blob: futureBlob })],
        { hlc: spyOnObserve(ctx.hlc, observed), indexFor: indexForFuture(v1Closed) },
      )

      expect(await ctx.storage.getRecord(ID_A)).toMatchObject({
        hlc: OLD_HLC,
        deleted: false,
        blob: v2Blob(OWN_KID),
      })
      await expect(ctx.storage.listIndexByType('todo')).resolves.toEqual([LOCAL_INDEX])
      expect(observed).toEqual([])
      expect(ctx.hlc.peek().wallMs).toBe(wallBefore)
      expect(summary).toMatchObject({ applied: 0, skipped: 1, foreign: 1, cursor: NEXT_CURSOR })
    },
  )

  it.each([false, true])(
    'record hidup versi tak dikenal tanpa lokal tetap tersimpan opaque (v1Closed=%s)',
    async (v1Closed) => {
      const ctx = setup()

      const summary = await run(ctx, [remote({ hlc: HIGH_HLC, blob: futureBlob })], {
        indexFor: indexForFuture(v1Closed),
      })

      expect(summary).toMatchObject({ applied: 1, foreign: 1, cursor: NEXT_CURSOR })
      expect(await ctx.storage.getRecord(ID_A)).toMatchObject({
        blob: futureBlob,
        deleted: false,
        opaque: true,
      })
      await expect(ctx.storage.listIndexByType('todo')).resolves.toEqual([])
    },
  )
})

describe("pullDelta: tombstone 'keep' v1 tetap diterapkan (#111 tidak regresi)", () => {
  it('menang LWW atas lokal non-opaque, di-observe, index dihapus; hasilnya record opaque', async () => {
    const ctx = setup()
    const observed: string[] = []
    await seedLocal(ctx.storage, { blob: V1_BLOB })

    await run(ctx, [remote({ hlc: HIGH_HLC, deleted: true, blob: V1_BLOB })], {
      hlc: spyOnObserve(ctx.hlc, observed),
      indexFor: () => RECORD_INDEX_KEEP,
    })

    expect(await ctx.storage.getRecord(ID_A)).toMatchObject({ hlc: HIGH_HLC, deleted: true })
    await expect(ctx.storage.listIndexByType('todo')).resolves.toEqual([])
    expect(observed).toEqual([HIGH_HLC])
  })

  it('tombstone keep ber-HLC lebih rendah kalah dari lokal', async () => {
    const ctx = setup()
    await seedLocal(ctx.storage, { blob: V1_BLOB, hlc: HIGH_HLC })

    await run(ctx, [remote({ hlc: LOW_HLC, deleted: true, blob: V1_BLOB })], {
      indexFor: () => RECORD_INDEX_KEEP,
    })

    expect(await ctx.storage.getRecord(ID_A)).toMatchObject({ hlc: HIGH_HLC, deleted: false })
  })
})

describe('pullDelta: bayangan LWW record opaque (M3)', () => {
  it('remote sah ber-HLC lebih rendah menang atas lokal opaque; flag opaque hilang', async () => {
    const ctx = setup()
    await seedLocal(ctx.storage, { blob: v2Blob(OTHER_KID), hlc: FAR_FUTURE_HLC, opaque: true })

    const summary = await run(ctx, [remote({ hlc: LOW_HLC, blob: v2Blob(OWN_KID) })], {
      indexFor: () => null,
    })

    expect(summary.applied).toBe(1)
    const stored = await ctx.storage.getRecord(ID_A)
    expect(stored).toMatchObject({ hlc: LOW_HLC, blob: v2Blob(OWN_KID) })
    expect(stored?.opaque).toBeUndefined()
  })

  it('lokal non-opaque ber-HLC tinggi tetap menang atas remote sah ber-HLC lebih rendah', async () => {
    const ctx = setup()
    await seedLocal(ctx.storage, { blob: v2Blob(OWN_KID), hlc: HIGH_HLC })

    const summary = await run(ctx, [remote({ hlc: LOW_HLC, blob: v2Blob(OWN_KID) })], {
      indexFor: () => null,
    })

    expect(summary.applied).toBe(0)
    expect((await ctx.storage.getRecord(ID_A))?.hlc).toBe(HIGH_HLC)
  })

  it('remote yang juga tak terbaca (keep/foreign hidup) tidak menimpa lokal opaque', async () => {
    for (const decision of [RECORD_INDEX_KEEP, RECORD_PULL_FOREIGN] as const) {
      const ctx = setup()
      await seedLocal(ctx.storage, { blob: v2Blob(OTHER_KID), hlc: OLD_HLC, opaque: true })

      await run(ctx, [remote({ hlc: HIGH_HLC, blob: V1_BLOB })], { indexFor: () => decision })

      expect((await ctx.storage.getRecord(ID_A))?.hlc).toBe(OLD_HLC)
    }
  })
})

describe('pullDelta: v1 tidak boleh menimpa v2 lokal yang sah (W1b)', () => {
  const futureV1 = () => remote({ hlc: '1700001000000-0-deviceb', blob: V1_BLOB })

  it.each([
    ['KID sendiri', OWN_KID],
    ['KID legacy', LEGACY_KID],
  ])(
    'lokal v2 %s + remote v1 terbuka ber-HLC jauh lebih tinggi -> lokal utuh, karantina +1, cursor maju',
    async (_label, kid) => {
      const ctx = setup()
      const observed: string[] = []
      const onReject = vi.fn()
      await seedLocal(ctx.storage, { blob: v2Blob(kid), hlc: LOW_HLC })
      const downgrade = futureV1()

      const summary = await run(ctx, [downgrade], {
        hlc: spyOnObserve(ctx.hlc, observed),
        indexFor: () => null,
        onReject,
        keyIdentity: IDENTITY,
      })

      expect(await ctx.storage.getRecord(ID_A)).toMatchObject({ hlc: LOW_HLC, blob: v2Blob(kid) })
      await expect(ctx.storage.listIndexByType('todo')).resolves.toEqual([LOCAL_INDEX])
      expect(onReject).toHaveBeenCalledWith(downgrade)
      expect(observed).toEqual([])
      expect(summary).toMatchObject({ applied: 0, rejected: 1, cursor: NEXT_CURSOR })
    },
  )

  it('juga untuk tombstone v1 terbuka', async () => {
    const ctx = setup()
    await seedLocal(ctx.storage, { blob: v2Blob(OWN_KID), hlc: LOW_HLC })

    await run(ctx, [{ ...futureV1(), deleted: true }], {
      indexFor: () => null,
      onReject: vi.fn(),
      keyIdentity: IDENTITY,
    })

    expect(await ctx.storage.getRecord(ID_A)).toMatchObject({ hlc: LOW_HLC, deleted: false })
  })

  it('v2 sah baru dari remote tetap menimpa v2 lokal yang lebih tua', async () => {
    const ctx = setup()
    await seedLocal(ctx.storage, { blob: v2Blob(OWN_KID), hlc: LOW_HLC })
    const newer = remote({ hlc: HIGH_HLC, blob: v2Blob(OWN_KID) })

    const summary = await run(ctx, [newer], {
      indexFor: () => null,
      onReject: vi.fn(),
      keyIdentity: IDENTITY,
    })

    expect(summary).toMatchObject({ applied: 1, rejected: 0 })
    expect((await ctx.storage.getRecord(ID_A))?.hlc).toBe(HIGH_HLC)
  })

  it('lokal v1 (atau v2 KID lain) tidak dilindungi: v1 yang lebih baru tetap menang', async () => {
    const ctx = setup()
    await seedLocal(ctx.storage, { blob: V1_BLOB, hlc: LOW_HLC })

    const summary = await run(ctx, [futureV1()], {
      indexFor: () => null,
      onReject: vi.fn(),
      keyIdentity: IDENTITY,
    })

    expect(summary).toMatchObject({ applied: 1, rejected: 0 })
  })

  it('tanpa keyIdentity aturan W1b tidak aktif (perilaku v1 murni)', async () => {
    const ctx = setup()
    await seedLocal(ctx.storage, { blob: v2Blob(OWN_KID), hlc: LOW_HLC })

    const summary = await run(ctx, [futureV1()], { indexFor: () => null })

    expect(summary.applied).toBe(1)
  })

  it('v2 lokal yang mendarat SELAMA dekripsi ikut melindungi (re-cek snapshot kedua)', async () => {
    const ctx = setup()
    const onReject = vi.fn()
    const downgrade = futureV1()

    const summary = await run(ctx, [downgrade], {
      indexFor: async () => {
        await seedLocal(ctx.storage, { blob: v2Blob(OWN_KID), hlc: LOW_HLC })
        return null
      },
      onReject,
      keyIdentity: IDENTITY,
    })

    expect(await ctx.storage.getRecord(ID_A)).toMatchObject({ hlc: LOW_HLC, blob: v2Blob(OWN_KID) })
    expect(onReject).toHaveBeenCalledWith(downgrade)
    expect(summary).toMatchObject({ applied: 0, rejected: 1 })
  })

  it('downgrade tanpa onReject melempar (tidak boleh hilang diam-diam)', async () => {
    const ctx = setup()
    await seedLocal(ctx.storage, { blob: v2Blob(OWN_KID), hlc: LOW_HLC })

    await expect(
      run(ctx, [futureV1()], { indexFor: () => null, keyIdentity: IDENTITY }),
    ).rejects.toThrow(/onReject/)
  })
})

describe('pullDelta: onReject berjalan sebelum re-cek, bukan di antara re-cek dan transaksi (M1)', () => {
  it('edit lokal yang mendarat selama onReject tidak ditimpa remote yang lebih tua', async () => {
    const ctx = setup()
    const sampah = remote({ id: ID_B, hlc: LOW_HLC, blob: V1_BLOB })
    const older = remote({ hlc: LOW_HLC, blob: v2Blob(OWN_KID) })
    const edited = v2Blob(LEGACY_KID)

    const summary = await run(ctx, [sampah, older], {
      indexFor: (record) => (record.id === ID_B ? RECORD_PULL_REJECT : null),
      onReject: async () => {
        await seedLocal(ctx.storage, { blob: edited, hlc: HIGH_HLC })
      },
    })

    expect(await ctx.storage.getRecord(ID_A)).toMatchObject({ hlc: HIGH_HLC, blob: edited })
    expect(summary).toMatchObject({ applied: 0, rejected: 1, cursor: NEXT_CURSOR })
  })

  it('v2 lokal yang mendarat selama onReject melindungi dari v1 (W1b), v1 itu dikarantina', async () => {
    const ctx = setup()
    const onReject = vi.fn(async (record: ServerRecord) => {
      if (record.id === ID_B) await seedLocal(ctx.storage, { blob: v2Blob(OWN_KID), hlc: LOW_HLC })
    })
    const sampah = remote({ id: ID_B, hlc: LOW_HLC, blob: V1_BLOB })
    const downgrade = remote({ hlc: HIGH_HLC, blob: V1_BLOB })

    const summary = await run(ctx, [sampah, downgrade], {
      indexFor: (record) => (record.id === ID_B ? RECORD_PULL_REJECT : null),
      onReject,
      keyIdentity: IDENTITY,
    })

    expect(onReject).toHaveBeenCalledWith(downgrade)
    expect(await ctx.storage.getRecord(ID_A)).toMatchObject({
      hlc: LOW_HLC,
      blob: v2Blob(OWN_KID),
    })
    expect(summary).toMatchObject({ applied: 0, rejected: 2 })
  })

  it('edit lokal yang mendarat selama karantina downgrade juga dibaca ulang sebelum transaksi', async () => {
    const ctx = setup()
    const downgrade = remote({ hlc: HIGH_HLC, blob: V1_BLOB })
    const other = remote({ id: ID_B, hlc: LOW_HLC, blob: v2Blob(OWN_KID) })
    await seedLocal(ctx.storage, { blob: v2Blob(OWN_KID), hlc: LOW_HLC })

    await run(ctx, [downgrade, other], {
      indexFor: () => null,
      onReject: async () => {
        await seedLocal(ctx.storage, { id: ID_B, blob: v2Blob(LEGACY_KID), hlc: HIGH_HLC })
      },
      keyIdentity: IDENTITY,
    })

    expect(await ctx.storage.getRecord(ID_B)).toMatchObject({
      hlc: HIGH_HLC,
      blob: v2Blob(LEGACY_KID),
    })
  })
})
