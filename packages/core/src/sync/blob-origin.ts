import {
  KID_BYTES,
  RECORD_BLOB_MAGIC,
  RECORD_BLOB_VERSION_V2,
  RECORD_PAD_BLOCK_BYTES,
  RECORD_V2_KID_OFFSET,
  RECORD_V2_NONCE_OFFSET,
  RECORD_V2_TAG_BYTES,
  RECORD_V2_VERSION_OFFSET,
  SEALED_RECORD_V2_OVERHEAD_BYTES,
  V1_CUTOFF_GRACE_MS,
  parseSealedBlobHeader,
  tryParseHlc,
  type SealedBlobHeaderV2,
} from '@improve-personal/contracts'

import { RECORD_INDEX_KEEP, RECORD_PULL_FOREIGN, RECORD_PULL_REJECT } from '../ports.ts'

/**
 * Asal blob remote: keputusan berbasis (prefix, KID) - tabel M1 di spec #120 §4.4.
 *
 * Modul ini MURNI: tidak ada WebCrypto/libsodium, tidak ada I/O. Membuka blob (AEAD sungguhan) adalah
 * pekerjaan provider di sisi platform (`apps/web/app/utils/crypto`, nanti mobile), jadi ia masuk lewat
 * callback `openV2`/`openV1`. Yang diputuskan di sini hanya URUTAN percobaan dan HASIL keputusan -
 * bagian yang harus identik di web dan mobile, dan yang bisa diuji tanpa kripto.
 *
 * Kenapa urutannya penting (dan dikunci test):
 * - Prefix v2 + KID sendiri/legacy dibuka **hanya sebagai v2, tanpa fallback v1**. Blob sampah
 *   berprefix + KID sendiri + `deleted = true` kalau dicoba lagi sebagai v1 bisa lolos sebagai
 *   tombstone `'keep'` dan menghapus data (peluang v1 asli untuk prefix itu 2^-160).
 * - Hanya prefix v2 dengan KID LAIN (atau versi tak dikenal) yang boleh jatuh ke v1, karena di sana
 *   tabrakan nonce v1 acak dengan "ipr\\x02" masih mungkin (2^-32) dan blob v1 asli tidak boleh
 *   terbuang.
 */

// -----------------------------------------------------------------------------
// Prefix
// -----------------------------------------------------------------------------

/**
 * - `none`            : tidak berprefix v2 (blob v1, atau `ipr\x02` yang lebih pendek dari 60 B).
 * - `unknown-version` : berawalan "ipr" tapi byte versinya BUKAN 0x02 - format dari masa depan.
 * - `v2`              : prefix v2 utuh (magic + versi + panjang >= 60) dengan KID-nya.
 */
export type BlobPrefix =
  | { readonly kind: 'none' }
  | { readonly kind: 'unknown-version' }
  | { readonly kind: 'v2'; readonly kid: Uint8Array }

const NO_PREFIX: BlobPrefix = { kind: 'none' }
const UNKNOWN_VERSION_PREFIX: BlobPrefix = { kind: 'unknown-version' }

/** Byte versi hanya ada kalau blob sedikitnya selebar magic + 1. */
const MAGIC_AND_VERSION_BYTES = RECORD_V2_VERSION_OFFSET + 1

/**
 * Apakah blob diawali magic "ipr" dan sudah memuat byte versi.
 *
 * Dipisah dari `parseSealedBlobHeader` (yang `null` untuk SEMUA yang bukan v2) supaya "versi masa
 * depan" bisa dibedakan dari "bukan v2 sama sekali" (M2): client lama tidak boleh memperlakukan
 * blob v3 sebagai v1 lalu menolak/merusaknya, sebab ia belum memahami format itu.
 */
export function hasRecordBlobMagic(blob: Uint8Array): boolean {
  if (blob.length < MAGIC_AND_VERSION_BYTES) return false

  return RECORD_BLOB_MAGIC.every((expected, index) => blob[index] === expected)
}

