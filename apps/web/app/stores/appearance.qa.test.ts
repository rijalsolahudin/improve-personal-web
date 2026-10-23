import { createPinia, setActivePinia } from 'pinia'

import { DEFAULT_STYLE, DEFAULT_THEME, STYLE_NAMES, THEME_NAMES } from '@improve-personal/tokens'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STYLE_STORAGE_KEY, THEME_STORAGE_KEY, useAppearanceStore } from '~/stores/appearance'

/**
 * QA T25 (F16) - preferensi tema & gaya.
 *
 * Bukti yang dicari: dua pilihan independen, semua nilai resmi diterima, nilai asing (localStorage
 * hasil versi lain / sisa data rusak) kembali ke default tanpa error, pilihan bertahan setelah
 * "restart" (store baru), dan storage yang diblokir tidak bikin app crash.
 */

/** Simulasi restart: instance store baru membaca storage yang sama. */
function restart(): ReturnType<typeof useAppearanceStore> {
  setActivePinia(createPinia())
  const store = useAppearanceStore()
  store.restore()
  return store
}

describe('useAppearanceStore (F16)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('default Cute + Kuning saat belum ada pilihan', () => {
    const store = restart()
    expect(store.theme).toBe('kuning')
    expect(store.style).toBe('cute')
    expect(DEFAULT_THEME).toBe('kuning')
    expect(DEFAULT_STYLE).toBe('cute')
  })

  it('menerima & menyimpan seluruh 3 tema dan 7 gaya', () => {
    for (const tema of THEME_NAMES) {
      const store = restart()
      store.setTheme(tema)
      expect(store.theme).toBe(tema)
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(tema)
    }
    for (const gaya of STYLE_NAMES) {
      const store = restart()
      store.setStyle(gaya)
      expect(store.style).toBe(gaya)
      expect(localStorage.getItem(STYLE_STORAGE_KEY)).toBe(gaya)
    }
  })

  it('dua pilihan independen: ganti gaya tidak mengubah tema dan sebaliknya', () => {
    const store = restart()
    store.setTheme('hijau')
    store.setStyle('vintage')
    expect(store.theme).toBe('hijau')
    expect(store.style).toBe('vintage')

    store.setStyle('tegas')
    expect(store.theme).toBe('hijau')
    store.setTheme('ungu')
    expect(store.style).toBe('tegas')
  })

  it('pilihan bertahan setelah restart (store baru membaca storage)', () => {
    const pertama = restart()
    pertama.setTheme('ungu')
    pertama.setStyle('elegan')

    const kedua = restart()
    expect(kedua.theme).toBe('ungu')
    expect(kedua.style).toBe('elegan')
  })

  it('nilai tak dikenal diabaikan: kembali ke default tanpa error', () => {
    const nilaiAsing = [
      '',
      ' ',
      'merah',
      'KUNING',
      ' ungu',
      'cute pure',
      'cute_pure',
      'CUTE',
      '<script>alert(1)</script>',
      'null',
      'undefined',
      '__proto__',
      'constructor',
      JSON.stringify({ theme: 'ungu' }),
    ]
    for (const nilai of nilaiAsing) {
      localStorage.setItem(THEME_STORAGE_KEY, nilai)
      localStorage.setItem(STYLE_STORAGE_KEY, nilai)
      const store = restart()
      expect(store.theme, `nilai tema "${nilai}" seharusnya jatuh ke default`).toBe('kuning')
      expect(store.style, `nilai gaya "${nilai}" seharusnya jatuh ke default`).toBe('cute')
    }
  })

  it('nilai valid tetap dipakai walau pasangannya tak dikenal', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'hijau')
    localStorage.setItem(STYLE_STORAGE_KEY, 'neon')
    const store = restart()
    expect(store.theme).toBe('hijau')
    expect(store.style).toBe('cute')
  })

  it('storage diblokir (mode privat) tidak melempar saat baca', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage diblokir')
    })
    expect(() => restart()).not.toThrow()
    expect(restart().theme).toBe('kuning')
  })

  it('storage diblokir tidak melempar saat tulis: pilihan tetap berlaku di sesi ini', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage penuh')
    })
    const store = restart()
    expect(() => store.setTheme('ungu')).not.toThrow()
    expect(() => store.setStyle('simple')).not.toThrow()
    expect(store.theme).toBe('ungu')
    expect(store.style).toBe('simple')
  })

  it('restore berulang idempoten', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'hijau')
    localStorage.setItem(STYLE_STORAGE_KEY, 'kertas')
    const store = restart()
    store.restore()
    store.restore()
    expect(store.theme).toBe('hijau')
    expect(store.style).toBe('kertas')
  })

  it('restore dengan storage kosong tidak menimpa pilihan sesi berjalan', () => {
    const store = restart()
    store.setTheme('ungu')
    localStorage.clear()
    store.restore()
    expect(store.theme).toBe('ungu')
  })
})
