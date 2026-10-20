import type { SecureKeyStore } from '@improve-personal/core'

import { saveDeviceUnlock } from '../crypto/device-slot'
import { zeroKey } from '../crypto/master-key'
import {
  PASSKEY_MATERIAL_KIND,
  savePasskeyMaterial,
  unlockMasterKeyWithPasskey,
  type PasskeyEnvelope,
  type PasskeyPrfProvider,
} from '../crypto/passkey'
import { unwrapMasterKeyWithRecovery } from '../crypto/recovery'
import type { RecoveryGuard } from '../crypto/recovery-guard'

import { parseBackupCode } from './backup-code'
import {
  decryptRecoveryBackup,
  parseEncryptedBackup,
  type EncryptedBackupDocument,
} from './encrypted-backup'

/**
 * Buka kunci di perangkat yang BELUM punya pembuka (perangkat baru, atau penyimpanan kunci terhapus).
 *
 * Kedua jalur berakhir sama: kunci utama yang berhasil dibuka dibungkus pembuka perangkat
 * (`saveDeviceUnlock`) lalu langsung dikosongkan dari memori. Setelah itu sesi lokal dibuka seperti
 * biasa - tidak ada jalur khusus yang memegang kunci polos lebih lama dari yang perlu.
 */

/** Percobaan ditolak karena batas salah-ketik tercapai. `untilMs` = kapan boleh mencoba lagi. */
export class RecoveryLockedError extends Error {
  readonly untilMs: number

  constructor(untilMs: number) {
    super('terlalu banyak percobaan: coba lagi nanti')
    this.name = 'RecoveryLockedError'
    this.untilMs = untilMs
  }
}

/** Kode tidak dikenali sebagai kode cadangan (salah tempel, terpotong). Bukan tebakan, tidak dihitung. */
export class BackupCodeFormatError extends Error {
  constructor(options?: ErrorOptions) {
    super('kode pemulihan tidak dikenali', options)
    this.name = 'BackupCodeFormatError'
  }
}

/** Kode berbentuk benar tapi bukan kode untuk akun ini. Dihitung sebagai percobaan gagal. */
export class RecoveryCodeRejectedError extends Error {
  readonly remainingAttempts: number

  constructor(remainingAttempts: number) {
    super('kode pemulihan tidak cocok')
    this.name = 'RecoveryCodeRejectedError'
    this.remainingAttempts = remainingAttempts
  }
}

/**
 * Kata sandi berkas terenkripsi salah, atau berkasnya berubah (auth tag yang sama).
 *
 * Tidak dihitung ke jatah percobaan: siapa pun yang memegang berkasnya bisa menebak kata sandi secara
 * offline, jadi jatah di perangkat ini tidak melindungi apa pun - dan hanya menghukum user yang salah
 * ketik. Yang dilindungi jatah tetap kodenya (setelah berkas terbuka, lewat `unlockWithRecoveryCode`).
 */
export class BackupPassphraseError extends Error {
  constructor(options?: ErrorOptions) {
    super('kata sandi berkas salah', options)
    this.name = 'BackupPassphraseError'
  }
}

export async function unlockWithRecoveryCode(input: {
  readonly code: string
  readonly keyStore: SecureKeyStore
  readonly guard: RecoveryGuard
}): Promise<void> {
  const before = await input.guard.status()
  if (before.locked && before.lockedUntilMs !== null) {
    throw new RecoveryLockedError(before.lockedUntilMs)
  }

  // Dibaca DULU, sebelum Argon2id: kode asing/terpotong tidak perlu membayar 64 MB, dan salah tempel
  // bukan tebakan sehingga tidak boleh menghabiskan jatah percobaan.
  let parsed: Awaited<ReturnType<typeof parseBackupCode>>
  try {
    parsed = await parseBackupCode(input.code)
  } catch (cause) {
    throw new BackupCodeFormatError({ cause })
  }

  let masterKey: Uint8Array
  try {
    masterKey = await unwrapMasterKeyWithRecovery(parsed.words, parsed.envelope)
  } catch {
    // Pesan kripto sengaja tidak diteruskan: yang perlu diketahui user cuma "tidak cocok".
    const after = await input.guard.registerFailure()
    if (after.locked && after.lockedUntilMs !== null)
      throw new RecoveryLockedError(after.lockedUntilMs)
    throw new RecoveryCodeRejectedError(after.remainingAttempts)
  }

  try {
    await saveDeviceUnlock(input.keyStore, masterKey)
  } finally {
    zeroKey(masterKey)
  }

  await input.guard.reset()
}

/**
 * Buka kunci dari berkas terenkripsi kata sandi. Isi berkasnya kode cadangan, jadi setelah dibuka
 * jalurnya sama persis dengan kode yang ditempel (termasuk jatah percobaan).
 */
export async function unlockWithEncryptedBackup(input: {
  readonly text: string
  readonly passphrase: string
  readonly keyStore: SecureKeyStore
  readonly guard: RecoveryGuard
}): Promise<void> {
  let document: EncryptedBackupDocument
  try {
    document = parseEncryptedBackup(input.text)
  } catch (cause) {
    throw new BackupCodeFormatError({ cause })
  }

  let code: string
  try {
    code = await decryptRecoveryBackup(document, input.passphrase)
  } catch (cause) {
    throw new BackupPassphraseError({ cause })
  }

  await unlockWithRecoveryCode({ code, keyStore: input.keyStore, guard: input.guard })
}

export async function unlockWithPasskey(input: {
  readonly envelope: PasskeyEnvelope
  readonly prf: PasskeyPrfProvider
  readonly keyStore: SecureKeyStore
}): Promise<void> {
  // `credentialId` ditangkap dari authenticator supaya perangkat ini ingat kredensialnya dan tidak
  // dianggap "belum punya passkey" (yang akan memaksa onboarding passkey diulang).
  const used: { credentialId: string | null } = { credentialId: null }

  const masterKey = await unlockMasterKeyWithPasskey({
    envelope: input.envelope,
    prf: async (request) => {
      const result = await input.prf(request)
      used.credentialId = result.credentialId
      return result
    },
  })

  try {
    await saveDeviceUnlock(input.keyStore, masterKey)
  } finally {
    zeroKey(masterKey)
  }

  if (used.credentialId !== null) {
    await savePasskeyMaterial(input.keyStore, {
      kind: PASSKEY_MATERIAL_KIND,
      handle: { credentialId: used.credentialId, salt: input.envelope.kdfParams.salt },
    })
  }
}
