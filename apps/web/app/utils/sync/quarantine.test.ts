// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Karantina record gagal-dekripsi.
 *
 * Yang dijaga di sini: daftar bertahan antar-muat halaman (alasan utamanya ada - tanpa itu tiap reload
 * butuh tiga siklus gagal lagi), terpisah PER AKUN (satu tab tidak menghapus milik tab lain), dibatasi
 * supaya `localStorage` tidak tumbuh tanpa batas, dan TIDAK PERNAH melempar saat storage rusak/diblokir.
 * Storage rusak bukan alasan menghentikan sync.
 *
 * Environment `node` (bukan happy-dom): modul ini hanya berbicara dengan `localStorage`, jadi stub
 * tipis cukup - dan satu environment Nuxt lebih sedikit yang ikut berebut CPU dengan test lain.
 */

type Quarantine = typeof import('./quarantine')

async function load(): Promise<Quarantine> {
  return await import('./quarantine')
}

function fakeLocalStorage(): Storage {
  const values = new Map<string, string>()

  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key)
    },
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  } as Storage
}

const USER_A = 'user-a'
const USER_B = 'user-b'

let store: Storage

beforeEach(async () => {
  store = fakeLocalStorage()
  vi.stubGlobal('localStorage', store)
  const quarantine = await load()
  quarantine.clearQuarantineForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('karantina record', () => {
  it('menyimpan id dan membacanya kembali untuk pemiliknya', async () => {
    const quarantine = await load()

    quarantine.quarantineRecord(USER_A, 'record-1')

    expect(quarantine.isQuarantined(USER_A, 'record-1')).toBe(true)
    expect(quarantine.isQuarantined(USER_A, 'record-2')).toBe(false)
    expect(quarantine.quarantinedCount(USER_A)).toBe(1)
    expect(JSON.parse(store.getItem(quarantine.QUARANTINE_STORAGE_KEY) ?? 'null')).toEqual({
      version: 2,
      owners: { [USER_A]: [{ atMs: expect.any(Number), ids: ['record-1'] }] },
    })
  })

  it('bertahan setelah modul dimuat ulang (muat halaman berikutnya)', async () => {
    const first = await load()
    first.quarantineRecord(USER_A, 'record-1')

    // Muat halaman berikutnya: state modul hilang, `localStorage` tetap.
    vi.resetModules()
    const second = await load()

    expect(second.isQuarantined(USER_A, 'record-1')).toBe(true)
    expect(second.quarantinedCount(USER_A)).toBe(1)
  })

  it('dua akun punya daftar sendiri: akun B tidak mengosongkan akun A', async () => {
    const quarantine = await load()

    quarantine.quarantineRecord(USER_A, 'record-1')
    quarantine.quarantineRecord(USER_B, 'record-2')

    // Inilah yang dulu rusak: membuka akun B (tab lain) menghapus daftar akun A yang masih sync.
    expect(quarantine.isQuarantined(USER_A, 'record-1')).toBe(true)
    expect(quarantine.isQuarantined(USER_B, 'record-2')).toBe(true)
    expect(quarantine.isQuarantined(USER_A, 'record-2')).toBe(false)
    expect(quarantine.quarantinedCount(USER_A)).toBe(1)
    expect(quarantine.quarantinedCount(USER_B)).toBe(1)
  })

  it('membatasi 200 id PER PEMILIK dan tidak mengganggu pemilik lain', async () => {
    const quarantine = await load()

    for (let index = 0; index < 205; index += 1) {
      quarantine.quarantineRecord(USER_A, `record-${index}`)
    }
    quarantine.quarantineRecord(USER_B, 'record-b')

    expect(quarantine.quarantinedCount(USER_A)).toBe(quarantine.QUARANTINE_MAX_RECORDS)
    expect(quarantine.QUARANTINE_MAX_RECORDS).toBe(200)
    // Lima yang pertama masuk adalah yang dibuang.
    for (let index = 0; index < 5; index += 1) {
      expect(quarantine.isQuarantined(USER_A, `record-${index}`)).toBe(false)
    }
    expect(quarantine.isQuarantined(USER_A, 'record-204')).toBe(true)
    expect(quarantine.quarantinedCount(USER_B)).toBe(1)
  })

  it('membatasi jumlah pemilik yang disimpan, membuang yang paling lama menulis', async () => {
    const quarantine = await load()

    for (const owner of ['user-1', 'user-2', 'user-3', 'user-4', 'user-5']) {
      quarantine.quarantineRecord(owner, 'record-1')
    }

    expect(quarantine.QUARANTINE_MAX_OWNERS).toBe(3)
    // Tiga terbaru bertahan; dua yang paling lama menulis dibuang beserta daftarnya.
    expect(quarantine.quarantinedCount('user-1')).toBe(0)
    expect(quarantine.quarantinedCount('user-2')).toBe(0)
    for (const owner of ['user-3', 'user-4', 'user-5']) {
      expect(quarantine.isQuarantined(owner, 'record-1')).toBe(true)
    }

    const stored = JSON.parse(store.getItem(quarantine.QUARANTINE_STORAGE_KEY) ?? 'null') as {
      owners: Record<string, unknown>
    }
    expect(Object.keys(stored.owners)).toEqual(['user-3', 'user-4', 'user-5'])
  })

  it('id yang sama tidak disimpan dua kali', async () => {
    const quarantine = await load()

    quarantine.quarantineRecord(USER_A, 'record-1')
    quarantine.quarantineRecord(USER_A, 'record-1')

    expect(quarantine.quarantinedCount(USER_A)).toBe(1)
  })

  it('JSON rusak dibaca sebagai daftar kosong, bukan melempar', async () => {
    const quarantine = await load()
    store.setItem(quarantine.QUARANTINE_STORAGE_KEY, '{bukan json')

    expect(quarantine.quarantinedCount(USER_A)).toBe(0)
    expect(quarantine.isQuarantined(USER_A, 'record-1')).toBe(false)

    // Daftar yang rusak tidak mematikan fitur: tulisan berikutnya tetap jalan dari daftar kosong.
    quarantine.quarantineRecord(USER_A, 'record-1')
    expect(quarantine.isQuarantined(USER_A, 'record-1')).toBe(true)
  })

  it('bentuk lama (array tanpa pemilik) diabaikan, bukan melempar', async () => {
    const quarantine = await load()
    // Versi sebelumnya menyimpan array polos + key pemilik terpisah.
    store.setItem(quarantine.QUARANTINE_STORAGE_KEY, '["record-1"]')

    expect(quarantine.quarantinedCount(USER_A)).toBe(0)
    expect(quarantine.isQuarantined(USER_A, 'record-1')).toBe(false)
  })

  it('entri lebih tua dari 7 hari dibuang saat dibaca, sehingga record dicoba lagi', async () => {
    const quarantine = await load()
    const now = Date.now()

    store.setItem(
      quarantine.QUARANTINE_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        owners: {
          [USER_A]: [
            { atMs: now - quarantine.QUARANTINE_TTL_MS - 1_000, ids: ['record-basi'] },
            { atMs: now - 1_000, ids: ['record-baru'] },
          ],
        },
      }),
    )

    expect(quarantine.isQuarantined(USER_A, 'record-basi')).toBe(false)
    expect(quarantine.isQuarantined(USER_A, 'record-baru')).toBe(true)
    expect(quarantine.quarantinedCount(USER_A)).toBe(1)

    // Entri basi benar-benar hilang dari penyimpanan saat dibaca, bukan cuma diabaikan.
    const stored = JSON.parse(store.getItem(quarantine.QUARANTINE_STORAGE_KEY) ?? 'null') as {
      owners: Record<string, { atMs: number; ids: string[] }[]>
    }
    expect(stored.owners[USER_A]?.map((entry) => entry.ids)).toEqual([['record-baru']])
  })

  it('bentuk version: 1 lama dibuang tanpa crash dan tidak menghalangi tulisan baru', async () => {
    const quarantine = await load()
    store.setItem(
      quarantine.QUARANTINE_STORAGE_KEY,
      JSON.stringify({ version: 1, owners: { [USER_A]: ['record-1'] } }),
    )

    expect(quarantine.isQuarantined(USER_A, 'record-1')).toBe(false)
    expect(quarantine.quarantinedCount(USER_A)).toBe(0)

    quarantine.quarantineRecord(USER_A, 'record-2')
    expect(quarantine.isQuarantined(USER_A, 'record-2')).toBe(true)
  })

  it('clearQuarantine hanya menghapus milik akun yang diminta', async () => {
    const quarantine = await load()

    quarantine.quarantineRecord(USER_A, 'record-a')
    quarantine.quarantineRecord(USER_B, 'record-b')

    quarantine.clearQuarantine(USER_A)

    expect(quarantine.quarantinedCount(USER_A)).toBe(0)
    expect(quarantine.isQuarantined(USER_A, 'record-a')).toBe(false)
    expect(quarantine.quarantinedCount(USER_B)).toBe(1)
    expect(quarantine.isQuarantined(USER_B, 'record-b')).toBe(true)
  })

  it('owner/id kosong tidak pernah menulis apa pun', async () => {
    const quarantine = await load()

    quarantine.quarantineRecord('', 'record-1')
    quarantine.quarantineRecord(USER_A, '')

    expect(quarantine.quarantinedCount(USER_A)).toBe(0)
    expect(store.getItem(quarantine.QUARANTINE_STORAGE_KEY)).toBeNull()
  })

  it('storage diblokir: semua fungsi no-op dan tidak melempar', async () => {
    const quarantine = await load()

    // Storage "diblokir" = setiap akses propertinya melempar (mode privat/kebijakan ketat).
    vi.stubGlobal(
      'localStorage',
      new Proxy(
        {},
        {
          get: () => {
            throw new Error('storage diblokir')
          },
        },
      ),
    )

    expect(() => quarantine.quarantineRecord(USER_A, 'record-1')).not.toThrow()
    expect(quarantine.isQuarantined(USER_A, 'record-1')).toBe(false)
    expect(quarantine.quarantinedCount(USER_A)).toBe(0)
    expect(() => quarantine.clearQuarantine(USER_A)).not.toThrow()
    expect(() => quarantine.clearQuarantineForTest()).not.toThrow()
  })
})
