import { z } from 'zod'

import {
  GENERAL_GOAL_CATEGORY_KEY,
  GOAL_CATEGORY_COLORS,
  LEGACY_GOAL_CATEGORY_KEYS,
  goalCategoryColorSchema,
  goalCategoryKeySchema,
  type GoalCategoryColor,
  type GoalCategoryKey,
  type LegacyGoalCategory,
} from '../enums.ts'
import { epochMsSchema, uuidV7Schema } from './primitives.ts'

/**
 * F13 `goal_category` - kategori goal yang bisa dikelola user (tambah, ganti nama, warna, hapus).
 *
 * Kenapa record tersendiri, bukan field di `user_prefs`:
 * - `user_prefs` adalah record SINGLETON berisi tema/gaya, dan schema-nya `.strict()`. Menambah field
 *   di sana membuat record itu DITOLAK seluruhnya oleh klien versi lama - tema & gaya user ikut
 *   hilang. Tipe entitas baru sebaliknya: klien lama tidak punya repository-nya, jadi record-nya
 *   hanya disimpan tanpa dipakai (lihat `sync/controller.ts`: tipe tak dikenal = index `'keep'`,
 *   cursor tetap maju, sync tidak rusak).
 * - Kategori punya siklus hidup sendiri (tombstone per kategori, LWW per record), persis seperti
 *   entitas lain. Menaruhnya di dalam prefs membuat hapus kategori = menimpa seluruh daftar.
 *
 * `id` (UUIDv7) adalah identitas RECORD (sync/LWW), sedangkan `key` adalah identitas yang dirujuk
 * `goal.category` dan tidak pernah berubah saat kategori diganti nama atau diwarnai. Dua-duanya perlu:
 * `id` wajib UUID untuk kontrak backup/import (`io/backup.ts`) dan `id` payload harus sama dengan `id`
 * record, sedangkan `key` untuk kategori bawaan sengaja memakai slug (`karier`, `general`) supaya goal
 * lama tetap valid tanpa migrasi tulis.
 *
 * `CURRENT_SCHEMA_VERSION` sengaja TIDAK dinaikkan. Menaikkannya membuat klien versi lama menolak
 * SEMUA record yang ditulis build baru ("dibuat app versi lebih baru"), sedangkan perubahan ini
 * additive: tipe entitas baru tidak dikenal klien lama (hanya disimpan tanpa dipakai, index `'keep'`,
 * sync tetap jalan) dan `goal.category` hanya melebar dari enum ke kunci. Migrasi tulis untuk goal lama
 * juga tidak perlu karena kelima nilai lama tetap sah apa adanya.
 */

/** Label maksimum; cukup untuk nama kategori, bukan paragraf (input user). */
export const GOAL_CATEGORY_LABEL_MAX = 40

/** Pagar jumlah kategori per akun - membatasi payload sync yang bisa ditumbuhkan user. */
export const GOAL_CATEGORY_MAX = 50

export const goalCategorySchema = z
  .object({
    id: uuidV7Schema,
    key: goalCategoryKeySchema,
    label: z.string().trim().min(1).max(GOAL_CATEGORY_LABEL_MAX),
    color: goalCategoryColorSchema,
    /** Urutan tampil; boleh bolong (reorder = ubah angka), tidak perlu rapat 0..n. */
    sortOrder: z.int().min(0).max(10_000),
    updatedAt: epochMsSchema,
  })
  .strict()

export type GoalCategory = z.infer<typeof goalCategorySchema>

/** Payload kategori tanpa `updatedAt` - bentuk template bawaan (diisi saat seeding). */
export type GoalCategorySeed = Omit<GoalCategory, 'updatedAt'>

/**
 * Id record kategori bawaan.
 *
 * Sengaja KONSTAN, bukan dibuat acak saat seeding: dua perangkat yang membuka Goals sebelum sync
 * pertama sama-sama menulis record dengan id yang sama, jadi LWW menyelesaikannya sebagai satu
 * kategori - bukan dua "General" yang berbeda. Semuanya UUIDv7 sah (versi 7 di posisi 14).
 */
