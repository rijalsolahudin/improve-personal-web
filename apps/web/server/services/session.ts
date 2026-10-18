import type { ClientKind, DeviceInfo, SessionDto } from '@improve-personal/contracts'
import { and, eq, isNull, lt } from 'drizzle-orm'

import { devices, sessions, users } from '../db/schema'
import { createSessionToken, sha256Hex } from '../utils/crypto'
import { uuidv7 } from '../utils/uuid'
import type { ServiceContext } from './context'
import { resolveDeviceForLogin } from './device'

/**
 * Sesi: token opaque per perangkat, server cuma menyimpan hash.
 *
 * Kenapa token opaque dan bukan JWT panjang (`apps/web/docs/server.dbml` `sessions`): revoke harus
 * INSTAN. Access token berumur panjang tidak bisa dicabut - menghapus sesi di DB tidak mengubah
 * token yang sudah ditandatangani. Dengan token opaque, satu `UPDATE` cukup.
 *
 * Umur sesi: idle 30 hari, absolut 180 hari. Idle diperpanjang saat dipakai, ABSOLUT tidak pernah -
 * itu yang membatasi sesi yang diambil alih: selama token dipakai, ia tidak hidup selamanya.
 */

const DAY_MS = 86_400_000

/** Idle: sesi mati kalau tidak dipakai selama ini. */
const SESSION_IDLE_DAYS = 30

/** Absolut: batas keras sejak `created_at`, tidak pernah diperpanjang. */
const SESSION_ABSOLUTE_DAYS = 180

/** `last_used_at`/`last_seen_at` di-update paling sering sekali per 5 menit, bukan tiap request. */
const TOUCH_INTERVAL_MS = 5 * 60_000

export type IssuedSession = {
  readonly sessionId: string
  readonly token: string
  readonly expiresAt: Date
}

export type AuthenticatedSession = {
  readonly sessionId: string
  readonly userId: string
  readonly deviceId: string
  readonly client: ClientKind
  readonly expiresAt: Date
  readonly email: string
  readonly deviceName: string
}

function idleExpiry(now: Date, createdAt: Date): Date {
  const idle = now.getTime() + SESSION_IDLE_DAYS * DAY_MS
  const absolute = createdAt.getTime() + SESSION_ABSOLUTE_DAYS * DAY_MS
  return new Date(Math.min(idle, absolute))
}

/**
 * Terbitkan sesi untuk perangkat ini.
 *
 * Rotasi sesi saat login: sesi aktif lain untuk perangkat + client yang sama di-revoke lebih dulu.
 * Tanpa rotasi, sesi lama tetap hidup setelah login ulang - dan itu justru sesi yang paling mungkin
 * sudah bocor (mis. dari perangkat bersama).
 */
export async function issueSession(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly deviceId: string; readonly client: ClientKind },
): Promise<IssuedSession> {
  const token = createSessionToken()
  const sessionId = uuidv7(ctx.now.getTime())
  const expiresAt = idleExpiry(ctx.now, ctx.now)

  await ctx.db.transaction(async (tx) => {
    await tx
      .update(sessions)
      .set({ revokedAt: ctx.now })
      .where(
        and(
          eq(sessions.deviceId, input.deviceId),
          eq(sessions.client, input.client),
          isNull(sessions.revokedAt),
        ),
      )

    await tx.insert(sessions).values({
      id: sessionId,
      userId: input.userId,
      deviceId: input.deviceId,
      tokenHash: sha256Hex(token),
      client: input.client,
      createdAt: ctx.now,
      lastUsedAt: ctx.now,
      expiresAt,
    })
  })

  return { sessionId, token, expiresAt }
}

/**
 * Sesi dari token mentah, atau `null` kalau tidak valid.
 *
 * Satu query join: `sessions.token_hash` unique dan jadi jalur panas tiap request, jadi tidak boleh
 * dipecah jadi beberapa round trip. Sesi yang di-revoke atau kedaluwarsa tidak pernah lolos.
 */
export async function findSessionByToken(
  ctx: ServiceContext,
  rawToken: string,
): Promise<AuthenticatedSession | null> {
  const rows = await ctx.db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      deviceId: sessions.deviceId,
      client: sessions.client,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
      expiresAt: sessions.expiresAt,
      email: users.email,
      deviceName: devices.name,
      deviceRevokedAt: devices.revokedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(devices, eq(devices.id, sessions.deviceId))
    .where(and(eq(sessions.tokenHash, sha256Hex(rawToken)), isNull(sessions.revokedAt)))
    .limit(1)

  const row = rows[0]
  if (!row) return null
  // Perangkat yang di-revoke mematikan sesinya, bahkan kalau baris sesi belum sempat ditandai.
  if (row.deviceRevokedAt) return null
  if (row.expiresAt.getTime() <= ctx.now.getTime()) return null

  await touchSession(ctx, row)

  return {
    sessionId: row.sessionId,
    userId: row.userId,
    deviceId: row.deviceId,
    client: row.client,
    expiresAt: row.expiresAt,
    email: row.email,
    deviceName: row.deviceName,
  }
}

