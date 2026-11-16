import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  RELOAD_ORDER,
  isReloadSessionActive,
  readAfterWrites,
  registerDataReloader,
  resetDataReloadersForTest,
  runDataReloaders,
  type DataReloadKey,
} from './reload'

afterEach(() => {
  resetDataReloadersForTest()
})

describe('registry reload store setelah data lokal berubah', () => {
  it('menjalankan reloader sesuai RELOAD_ORDER, bukan urutan pendaftaran', async () => {
    const calls: DataReloadKey[] = []

    // Didaftarkan terbalik: urutan jalan harus tetap mengikuti daftar, karena goal/goal_link harus
    // selesai sebelum task memakai tautannya.
    for (const key of [...RELOAD_ORDER].reverse()) {
      registerDataReloader(key, async () => {
        calls.push(key)
      })
    }

    await runDataReloaders()

    expect(calls).toEqual([...RELOAD_ORDER])
  })

  it('hanya reloader yang terdaftar yang jalan', async () => {
    const tasks = vi.fn(async () => undefined)
    const memos = vi.fn(async () => undefined)
    registerDataReloader('tasks', tasks)
    registerDataReloader('memos', memos)

    await runDataReloaders()

    expect(tasks).toHaveBeenCalledTimes(1)
    expect(memos).toHaveBeenCalledTimes(1)
  })

  it('kunci yang sama menimpa reloader sebelumnya (satu store, satu reloader)', async () => {
    const first = vi.fn(async () => undefined)
    const second = vi.fn(async () => undefined)
    registerDataReloader('tasks', first)
    registerDataReloader('tasks', second)

    await runDataReloaders()

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
    registerDataReloader('tasks', reload)

    const running = runDataReloaders()
    const waiting = [runDataReloaders(), runDataReloaders(), runDataReloaders()]

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

    registerDataReloader('goalLinks', before)
    registerDataReloader('goals', failing)
    registerDataReloader('tasks', after)

    await expect(runDataReloaders()).resolves.toBeUndefined()

    expect(before).toHaveBeenCalledTimes(1)
    expect(after).toHaveBeenCalledTimes(1)
  })

  it('reset membersihkan reloader yang terdaftar', async () => {
    const reload = vi.fn(async () => undefined)
    registerDataReloader('tasks', reload)

    resetDataReloadersForTest()
    await runDataReloaders()

    expect(reload).not.toHaveBeenCalled()
  })
})

/**
 * L2 security review #77: `SYNC_REMOTE_APPLIED_EVENT` bisa dikirim siapa pun di origin yang sama dan
 * tanpa payload. Tanpa jeda, tiap `dispatchEvent` memaksa pembacaan ulang + dekripsi semua store.
 */
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
