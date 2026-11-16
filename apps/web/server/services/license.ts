import { and, asc, count, eq, isNull } from 'drizzle-orm'

import { LICENSE_TOKEN_VERSION, type LicenseEdition } from '@improve-personal/contracts'

import { licenseActivations, licenses, type LicenseRow } from '../db/schema'
import { apiProblem } from '../utils/api-error'
import { createLicenseSigner } from '../utils/license-signing'
import { uuidv7 } from '../utils/uuid'
import type { ServiceContext } from './context'

/**
 * Lisensi sekali beli (ADR 15, ARCHITECTURE.md §8).
 *
 * Login (OTP/Google) hanya membuktikan pemilik email. Service ini yang memutuskan apakah email itu
 * sudah membeli, mencatat perangkat yang diaktivasi, lalu menerbitkan token bertanda tangan yang
 * diverifikasi app secara offline. Tidak ada data isi aplikasi yang lewat sini.
 */

/** Edisi yang dijual saat ini. Kolom `licenses.edition` disiapkan untuk edisi lain nanti. */
const DEFAULT_EDITION: LicenseEdition = 'standard'

const MS_PER_SECOND = 1_000

export type IssueLicenseTokenInput = {
  /** Email sesi (sudah dinormalkan `emailSchema`). Tidak pernah dari body request. */
  readonly email: string
  /** Perangkat sesi (`devices.id`). */
  readonly deviceId: string
}

/**
 * Terbitkan token lisensi untuk perangkat sesi ini.
 *
 * - Email belum membeli / lisensinya dicabut -> `LICENSE_REQUIRED`.
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
    const [active] = await tx
      .select()
      .from(licenses)
      .where(and(eq(licenses.email, input.email), isNull(licenses.revokedAt)))
      .orderBy(asc(licenses.createdAt))
      .limit(1)
      .for('update')

    if (active === undefined) throw apiProblem('LICENSE_REQUIRED')

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

  return createLicenseSigner(ctx.env.licenseSigningKey).sign({
    v: LICENSE_TOKEN_VERSION,
    lid: license.id,
    did: input.deviceId,
    iat: Math.floor(ctx.now.getTime() / MS_PER_SECOND),
    ed: DEFAULT_EDITION,
  })
}

export type GrantLicenseInput = {
  readonly email: string
  /** Id transaksi payment provider; mengulang `orderRef` yang sama tidak membuat lisensi kedua. */
  readonly orderRef: string
}

/**
 * Catat pembelian. Idempoten per `orderRef`: webhook yang dikirim ulang provider (atau skrip yang
 * dijalankan dua kali) mengembalikan baris yang sama, bukan lisensi ganda.
 */
export async function grantLicense(
  ctx: ServiceContext,
  input: GrantLicenseInput,
): Promise<LicenseRow> {
  await ctx.db
    .insert(licenses)
    .values({
      id: uuidv7(ctx.now.getTime()),
      email: input.email,
      orderRef: input.orderRef,
      createdAt: ctx.now,
    })
    .onConflictDoNothing({ target: licenses.orderRef })

  const [row] = await ctx.db
    .select()
    .from(licenses)
    .where(eq(licenses.orderRef, input.orderRef))
    .limit(1)
  if (row === undefined) throw apiProblem('INTERNAL')

  return row
}
