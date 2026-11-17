import { and, count, eq } from 'drizzle-orm'

import {
  LICENSE_PLANS,
  LICENSE_TOKEN_VERSION,
  type LicenseEdition,
  type LicensePlanId,
} from '@improve-personal/contracts'

import { licenseActivations, licenseGrants, licenses, users, type LicenseRow } from '../db/schema'
import { apiProblem } from '../utils/api-error'
import { createLicenseSigner } from '../utils/license-signing'
import { uuidv7 } from '../utils/uuid'
import type { ServiceContext } from './context'

/**
 * Lisensi prabayar (ADR 15 + ADR 16, ARCHITECTURE.md §8).
 *
 * Login (OTP/Google) hanya membuktikan pemilik email. Service ini yang memutuskan apakah email itu
 * sudah membeli, mencatat perangkat yang diaktivasi, lalu menerbitkan token bertanda tangan (paket +
 * akhir masa aktif) yang diverifikasi app secara offline. Tidak ada data isi aplikasi yang lewat sini.
 */

/** Edisi yang dijual saat ini. Kolom `licenses.edition` disiapkan untuk edisi lain nanti. */
const DEFAULT_EDITION: LicenseEdition = 'standard'

/**
 * Jatah perangkat super admin: operator memakai banyak browser/HP untuk uji, dan jatah pembeli (5)
 * akan cepat habis. Tetap ada batas supaya akun yang bocor tidak bisa mengaktivasi tanpa ujung.
 */
const SUPER_ADMIN_MAX_ACTIVATIONS = 50

const MS_PER_SECOND = 1_000
const MS_PER_DAY = 24 * 60 * 60 * MS_PER_SECOND

export type IssueLicenseTokenInput = {
  /** Email sesi (sudah dinormalkan `emailSchema`). Tidak pernah dari body request. */
  readonly email: string
  /** Perangkat sesi (`devices.id`). */
  readonly deviceId: string
}

/**
 * Terbitkan token lisensi untuk perangkat sesi ini.
 *
 * - Super admin (`users.role`) -> lisensi lifetime dibuat/dipulihkan otomatis, tanpa pembelian.
 * - Email belum membeli / lisensinya dicabut -> `LICENSE_REQUIRED`.
 * - Lisensi yang sudah habis tetap diberi token (dengan `exp` lampau): app menampilkannya sebagai
 *   baca-saja, bukan menolak login - data user tidak pernah disandera (ADR 16).
 * - Perangkat yang sudah pernah diaktivasi -> token baru tanpa memakai jatah lagi (login ulang,
 *   data situs dibersihkan, dst).
 * - Perangkat baru saat jatah habis -> `LICENSE_LIMIT_REACHED`.
 *
 * Baris lisensi dikunci (`FOR UPDATE`) selama hitung + sisip: tanpa itu dua perangkat yang aktivasi
 * bersamaan bisa sama-sama melihat sisa satu slot dan melewati batas.
 */
export async function issueLicenseToken(
  ctx: ServiceContext,
  input: IssueLicenseTokenInput,
): Promise<string> {
  const license = await ctx.db.transaction(async (tx) => {
    const [user] = await tx
      .select({ role: users.role })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1)
    if (user?.role === 'super_admin') {
      await tx
        .insert(licenses)
        .values({
          id: uuidv7(ctx.now.getTime()),
          email: input.email,
          plan: 'lifetime',
          expiresAt: null,
          maxActivations: SUPER_ADMIN_MAX_ACTIVATIONS,
          createdAt: ctx.now,
        })
        .onConflictDoUpdate({
          target: licenses.email,
          set: {
            plan: 'lifetime',
            expiresAt: null,
            revokedAt: null,
            maxActivations: SUPER_ADMIN_MAX_ACTIVATIONS,
          },
        })
    }

    const [active] = await tx
      .select()
      .from(licenses)
      .where(eq(licenses.email, input.email))
      .limit(1)
      .for('update')

    if (active === undefined || active.revokedAt !== null) throw apiProblem('LICENSE_REQUIRED')

    const [existing] = await tx
      .select({ deviceId: licenseActivations.deviceId })
      .from(licenseActivations)
      .where(
        and(
          eq(licenseActivations.licenseId, active.id),
          eq(licenseActivations.deviceId, input.deviceId),
        ),
      )
      .limit(1)
    if (existing !== undefined) return active

    const [usage] = await tx
      .select({ used: count() })
      .from(licenseActivations)
      .where(eq(licenseActivations.licenseId, active.id))
    if ((usage?.used ?? 0) >= active.maxActivations) throw apiProblem('LICENSE_LIMIT_REACHED')

    await tx
      .insert(licenseActivations)
      .values({ licenseId: active.id, deviceId: input.deviceId, activatedAt: ctx.now })

    return active
  })

  return signLicenseToken(ctx, license, input.deviceId)
}

