import {
  attachGoalLink,
  checkGoalLinksUnique,
  existingLinkFor,
  goalLinkKey,
  goalLinkSchema,
  type GoalLink,
  type LinkableItemType,
} from '@improve-personal/core'

import { createRepository } from '../storage/repository'
import type { LocalDataSession } from '../storage/session'

/**
 * Tautan item → goal (PRD F13 "Untuk goal").
 *
 * `goal_link` adalah record sendiri, bukan kolom di task/habit/jadwal: satu item hanya boleh punya
 * satu tautan (`uq_goal_link_item`), dan aturan itu ditegakkan core (`attachGoalLink`,
 * `checkGoalLinksUnique`). Modul ini sengaja tidak mengimpor composable apa pun supaya bisa dipakai
 * lapisan persistensi task/habit/jadwal tanpa siklus.
 */

export type GoalPlace = {
  readonly goalId: string | null
  readonly goalChapterId: string | null
}

export const NO_GOAL_PLACE: GoalPlace = { goalId: null, goalChapterId: null }

export type ItemGoalLinkInput = {
  readonly itemType: LinkableItemType
  readonly itemId: string
  readonly goalId: string | null
  readonly goalChapterId: string | null
}

function linksOf(session: LocalDataSession) {
  // `goal_link` tidak ada di `RepositorySet`, jadi repository dibuat di sini (pola yang sama dengan
  // `habit_checkin`). Index `null` tetap ditulis supaya `listAll` menemukan record-nya.
  return createRepository<GoalLink>(session, 'goal_link')
}

export async function loadGoalLinks(session: LocalDataSession): Promise<GoalLink[]> {
  const records = await linksOf(session).listAll({ includeDeleted: false })
  return records.map((record) => goalLinkSchema.parse(record.data))
}

export function placeOf(link: GoalLink | undefined): GoalPlace {
  return link === undefined ? NO_GOAL_PLACE : { goalId: link.goalId, goalChapterId: link.chapterId }
}

/** Chapter hanya sah kalau masih ada dan memang milik goal yang dipilih. */
async function existingChapterId(
  session: LocalDataSession,
  goalId: string,
  chapterId: string,
): Promise<string | null> {
  const record = await createRepository<{ id: string; goalId: string }>(
    session,
    'goal_chapter',
  ).getById(chapterId)
  return record !== null && record.data.goalId === goalId ? chapterId : null
}

export type ItemGoalLinkResult =
  | { readonly ok: true; readonly link: GoalLink | null }
  | { readonly ok: false; readonly message: string }

/**
 * Sinkronkan tautan goal milik satu item.
 *
 * - `goalId = null` → tautan lama dilepas.
 * - Sudah tertaut di tempat yang sama → tidak menulis apa pun (idempoten saat simpan ulang).
 * - Pindah goal/chapter → record tautan yang SAMA diperbarui (tidak membuat tautan kedua).
 */
export async function syncItemGoalLink(
  session: LocalDataSession,
  input: ItemGoalLinkInput,
): Promise<ItemGoalLinkResult> {
  const repository = linksOf(session)
  const records = await repository.listAll({ includeDeleted: false })
  const links = records.map((record) => goalLinkSchema.parse(record.data))
  const existing = existingLinkFor(links, input)

  // Goal/chapter yang sudah dihapus tidak boleh dihidupkan lagi dari state form yang basi.
  const goalId =
    input.goalId !== null && (await session.repos.goal.getById(input.goalId)) !== null
      ? input.goalId
      : null
  const chapterId =
    goalId !== null && input.goalChapterId !== null
      ? await existingChapterId(session, goalId, input.goalChapterId)
      : null

  if (goalId === null) {
    if (existing !== null) await session.writer.remove({ id: existing.id, index: null })
    return { ok: true, link: null }
  }

  const nowMs = session.clock.nowMs()
  const candidate = goalLinkSchema.parse({
    id: existing?.id ?? session.newId(),
    goalId,
    chapterId,
    itemType: input.itemType,
    itemId: input.itemId,
    createdAt: existing?.createdAt ?? nowMs,
  })

  const others = links.filter((link) => goalLinkKey(link) !== goalLinkKey(candidate))
  const unique = checkGoalLinksUnique([...others, candidate])
  if (!unique.ok) return { ok: false, message: unique.issues.join('; ') }

  const attachment = attachGoalLink(others, candidate)
  if (!attachment.ok) {
    // Item sudah tertaut ke tempat lain: PINDAHKAN record yang ada, bukan membuat tautan kedua.
    const moved: GoalLink = {
      ...attachment.existing,
      goalId: candidate.goalId,
      chapterId: candidate.chapterId,
    }
    await session.writer.write({
      id: moved.id,
      type: 'goal_link',
      data: () => moved,
      index: null,
    })
    return { ok: true, link: moved }
  }

  if (!attachment.created) return { ok: true, link: attachment.link }

  await session.writer.write({
    id: candidate.id,
    type: 'goal_link',
    data: () => candidate,
    index: null,
  })
  return { ok: true, link: candidate }
}

/** Lepas semua tautan milik satu item (dipakai saat item dihapus). */
export async function removeItemGoalLinks(
  session: LocalDataSession,
  itemType: LinkableItemType,
  itemId: string,
): Promise<void> {
  const repository = linksOf(session)
  const records = await repository.listAll({ includeDeleted: false })
  for (const record of records) {
    const link = goalLinkSchema.parse(record.data)
    if (link.itemType !== itemType || link.itemId !== itemId) continue
    await session.writer.remove({ id: link.id, index: null })
  }
}

/** Lepas semua tautan milik satu goal (dipakai saat goal dihapus; item tetap ada). */
export async function removeGoalLinks(session: LocalDataSession, goalId: string): Promise<void> {
  const repository = linksOf(session)
  const records = await repository.listAll({ includeDeleted: false })
  for (const record of records) {
    const link = goalLinkSchema.parse(record.data)
    if (link.goalId !== goalId) continue
    await session.writer.remove({ id: link.id, index: null })
  }
}

export type PickerOption = {
  /** `null` = Sepanjang goal. */
  readonly chapterId: string | null
  readonly goalId: string
  readonly label: string
}

/**
 * Pilihan "Untuk goal" untuk form item: Sepanjang goal + chapter, hanya goal aktif (PRD F13).
 *
 * Datar (bukan nested) karena UI-nya chip baris tunggal; label chapter cukup judulnya, sedangkan
 * "Sepanjang goal" menyebut judul goal supaya dua goal aktif tidak tertukar.
 */
export function goalPickerOptions(
  goals: readonly {
    id: string
    title: string
    status: string
    chapters: readonly { id: string; title: string }[]
  }[],
): PickerOption[] {
  const active = goals.filter((goal) => goal.status === 'aktif')
  const options: PickerOption[] = []
  for (const goal of active) {
    // Satu goal = label polos; lebih dari satu disertai judul supaya tidak tertukar.
    const label = active.length > 1 ? `Sepanjang goal · ${goal.title}` : 'Sepanjang goal'
    options.push({ goalId: goal.id, chapterId: null, label })
    for (const chapter of goal.chapters) {
      options.push({ goalId: goal.id, chapterId: chapter.id, label: chapter.title })
    }
  }
  return options
}

export function isSamePlace(
  current: GoalPlace,
  option: Pick<PickerOption, 'goalId' | 'chapterId'>,
): boolean {
  return current.goalId === option.goalId && current.goalChapterId === option.chapterId
}
