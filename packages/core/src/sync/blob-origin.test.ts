import {
  KID_BYTES,
  RECORD_BLOB_MAGIC,
  RECORD_V2_CIPHERTEXT_OFFSET,
  RECORD_V2_KID_OFFSET,
  RECORD_V2_TAG_BYTES,
  RECORD_V2_VERSION_OFFSET,
  SEALED_RECORD_V2_OVERHEAD_BYTES,
  V1_CUTOFF_GRACE_MS,
  formatHlc,
  parseSealedBlobHeader,
} from '@improve-personal/contracts'
import { describe, expect, it, vi } from 'vitest'

import { RECORD_INDEX_KEEP, RECORD_PULL_FOREIGN, RECORD_PULL_REJECT } from '../ports.ts'
import {
  classifyBlobPrefix,
  hasRecordBlobMagic,
  isV1DowngradeOfV2,
  isWellFormedV2CiphertextLength,
  kidOwnerOf,
  peekBlobPrefix,
  resolveBlobVerdict,
  type OpenOutcome,
  type ResolveBlobInput,
} from './blob-origin.ts'

/**
 * Tabel keputusan M1 + M2 (versi tak dikenal) + L3 (kelipatan 256 B). Semuanya murni: provider
 * kripto diganti callback palsu, yang justru dipakai untuk membuktikan URUTAN percobaan (mis. "v2 KID
 * sendiri TIDAK PERNAH jatuh ke v1").
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const OWN_KID = Uint8Array.from({ length: KID_BYTES }, (_, index) => 0x10 + index)
const LEGACY_KID = Uint8Array.from({ length: KID_BYTES }, (_, index) => 0x40 + index)
const OTHER_KID = Uint8Array.from({ length: KID_BYTES }, (_, index) => 0x70 + index)
const PADDED_BLOCK = 256
const VALID_CIPHERTEXT_BYTES = PADDED_BLOCK + RECORD_V2_TAG_BYTES
const UNKNOWN_VERSION = 0x03
const CUTOFF_MS = 1_700_000_000_000
const WALL_BEFORE_CUTOFF = CUTOFF_MS - 1
const WALL_AFTER_GRACE = CUTOFF_MS + V1_CUTOFF_GRACE_MS + 1
const DEVICE = 'devicea'

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

/** Blob ber-header v2 palsu; isinya tidak penting karena kripto diganti callback. */
function v2Blob(
  kid: Uint8Array,
  ciphertextBytes = VALID_CIPHERTEXT_BYTES,
  version = 0x02,
): Uint8Array {
  const blob = new Uint8Array(RECORD_V2_CIPHERTEXT_OFFSET + ciphertextBytes).fill(0x55)
  blob.set(RECORD_BLOB_MAGIC, 0)
  blob[RECORD_V2_VERSION_OFFSET] = version
  blob.set(kid, RECORD_V2_KID_OFFSET)

  return blob
}

function plainV1Blob(): Uint8Array {
  return new Uint8Array(80).fill(0x21)
}

const OPENED: OpenOutcome<string> = { kind: 'opened', value: 'payload' }
const FAILED: OpenOutcome<string> = { kind: 'failed' }
const UNSUPPORTED: OpenOutcome<string> = { kind: 'unsupported' }

function setup(
  blob: Uint8Array,
  options: {
    v1Closed?: boolean
    v1CutoffMs?: number | null
    hlc?: string
    v2?: OpenOutcome<string>
    v1?: OpenOutcome<string>
  } = {},
) {
  const openV2 = vi.fn(async () => options.v2 ?? OPENED)
  const openV1 = vi.fn(async () => options.v1 ?? OPENED)
  const input: ResolveBlobInput<string> = {
    blob,
    hlc: options.hlc ?? formatHlc({ wallMs: WALL_BEFORE_CUTOFF, counter: 0, deviceId: DEVICE }),
    ownKid: OWN_KID,
    legacyKid: LEGACY_KID,
    v1Closed: options.v1Closed ?? false,
    v1CutoffMs: options.v1CutoffMs ?? null,
    openV2,
    openV1,
  }

  return { input, openV2, openV1 }
}

