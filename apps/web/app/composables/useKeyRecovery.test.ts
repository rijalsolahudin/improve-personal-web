import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearQuarantineForTest, isQuarantined, quarantineRecord } from '~/utils/sync/quarantine'

/**
 * Pemulihan kunci harus membuat record yang dulu gagal dibuka bisa dicoba lagi.
 *
 * Urutannya sekarang: `reopen()` → bangun ulang index dari blob lokal (`reindexQuarantined`) →
 * minta satu siklus sync. Karantina HANYA dilepas untuk record yang benar-benar pulih atau sudah
 * tidak ada di storage; record yang masih tidak bisa dibuka tetap terkarantina supaya hitungan
 * "data tidak bisa dibuka" tidak hilang diam-diam. Bukti jalur pulih yang lengkap ada di
 * `useKeyRecovery.reindex.test.ts`; test ini mengunci sisi "tidak ada yang rusak saat gagal" dan
 * "satu siklus tetap diminta".
 */

const USER = '018f2c4e-0000-7000-8000-00000000000a'

const unlockWithRecoveryCode = vi.hoisted(() => vi.fn())
const requestSyncNow = vi.hoisted(() => vi.fn())
const ensure = vi.hoisted(() => vi.fn(async () => undefined))
const loadAccount = vi.hoisted(() => vi.fn(async () => undefined))

const recoveryErrors = vi.hoisted(() => ({
  BackupCodeFormatError: class BackupCodeFormatError extends Error {},
  BackupPassphraseError: class BackupPassphraseError extends Error {},
  RecoveryCodeRejectedError: class RecoveryCodeRejectedError extends Error {},
  RecoveryLockedError: class RecoveryLockedError extends Error {},
}))

vi.mock('~/utils/account/unlock', () => ({
  ...recoveryErrors,
  unlockWithRecoveryCode,
  unlockWithEncryptedBackup: vi.fn(async () => undefined),
  unlockWithPasskey: vi.fn(async () => undefined),
}))

vi.mock('~/utils/crypto/key-store', () => ({
  createWebKeyStore: vi.fn(() => ({})),
}))

vi.mock('~/utils/crypto/recovery-guard', () => ({
  createRecoveryGuard: vi.fn(() => ({})),
}))

vi.mock('~/composables/useLocalData', () => ({
  useLocalData: () => ({ ensure }),
}))

vi.mock('~/composables/useAccount', () => ({
  useAccount: () => ({ load: loadAccount }),
}))

vi.mock('~/composables/useAuthSession', () => ({
  useAuthSession: () => ({
    session: {
      value: { user: { id: USER, email: 'user@example.com' } },
    },
  }),
}))

vi.mock('~/utils/sync/controller', () => ({
  requestSyncNow,
  startSync: vi.fn(() => vi.fn()),
  stopSync: vi.fn(),
}))

async function loadComposable() {
  return await import('./useKeyRecovery')
}

beforeEach(() => {
  clearQuarantineForTest()
  unlockWithRecoveryCode.mockReset()
  requestSyncNow.mockReset()
  ensure.mockClear()
  loadAccount.mockClear()
})

describe('pemulihan kunci dan karantina', () => {
  it('pemulihan berhasil meminta satu siklus sync', async () => {
    quarantineRecord(USER, '018f2c4e-0000-7000-8000-0000000000f1')
    unlockWithRecoveryCode.mockResolvedValue(undefined)

    const { useKeyRecovery } = await loadComposable()
    const recovery = useKeyRecovery()
    await recovery.recoverWithCode('kode-pemulihan')

    expect(recovery.error.value).toBeNull()
    expect(requestSyncNow).toHaveBeenCalledTimes(1)
  })

  it('pemulihan gagal tidak membersihkan karantina dan tidak meminta siklus', async () => {
    quarantineRecord(USER, '018f2c4e-0000-7000-8000-0000000000f2')
    unlockWithRecoveryCode.mockRejectedValue(new recoveryErrors.RecoveryCodeRejectedError())

    const { useKeyRecovery } = await loadComposable()
    const recovery = useKeyRecovery()
    await recovery.recoverWithCode('kode-salah')

    expect(recovery.error.value).toBe('rejected')
    expect(isQuarantined(USER, '018f2c4e-0000-7000-8000-0000000000f2')).toBe(true)
    expect(requestSyncNow).not.toHaveBeenCalled()
  })
})
