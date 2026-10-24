// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Karantina record gagal-dekripsi.
 *
 * Yang dijaga di sini: daftar bertahan antar-muat halaman (alasan utamanya ada - tanpa itu tiap reload
 * butuh tiga siklus gagal lagi), dibatasi supaya `localStorage` tidak tumbuh tanpa batas, dan TIDAK
 * PERNAH melempar saat storage rusak/diblokir. Storage rusak bukan alasan menghentikan sync.
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
  it('menyimpan id dan membacanya kembali', async () => {
    const quarantine = await load()
    quarantine.adoptQuarantineAccount('user-a')

    quarantine.quarantineRecord('record-1')

    expect(quarantine.isQuarantined('record-1')).toBe(true)
    expect(quarantine.isQuarantined('record-2')).toBe(false)
    expect(quarantine.quarantinedCount()).toBe(1)
    expect(JSON.parse(store.getItem(quarantine.QUARANTINE_STORAGE_KEY) ?? 'null')).toEqual([
      'record-1',
    ])
  })

  it('bertahan setelah modul dimuat ulang (muat halaman berikutnya)', async () => {
    const first = await load()
    first.adoptQuarantineAccount('user-a')
    first.quarantineRecord('record-1')

    // Muat halaman berikutnya: state modul hilang, `localStorage` tetap.
    vi.resetModules()
    const second = await load()

    expect(second.isQuarantined('record-1')).toBe(true)
    expect(second.quarantinedCount()).toBe(1)
  })

  it('membatasi 200 id dan membuang yang paling lama', async () => {
    const quarantine = await load()
    quarantine.adoptQuarantineAccount('user-a')

    for (let index = 0; index < 205; index += 1) quarantine.quarantineRecord(`record-${index}`)

    expect(quarantine.quarantinedCount()).toBe(quarantine.QUARANTINE_MAX_RECORDS)
    expect(quarantine.QUARANTINE_MAX_RECORDS).toBe(200)
    // Lima yang pertama masuk adalah yang dibuang.
    for (let index = 0; index < 5; index += 1) {
      expect(quarantine.isQuarantined(`record-${index}`)).toBe(false)
    }
    expect(quarantine.isQuarantined('record-204')).toBe(true)
  })

  it('id yang sama tidak disimpan dua kali', async () => {
    const quarantine = await load()
    quarantine.adoptQuarantineAccount('user-a')

    quarantine.quarantineRecord('record-1')
    quarantine.quarantineRecord('record-1')

    expect(quarantine.quarantinedCount()).toBe(1)
  })

  it('JSON rusak dibaca sebagai daftar kosong, bukan melempar', async () => {
    const quarantine = await load()
    quarantine.adoptQuarantineAccount('user-a')
    store.setItem(quarantine.QUARANTINE_STORAGE_KEY, '{bukan json')

    expect(quarantine.quarantinedCount()).toBe(0)
    expect(quarantine.isQuarantined('record-1')).toBe(false)

    // Daftar yang rusak tidak mematikan fitur: tulisan berikutnya tetap jalan dari daftar kosong.
    quarantine.quarantineRecord('record-1')
    expect(quarantine.isQuarantined('record-1')).toBe(true)
  })

  it('storage diblokir: semua fungsi no-op dan tidak melempar', async () => {
    const quarantine = await load()
    quarantine.adoptQuarantineAccount('user-a')

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

    expect(() => quarantine.adoptQuarantineAccount('user-b')).not.toThrow()
    expect(() => quarantine.quarantineRecord('record-1')).not.toThrow()
    expect(quarantine.isQuarantined('record-1')).toBe(false)
    expect(quarantine.quarantinedCount()).toBe(0)
    expect(() => quarantine.clearQuarantineForTest()).not.toThrow()
  })

  it('ganti akun membuang daftar akun sebelumnya', async () => {
    const quarantine = await load()
    quarantine.adoptQuarantineAccount('user-a')
    quarantine.quarantineRecord('record-1')

    quarantine.adoptQuarantineAccount('user-a')
    expect(quarantine.isQuarantined('record-1')).toBe(true)

    quarantine.adoptQuarantineAccount('user-b')
    expect(quarantine.quarantinedCount()).toBe(0)
    expect(quarantine.isQuarantined('record-1')).toBe(false)
  })
})
