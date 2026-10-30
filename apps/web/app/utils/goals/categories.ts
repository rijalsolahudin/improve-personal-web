import {
  DEFAULT_GOAL_CATEGORIES,
  GENERAL_GOAL_CATEGORY_KEY,
  GOAL_CATEGORY_PALETTE,
  goalCategorySchema,
  latestGoalCategories,
  sortGoalCategories,
  type GoalCategory,
  type GoalCategoryColor,
} from '@improve-personal/core'

import { createRepository } from '../storage/repository'
import type { LocalDataSession } from '../storage/session'

/**
 * Persistensi kategori goal (`goal_category`) - dipakai `useGoalCategories`.
 *
 * Kategori disimpan sebagai record tersendiri (bukan `localStorage`, bukan field di `user_prefs`)
 * supaya ikut sync per record: hapus kategori = tombstone, ganti nama = update record itu saja, dan
 * konflik dua perangkat tidak menimpa seluruh daftar. Alasan lengkapnya ada di core
 * (`domain/entities/goal-category.ts`).
 *
 * Modul ini sengaja tidak mengimpor composable apa pun (pola `utils/goals/links.ts`) supaya bisa
 * dipakai lapisan persistensi tanpa siklus.
 */

/** Bentuk kategori yang dipakai UI: data record + hex palet, jadi komponen tidak perlu tahu token. */
export type GoalCategoryView = {
  readonly key: string
  readonly label: string
  readonly color: GoalCategoryColor
  readonly sortOrder: number
  readonly accent: string
  readonly tint: string
  readonly text: string
}

export function toGoalCategoryView(category: {
  readonly key: string
  readonly label: string
  readonly color: GoalCategoryColor
  readonly sortOrder: number
}): GoalCategoryView {
  const palette = GOAL_CATEGORY_PALETTE[category.color]
  return {
    key: category.key,
    label: category.label,
    color: category.color,
    sortOrder: category.sortOrder,
    accent: palette.accent,
    tint: palette.tint,
    text: palette.text,
  }
}

/**
 * Repository `goal_category`.
 *
 * `goal_category` tidak ada di `RepositorySet` (sama seperti `goal_chapter`/`goal_link`), jadi
 * repository dibuat di sini. Index tetap ditulis walau rentangnya `null` - tanpa baris index, record
 * tidak akan pernah ditemukan `listAll` (dan hilang dari export).
 */
function categoryRepository(session: LocalDataSession) {
  return createRepository<GoalCategory>(session, 'goal_category')
}

export type LoadedGoalCategories = {
  /** Kategori hidup, sudah dirapikan: satu baris per `key`, urut `sortOrder`. */
  readonly categories: GoalCategory[]
  /**
   * Ada record kategori sama sekali (termasuk tombstone)?
   *
   * Dipakai memutuskan seeding: akun yang kategorinya sudah pernah dihapus tidak boleh mendapat
   * kategori bawaan lagi, jadi tombstone ikut dihitung.
   */
  readonly hasAnyRecord: boolean
}

/** Baca seluruh kategori akun (termasuk tombstone, untuk keputusan seeding). */
export async function loadGoalCategories(session: LocalDataSession): Promise<LoadedGoalCategories> {
  const records = await categoryRepository(session).listAll()
  const active = records
    .filter((record) => !record.deleted)
    .map((record) => goalCategorySchema.parse(record.data))

  return { categories: latestGoalCategories(active), hasAnyRecord: records.length > 0 }
}

/**
 * Tulis kategori bawaan untuk akun yang belum punya record kategori.
 *
 * Id record-nya KONSTAN (`DEFAULT_GOAL_CATEGORIES`), jadi perangkat lain yang melakukan seeding
 * sebelum sync pertama menulis id yang sama - hasilnya satu kategori, bukan duplikat.
 */
export async function seedDefaultGoalCategories(
  session: LocalDataSession,
  nowMs: number,
): Promise<GoalCategory[]> {
  const seeded: GoalCategory[] = []
  for (const entry of DEFAULT_GOAL_CATEGORIES) {
    const category = goalCategorySchema.parse({ ...entry, updatedAt: nowMs })
    await writeCategory(session, category)
    seeded.push(category)
  }
  return sortGoalCategories(seeded)
}

/** Tulis satu kategori (baru atau hasil ubah). Payload divalidasi sebelum menyentuh storage. */
export async function writeCategory(
  session: LocalDataSession,
  category: GoalCategory,
): Promise<void> {
  const valid = goalCategorySchema.safeParse(category)
  if (!valid.success) throw new Error('kategori goal tidak valid')

  await session.writer.write({
    id: valid.data.id,
    type: 'goal_category',
    data: () => valid.data,
    index: null,
  })
}

/** Hapus kategori = tombstone; goal yang memakainya dipindah lebih dulu (lihat `moveGoalsToCategory`). */
export async function deleteCategory(session: LocalDataSession, categoryId: string): Promise<void> {
  await session.writer.remove({ id: categoryId, index: null })
}

/**
 * Pastikan `goal.category` yang akan DITULIS memang ada di katalog.
 *
 * Tanpa ini, kategori yang sudah dihapus bisa "hidup lagi" sebagai referensi yatim: state UI masih
 * memegang kunci lama (mis. form goal yang dibuka sebelum kategori dihapus di perangkat lain), lalu
 * simpan berikutnya menulis kunci itu kembali. Kategori tak dikenal dipetakan ke `general` - aturan
 * yang sama dengan jalur baca.
 *
 * Akun yang belum punya record kategori sama sekali tidak diubah: goal lama dengan kunci enum tetap
 * apa adanya (katalog baru dibuat saat halaman Goals dibuka).
 */
export async function normalizeStoredGoalCategoryKey(
  session: LocalDataSession,
  key: string,
): Promise<string> {
  const { categories, hasAnyRecord } = await loadGoalCategories(session)
  if (!hasAnyRecord) return key

  return categories.some((category) => category.key === key) ? key : GENERAL_GOAL_CATEGORY_KEY
}
