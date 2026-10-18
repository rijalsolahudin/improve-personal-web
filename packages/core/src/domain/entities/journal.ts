import { z } from 'zod'

import { mentionTargetTypeSchema, moodSchema, reflectionKindSchema } from '../enums.ts'
import { epochMsSchema, localDateSchema, uuidV7Schema } from './primitives.ts'

/**
 * F8 Journal.
 *
 * ARCHITECTURE.md §6 menyebutnya `Memo`; nama tabel di DBML `journal_entry`. Nama di paket ini
 * mengikuti DBML (sumber bentuk data) supaya tidak ada dua istilah untuk hal yang sama.
 *
 * Aturan penting:
 * - SATU jurnal per hari (`entry_date` unique) - menyimpan ulang = update, bukan duplikat.
 * - Mention ke jadwal yang sudah DIHAPUS harus tampil sebagai chip "jadwal dihapus" tanpa error,
 *   jadi `target_id` adalah soft ref (tidak ada FK).
 * - Markdown disanitasi saat RENDER (DOMPurify / renderer tanpa HTML), bukan di sini; core cuma
 *   menyimpan teks. Dilarang `v-html` dari input mentah (ARCHITECTURE.md §11).
 */

export const journalEntrySchema = z
  .object({
    id: uuidV7Schema,
    /** Tanggal lokal `YYYY-MM-DD` - SATU jurnal per hari. */
    entryDate: localDateSchema,
    /** Bagian 1: mau jadi orang yang gimana. */
    identityToday: z.string().max(10_000).nullable(),
    /** Bagian 2: satu mood per hari, 5 skala. */
    mood: moodSchema.nullable(),
    /** Cerita detail, markdown. */
    moodStoryMd: z.string().max(100_000).nullable(),
    /** Bagian 5: Tentang Hari Ini, markdown. Review Goal juga disimpan di sini. */
    diaryMd: z.string().max(100_000).nullable(),
    createdAt: epochMsSchema,
    updatedAt: epochMsSchema,
  })
  .strict()

export type JournalEntry = z.infer<typeof journalEntrySchema>

/**
 * Aturan murni: tombol DLT yang menandai jurnal benar-benar "ada isinya".
 *
 * Dipakai Diary Book (daftar jurnal) dan Overview (hari terisi) - entri kosong dari salah klik
 * tidak boleh dihitung sebagai jurnal.
 */
export function hasJournalContent(
  entry: Pick<JournalEntry, 'identityToday' | 'mood' | 'moodStoryMd' | 'diaryMd'>,
  reflectionCount: number,
  affirmationCount: number,
  stickerCount: number,
  mentionCount: number,
): boolean {
  if (entry.mood !== null) return true
  for (const text of [entry.identityToday, entry.moodStoryMd, entry.diaryMd]) {
    if (text !== null && text.trim().length > 0) return true
  }
  return reflectionCount + affirmationCount + stickerCount + mentionCount > 0
}

/** `journal_reflection` - bagian 4: tiga daftar, masing-masing boleh lebih dari satu poin. */
export const journalReflectionSchema = z
  .object({
    id: uuidV7Schema,
    entryId: uuidV7Schema,
    kind: reflectionKindSchema,
    text: z.string().trim().min(1).max(2_000),
    position: z.int().min(0).max(1_000),
  })
  .strict()

export type JournalReflection = z.infer<typeof journalReflectionSchema>

/** `journal_affirmation` - bagian 3: diketik sendiri atau dipilih dari daftar bawaan. */
export const journalAffirmationSchema = z
  .object({
    id: uuidV7Schema,
    entryId: uuidV7Schema,
    text: z.string().trim().min(1).max(2_000),
    position: z.int().min(0).max(1_000),
  })
  .strict()

export type JournalAffirmation = z.infer<typeof journalAffirmationSchema>

/** `journal_sticker` - HANYA menyimpan ID sticker, bukan gambarnya. */
export const journalStickerSchema = z
  .object({
    id: uuidV7Schema,
    entryId: uuidV7Schema,
    stickerId: z.string().min(1).max(120),
    position: z.int().min(0).max(1_000),
  })
  .strict()

export type JournalSticker = z.infer<typeof journalStickerSchema>

/**
 * `journal_mention`.
 *
 * `targetId` SOFT REF: target boleh sudah dihapus. `token` menyimpan teks mention ASLI
 * (mis. `@Olahraga`) supaya chip tetap bisa ditampilkan walaupun targetnya hilang.
 */
export const journalMentionSchema = z
  .object({
    id: uuidV7Schema,
    entryId: uuidV7Schema,
    targetType: mentionTargetTypeSchema,
    targetId: uuidV7Schema,
    token: z.string().trim().min(1).max(200),
    position: z.int().min(0).max(10_000),
  })
  .strict()

export type JournalMention = z.infer<typeof journalMentionSchema>

/** Hasil resolusi mention: chip yang bisa diklik, atau chip "sudah dihapus". */
export type ResolvedMention =
  | { readonly kind: 'resolved'; readonly token: string; readonly targetId: string }
  | { readonly kind: 'deleted'; readonly token: string; readonly targetId: string }

/**
 * Aturan murni: resolusi mention terhadap daftar id target yang masih ada.
 *
 * Ini yang menutup AC "jadwal terhapus tidak bikin error": mention dengan target yang tidak ada
 * di-resolve jadi chip `deleted`, BUKAN dibuang dan bukan melempar error.
 */
export function resolveMentions(
  mentions: readonly JournalMention[],
  existingTargetIds: ReadonlySet<string>,
): readonly ResolvedMention[] {
  return mentions.map((mention) =>
    existingTargetIds.has(mention.targetId)
      ? { kind: 'resolved' as const, token: mention.token, targetId: mention.targetId }
      : { kind: 'deleted' as const, token: mention.token, targetId: mention.targetId },
  )
}

/** Aturan murni: urutan tampil item ber-`position`; tie-break `id` supaya deterministik. */
export function compareByPosition(
  a: { readonly position: number; readonly id: string },
  b: { readonly position: number; readonly id: string },
): number {
  if (a.position !== b.position) return a.position - b.position
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

/**
 * Aturan murni "satu jurnal per hari" (AC T11): kalau sudah ada entri untuk tanggal itu, kembalikan
 * entri yang ada supaya pemanggil meng-update, bukan membuat record baru.
 */
export function findEntryForDate(
  entries: readonly JournalEntry[],
  entryDate: string,
): JournalEntry | null {
  let found: JournalEntry | null = null
  for (const entry of entries) {
    if (entry.entryDate !== entryDate) continue
    if (found === null || entry.updatedAt > found.updatedAt) found = entry
  }
  return found
}
