import { beforeEach, describe, expect, it } from 'vitest'

import { clearAppStorage } from './useLogout'

describe('clearAppStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('menghapus key app (ip-*) saja', () => {
    localStorage.setItem('ip-theme', 'ungu')
    localStorage.setItem('ip-style', 'tegas')
    localStorage.setItem('ip-deco', '[]')
    localStorage.setItem('other-site', 'keep')

    clearAppStorage(localStorage)

    expect(localStorage.getItem('ip-theme')).toBeNull()
    expect(localStorage.getItem('ip-style')).toBeNull()
    expect(localStorage.getItem('ip-deco')).toBeNull()
    expect(localStorage.getItem('other-site')).toBe('keep')
  })
})