/**
 * Token baru dengan `exp` terkini untuk perangkat yang SUDAH diaktivasi (ADR 16).
 *
 * Bukti kepemilikannya token lama itu sendiri: tanda tangan harus sah (kunci server ini), lalu
 * `(lid, did)` harus masih tercatat dan lisensinya tidak dicabut. Tidak memakai jatah perangkat dan
 * tidak butuh sesi login, jadi perpanjangan dari perangkat lain terbawa tanpa OTP ulang.
 */
export async function refreshLicenseToken(ctx: ServiceContext, token: string): Promise<string> {
  const payload = createLicenseSigner(ctx.env.licenseSigningKey).verify(token)
  if (payload === null) throw apiProblem('UNAUTHENTICATED')

  const [row] = await ctx.db
    .select({ license: licenses })
    .from(licenseActivations)
    .innerJoin(licenses, eq(licenses.id, licenseActivations.licenseId))
    .where(
      and(
        eq(licenseActivations.licenseId, payload.lid),
        eq(licenseActivations.deviceId, payload.did),
      ),
    )
    .limit(1)

  if (row === undefined || row.license.revokedAt !== null) throw apiProblem('LICENSE_REQUIRED')

  return signLicenseToken(ctx, row.license, payload.did)
}

function signLicenseToken(ctx: ServiceContext, license: LicenseRow, deviceId: string): string {
  return createLicenseSigner(ctx.env.licenseSigningKey).sign({
    v: LICENSE_TOKEN_VERSION,
    lid: license.id,
    did: deviceId,
    iat: Math.floor(ctx.now.getTime() / MS_PER_SECOND),
    ed: DEFAULT_EDITION,
    plan: license.plan,
    exp:
      license.expiresAt === null ? null : Math.floor(license.expiresAt.getTime() / MS_PER_SECOND),
  })
}

export type GrantLicenseInput = {
  readonly email: string
  /** Id transaksi (`purchases.id`) atau ref manual; mengulang `orderRef` yang sama tidak memperpanjang lagi. */
  readonly orderRef: string
  readonly plan: LicensePlanId
}

type LicenseTerm = Pick<LicenseRow, 'plan' | 'expiresAt'>

/**
 * Masa aktif setelah satu pembelian. Perpanjangan menumpuk dari sisa (`max(now, expiresAt)`), bukan
 * dari hari bayar, jadi perpanjang lebih awal tidak menghanguskan hari. Lifetime tidak pernah turun.
 */
export function extendLicenseTerm(
  current: LicenseTerm,
  plan: LicensePlanId,
  now: Date,
): LicenseTerm {
  const days = LICENSE_PLANS[plan].durationDays
  if (days === null || current.expiresAt === null) return { plan: 'lifetime', expiresAt: null }

  const from = Math.max(now.getTime(), current.expiresAt.getTime())
  return { plan, expiresAt: new Date(from + days * MS_PER_DAY) }
}

/**
 * Catat satu pembelian lunas dan perpanjang lisensi email itu. Idempoten per `orderRef`: webhook
 * yang dikirim ulang provider (atau skrip yang dijalankan dua kali) mengembalikan baris yang sama
 * tanpa memperpanjang lagi.
 *
 * Baris lisensi dikunci (`FOR UPDATE`) selama hitung + simpan: dua webhook paralel untuk email yang
 * sama tidak bisa saling menimpa perpanjangan.
 */
export async function grantLicense(
  ctx: ServiceContext,
  input: GrantLicenseInput,
): Promise<LicenseRow> {
  return ctx.db.transaction(async (tx) => {
    await tx
      .insert(licenses)
      .values({
        id: uuidv7(ctx.now.getTime()),
        email: input.email,
        plan: input.plan,
        // Baris baru = habis "sekarang"; perpanjangan di bawah menghitung dari titik ini, jadi
        // hasilnya sama dengan lisensi yang dibuat langsung dengan masa aktif penuh.
        expiresAt: ctx.now,
        createdAt: ctx.now,
      })
      .onConflictDoNothing({ target: licenses.email })

    const [license] = await tx
      .select()
      .from(licenses)
      .where(eq(licenses.email, input.email))
      .limit(1)
      .for('update')
    if (license === undefined) throw apiProblem('INTERNAL')

    const [granted] = await tx
      .insert(licenseGrants)
      .values({
        orderRef: input.orderRef,
        licenseId: license.id,
        plan: input.plan,
        grantedAt: ctx.now,
      })
      .onConflictDoNothing({ target: licenseGrants.orderRef })
      .returning({ orderRef: licenseGrants.orderRef })
    if (granted === undefined) return license

    const term = extendLicenseTerm(license, input.plan, ctx.now)

    const [updated] = await tx
      .update(licenses)
      .set(term)
      .where(eq(licenses.id, license.id))
      .returning()
    if (updated === undefined) throw apiProblem('INTERNAL')

    return updated
  })
}
