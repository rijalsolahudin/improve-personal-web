import { z } from 'zod'

import { goalCategorySchema, goalStatusSchema, linkableItemTypeSchema } from '../enums.ts'
import { epochMsSchema, localDateSchema, uuidV7Schema } from './primitives.ts'

/**
 * F13 Goals: `goal` -> `goal_chapter` -> `goal_link`.
 *
 * Aturan integritas yang ditegakkan di sini (bukan constraint DB, karena bentuknya payload di dalam
 * blob):
 * - Satu item hanya boleh punya SATU tautan goal (`uq_goal_link_item` = unique item_type + item_id).
 * - Hapus chapter -> item pindah ke Sepanjang Goal (default) atau dilepas.
 * - Hapus main goal -> chapter ikut terhapus, tapi ITEM TETAP ADA (tautan dilepas).
 * - Geser periode main goal yang membuat chapter keluar rentang -> DITOLAK dengan pesan jelas.
 */

/**
 * `goal_link.chapter_id = null` = item menempel LANGSUNG ke main goal.
 *
 * Itu yang DBML sebut "Sepanjang Goal": chapter bayangan TANPA periode sendiri. Sengaja TIDAK ada
 * baris `goal_chapter` untuknya, jadi tidak ada dua representasi untuk hal yang sama.
 */
export const SEPANJANG_GOAL_CHAPTER_ID: null = null

export const goalSchema = z
  .object({
    id: uuidV7Schema,
    title: z.string().trim().min(1).max(300),
    /** "Kenapa penting?" */
    reason: z.string().max(4_000).nullable(),
    category: goalCategorySchema,
    /** Sticker sampul / emoji; ID tak dikenal -> placeholder, bukan error. */
    coverSticker: z.string().min(1).max(120).nullable(),
    /** Tanggal lokal YYYY-MM-DD. */
    startDate: localDateSchema,
    targetDate: localDateSchema,
    status: goalStatusSchema,
    createdAt: epochMsSchema,
    updatedAt: epochMsSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.targetDate < value.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetDate'],
        message: 'tanggal target tidak boleh sebelum tanggal mulai',
      })
    }
  })

export type Goal = z.infer<typeof goalSchema>

export const goalChapterSchema = z
  .object({
    id: uuidV7Schema,
    goalId: uuidV7Schema,
    title: z.string().trim().min(1).max(300),
    /** Wajib di dalam rentang main goal. */
    startDate: localDateSchema,
    endDate: localDateSchema,
    /** Urutan bisa di-drag untuk reorder. */
    sortOrder: z.int().min(0).max(10_000),
    /** Tandai selesai manual -> progress 100% (termasuk chapter tanpa item). */
    isCompleted: z.boolean(),
    createdAt: epochMsSchema,
    updatedAt: epochMsSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.endDate < value.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'tanggal selesai chapter tidak boleh sebelum tanggal mulai',
      })
    }
  })

export type GoalChapter = z.infer<typeof goalChapterSchema>

/**
 * `goal_link` - soft ref ke todo/habit/schedule.
 *
 * `chapterId = null` berarti Sepanjang Goal. `itemId` boleh menunjuk record yang sudah dihapus;
 * resolusi tautan yatim ditangani `resolveGoalLinks`.
 */
export const goalLinkSchema = z
  .object({
    id: uuidV7Schema,
    goalId: uuidV7Schema,
    chapterId: uuidV7Schema.nullable(),
    itemType: linkableItemTypeSchema,
    itemId: uuidV7Schema,
    createdAt: epochMsSchema,
  })
  .strict()

export type GoalLink = z.infer<typeof goalLinkSchema>

/**
 * Kunci identitas tautan: satu item hanya boleh di satu tempat (AC T17).
 *
 * Dipisah sebagai fungsi supaya web dan mobile memakai kunci yang sama saat mengecek duplikat, dan
 * tidak ada dua definisi "item yang sama".
 */
export function goalLinkKey(link: Pick<GoalLink, 'itemType' | 'itemId'>): string {
  return `${link.itemType}:${link.itemId}`
}

/**
 * Aturan murni: apakah item ini masih boleh ditautkan.
 *
 * `null` berarti belum ditautkan; kalau sudah ditautkan ke tautan yang SAMA, hasilnya tautan itu juga
 * (idempoten, bukan error) - supaya "simpan ulang" dari form tidak gagal.
 */
export function existingLinkFor(
  links: readonly GoalLink[],
  item: Pick<GoalLink, 'itemType' | 'itemId'>,
): GoalLink | null {
  const key = goalLinkKey(item)
  for (const link of links) {
    if (goalLinkKey(link) === key) return link
  }
  return null
}

/** Hasil validasi rentang chapter terhadap main goal. */
export type ChapterRangeCheck =
  { readonly ok: true } | { readonly ok: false; readonly message: string }

/**
 * Aturan murni: chapter wajib berada di dalam rentang main goal.
 *
 * Pesannya sengaja menyebut kedua tanggalnya (`"Chapter X enddate (15 Mar) > main goal enddate
 * (10 Mar)"` di PRD F13) - kalimat itulah yang bikin user tahu apa yang harus dibetulkan.
 */
export function checkChapterWithinGoal(
  chapter: Pick<GoalChapter, 'title' | 'startDate' | 'endDate'>,
  goal: Pick<Goal, 'startDate' | 'targetDate'>,
): ChapterRangeCheck {
  if (chapter.startDate < goal.startDate) {
    return {
      ok: false,
      message: `Chapter "${chapter.title}" mulai (${chapter.startDate}) sebelum main goal mulai (${goal.startDate})`,
    }
  }
  if (chapter.endDate > goal.targetDate) {
    return {
      ok: false,
      message: `Chapter "${chapter.title}" selesai (${chapter.endDate}) melewati main goal selesai (${goal.targetDate})`,
    }
  }
  return { ok: true }
}

