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
    /**
     * Wajib di dalam rentang main goal.
     *
     * Schema per-record tidak bisa melihat goal induknya, jadi aturan ini ditegakkan
     * `checkGoalBundle` di jalur simpan/import (bukan di sini).
     */
    startDate: localDateSchema,
    endDate: localDateSchema,
    /** Urutan bisa di-drag untuk reorder. */
    sortOrder: z.int().min(0).max(10_000),
    /** Tandai selesai manual -> progress 100% (termasuk chapter tanpa item). */
    isCompleted: z.boolean(),
    /**
     * Chapter ditutup lewat aksi review F13 ("tutup"): tidak dihitung "terlewat" lagi.
     *
     * `.default(false)` wajib untuk backward-compatibility: chapter yang dibuat sebelum field ini ada
     * (berkas export/import versi lama) tetap lolos validasi, dan absen = belum ditutup.
     */
    isClosed: z.boolean().default(false),
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

/** Hasil pemisahan tautan yang itemnya masih ada vs tautan yatim (item sudah dihapus). */
export type ResolvedGoalLinks = {
  readonly resolved: readonly GoalLink[]
  readonly orphans: readonly GoalLink[]
}

/**
 * Aturan murni: pisahkan tautan yang itemnya masih ada dari tautan yatim.
 *
 * `goal_link.itemId` adalah soft ref, jadi item boleh sudah dihapus (ARCHITECTURE §6). Tautan yatim
 * TIDAK dihitung progress (item hilang = 0 data, bukan 100%) dan bisa dilepas pemanggil; item-nya
 * sendiri tidak pernah ikut terhapus.
 *
 * `existingItems` cukup daftar referensi item yang benar-benar ada saat ini; fungsi ini tidak
 * menyentuh storage, jadi hasilnya deterministik untuk test.
 */
