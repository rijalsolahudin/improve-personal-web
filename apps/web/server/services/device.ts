import {
  DEVICE_LIST_MAX,
  MAX_ACTIVE_DEVICES_PER_USER,
  type DeviceDto,
  type DeviceInfo,
} from '@improve-personal/contracts'
import { and, count, desc, eq, isNull } from 'drizzle-orm'

import { devices, sessions } from '../db/schema'
import { apiProblem } from '../utils/api-error'
import { uuidv7 } from '../utils/uuid'
import type { ServiceContext } from './context'

/**
 * Perangkat (PRD F15 halaman "Perangkat", T19).
 *
 * Semua fungsi di sini WAJIB ter-scope `user_id` dari sesi: `devices.id` datang dari URL/body, jadi
 * ia tidak pernah cukup untuk menentukan kepemilikan (security.md §3). Query di bawah selalu memakai
 * pasangan (id, user_id) - itulah yang membuat IDOR perangkat tidak mungkin.
 */

const MAX_ACTIVE_DEVICES = MAX_ACTIVE_DEVICES_PER_USER

function toDeviceDto(row: {
  id: string
  name: string
  platform: DeviceInfo['platform']
  createdAt: Date
  lastSeenAt: Date
  lastIpCity: string | null
  revokedAt: Date | null
}): DeviceDto {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    lastIpCity: row.lastIpCity,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  }
}

export async function countActiveDevices(ctx: ServiceContext, userId: string): Promise<number> {
  const rows = await ctx.db
    .select({ total: count() })
    .from(devices)
    .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)))

  return rows[0]?.total ?? 0
}

/**
 * Perangkat untuk login ini.
 *
 * Kalau user sudah punya perangkat AKTIF dengan nama + platform yang sama, baris itu yang dipakai
 * ulang, bukan baris baru. Alasannya praktis: login berikutnya dari browser yang sama tidak boleh
 * membuat halaman "Perangkat" penuh duplikat, dan tanpa ini satu browser cukup login 10 kali untuk
 * memakai habis jatah 10 perangkat aktif.
 *
 * Kalau belum ada, batas `MAX_ACTIVE_DEVICES_PER_USER` ditegakkan di sini dan kegagalannya memakai
 * kode `DEVICE_LIMIT_REACHED` (`409`, kontrak). Kode khusus ini penting supaya client bisa menyuruh
 * user menghapus salah satu perangkat - `FORBIDDEN` hanya bilang "tidak boleh" tanpa jalan keluar.
 */
export async function resolveDeviceForLogin(
  ctx: ServiceContext,
  userId: string,
  info: DeviceInfo,
): Promise<string> {
  const existing = await ctx.db
    .select({ id: devices.id })
    .from(devices)
    .where(
      and(
        eq(devices.userId, userId),
        eq(devices.name, info.name),
        eq(devices.platform, info.platform),
        isNull(devices.revokedAt),
      ),
    )
    .orderBy(desc(devices.createdAt))
    .limit(1)

  const reused = existing[0]
  if (reused) {
    await ctx.db.update(devices).set({ lastSeenAt: ctx.now }).where(eq(devices.id, reused.id))

    return reused.id
  }

  const active = await countActiveDevices(ctx, userId)
  if (active >= MAX_ACTIVE_DEVICES) throw apiProblem('DEVICE_LIMIT_REACHED')

  const deviceId = uuidv7(ctx.now.getTime())
  await ctx.db.insert(devices).values({
    id: deviceId,
    userId,
    name: info.name,
    platform: info.platform,
    createdAt: ctx.now,
    lastSeenAt: ctx.now,
  })

  return deviceId
}

/** Daftar perangkat user. Dibatasi `DEVICE_LIST_MAX` supaya satu respons tidak bisa membengkak. */
export async function listDevices(ctx: ServiceContext, userId: string): Promise<DeviceDto[]> {
  const rows = await ctx.db
    .select()
    .from(devices)
    .where(eq(devices.userId, userId))
    .orderBy(desc(devices.createdAt))
    .limit(DEVICE_LIST_MAX)

  return rows.map(toDeviceDto)
}

/**
 * Logout jarak jauh (T19 AC).
 *
 * Soft revoke perangkat + hapus sesi perangkat itu dalam SATU transaksi: kalau perangkat di-revoke
 * tanpa sesinya dihapus, token yang masih dipegang perangkat itu tetap lolos autentikasi sampai
 * kedaluwarsa - persis kebalikan dari "revoke instan" yang dijanjikan.
 */
export async function revokeDevice(
  ctx: ServiceContext,
  userId: string,
  deviceId: string,
): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: devices.id, revokedAt: devices.revokedAt })
      .from(devices)
      .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)))
      .limit(1)

    const device = owned[0]
    // Perangkat milik user lain dan perangkat yang tidak ada sama-sama `NOT_FOUND`: membedakannya
    // akan memberi tahu penyerang bahwa id perangkat tertentu memang ada.
    if (!device) throw apiProblem('NOT_FOUND')

    if (!device.revokedAt) {
      await tx.update(devices).set({ revokedAt: ctx.now }).where(eq(devices.id, device.id))
    }

    await tx
      .update(sessions)
      .set({ revokedAt: ctx.now })
      .where(and(eq(sessions.deviceId, device.id), isNull(sessions.revokedAt)))
  })
}
