import { describe, expect, it, vi } from 'vitest'

import {
  ensureStorageProtection,
  formatBytes,
  isStorageLow,
  isStoragePersisted,
  QUOTA_WARN_RATIO,
  readStorageEstimate,
  requestStoragePersistence,
  storageUsageRatio,
} from './durability'

/** Manager palsu: cukup method yang dipakai modul, tanpa IndexedDB sungguhan. */
function fakeManager(overrides: Partial<StorageManager>): StorageManager {
  return overrides as StorageManager
}

const KB = 1024
const MB = KB * 1024
const GB = MB * 1024

describe('formatBytes', () => {
  it('memilih satuan yang enak dibaca', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(KB)).toBe('1 KB')
    expect(formatBytes(KB * 1.5)).toBe('1,5 KB')
    expect(formatBytes(5 * MB)).toBe('5 MB')
    expect(formatBytes(2.5 * GB)).toBe('2,5 GB')
  })

  it('nilai tidak masuk akal tidak bikin UI rusak', () => {
    expect(formatBytes(-1)).toBe('-')
    expect(formatBytes(Number.NaN)).toBe('-')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('-')
  })
})

describe('storageUsageRatio', () => {
  it('menghitung porsi pemakaian', () => {
    expect(storageUsageRatio({ usage: MB, quota: 4 * MB })).toBe(0.25)
  })

  it('tidak pernah melewati 1 walau angka browser aneh', () => {
    expect(storageUsageRatio({ usage: 8 * MB, quota: 4 * MB })).toBe(1)
  })

  it('null kalau angka tidak lengkap atau kuota nol', () => {
    expect(storageUsageRatio({ usage: null, quota: MB })).toBeNull()
    expect(storageUsageRatio({ usage: MB, quota: null })).toBeNull()
    expect(storageUsageRatio({ usage: MB, quota: 0 })).toBeNull()
  })
})

describe('isStorageLow', () => {
  it('memakai ambang yang sama dengan peringatan UI', () => {
    expect(QUOTA_WARN_RATIO).toBe(0.75)
    expect(isStorageLow(0.75)).toBe(true)
    expect(isStorageLow(0.74)).toBe(false)
    expect(isStorageLow(null)).toBe(false)
  })
})

describe('readStorageEstimate', () => {
  it('membaca usage + quota', async () => {
    const manager = fakeManager({ estimate: vi.fn().mockResolvedValue({ usage: MB, quota: GB }) })

    await expect(readStorageEstimate(manager)).resolves.toEqual({ usage: MB, quota: GB })
  })

  it('field yang tidak ada jadi null, bukan undefined', async () => {
    const manager = fakeManager({ estimate: vi.fn().mockResolvedValue({}) })

    await expect(readStorageEstimate(manager)).resolves.toEqual({ usage: null, quota: null })
  })

  it('kegagalan browser tidak melempar ke UI', async () => {
    const manager = fakeManager({ estimate: vi.fn().mockRejectedValue(new Error('blocked')) })

    await expect(readStorageEstimate(manager)).resolves.toEqual({ usage: null, quota: null })
  })

  it('tanpa StorageManager (SSR/browser lama)', async () => {
    await expect(readStorageEstimate(null)).resolves.toEqual({ usage: null, quota: null })
  })
})

describe('isStoragePersisted', () => {
  it('meneruskan jawaban browser', async () => {
    await expect(
      isStoragePersisted(fakeManager({ persisted: vi.fn().mockResolvedValue(true) })),
    ).resolves.toBe(true)
    await expect(
      isStoragePersisted(fakeManager({ persisted: vi.fn().mockResolvedValue(false) })),
    ).resolves.toBe(false)
  })

  it('null saat tidak didukung atau gagal', async () => {
    await expect(isStoragePersisted(fakeManager({}))).resolves.toBeNull()
    await expect(
      isStoragePersisted(fakeManager({ persisted: vi.fn().mockRejectedValue(new Error('x')) })),
    ).resolves.toBeNull()
  })
})

describe('requestStoragePersistence', () => {
  it('true saat browser memberi status persistent', async () => {
    const persist = vi.fn().mockResolvedValue(true)

    await expect(requestStoragePersistence(fakeManager({ persist }))).resolves.toBe(true)
    expect(persist).toHaveBeenCalledOnce()
  })

  it('false saat ditolak, tidak didukung, atau gagal', async () => {
    await expect(
      requestStoragePersistence(fakeManager({ persist: vi.fn().mockResolvedValue(false) })),
    ).resolves.toBe(false)
    await expect(requestStoragePersistence(fakeManager({}))).resolves.toBe(false)
    await expect(
      requestStoragePersistence(
        fakeManager({ persist: vi.fn().mockRejectedValue(new Error('x')) }),
      ),
    ).resolves.toBe(false)
    await expect(requestStoragePersistence(null)).resolves.toBe(false)
  })
})

describe('ensureStorageProtection', () => {
  it('tidak memanggil persist lagi kalau sudah persistent', async () => {
    const persist = vi.fn()
    const manager = fakeManager({
      persisted: vi.fn().mockResolvedValue(true),
      persist,
    })

    await expect(ensureStorageProtection(manager)).resolves.toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('meminta persist kalau belum persistent', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    const manager = fakeManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist,
    })

    await expect(ensureStorageProtection(manager)).resolves.toBe(true)
    expect(persist).toHaveBeenCalledOnce()
  })
})
