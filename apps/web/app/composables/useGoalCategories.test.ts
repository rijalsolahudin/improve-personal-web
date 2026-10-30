import {
  DEFAULT_GOAL_CATEGORIES,
  GENERAL_GOAL_CATEGORY_KEY,
  GOAL_CATEGORY_LABEL_MAX,
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  goalCategorySchema,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import type { LocalDataSession } from '~/utils/storage/session'
import {
  loadGoalCategories,
  seedDefaultGoalCategories,
  writeCategory,
} from '~/utils/goals/categories'
import { loadGoalRecords } from '~/utils/goals/persistence'

import { TEST_KID_WIRE } from '../../tests/nuxt/record-key'
import type { LocalDataState } from './useLocalData'
import { resetGoalCategoriesForTest, useGoalCategories } from './useGoalCategories'

/**
 * Kategori goal yang bisa dikelola user (F13).
 *
 * Yang diuji adalah janji ke user: kategori tersimpan (bukan `localStorage`), `general` tidak bisa
 * dihapus, dan menghapus kategori tidak pernah membuat goal kehilangan kategorinya - goal pindah ke
 * `general`. Aturan murninya sendiri diuji di core; di sini yang dibuktikan adalah jalur persistensi
 * dan state reaktifnya.
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

const GOAL_ID = '0192f0a0-0000-7000-8000-000000000001'

function goalPayload(category: string): Record<string, unknown> {
  return {
    id: GOAL_ID,
    title: 'Lari 10K',
    reason: null,
    category,
    coverSticker: null,
    startDate: '2026-01-05',
    targetDate: '2026-03-31',
    status: 'aktif',
    createdAt: NOW_MS,
    updatedAt: NOW_MS,
  }
}

async function writeGoal(session: LocalDataSession, category: string): Promise<void> {
  const payload = goalPayload(category)
  await session.writer.write({
    id: GOAL_ID,
    type: 'goal',
    data: () => payload,
    index: { rangeStartMs: NOW_MS, rangeEndMs: NOW_MS },
  })
}

function resetState(): void {
  setActivePinia(createPinia())
  localStorage.clear()
  clearNuxtState(['goalCategories', 'goalCategoriesStatus', 'goalCategoriesError', 'localData'])
  resetGoalCategoriesForTest()
}

describe('useGoalCategories', () => {
  beforeEach(resetState)

  it('akun baru mendapat kategori bawaan dan langsung menyimpannya untuk sync', async () => {
    const session = memorySession()
    const categories = useGoalCategories({ session: async () => session })

    await categories.hydrate()

    expect(categories.status.value).toBe('ready')
    expect(categories.categories.value.map((entry) => entry.key)).toEqual(
      DEFAULT_GOAL_CATEGORIES.map((entry) => entry.key),
    )
    expect(categories.categories.value[0]?.key).toBe(GENERAL_GOAL_CATEGORY_KEY)

    const stored = await loadGoalCategories(session)
    expect(stored.categories).toHaveLength(DEFAULT_GOAL_CATEGORIES.length)
  })

  it('tambah kategori: label dirapikan, warna otomatis, dan tersimpan sebagai record', async () => {
    const session = memorySession()
    const categories = useGoalCategories({ session: async () => session })
    await categories.hydrate()

    const result = categories.add('  Olahraga  ')
    expect(result).toEqual({ ok: true, key: expect.any(String) })
    if (!result.ok) return

    const added = categories.categories.value.find((entry) => entry.key === result.key)
    expect(added?.label).toBe('Olahraga')
    expect(added?.color).toBe('yellow')
    expect(categories.categories.value.at(-1)?.key).toBe(result.key)

    await vi.waitFor(async () => {
      const stored = await loadGoalCategories(session)
      expect(stored.categories.map((entry) => entry.label)).toContain('Olahraga')
    })
  })

  it('label kosong, kepanjangan, atau duplikat ditolak tanpa menulis apa pun', async () => {
    const session = memorySession()
    const categories = useGoalCategories({ session: async () => session })
    await categories.hydrate()

    expect(categories.add('   ')).toEqual({ ok: false, reason: 'required' })
    expect(categories.add('x'.repeat(GOAL_CATEGORY_LABEL_MAX + 1))).toEqual({
      ok: false,
      reason: 'too_long',
    })
    expect(categories.add('karier')).toEqual({ ok: false, reason: 'duplicate' })
    expect(await session.storage.listIndexByType('goal_category')).toHaveLength(
      DEFAULT_GOAL_CATEGORIES.length,
    )
  })

  it('ganti nama & warna menyimpan record yang sama (bukan membuat kategori baru)', async () => {
    const session = memorySession()
    const categories = useGoalCategories({ session: async () => session })
    await categories.hydrate()

    expect(categories.rename('karier', 'Pekerjaan')).toEqual({ ok: true })
    expect(categories.setColor('karier', 'navy')).toEqual({ ok: true })
    expect(categories.rename('karier', 'kesehatan')).toEqual({
      ok: false,
      reason: 'duplicate',
    })

    await vi.waitFor(async () => {
      const stored = await loadGoalCategories(session)
      const karier = stored.categories.find((entry) => entry.key === 'karier')
      expect(karier).toMatchObject({ label: 'Pekerjaan', color: 'navy' })
      expect(stored.categories).toHaveLength(DEFAULT_GOAL_CATEGORIES.length)
    })
  })

  it('general tidak bisa dihapus', async () => {
    const session = memorySession()
    const categories = useGoalCategories({ session: async () => session })
    await categories.hydrate()

    expect(categories.remove(GENERAL_GOAL_CATEGORY_KEY)).toEqual({
      ok: false,
      reason: 'general',
    })
    expect(categories.categories.value.map((entry) => entry.key)).toContain(
      GENERAL_GOAL_CATEGORY_KEY,
    )
  })

  it('hapus kategori berisi goal: goal pindah ke general, kategori jadi tombstone', async () => {
    const session = memorySession()
    const categories = useGoalCategories({ session: async () => session })
    await categories.hydrate()

    const added = categories.add('Olahraga')
    expect(added.ok).toBe(true)
    if (!added.ok) return

    await writeGoal(session, added.key)

    expect(categories.remove(added.key)).toEqual({ ok: true })
    expect(categories.categories.value.map((entry) => entry.key)).not.toContain(added.key)

    await vi.waitFor(async () => {
      const [goal] = (await loadGoalRecords(session)).goals
      expect(goal?.category).toBe(GENERAL_GOAL_CATEGORY_KEY)
    })

    const stored = await loadGoalCategories(session)
    expect(stored.categories.map((entry) => entry.key)).not.toContain(added.key)
    // Tombstone tetap ada: seeding tidak menghidupkan lagi kategori yang sudah dihapus.
    expect(await session.storage.listIndexByType('goal_category')).toHaveLength(
      DEFAULT_GOAL_CATEGORIES.length + 1,
    )
  })

  it('kategori tak dikenal (dihapus di perangkat lain) tampil sebagai General', async () => {
    const session = memorySession()
    const categories = useGoalCategories({ session: async () => session })
    await categories.hydrate()

    const unknown = categories.resolve('kategori-yang-tidak-ada')
    expect(unknown.key).toBe(GENERAL_GOAL_CATEGORY_KEY)
    expect(unknown.label).toBe('General')
    expect(categories.resolve(undefined).key).toBe(GENERAL_GOAL_CATEGORY_KEY)
  })

  it('reload mengambil kategori yang ditulis perangkat lain (round-trip sync)', async () => {
    const session = memorySession()
    const categories = useGoalCategories({ session: async () => session })
    await categories.hydrate()

    // "Perangkat lain" menulis kategori lalu pull menerapkannya; reload harus membacanya.
    const remote = goalCategorySchema.parse({
      id: session.newId(),
      key: session.newId(),
      label: 'Liburan',
      color: 'red',
      sortOrder: 99,
      updatedAt: session.clock.nowMs(),
    })
    await writeCategory(session, remote)

    await categories.reload()

    expect(categories.categories.value.map((entry) => entry.label)).toContain('Liburan')
  })

  it('reload tidak melakukan seeding walau katalog kosong', async () => {
    const session = memorySession()
    const categories = useGoalCategories({ session: async () => session })
    await categories.hydrate()

    // Kategori dihapus semua di perangkat lain: reload tidak boleh menulis bawaan lagi.
    for (const record of await session.storage.listIndexByType('goal_category')) {
      await session.writer.remove({ id: record.recordId, index: null })
    }

    await categories.reload()

    expect(categories.categories.value).toEqual([])
    expect(await loadGoalCategories(session)).toMatchObject({ categories: [], hasAnyRecord: true })
  })

  it('ganti akun: kategori akun sebelumnya tidak dipakai lagi', async () => {
    const first = memorySession('018f2c4e-0000-7000-8000-00000000000a')
    const second = memorySession('018f2c4e-0000-7000-8000-00000000000b')

    let active = first
    const categories = useGoalCategories({ session: async () => active })
    await categories.hydrate()

    const added = categories.add('Olahraga')
    expect(added.ok).toBe(true)

    // Akun berganti tanpa reload halaman: sesi baru dibuka untuk akun kedua.
    active = second
    const localData = useState<LocalDataState>('localData')
    localData.value = {
      status: 'ready',
      isFreshKey: true,
      deviceId: second.deviceId,
      userId: second.userId,
      error: null,
    }

    await vi.waitFor(() => {
      expect(categories.categories.value.map((entry) => entry.label)).not.toContain('Olahraga')
    })
    expect(categories.categories.value[0]?.key).toBe(GENERAL_GOAL_CATEGORY_KEY)
  })

  it('operasi ditolak selama katalog belum siap (tidak menulis apa pun)', async () => {
    const session = memorySession()
    // Tanpa `hydrate()`: status masih `idle`.
    const categories = useGoalCategories({ session: async () => session })

    expect(categories.add('Olahraga')).toEqual({ ok: false, reason: 'not_ready' })
    expect(categories.rename('karier', 'Pekerjaan')).toEqual({ ok: false, reason: 'not_ready' })
    expect(categories.remove('karier')).toEqual({ ok: false, reason: 'not_ready' })
    expect(await session.storage.listIndexByType('goal_category')).toEqual([])
  })

  it('kategori bawaan yang sudah ada tidak di-seed ulang saat hydrate kedua', async () => {
    const session = memorySession()
    await seedDefaultGoalCategories(session, session.clock.nowMs())

    const categories = useGoalCategories({ session: async () => session })
    await categories.hydrate()

    expect(categories.categories.value).toHaveLength(DEFAULT_GOAL_CATEGORIES.length)
    expect(await session.storage.listIndexByType('goal_category')).toHaveLength(
      DEFAULT_GOAL_CATEGORIES.length,
    )
  })
})
