import {
  DEVICE_LIST_MAX,
  MAX_ACTIVE_DEVICES_PER_USER,
  type DeviceDto,
  type DeviceInfo,
} from '@improve-personal/contracts'
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm'

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

/** SQLSTATE Postgres untuk unique violation (`23505`). */
const PG_UNIQUE_VIOLATION = '23505'

/** Index penjaga invarian "satu instalasi = satu baris AKTIF per user" (`db/schema.ts`). */
const ACTIVE_INSTALLATION_INDEX = 'uq_devices_user_installation_active'

/**
 * Percobaan penyelesaian perangkat sebelum menyerah. Dua cukup: kalah balapan INSERT hanya bisa
 * berarti "baris pemenang sudah ada", dan satu pengulangan menutup kasus baris itu di-revoke tepat
 * setelah menang.
 */
const RESOLVE_ATTEMPTS = 2

/**
 * Apakah error ini unique violation dari index instalasi aktif?
 *
 * Dicek PERSIS (kode + nama index) supaya error lain - termasuk unique violation dari index lain -
 * tetap dilempar: menelannya akan menyembunyikan bug yang sebenarnya. Drizzle membungkus error driver
 * (`DrizzleQueryError`), jadi `cause` ikut ditelusuri.
 */
function isActiveInstallationConflict(error: unknown): boolean {
  let current: unknown = error

  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== 'object' || current === null) return false

    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown }
    if (
      candidate.code === PG_UNIQUE_VIOLATION &&
      candidate.constraint === ACTIVE_INSTALLATION_INDEX
    ) {
      return true
    }

    current = candidate.cause
  }

  return false
}

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

/** Perangkat AKTIF user ini untuk satu nilai `installation_id`. Jalur utama sejak task #80. */
async function findActiveDeviceIdByInstallation(
  ctx: ServiceContext,
  userId: string,
  installationId: string,
): Promise<string | null> {
  const rows = await ctx.db
    .select({ id: devices.id })
    .from(devices)
    .where(
      and(
        eq(devices.userId, userId),
        eq(devices.installationId, installationId),
        isNull(devices.revokedAt),
      ),
    )
    // Nilai yang sama bisa menempel di beberapa baris REVOKED (index uniknya partial), jadi pilih
    // yang paling baru - sama seperti heuristik nama+platform yang lama.
    .orderBy(desc(devices.createdAt))
    .limit(1)

  return rows[0]?.id ?? null
}

/** Perangkat AKTIF user ini dengan nama + platform sama - perilaku klien lama (tanpa installationId). */
async function findActiveDeviceIdByNamePlatform(
  ctx: ServiceContext,
  userId: string,
  info: DeviceInfo,
): Promise<string | null> {
  const rows = await ctx.db
    .select({ id: devices.id })
    .from(devices)
    .where(
      and(
        eq(devices.userId, userId),
        eq(devices.name, info.name),
        eq(devices.platform, info.platform),
        // TIDAK menyaring `installation_id`: inilah perilaku lama yang harus tetap jalan untuk build
        // yang belum mengirim installationId.
        isNull(devices.revokedAt),
      ),
    )
    .orderBy(desc(devices.createdAt))
    .limit(1)

  return rows[0]?.id ?? null
}

