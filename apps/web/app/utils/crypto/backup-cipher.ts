import {
  BACKUP_MAX_BYTES,
  BACKUP_SALT_BYTES,
  ENCRYPTED_BACKUP_CHUNK_BYTES,
  ENCRYPTED_BACKUP_FORMAT,
  ENCRYPTED_BACKUP_HEADER_MAX_BYTES,
  ENCRYPTED_BACKUP_PREFIX,
  ENCRYPTED_BACKUP_VERSION,
  EncryptedBackupError,
  parseEncryptedBackupHeader,
  serializeEncryptedBackupHeader,
  type BackupKdfParams,
  type EncryptedBackupHeader,
  type EncryptedBackupRejection,
} from '@improve-personal/core'

import type { SodiumModule } from './sodium-runtime'

/**
 * Kripto berkas backup `ip-backup-enc` (AC T27): Argon2id -> kunci backup -> gzip -> secretstream.
 *
 * Fungsi di sini menerima `sodium` sebagai argumen supaya bisa dipakai di worker
 * (`backup.worker.ts`, jalur nyata) maupun langsung di test - tidak ada state modul.
 *
 * Aturan yang dipegang:
 * - Kata sandi dan kunci TIDAK pernah di-log, disimpan, atau dikirim. Kunci dibersihkan
 *   (`memzero`) begitu tidak dipakai; kata sandi hanya lewat sebagai argumen.
 * - Header berkas = AAD chunk pertama, jadi header yang diubah (mis. `opslimit` diturunkan) gagal di
 *   MAC, bukan diam-diam dipakai.
 * - Gagal di chunk mana pun -> seluruh hasil dibuang. Pemanggil baru menulis ke penyimpanan setelah
 *   isi terbuka utuh DAN lolos `validateBackupText`.
 */

/** Argon2id MODERATE (AC T27: minimal MODERATE). Diukur di `backup-cipher.perf` - lihat handoff. */
export const BACKUP_KDF_DEFAULT = { opslimit: 3, memlimit: 256 * 1024 * 1024 } as const

const KEY_BYTES = 32
const NEWLINE = 0x0a

export type BackupKdfCost = { readonly opslimit: number; readonly memlimit: number }

/** Kunci backup + parameter yang membuatnya (salt ikut, supaya kata sandi yang sama membukanya). */
export type BackupKey = {
  readonly key: Uint8Array
  readonly kdf: BackupKdfParams
}

/**
 * Turunkan kunci dari kata sandi. `kdf` lengkap (dengan salt) = buka berkas lama; tanpa salt = buat
 * kunci baru dengan salt acak.
 *
 * Kata sandi di-normalisasi NFC: "é" yang diketik di macOS dan Android bisa berbeda byte-nya, dan
 * backup yang tidak bisa dibuka karena keyboard lain sama dengan kehilangan data.
 */
export function deriveBackupKey(
  sodium: SodiumModule,
  password: string,
  kdf: BackupKdfParams | BackupKdfCost = BACKUP_KDF_DEFAULT,
): BackupKey {
  const salt = 'salt' in kdf ? sodium.from_base64(kdf.salt, sodium.base64_variants.ORIGINAL) : null
  const saltBytes = salt ?? sodium.randombytes_buf(BACKUP_SALT_BYTES)

  const key = sodium.crypto_pwhash(
    KEY_BYTES,
    password.normalize('NFC'),
    saltBytes,
    kdf.opslimit,
    kdf.memlimit,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  )

  return {
    key,
    kdf: {
      alg: 'argon2id13',
      opslimit: kdf.opslimit,
      memlimit: kdf.memlimit,
      salt: sodium.to_base64(saltBytes, sodium.base64_variants.ORIGINAL),
    },
  }
}

/** Segel plaintext (sudah gzip) jadi berkas `ip-backup-enc` utuh. */
export function sealBackupBytes(
  sodium: SodiumModule,
  backupKey: BackupKey,
  plaintext: Uint8Array,
  createdAtMs: number,
): Uint8Array {
  const headerBytes = new TextEncoder().encode(
    serializeEncryptedBackupHeader({
      format: ENCRYPTED_BACKUP_FORMAT,
      version: ENCRYPTED_BACKUP_VERSION,
      kdf: backupKey.kdf,
      createdAtMs,
    }),
  )

  const { state, header } = sodium.crypto_secretstream_xchacha20poly1305_init_push(backupKey.key)
  const parts: Uint8Array[] = [headerBytes, Uint8Array.of(NEWLINE), header]

  let offset = 0
  do {
    const chunk = plaintext.subarray(offset, offset + ENCRYPTED_BACKUP_CHUNK_BYTES)
    offset += chunk.length
    const isLast = offset >= plaintext.length
    parts.push(
      sodium.crypto_secretstream_xchacha20poly1305_push(
        state,
        chunk,
        parts.length === 3 ? headerBytes : null,
        isLast
          ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
          : sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE,
      ),
    )
  } while (offset < plaintext.length)

  return concat(parts)
}

