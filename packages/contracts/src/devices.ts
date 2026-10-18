import { z } from 'zod'

import { isoInstantSchema, uuidSchema } from './protocol.ts'

/**
 * DTO perangkat + enum yang dipakai sesi.
 *
 * Sumber: `apps/web/docs/server.dbml` tabel `devices` & `sessions` (enum `device_platform`,
 * `client_kind`) dan PRD F15 halaman "Perangkat".
 *
 * `devices.id` dibuat SERVER saat login. Client cuma menyumbang nama + platform lewat
 * `deviceInfoSchema` (`auth.ts`), jadi id perangkat tidak pernah datang dari body client - sama
 * seperti `user_id` yang selalu dari sesi (ARCHITECTURE.md §8).
 */

/** Batas jumlah perangkat aktif per user (`server.dbml` `devices`: maks 10, dijaga rate limit). */
export const MAX_ACTIVE_DEVICES_PER_USER = 10

/** Panjang maksimum nama perangkat. */
export const DEVICE_NAME_MAX_LENGTH = 64

/** Panjang maksimum kota-dari-IP. Metadata kasar, bukan alamat. */
export const DEVICE_CITY_MAX_LENGTH = 64

/**
 * Batas jumlah baris di halaman Perangkat.
 *
 * Lebih besar dari `MAX_ACTIVE_DEVICES_PER_USER` karena perangkat yang sudah di-revoke tetap
 * ditampilkan sebagai jejak audit (`server.dbml` `devices.revoked_at`), tapi tetap dibatasi supaya
 * satu response tidak bisa membengkak.
 */
export const DEVICE_LIST_MAX = 50

export const DEVICE_PLATFORMS = ['web', 'ios', 'android'] as const

export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number]

/** Platform perangkat (`server.dbml` enum `device_platform`). */
export const devicePlatformSchema = z.enum(DEVICE_PLATFORMS)

/**
 * Karakter kontrol dicek manual, bukan lewat regex: nama perangkat dan kota ikut masuk log server dan
 * ditampilkan di UI, jadi newline di dalamnya bisa memalsukan satu baris log.
 */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/** Nama perangkat dari client: di-trim, dibatasi panjangnya, tanpa karakter kontrol. */
export const deviceNameSchema = z
  .string()
  .trim()
  .min(1, `Nama perangkat wajib diisi`)
  .max(DEVICE_NAME_MAX_LENGTH, `Nama perangkat maksimum ${DEVICE_NAME_MAX_LENGTH} karakter`)
  .refine((value) => !hasControlCharacter(value), 'Nama perangkat memuat karakter terlarang')

/**
 * DTO perangkat untuk halaman "Perangkat" (PRD F15). Tidak ada `user_id` di DTO.
 *
 * Semua waktu ISO-8601 UTC (`protocol.ts`), `null` dipakai untuk yang belum diketahui - bukan string
 * kosong, supaya "tidak ada data" tidak bisa tertukar dengan "ada tapi kosong".
 */
export const deviceDtoSchema = z
  .object({
    id: uuidSchema,
    name: deviceNameSchema,
    platform: devicePlatformSchema,
    /** Kapan perangkat ini pertama login. */
    createdAt: isoInstantSchema,
    /** Aktivitas terakhir; server update throttled (>= 5 menit), bukan tiap request. */
    lastSeenAt: isoInstantSchema,
    /** Kota dari IP. `null` kalau sumbernya belum diketahui. Dilarang memuat IP mentah. */
    lastIpCity: z.string().min(1).max(DEVICE_CITY_MAX_LENGTH).nullable(),
    /** Soft revoke -> jejak audit (`server.dbml` `devices.revoked_at`). */
    revokedAt: isoInstantSchema.nullable(),
  })
  .strict()

export type DeviceDto = z.infer<typeof deviceDtoSchema>

/** `GET /v1/devices` */
export const deviceListResultSchema = z
  .object({ devices: z.array(deviceDtoSchema).max(DEVICE_LIST_MAX) })
  .strict()

export type DeviceListResult = z.infer<typeof deviceListResultSchema>

/**
 * `DELETE /v1/devices/:id` - logout jarak jauh.
 *
 * Kepemilikan (`devices.user_id` = user di sesi) dicek di service, bukan di schema: schema tidak boleh
 * jadi tempat setengah-setengah untuk authz (ARCHITECTURE.md §8).
 */
export const deviceRevokeParamsSchema = z.object({ id: uuidSchema }).strict()

export type DeviceRevokeParams = z.infer<typeof deviceRevokeParamsSchema>
