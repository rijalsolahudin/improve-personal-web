import { afterEach, describe, expect, it, vi } from 'vitest'

import { SYNC_REMOTE_APPLIED_EVENT, notifyRemoteApplied } from './events'
import { registerSyncReloader, resetSyncReloadersForTest, runSyncReloaders } from './refresh'

/**
 * Klaim yang diuji di sini adalah klaim yang MENENTUKAN AC1/AK3, bukan detail implementasi:
 *
 * 1. Throttle 1 detik hanya untuk event jendela. Pull NYATA yang datang sesudah event jendela (atau
 *    sesudah putaran lain) tidak boleh ditelan - kalau tertelan, data perangkat lain baru tampil pada
 *    pull berikutnya (5 menit kemudian).
 * 2. Event jendela yang dipalsukan berulang tidak boleh menjadi pengganda kerja (L2 review #77).
 *
 * Dua pengujian ini melengkapi `refresh.test.ts` yang hanya memeriksa dua `notifyRemoteApplied()`
 * berurutan dan dua event jendela berurutan - bukan campurannya.
 */

afterEach(() => {
  resetSyncReloadersForTest()
})

function listen(handler: () => void): () => void {
  window.addEventListener(SYNC_REMOTE_APPLIED_EVENT, handler)
  return () => window.removeEventListener(SYNC_REMOTE_APPLIED_EVENT, handler)
}

describe('throttle event jendela vs pull nyata', () => {
  it('pull nyata tepat setelah putaran event jendela tidak ditelan throttle', async () => {
    const reload = vi.fn(async () => undefined)
    registerSyncReloader('tasks', reload)

    let pending: Promise<void> = Promise.resolve()
    const stop = listen(() => {
      pending = runSyncReloaders({ fromWindowEvent: true })
    })

    try {
      // Event "palsu": siapa pun di origin yang sama bisa mengirimnya, jadi ia memulai putaran.
      window.dispatchEvent(new Event(SYNC_REMOTE_APPLIED_EVENT))
      await pending
      expect(reload).toHaveBeenCalledTimes(1)

      // Pull nyata < 1 detik kemudian (beberapa perubahan beruntun dari perangkat lain).
      notifyRemoteApplied()
      await pending

      expect(reload).toHaveBeenCalledTimes(2)
    } finally {
      stop()
    }
  })

  it('100 event jendela beruntun tidak menjadi 100 putaran', async () => {
    const reload = vi.fn(async () => undefined)
    registerSyncReloader('tasks', reload)

    let pending: Promise<void> = Promise.resolve()
    const stop = listen(() => {
      pending = runSyncReloaders({ fromWindowEvent: true })
    })

    try {
      for (let index = 0; index < 100; index += 1) {
        window.dispatchEvent(new Event(SYNC_REMOTE_APPLIED_EVENT))
      }
      await pending

      // Satu putaran berjalan + paling banyak satu putaran susulan hasil penggabungan.
      expect(reload.mock.calls.length).toBeGreaterThan(0)
      expect(reload.mock.calls.length).toBeLessThanOrEqual(2)
    } finally {
      stop()
    }
  })
})