export function classifyBlobPrefix(blob: Uint8Array): BlobPrefix {
  const header = parseSealedBlobHeader(blob)
  if (header !== null) return { kind: 'v2', kid: header.kid }

  if (hasRecordBlobMagic(blob) && blob[RECORD_V2_VERSION_OFFSET] !== RECORD_BLOB_VERSION_V2) {
    return UNKNOWN_VERSION_PREFIX
  }

  return NO_PREFIX
}

// -----------------------------------------------------------------------------
// Prefix dari blob base64 (tanpa men-decode seluruh blob)
// -----------------------------------------------------------------------------

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64_PAD = '='
const BASE64_CHARS_PER_GROUP = 4
const BASE64_BYTES_PER_GROUP = 3
const BYTE_MASK = 0xff
const BITS_PER_BASE64_CHAR = 6

/** Header v2 (magic + versi + KID) selesai di offset nonce; hanya segitu yang perlu dibaca. */
const HEAD_BYTES = RECORD_V2_NONCE_OFFSET
const HEAD_BASE64_CHARS = Math.ceil(HEAD_BYTES / BASE64_BYTES_PER_GROUP) * BASE64_CHARS_PER_GROUP

/** Decode `chars` karakter pertama (kelipatan 4) base64 standar; `null` kalau ada karakter di luar alfabet. */
function decodeBase64Head(value: string, chars: number): Uint8Array | null {
  const bytes: number[] = []
  for (let start = 0; start < chars; start += BASE64_CHARS_PER_GROUP) {
    let group = 0
    for (let offset = 0; offset < BASE64_CHARS_PER_GROUP; offset += 1) {
      const symbol = value.charAt(start + offset)
      // '=' tidak ada di alfabet, jadi padding (hanya sah di ujung blob) ikut ditolak di sini.
      const sextet = BASE64_ALPHABET.indexOf(symbol)
      if (sextet < 0) return null
      group = (group << BITS_PER_BASE64_CHAR) | sextet
    }
    bytes.push((group >> 16) & BYTE_MASK, (group >> 8) & BYTE_MASK, group & BYTE_MASK)
  }

  return Uint8Array.from(bytes)
}

function decodedBase64Length(value: string): number {
  let padding = 0
  if (value.endsWith(`${BASE64_PAD}${BASE64_PAD}`)) padding = 2
  else if (value.endsWith(BASE64_PAD)) padding = 1

  return (value.length / BASE64_CHARS_PER_GROUP) * BASE64_BYTES_PER_GROUP - padding
}

/**
 * Prefix blob dari bentuk base64 di wire/disk, hanya membaca ~27 karakter pertama (blob sampai 1 MB;
 * mendecode semuanya untuk mengintip header itu pemborosan di jalur pull). Hasilnya sama dengan
 * `classifyBlobPrefix(decode(blob))` untuk base64 standar yang valid; masukan yang bukan base64
 * valid dianggap `none`.
 */
export function peekBlobPrefix(blobBase64: string): BlobPrefix {
  if (blobBase64.length % BASE64_CHARS_PER_GROUP !== 0) return NO_PREFIX
  if (blobBase64.length < HEAD_BASE64_CHARS) return NO_PREFIX

  const head = decodeBase64Head(blobBase64, HEAD_BASE64_CHARS)
  if (head === null) return NO_PREFIX

  const isMagic = RECORD_BLOB_MAGIC.every((expected, index) => head[index] === expected)
  if (!isMagic) return NO_PREFIX

  if (head[RECORD_V2_VERSION_OFFSET] !== RECORD_BLOB_VERSION_V2) return UNKNOWN_VERSION_PREFIX
  if (decodedBase64Length(blobBase64) < SEALED_RECORD_V2_OVERHEAD_BYTES) return NO_PREFIX

  return { kind: 'v2', kid: head.slice(RECORD_V2_KID_OFFSET, RECORD_V2_NONCE_OFFSET) }
}

// -----------------------------------------------------------------------------
// KID
// -----------------------------------------------------------------------------