export type SessionLivenessRow = {
  readonly sessionId: string
  readonly deviceId: string
  readonly createdAt: Date
  readonly lastUsedAt: Date
}

/**
 * Perpanjang idle + catat aktivitas terakhir - tapi throttled.
 *
 * Kalau ini jalan tiap request, dua `UPDATE` per request masuk ke tabel yang paling sering ditulis di
 * sistem ini (jalur panas), dan hasilnya cuma timestamp yang bergeser beberapa milidetik. Karena itu
 * UPDATE-nya dikunci `last_used_at < now - 5 menit`, jadi request kedua dan seterusnya dalam jendela
 * itu tidak menulis apa pun. Dua statement dikirim paralel (`Promise.all`) karena tidak saling
 * bergantung.
 */
async function touchSession(ctx: ServiceContext, row: SessionLivenessRow): Promise<void> {
  const threshold = new Date(ctx.now.getTime() - TOUCH_INTERVAL_MS)
  if (row.lastUsedAt.getTime() > threshold.getTime()) return

  const expiresAt = idleExpiry(ctx.now, row.createdAt)

  await Promise.all([
    ctx.db
      .update(sessions)
      .set({ lastUsedAt: ctx.now, expiresAt })
      .where(and(eq(sessions.id, row.sessionId), lt(sessions.lastUsedAt, threshold))),
    ctx.db
      .update(devices)
      .set({ lastSeenAt: ctx.now })
      .where(and(eq(devices.id, row.deviceId), lt(devices.lastSeenAt, threshold))),
  ])
}

/** Batalkan sesi ini (logout), dengan cek kepemilikan: sesi user lain tidak mungkin dibatalkan. */
export async function revokeSession(
  ctx: ServiceContext,
  userId: string,
  sessionId: string,
): Promise<void> {
  await ctx.db
    .update(sessions)
    .set({ revokedAt: ctx.now })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
}

/**
 * DTO sesi sesuai bentuk kontrak (`sessionDtoSchema`, discriminated union atas `client`).
 *
 * Token HANYA ikut untuk client `mobile`. Untuk web, cookie `HttpOnly` sudah membawa sesi - token
 * yang ikut terkirim di body justru membuatnya bisa dibaca JavaScript, dan itu yang dihindari.
 */
export function buildSessionDto(input: {
  readonly userId: string
  readonly email: string
  readonly deviceId: string
  readonly deviceName: string
  readonly client: ClientKind
  readonly expiresAt: Date
  readonly token: string
}): SessionDto {
  const shared = {
    user: { id: input.userId, email: input.email },
    device: { id: input.deviceId, name: input.deviceName },
    expiresAt: input.expiresAt.toISOString(),
  }

  return input.client === 'web'
    ? { ...shared, client: 'web' }
    : { ...shared, client: 'mobile', token: input.token }
}

export type LoginResult = {
  readonly dto: SessionDto
  /** Token mentah: handler web memakainya untuk cookie, handler mobile membiarkannya di body DTO. */
  readonly token: string
}

/**
 * Login perangkat: daftarkan/pakai ulang perangkat, terbitkan sesi, susun DTO.
 *
 * Dipakai jalur OTP maupun Google SSO supaya kedua jalur tidak bisa berbeda soal batas perangkat,
 * rotasi sesi, atau bentuk DTO.
 */
export async function loginDevice(
  ctx: ServiceContext,
  input: {
    readonly userId: string
    readonly email: string
    readonly client: ClientKind
    readonly device: DeviceInfo
  },
): Promise<LoginResult> {
  const deviceId = await resolveDeviceForLogin(ctx, input.userId, input.device)
  const issued = await issueSession(ctx, {
    userId: input.userId,
    deviceId,
    client: input.client,
  })

  return {
    token: issued.token,
    dto: buildSessionDto({
      userId: input.userId,
      email: input.email,
      deviceId,
      deviceName: input.device.name,
      client: input.client,
      expiresAt: issued.expiresAt,
      token: issued.token,
    }),
  }
}