/** Apakah byte ini tampak seperti berkas terenkripsi (awalan header). */
export function looksLikeEncryptedBackup(bytes: Uint8Array): boolean {
  const prefix = new TextDecoder().decode(bytes.subarray(0, ENCRYPTED_BACKUP_PREFIX.length))
  return prefix === ENCRYPTED_BACKUP_PREFIX
}

type SplitEncryptedBackup = {
  readonly header: EncryptedBackupHeader
  /** Byte header apa adanya dari berkas - AAD chunk pertama, jadi TIDAK diserialisasi ulang. */
  readonly headerBytes: Uint8Array
  /** Sisa berkas: header secretstream + chunk. */
  readonly body: Uint8Array
}

/** Pisahkan baris header dari isi. Melempar `EncryptedBackupError` dengan alasan yang tepat. */
export function splitEncryptedBackup(bytes: Uint8Array): SplitEncryptedBackup {
  if (!looksLikeEncryptedBackup(bytes)) throw new EncryptedBackupError('NOT_ENCRYPTED_BACKUP')

  const end = bytes.subarray(0, ENCRYPTED_BACKUP_HEADER_MAX_BYTES).indexOf(NEWLINE)
  if (end === -1) throw new EncryptedBackupError('BAD_HEADER')

  const headerBytes = bytes.slice(0, end)
  let line: string
  try {
    line = new TextDecoder('utf-8', { fatal: true }).decode(headerBytes)
  } catch {
    throw new EncryptedBackupError('BAD_HEADER')
  }

  return { header: parseEncryptedBackupHeader(line), headerBytes, body: bytes.subarray(end + 1) }
}

/**
 * Buka berkas. `password` dipakai bersama parameter dari header; kunci hasilnya dibersihkan sebelum
 * fungsi selesai. Melempar `EncryptedBackupError` - tidak pernah mengembalikan isi sebagian.
 */
export function openBackupBytes(
  sodium: SodiumModule,
  bytes: Uint8Array,
  password: string,
): Uint8Array {
  const { header, headerBytes, body } = splitEncryptedBackup(bytes)
  const streamHeaderBytes = sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES
  if (body.length < streamHeaderBytes + sodium.crypto_secretstream_xchacha20poly1305_ABYTES) {
    throw new EncryptedBackupError('TRUNCATED')
  }

  const { key } = deriveBackupKey(sodium, password, header.kdf)
  try {
    return pullChunks(sodium, key, headerBytes, body, streamHeaderBytes)
  } finally {
    sodium.memzero(key)
  }
}

function pullChunks(
  sodium: SodiumModule,
  key: Uint8Array,
  headerBytes: Uint8Array,
  body: Uint8Array,
  streamHeaderBytes: number,
): Uint8Array {
  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(
    body.subarray(0, streamHeaderBytes),
    key,
  )
  const cipherChunk =
    ENCRYPTED_BACKUP_CHUNK_BYTES + sodium.crypto_secretstream_xchacha20poly1305_ABYTES
  const parts: Uint8Array[] = []
  let offset = streamHeaderBytes
  let isFinal = false

  while (offset < body.length) {
    // Data setelah chunk FINAL = berkas disambung/diubah.
    if (isFinal) throw new EncryptedBackupError('WRONG_PASSWORD_OR_TAMPERED')

    const chunk = body.subarray(offset, offset + cipherChunk)
    offset += chunk.length
    const pulled = pull(sodium, state, chunk, parts.length === 0 ? headerBytes : null)
    parts.push(pulled.message)
    isFinal = pulled.tag === sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
  }

  // Berhenti tepat di batas chunk tanpa tag FINAL = berkas terpotong.
  if (!isFinal) throw new EncryptedBackupError('TRUNCATED')
  return concat(parts)
}

type SecretstreamState = ReturnType<SodiumModule['crypto_secretstream_xchacha20poly1305_init_pull']>

function pull(
  sodium: SodiumModule,
  state: SecretstreamState,
  chunk: Uint8Array,
  ad: Uint8Array | null,
): { message: Uint8Array; tag: number } {
  // libsodium.js mengembalikan `false` ATAU melempar saat MAC gagal, tergantung versi.
  let result: { message: Uint8Array; tag: number } | false
  try {
    result = sodium.crypto_secretstream_xchacha20poly1305_pull(state, chunk, ad)
  } catch {
    throw new EncryptedBackupError('WRONG_PASSWORD_OR_TAMPERED')
  }
  if (!result) throw new EncryptedBackupError('WRONG_PASSWORD_OR_TAMPERED')
  return result
}

