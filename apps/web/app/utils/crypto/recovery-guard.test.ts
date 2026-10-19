// @vitest-environment node
//
// Batas percobaan frasa recovery DI PERANGKAT (ARCHITECTURE §7).
//
// Yang harus dibuktikan: hitungannya bertahan lintas reload (kalau tidak, cukup reload untuk mengulang
// jatah), hukuman tidak diperpanjang oleh percobaan yang ditolak, dan kunci kedaluwarsa sendiri supaya
// salah ketik 5x tidak menghabisi akses user ke datanya sendiri.
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import { createWebKeyStore } from './key-store'
import { RECOVERY_LOCK_MS, RECOVERY_MAX_ATTEMPTS, createRecoveryGuard } from './recovery-guard'

let databaseCounter = 0

function freshDatabaseName(): string {
  databaseCounter += 1
  return `ip-guard-test-${databaseCounter}`
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

/** Jam yang bisa dimajukan test - supaya "kedaluwarsa" tidak perlu ditunggu 5 menit. */
function fakeClock(startMs = 1_700_000_000_000) {
  let current = startMs
  return {
    now: () => current,
    advance: (deltaMs: number) => {
      current += deltaMs
    },
  }
}

describe('recovery guard', () => {
  it('mulai dari jatah penuh', async () => {
    const guard = createRecoveryGuard({ databaseName: freshDatabaseName(), now: fakeClock().now })

    expect(await guard.status()).toEqual({
      locked: false,
      lockedUntilMs: null,
      remainingAttempts: RECOVERY_MAX_ATTEMPTS,
    })
  })

  it('setelah 4 gagal masih terbuka, gagal ke-5 mengunci', async () => {
    const guard = createRecoveryGuard({ databaseName: freshDatabaseName(), now: fakeClock().now })

    for (let attempt = 1; attempt < RECOVERY_MAX_ATTEMPTS; attempt += 1) {
      const status = await guard.registerFailure()
      expect(status.locked).toBe(false)
      expect(status.remainingAttempts).toBe(RECOVERY_MAX_ATTEMPTS - attempt)
    }

    const locked = await guard.registerFailure()
    expect(locked.locked).toBe(true)
    expect(locked.remainingAttempts).toBe(0)
    expect(locked.lockedUntilMs).not.toBeNull()
  })

  it('hitungan bertahan lintas reload (instance baru, database sama)', async () => {
    const databaseName = freshDatabaseName()
    const clock = fakeClock()

    for (let attempt = 0; attempt < RECOVERY_MAX_ATTEMPTS; attempt += 1) {
      await createRecoveryGuard({ databaseName, now: clock.now }).registerFailure()
    }

    // Instance baru = halaman yang dimuat ulang.
    const reopened = await createRecoveryGuard({ databaseName, now: clock.now }).status()
    expect(reopened.locked).toBe(true)
  })

  it('percobaan saat terkunci tidak memperpanjang hukuman', async () => {
    const databaseName = freshDatabaseName()
    const clock = fakeClock()
    const guard = createRecoveryGuard({ databaseName, now: clock.now })

    for (let attempt = 0; attempt < RECOVERY_MAX_ATTEMPTS; attempt += 1) {
      await guard.registerFailure()
    }

    const lockedAt = (await guard.status()).lockedUntilMs
    clock.advance(60_000)
    const afterMoreAttempts = await guard.registerFailure()

    // Kalau diperpanjang, penyerang yang terus mencoba justru mengunci korban selamanya.
    expect(afterMoreAttempts.lockedUntilMs).toBe(lockedAt)
  })

  it('kunci kedaluwarsa sendiri dan jatah kembali penuh', async () => {
    const databaseName = freshDatabaseName()
    const clock = fakeClock()
    const guard = createRecoveryGuard({ databaseName, now: clock.now })

    for (let attempt = 0; attempt < RECOVERY_MAX_ATTEMPTS; attempt += 1) {
      await guard.registerFailure()
    }
    expect((await guard.status()).locked).toBe(true)

    clock.advance(RECOVERY_LOCK_MS)

    const expired = await guard.status()
    expect(expired.locked).toBe(false)
    expect(expired.remainingAttempts).toBe(RECOVERY_MAX_ATTEMPTS)
  })

  it('jalur sukses mereset hitungan', async () => {
    const databaseName = freshDatabaseName()
    const guard = createRecoveryGuard({ databaseName, now: fakeClock().now })

    await guard.registerFailure()
    await guard.registerFailure()
    await guard.reset()

    expect((await guard.status()).remainingAttempts).toBe(RECOVERY_MAX_ATTEMPTS)
  })

  it('berbagi database dengan penyimpan kunci tanpa saling merusak', async () => {
    // Satu skema, satu pembuka database (`openKeyDatabase`): dua definisi skema untuk nama database yang
    // sama adalah cara paling halus membuat object store hilang.
    const databaseName = freshDatabaseName()
    const guard = createRecoveryGuard({ databaseName, now: fakeClock().now })
    const keyStore = createWebKeyStore({ databaseName })

    await guard.registerFailure()
    await keyStore.put('device', { kind: 'apa-saja', handle: { apa: 'saja' } })

    expect((await guard.status()).remainingAttempts).toBe(RECOVERY_MAX_ATTEMPTS - 1)
    expect(await keyStore.has('device')).toBe(true)
  })
})