describe('hasRecordBlobMagic / classifyBlobPrefix (M2)', () => {
  it('mengenali magic "ipr" dan byte versi, tanpa menyamakan semua versi dengan v2', () => {
    expect(hasRecordBlobMagic(v2Blob(OWN_KID))).toBe(true)
    expect(hasRecordBlobMagic(v2Blob(OWN_KID, VALID_CIPHERTEXT_BYTES, UNKNOWN_VERSION))).toBe(true)
    expect(hasRecordBlobMagic(plainV1Blob())).toBe(false)
    // Hanya 3 byte: tidak ada byte versi, jadi bukan header yang bisa dinilai.
    expect(hasRecordBlobMagic(Uint8Array.from(RECORD_BLOB_MAGIC))).toBe(false)
    expect(hasRecordBlobMagic(new Uint8Array(0))).toBe(false)
  })

  it('v2 utuh -> v2 dengan KID; versi lain -> unknown-version; selain itu -> none', () => {
    const v2 = classifyBlobPrefix(v2Blob(OWN_KID))
    expect(v2.kind).toBe('v2')
    expect(v2.kind === 'v2' && [...v2.kid]).toEqual([...OWN_KID])

    for (const version of [0x00, 0x01, UNKNOWN_VERSION, 0xff]) {
      expect(classifyBlobPrefix(v2Blob(OWN_KID, VALID_CIPHERTEXT_BYTES, version)).kind).toBe(
        'unknown-version',
      )
    }

    expect(classifyBlobPrefix(plainV1Blob()).kind).toBe('none')
    // ipr\x02 tetapi lebih pendek dari 60 B: bukan prefix v2 (spec §4.4), jalur v1.
    const short = v2Blob(OWN_KID).subarray(0, SEALED_RECORD_V2_OVERHEAD_BYTES - 1)
    expect(classifyBlobPrefix(short).kind).toBe('none')
  })

  it('selaras dengan parseSealedBlobHeader: v2 persis ketika parser mengembalikan header', () => {
    const samples = [
      v2Blob(OWN_KID),
      v2Blob(OTHER_KID, RECORD_V2_TAG_BYTES),
      v2Blob(OWN_KID).subarray(0, SEALED_RECORD_V2_OVERHEAD_BYTES - 1),
      v2Blob(OWN_KID, VALID_CIPHERTEXT_BYTES, UNKNOWN_VERSION),
      plainV1Blob(),
    ]
    for (const blob of samples) {
      expect(classifyBlobPrefix(blob).kind === 'v2').toBe(parseSealedBlobHeader(blob) !== null)
    }
  })
})

describe('peekBlobPrefix', () => {
  it('memberi hasil yang sama dengan classifyBlobPrefix atas blob yang sudah di-decode', () => {
    const samples = [
      v2Blob(OWN_KID),
      v2Blob(OTHER_KID, VALID_CIPHERTEXT_BYTES + PADDED_BLOCK),
      v2Blob(OWN_KID, VALID_CIPHERTEXT_BYTES, UNKNOWN_VERSION),
      v2Blob(OWN_KID).subarray(0, SEALED_RECORD_V2_OVERHEAD_BYTES - 1),
      v2Blob(OWN_KID).subarray(0, SEALED_RECORD_V2_OVERHEAD_BYTES),
      plainV1Blob(),
      new Uint8Array(5).fill(1),
    ]
    for (const blob of samples) {
      const peeked = peekBlobPrefix(toBase64(blob))
      const classified = classifyBlobPrefix(blob)
      expect(peeked.kind).toBe(classified.kind)
      if (peeked.kind === 'v2' && classified.kind === 'v2') {
        expect([...peeked.kid]).toEqual([...classified.kid])
      }
    }
  })

  it('base64 yang tidak valid dianggap tanpa prefix, tidak melempar', () => {
    expect(peekBlobPrefix('')).toEqual({ kind: 'none' })
    expect(peekBlobPrefix('bukan base64!!'.repeat(10))).toEqual({ kind: 'none' })
    expect(peekBlobPrefix(`${toBase64(v2Blob(OWN_KID))}A`)).toEqual({ kind: 'none' })
    expect(peekBlobPrefix('-'.repeat(120))).toEqual({ kind: 'none' })
  })
})