/**
 * Adopsi baris lama (dari sebelum kolom `installation_id` ada) oleh instalasi yang baru dikenali.
 *
 * Tanpa langkah ini, user yang sudah punya perangkat akan mendapat baris KEDUA saat build baru
 * pertama kali login (instalasinya belum tercatat di baris mana pun) - halaman "Perangkat" langsung
 * berisi duplikat, dan jatah 10 perangkat aktif terpakai dua kali untuk satu browser.
 *
 * `WHERE installation_id IS NULL` di UPDATE, bukan cuma di SELECT: kalau dua instalasi login hampir
 * bersamaan, hanya satu yang boleh mengklaim baris lama; yang kalah (0 baris ter-update) membuat baris
 * sendiri, karena baris itu sekarang jelas milik instalasi lain.
 *
 * `WHERE revoked_at IS NULL` juga ada di UPDATE, bukan cuma di SELECT (bug TOCTOU review #80): kalau
 * perangkat lama di-revoke tepat di antara SELECT dan UPDATE (mis. user menekan "keluarkan perangkat"
 * di tab lain), UPDATE yang hanya menyaring `installation_id` tetap mengisi baris yang sudah mati.
 * Login lalu menjawab sukses padahal `findSessionByToken` menolak perangkat revoked - "berhasil login
 * tapi tidak bisa masuk". Dengan filter itu, `RETURNING` kosong dan pemanggil jatuh ke pembuatan baris
 * baru (perilaku yang memang diinginkan: instalasi ini perangkat yang hidup lagi).
 */
async function adoptLegacyDeviceForInstallation(
  ctx: ServiceContext,
  userId: string,
  info: DeviceInfo & { readonly installationId: string },
): Promise<string | null> {
  const candidates = await ctx.db
    .select({ id: devices.id })
    .from(devices)
    .where(
      and(
        eq(devices.userId, userId),
        eq(devices.name, info.name),
        eq(devices.platform, info.platform),
        isNull(devices.installationId),
        isNull(devices.revokedAt),
      ),
    )
    .orderBy(desc(devices.createdAt))
    .limit(1)

  const legacy = candidates[0]
  if (!legacy) return null

  try {
    const adopted = await ctx.db
      .update(devices)
      .set({ installationId: info.installationId })
      .where(
        and(eq(devices.id, legacy.id), isNull(devices.installationId), isNull(devices.revokedAt)),
      )
      .returning({ id: devices.id })

    return adopted[0]?.id ?? null
  } catch (error) {
    if (!isActiveInstallationConflict(error)) throw error

    // Instalasi yang SAMA menang lebih dulu pada baris lama yang lain (dua login paralel, user punya
    // lebih dari satu baris legacy). Baris aktif yang memegang nilai itu sudah ada - pakai baris itu;
    // melempar 500 di sini akan menggagalkan login yang sebenarnya sudah "selesai" di request lain.
    return await findActiveDeviceIdByInstallation(ctx, userId, info.installationId)
  }
}

/**
 * Perangkat untuk login ini.
 *
 * URUTAN pencocokan (task #80) - urutannya yang bikin perbaikan ini aman untuk pengguna lama:
 *
 * 1. `installationId` cocok dengan perangkat AKTIF milik user -> pakai ulang baris itu. Ini kasus
 *    normal: satu instalasi = satu baris, jadi login berikutnya tidak menumpuk baris dan rotasi sesi
 *    (`issueSession`) hanya mematikan sesi INSTALASI ITU.
 * 2. Belum ada, tapi ada perangkat aktif bernama + platform sama yang `installation_id`-nya masih
 *    NULL -> ADOPSI baris lama (isi kolomnya) dan pakai ulang. Ini jalur upgrade: pengguna lama tidak
 *    mendapat baris duplikat, dan instalasi yang berbeda tidak pernah "mencuri" baris yang sudah
 *    punya pemilik.
 * 3. Belum ada juga -> baris BARU. Dua instalasi berbeda (dua mesin, atau dua profil browser di mesin
 *    yang sama) memang harus jadi dua baris: kalau digabung, login di profil kedua me-revoke sesi
 *    profil pertama - persis bug yang diperbaiki di sini.
 * 4. Tanpa `installationId` (build lama) -> heuristik lama `name` + `platform` tanpa menyaring
 *    `installation_id`. Sengaja dipertahankan: klien yang belum bisa membedakan instalasi tidak boleh
 *    tiba-tiba kehabisan jatah perangkat setiap kali login.
 *
 * Kalau tidak ada yang cocok, batas `MAX_ACTIVE_DEVICES_PER_USER` ditegakkan per BARIS (bukan per
 * mesin) dan kegagalannya memakai kode `DEVICE_LIMIT_REACHED` (`409`, kontrak). Kode khusus ini
 * penting supaya client bisa menyuruh user menghapus salah satu perangkat - `FORBIDDEN` hanya bilang
 * "tidak boleh" tanpa jalan keluar. Pemeriksaan + INSERT-nya ATOMIK (advisory lock per user, lihat
 * `createDeviceWithinLimit`): dua login paralel dari instalasi berbeda tidak bisa melampaui batas.
 *
 * Balapan dua login dengan `installationId` yang SAMA dijaga dua lapis: unique partial index
 * `uq_devices_user_installation_active` di DB dan `ON CONFLICT DO NOTHING` saat INSERT. Yang kalah
 * tidak melempar 500 dan tidak membuat baris kembar - ia memakai baris yang menang (idempoten), dan
 * itulah yang membuat gejala task #80 tidak bisa muncul lagi untuk pasangan baris kembar.
 */
