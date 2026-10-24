import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearQuarantineForTest, isQuarantined, quarantineRecord } from '~/utils/sync/quarantine'
import type { LocalDataSession } from '~/utils/storage/session'

import { TEST_USER_A, createMemoryLocalSession } from '../../tests/nuxt/local-session'

/**
 * Pemulihan kunci harus MEMBANGUN ULANG index record yang dulu terkarantina, bukan hanya membersihkan
 * daftar karantina.
 *
 * Record yang dulu dikarantina sudah tersimpan di `record` dengan `index: 'keep'` dan cursor pull
 * sudah melewatinya - server tidak akan mengirimnya lagi. Membersihkan karantina saja membuat pull
 * menunggu record yang tidak pernah datang, jadi record tetap tidak tampil. Urutannya karena itu
 * mengikat: reindex dulu (sesi sudah terbuka lewat `reopen()`), baru sisa karantina dibersihkan dan
 * satu siklus diminta. Pemulihan GAGAL tidak menyentuh apa pun.
 */

const unlockWithRecoveryCode = vi.hoisted(() => vi.fn())
const requestSyncNow = vi.hoisted(() => vi.fn())
const ensure = vi.hoisted(() => vi.fn())
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
      value: { user: { id: TEST_USER_A, email: 'user@example.com' } },
    },
  }),
}))

vi.mock('~/utils/sync/controller', () => ({
  requestSyncNow,
  startSync: vi.fn(() => vi.fn()),
  stopSync: vi.fn(),
}))

const NOW_MS = 1_700_000_000_000
const ID_BLOCKED = '018f2c4e-0000-7000-8000-0000000000f1'

function todoData(id: string): unknown {
  return {
    id,
    title: 'Tugas yang dulu tidak bisa dibuka',
    note: null,
    deadlineAt: NOW_MS,
    priority: 'medium',
    isDone: false,
    completedAt: null,
    scheduleId: null,
    scheduleOccurrenceAt: null,
    createdAt: NOW_MS - 1_000,
    updatedAt: NOW_MS - 1_000,
  }
}

/** Record seperti hasil pull lama: blob ada, baris `record_index` tidak ada, outbox sudah bersih. */
async function seedWithoutIndex(session: LocalDataSession): Promise<void> {
  await session.writer.write({
    type: 'todo',
    id: ID_BLOCKED,
    data: (id) => todoData(id),
    index: { rangeStartMs: NOW_MS, rangeEndMs: NOW_MS },
  })
  await session.storage.runTransaction('seed.keep', async (tx) => {
    await tx.putRecordIndex(ID_BLOCKED, null)
  })

  const queued = await session.storage.listOutbox(50)
  await session.storage.deleteOutboxRows(queued.map((row) => row.id))
}

async function isIndexed(session: LocalDataSession): Promise<boolean> {
  const rows = await session.storage.queryByRange({
    entityTypes: ['todo'],
    fromMs: NOW_MS - 60_000,
    toMs: NOW_MS + 60_000,
  })

  return rows.some((row) => row.id === ID_BLOCKED)
}

beforeEach(() => {
  clearQuarantineForTest()
  unlockWithRecoveryCode.mockReset()
  requestSyncNow.mockReset()
  ensure.mockReset()
  loadAccount.mockClear()
})

describe('pemulihan kunci membangun ulang index record terkarantina', () => {
  it('pemulihan berhasil: index terbentuk, karantina bersih, satu siklus diminta', async () => {
    const session = createMemoryLocalSession(TEST_USER_A)
    await seedWithoutIndex(session)
    quarantineRecord(TEST_USER_A, ID_BLOCKED)
    expect(await isIndexed(session)).toBe(false)

    unlockWithRecoveryCode.mockResolvedValue(undefined)
    ensure.mockResolvedValue(session)

    const { useKeyRecovery } = await import('./useKeyRecovery')
    const recovery = useKeyRecovery()
    await recovery.recoverWithCode('kode-pemulihan')

    expect(recovery.error.value).toBeNull()
    expect(await isIndexed(session)).toBe(true)
    expect(isQuarantined(TEST_USER_A, ID_BLOCKED)).toBe(false)
    expect(await session.storage.countOutbox()).toBe(0)
    expect(requestSyncNow).toHaveBeenCalledTimes(1)
  })

  it('pemulihan gagal: karantina dan index tidak disentuh, tidak ada siklus diminta', async () => {
    const session = createMemoryLocalSession(TEST_USER_A)
    await seedWithoutIndex(session)
    quarantineRecord(TEST_USER_A, ID_BLOCKED)

    unlockWithRecoveryCode.mockRejectedValue(new recoveryErrors.RecoveryCodeRejectedError())

    const { useKeyRecovery } = await import('./useKeyRecovery')
    const recovery = useKeyRecovery()
    await recovery.recoverWithCode('kode-salah')

    expect(recovery.error.value).toBe('rejected')
    expect(ensure).not.toHaveBeenCalled()
    expect(await isIndexed(session)).toBe(false)
    expect(isQuarantined(TEST_USER_A, ID_BLOCKED)).toBe(true)
    expect(requestSyncNow).not.toHaveBeenCalled()
  })
})
