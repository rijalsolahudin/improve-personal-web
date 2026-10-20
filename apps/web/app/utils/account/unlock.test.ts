// @vitest-environment node
//
// Buka kunci di perangkat tanpa pembuka: lewat kode pemulihan atau passkey.
//
// Yang dibuktikan: kunci yang dibuka IDENTIK dengan kunci asal (kalau beda, data lama tampak rusak),
// tebakan salah dihitung dan akhirnya dikunci, salah-tempel tidak menghabiskan jatah, dan tidak ada yang
// tertulis ke perangkat kalau pembukaannya gagal.
import { describe, expect, it } from 'vitest'

import type { SecureKeyStore } from '@improve-personal/core'

import { unlockMasterKeyWithDevice } from '../crypto/device-slot'
import { createMasterKey } from '../crypto/master-key'
import {
  createPasskeyEnvelope,
  readPasskeyMaterial,
  type PasskeyPrfProvider,
} from '../crypto/passkey'
import { createRecoveryEnvelope, createRecoveryWords } from '../crypto/recovery'
import { RECOVERY_MAX_ATTEMPTS, type RecoveryGuard } from '../crypto/recovery-guard'
import { loadSodium } from '../crypto/sodium'

import { buildBackupCode } from './backup-code'
import {
  BackupCodeFormatError,
  RecoveryCodeRejectedError,
  RecoveryLockedError,
  unlockWithPasskey,
  unlockWithRecoveryCode,
} from './unlock'

function memoryKeyStore(): SecureKeyStore {
  const rows = new Map<string, { kind: string; handle: unknown }>()

  return {
    has: async (slot) => rows.has(slot),
    put: async (slot, material) => {
      rows.set(slot, { kind: material.kind, handle: material.handle })
    },
    get: async (slot) => rows.get(slot) ?? null,
    remove: async (slot) => {
      rows.delete(slot)
    },
  }
}

/** Guard in-memory dengan aturan yang sama (jatah + kunci); jam tidak diuji di sini. */
function memoryGuard(): RecoveryGuard {
  let failed = 0
  let lockedUntilMs: number | null = null

  const status = () => ({
    locked: lockedUntilMs !== null,
    lockedUntilMs,
    remainingAttempts: Math.max(0, RECOVERY_MAX_ATTEMPTS - failed),
  })

  return {
    status: async () => status(),
    registerFailure: async () => {
      failed += 1
      if (failed >= RECOVERY_MAX_ATTEMPTS) lockedUntilMs = Date.now() + 60_000
      return status()
    },
    reset: async () => {
      failed = 0
      lockedUntilMs = null
    },
  }
}

async function backupFor(masterKey: Uint8Array): Promise<string> {
  const words = createRecoveryWords()
  return buildBackupCode({ words, envelope: await createRecoveryEnvelope(masterKey, words) })
}

