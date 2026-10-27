import {
  APP_STYLES,
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  isKnownAppStyle,
  normalizeUserPrefs,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'
import { createPinia, setActivePinia } from 'pinia'
import { STYLE_NAMES, THEME_NAMES } from '@improve-personal/tokens'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocalDataSession } from '~/utils/storage/session'
import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import { useAppearanceStore } from '~/stores/appearance'

import {
  fromPrefStyle,
  resetAppearancePrefsForTest,
  toPrefStyle,
  useAppearancePrefs,
} from './useAppearancePrefs'
import { TEST_KID_WIRE } from '../../tests/nuxt/record-key'

/**
 * Preferensi tampilan di atas `user_prefs` (F16, AC3).
 *
 * Yang dijaga di sini adalah dua hal yang tidak terlihat dari UI:
 * - pilihan benar-benar ditulis ke repository (masuk outbox sync), bukan hanya `localStorage`;
 * - kosakata gaya `cute-pure` (kanonik untuk CSS & `user_prefs`) tetap utuh, termasuk saat membaca
 *   ejaan lama `cute_pure` - Cute Pure tidak boleh jatuh ke Cute.
 */

const NOW_MS = 1_700_000_000_000
const DATA_KEY: SecureKeyMaterial = { kind: 'raw-32', handle: new Uint8Array(32) }

const fakeProvider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => Buffer.from(plaintext, 'utf8').toString('base64'),
  openRecord: async ({ blob }) => Buffer.from(blob, 'base64').toString('utf8'),
}

