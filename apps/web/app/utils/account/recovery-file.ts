import { z } from 'zod'

import { BRAND } from '#shared/brand'
import { TECH_IDENTITY } from '#shared/tech-identity'

import { MAX_KDF_MEM_BYTES, MAX_KDF_OPS } from '../crypto/kdf-limits'
import type { RecoveryEnvelope } from '../crypto/recovery'

/**
 * Berkas recovery key milik user (ARCHITECTURE §7, ADR 11-12).
 *
 * Isinya: **envelope** kunci utama - bukan 24 katanya. Pemisahan itu yang membuat berkas ini masih
 * berguna walau ia bocor: envelope cuma bisa dibuka dengan 24 kata yang user simpan di tempat lain.
 * Menaruh keduanya di satu berkas sama dengan menempelkan kunci ke kotaknya.
 *
 * Konsekuensinya harus diucapkan apa adanya: **berkas ini tidak bisa memulihkan apa pun tanpa 24 kata**,
 * dan 24 kata saja juga tidak cukup tanpa berkas ini (kunci utama dibuat acak, ADR 11).
 *
 * Berkas ini juga TIDAK PERNAH dikirim ke server: server cuma menyimpan envelope passkey
 * (`KEY_SLOTS = ['passkey']` di kontrak keys).
 */

/** Penanda jenis berkas, supaya JSON lain tidak pernah dianggap berkas recovery. */
export const RECOVERY_FILE_FORMAT = TECH_IDENTITY.formatMarkers.recoveryKey

/**
 * Jenis bahan kunci untuk slot `recovery` di `SecureKeyStore`.
 *
 * Slot itu memang untuk envelope yang user impor/pegang sendiri (dbml `local_key_meta`: "recovery:
 * envelope yang diimpor user dari berkas backup miliknya"). Bahannya adalah envelope, bukan kunci polos.
 */
export const RECOVERY_MATERIAL_KIND = 'recovery-envelope'

/** Versi FORMAT berkas. Naikkan kalau bentuknya berubah. */
export const RECOVERY_FILE_VERSION = 1

/** Peringatan wajib: berkas ini tidak terenkripsi, dan tidak cukup sendirian. */
export const RECOVERY_FILE_WARNING =
  'Berkas ini berisi envelope kunci (tidak terenkripsi dan tidak memuat 24 katanya). Simpan bersama 24 kata recovery kamu - tanpa keduanya, data tidak bisa dipulihkan.'

const envelopeSchema = z
  .object({
    kdf: z.string().min(1).max(64),
    alg: z.string().min(1).max(64),
    ver: z.int().min(1),
    salt: z.string().min(1).max(256),
    // Batas atas wajib: `ops`/`mem` menentukan biaya Argon2id yang kita jalankan nanti (PRD 912).
    ops: z.int().min(1).max(MAX_KDF_OPS),
    mem: z.int().min(1).max(MAX_KDF_MEM_BYTES),
    wrappedKey: z.string().min(1).max(4096),
  })
  .strict()

export const recoveryFileDocumentSchema = z
  .object({
    format: z.literal(RECOVERY_FILE_FORMAT),
    version: z.literal(RECOVERY_FILE_VERSION),
    /** Kapan berkas dibuat; untuk ditampilkan ke user, bukan untuk keputusan apa pun. */
    createdAtMs: z.int().min(0),
    /** Selalu `true`: berkas ini plaintext, dan itu dinyatakan di berkasnya sendiri. */
    encryption: z.literal('none'),
    warning: z.literal(RECOVERY_FILE_WARNING),
    envelope: envelopeSchema,
  })
  .strict()

export type RecoveryFileDocument = z.infer<typeof recoveryFileDocumentSchema>

export function buildRecoveryFileDocument(input: {
  readonly envelope: RecoveryEnvelope
  readonly createdAtMs: number
}): RecoveryFileDocument {
  return {
    format: RECOVERY_FILE_FORMAT,
    version: RECOVERY_FILE_VERSION,
    createdAtMs: input.createdAtMs,
    encryption: 'none',
    warning: RECOVERY_FILE_WARNING,
    envelope: {
      kdf: input.envelope.kdf,
      alg: input.envelope.alg,
      ver: input.envelope.ver,
      salt: input.envelope.salt,
      ops: input.envelope.ops,
      mem: input.envelope.mem,
      wrappedKey: input.envelope.wrappedKey,
    },
  }
}

/** Serialisasi berkas. Pretty: user harus bisa membukanya dan membacanya sendiri. */
export function serializeRecoveryFile(document: RecoveryFileDocument): string {
  return JSON.stringify(document, null, 2)
}

/** Nama berkas unduhan. */
export function recoveryFileName(): string {
  return `${BRAND.slug}-recovery-key.json`
}

/**
 * Baca envelope dari berkas recovery.
 *
 * Semua penyimpangan DITOLAK dengan alasan yang jelas - berkas dari aplikasi lain, versi format yang
 * belum dikenal, atau isi yang tidak lengkap. Membiarkannya lolos berarti mencoba membuka kunci dengan
 * data yang kita tidak paham artinya.
 */
export function parseRecoveryFile(text: string): RecoveryEnvelope {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new Error('berkas recovery bukan JSON yang sah', { cause: error })
  }

  const parsed = recoveryFileDocumentSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error('berkas recovery tidak dikenali: format atau isinya tidak sesuai')
  }

  const { envelope } = parsed.data
  if (envelope.alg !== 'xchacha20poly1305') {
    throw new Error(`berkas recovery memakai algoritma yang belum didukung: ${envelope.alg}`)
  }

  return {
    kdf: 'argon2id',
    alg: 'xchacha20poly1305',
    ver: 1,
    salt: envelope.salt,
    ops: envelope.ops,
    mem: envelope.mem,
    wrappedKey: envelope.wrappedKey,
  }
}
