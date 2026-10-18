import { z } from 'zod'

import {
  APP_STYLES,
  DEFAULT_APP_STYLE,
  DEFAULT_THEME_COLOR,
  THEME_COLORS,
  appStyleSchema,
  themeColorSchema,
  type AppStyle,
  type ThemeColor,
} from '../enums.ts'
import { epochMsSchema, uuidV7Schema } from './primitives.ts'

/**
 * F16 `user_prefs` - tema & gaya, tersimpan per akun dan ikut sync.
 *
 * Bagian yang paling mudah salah di sini BUKAN validasi input, tapi jalur naik versi: nilai tak
 * dikenal (mis. data dari perangkat yang sudah pakai daftar gaya lebih baru, atau berkas import dari
 * versi lain) harus kembali ke DEFAULT TANPA ERROR - bukan menolak record, bukan pula menggagalkan
 * seluruh import.
 *
 * Karena itu ada DUA schema dengan tugas berbeda:
 * - `userPrefsSchema`     : bentuk ketat, dipakai saat MENULIS/memvalidasi berkas import sebagai
 *                           "schema lengkap" (F10). Nilai asing ditolak di sini supaya berkas yang
 *                           formatnya tidak kita kenal tidak diam-diam "diperbaiki" saat import.
 * - `normalizeUserPrefs`  : jalur BACA data yang sudah ada (sync/decrypt/baca DB). Nilai tak dikenal
 *                           di-map ke default, tanpa error, dan jumlah perbaikannya dilaporkan supaya
 *                           bisa dicatat/di-debug.
 *
 * Memisahkan keduanya penting: kalau jalur baca juga menolak, satu nilai asing dari perangkat lain
 * bisa bikin app gagal unlock. Kalau jalur tulis juga menormalkan, berkas export rusak akan lolos
 * diam-diam dan tidak pernah ketahuan.
 */

export const userPrefsSchema = z
  .object({
    id: uuidV7Schema,
    themeColor: themeColorSchema,
    style: appStyleSchema,
    /** Toggle global "Sembunyikan hiasan" (PRD F14). */
    hideDecorations: z.boolean(),
    updatedAt: epochMsSchema,
  })
  .strict()

export type UserPrefs = z.infer<typeof userPrefsSchema>

/** Default pertama kali: Cute + Kuning (PRD F16). */
export const DEFAULT_USER_PREFS: Pick<UserPrefs, 'themeColor' | 'style' | 'hideDecorations'> = {
  themeColor: DEFAULT_THEME_COLOR,
  style: DEFAULT_APP_STYLE,
  hideDecorations: false,
}

/** Satu nilai yang dikembalikan ke default, dilaporkan supaya bisa dicatat saat sync/import. */
export type PrefFallback = {
  readonly field: 'themeColor' | 'style' | 'hideDecorations'
  readonly received: unknown
  readonly fallback: string | boolean
}

export type NormalizedPrefs = {
  readonly themeColor: ThemeColor
  readonly style: AppStyle
  readonly hideDecorations: boolean
  /** Kosong kalau semua nilai dikenali - kondisi normal. */
  readonly fallbacks: readonly PrefFallback[]
}

/** Aturan murni: apakah string ini salah satu nilai tema yang kita kenal. */
export function isKnownThemeColor(value: unknown): value is ThemeColor {
  return typeof value === 'string' && (THEME_COLORS as readonly string[]).includes(value)
}

/** Aturan murni: apakah string ini salah satu nilai gaya yang kita kenal. */
export function isKnownAppStyle(value: unknown): value is AppStyle {
  return typeof value === 'string' && (APP_STYLES as readonly string[]).includes(value)
}

/**
 * Aturan murni F16: nilai tak dikenal -> default TANPA error.
 *
 * Tanpa `throw`, tanpa `null`, tanpa nilai setengah jalan: hasilnya selalu prefs yang bisa dipakai
 * render. `fallbacks` mengembalikan informasi apa yang diganti supaya pemanggil bisa mencatatnya
 * (dan supaya unit test bisa membuktikan aturannya dijalankan, bukan cuma "kebetulan benar").
 */
export function normalizeUserPrefs(raw: unknown): NormalizedPrefs {
  const fallbacks: PrefFallback[] = []

  const source = isPlainObjectLike(raw) ? raw : {}

  let themeColor: ThemeColor = DEFAULT_USER_PREFS.themeColor
  if (isKnownThemeColor(source['themeColor'])) {
    themeColor = source['themeColor']
  } else if ('themeColor' in source) {
    fallbacks.push({
      field: 'themeColor',
      received: source['themeColor'],
      fallback: DEFAULT_USER_PREFS.themeColor,
    })
  }

  let style: AppStyle = DEFAULT_USER_PREFS.style
  if (isKnownAppStyle(source['style'])) {
    style = source['style']
  } else if ('style' in source) {
    fallbacks.push({
      field: 'style',
      received: source['style'],
      fallback: DEFAULT_USER_PREFS.style,
    })
  }

  let hideDecorations = DEFAULT_USER_PREFS.hideDecorations
  if (typeof source['hideDecorations'] === 'boolean') {
    hideDecorations = source['hideDecorations']
  } else if ('hideDecorations' in source) {
    fallbacks.push({
      field: 'hideDecorations',
      received: source['hideDecorations'],
      fallback: DEFAULT_USER_PREFS.hideDecorations,
    })
  }

  return { themeColor, style, hideDecorations, fallbacks }
}

function isPlainObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Prefs lengkap dari payload yang mungkin rusak.
 *
 * `id`/`updatedAt` tetap dibutuhkan untuk menulis record, jadi kalau payload tidak punya keduanya
 * pemanggil harus menyediakannya (lihat `envelopeFor` di `domain/entities/index.ts`) - fungsi ini
 * tidak pernah mengarang id record.
 */
export function normalizeUserPrefsFrom(raw: unknown, id: string, updatedAt: number): UserPrefs {
  const normalized = normalizeUserPrefs(raw)
  return {
    id,
    themeColor: normalized.themeColor,
    style: normalized.style,
    hideDecorations: normalized.hideDecorations,
    updatedAt,
  }
}
