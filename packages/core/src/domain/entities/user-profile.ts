import { z } from 'zod'

import { epochMsSchema, uuidV7Schema } from './primitives.ts'

/**
 * `user_profile` - nama tampilan & foto profil, per akun dan ikut sync.
 *
 * Disimpan sebagai record terenkripsi seperti data lain, BUKAN kolom di server: server tetap tidak
 * bisa membaca PII ini (minimisasi data, UU PDP). Konsekuensinya profil baru terbaca setelah data
 * lokal terbuka.
 *
 * Dipisah dari `user_prefs` supaya foto tidak ikut ditulis ulang setiap kali tema diganti.
 */

export const PROFILE_DISPLAY_NAME_MAX_LENGTH = 60

/** Sisi foto yang disimpan (px, persegi). Foto asli dikecilkan di client sebelum ditulis. */
export const PROFILE_AVATAR_SIZE_PX = 256

/**
 * Batas panjang data URL foto. 256px WebP biasanya < 40 KB base64; batas ini menyisakan ruang
 * untuk JPEG tanpa membuat record mendekati batas blob 1 MB.
 */
export const PROFILE_AVATAR_MAX_LENGTH = 200_000

/**
 * Hanya raster yang diterima. SVG sengaja ditolak: SVG bisa memuat script, dan data URL ini
 * dirender langsung sebagai `<img src>`.
 */
const AVATAR_DATA_URL_PATTERN = /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/

export const profileAvatarSchema = z
  .string()
  .max(PROFILE_AVATAR_MAX_LENGTH)
  .regex(AVATAR_DATA_URL_PATTERN, 'foto harus data URL WebP/JPEG/PNG')

export const userProfileSchema = z
  .object({
    id: uuidV7Schema,
    /** Kosong = belum diisi; UI memakai sapaan umum. */
    displayName: z.string().trim().max(PROFILE_DISPLAY_NAME_MAX_LENGTH),
    avatar: profileAvatarSchema.nullable(),
    updatedAt: epochMsSchema,
  })
  .strict()

export type UserProfile = z.infer<typeof userProfileSchema>
