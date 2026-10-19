import {
  isValidRecoveryWords,
  recoveryEnvelopeSchema,
  type RecoveryEnvelope,
} from '../crypto/recovery'
import { loadSodium } from '../crypto/sodium'

import { BRAND } from '#shared/brand'
import { TECH_IDENTITY } from '#shared/tech-identity'

/**
 * Kode cadangan tunggal: 24 kata + envelope-nya dalam SATU string (format "password manager" di PRD).
 *
 * Kenapa ini ada: tanpa ini, user harus menyimpan DUA barang yang harus tetap berpasangan - 24 kata di
 * satu tempat dan berkas envelope di tempat lain. Itu beban yang gampang gagal (orang menyimpan salah
 * satu, atau memisahkannya terlalu jauh). Satu string bisa ditempel ke password manager, dikirim ke
 * email pribadi sendiri, atau dicetak - dan seluruh yang dibutuhkan untuk pulih sudah ada di situ.
 *
 * Yang harus diucapkan apa adanya, di UI dan di komentar ini: **kode ini adalah salinan penuh**. Siapa
 * pun yang memegangnya bisa membuka data user. Karena itu format ini cocok untuk tempat yang memang
 * menyimpan rahasia (password manager, berkas pribadi), bukan untuk ditempel di chat grup.
 *
 * Bentuknya sengaja satu baris tanpa spasi (`iprk1.<base64url>`), karena itu yang paling aman
 * di-copy-paste: tidak ada spasi/baris baru yang bisa terpotong, dan prefiksnya membuat string asing
 * langsung ditolak alih-alih dicoba dibuka.
 */

/** Prefiks + versi format. Versi berikutnya memakai prefiks berbeda supaya kode lama tetap terbaca. */
export const BACKUP_CODE_PREFIX = TECH_IDENTITY.backupCodePrefix

/** Bentuk isi kode setelah prefiks. `v` memisahkan versi payload. */
type BackupCodePayload = {
  readonly v: 1
  readonly words: string
  readonly envelope: RecoveryEnvelope
}

/**
 * Susun kode cadangan.
 *
 * Frasa kata divalidasi lebih dulu (jumlah + checksum): menyusun kode dari frasa yang salah berarti
 * menyimpan salinan yang tidak akan pernah bisa membuka apa pun - dan user baru tahu saat kehilangan
 * akses.
 */
export async function buildBackupCode(input: {
  readonly words: string
  readonly envelope: RecoveryEnvelope
}): Promise<string> {
  if (!isValidRecoveryWords(input.words)) {
    throw new Error('frasa recovery tidak valid: kode cadangan tidak akan bisa memulihkan apa pun')
  }

  const sodium = await loadSodium()
  const payload: BackupCodePayload = {
    v: 1,
    words: input.words.trim().split(/\s+/).join(' '),
    envelope: input.envelope,
  }

  const encoded = sodium.to_base64(
    sodium.from_string(JSON.stringify(payload)),
    sodium.base64_variants.URLSAFE_NO_PADDING,
  )

  return `${BACKUP_CODE_PREFIX}${encoded}`
}

/**
 * Baca kode cadangan.
 *
 * Semua penyimpangan ditolak dengan alasan yang jelas: prefiks asing, base64 rusak, bentuk payload
 * tidak sesuai, envelope tidak sah, atau frasa yang checksum-nya salah. Kode yang lolos dari sini
 * sudah bisa langsung dipakai memulihkan.
 */
export async function parseBackupCode(code: string): Promise<{
  readonly words: string
  readonly envelope: RecoveryEnvelope
}> {
  // Spasi/baris baru dibuang: orang menempel dari password manager/DOM yang kadang menambahkan keduanya.
  const normalized = code.trim().replace(/\s+/g, '')

  if (!normalized.startsWith(BACKUP_CODE_PREFIX)) {
    throw new Error(`bukan kode cadangan ${BRAND.name} (prefiks tidak dikenal)`)
  }

  const sodium = await loadSodium()
  const encoded = normalized.slice(BACKUP_CODE_PREFIX.length)

  let payload: unknown
  try {
    payload = JSON.parse(
      sodium.to_string(sodium.from_base64(encoded, sodium.base64_variants.URLSAFE_NO_PADDING)),
    )
  } catch (error) {
    throw new Error('kode cadangan rusak: isinya tidak bisa dibaca', { cause: error })
  }

  const candidate = payload as Partial<BackupCodePayload> | null
  if (typeof candidate !== 'object' || candidate === null || candidate.v !== 1) {
    throw new Error('kode cadangan tidak dikenali: versi atau bentuknya tidak sesuai')
  }

  if (typeof candidate.words !== 'string' || !isValidRecoveryWords(candidate.words)) {
    throw new Error('kode cadangan tidak memuat 24 kata yang sah')
  }

  const envelope = recoveryEnvelopeSchema.safeParse(candidate.envelope)
  if (!envelope.success) {
    throw new Error('kode cadangan tidak memuat envelope kunci yang sah')
  }

  return { words: candidate.words, envelope: envelope.data }
}

/** Saran panjang minimum sebelum kode dianggap layak disimpan (bukan validasi keamanan, cuma kewajaran). */
export const BACKUP_CODE_MIN_LENGTH = 200
