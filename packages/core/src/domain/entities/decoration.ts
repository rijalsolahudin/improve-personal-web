import { z } from 'zod'

import { breakpointSchema } from '../enums.ts'
import { epochMsSchema, uuidV7Schema } from './primitives.ts'

/**
 * F14 `decoration` - hiasan layer per UKURAN LAYAR, bukan per device.
 *
 * Aturan yang ditegakkan di sini:
 * - `anchor_key` WAJIB kunci slot semantik dari registry bersama (`decoration/anchors.ts`), DILARANG
 *   id DOM: hiasan ikut sync lintas platform per ukuran layar, sedangkan React Native tidak punya
 *   DOM id sama sekali. Anchor berbasis DOM akan selalu yatim di HP native.
 * - Halaman diturunkan dari prefix `anchor_key`, jadi tidak ada kolom `page` yang bisa bertentangan.
 * - `anchor_key` tak dikenal / elemen tempelannya hilang -> sticker DISEMBUNYIKAN, barisnya JANGAN
 *   dihapus (`isRenderable` + `visibleDecorations`). Refactor halaman tidak boleh menghancurkan
 *   hiasan user secara permanen.
 */

export const decorationSchema = z
  .object({
    id: uuidV7Schema,
    breakpoint: breakpointSchema,
    /** Kunci slot semantik, mis. `daily.priority-card`. BUKAN id DOM. */
    anchorKey: z.string().trim().min(1).max(120),
    /** Pembeda kalau satu anchor muncul berkali-kali (mis. id goal di list kartu). `null` = tunggal. */
    instanceKey: z.string().trim().min(1).max(120).nullable(),
    /** Hanya ID sticker (bukan gambar). */
    stickerId: z.string().min(1).max(120),
    /** Posisi dalam persen relatif elemen -> elemen melebar, sticker ikut. */
    posXPct: z.number().min(-100).max(200),
    posYPct: z.number().min(-100).max(200),
    sizePct: z.number().min(1).max(1_000),
    rotationDeg: z.number().min(-360).max(360),
    zOrder: z.int().min(-10_000).max(10_000),
    createdAt: epochMsSchema,
    updatedAt: epochMsSchema,
  })
  .strict()

export type Decoration = z.infer<typeof decorationSchema>

/**
 * Halaman diturunkan dari prefix `anchor_key` (mis. `daily.priority-card` -> `daily`).
 *
 * Satu fungsi, dipakai dua platform: kalau prefix-nya dihitung di dua tempat, "reset hiasan per
 * halaman" bisa berbeda antara web dan mobile.
 */
export function pageOfAnchor(anchorKey: string): string {
  const separatorIndex = anchorKey.indexOf('.')
  return separatorIndex === -1 ? anchorKey : anchorKey.slice(0, separatorIndex)
}

/** Aturan murni: apakah hiasan ini bisa dirender sekarang. */
export function isRenderable(
  decoration: Pick<Decoration, 'anchorKey' | 'instanceKey' | 'breakpoint'>,
  context: {
    readonly breakpoint: Decoration['breakpoint']
    /** Anchor yang benar-benar ada di halaman sekarang (dari registry + struktur saat ini). */
    readonly availableAnchors: ReadonlySet<string>
    /** Instance yang benar-benar ada untuk anchor itu (mis. id goal yang sedang tampil). */
    readonly availableInstances?: ReadonlyMap<string, ReadonlySet<string>>
  },
): boolean {
  if (decoration.breakpoint !== context.breakpoint) return false
  if (!context.availableAnchors.has(decoration.anchorKey)) return false

  if (decoration.instanceKey === null) return true
  const instances = context.availableInstances?.get(decoration.anchorKey)
  return instances !== undefined && instances.has(decoration.instanceKey)
}

/**
 * Aturan murni render layer hias: urut `z_order` lalu `createdAt` (tie-break stabil), dan hiasi
 * HANYA yang anchor-nya masih ada.
 *
 * Baris yang tidak renderable tetap tersimpan - ini yang membuat refactor halaman tidak menghapus
 * hiasan permanen.
 */
export function visibleDecorations(
  decorations: readonly Decoration[],
  context: Parameters<typeof isRenderable>[1],
): readonly Decoration[] {
  return decorations
    .filter((decoration) => isRenderable(decoration, context))
    .sort((a, b) => {
      if (a.zOrder !== b.zOrder) return a.zOrder - b.zOrder
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
      if (a.id === b.id) return 0
      return a.id < b.id ? -1 : 1
    })
}

/**
 * Aturan murni "salin antar ukuran": memindahkan set hiasan satu breakpoint ke breakpoint lain.
 *
 * Id baru dikosongkan pemanggil (record baru di DB) - fungsi ini cuma memetakan isinya, supaya
 * unit test bisa membandingkan hasil tanpa menyentuh storage.
 */
export function copyDecorationsToBreakpoint(
  decorations: readonly Decoration[],
  fromBreakpoint: Decoration['breakpoint'],
  toBreakpoint: Decoration['breakpoint'],
): readonly Omit<Decoration, 'id' | 'createdAt' | 'updatedAt'>[] {
  return decorations
    .filter((decoration) => decoration.breakpoint === fromBreakpoint)
    .map((decoration) => {
      const { id, createdAt, updatedAt, ...rest } = decoration
      void id
      void createdAt
      void updatedAt
      return { ...rest, breakpoint: toBreakpoint }
    })
}