export const GENERAL_GOAL_CATEGORY_ID = '01900000-0000-7000-8000-0000000ca001'

const LEGACY_GOAL_CATEGORY_IDS: Readonly<Record<LegacyGoalCategory, string>> = {
  karier: '01900000-0000-7000-8000-0000000ca002',
  kesehatan: '01900000-0000-7000-8000-0000000ca003',
  keuangan: '01900000-0000-7000-8000-0000000ca004',
  diri: '01900000-0000-7000-8000-0000000ca005',
  relasi: '01900000-0000-7000-8000-0000000ca006',
}

/** Warna bawaan lima kategori lama - sama dengan `cat-*` di design tokens. */
const LEGACY_GOAL_CATEGORY_COLORS: Readonly<Record<LegacyGoalCategory, GoalCategoryColor>> = {
  karier: 'pink',
  kesehatan: 'orange',
  keuangan: 'green',
  diri: 'purple',
  relasi: 'blue',
}

/**
 * `general`: kategori bawaan yang TIDAK bisa dihapus.
 *
 * Dia juga tujuan pemindahan goal saat kategorinya dihapus dan fallback untuk kategori tak dikenal,
 * jadi bentuknya dipakai walau katalog record belum dimuat.
 */
export const GENERAL_GOAL_CATEGORY: GoalCategorySeed = {
  id: GENERAL_GOAL_CATEGORY_ID,
  key: GENERAL_GOAL_CATEGORY_KEY,
  label: 'General',
  color: 'gray',
  sortOrder: 0,
}

/**
 * Kategori bawaan: `general` + lima kategori lama, dengan label & warna yang sama seperti desain.
 *
 * `general` ada di urutan pertama; lima sisanya memakai kunci lama (`LEGACY_GOAL_CATEGORY_KEYS`)
 * supaya goal yang sudah ada tidak perlu ditulis ulang.
 */
export const DEFAULT_GOAL_CATEGORIES: readonly GoalCategorySeed[] = [
  GENERAL_GOAL_CATEGORY,
  ...LEGACY_GOAL_CATEGORY_KEYS.map((key, index): GoalCategorySeed => ({
    id: LEGACY_GOAL_CATEGORY_IDS[key],
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    color: LEGACY_GOAL_CATEGORY_COLORS[key],
    sortOrder: index + 1,
  })),
]

/** Hex per warna palet. Sumber: `CPAL` di mockup Goals (`Desktop v2.dc.html`). */
export type GoalCategoryPaletteEntry = {
  readonly accent: string
  readonly tint: string
  readonly text: string
}

export const GOAL_CATEGORY_PALETTE: Readonly<Record<GoalCategoryColor, GoalCategoryPaletteEntry>> =
  {
    pink: { accent: '#F03FBF', tint: '#F7C6DA', text: '#8E2A5A' },
    orange: { accent: '#FF6A13', tint: '#FFD9BF', text: '#9A3A0C' },
    green: { accent: '#1DA20F', tint: '#CDE8C6', text: '#2E6A26' },
    purple: { accent: '#9B4FC9', tint: '#DCD3F4', text: '#5E3A9A' },
    blue: { accent: '#10A8D8', tint: '#C7E3EE', text: '#1E5D78' },
    yellow: { accent: '#E6A800', tint: '#FFF0C8', text: '#8A5A00' },
    red: { accent: '#E2445C', tint: '#FFD6DC', text: '#9A2A3A' },
    navy: { accent: '#0A55E6', tint: '#D3E0FB', text: '#1C3E8A' },
    gray: { accent: '#9A8B78', tint: '#EFE6D6', text: '#5A4E40' },
  }

/** Bentuk minimal yang dibutuhkan aturan di bawah - cukup untuk record, seed, maupun view UI. */
export type GoalCategoryLike = Pick<GoalCategorySeed, 'key' | 'label' | 'color' | 'sortOrder'>

