import { afterEach, describe, expect, it, vi } from 'vitest'

import { SYNC_REMOTE_APPLIED_EVENT, notifyRemoteApplied } from './events'
import {
  RELOAD_ORDER,
  isReloadSessionActive,
  readAfterWrites,
  registerSyncReloader,
  resetSyncReloadersForTest,
  runSyncReloaders,
  type SyncReloadKey,
} from './refresh'

afterEach(() => {
  resetSyncReloadersForTest()
})

describe('registry reload store setelah pull', () => {
  it('menjalankan reloader sesuai RELOAD_ORDER, bukan urutan pendaftaran', async () => {
    const calls: SyncReloadKey[] = []

    // Didaftarkan terbalik: urutan jalan harus tetap mengikuti daftar, karena goal/goal_link harus
    // selesai sebelum task memakai tautannya.
    for (const key of [...RELOAD_ORDER].reverse()) {
      registerSyncReloader(key, async () => {
        calls.push(key)
      })
    }

    await runSyncReloaders()

    expect(calls).toEqual([...RELOAD_ORDER])
  })

  it('hanya reloader yang terdaftar yang jalan', async () => {
    const tasks = vi.fn(async () => undefined)
    const memos = vi.fn(async () => undefined)
    registerSyncReloader('tasks', tasks)
    registerSyncReloader('memos', memos)

    await runSyncReloaders()

    expect(tasks).toHaveBeenCalledTimes(1)
    expect(memos).toHaveBeenCalledTimes(1)
  })

  it('kunci yang sama menimpa reloader sebelumnya (satu store, satu reloader)', async () => {
    const first = vi.fn(async () => undefined)
    const second = vi.fn(async () => undefined)
    registerSyncReloader('tasks', first)
    registerSyncReloader('tasks', second)

    await runSyncReloaders()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('permintaan saat putaran berjalan digabung jadi SATU putaran tambahan', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let firstRound = true
    const reload = vi.fn(async () => {
      if (!firstRound) return
      firstRound = false
      await gate
    })
    registerSyncReloader('tasks', reload)

    const running = runSyncReloaders()
    const waiting = [runSyncReloaders(), runSyncReloaders(), runSyncReloaders()]

    release()
    await Promise.all([running, ...waiting])

    // Tiga permintaan saat putaran pertama berjalan = satu putaran susulan, bukan tiga.
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('error satu reloader tidak menghentikan sisanya dan tidak jadi rejection', async () => {
    const before = vi.fn(async () => undefined)
    const failing = vi.fn(async () => {
      throw new Error('storage rusak')
    })
    const after = vi.fn(async () => undefined)

    registerSyncReloader('goalLinks', before)
    registerSyncReloader('goals', failing)
    registerSyncReloader('tasks', after)

    await expect(runSyncReloaders()).resolves.toBeUndefined()

    expect(before).toHaveBeenCalledTimes(1)
    expect(after).toHaveBeenCalledTimes(1)
  })

  it('reset membersihkan reloader yang terdaftar', async () => {
    const reload = vi.fn(async () => undefined)
    registerSyncReloader('tasks', reload)

    resetSyncReloadersForTest()
    await runSyncReloaders()

    expect(reload).not.toHaveBeenCalled()
  })
})

/**
 * L2 security review #77: `SYNC_REMOTE_APPLIED_EVENT` bisa dikirim siapa pun di origin yang sama dan
 * tanpa payload. Tanpa jeda, tiap `dispatchEvent` memaksa pembacaan ulang + dekripsi semua store.
 */
describe('throttle event jendela', () => {
  it('dua event beruntun hanya menghasilkan satu putaran', async () => {
    const reload = vi.fn(async () => undefined)
    registerSyncReloader('tasks', reload)

    await runSyncReloaders({ fromWindowEvent: true })
    await runSyncReloaders({ fromWindowEvent: true })

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('burst event jendela saat putaran berjalan tidak menambah putaran', async () => {
    let rounds = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    registerSyncReloader('tasks', async () => {
      rounds += 1
      if (rounds === 1) await gate
    })

    const first = runSyncReloaders({ fromWindowEvent: true })
    await vi.waitFor(() => expect(rounds).toBe(1))

    // Dua puluh event datang SELAGI putaran pertama masih tertahan. Tanpa throttle di depan cabang
    // "sedang berjalan", tiap event menyalakan `repeatRequested` dan putaran susulan berjalan lagi
    // (L2 security review #77: 81 putaran dalam 250 ms).
    for (let index = 0; index < 20; index += 1) void runSyncReloaders({ fromWindowEvent: true })

    release()
    await first

    expect(rounds).toBe(1)
  })

  it('pull nyata melewati throttle: dua notifyRemoteApplied = dua putaran', async () => {
    const reload = vi.fn(async () => undefined)
    registerSyncReloader('tasks', reload)

    let pending: Promise<void> | null = null
    const listener = (): void => {
      pending = runSyncReloaders({ fromWindowEvent: true })
    }
    window.addEventListener(SYNC_REMOTE_APPLIED_EVENT, listener)

    try {
      notifyRemoteApplied()
      // Tunggu putaran benar-benar selesai: permintaan kedua di bawah harus melewati throttle,
      // bukan bergabung ke putaran yang masih berjalan.
      await pending
      expect(reload).toHaveBeenCalledTimes(1)

      // Pull berikutnya datang < 1 detik kemudian (mis. beberapa perubahan dari perangkat lain):
      // data barunya tidak boleh ditelan throttle.
      notifyRemoteApplied()
      await pending
      expect(reload).toHaveBeenCalledTimes(2)
    } finally {
      window.removeEventListener(SYNC_REMOTE_APPLIED_EVENT, listener)
    }
  })
})

describe('isReloadSessionActive', () => {
  it('sesi dari current() ditolak kalau tidak ada sesi terbuka lagi (akun berganti/ditutup)', () => {
    const target = { session: { userId: 'user-a' }, isOpened: true }

    expect(isReloadSessionActive(target, () => null)).toBe(false)
    expect(isReloadSessionActive(target, () => ({ userId: 'user-b' }))).toBe(false)
    expect(isReloadSessionActive(target, () => ({ userId: 'user-a' }))).toBe(true)
  })

  it('sesi suntikan test tetap dipakai saat tidak ada sesi terbuka', () => {
    const target = { session: { userId: 'user-test' }, isOpened: false }

    expect(isReloadSessionActive(target, () => null)).toBe(true)
    expect(isReloadSessionActive(target, () => ({ userId: 'user-b' }))).toBe(false)
  })
})

describe('readAfterWrites', () => {
  it('menunggu antrean tulis selesai sebelum membaca', async () => {
    const order: string[] = []
    let release!: () => void
    const queue = new Promise<void>((resolve) => {
      release = resolve
    })

    const pending = readAfterWrites(
      () => queue,
      async () => {
        order.push('read')
        return 'data'
      },
    )

    await Promise.resolve()
    expect(order).toEqual([])

    release()
    await expect(pending).resolves.toBe('data')
    expect(order).toEqual(['read'])
  })

  it('membaca ulang sekali kalau antrean bertambah selama pembacaan', async () => {
    const first = Promise.resolve()
    const second = Promise.resolve()
    let queue = first
    let reads = 0

    const result = await readAfterWrites(
      () => queue,
      async () => {
        reads += 1
        // Tulisan baru masuk saat pembacaan pertama berjalan (user menekan toggle).
        if (reads === 1) queue = second
        return reads
      },
    )

    expect(result).toBe(2)
    expect(reads).toBe(2)
  })

  it('antrean yang gagal tidak menggagalkan pembacaan', async () => {
    const failed = Promise.reject(new Error('tulis gagal'))

    await expect(
      readAfterWrites(
        () => failed,
        async () => 'ok',
      ),
    ).resolves.toBe('ok')
  })
})