export async function resolveDeviceForLogin(
  ctx: ServiceContext,
  userId: string,
  info: DeviceInfo,
): Promise<string> {
  for (let attempt = 0; attempt < RESOLVE_ATTEMPTS; attempt += 1) {
    const resolved = await resolveDeviceOnce(ctx, userId, info)
    if (resolved) return resolved
  }

  // Tidak tercapai dalam praktik: `null` hanya berarti "kalah balapan, lalu baris pemenang di-revoke
  // sebelum sempat dibaca". Dua percobaan menutup jendela itu; kalau masih gagal, lebih baik 500
  // (client boleh coba lagi) daripada mengembalikan id perangkat yang tidak ada.
  throw apiProblem('INTERNAL')
}

/** Satu putaran penyelesaian perangkat. `null` = kalah balapan, pemanggil boleh mengulang. */
async function resolveDeviceOnce(
  ctx: ServiceContext,
  userId: string,
  info: DeviceInfo,
): Promise<string | null> {
  const installationId = info.installationId

  const reused = installationId
    ? ((await findActiveDeviceIdByInstallation(ctx, userId, installationId)) ??
      (await adoptLegacyDeviceForInstallation(ctx, userId, { ...info, installationId })))
    : await findActiveDeviceIdByNamePlatform(ctx, userId, info)

  if (reused) return touchDevice(ctx, reused)

  return await createDeviceWithinLimit(ctx, userId, info)
}

type Transaction = Parameters<Parameters<ServiceContext['db']['transaction']>[0]>[0]

/** Perangkat AKTIF user ini untuk satu nilai `installation_id`, di dalam transaksi pemanggil. */
async function findActiveDeviceIdByInstallationInTx(
  tx: Transaction,
  userId: string,
  installationId: string,
): Promise<string | null> {
  const rows = await tx
    .select({ id: devices.id })
    .from(devices)
    .where(
      and(
        eq(devices.userId, userId),
        eq(devices.installationId, installationId),
        isNull(devices.revokedAt),
      ),
    )
    .orderBy(desc(devices.createdAt))
    .limit(1)

  return rows[0]?.id ?? null
}

/** Perangkat AKTIF user ini dengan nama + platform sama, di dalam transaksi pemanggil. */
async function findActiveDeviceIdByNamePlatformInTx(
  tx: Transaction,
  userId: string,
  info: DeviceInfo,
): Promise<string | null> {
  const rows = await tx
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

  return rows[0]?.id ?? null
}