/**
 * Identitas kunci yang dikenal perangkat ini. `own` = slot `device`; `legacy` = slot `legacy`
 * selama rescue (spec §3). KID bukan rahasia, jadi perbandingan biasa cukup (bukan constant-time).
 */
export type BlobKeyIdentity = {
  readonly ownKid: Uint8Array
  readonly legacyKid?: Uint8Array | null
}

function kidEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== KID_BYTES || b.length !== KID_BYTES) return false

  return a.every((byte, index) => byte === b[index])
}

export type KidOwner = 'own' | 'legacy' | 'other'

export function kidOwnerOf(kid: Uint8Array, identity: BlobKeyIdentity): KidOwner {
  if (kidEquals(kid, identity.ownKid)) return 'own'
  if (
    identity.legacyKid !== undefined &&
    identity.legacyKid !== null &&
    kidEquals(kid, identity.legacyKid)
  )
    return 'legacy'

  return 'other'
}

// -----------------------------------------------------------------------------
// Panjang ciphertext (L3)
// -----------------------------------------------------------------------------

/**
 * Ciphertext v2 (`padded_plaintext || tag`) hanya sah kalau bagian berpadnya kelipatan 256 B dan
 * minimal satu blok (`sodium.pad` selalu menambah >= 1 B, jadi plaintext kosong pun berpad 256 B).
 *
 * Dicek DI SINI, di lapisan keputusan, bukan di parser contracts: `parseSealedBlobHeader` hanya melihat
 * prefix dan panjang minimum. Panjang yang menyimpang berarti writer sah tidak mungkin
 * menghasilkannya - diperlakukan sebagai gagal autentikasi, BUKAN `null` yang jatuh ke jalur v1.
 */
export function isWellFormedV2CiphertextLength(ciphertextBytes: number): boolean {
  const padded = ciphertextBytes - RECORD_V2_TAG_BYTES

  return padded >= RECORD_PAD_BLOCK_BYTES && padded % RECORD_PAD_BLOCK_BYTES === 0
}

// -----------------------------------------------------------------------------
// Keputusan
// -----------------------------------------------------------------------------

/**
 * Hasil membuka satu blob (diisi provider platform, bukan core):
 * - `opened`      : AEAD lolos dan payload dikenal; `value` dipakai pemanggil (mis. record + index).
 * - `unsupported` : AEAD lolos, TAPI payload/skema tidak dikenal versi app ini -> `'keep'`.
 * - `failed`      : AEAD atau unpad gagal (kunci tidak cocok, rusak, atau dipalsukan).
 * Kegagalan kunci yang harus dibedakan dari rusak (mis. `RecordKeyError`) tetap dilempar provider
 * dan merambat apa adanya.
 */
export type OpenOutcome<T> =
  | { readonly kind: 'opened'; readonly value: T }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'failed' }

export type BlobOrigin = 'v1' | 'v2-own' | 'v2-legacy'

/**
 * Alasan `'reject'`, untuk log/metrik (tanpa isi blob). Penolakan v1-menimpa-v2 (W1b) tidak ada di
 * sini: ia butuh versi lokal, jadi diputuskan `pullDelta`, bukan fungsi ini.
 */
export type BlobRejectReason =
  /** Prefix v2 + KID sendiri/legacy tapi AEAD/unpad gagal (potensi tamper). */
  | 'authentication'
  /** Ciphertext v2 tidak kelipatan 256 B (L3): dianggap gagal autentikasi. */
  | 'malformed_length'
  /** Blob tanpa prefix padahal `v1Closed`. */
  | 'v1_closed'
  /** v1 terbuka tetapi HLC-nya di atas `v1CutoffMs + grace`. */
  | 'v1_above_cutoff'
  /** v1 terbuka dengan HLC yang tidak terbaca - tidak bisa dibuktikan di bawah cutoff. */
  | 'v1_invalid_hlc'

export type BlobVerdict<T> =
  | { readonly verdict: 'accept'; readonly origin: BlobOrigin; readonly value: T }
  | { readonly verdict: typeof RECORD_INDEX_KEEP }
  | { readonly verdict: typeof RECORD_PULL_REJECT; readonly reason: BlobRejectReason }
  | { readonly verdict: typeof RECORD_PULL_FOREIGN }

