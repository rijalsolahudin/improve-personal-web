import {
  DEFAULT_GOAL_CATEGORIES,
  GENERAL_GOAL_CATEGORY,
  GENERAL_GOAL_CATEGORY_KEY,
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  goalCategorySchema,
  goalSchema,
  type CryptoProvider,
  type SecureKeyMaterial,
} from '@improve-personal/core'
import { describe, expect, it } from 'vitest'

import { createRecordWriter } from '~/utils/storage/record-writer'
import { createRepositorySet } from '~/utils/storage/repository'
import { createUuidV7Generator } from '~/utils/storage/uuid'
import type { LocalDataSession } from '~/utils/storage/session'
import type { Goal } from '~/utils/goals'

import { TEST_KID_WIRE } from '../../../tests/nuxt/record-key'
import {
  deleteCategory,
  loadGoalCategories,
  seedDefaultGoalCategories,
  toGoalCategoryView,
  writeCategory,
} from './categories'
import { loadGoalRecords, moveGoalsToCategory, persistGoal } from './persistence'

/**
 * Persistensi `goal_category` + pemindahan goal saat kategori dihapus.
 *
 * Yang dibuktikan di sini adalah perilaku yang tidak terlihat dari UI:
 * - kategori benar-benar jadi record tersendiri (bukan `localStorage`), sehingga ikut sync;
 * - seeding bawaan idempoten & memakai id tetap, jadi dua perangkat tidak menghasilkan dua "General";
 * - goal yang kategorinya dihapus benar-benar dipindah ke `general` di penyimpanan.
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
const OTHER_GOAL_ID = '0192f0a0-0000-7000-8000-000000000002'

function goalPayload(id: string, category: string): Record<string, unknown> {
  return {
    id,
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

async function writeGoalRecord(
  session: LocalDataSession,
  id: string,
  category: string,
): Promise<void> {
  const payload = goalPayload(id, category)
  await session.writer.write({
    id,
    type: 'goal',
    data: () => payload,
    index: { rangeStartMs: NOW_MS, rangeEndMs: NOW_MS },
  })
}

describe('record goal_category', () => {
  it('akun tanpa kategori: belum ada record, lalu seeding menulis kategori bawaan', async () => {
    const session = memorySession()

    const before = await loadGoalCategories(session)
    expect(before).toEqual({ categories: [], hasAnyRecord: false })

    const seeded = await seedDefaultGoalCategories(session, session.clock.nowMs())
    expect(seeded.map((category) => category.key)).toEqual(
      DEFAULT_GOAL_CATEGORIES.map((category) => category.key),
    )

    const after = await loadGoalCategories(session)
    expect(after.hasAnyRecord).toBe(true)
    expect(after.categories).toHaveLength(DEFAULT_GOAL_CATEGORIES.length)
    expect(after.categories[0]?.key).toBe(GENERAL_GOAL_CATEGORY_KEY)
  })

  it('seeding dua kali tidak menumpuk kategori (id record tetap)', async () => {
    const session = memorySession()
    await seedDefaultGoalCategories(session, session.clock.nowMs())
    await seedDefaultGoalCategories(session, session.clock.nowMs() + 1)

    const loaded = await loadGoalCategories(session)
    expect(loaded.categories).toHaveLength(DEFAULT_GOAL_CATEGORIES.length)
  })

  it('tulis & hapus kategori bertahan sebagai record (tombstone tetap dihitung)', async () => {
    const session = memorySession()
    await seedDefaultGoalCategories(session, session.clock.nowMs())

    const category = goalCategorySchema.parse({
      id: session.newId(),
      key: session.newId(),
      label: 'Olahraga',
      color: 'green',
      sortOrder: 10,
      updatedAt: session.clock.nowMs(),
    })
    await writeCategory(session, category)

    expect((await loadGoalCategories(session)).categories.map((entry) => entry.label)).toContain(
      'Olahraga',
    )

    await deleteCategory(session, category.id)
    const loaded = await loadGoalCategories(session)

    expect(loaded.categories.map((entry) => entry.label)).not.toContain('Olahraga')
    // Tombstone tetap ada: seeding tidak boleh menghidupkan bawaan yang sudah dihapus user.
    expect(loaded.hasAnyRecord).toBe(true)
  })

  it('view kategori membawa hex palet supaya UI tidak perlu tabel sendiri', () => {
    const view = toGoalCategoryView(GENERAL_GOAL_CATEGORY)

    expect(view.color).toBe('gray')
    expect(view.accent).toMatch(/^#[0-9A-F]{6}$/i)
    expect(view.key).toBe(GENERAL_GOAL_CATEGORY_KEY)
  })
})

describe('kategori pada record goal', () => {
  it('kategori berbentuk rusak dinormalkan ke general saat hydrate (tidak menggagalkan daftar)', async () => {
    const session = memorySession()
    // Data dari app versi lain / record rusak: writer tidak memvalidasi payload, jadi ini simulasi
    // yang sah untuk isi blob yang tidak dibuat build ini.
    await writeGoalRecord(session, GOAL_ID, 'Bukan Kategori!')
    await writeGoalRecord(session, OTHER_GOAL_ID, 'kesehatan')

    const loaded = await loadGoalRecords(session)

    expect(loaded.goals).toHaveLength(2)
    expect(loaded.goals.map((goal) => goal.category)).toEqual([
      GENERAL_GOAL_CATEGORY_KEY,
      'kesehatan',
    ])
  })

  it('kategori buatan user yang belum tersinkron tetap dipertahankan di record', async () => {
    const session = memorySession()
    const custom = session.newId()

    await writeGoalRecord(session, GOAL_ID, custom)

    const [goal] = (await loadGoalRecords(session)).goals
    expect(goal?.category).toBe(custom)
    expect(goalSchema.safeParse(goal).success).toBe(true)
  })
})

describe('kategori saat goal disimpan', () => {
  function presentationGoal(category: string): Goal {
    return {
      id: GOAL_ID,
      title: 'Lari 10K',
      why: '',
      category,
      status: 'aktif',
      start: '2026-01-05',
      end: '2026-03-31',
      cover: null,
      along: [],
      chapters: [],
    }
  }

  it('kategori yang sudah dihapus tidak ditulis ulang (goal jatuh ke general)', async () => {
    const session = memorySession()
    await seedDefaultGoalCategories(session, session.clock.nowMs())

    // State form/UI masih memegang kunci kategori yang sudah tidak ada di katalog.
    await persistGoal(session, presentationGoal('kategori-yang-sudah-dihapus'))

    const [goal] = (await loadGoalRecords(session)).goals
    expect(goal?.category).toBe(GENERAL_GOAL_CATEGORY_KEY)
  })

  it('kategori bawaan (nilai lama) tetap ditulis apa adanya', async () => {
    const session = memorySession()
    await seedDefaultGoalCategories(session, session.clock.nowMs())

    await persistGoal(session, presentationGoal('kesehatan'))

    const [goal] = (await loadGoalRecords(session)).goals
    expect(goal?.category).toBe('kesehatan')
  })

  it('akun yang belum punya katalog tidak dipaksa pindah ke general', async () => {
    const session = memorySession()

    await persistGoal(session, presentationGoal('karier'))

    const [goal] = (await loadGoalRecords(session)).goals
    expect(goal?.category).toBe('karier')
  })
})

describe('moveGoalsToCategory', () => {
  it('memindahkan hanya goal dari kategori sumber, record lain tidak berubah', async () => {
    const session = memorySession()
    const custom = session.newId()
    await writeGoalRecord(session, GOAL_ID, custom)
    await writeGoalRecord(session, OTHER_GOAL_ID, 'karier')

    const moved = await moveGoalsToCategory(
      session,
      custom,
      GENERAL_GOAL_CATEGORY_KEY,
      session.clock.nowMs(),
    )

    expect(moved).toEqual([GOAL_ID])
    const goals = (await loadGoalRecords(session)).goals
    expect(goals.find((goal) => goal.id === GOAL_ID)?.category).toBe(GENERAL_GOAL_CATEGORY_KEY)
    expect(goals.find((goal) => goal.id === OTHER_GOAL_ID)?.category).toBe('karier')
  })

  it('kategori sumber kosong tidak menulis apa pun', async () => {
    const session = memorySession()
    const before = await session.storage.listIndexByType('goal')

    expect(
      await moveGoalsToCategory(
        session,
        'kosong',
        GENERAL_GOAL_CATEGORY_KEY,
        session.clock.nowMs(),
      ),
    ).toEqual([])
    expect(await session.storage.listIndexByType('goal')).toEqual(before)
  })

  it('goal hasil persist masih memakai kategori yang dipilih (tidak dipaksa general)', async () => {
    const session = memorySession()
    const custom = session.newId()

    await persistGoal(session, {
      id: GOAL_ID,
      title: 'Lari 10K',
      why: '',
      category: custom,
      status: 'aktif',
      start: '2026-01-05',
      end: '2026-03-31',
      cover: null,
      along: [],
      chapters: [],
    })

    const [goal] = (await loadGoalRecords(session)).goals
    expect(goal?.category).toBe(custom)
  })
})