describe('isWellFormedV2CiphertextLength (L3)', () => {
  it('hanya menerima padded kelipatan 256 B (minimal satu blok) + tag 16 B', () => {
    expect(isWellFormedV2CiphertextLength(PADDED_BLOCK + RECORD_V2_TAG_BYTES)).toBe(true)
    expect(isWellFormedV2CiphertextLength(2 * PADDED_BLOCK + RECORD_V2_TAG_BYTES)).toBe(true)

    expect(isWellFormedV2CiphertextLength(0)).toBe(false)
    expect(isWellFormedV2CiphertextLength(RECORD_V2_TAG_BYTES)).toBe(false)
    expect(isWellFormedV2CiphertextLength(PADDED_BLOCK)).toBe(false)
    expect(isWellFormedV2CiphertextLength(PADDED_BLOCK + RECORD_V2_TAG_BYTES + 1)).toBe(false)
    expect(isWellFormedV2CiphertextLength(PADDED_BLOCK + RECORD_V2_TAG_BYTES - 1)).toBe(false)
  })
})

describe('kidOwnerOf', () => {
  it('membedakan KID sendiri, legacy, dan lain; legacy opsional', () => {
    expect(kidOwnerOf(OWN_KID, { ownKid: OWN_KID, legacyKid: LEGACY_KID })).toBe('own')
    expect(kidOwnerOf(LEGACY_KID, { ownKid: OWN_KID, legacyKid: LEGACY_KID })).toBe('legacy')
    expect(kidOwnerOf(OTHER_KID, { ownKid: OWN_KID, legacyKid: LEGACY_KID })).toBe('other')
    expect(kidOwnerOf(LEGACY_KID, { ownKid: OWN_KID })).toBe('other')
    expect(kidOwnerOf(LEGACY_KID, { ownKid: OWN_KID, legacyKid: null })).toBe('other')
  })
})

