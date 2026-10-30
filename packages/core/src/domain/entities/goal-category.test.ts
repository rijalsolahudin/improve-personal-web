import { describe, expect, it } from 'vitest'

import {
  GOAL_CATEGORY_COLORS,
  GENERAL_GOAL_CATEGORY_KEY,
  LEGACY_GOAL_CATEGORY_KEYS,
} from '../enums.ts'
import {
  DEFAULT_GOAL_CATEGORIES,
  GENERAL_GOAL_CATEGORY,
  GOAL_CATEGORY_LABEL_MAX,
  GOAL_CATEGORY_MAX,
  GOAL_CATEGORY_PALETTE,
  addGoalCategory,
  canDeleteGoalCategory,
  goalsInCategory,
  goalCategorySchema,
  latestGoalCategories,
  nextGoalCategoryColor,
  nextGoalCategorySortOrder,
  normalizeGoalCategoryKey,
  resolveGoalCategory,
  validateGoalCategoryLabel,
  type GoalCategory,
  type GoalCategorySeed,
} from './goal-category.ts'
import { goalSchema } from './goal.ts'

/**
 * F13 kategori goal yang bisa dikelola user.
 *
 * Yang dijaga test ini adalah aturan yang menyentuh DATA user:
 * - kategori bawaan (`general` + lima kategori lama) tetap sah dan `general` tidak bisa dihapus;
 * - nilai kategori rusak tidak menggagalkan pembacaan goal (dipetakan ke `general`);
 * - katalog tidak pernah menampilkan dua baris untuk satu `key`.
 */

const CATEGORY_ID = '0192f0a0-0000-7000-8000-00000000ca11'
const OTHER_CATEGORY_ID = '0192f0a0-0000-7000-8000-00000000ca12'

function seeded(): GoalCategory[] {
  return DEFAULT_GOAL_CATEGORIES.map((category) => ({ ...category, updatedAt: 1 }))
}

function category(patch: Partial<GoalCategory> = {}): GoalCategory {
  return {
    id: CATEGORY_ID,
    key: 'olahraga',
    label: 'Olahraga',
    color: 'green',
    sortOrder: 10,
    updatedAt: 1_700_000_000_000,
    ...patch,
  }
}

function goalInput(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '0192f0a0-0000-7000-8000-000000000001',
    title: 'Lari 10K',
    reason: null,
    category: 'kesehatan',
    coverSticker: null,
    startDate: '2026-01-01',
    targetDate: '2026-03-31',
    status: 'aktif',
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  }
}

