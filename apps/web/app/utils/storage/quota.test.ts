import { describe, expect, it } from 'vitest'

import { isQuotaExceededError, normalizeStorageError, StorageQuotaError } from './quota'

describe('isQuotaExceededError', () => {
  it('mengenali DOMException QuotaExceededError', () => {
    expect(isQuotaExceededError(new DOMException('penuh', 'QuotaExceededError'))).toBe(true)
  })

  it('mengenali error biasa yang membawa nama QuotaExceededError', () => {
    const error = Object.assign(new Error('storage penuh'), { name: 'QuotaExceededError' })

    expect(isQuotaExceededError(error)).toBe(true)
  })

  it('mengenali pesan dari lapisan lain (fake-indexeddb/polyfill)', () => {
    expect(isQuotaExceededError(new Error('QuotaExceededError: storage penuh'))).toBe(true)
    expect(isQuotaExceededError(new Error('The quota has been exceeded.'))).toBe(true)
  })

  it('menolak error lain', () => {
    expect(isQuotaExceededError(new Error('DataCloneError'))).toBe(false)
    expect(isQuotaExceededError('penuh')).toBe(false)
    expect(isQuotaExceededError(null)).toBe(false)
  })
})

describe('normalizeStorageError', () => {
  it('membungkus error kuota tanpa menghilangkan pesan asli', () => {
    const cause = new DOMException('kuota habis', 'QuotaExceededError')
    const normalized = normalizeStorageError(cause)

    expect(normalized).toBeInstanceOf(StorageQuotaError)
    expect((normalized as Error).message).toBe('kuota habis')
    expect((normalized as Error).cause).toBe(cause)
    expect((normalized as Error).name).toBe('StorageQuotaError')
  })

  it('error non-kuota dilewatkan apa adanya', () => {
    const error = new Error('lain')

    expect(normalizeStorageError(error)).toBe(error)
  })
})
