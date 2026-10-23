import {
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppearanceStore } from '~/stores/appearance'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import type { LocalDataSession } from '~/utils/storage/session'

import { resetAppearancePrefsForTest, useAppearancePrefs } from './useAppearancePrefs'

/**
 * QA T25 putaran 2 - verifikasi INDEPENDEN B1 (preferensi per akun di `user_prefs`, bukan localStorage).
 *
 * Berbeda dari test developer: di sini yang dibuktikan adalah perilaku yang diminta acceptance criteria
 * - record benar-benar ditulis ke repository + masuk outbox sync, akun lain di browser yang sama TIDAK
 * mewarisi pilihan, dan `localStorage` hanya cache (menghapusnya tidak menghilangkan pilihan).
 */

const NOW_MS = 1_700_000_000_000
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }
const AKUN_A = '018f2c4e-0000-7000-8000-00000000000a'
const AKUN_B = '018f2c4e-0000-7000-8000-00000000000b'

const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

/** Satu "perangkat" = satu storage terpisah; dua akun memakai dua storage berbeda (seperti DB per akun). */
function perangkat(userId: string): LocalDataSession {
  const clock = createManualClock(NOW_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: '018f2c4e-0000-7000-8000-0000000000d1', clock })

  return {
    storage,
    provider: fakeProvider,
    clock,
    dataKey: DATA_KEY,
    hlc,
    deviceId: '018f2c4e-0000-7000-8000-0000000000d1',
    userId,
    isFreshKey: true,
    keyStore: {
      has: async () => false,
      put: async () => undefined,
      get: async () => null,
      remove: async () => undefined,
    },
    newId: createUuidV7Generator({ clock }),
    withMasterKey: async (work) => work(new Uint8Array(32)),
    repos: createRepositorySet({ storage, provider: fakeProvider, dataKey: DATA_KEY }),
    writer: createRecordWriter({ storage, provider: fakeProvider, dataKey: DATA_KEY, hlc, clock }),
  }
}

function buangState(): void {
  setActivePinia(createPinia())
  clearNuxtState(['appearancePrefsStatus', 'appearancePrefsError'])
  resetAppearancePrefsForTest()
}

async function recordTerbaru(session: LocalDataSession) {
  const rows = await session.repos.userPrefs.listAll()
  return rows.at(-1)?.data ?? null
}

describe('B1 - preferensi di `user_prefs`, bukan localStorage (QA putaran 2)', () => {
  beforeEach(() => {
    localStorage.clear()
    buangState()
  })

  it('pilihan ditulis ke repository user_prefs DAN masuk outbox sync (bukan cuma localStorage)', async () => {
    const session = perangkat(AKUN_A)
    const prefs = useAppearancePrefs({ session: async () => session })
    await prefs.hydrate()

    useAppearanceStore().setTheme('ungu')
    useAppearanceStore().setStyle('elegan')

    await vi.waitFor(async () => {
      expect(await recordTerbaru(session)).toMatchObject({ themeColor: 'ungu', style: 'elegan' })
    })
    // Outbox = bukti record ikut antrean sync (F15), bukan hanya tersimpan lokal.
    expect(await session.storage.countOutbox()).toBeGreaterThan(0)
  })

  it('akun lain di browser yang sama TIDAK mewarisi preferensi akun sebelumnya', async () => {
    const akunA = perangkat(AKUN_A)
    const awal = useAppearancePrefs({ session: async () => akunA })
    await awal.hydrate()
    useAppearanceStore().setTheme('ungu')
    useAppearanceStore().setStyle('elegan')
    await vi.waitFor(async () => {
      expect(await recordTerbaru(akunA)).toMatchObject({ themeColor: 'ungu', style: 'elegan' })
    })
    expect(localStorage.getItem('ip-theme')).toBe('ungu')
    expect(localStorage.getItem('ip-style')).toBe('elegan')

    // Ganti akun: store dibuang, sesi data akun B dibuka. Cache localStorage akun A masih ada.
    buangState()
    const akunB = perangkat(AKUN_B)
    await useAppearancePrefs({ session: async () => akunB }).hydrate()

    const store = useAppearanceStore()
    expect(store.theme).toBe('kuning')
    expect(store.style).toBe('cute')
    expect(store.ownerUserId).toBe(AKUN_B)
    expect(localStorage.getItem('ip-appearance-owner')).toBe(AKUN_B)
    expect(localStorage.getItem('ip-style')).toBe('cute')
    expect(await recordTerbaru(akunB)).toMatchObject({ themeColor: 'kuning', style: 'cute' })
  })

  it('localStorage hanyalah cache: dihapus pun pilihan dibaca ulang dari repository', async () => {
    const session = perangkat(AKUN_A)
    await useAppearancePrefs({ session: async () => session }).hydrate()
    useAppearanceStore().setStyle('tegas')
    useAppearanceStore().setTheme('hijau')
    await vi.waitFor(async () => {
      expect(await recordTerbaru(session)).toMatchObject({ themeColor: 'hijau', style: 'tegas' })
    })

    buangState()
    localStorage.clear()

    await useAppearancePrefs({ session: async () => session }).hydrate()
    const store = useAppearanceStore()
    expect(store.theme).toBe('hijau')
    expect(store.style).toBe('tegas')
  })

  it('record dari perangkat lain dengan ejaan lama `cute_pure` dipakai sebagai Cute Pure (bukan Cute)', async () => {
    const session = perangkat(AKUN_A)
    const id = session.newId()
    await session.writer.write({
      type: 'user_prefs',
      id,
      data: () => ({
        id,
        themeColor: 'ungu',
        style: 'cute_pure',
        hideDecorations: false,
        updatedAt: NOW_MS,
      }),
    })

    await useAppearancePrefs({ session: async () => session }).hydrate()

    const store = useAppearanceStore()
    expect(store.theme).toBe('ungu')
    expect(store.style).toBe('cute-pure')
    // Saat ditulis ulang, ejaannya sudah kanonik.
    useAppearanceStore().setTheme('hijau')
    await vi.waitFor(async () => {
      expect(await recordTerbaru(session)).toMatchObject({
        themeColor: 'hijau',
        style: 'cute-pure',
      })
    })
  })

  it('record berisi nilai asing (dari versi lain) tidak melempar dan jatuh ke default', async () => {
    const session = perangkat(AKUN_A)
    const id = session.newId()
    await session.writer.write({
      type: 'user_prefs',
      id,
      data: () => ({
        id,
        themeColor: 'merah',
        style: 'neon',
        hideDecorations: 'ya',
        updatedAt: NOW_MS,
      }),
    })

    await expect(
      useAppearancePrefs({ session: async () => session }).hydrate(),
    ).resolves.toBeUndefined()

    const store = useAppearanceStore()
    expect(store.theme).toBe('kuning')
    expect(store.style).toBe('cute')
  })
})