describe('kategori bawaan', () => {
  it('general ada di urutan pertama dan lima kategori lama tetap ada', () => {
    expect(DEFAULT_GOAL_CATEGORIES[0]?.key).toBe(GENERAL_GOAL_CATEGORY_KEY)

    const keys = DEFAULT_GOAL_CATEGORIES.map((entry) => entry.key)
    for (const legacy of LEGACY_GOAL_CATEGORY_KEYS) expect(keys).toContain(legacy)
  })

  it('setiap kategori bawaan lolos schema dan memakai warna palet yang dikenal', () => {
    for (const entry of DEFAULT_GOAL_CATEGORIES) {
      expect(goalCategorySchema.safeParse({ ...entry, updatedAt: 1 }).success).toBe(true)
      expect(GOAL_CATEGORY_COLORS).toContain(entry.color)
      expect(GOAL_CATEGORY_PALETTE[entry.color].accent).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it('general tidak bisa dihapus, kategori lain bisa', () => {
    expect(canDeleteGoalCategory(GENERAL_GOAL_CATEGORY)).toBe(false)
    expect(canDeleteGoalCategory({ key: 'karier' })).toBe(true)
    expect(canDeleteGoalCategory({ key: 'user-category' })).toBe(true)
  })
})

describe('normalizeGoalCategoryKey', () => {
  it('nilai lama dan kunci hasil app baru dibiarkan apa adanya', () => {
    for (const legacy of LEGACY_GOAL_CATEGORY_KEYS) {
      expect(normalizeGoalCategoryKey(legacy)).toBe(legacy)
    }
    expect(normalizeGoalCategoryKey(CATEGORY_ID)).toBe(CATEGORY_ID)
    // Spaces & huruf besar dirapikan, bukan dibuang.
    expect(normalizeGoalCategoryKey('  Olahraga ')).toBe('olahraga')
  })

  it('nilai rusak dipetakan ke general, bukan error', () => {
    expect(normalizeGoalCategoryKey(null)).toBe(GENERAL_GOAL_CATEGORY_KEY)
    expect(normalizeGoalCategoryKey(42)).toBe(GENERAL_GOAL_CATEGORY_KEY)
    expect(normalizeGoalCategoryKey('')).toBe(GENERAL_GOAL_CATEGORY_KEY)
    expect(normalizeGoalCategoryKey('olahr_aga')).toBe(GENERAL_GOAL_CATEGORY_KEY)
    expect(normalizeGoalCategoryKey('x'.repeat(65))).toBe(GENERAL_GOAL_CATEGORY_KEY)
  })
})

describe('resolveGoalCategory', () => {
  it('mengembalikan kategori yang ada di katalog', () => {
    expect(resolveGoalCategory(seeded(), 'karier').label).toBe('Karier')
  })

  it('kategori yang sudah dihapus / belum tersinkron tampil sebagai general', () => {
    expect(resolveGoalCategory(seeded(), 'olahraga').key).toBe(GENERAL_GOAL_CATEGORY_KEY)
    expect(resolveGoalCategory([], 'karier').key).toBe(GENERAL_GOAL_CATEGORY_KEY)
  })
})

describe('validasi label kategori', () => {
  const catalog: GoalCategorySeed[] = [...DEFAULT_GOAL_CATEGORIES]

  it('label kosong dan kepanjangan ditolak', () => {
    expect(validateGoalCategoryLabel(catalog, '   ')).toEqual({ ok: false, reason: 'required' })
    expect(validateGoalCategoryLabel(catalog, 'x'.repeat(GOAL_CATEGORY_LABEL_MAX + 1))).toEqual({
      ok: false,
      reason: 'too_long',
    })
  })

  it('label duplikat ditolak tanpa peduli huruf besar/kecil & spasi tepi', () => {
    expect(validateGoalCategoryLabel(catalog, '  KARIER ')).toEqual({
      ok: false,
      reason: 'duplicate',
    })
  })

  it('label sama pada kategori yang sedang diubah (rename ke dirinya sendiri) tetap boleh', () => {
    expect(validateGoalCategoryLabel(catalog, 'Karier', { exceptKey: 'karier' })).toEqual({
      ok: true,
      label: 'Karier',
    })
  })
})

describe('addGoalCategory', () => {
  it('menyusun kategori baru dengan warna yang belum dipakai dan urutan paling akhir', () => {
    const catalog = seeded()
    const result = addGoalCategory(catalog, {
      id: CATEGORY_ID,
      key: 'olahraga',
      label: ' Olahraga ',
      updatedAt: 5,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.category.label).toBe('Olahraga')
    expect(result.category.color).toBe('yellow')
    expect(result.category.sortOrder).toBe(nextGoalCategorySortOrder(catalog))
  })

  it('menolak label duplikat, key duplikat, dan katalog yang sudah penuh', () => {
    expect(
      addGoalCategory(seeded(), {
        id: CATEGORY_ID,
        key: 'olahraga',
        label: 'karier',
        updatedAt: 5,
      }),
    ).toEqual({ ok: false, reason: 'duplicate' })

    expect(
      addGoalCategory(seeded(), {
        id: CATEGORY_ID,
        key: 'karier',
        label: 'Olahraga',
        updatedAt: 5,
      }),
    ).toEqual({ ok: false, reason: 'duplicate_key' })

    const full: GoalCategory[] = Array.from({ length: GOAL_CATEGORY_MAX }, (_, index) =>
      category({ key: `cat-${index}`, label: `Kategori ${index}`, sortOrder: index }),
    )
    expect(
      addGoalCategory(full, {
        id: CATEGORY_ID,
        key: 'baru',
        label: 'Baru',
        updatedAt: 5,
      }),
    ).toEqual({ ok: false, reason: 'too_many' })
  })

  it('warna otomatis bergilir kalau semua warna palet sudah terpakai', () => {
    const full = GOAL_CATEGORY_COLORS.map((color, index) =>
      category({ key: `cat-${index}`, label: `Kategori ${index}`, color }),
    )

    expect(GOAL_CATEGORY_COLORS).toContain(nextGoalCategoryColor(full))
  })
})

describe('katalog hasil baca', () => {
  it('satu key hanya muncul sekali; record dengan updatedAt terbaru yang dipakai', () => {
    const older = category({ id: CATEGORY_ID, label: 'Olahraga', updatedAt: 10 })
    const newer = category({ id: OTHER_CATEGORY_ID, label: 'Olah Raga', updatedAt: 20 })

    const merged = latestGoalCategories([older, newer, ...seeded()])
    const olahraga = merged.filter((entry) => entry.key === 'olahraga')

    expect(olahraga).toHaveLength(1)
    expect(olahraga[0]?.label).toBe('Olah Raga')
  })

  it('goalsInCategory memilih goal yang memakai kategori itu saja', () => {
    const goals = [
      { id: 'a', category: 'olahraga' },
      { id: 'b', category: 'karier' },
      { id: 'c', category: 'olahraga' },
    ]

    expect(goalsInCategory(goals, 'olahraga').map((goal) => goal.id)).toEqual(['a', 'c'])
  })
})

describe('kompatibilitas goal lama (skema v1)', () => {
  it('category lama pada record v1 tetap lolos schema tanpa migrasi', () => {
    for (const legacy of LEGACY_GOAL_CATEGORY_KEYS) {
      expect(goalSchema.parse(goalInput({ category: legacy })).category).toBe(legacy)
    }
  })

  it('kunci kategori buatan user dan kategori rusak ditangani berbeda', () => {
    // Jalur tulis: kunci harus berbentuk sah.
    expect(goalSchema.parse(goalInput({ category: CATEGORY_ID })).category).toBe(CATEGORY_ID)
    expect(goalSchema.safeParse(goalInput({ category: 'olahraga' })).success).toBe(true)

    // Jalur baca: yang benar-benar rusak dinormalkan ke general oleh pemanggil (`normalizeGoalCategoryKey`).
    expect(normalizeGoalCategoryKey('bukan kategori!')).toBe(GENERAL_GOAL_CATEGORY_KEY)
  })
})
