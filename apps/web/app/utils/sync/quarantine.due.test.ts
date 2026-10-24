// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Karantina yang KEDALUWARSA: pindah ke antrean "due", bukan dibuang.
 *
 * Kenapa ini dikunci: record yang dulu dikarantina sudah tersimpan di `record` dengan `index: 'keep'`
 * dan cursor pull sudah melewatinya, jadi membuang id-nya dari karantina tidak membuat server
 * mengirimnya ulang - record tetap tidak tampil selamanya. Id-nya harus tetap ada supaya
 * `reindexQuarantined()` bisa membangun ulang index dari blob lokal.
 *
 * "Due" juga TIDAK dihitung `quarantinedCount()`/`isQuarantined()`: ia tidak lagi menghalangi pull.
 * Angka yang ditampilkan UI memakai `listQuarantined()` (lihat `useSyncStatus`).
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

const USER = 'user-a'
const OTHER = 'user-b'

let store: Storage

/** Tulis daftar utama apa adanya, supaya umur entri bisa diatur persis. */
function writeOwners(quarantine: Quarantine, owners: Record<string, unknown>): void {
  store.setItem(quarantine.QUARANTINE_STORAGE_KEY, JSON.stringify({ version: 2, owners }))
}

function dueIds(quarantine: Quarantine): readonly string[] {
  const raw = store.getItem(quarantine.QUARANTINE_DUE_STORAGE_KEY)
  if (raw === null) return []

  const parsed = JSON.parse(raw) as {
    owners: Record<string, { atMs: number; ids: string[] }[]>
  }

  return (parsed.owners[USER] ?? []).flatMap((entry) => entry.ids)
}

beforeEach(async () => {
  store = fakeLocalStorage()
  vi.stubGlobal('localStorage', store)
  const quarantine = await load()
  quarantine.clearQuarantineForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('karantina kedaluwarsa', () => {
  it('pindah ke antrean "due" dan tidak lagi dihitung sebagai terkarantina', async () => {
    const quarantine = await load()
    const now = Date.now()

    writeOwners(quarantine, {
      [USER]: [
        { atMs: now - quarantine.QUARANTINE_TTL_MS - 1_000, ids: ['record-basi'] },
        { atMs: now - 1_000, ids: ['record-baru'] },
      ],
    })

    const listed = quarantine.listQuarantined(USER)

    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recordId: 'record-basi', isDue: true }),
        expect.objectContaining({ recordId: 'record-baru', isDue: false }),
      ]),
    )
    expect(listed).toHaveLength(2)
    // Tidak menghalangi pull dan tidak menggelembungkan angka "tidak bisa dibuka".
    expect(quarantine.isQuarantined(USER, 'record-basi')).toBe(false)
    expect(quarantine.quarantinedCount(USER)).toBe(1)
    // Id-nya TIDAK hilang: antrean inilah yang dipakai reindex untuk membangun ulang index.
    expect(dueIds(quarantine)).toEqual(['record-basi'])
  })

  it('releaseQuarantined membuang id dari daftar utama maupun antrean "due"', async () => {
    const quarantine = await load()
    const now = Date.now()

    writeOwners(quarantine, {
      [USER]: [
        { atMs: now - quarantine.QUARANTINE_TTL_MS - 1_000, ids: ['record-basi'] },
        { atMs: now - 1_000, ids: ['record-baru'] },
      ],
    })

    quarantine.releaseQuarantined(USER, ['record-basi', 'record-baru'])

    expect(quarantine.listQuarantined(USER)).toEqual([])
    expect(store.getItem(quarantine.QUARANTINE_DUE_STORAGE_KEY)).toBeNull()
  })

  it('clearQuarantine juga membersihkan antrean "due" akun itu, bukan akun lain', async () => {
    const quarantine = await load()
    const now = Date.now()

    writeOwners(quarantine, {
      [USER]: [{ atMs: now - quarantine.QUARANTINE_TTL_MS - 1_000, ids: ['record-a'] }],
      [OTHER]: [{ atMs: now - quarantine.QUARANTINE_TTL_MS - 1_000, ids: ['record-b'] }],
    })

    // Membaca lebih dulu memindahkan entri basi ke antrean.
    expect(quarantine.listQuarantined(OTHER)).toHaveLength(1)

    quarantine.clearQuarantine(USER)

    expect(quarantine.listQuarantined(USER)).toEqual([])
    expect(quarantine.listQuarantined(OTHER)).toHaveLength(1)
  })

  it('id yang dikarantina ulang pindah dari antrean "due" ke daftar utama', async () => {
    const quarantine = await load()
    const now = Date.now()

    writeOwners(quarantine, {
      [USER]: [{ atMs: now - quarantine.QUARANTINE_TTL_MS - 1_000, ids: ['record-a'] }],
    })

    // Membaca = memindahkannya ke antrean "due".
    expect(quarantine.listQuarantined(USER)).toEqual([
      expect.objectContaining({ recordId: 'record-a', isDue: true }),
    ])

    quarantine.quarantineRecord(USER, 'record-a')

    // Satu id, satu status: tidak dobel di dua daftar.
    expect(quarantine.listQuarantined(USER)).toEqual([
      expect.objectContaining({ recordId: 'record-a', isDue: false }),
    ])
    expect(dueIds(quarantine)).toEqual([])
    expect(quarantine.isQuarantined(USER, 'record-a')).toBe(true)
  })

  it('storage diblokir: daftar kosong dan semua operasi no-op tanpa melempar', async () => {
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

    const quarantine = await load()

    expect(quarantine.listQuarantined(USER)).toEqual([])
    expect(() => quarantine.releaseQuarantined(USER, ['record-a'])).not.toThrow()
    expect(() => quarantine.quarantineRecord(USER, 'record-a')).not.toThrow()
  })
})
