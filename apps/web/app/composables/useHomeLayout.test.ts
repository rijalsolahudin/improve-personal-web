import { beforeEach, describe, expect, it } from 'vitest'

import { defaultHomeLayout, setHidden } from '~/utils/homeLayout'

import { HOME_LAYOUT_STORAGE_KEY, useHomeLayout } from './useHomeLayout'

function stored(): unknown {
  return JSON.parse(localStorage.getItem(HOME_LAYOUT_STORAGE_KEY) ?? 'null')
}

describe('useHomeLayout', () => {
  beforeEach(() => {
    localStorage.clear()
    clearNuxtState(['home-layout', 'home-layout-editing'])
  })

  it('storage kosong atau rusak → layout default', () => {
    expect(useHomeLayout().layout.value).toEqual(defaultHomeLayout())

    clearNuxtState(['home-layout'])
    localStorage.setItem(HOME_LAYOUT_STORAGE_KEY, '{bukan json')
    expect(useHomeLayout().layout.value).toEqual(defaultHomeLayout())
  })

  it('memuat layout tersimpan lewat validasi', () => {
    localStorage.setItem(
      HOME_LAYOUT_STORAGE_KEY,
      JSON.stringify({ L: ['memo'], R: [], wide: ['memo'], hidden: ['x'] }),
    )
    const { layout } = useHomeLayout()
    expect(layout.value.L[0]).toBe('memo')
    expect(layout.value.wide).toEqual(['memo'])
    expect(layout.value.hidden).toEqual([])
  })

  it('update menulis storage; preview drag (persist: false) baru tertulis saat commit', () => {
    const { layout, update, commit } = useHomeLayout()

    update(setHidden(layout.value, 'goal', true))
    expect(stored()).toMatchObject({ hidden: ['goal'] })

    update(setHidden(layout.value, 'memo', true), { persist: false })
    expect(stored()).toMatchObject({ hidden: ['goal'] })
    commit()
    expect(stored()).toMatchObject({ hidden: ['goal', 'memo'] })
  })

  it('reset kembali ke default dan tersimpan', () => {
    const { layout, update, reset } = useHomeLayout()
    update(setHidden(layout.value, 'todo', true))
    reset()
    expect(layout.value).toEqual(defaultHomeLayout())
    expect(stored()).toEqual(defaultHomeLayout())
  })

  it('mode atur dibagi antar pemanggil', () => {
    useHomeLayout().setEditing(true)
    expect(useHomeLayout().isEditing.value).toBe(true)
  })
})