/** Aturan murni: apakah geser periode main goal membuat chapter mana pun keluar rentang. */
export function chaptersOutsideGoal(
  chapters: readonly GoalChapter[],
  next: Pick<Goal, 'startDate' | 'targetDate'>,
): readonly GoalChapter[] {
  return chapters.filter(
    (chapter) => chapter.startDate < next.startDate || chapter.endDate > next.targetDate,
  )
}

/**
 * Aturan murni Edge Case F13 "Hapus Chapter": item pindah ke Sepanjang Goal (default) atau dilepas.
 *
 * `mode: 'move_to_sepanjang'` mengembalikan tautan yang sama dengan `chapterId = null` - record
 * tautannya TIDAK dibuat ulang, cuma chapter-nya yang dilepas, supaya `updatedAt`/`hlc` tidak berubah
 * tanpa alasan dan tidak memicu tulisan sync yang tidak perlu.
 */
export function reassignChapterLinks(
  links: readonly GoalLink[],
  chapterId: string,
  mode: 'move_to_sepanjang' | 'detach',
): {
  readonly kept: readonly GoalLink[]
  readonly reassigned: readonly GoalLink[]
  readonly detached: readonly GoalLink[]
} {
  const kept: GoalLink[] = []
  const reassigned: GoalLink[] = []
  const detached: GoalLink[] = []

  for (const link of links) {
    if (link.chapterId !== chapterId) {
      kept.push(link)
      continue
    }
    if (mode === 'move_to_sepanjang') reassigned.push({ ...link, chapterId: null })
    else detached.push(link)
  }

  return { kept, reassigned, detached }
}

/**
 * Aturan murni Edge Case "Hapus Main Goal": chapter & tautan ikut terhapus, item tetap ada.
 *
 * Yang dikembalikan adalah id record yang harus di-tombstone, bukan "hapus data user" - item
 * (todo/habit/schedule) sengaja tidak ada di daftar itu.
 */
export function idsToDeleteWithGoal(
  goal: Pick<Goal, 'id'>,
  chapters: readonly GoalChapter[],
  links: readonly GoalLink[],
): readonly string[] {
  const ids = new Set<string>([goal.id])
  for (const chapter of chapters) {
    if (chapter.goalId === goal.id) ids.add(chapter.id)
  }
  for (const link of links) {
    if (link.goalId === goal.id) ids.add(link.id)
  }
  return [...ids]
}

/**
 * Status chapter dihitung dari tanggal + progress (PRD F13 "Status Chapter"), tidak disimpan.
 *
 * Dihitung dari `todayLocalDate` yang di-inject supaya tetap murni dan deterministik.
 */
export const CHAPTER_STATUSES = ['belum_mulai', 'berjalan', 'selesai', 'terlewat'] as const

export type ChapterStatus = (typeof CHAPTER_STATUSES)[number]

export function chapterStatus(
  chapter: Pick<GoalChapter, 'startDate' | 'endDate' | 'isCompleted'>,
  todayLocalDate: string,
  progressPercent: number,
): ChapterStatus {
  if (chapter.isCompleted) return 'selesai'
  if (todayLocalDate < chapter.startDate) return 'belum_mulai'
  if (todayLocalDate <= chapter.endDate) return 'berjalan'
  return progressPercent >= 100 ? 'selesai' : 'terlewat'
}

/** Satu potongan progress (task/habit/jadwal) di dalam satu chapter atau Sepanjang Goal. */
export type ProgressSlice = {
  readonly itemType: GoalLink['itemType']
  /** `null` kalau tidak ada item untuk dihitung - diperlakukan sebagai 100% (bukan 0%). */
  readonly percent: number | null
}

/**
 * Aturan murni progress F13:
 *
 * - Chapter selesai manual -> 100% (termasuk chapter tanpa item).
 * - Rata-rata biasa dari item di dalamnya.
 * - Chapter tanpa item sama sekali = 100%: tidak ada yang tertunda, jadi tidak masuk akal
 *   menahannya di 0% selamanya. Ini juga yang bikin main goal dengan chapter kosong tidak anjlok.
 */
export function chapterProgressPercent(
  chapter: Pick<GoalChapter, 'isCompleted'>,
  slices: readonly ProgressSlice[],
): number {
  if (chapter.isCompleted) return 100
  if (slices.length === 0) return 100

  let total = 0
  for (const slice of slices) total += slice.percent ?? 100
  return clampPercent(total / slices.length)
}

/**
 * Aturan murni progress main goal:
 *
 * - TANPA chapter: langsung rata-rata item yang menempel ke main goal (Sepanjang Goal).
 * - ADA chapter: rata-rata SEMUA chapter + Sepanjang Goal (kalau ada isinya), bobot SAMA.
 */
export function mainGoalProgressPercent(
  chapterPercents: readonly number[],
  sepanjangGoalPercent: number | null,
): number {
  const parts = [...chapterPercents]
  if (sepanjangGoalPercent !== null) parts.push(sepanjangGoalPercent)
  if (parts.length === 0) return 0

  let total = 0
  for (const part of parts) total += part
  return clampPercent(total / parts.length)
}

/** Clamp + bulatkan 1 desimal supaya angka progress sama di web & mobile (tidak ada artifact float). */
export function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0
  const clamped = Math.min(100, Math.max(0, value))
  return Math.round(clamped * 10) / 10
}
