import { BRAND } from '#shared/brand'
import {
  BackupCodeFormatError,
  BackupPassphraseError,
  RecoveryCodeRejectedError,
  RecoveryLockedError,
  unlockWithEncryptedBackup,
  unlockWithPasskey,
  unlockWithRecoveryCode,
} from '~/utils/account/unlock'
import { KeysRequestError, createKeysGateway } from '~/utils/crypto/keys-gateway'
import { PASSKEY_KDF, type PasskeyEnvelope } from '~/utils/crypto/passkey'
import { createWebKeyStore } from '~/utils/crypto/key-store'
import { createRecoveryGuard } from '~/utils/crypto/recovery-guard'
import {
  createWebAuthnAuthenticator,
  createWebAuthnUserId,
  isWebAuthnAvailable,
} from '~/utils/crypto/webauthn'
import { keyDatabaseName } from '~/utils/storage/database-names'

/** Kunci pesan di `account.unlock.errors.*`: UI tidak pernah menampilkan pesan mentah dari kripto/server. */
export type KeyRecoveryError =
  | 'badFormat'
  | 'wrongPassphrase'
  | 'rejected'
  | 'locked'
  | 'noPasskey'
  | 'passkeyFailed'
  | 'network'

/**
 * Pemulihan akses di perangkat yang belum punya pembuka kunci (`localData.status === 'locked'`).
 *
 * Tiga jalan (kode, berkas terenkripsi kata sandi, passkey), hasilnya sama: kunci utama dibuka lalu
 * dibungkus pembuka perangkat, dan sesi lokal dibuka ulang seperti biasa. Aturan kriptonya ada di `utils/account/unlock.ts`; di sini hanya merangkai
 * penyimpanan kunci akun yang login, status UI, dan pemetaan error ke kunci pesan.
 */
export function useKeyRecovery() {
  const localData = useLocalData()
  const account = useAccount()
  const { session } = useAuthSession()

  const isBusy = ref(false)
  const error = ref<KeyRecoveryError | null>(null)
  const remainingAttempts = ref<number | null>(null)
  const lockedUntilMs = ref<number | null>(null)

  const isPasskeySupported = computed(() => import.meta.client && isWebAuthnAvailable())

  function userId(): string {
    const id = session.value?.user.id
    if (id === undefined) throw new Error('belum login')
    return id
  }

  function stores() {
    const databaseName = keyDatabaseName(userId())
    return {
      keyStore: createWebKeyStore({ databaseName }),
      guard: createRecoveryGuard({ databaseName }),
    }
  }

  /** Kunci sudah terpasang di perangkat: buka sesi lokal seperti biasa, lalu segarkan status akun. */
  async function reopen(): Promise<void> {
    await localData.ensure()
    await account.load()
  }

  async function run(work: () => Promise<void>): Promise<void> {
    isBusy.value = true
    error.value = null

    try {
      await work()
      await reopen()
    } catch (cause) {
      error.value = errorFrom(cause)
      if (cause instanceof RecoveryCodeRejectedError)
        remainingAttempts.value = cause.remainingAttempts
      if (cause instanceof RecoveryLockedError) lockedUntilMs.value = cause.untilMs
    } finally {
      isBusy.value = false
    }
  }

  async function recoverWithCode(code: string): Promise<void> {
    await run(() => unlockWithRecoveryCode({ code, ...stores() }))
  }

  async function recoverWithEncryptedBackup(text: string, passphrase: string): Promise<void> {
    await run(() => unlockWithEncryptedBackup({ text, passphrase, ...stores() }))
  }

  async function recoverWithPasskey(): Promise<void> {
    await run(async () => {
      const keys = createKeysGateway((path, init) => $fetch(path, init))
      const envelope = passkeyEnvelopeFrom(await keys.listEnvelopes())
      if (envelope === null) throw new NoPasskeyEnvelopeError()

      const name = session.value?.user.email ?? BRAND.passkeyName
      const prf = createWebAuthnAuthenticator({
        rpName: BRAND.passkeyName,
        userName: name,
        userDisplayName: name,
        userId: createWebAuthnUserId(),
      })

      await unlockWithPasskey({ envelope, prf, keyStore: stores().keyStore })
    })
  }

  return {
    isBusy: computed(() => isBusy.value),
    error: computed(() => error.value),
    remainingAttempts: computed(() => remainingAttempts.value),
    lockedUntilMs: computed(() => lockedUntilMs.value),
    isPasskeySupported,
    recoverWithCode,
    recoverWithEncryptedBackup,
    recoverWithPasskey,
  }
}

class NoPasskeyEnvelopeError extends Error {}

/** Envelope passkey dari server, atau `null`. Bentuk `kdfParams` diperiksa, bukan dipercaya. */
function passkeyEnvelopeFrom(
  envelopes: readonly { slot: string; wrappedKey: string; kdfParams: Record<string, unknown> }[],
): PasskeyEnvelope | null {
  const found = envelopes.find((envelope) => envelope.slot === 'passkey')
  if (found === undefined) return null

  const { kdf, ver, salt } = found.kdfParams
  if (kdf !== PASSKEY_KDF || typeof ver !== 'number' || typeof salt !== 'string') return null

  return { wrappedKey: found.wrappedKey, kdfParams: { kdf, ver, salt } }
}

function errorFrom(cause: unknown): KeyRecoveryError {
  if (cause instanceof BackupCodeFormatError) return 'badFormat'
  if (cause instanceof BackupPassphraseError) return 'wrongPassphrase'
  if (cause instanceof RecoveryCodeRejectedError) return 'rejected'
  if (cause instanceof RecoveryLockedError) return 'locked'
  if (cause instanceof NoPasskeyEnvelopeError) return 'noPasskey'
  if (cause instanceof KeysRequestError) return 'network'

  // Passkey dibatalkan, tidak punya `prf`, atau kredensial bukan milik envelope ini.
  return 'passkeyFailed'
}
