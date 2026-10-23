import {
  checkGoalBundle,
  checkGoalLinksUnique,
  goalChapterSchema,
  goalLinkSchema,
  goalSchema,
  type Goal,
  type GoalChapter,
  type GoalLink,
} from '../domain/entities/goal.ts'
import { type EntityType } from '../domain/envelope.ts'

/**
 * Bagian record yang dibutuhkan pemeriksaan ini.
 *
 * Sengaja hanya `type`/`deleted`/`data` - bukan `BackupRecord` penuh - supaya fungsi yang sama bisa
 * dipakai jalur import (`BackupRecord`), data mentah sebelum disegel (`BackupRecordInput`), dan
 * pemanggil lain tanpa memaksa membawa `id`/`hlc`/`schemaVersion` yang tidak dipakai.
 */
export type GoalInvariantRecord = {
  readonly type: EntityType
  readonly deleted: boolean
  readonly data: unknown
}

/**
 * Invarian lintas-record F13 di jalur import (PRD T17, AC "periode chapter di luar main goal ditolak"
 * dan "satu item cuma satu tautan").
 *
 * Schema per-record tidak bisa melihat goal induknya, dan store lokal berbentuk blob per record
 * (tidak ada unique index fisik), jadi dua aturan itu hanya bisa ditegakkan dengan melihat SELURUH
 * isi berkas sekaligus - di sini, sebelum satu byte pun ditulis. Dipanggil `validateBackupText`
 * (fase baca) dan `assertImportableDocument` (fase tulis, defense-in-depth).
 *
 * Tiga keputusan yang mudah salah:
 * - **Tombstone tidak diperiksa.** `deleted: true` adalah data yang sudah dihapus; memeriksanya akan
 *   menolak berkas sah hanya karena histori (mis. tautan lama yang sudah dilepas). Yang dibaca ulang
 *   saat import hanya record hidup.
 * - **Hanya bundle LENGKAP yang diperiksa.** Chapter/tautan yang goal induknya tidak ada di berkas
 *   tidak bisa dicek rentangnya; menolaknya akan menggagalkan import parsial tanpa alasan yang bisa
 *   dibetulkan user. Keunikan item tetap diperiksa untuk SEMUA tautan hidup (invarian global).
 * - **Chapter yang sudah dihapus bukan "chapter tidak ada".** Kalau penyimpanan terputus setelah
 *   chapter di-tombstone tetapi sebelum tautannya dipindah, berkas hasil export aplikasi sendiri
 *   masih memuat tautan hidup ke chapter itu. Menolaknya berarti backup sendiri tidak bisa
 *   dipulihkan; tautan seperti itu dibiarkan apa adanya (tidak dihitung progress karena chapter-nya
 *   sudah tidak ada).
 */
export function collectGoalInvariantIssues(records: readonly GoalInvariantRecord[]): string[] {
  const goals = new Map<string, Goal>()
  const chaptersByGoal = new Map<string, GoalChapter[]>()
  const linksByGoal = new Map<string, GoalLink[]>()
  const deletedChapterIdsByGoal = new Map<string, Set<string>>()
  const liveLinks: GoalLink[] = []

  for (const record of records) {
    if (record.deleted) {
      if (record.type === 'goal_chapter') {
        const parsed = goalChapterSchema.safeParse(record.data)
        if (parsed.success) {
          addToSet(deletedChapterIdsByGoal, parsed.data.goalId, parsed.data.id)
        }
      }
      continue
    }

    switch (record.type) {
      case 'goal': {
        const parsed = goalSchema.safeParse(record.data)
        // Payload rusak sudah dilaporkan `validateEntityPayload`; dilewati di sini supaya satu
        // masalah tidak muncul dua kali dengan pesan yang berbeda.
        if (parsed.success) goals.set(parsed.data.id, parsed.data)
        break
      }
      case 'goal_chapter': {
        const parsed = goalChapterSchema.safeParse(record.data)
        if (parsed.success) pushTo(chaptersByGoal, parsed.data.goalId, parsed.data)
        break
      }
      case 'goal_link': {
        const parsed = goalLinkSchema.safeParse(record.data)
        if (!parsed.success) break
        pushTo(linksByGoal, parsed.data.goalId, parsed.data)
        liveLinks.push(parsed.data)
        break
      }
      default:
        break
    }
  }

  const issues: string[] = []

  for (const goal of goals.values()) {
    const deletedChapterIds = deletedChapterIdsByGoal.get(goal.id)
    const links = (linksByGoal.get(goal.id) ?? []).filter(
      (link) => link.chapterId === null || deletedChapterIds?.has(link.chapterId) !== true,
    )

    const bundle = checkGoalBundle({
      goal,
      chapters: chaptersByGoal.get(goal.id) ?? [],
      links,
    })
    if (!bundle.ok) issues.push(...bundle.issues)
  }

  // `checkGoalBundle` hanya melihat satu goal; item yang sama ditautkan ke dua goal berbeda baru
  // ketahuan dari daftar seluruh tautan - ini `uq_goal_link_item` yang sebenarnya.
  const uniqueness = checkGoalLinksUnique(liveLinks)
  if (!uniqueness.ok) issues.push(...uniqueness.issues)

  // Tautan ganda di goal yang sama dilaporkan dua kali (bundle + pemeriksaan global) dengan pesan
  // yang sama persis; user cukup melihatnya sekali.
  return [...new Set(issues)]
}

function pushTo<T>(map: Map<string, T[]>, key: string, value: T): void {
  const bucket = map.get(key)
  if (bucket === undefined) map.set(key, [value])
  else bucket.push(value)
}

function addToSet(map: Map<string, Set<string>>, key: string, value: string): void {
  const bucket = map.get(key)
  if (bucket === undefined) map.set(key, new Set([value]))
  else bucket.add(value)
}