/** Aturan murni: apakah nilai ini salah satu kunci kategori lama (masih sah, jangan dimigrasikan). */
export function isLegacyGoalCategoryKey(value: unknown): value is LegacyGoalCategory {
  return (
    typeof value === 'string' && (LEGACY_GOAL_CATEGORY_KEYS as readonly string[]).includes(value)
  )
}

/**
 * Aturan murni: rapikan `goal.category` yang datang dari record/sync/import.
 *
 * Nilai yang BENTUKNYA sah (slug lama atau UUID kategori buatan user) dibiarkan apa adanya - kita
 * tidak tahu katalog di perangkat lain, dan mengganti nilai yang sah dengan `general` akan
 * memindahkan goal user hanya karena kategori itu belum tersinkron. Yang benar-benar rusak (bukan
 * string, kosong, karakter aneh, kepanjangan) dipetakan ke `general` supaya satu nilai rusak tidak
 * menggagalkan hydrate seluruh daftar goal (perilaku lama: `goalSchema.parse` melempar).
 *
 * Kategori yang bentuknya sah tapi tidak ada di katalog (mis. sudah dihapus di perangkat lain)
 * ditangani `resolveGoalCategory`, bukan di sini.
 */
export function normalizeGoalCategoryKey(value: unknown): GoalCategoryKey {
  if (isLegacyGoalCategoryKey(value)) return value

  const parsed = goalCategoryKeySchema.safeParse(value)
  return parsed.success ? parsed.data : GENERAL_GOAL_CATEGORY_KEY
}

/**
 * Aturan murni: kategori yang dipakai UI, dengan fallback `general`.
 *
 * `null`/kategori terhapus/kategori dari app versi lebih baru semuanya tampil sebagai General - bukan
 * kartu tanpa label, dan bukan error.
 */
export function resolveGoalCategory(
  categories: readonly GoalCategoryLike[],
  key: unknown,
): GoalCategoryLike {
  const normalized = normalizeGoalCategoryKey(key)
  return categories.find((category) => category.key === normalized) ?? GENERAL_GOAL_CATEGORY
}

/** Urutan tampil katalog: `sortOrder`, lalu kunci sebagai tie-breaker yang stabil. */
export function sortGoalCategories<T extends Pick<GoalCategoryLike, 'key' | 'sortOrder'>>(
  categories: readonly T[],
): T[] {
  return [...categories].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key),
  )
}

/**
 * Aturan murni: satu `key` = satu kategori, yang paling baru menang.
 *
 * Dua perangkat bisa membuat record berbeda untuk kunci yang sama (mis. seeding bawaan sebelum sync
 * pertama, atau import berkas lama). Katalog tidak boleh menampilkan dua baris untuk satu kategori -
 * yang dipakai adalah `updatedAt` terbaru.
 */
export function latestGoalCategories(categories: readonly GoalCategory[]): GoalCategory[] {
  const byKey = new Map<string, GoalCategory>()
  for (const category of categories) {
    const current = byKey.get(category.key)
    if (current === undefined || category.updatedAt > current.updatedAt) {
      byKey.set(category.key, category)
    }
  }
  return sortGoalCategories([...byKey.values()])
}

export type GoalCategoryLabelError = 'required' | 'too_long' | 'duplicate'

export type GoalCategoryLabelResult =
  | { readonly ok: true; readonly label: string }
  | { readonly ok: false; readonly reason: GoalCategoryLabelError }

/**
 * Aturan murni: validasi label kategori.
 *
 * Duplikat dibandingkan tanpa peduli huruf besar/kecil dan spasi tepi ("Karier" == "karier"), karena
 * dua kategori dengan label sama tidak bisa dibedakan user di dropdown.
 */