function memorySession(userId = '018f2c4e-0000-7000-8000-00000000000a'): LocalDataSession {
  const clock = createManualClock(NOW_MS)
  const storage = createMemoryStorage({ clock })
  const hlc = createHlcGenerator({ deviceId: '018f2c4e-0000-7000-8000-0000000000d1', clock })

  return {
    storage,
    provider: fakeProvider,
    clock,
    dataKey: DATA_KEY,
    kid: TEST_KID_WIRE,
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

async function writePrefs(
  session: LocalDataSession,
  data: { themeColor: string; style: string },
): Promise<string> {
  const id = session.newId()
  await session.writer.write({
    type: 'user_prefs',
    id,
    data: () => ({ id, hideDecorations: false, updatedAt: NOW_MS, ...data }),
  })
  return id
}

async function records(session: LocalDataSession) {
  return session.repos.userPrefs.listAll()
}

describe('kosakata gaya CSS ↔ user_prefs', () => {
  it('setiap gaya UI punya padanan yang dikenal core (tidak ada yang jatuh ke default)', () => {
    for (const style of STYLE_NAMES) {
      const pref = toPrefStyle(style)
      expect(isKnownAppStyle(pref), `${style} → ${pref} tidak dikenal core`).toBe(true)
      expect(fromPrefStyle(pref)).toBe(style)
    }
    expect(toPrefStyle('cute-pure')).toBe('cute-pure')
    // Alias lama tetap terbaca, tetapi hasilnya selalu kanonik.
    expect(fromPrefStyle('cute_pure')).toBe('cute-pure')
    expect(fromPrefStyle('cute-pure')).toBe('cute-pure')
    expect([...STYLE_NAMES]).toHaveLength(APP_STYLES.length)
  })

  it('nilai tak dikenal tidak dikarang menjadi gaya lain', () => {
    expect(fromPrefStyle('neon')).toBeNull()
    expect(fromPrefStyle(null)).toBeNull()
    expect(fromPrefStyle(42)).toBeNull()
  })
})

describe('useAppearancePrefs di atas repository user_prefs', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    clearNuxtState(['appearancePrefsStatus', 'appearancePrefsError'])
    resetAppearancePrefsForTest()
  })

  it('akun tanpa record mulai dari default lalu menyimpannya untuk sync', async () => {
    const session = memorySession()
    const prefs = useAppearancePrefs({ session: async () => session })
    await prefs.hydrate()

    const store = useAppearanceStore()
    expect(store.theme).toBe('kuning')
    expect(store.style).toBe('cute')

    const saved = await records(session)
    expect(saved).toHaveLength(1)
    expect(saved[0]?.data).toMatchObject({ themeColor: 'kuning', style: 'cute' })
  })

  it('Cute Pure yang tersimpan dengan ejaan lama `cute_pure` tetap terbaca kanonik', async () => {
    const session = memorySession()
    await writePrefs(session, { themeColor: 'ungu', style: 'cute_pure' })

    await useAppearancePrefs({ session: async () => session }).hydrate()

    const store = useAppearanceStore()
    expect(store.theme).toBe('ungu')
    expect(store.style).toBe('cute-pure')
  })

  it('memilih gaya dari UI menulis `cute-pure` kanonik ke record (schema core menerimanya)', async () => {
    const session = memorySession()
    const prefs = useAppearancePrefs({ session: async () => session })
    await prefs.hydrate()

    useAppearanceStore().setStyle('cute-pure')

    await vi.waitFor(async () => {
      const saved = await records(session)
      expect(saved).toHaveLength(1)
      expect(saved[0]?.data).toMatchObject({ style: 'cute-pure' })
    })
  })

  it('pilihan bertahan setelah "restart" (sesi baru membaca record yang sama)', async () => {
    const session = memorySession()
    const first = useAppearancePrefs({ session: async () => session })
    await first.hydrate()
    useAppearanceStore().setTheme('hijau')
    useAppearanceStore().setStyle('elegan')

    await vi.waitFor(async () => {
      const saved = await records(session)
      expect(saved[0]?.data).toMatchObject({ themeColor: 'hijau', style: 'elegan' })
    })

    // "Restart": store & state halaman dibuang, record di penyimpanan tetap.
    setActivePinia(createPinia())
    clearNuxtState(['appearancePrefsStatus', 'appearancePrefsError'])
    localStorage.clear()

    await useAppearancePrefs({ session: async () => session }).hydrate()

    const store = useAppearanceStore()
    expect(store.theme).toBe('hijau')
    expect(store.style).toBe('elegan')
  })

  it('tema tak dikenal di record tidak mengarang pilihan: kembali ke default tema', async () => {
    const session = memorySession()
    await writePrefs(session, { themeColor: 'merah', style: 'cute' })

    // Record seperti ini ditolak lapisan penyimpanan (schema ketat), jadi yang diuji di sini adalah
    // aturan normalisasi core yang dipakai jalur sync/import - bukan menebak isi record.
    const normalized = normalizeUserPrefs({ themeColor: 'merah', style: 'cute' })
    expect(normalized.themeColor).toBe('kuning')
    expect(fromPrefStyle(normalized.style)).toBe('cute')
  })

  it('hidrasi tidak menulis record kedua', async () => {
    const session = memorySession()
    await writePrefs(session, { themeColor: 'kuning', style: 'cute' })

    await useAppearancePrefs({ session: async () => session }).hydrate()

    await vi.waitFor(async () => {
      expect(await records(session)).toHaveLength(1)
    })
  })

  it('cache lokal diberi tanda pemilik akun supaya tidak dipakai akun lain', async () => {
    const session = memorySession()
    await useAppearancePrefs({ session: async () => session }).hydrate()
    useAppearanceStore().setStyle('tegas')

    expect(useAppearanceStore().ownerUserId).toBe(session.userId)

    // Akun lain di browser yang sama: pilihan akun pertama tidak boleh terbawa.
    useAppearanceStore().adopt('018f2c4e-0000-7000-8000-00000000000b')
    expect(useAppearanceStore().style).toBe('cute')
    expect(useAppearanceStore().ownerUserId).toBe('018f2c4e-0000-7000-8000-00000000000b')

    // Logout: cache dikosongkan, bukan diwariskan.
    useAppearanceStore().forget()
    expect(useAppearanceStore().ownerUserId).toBeNull()
    expect(useAppearanceStore().style).toBe('cute')
    expect(localStorage.getItem('ip-style')).toBeNull()
  })

  it('tema & gaya resmi tetap utuh setelah melewati record', async () => {
    for (const themeColor of THEME_NAMES) {
      const session = memorySession()
      await writePrefs(session, { themeColor, style: 'cute' })
      setActivePinia(createPinia())
      clearNuxtState(['appearancePrefsStatus', 'appearancePrefsError'])
      await useAppearancePrefs({ session: async () => session }).hydrate()
      expect(useAppearanceStore().theme).toBe(themeColor)
    }
  })
})