/** Sumber kunci: kata sandi (berkas manual) atau kunci backup tersimpan (Drive terjadwal, T29). */
export type BackupKeySource =
  { readonly password: string; readonly cost?: BackupKdfCost } | { readonly backupKey: BackupKey }

/** Teks dokumen `ip-backup` -> berkas `ip-backup-enc`. */
export async function encryptBackupText(
  sodium: SodiumModule,
  text: string,
  source: BackupKeySource,
  createdAtMs: number,
): Promise<Uint8Array> {
  const compressed = await gzipBytes(new TextEncoder().encode(text))
  if ('backupKey' in source)
    return sealBackupBytes(sodium, source.backupKey, compressed, createdAtMs)

  const backupKey = deriveBackupKey(sodium, source.password, source.cost)
  try {
    return sealBackupBytes(sodium, backupKey, compressed, createdAtMs)
  } finally {
    sodium.memzero(backupKey.key)
  }
}

/** Berkas `ip-backup-enc` -> teks dokumen `ip-backup` (belum divalidasi; itu tugas core). */
export async function decryptBackupText(
  sodium: SodiumModule,
  bytes: Uint8Array,
  password: string,
): Promise<string> {
  const compressed = openBackupBytes(sodium, bytes, password)
  const plain = await gunzipBytes(compressed)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(plain)
  } catch {
    throw new EncryptedBackupError('WRONG_PASSWORD_OR_TAMPERED')
  }
}

/** gzip lewat `CompressionStream` bawaan browser/Node - tanpa dependency tambahan. */
export async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([toArrayBuffer(bytes)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * gunzip dengan batas: berhenti begitu hasilnya melewati `maxBytes`. Berkas 1 MB bisa mengembang jadi
 * gigabyte (zip bomb) - batasnya ditegakkan SAAT dekompresi, bukan setelah semuanya ada di memori.
 */
export async function gunzipBytes(
  bytes: Uint8Array,
  maxBytes: number = BACKUP_MAX_BYTES,
): Promise<Uint8Array> {
  const reader = new Blob([toArrayBuffer(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader()
  const parts: Uint8Array[] = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > maxBytes) {
        await reader.cancel()
        throw new EncryptedBackupError('TOO_LARGE')
      }
      parts.push(value)
    }
  } catch (error) {
    if (error instanceof EncryptedBackupError) throw error
    // Isi lolos MAC tapi bukan gzip yang sah: hanya mungkin kalau berkasnya dibuat dengan kunci yang
    // benar oleh pembuat lain - perlakukan sama seperti berkas rusak.
    throw new EncryptedBackupError('WRONG_PASSWORD_OR_TAMPERED')
  }

  return concat(parts)
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** `Blob` hanya menerima view di atas `ArrayBuffer` biasa (bukan `SharedArrayBuffer`). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

export type BackupWorkerRequest =
  | {
      readonly op: 'encrypt'
      readonly text: string
      readonly source: BackupKeySource
      readonly createdAtMs: number
    }
  | { readonly op: 'decrypt'; readonly bytes: Uint8Array; readonly password: string }
  | { readonly op: 'derive'; readonly password: string }

export type BackupWorkerResponse =
  | { readonly ok: true; readonly op: 'encrypt'; readonly bytes: Uint8Array }
  | { readonly ok: true; readonly op: 'decrypt'; readonly text: string }
  | { readonly ok: true; readonly op: 'derive'; readonly backupKey: BackupKey }
  | { readonly ok: false; readonly reason: EncryptedBackupRejection | null }

/**
 * Satu operasi backup -> balasan yang bisa dikirim lewat `postMessage`. Dipakai worker dan jalur
 * tanpa worker, supaya keduanya tidak bisa berbeda perilaku. Error lain di luar
 * `EncryptedBackupError` jadi `reason: null` - pesannya tidak dikirim karena bisa memuat detail
 * internal.
 */
export async function handleBackupRequest(
  sodium: SodiumModule,
  request: BackupWorkerRequest,
): Promise<BackupWorkerResponse> {
  try {
    switch (request.op) {
      case 'encrypt':
        return {
          ok: true,
          op: 'encrypt',
          bytes: await encryptBackupText(sodium, request.text, request.source, request.createdAtMs),
        }
      case 'decrypt':
        return {
          ok: true,
          op: 'decrypt',
          text: await decryptBackupText(sodium, request.bytes, request.password),
        }
      case 'derive':
        return { ok: true, op: 'derive', backupKey: deriveBackupKey(sodium, request.password) }
    }
  } catch (error) {
    return { ok: false, reason: error instanceof EncryptedBackupError ? error.reason : null }
  }
}