describe('resolveBlobVerdict: prefix v2 + KID sendiri (tanpa fallback v1)', () => {
  it('sah -> accept v2-own, dan v1 tidak pernah dicoba', async () => {
    const { input, openV1, openV2 } = setup(v2Blob(OWN_KID))

    await expect(resolveBlobVerdict(input)).resolves.toEqual({
      verdict: 'accept',
      origin: 'v2-own',
      value: 'payload',
    })
    expect(openV2).toHaveBeenCalledWith(expect.anything(), 'own')
    expect(openV1).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    'AEAD gagal -> reject authentication (v1Closed=%s), tanpa fallback v1',
    async (v1Closed) => {
      const { input, openV1 } = setup(v2Blob(OWN_KID), { v1Closed, v2: FAILED, v1: OPENED })

      await expect(resolveBlobVerdict(input)).resolves.toEqual({
        verdict: RECORD_PULL_REJECT,
        reason: 'authentication',
      })
      expect(openV1).not.toHaveBeenCalled()
    },
  )

  it('payload tak dikenal (AEAD lolos) -> keep, bukan reject', async () => {
    const { input } = setup(v2Blob(OWN_KID), { v2: UNSUPPORTED })

    await expect(resolveBlobVerdict(input)).resolves.toEqual({ verdict: RECORD_INDEX_KEEP })
  })

  it('panjang ciphertext bukan kelipatan 256 B -> reject, tanpa memanggil kripto sama sekali (L3)', async () => {
    for (const bytes of [RECORD_V2_TAG_BYTES, VALID_CIPHERTEXT_BYTES + 1, PADDED_BLOCK]) {
      const { input, openV1, openV2 } = setup(v2Blob(OWN_KID, bytes))

      await expect(resolveBlobVerdict(input)).resolves.toEqual({
        verdict: RECORD_PULL_REJECT,
        reason: 'malformed_length',
      })
      expect(openV2).not.toHaveBeenCalled()
      expect(openV1).not.toHaveBeenCalled()
    }
  })

  it('exception dari provider (mis. kegagalan kunci) merambat, tidak ditelan jadi reject', async () => {
    const { input } = setup(v2Blob(OWN_KID))
    const failing = {
      ...input,
      openV2: async () => {
        throw new Error('kunci tidak tersedia')
      },
    }

    await expect(resolveBlobVerdict(failing)).rejects.toThrow('kunci tidak tersedia')
  })
})

describe('resolveBlobVerdict: prefix v2 + KID legacy', () => {
  it('sah -> accept v2-legacy dengan kunci legacy; gagal -> reject', async () => {
    const ok = setup(v2Blob(LEGACY_KID))
    await expect(resolveBlobVerdict(ok.input)).resolves.toMatchObject({
      verdict: 'accept',
      origin: 'v2-legacy',
    })
    expect(ok.openV2).toHaveBeenCalledWith(expect.anything(), 'legacy')

    const bad = setup(v2Blob(LEGACY_KID), { v2: FAILED })
    await expect(resolveBlobVerdict(bad.input)).resolves.toEqual({
      verdict: RECORD_PULL_REJECT,
      reason: 'authentication',
    })
    expect(bad.openV1).not.toHaveBeenCalled()
  })
})

describe('resolveBlobVerdict: prefix v2 + KID lain', () => {
  it('v1Closed=false: terbuka sebagai v1 (tabrakan nonce) -> accept v1; gagal -> foreign', async () => {
    const collided = setup(v2Blob(OTHER_KID))
    await expect(resolveBlobVerdict(collided.input)).resolves.toMatchObject({
      verdict: 'accept',
      origin: 'v1',
    })
    expect(collided.openV2).not.toHaveBeenCalled()

    const foreign = setup(v2Blob(OTHER_KID), { v1: FAILED })
    await expect(resolveBlobVerdict(foreign.input)).resolves.toEqual({
      verdict: RECORD_PULL_FOREIGN,
    })
  })

  it('cek kelipatan 256 B TIDAK berlaku untuk KID lain: blob v1 yang kebetulan berawalan v2 tetap terbuka', async () => {
    const { input } = setup(v2Blob(OTHER_KID, VALID_CIPHERTEXT_BYTES + 7))

    await expect(resolveBlobVerdict(input)).resolves.toMatchObject({
      verdict: 'accept',
      origin: 'v1',
    })
  })

  it('v1Closed=true: foreign tanpa mencoba v1', async () => {
    const { input, openV1 } = setup(v2Blob(OTHER_KID), { v1Closed: true })

    await expect(resolveBlobVerdict(input)).resolves.toEqual({ verdict: RECORD_PULL_FOREIGN })
    expect(openV1).not.toHaveBeenCalled()
  })

  it('v1 asli dengan payload tak dikenal -> keep (kunci terbukti cocok, bukan foreign)', async () => {
    const { input } = setup(v2Blob(OTHER_KID), { v1: UNSUPPORTED })

    await expect(resolveBlobVerdict(input)).resolves.toEqual({ verdict: RECORD_INDEX_KEEP })
  })
})

describe('resolveBlobVerdict: tanpa prefix (v1)', () => {
  it('v1Closed=false: terbuka -> accept v1; tak terbuka -> keep (perilaku #111 utuh)', async () => {
    const opened = setup(plainV1Blob())
    await expect(resolveBlobVerdict(opened.input)).resolves.toMatchObject({
      verdict: 'accept',
      origin: 'v1',
    })

    const unreadable = setup(plainV1Blob(), { v1: FAILED })
    await expect(resolveBlobVerdict(unreadable.input)).resolves.toEqual({
      verdict: RECORD_INDEX_KEEP,
    })
  })

  it('v1Closed=true: reject v1_closed tanpa mencoba membuka', async () => {
    const { input, openV1 } = setup(plainV1Blob(), { v1Closed: true })

    await expect(resolveBlobVerdict(input)).resolves.toEqual({
      verdict: RECORD_PULL_REJECT,
      reason: 'v1_closed',
    })
    expect(openV1).not.toHaveBeenCalled()
  })

  it('cutoff: lolos sampai cutoff + grace, reject di atasnya, null berarti tanpa cutoff', async () => {
    const atGrace = formatHlc({
      wallMs: CUTOFF_MS + V1_CUTOFF_GRACE_MS,
      counter: 0,
      deviceId: DEVICE,
    })
    const above = formatHlc({ wallMs: WALL_AFTER_GRACE, counter: 0, deviceId: DEVICE })

    await expect(
      resolveBlobVerdict(setup(plainV1Blob(), { v1CutoffMs: CUTOFF_MS, hlc: atGrace }).input),
    ).resolves.toMatchObject({ verdict: 'accept' })
    await expect(
      resolveBlobVerdict(setup(plainV1Blob(), { v1CutoffMs: CUTOFF_MS, hlc: above }).input),
    ).resolves.toEqual({ verdict: RECORD_PULL_REJECT, reason: 'v1_above_cutoff' })
    await expect(
      resolveBlobVerdict(setup(plainV1Blob(), { v1CutoffMs: null, hlc: above }).input),
    ).resolves.toMatchObject({ verdict: 'accept' })
  })

  it('cutoff aktif + HLC tak terbaca -> reject v1_invalid_hlc; tak terbuka di atas cutoff tetap keep', async () => {
    await expect(
      resolveBlobVerdict(setup(plainV1Blob(), { v1CutoffMs: CUTOFF_MS, hlc: 'rusak' }).input),
    ).resolves.toEqual({ verdict: RECORD_PULL_REJECT, reason: 'v1_invalid_hlc' })

    const above = formatHlc({ wallMs: WALL_AFTER_GRACE, counter: 0, deviceId: DEVICE })
    await expect(
      resolveBlobVerdict(
        setup(plainV1Blob(), { v1CutoffMs: CUTOFF_MS, hlc: above, v1: FAILED }).input,
      ),
    ).resolves.toEqual({ verdict: RECORD_INDEX_KEEP })
  })
})

describe('resolveBlobVerdict: versi tak dikenal (M2)', () => {
  const futureBlob = () => v2Blob(OWN_KID, VALID_CIPHERTEXT_BYTES, UNKNOWN_VERSION)

  it('0x02 masuk jalur v2, 0x03 -> foreign: bukan reject/keep, dan v2 tidak pernah dicoba', async () => {
    const v2 = setup(v2Blob(OWN_KID))
    await expect(resolveBlobVerdict(v2.input)).resolves.toMatchObject({ verdict: 'accept' })

    const future = setup(futureBlob(), { v1: FAILED })
    await expect(resolveBlobVerdict(future.input)).resolves.toEqual({
      verdict: RECORD_PULL_FOREIGN,
    })
    expect(future.openV2).not.toHaveBeenCalled()
  })

  it('tidak pernah reject maupun keep (H1: tombstone palsu), apa pun v1Closed/cutoff/hasil v1 gagal', async () => {
    for (const v1Closed of [false, true]) {
      for (const v1CutoffMs of [null, CUTOFF_MS]) {
        const { input } = setup(futureBlob(), { v1Closed, v1CutoffMs, v1: FAILED })
        const result = await resolveBlobVerdict(input)
        expect(result).toEqual({ verdict: RECORD_PULL_FOREIGN })
      }
    }
  })

  it('v1Closed=true: foreign tanpa mencoba v1; v1Closed=false: blob v1 asli ber-nonce "ipr" tetap terbuka', async () => {
    const closed = setup(futureBlob(), { v1Closed: true })
    await expect(resolveBlobVerdict(closed.input)).resolves.toEqual({
      verdict: RECORD_PULL_FOREIGN,
    })
    expect(closed.openV1).not.toHaveBeenCalled()

    const collided = setup(futureBlob())
    await expect(resolveBlobVerdict(collided.input)).resolves.toMatchObject({
      verdict: 'accept',
      origin: 'v1',
    })
  })
})

describe('isV1DowngradeOfV2 (W1b)', () => {
  const identity = { ownKid: OWN_KID, legacyKid: LEGACY_KID }
  const localOwn = toBase64(v2Blob(OWN_KID))
  const localLegacy = toBase64(v2Blob(LEGACY_KID))

  it('remote tanpa prefix atau ber-KID lain terhadap lokal v2 sah -> downgrade', () => {
    expect(isV1DowngradeOfV2(localOwn, toBase64(plainV1Blob()), identity)).toBe(true)
    expect(isV1DowngradeOfV2(localLegacy, toBase64(plainV1Blob()), identity)).toBe(true)
    expect(isV1DowngradeOfV2(localOwn, toBase64(v2Blob(OTHER_KID)), identity)).toBe(true)
  })

  it('remote v2 sendiri/legacy bukan downgrade; lokal v1 atau v2 KID lain tidak dilindungi', () => {
    expect(isV1DowngradeOfV2(localOwn, toBase64(v2Blob(OWN_KID)), identity)).toBe(false)
    expect(isV1DowngradeOfV2(localOwn, toBase64(v2Blob(LEGACY_KID)), identity)).toBe(false)
    expect(isV1DowngradeOfV2(toBase64(plainV1Blob()), toBase64(plainV1Blob()), identity)).toBe(
      false,
    )
    expect(isV1DowngradeOfV2(toBase64(v2Blob(OTHER_KID)), toBase64(plainV1Blob()), identity)).toBe(
      false,
    )
  })
})