type MaybePromise<T> = T | Promise<T>

export type ResolveBlobInput<T> = BlobKeyIdentity & {
  readonly blob: Uint8Array
  /** HLC remote; hanya dipakai untuk cutoff v1 (`wallMs`). */
  readonly hlc: string
  /** `v1Closed` perangkat ini (sticky, spec §4.5). */
  readonly v1Closed: boolean
  /** Cutoff efektif (konstanta build menang atas server); `null` = tidak ada cutoff. */
  readonly v1CutoffMs: number | null
  /** Buka sebagai v2 dengan kunci milik `keyOwner`. Dipanggil hanya kalau panjang ciphertext sah. */
  readonly openV2: (
    header: SealedBlobHeaderV2,
    keyOwner: 'own' | 'legacy',
  ) => MaybePromise<OpenOutcome<T>>
  /** Buka sebagai v1 (seluruh blob = nonce || ciphertext, AAD = id). */
  readonly openV1: () => MaybePromise<OpenOutcome<T>>
}

/**
 * Tabel keputusan M1. Satu-satunya tempat yang menentukan blob mana dicoba dibuka dengan apa, dan apa
 * artinya kalau gagal.
 *
 * | Prefix           | KID    | v1Closed | Hasil                                                      |
 * | v2               | sendiri| apa pun  | v2 saja: sah -> accept/keep, gagal -> reject               |
 * | v2               | legacy | apa pun  | v2 kunci legacy: sah -> accept/keep, gagal -> reject       |
 * | v2               | lain   | false    | coba v1: terbuka -> aturan v1, gagal -> foreign            |
 * | v2               | lain   | true     | foreign                                                    |
 * | versi tak dikenal| -      | false    | coba v1 (jaga tabrakan nonce): terbuka -> aturan v1, else foreign |
 * | versi tak dikenal| -      | true     | foreign                                                    |
 * | tidak ada        | -      | false    | v1: terbuka -> cutoff, tak terbuka -> keep (#111 utuh)     |
 * | tidak ada        | -      | true     | reject                                                     |
 *
 * Versi tak dikenal SELALU `'foreign'`, tidak pernah `'reject'` dan tidak pernah `'keep'`: client lama
 * tidak boleh merusak (atau mengarantina sebagai tamper) data dari versi masa depan yang belum ia
 * pahami (M2), tapi blob itu juga tidak terautentikasi. Kalau `'keep'`, tombstone-nya diterapkan lewat
 * LWW tanpa dekripsi, sehingga server cukup mengganti SATU byte versi untuk menghapus record v2 yang
 * sah (H1). `'foreign'`: record hidup tanpa versi lokal tetap disimpan `opaque` (tidak hilang), tapi
 * tidak menimpa/menghapus versi lokal dan HLC-nya tidak menarik jam.
 */
export async function resolveBlobVerdict<T>(input: ResolveBlobInput<T>): Promise<BlobVerdict<T>> {
  const prefix = classifyBlobPrefix(input.blob)

  if (prefix.kind === 'none') {
    if (input.v1Closed) return { verdict: RECORD_PULL_REJECT, reason: 'v1_closed' }

    return settleV1(input, await input.openV1(), RECORD_INDEX_KEEP)
  }

  if (prefix.kind === 'unknown-version') {
    // Dicoba v1 dulu hanya untuk blob v1 asli yang nonce-nya kebetulan "ipr" (2^-24); kalau gagal,
    // blob dianggap milik versi masa depan yang tak bisa dibuktikan (foreign, bukan keep - lihat H1).
    if (input.v1Closed) return { verdict: RECORD_PULL_FOREIGN }

    return settleV1(input, await input.openV1(), RECORD_PULL_FOREIGN)
  }

  const owner = kidOwnerOf(prefix.kid, input)
  if (owner === 'other') {
    if (input.v1Closed) return { verdict: RECORD_PULL_FOREIGN }

    return settleV1(input, await input.openV1(), RECORD_PULL_FOREIGN)
  }

  // `parseSealedBlobHeader` sudah sukses di atas (prefix 'v2'), jadi `null` di sini mustahil.
  const header = parseSealedBlobHeader(input.blob)
  if (header === null) return { verdict: RECORD_PULL_REJECT, reason: 'authentication' }

  if (!isWellFormedV2CiphertextLength(header.ciphertext.length)) {
    return { verdict: RECORD_PULL_REJECT, reason: 'malformed_length' }
  }

  const outcome = await input.openV2(header, owner)
  if (outcome.kind === 'opened') {
    return {
      verdict: 'accept',
      origin: owner === 'own' ? 'v2-own' : 'v2-legacy',
      value: outcome.value,
    }
  }
  if (outcome.kind === 'unsupported') return { verdict: RECORD_INDEX_KEEP }

  return { verdict: RECORD_PULL_REJECT, reason: 'authentication' }
}

