import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clearStorageQuotaError,
  onStorageQuotaChange,
  reportStorageQuotaError,
  resetStorageQuotaForTest,
  storageQuotaState,
} from './pressure'

afterEach(() => {
  resetStorageQuotaForTest()
})

describe('sinyal kuota penyimpanan', () => {
  it('menyimpan state dan memberi tahu listener', () => {
    const listener = vi.fn()
    onStorageQuotaChange(listener)

    reportStorageQuotaError(1_700_000_000_000)

    expect(storageQuotaState()).toEqual({ atMs: 1_700_000_000_000 })
    expect(listener).toHaveBeenLastCalledWith({ atMs: 1_700_000_000_000 })
  })

  it('clear mengosongkan state dan mengirim null', () => {
    reportStorageQuotaError(1)
    const listener = vi.fn()
    onStorageQuotaChange(listener)

    clearStorageQuotaError()

    expect(storageQuotaState()).toBeNull()
    expect(listener).toHaveBeenLastCalledWith(null)
  })

  it('clear saat state sudah kosong tidak memicu listener', () => {
    const listener = vi.fn()
    onStorageQuotaChange(listener)

    clearStorageQuotaError()

    expect(listener).not.toHaveBeenCalled()
  })

  it('listener bisa berhenti berlangganan', () => {
    const listener = vi.fn()
    const unsubscribe = onStorageQuotaChange(listener)

    unsubscribe()
    reportStorageQuotaError(2)

    expect(listener).not.toHaveBeenCalled()
  })
})