describe('unlockWithRecoveryCode', () => {
  it('membuka kunci yang sama dan memasang pembuka perangkat', async () => {
    const original = createMasterKey(await loadSodium())
    const code = await backupFor(original)
    const keyStore = memoryKeyStore()

    await unlockWithRecoveryCode({ code, keyStore, guard: memoryGuard() })

    expect(await keyStore.has('device')).toBe(true)
    expect([...(await unlockMasterKeyWithDevice(keyStore))]).toEqual([...original])
  })

  it('menerima kode yang ditempel dengan spasi/baris baru', async () => {
    const original = createMasterKey(await loadSodium())
    const code = await backupFor(original)
    const keyStore = memoryKeyStore()

    await unlockWithRecoveryCode({
      code: `  ${code.slice(0, 40)}\n${code.slice(40)}\n`,
      keyStore,
      guard: memoryGuard(),
    })

    expect(await keyStore.has('device')).toBe(true)
  })

  it('salah tempel (bukan kode) ditolak tanpa menghabiskan jatah dan tanpa menulis apa pun', async () => {
    const keyStore = memoryKeyStore()
    const guard = memoryGuard()

    await expect(
      unlockWithRecoveryCode({ code: 'halo bukan kode', keyStore, guard }),
    ).rejects.toBeInstanceOf(BackupCodeFormatError)

    expect((await guard.status()).remainingAttempts).toBe(RECOVERY_MAX_ATTEMPTS)
    expect(await keyStore.has('device')).toBe(false)
  })

  it('kode sah milik kunci lain tetap dihitung: salah -> kurang jatah, lalu terkunci', async () => {
    // Kode berbentuk benar, tapi envelope-nya dirusak: frasa sah, kunci pembungkusnya tidak cocok.
    const code = await backupFor(createMasterKey(await loadSodium()))
    const other = await backupFor(createMasterKey(await loadSodium()))
    const sodium = await loadSodium()
    const decode = (value: string): { words: string; envelope: object } =>
      JSON.parse(
        sodium.to_string(
          sodium.from_base64(
            value.replace(/^[^.]+\./, ''),
            sodium.base64_variants.URLSAFE_NO_PADDING,
          ),
        ),
      )
    const prefix = code.slice(0, code.indexOf('.') + 1)
    const mixed = `${prefix}${sodium.to_base64(
      sodium.from_string(
        JSON.stringify({ v: 1, words: decode(code).words, envelope: decode(other).envelope }),
      ),
      sodium.base64_variants.URLSAFE_NO_PADDING,
    )}`

    const keyStore = memoryKeyStore()
    const guard = memoryGuard()

    await expect(unlockWithRecoveryCode({ code: mixed, keyStore, guard })).rejects.toMatchObject({
      name: 'RecoveryCodeRejectedError',
      remainingAttempts: RECOVERY_MAX_ATTEMPTS - 1,
    })
    expect(await keyStore.has('device')).toBe(false)

    for (let attempt = 1; attempt < RECOVERY_MAX_ATTEMPTS - 1; attempt += 1) {
      await expect(unlockWithRecoveryCode({ code: mixed, keyStore, guard })).rejects.toBeInstanceOf(
        RecoveryCodeRejectedError,
      )
    }

    await expect(unlockWithRecoveryCode({ code: mixed, keyStore, guard })).rejects.toBeInstanceOf(
      RecoveryLockedError,
    )
    // Sudah terkunci: kode yang BENAR pun ditolak sampai waktunya lewat.
    await expect(unlockWithRecoveryCode({ code, keyStore, guard })).rejects.toBeInstanceOf(
      RecoveryLockedError,
    )
  })
})

describe('unlockWithPasskey', () => {
  async function fakeAuthenticator(): Promise<PasskeyPrfProvider> {
    const sodium = await loadSodium()
    return async ({ salt }) => ({
      credentialId: 'cred-1',
      prfOutput: sodium.crypto_generichash(32, salt, null),
    })
  }

  it('membuka kunci yang sama dan mengingat kredensialnya di perangkat', async () => {
    const original = createMasterKey(await loadSodium())
    const prf = await fakeAuthenticator()
    const { envelope } = await createPasskeyEnvelope(original, prf)
    const keyStore = memoryKeyStore()

    await unlockWithPasskey({ envelope, prf, keyStore })

    expect([...(await unlockMasterKeyWithDevice(keyStore))]).toEqual([...original])
    expect((await readPasskeyMaterial(keyStore))?.credentialId).toBe('cred-1')
  })

  it('passkey yang salah (PRF beda) gagal dan tidak menulis pembuka', async () => {
    const original = createMasterKey(await loadSodium())
    const { envelope } = await createPasskeyEnvelope(original, await fakeAuthenticator())
    const sodium = await loadSodium()
    const wrong: PasskeyPrfProvider = async () => ({
      credentialId: 'orang-lain',
      prfOutput: sodium.randombytes_buf(32),
    })
    const keyStore = memoryKeyStore()

    await expect(unlockWithPasskey({ envelope, prf: wrong, keyStore })).rejects.toThrow()
    expect(await keyStore.has('device')).toBe(false)
  })
})