/**
 * Selesaikan jalur v1. `onFailed` = keputusan kalau v1 tidak terbuka: `'keep'` untuk blob tanpa prefix
 * (#111 utuh), `'foreign'` untuk prefix v2 milik KID lain dan versi tak dikenal.
 */
function settleV1<T>(
  input: ResolveBlobInput<T>,
  outcome: OpenOutcome<T>,
  onFailed: typeof RECORD_INDEX_KEEP | typeof RECORD_PULL_FOREIGN,
): BlobVerdict<T> {
  if (outcome.kind === 'failed') return { verdict: onFailed }
  // v1 asli yang payload-nya tak dikenal: tetap `'keep'` (bukan foreign - kuncinya terbukti cocok).
  if (outcome.kind === 'unsupported') return { verdict: RECORD_INDEX_KEEP }

  if (input.v1CutoffMs !== null) {
    const parsed = tryParseHlc(input.hlc)
    if (!parsed.ok) return { verdict: RECORD_PULL_REJECT, reason: 'v1_invalid_hlc' }
    if (parsed.wallMs > input.v1CutoffMs + V1_CUTOFF_GRACE_MS) {
      return { verdict: RECORD_PULL_REJECT, reason: 'v1_above_cutoff' }
    }
  }

  return { verdict: 'accept', origin: 'v1', value: outcome.value }
}

// -----------------------------------------------------------------------------
// Downgrade (W1b)
// -----------------------------------------------------------------------------

/**
 * Apakah blob lokal adalah v2 yang SAH milik perangkat ini (KID sendiri atau legacy)? Blob lokal
 * ber-KID sendiri hanya tertulis setelah lolos AEAD (pull) atau disegel perangkat ini (writer), dan
 * blob `'reject'` tidak pernah ditulis, jadi prefix + KID cukup - tanpa penanda format tersendiri.
 */
export function isAuthenticatedV2Local(
  localBlobBase64: string,
  identity: BlobKeyIdentity,
): boolean {
  const prefix = peekBlobPrefix(localBlobBase64)

  return prefix.kind === 'v2' && kidOwnerOf(prefix.kid, identity) !== 'other'
}

/**
 * W1b: v1 terbuka yang hendak menggantikan v2 lokal sah ditolak, berapa pun HLC-nya, juga sebelum
 * `v1Closed` dan saat cutoff `null`. Tanpa aturan ini, server yang jahat cukup memutar balik record
 * ke versi v1 lama (HLC v1 tidak terautentikasi) untuk menimpa edit v2 yang sah.
 *
 * `remoteOpened` = keputusan blob remote adalah `accept`. Remote dianggap v1 kalau BUKAN v2 milik
 * kunci sendiri/legacy - termasuk prefix v2 berKID lain yang ternyata terbuka sebagai v1.
 */
export function isV1DowngradeOfV2(
  localBlobBase64: string,
  remoteBlobBase64: string,
  identity: BlobKeyIdentity,
): boolean {
  if (!isAuthenticatedV2Local(localBlobBase64, identity)) return false

  return !isAuthenticatedV2Local(remoteBlobBase64, identity)
}
