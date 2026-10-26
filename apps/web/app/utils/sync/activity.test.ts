import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  isSyncRunning,
  markSyncRunEnd,
  markSyncRunStart,
  onSyncActivity,
  resetSyncActivityForTest,
} from './activity'

/**
 * Penanda "sedang sync" untuk indikator shell. Yang diuji perilakunya, bukan isi variabel modul:
 * listener menerima keadaan setelah tiap perubahan, dan hitungan tidak bisa jadi negatif.
 */

afterEach(() => {
  resetSyncActivityForTest()
})

describe('sinyal aktivitas sync', () => {
  it('start/end memberi tahu listener dan mengubah isSyncRunning', () => {
    const seen: boolean[] = []
    const unsubscribe = onSyncActivity((running) => seen.push(running))

    expect(isSyncRunning()).toBe(false)

    markSyncRunStart()
    expect(seen).toEqual([true])
    expect(isSyncRunning()).toBe(true)

    markSyncRunEnd()
    expect(seen).toEqual([true, false])
    expect(isSyncRunning()).toBe(false)

    unsubscribe()
  })

  it('siklus susulan yang tumpang tindih tetap dihitung berjalan sampai siklus terakhir selesai', () => {
    markSyncRunStart()
    markSyncRunStart()

    markSyncRunEnd()
    expect(isSyncRunning()).toBe(true)

    markSyncRunEnd()
    expect(isSyncRunning()).toBe(false)
  })

  it('end tanpa start tidak membuat hitungan negatif', () => {
    markSyncRunEnd()

    expect(isSyncRunning()).toBe(false)
  })

  it('listener yang dilepas tidak dipanggil lagi', () => {
    const listener = vi.fn()
    const unsubscribe = onSyncActivity(listener)

    unsubscribe()
    markSyncRunStart()

    expect(listener).not.toHaveBeenCalled()
  })
})
