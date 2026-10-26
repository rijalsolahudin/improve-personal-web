import type {
  ClientKind,
  CurrentSessionResult,
  DeviceInfo,
  SessionDto,
} from '@improve-personal/contracts'
import { and, eq, isNull, lt } from 'drizzle-orm'

import { devices, sessions, users } from '../db/schema'
import { apiProblem } from '../utils/api-error'
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

/**
 * Perangkat tidak lagi memenuhi syarat untuk menerbitkan sesi: barisnya sudah di-revoke, bukan milik
 * user ini, atau `installationId`-nya tidak cocok. Ini kegagalan INTERNAL antar-service (bukan kode
 * kontrak): satu-satunya pemanggil produksi, `loginDevice`, menangkapnya lalu menyelesaikan ulang
 * perangkat - sehingga client tidak pernah melihat error ini.
 */
export class DeviceNotActiveError extends Error {
  constructor() {
    super('perangkat tidak aktif untuk menerbitkan sesi')
    this.name = 'DeviceNotActiveError'
  }
}

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
 *
 * Validasi perangkat dilakukan DI DALAM transaksi yang sama dan dengan `FOR KEY SHARE` (task #81).
 * Alasan: `loginDevice` memilih/mengadopsi perangkat lebih dulu, lalu menerbitkan sesi. Kalau user
 * menekan "keluarkan perangkat" di tab lain tepat di antara dua langkah itu, tanpa validasi ini sesi
 * baru tetap disisipkan pada perangkat yang sudah mati - token terbit tetapi langsung ditolak
 * `findSessionByToken`. Lock baris membuat revoke dan penerbitan sesi antre: revoke yang menang lebih
 * dulu membuat langkah ini gagal (`DeviceNotActiveError`) dan TIDAK ada sesi yang terbit.
 *
 * Kenapa `KEY SHARE`, bukan `FOR UPDATE`: `revokeDevice` mengambil `FOR UPDATE` (konflik dengan KEY
 * SHARE, jadi keduanya tetap antre), sementara `touchSession` memperbarui `last_seen_at` tanpa transaksi
 * dengan `FOR NO KEY UPDATE` (kompatibel dengan KEY SHARE). Kalau di sini dipakai `FOR UPDATE`,
 * urutan lock-nya bertabrakan dengan `touchSession` (sesi dulu, lalu perangkat) dan bisa menghasilkan
 * deadlock di jalur panas.
 */
export async function issueSession(
  ctx: ServiceContext,
  input: {
    readonly userId: string
    readonly deviceId: string
    readonly client: ClientKind
    /** Nilai dari klien; dicek agar baris perangkat yang dipakai memang instalasi ini. */
    readonly installationId?: string | undefined
  },
): Promise<IssuedSession> {
  const token = createSessionToken()
  const sessionId = uuidv7(ctx.now.getTime())
  const expiresAt = idleExpiry(ctx.now, ctx.now)

  await ctx.db.transaction(async (tx) => {
    const active = await tx
      .select({ id: devices.id })
      .from(devices)
      .where(
        and(
          eq(devices.id, input.deviceId),
          eq(devices.userId, input.userId),
          isNull(devices.revokedAt),
          input.installationId === undefined
            ? undefined
            : eq(devices.installationId, input.installationId),
        ),
      )
      .limit(1)
      .for('key share')

    if (!active[0]) throw new DeviceNotActiveError()

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

/**
 * DTO "sesi yang SEDANG berlaku" (`currentSessionResultSchema`) dari sesi terautentikasi.
 *
 * Kenapa dipisah dari `buildSessionDto`, bukan sekadar memanggilnya dengan `client` yang diisi:
 * - `buildSessionDto` menyusun DTO HASIL LOGIN, dan kontraknya (`sessionDtoSchema`) adalah union atas
 *   `client` yang mewajibkan token untuk `mobile`. DTO itu memang harus membawa token - mobile
 *   menyimpannya di SecureStore saat login.
 * - Fungsi ini cuma MEMBACA sesi yang sudah ada (`GET /v1/auth/session`, dipanggil tiap muat halaman
 *   app). Kalau ia memakai `buildSessionDto`, parameter `token` wajib diisi sesuatu, dan nilai itulah
 *   yang akhirnya bocor ke body - padahal endpoint ini justru ada supaya klien web (yang tokennya di
 *   cookie `HttpOnly`) bisa tahu sesinya masih hidup TANPA pernah memegang token.
 *
 * Karena itu bentuknya sengaja diambil dari `currentSessionResultSchema`: tanpa `client`, tanpa
 * `token`, dan berlaku sama untuk web (cookie) maupun mobile (bearer). Yang tidak ada di sini tidak
 * bisa bocor ke respons, jadi `AuthenticatedSession` dipetakan field-per-field - bukan disebar
 * (`{...auth}`) yang akan ikut membawa `sessionId`/`userId`/`client`.
 */
export function sessionResultFrom(auth: AuthenticatedSession): CurrentSessionResult {
  return {
    user: { id: auth.userId, email: auth.email },
    device: { id: auth.deviceId, name: auth.deviceName },
    expiresAt: auth.expiresAt.toISOString(),
  }
}

export type LoginResult = {
  readonly dto: SessionDto
  /** Token mentah: handler web memakainya untuk cookie, handler mobile membiarkannya di body DTO. */
  readonly token: string
}

/**
 * Percobaan login sebelum menyerah. Dua cukup: kegagalan hanya berasal dari "perangkat di-revoke tepat
 * setelah dipilih", dan percobaan kedua memilih perangkat baru (baris revoked tidak pernah dipakai).
 */
const LOGIN_DEVICE_ATTEMPTS = 2

/**
 * Login perangkat: daftarkan/pakai ulang perangkat, terbitkan sesi, susun DTO.
 *
 * Dipakai jalur OTP maupun Google SSO supaya kedua jalur tidak bisa berbeda soal batas perangkat,
 * rotasi sesi, atau bentuk DTO.
 *
 * Kenapa ada pengulangan (task #81): `resolveDeviceForLogin` dan `issueSession` adalah dua langkah.
 * Kalau revoke menang di antara keduanya, `issueSession` menolak (tidak ada sesi yang terbit di atas
 * perangkat mati). Pilihan yang benar bagi user bukan 500: perangkat itu memang sudah "dikeluarkan",
 * jadi login ini harus berakhir sebagai perangkat BARU yang aktif - persis perilaku login setelah
 * revoke. Pengulangan menutup jendela itu tanpa melonggarkan validasi.
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
  for (let attempt = 0; attempt < LOGIN_DEVICE_ATTEMPTS; attempt += 1) {
    const deviceId = await resolveDeviceForLogin(ctx, input.userId, input.device)

    try {
      const issued = await issueSession(ctx, {
        userId: input.userId,
        deviceId,
        client: input.client,
        installationId: input.device.installationId,
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
    } catch (error) {
      if (!(error instanceof DeviceNotActiveError)) throw error
    }
  }

  // Tidak tercapai dalam praktik: hanya bisa terjadi kalau perangkat di-revoke dua kali berturut-turut
  // tepat di jendela sempit yang sama. Fail-closed dengan pesan generik lebih baik daripada
  // mengembalikan sesi yang tidak bisa dipakai.
  throw apiProblem('INTERNAL')
}