export function validateGoalCategoryLabel(
  categories: readonly Pick<GoalCategoryLike, 'key' | 'label'>[],
  rawLabel: string,
  options: { readonly exceptKey?: string } = {},
): GoalCategoryLabelResult {
  const label = rawLabel.trim()
  if (label.length === 0) return { ok: false, reason: 'required' }
  if (label.length > GOAL_CATEGORY_LABEL_MAX) return { ok: false, reason: 'too_long' }

  const normalized = label.toLocaleLowerCase('id')
  const duplicate = categories.some(
    (category) =>
      category.key !== options.exceptKey &&
      category.label.trim().toLocaleLowerCase('id') === normalized,
  )
  return duplicate ? { ok: false, reason: 'duplicate' } : { ok: true, label }
}

/** Aturan murni: warna pertama yang belum dipakai; kalau semua terpakai, giliran berikutnya. */
export function nextGoalCategoryColor(
  categories: readonly Pick<GoalCategoryLike, 'color'>[],
): GoalCategoryColor {
  const used = new Set(categories.map((category) => category.color))
  const unused = GOAL_CATEGORY_COLORS.find((color) => !used.has(color))
  if (unused !== undefined) return unused

  const fallback =
    GOAL_CATEGORY_COLORS[categories.length % GOAL_CATEGORY_COLORS.length] ??
    GENERAL_GOAL_CATEGORY.color
  return fallback
}

/** Aturan murni: `sortOrder` untuk kategori baru = setelah yang terakhir. */
export function nextGoalCategorySortOrder(
  categories: readonly Pick<GoalCategoryLike, 'sortOrder'>[],
): number {
  return categories.reduce((max, category) => Math.max(max, category.sortOrder + 1), 0)
}

/** Aturan murni: `general` tidak boleh dihapus (kategori lain boleh). */
export function canDeleteGoalCategory(category: Pick<GoalCategoryLike, 'key'>): boolean {
  return category.key !== GENERAL_GOAL_CATEGORY_KEY
}

export type GoalCategoryAddError =
  GoalCategoryLabelError | 'too_many' | 'duplicate_key' | 'invalid_key'

export type GoalCategoryAddResult =
  | { readonly ok: true; readonly category: GoalCategory }
  | { readonly ok: false; readonly reason: GoalCategoryAddError }

/**
 * Aturan murni: susun kategori baru (belum ditulis ke storage).
 *
 * `id`/`key` di-inject pemanggil karena modul domain tidak boleh membuat id acak sendiri. Warna
 * opsional: kalau tidak dipilih user, dipakai warna yang belum terpakai.
 */
export function addGoalCategory(
  categories: readonly GoalCategoryLike[],
  input: {
    readonly id: string
    readonly key: string
    readonly label: string
    readonly color?: GoalCategoryColor
    readonly updatedAt: number
  },
): GoalCategoryAddResult {
  if (categories.length >= GOAL_CATEGORY_MAX) return { ok: false, reason: 'too_many' }
  if (categories.some((category) => category.key === input.key)) {
    return { ok: false, reason: 'duplicate_key' }
  }

  const label = validateGoalCategoryLabel(categories, input.label)
  if (!label.ok) return { ok: false, reason: label.reason }

  const parsed = goalCategorySchema.safeParse({
    id: input.id,
    key: input.key,
    label: label.label,
    color: input.color ?? nextGoalCategoryColor(categories),
    sortOrder: nextGoalCategorySortOrder(categories),
    updatedAt: input.updatedAt,
  })
  if (!parsed.success) {
    // Satu-satunya sebab yang mungkin: id/kunci yang di-inject tidak berbentuk sah (bug pemanggil).
    return { ok: false, reason: 'invalid_key' }
  }

  return { ok: true, category: parsed.data }
}

/** Aturan murni: goal mana saja yang memakai satu kategori (dipakai saat kategori dihapus). */
export function goalsInCategory<T extends { readonly category: string }>(
  goals: readonly T[],
  key: string,
): readonly T[] {
  return goals.filter((goal) => goal.category === key)
}
