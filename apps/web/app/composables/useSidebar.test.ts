import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SIDEBAR_STORAGE_KEY } from '~/stores/ui'

import { useSidebar } from './useSidebar'

describe('useSidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('memakai pilihan yang tersimpan', () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, '1')
    expect(useSidebar().isCollapsed.value).toBe(true)
  })

  it('ciut otomatis di layar sempit selama user belum memilih', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    expect(useSidebar().isCollapsed.value).toBe(true)
  })

  it('toggle membalik nilai dan menyimpannya', () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, '0')
    const sidebar = useSidebar()

    expect(sidebar.isCollapsed.value).toBe(false)
    sidebar.toggle()
    expect(sidebar.isCollapsed.value).toBe(true)
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('1')

    sidebar.toggle()
    expect(sidebar.isCollapsed.value).toBe(false)
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('0')
  })
})