export function resolveGoalLinks(
  links: readonly GoalLink[],
  existingItems: readonly Pick<GoalLink, 'itemType' | 'itemId'>[],
): ResolvedGoalLinks {
  const existingKeys = new Set(existingItems.map((item) => goalLinkKey(item)))
  const resolved: GoalLink[] = []
  const orphans: GoalLink[] = []

  for (const link of links) {
    if (existingKeys.has(goalLinkKey(link))) resolved.push(link)
    else orphans.push(link)
  }

  return { resolved, orphans }
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

/** Kumpulan record satu goal yang harus diperiksa bersama-sama (bukan per-record). */
export type GoalBundle = {
  readonly goal: Pick<Goal, 'id' | 'startDate' | 'targetDate'>
  readonly chapters: readonly GoalChapter[]
  readonly links: readonly GoalLink[]
}

/** Hasil pemeriksaan lintas-record: lolos, atau daftar alasan yang bisa ditampilkan ke user. */
export type GoalBundleCheck =
  { readonly ok: true } | { readonly ok: false; readonly issues: readonly string[] }

/**
 * Aturan murni GLOBAL: satu item hanya boleh punya satu tautan, lintas goal sekalipun.
 *
 * `checkGoalBundle` memeriksa satu goal; jalur import/load memegang SEMUA record, jadi fungsi ini yang
 * menegakkan `uq_goal_link_item` sebenarnya (item yang sama tidak boleh muncul di dua goal/chapter).
 */
export function checkGoalLinksUnique(links: readonly GoalLink[]): GoalBundleCheck {
  const seen = new Map<string, GoalLink>()
  const issues: string[] = []

  for (const link of links) {
    const key = goalLinkKey(link)
    const previous = seen.get(key)
    if (previous === undefined) {
      seen.set(key, link)
      continue
    }

    const sameGoal = previous.goalId === link.goalId
    issues.push(
      sameGoal
        ? `Item ${key} punya lebih dari satu tautan (${previous.id} dan ${link.id}); satu item cuma boleh di satu tempat`
        : `Item ${key} ditautkan ke dua goal berbeda (${previous.goalId} dan ${link.goalId})`,
    )
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}

/**
 * Aturan murni: invarian yang HANYA bisa dicek kalau goal + chapter + tautan dilihat bersama.
 *
 * Validasi schema per-record tidak bisa melihat goal induknya, dan store lokal berbentuk blob per
 * record (tidak ada unique index fisik), jadi dua invarian PRD F13 ditegakkan di sini:
 *
 * - chapter wajib berada di dalam rentang main goal (`checkChapterWithinGoal`);
 * - satu item hanya boleh punya satu tautan (`uq_goal_link_item`), termasuk tautan ke goal lain;
 * - tautan wajib menunjuk chapter milik goal yang sama (soft ref boleh yatim untuk ITEM, bukan untuk
 *   chapter - chapter yang dihapus sudah dipindah/dilepas lebih dulu).
 *
 * Dipakai jalur import/load: tolak dengan alasan jelas, jangan melempar error. Item yang sudah
 * dihapus BUKAN pelanggaran - itu ditangani `resolveGoalLinks`. Jalur import memanggilnya lewat
 * `io/goal-invariants.ts` (semua record sekaligus) dan memakai `checkGoalLinksUnique` untuk seluruh
 * record tautan, karena satu goal saja tidak cukup untuk menegakkan `uq_goal_link_item`.
 */
export function checkGoalBundle(bundle: GoalBundle): GoalBundleCheck {
  const issues: string[] = []
  const knownChapterIds = new Set<string>()

  for (const chapter of bundle.chapters) {
    if (chapter.goalId !== bundle.goal.id) {
      issues.push(
        `Chapter "${chapter.title}" (${chapter.id}) milik goal lain (${chapter.goalId}), bukan ${bundle.goal.id}`,
      )
      continue
    }

    // Dua baris chapter dengan id sama tidak jelas mana yang berlaku - tolak, jangan pilih diam-diam.
    if (knownChapterIds.has(chapter.id)) {
      issues.push(`Chapter ${chapter.id} muncul lebih dari sekali`)
      continue
    }
    knownChapterIds.add(chapter.id)

    const range = checkChapterWithinGoal(chapter, bundle.goal)
    if (!range.ok) issues.push(range.message)
  }

  for (const link of bundle.links) {
    if (link.goalId !== bundle.goal.id) {
      issues.push(`Tautan ${link.id} menunjuk goal lain (${link.goalId}), bukan ${bundle.goal.id}`)
      continue
    }
    if (link.chapterId !== null && !knownChapterIds.has(link.chapterId)) {
      issues.push(`Tautan ${link.id} menunjuk chapter ${link.chapterId} yang tidak ada di goal ini`)
    }
  }

  const uniqueness = checkGoalLinksUnique(bundle.links)
  if (!uniqueness.ok) issues.push(...uniqueness.issues)

  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}

/** Hasil penautan satu item: tautan baru, tautan lama (idempoten), atau penolakan yang bisa dibaca. */
export type GoalLinkAttachResult =
  | { readonly ok: true; readonly link: GoalLink; readonly created: boolean }
  | {
      readonly ok: false
      readonly reason: 'already_linked'
      readonly existing: GoalLink
      readonly message: string
    }

/**
 * Aturan murni: tautkan item ke goal/chapter dengan menghormati `uq_goal_link_item`.
 *
 * Menyimpan ulang form yang sama TIDAK boleh membuat tautan kedua - hasilnya tautan yang sudah ada
 * (`created: false`). Memindahkan item ke chapter lain adalah UPDATE pada record tautan yang sama
 * (ubah `chapterId`), bukan tautan baru; karena itu percobaan menautkan ulang ke tempat berbeda
 * ditolak dengan pesan yang menyebut chapter lamanya.
 */
export function attachGoalLink(
  links: readonly GoalLink[],
  candidate: GoalLink,
): GoalLinkAttachResult {
  const existing = existingLinkFor(links, candidate)
  if (existing === null) return { ok: true, link: candidate, created: true }

  if (existing.goalId === candidate.goalId && existing.chapterId === candidate.chapterId) {
    return { ok: true, link: existing, created: false }
  }

  const currentPlace =
    existing.chapterId === null ? 'Sepanjang Goal' : `chapter ${existing.chapterId}`
  return {
    ok: false,
    reason: 'already_linked',
    existing,
    message: `Item ${goalLinkKey(candidate)} sudah ditautkan ke ${currentPlace}. Pindahkan dengan mengubah tautan ${existing.id}, bukan membuat tautan baru.`,
  }
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

/** Status chapter yang disimpan/ditampilkan. Nilai sengaja `snake_case` (lihat catatan pemetaan web). */
export const CHAPTER_STATUSES = [
  'belum_mulai',
  'berjalan',
  'selesai',
  'terlewat',
  'ditutup',
] as const

export type ChapterStatus = (typeof CHAPTER_STATUSES)[number]

/**
 * Pemetaan untuk web (`apps/web/app/utils/goals.ts`, halaman Goals #32):
 *
 * | core (sumber tunggal) | web sekarang         | catatan                                   |
 * |-----------------------|----------------------|-------------------------------------------|
 * | `belum_mulai`         | `belum-mulai`        | beda hanya pemisah kata                   |
 * | `berjalan`            | `berjalan`           | sama                                      |
 * | `selesai`             | `selesai`            | sama                                      |
 * | `terlewat`            | `terlewat`           | sama                                      |
 * | `ditutup`             | `ditutup`            | dari `chapter.isClosed` (aksi review F13) |
 *
 * Status goal core juga lebih lengkap: `aktif/selesai/ditunda/dibatalkan`, sedangkan web belum punya
 * `dibatalkan`. Web wajib memakai enum & fungsi di modul ini saat halaman Goals memakai model core;
 * jangan menulis ulang rata-rata/status di app (aturan kontrak bersama).
 *
 * Perbedaan progress yang harus ikut berubah di web: core menghitung rata-rata per TIPE item
 * (task `selesai/total`, habit %, jadwal %) sesuai PRD F13, bukan per item; chapter kosong = 0%
 * (bukan 100%). Implementasi agregasinya ada di `calc/goal.ts`.
 */

/** Input status chapter; `isClosed` opsional supaya pemanggil lama tidak perlu mengisi field baru. */
export type ChapterStatusInput = Pick<GoalChapter, 'startDate' | 'endDate' | 'isCompleted'> & {
  readonly isClosed?: boolean
}

/**
 * Status chapter dihitung dari tanggal + progress (PRD F13 "Status Chapter"), tidak disimpan.
 *
 * Dihitung dari `todayLocalDate` yang di-inject supaya tetap murni dan deterministik. Chapter yang
 * ditutup lewat review menang atas tanggal: user sudah memutuskan berhenti, jadi jangan terus
 * ditandai "terlewat" dan memunculkan kartu review lagi.
 */
export function chapterStatus(
  chapter: ChapterStatusInput,
  todayLocalDate: string,
  progressPercent: number,
): ChapterStatus {
  if (chapter.isClosed === true) return 'ditutup'
  if (chapter.isCompleted) return 'selesai'
  if (todayLocalDate < chapter.startDate) return 'belum_mulai'
  if (todayLocalDate <= chapter.endDate) return 'berjalan'
  return progressPercent >= 100 ? 'selesai' : 'terlewat'
}

/** Satu potongan progress (task/habit/jadwal) di dalam satu chapter atau Sepanjang Goal. */
export type ProgressSlice = {
  readonly itemType: GoalLink['itemType']
  /**
   * `null` = tipe ini tidak punya data terukur (tidak ada item, atau itemnya belum punya hari/kejadian
   * yang bisa dinilai). Slice `null` DIKELUARKAN dari penyebut - bukan dianggap 100%.
   */
  readonly percent: number | null
}

/** Input progress chapter; `isClosed` opsional supaya pemanggil lama tetap kompatibel. */
export type ChapterProgressInput = Pick<GoalChapter, 'isCompleted'> & {
  readonly isClosed?: boolean
}

/**
 * Aturan murni progress F13:
 *
 * - Chapter selesai manual -> 100% (termasuk chapter tanpa item).
 * - Rata-rata dari tipe item yang punya data; slice `null` tidak ikut penyebut.
 * - Chapter tanpa item sama sekali = **0%**, bukan 100%: kosong != selesai. Kalau kosong dianggap
 *   100%, chapter yang lewat tanggal tidak pernah "terlewat", kartu review F13 tidak muncul, dan
 *   progress main goal naik palsu.
 *
 * Chapter `ditutup` tidak otomatis 100% - progress tetap angka terukur; statusnya yang berubah.
 */
export function chapterProgressPercent(
  chapter: ChapterProgressInput,
  slices: readonly ProgressSlice[],
): number {
  if (chapter.isCompleted) return 100

  let total = 0
  let counted = 0
  for (const slice of slices) {
    if (slice.percent === null) continue
    total += clampPercent(slice.percent)
    counted += 1
  }
  if (counted === 0) return 0
  return clampPercent(total / counted)
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
