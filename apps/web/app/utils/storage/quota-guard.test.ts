import { afterEach, describe, expect, it } from 'vitest'

import { guardStorageWrite } from './quota-guard'
import { StorageQuotaError } from './quota'
import { resetStorageQuotaForTest, storageQuotaState } from './pressure'

afterEach(() => {
  resetStorageQuotaForTest()
})

describe('guardStorageWrite', () => {
  it('meneruskan hasil commit yang sukses tanpa sinyal', async () => {
    await expect(guardStorageWrite(async () => 'ok', 1)).resolves.toBe('ok')
    expect(storageQuotaState()).toBeNull()
  })

  it('memetakan error kuota + mengirim sinyal ke shell', async () => {
    const cause = new DOMException('penuh', 'QuotaExceededError')

    await expect(
      guardStorageWrite(async () => {
        throw cause
      }, 42),
    ).rejects.toBeInstanceOf(StorageQuotaError)

    expect(storageQuotaState()).toEqual({ atMs: 42 })
  })

  it('error non-kuota diteruskan apa adanya tanpa sinyal', async () => {
    const cause = new Error('DataCloneError')

    await expect(
      guardStorageWrite(async () => {
        throw cause
      }, 42),
    ).rejects.toBe(cause)

    expect(storageQuotaState()).toBeNull()
  })

  it('sinyal tidak hilang saat commit berikutnya sukses', async () => {
    const cause = new DOMException('penuh', 'QuotaExceededError')

    await expect(
      guardStorageWrite(async () => {
        throw cause
      }, 7),
    ).rejects.toBeInstanceOf(StorageQuotaError)
    expect(storageQuotaState()).toEqual({ atMs: 7 })

    await guardStorageWrite(async () => 'ok', 8)

    // State tetap ada sampai user menutup banner; commit sukses tidak menghapusnya.
    expect(storageQuotaState()).toEqual({ atMs: 7 })
  })
})