/**
 * Buat perangkat BARU dengan batas 10 ditegakkan secara ATOMIK.
 *
 * Kenapa tidak boleh `SELECT count` lalu `INSERT` di luar transaksi (temuan task #81): dua login
 * paralel dari instalasi BERBEDA sama-sama membaca "9 perangkat aktif", sama-sama lolos, lalu
 * sama-sama INSERT - jumlahnya jadi 11. Pemeriksaan di level aplikasi tidak bisa menutup jendela itu.
 *
 * Kuncinya advisory lock per user (`pg_advisory_xact_lock`), bukan `SERIALIZABLE`: seluruh login user
 * itu diserialkan hanya pada langkah pembuatan baris (beberapa milidetik), sementara jalur baca
 * (daftar perangkat, cek sesi) tetap paralel. Lock dilepas otomatis saat transaksi selesai, jadi
 * request yang crash tidak meninggalkan lock menggantung. Lock-nya per DATABASE (bukan per pod),
 * jadi tetap benar kalau API dilayani lebih dari satu instance.
 *
 * Di dalam lock, pencarian "sudah ada?" DIULANG. Tanpa itu, login kedua dengan instalasi yang SAMA
 * akan melihat count sudah 10 (baris pemenang baru saja masuk) lalu ditolak `DEVICE_LIMIT_REACHED`
 * padahal seharusnya memakai baris yang menang - perilaku idempoten yang dijaga test #80.
 */
async function createDeviceWithinLimit(
  ctx: ServiceContext,
  userId: string,
  info: DeviceInfo,
): Promise<string | null> {
  const installationId = info.installationId

  return await ctx.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`devices:${userId}`}))`)

    const reused = installationId
      ? await findActiveDeviceIdByInstallationInTx(tx, userId, installationId)
      : await findActiveDeviceIdByNamePlatformInTx(tx, userId, info)

    if (reused) {
      await tx.update(devices).set({ lastSeenAt: ctx.now }).where(eq(devices.id, reused))
      return reused
    }

    const rows = await tx
      .select({ total: count() })
      .from(devices)
      .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)))

    const active = rows[0]?.total ?? 0
    if (active >= MAX_ACTIVE_DEVICES) throw apiProblem('DEVICE_LIMIT_REACHED')

    const deviceId = uuidv7(ctx.now.getTime())
    const inserted = await tx
      .insert(devices)
      .values({
        id: deviceId,
        userId,
        name: info.name,
        platform: info.platform,
        installationId: installationId ?? null,
        createdAt: ctx.now,
        lastSeenAt: ctx.now,
      })
      // Target + predikat sama dengan index partial-nya: `DO NOTHING` HANYA meredam konflik index itu.
      // Konflik lain (mis. tabrakan primary key) tetap dilempar - bukan sesuatu yang boleh ditelan.
      // Klien lama (`installationId` NULL) tidak pernah cocok dengan predikat ini, jadi tetap INSERT.
      .onConflictDoNothing({
        target: [devices.userId, devices.installationId],
        where: sql`${devices.installationId} is not null and ${devices.revokedAt} is null`,
      })
      .returning({ id: devices.id })

    const insertedId = inserted[0]?.id
    if (insertedId) return insertedId

    // Kalah balapan: baris aktif dengan instalasi yang sama sudah dibuat request lain. Pakai baris itu
    // (idempoten), jangan buat baris kedua dan jangan melempar - kedua login memang berhasil.
    if (!installationId) return null

    const winner = await findActiveDeviceIdByInstallationInTx(tx, userId, installationId)
    if (!winner) return null

    await tx.update(devices).set({ lastSeenAt: ctx.now }).where(eq(devices.id, winner))
    return winner
  })
}

/** Catat aktivitas terakhir lalu kembalikan id-nya. */
async function touchDevice(ctx: ServiceContext, deviceId: string): Promise<string> {
  await ctx.db.update(devices).set({ lastSeenAt: ctx.now }).where(eq(devices.id, deviceId))

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
    // `FOR UPDATE`: revoke dan penerbitan sesi (`issueSession`) harus antre pada baris perangkat yang
    // sama. Tanpa lock ini, revoke bisa membaca "masih aktif" sementara `issueSession` menyisipkan
    // sesi baru tepat setelahnya - sesi yang sudah pasti mati tapi tetap terbit (task #81).
    const owned = await tx
      .select({ id: devices.id, revokedAt: devices.revokedAt })
      .from(devices)
      .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)))
      .limit(1)
      .for('update')

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
