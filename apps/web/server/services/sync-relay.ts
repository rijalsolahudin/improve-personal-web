import { and, asc, eq, gt, inArray, isNull, lt, ne, sql } from 'drizzle-orm'

import {
  SYNC_DAILY_SEND_MAX_BYTES,
  SYNC_QUEUE_MAX_BYTES,
  SYNC_RELAY_TTL_DAYS,
  encodeSyncAuthMessage,
  type SyncClientMessage,
  type SyncRelayErrorCode,
} from '@improve-personal/contracts'

import type { ServerDatabase } from '../db/client'
import {
  devices,
  licenseActivations,
  licenses,
  syncExpired,
  syncFrames,
  syncPending,
  syncUsage,
  type LicenseRow,
} from '../db/schema'
import { verifyDeviceSignature } from '../utils/device-signature'
import { createLicenseSigner } from '../utils/license-signing'
import type { ServiceContext } from './context'

/**
 * Lapisan data relay sync (ADR 17, ARCHITECTURE.md §9): kuota, penyimpanan frame, antrean penerima,
 * ack, dan TTL. Tidak tahu soal WebSocket - itu urusan `sync-session.ts`.
 *
 * Yang dipegang di sini bukan isi apa pun: `bytes` adalah ciphertext segmen yang tidak pernah dibuka
 * server, dan tidak ada fungsi di berkas ini yang mem-parse, men-log, atau memeriksa isinya.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1_000

/**
 * Catatan "frame dibuang karena TTL" ditahan sampai perangkat tujuan connect lagi. Perangkat yang
 * tertinggal lebih lama dari masa simpan tombstone (90 hari, §9) wajib rebase dari snapshot, jadi
 * catatan yang lebih tua tidak punya arti lagi dan dibuang.
 */
const SYNC_EXPIRED_NOTE_RETENTION_DAYS = 90

/** Baris `sync_usage` hanya dipakai kuota hari ini + metrik biaya; sebulan lebih dari cukup. */
const SYNC_USAGE_RETENTION_DAYS = 35

/** Identitas perangkat yang sudah lolos auth relay: dari token lisensi bertanda tangan server. */
export type SyncPrincipal = {
  readonly licenseId: string
  readonly deviceId: string
}

export type SyncActivation = {
  readonly deviceSignPk: string | null
  /** Lisensi habis (ADR 16): menerima tetap jalan, mengirim ditolak. */
  readonly readOnly: boolean
  /** Epoch Sync Key terbaru yang diketahui relay untuk lisensi ini. */
  readonly epoch: number
}

type Executor = Pick<ServerDatabase, 'select'>

function isReadOnly(license: Pick<LicenseRow, 'expiresAt'>, now: Date): boolean {
  return license.expiresAt !== null && license.expiresAt.getTime() <= now.getTime()
}

/** Hari UTC (`YYYY-MM-DD`) untuk kuota harian. */
function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

async function selectActivation(
  executor: Executor,
  principal: SyncPrincipal,
  now: Date,
  options: { readonly lock: boolean },
): Promise<SyncActivation | null> {
  const query = executor
    .select({ license: licenses, deviceSignPk: licenseActivations.deviceSignPk })
    .from(licenseActivations)
    .innerJoin(licenses, eq(licenses.id, licenseActivations.licenseId))
    .innerJoin(devices, eq(devices.id, licenseActivations.deviceId))
    .where(
      and(
        eq(licenseActivations.licenseId, principal.licenseId),
        eq(licenseActivations.deviceId, principal.deviceId),
        isNull(licenses.revokedAt),
        isNull(devices.revokedAt),
      ),
    )
    .limit(1)

  const [row] = options.lock ? await query.for('update', { of: licenses }) : await query
  if (row === undefined) return null

  return {
    deviceSignPk: row.deviceSignPk,
    readOnly: isReadOnly(row.license, now),
    epoch: row.license.syncEpoch,
  }
}

/**
 * Aktivasi yang masih berlaku untuk perangkat ini, atau `null` kalau dicabut / lisensi dicabut /
 * perangkat di-revoke. Dipakai auth dan revalidasi koneksi yang sedang hidup.
 */
export async function findSyncActivation(
  ctx: ServiceContext,
  principal: SyncPrincipal,
): Promise<SyncActivation | null> {
  return selectActivation(ctx.db, principal, ctx.now, { lock: false })
}

export type SyncAuthInput = {
  readonly token: string
  readonly sig: string
  /** Nonce yang server kirim di `challenge` untuk koneksi ini. */
  readonly nonce: string
}

export type SyncAuthResult = {
  readonly principal: SyncPrincipal
  readonly activation: SyncActivation
}

/**
 * Challenge-response auth relay: token lisensi (bertanda tangan server) menyebut `(lid, did)`, dan
 * tanda tangan nonce dengan Device Sign Key membuktikan pemegang token memang perangkat itu - token
 * saja bukan rahasia (ARCHITECTURE.md §7).
 *
 * Semua kegagalan (token salah, aktivasi dicabut, belum punya kunci, tanda tangan salah) sama-sama
 * `null`: pemanggil tidak boleh membedakannya ke client.
 */
export async function authenticateSyncDevice(
  ctx: ServiceContext,
  input: SyncAuthInput,
): Promise<SyncAuthResult | null> {
  const payload = createLicenseSigner(ctx.env.licenseSigningKey).verify(input.token)
  if (payload === null) return null

  const principal: SyncPrincipal = { licenseId: payload.lid, deviceId: payload.did }
  const activation = await findSyncActivation(ctx, principal)
  if (activation === null || activation.deviceSignPk === null) return null

  const message = encodeSyncAuthMessage(input.nonce, principal.licenseId, principal.deviceId)
  if (!verifyDeviceSignature(activation.deviceSignPk, message, input.sig)) return null

  return { principal, activation }
}

export type SyncSendMessage = Extract<SyncClientMessage, { t: 'send' }>

export type AcceptFrameFailure = Extract<
  SyncRelayErrorCode,
  'unauthenticated' | 'license_read_only' | 'epoch_stale' | 'quota_daily' | 'quota_queue'
>

export type AcceptFrameResult =
  | {
      readonly ok: true
      readonly frameId: number
      /** Perangkat yang harus menerima frame ini (kosong = tidak ada penerima, frame tidak disimpan). */
      readonly recipients: readonly string[]
      readonly size: number
    }
  | { readonly ok: false; readonly code: AcceptFrameFailure }

/**
 * Terima satu frame dari perangkat: cek lisensi/epoch/kuota, simpan ciphertext, catat penerima.
 *
 * Satu transaksi dengan baris lisensi dikunci (`FOR UPDATE`): dua perangkat yang mengirim bersamaan
 * tidak bisa sama-sama melihat sisa kuota yang sama lalu melewatinya, dan kenaikan epoch tidak bisa
 * saling menimpa. Penerima = aktivasi lisensi lain (selain pengirim) saat frame diterima; `to`
 * (snapshot unicast) menyempitkannya ke satu perangkat, dan `to` yang bukan perangkat lisensi ini
 * berarti tidak ada penerima (diam-diam, supaya tidak bisa dipakai menebak perangkat lisensi lain).
 */
export async function acceptSyncFrame(
  ctx: ServiceContext,
  principal: SyncPrincipal,
  message: SyncSendMessage,
  bytes: Buffer,
): Promise<AcceptFrameResult> {
  const size = bytes.length
  const day = utcDay(ctx.now)

  return ctx.db.transaction(async (tx): Promise<AcceptFrameResult> => {
    const activation = await selectActivation(tx, principal, ctx.now, { lock: true })
    if (activation === null) return { ok: false, code: 'unauthenticated' }
    if (activation.readOnly) return { ok: false, code: 'license_read_only' }
    if (message.epoch < activation.epoch) return { ok: false, code: 'epoch_stale' }

    const [usage] = await tx
      .select({ bytesIn: syncUsage.bytesIn })
      .from(syncUsage)
      .where(and(eq(syncUsage.licenseId, principal.licenseId), eq(syncUsage.day, day)))
    if ((usage?.bytesIn ?? 0) + size > SYNC_DAILY_SEND_MAX_BYTES) {
      return { ok: false, code: 'quota_daily' }
    }

    const [queued] = await tx
      .select({ total: sql<number>`coalesce(sum(${syncFrames.size}), 0)` })
      .from(syncFrames)
      .where(eq(syncFrames.licenseId, principal.licenseId))
    if (Number(queued?.total ?? 0) + size > SYNC_QUEUE_MAX_BYTES) {
      return { ok: false, code: 'quota_queue' }
    }

    if (message.epoch > activation.epoch) {
      await tx
        .update(licenses)
        .set({ syncEpoch: message.epoch })
        .where(eq(licenses.id, principal.licenseId))
    }

    const recipientRows = await tx
      .select({ deviceId: licenseActivations.deviceId })
      .from(licenseActivations)
      .innerJoin(devices, eq(devices.id, licenseActivations.deviceId))
      .where(
        and(
          eq(licenseActivations.licenseId, principal.licenseId),
          ne(licenseActivations.deviceId, principal.deviceId),
          isNull(devices.revokedAt),
          message.to === null ? undefined : eq(licenseActivations.deviceId, message.to),
        ),
      )
    const recipients = recipientRows.map((row) => row.deviceId)

    await tx
      .insert(syncUsage)
      .values({ licenseId: principal.licenseId, day, bytesIn: size })
      .onConflictDoUpdate({
        target: [syncUsage.licenseId, syncUsage.day],
        set: { bytesIn: sql`${syncUsage.bytesIn} + ${size}` },
      })

    // Id diambil dari sequence meski tidak ada penerima: `accepted` butuh id, tetapi frame yang tidak
    // akan dibaca siapa pun tidak boleh menumpuk di tabel.
    const [reserved] = await tx.execute<{ id: number }>(
      sql`select nextval(pg_get_serial_sequence('sync_frames', 'id')) as id`,
    )
    if (reserved === undefined) throw new Error('sequence sync_frames tidak mengembalikan id')
    const frameId = Number(reserved.id)

    if (recipients.length > 0) {
      await tx.insert(syncFrames).values({
        id: frameId,
        licenseId: principal.licenseId,
        senderDeviceId: principal.deviceId,
        epoch: message.epoch,
        seq: message.seq,
        bytes,
        size,
        createdAt: ctx.now,
      })
      await tx.insert(syncPending).values(recipients.map((deviceId) => ({ deviceId, frameId })))
    }

    return { ok: true, frameId, recipients, size }
  })
}

export type PendingFrame = {
  readonly id: number
  readonly from: string
  readonly epoch: number
  readonly seq: number | null
  readonly bytes: Buffer
}

/** Satu halaman frame yang menunggu perangkat ini, urut id naik, mulai setelah `afterId`. */
export async function listPendingFrames(
  ctx: ServiceContext,
  deviceId: string,
  afterId: number,
  limit: number,
): Promise<PendingFrame[]> {
  const rows = await ctx.db
    .select({
      id: syncFrames.id,
      from: syncFrames.senderDeviceId,
      epoch: syncFrames.epoch,
      seq: syncFrames.seq,
      bytes: syncFrames.bytes,
    })
    .from(syncPending)
    .innerJoin(syncFrames, eq(syncFrames.id, syncPending.frameId))
    .where(and(eq(syncPending.deviceId, deviceId), gt(syncFrames.id, afterId)))
    .orderBy(asc(syncFrames.id))
    .limit(limit)

  return rows
}

/**
 * Ack: buang perangkat ini dari penerima, lalu hapus frame yang penerimanya sudah kosong.
 *
 * Hanya baris `sync_pending` MILIK perangkat ini yang bisa dihapus (id milik perangkat/lisensi lain
 * diabaikan diam-diam - tidak ada IDOR). Frame dikunci lebih dulu (urut id, anti deadlock): tanpa itu
 * dua penerima yang ack bersamaan sama-sama melihat penerima lain masih ada, dan frame tertinggal
 * sampai TTL.
 */
export async function ackSyncFrames(
  ctx: ServiceContext,
  principal: SyncPrincipal,
  ids: readonly number[],
): Promise<number> {
  return ctx.db.transaction(async (tx) => {
    const locked = await tx
      .select({ id: syncFrames.id })
      .from(syncFrames)
      .where(and(inArray(syncFrames.id, [...ids]), eq(syncFrames.licenseId, principal.licenseId)))
      .orderBy(asc(syncFrames.id))
      .for('update')
    if (locked.length === 0) return 0

    const lockedIds = locked.map((row) => row.id)
    const removed = await tx
      .delete(syncPending)
      .where(
        and(eq(syncPending.deviceId, principal.deviceId), inArray(syncPending.frameId, lockedIds)),
      )
      .returning({ frameId: syncPending.frameId })
    if (removed.length === 0) return 0

    await tx.delete(syncFrames).where(
      and(
        inArray(
          syncFrames.id,
          removed.map((row) => row.frameId),
        ),
        sql`not exists (select 1 from ${syncPending} where ${syncPending.frameId} = ${syncFrames.id})`,
      ),
    )

    return removed.length
  })
}

export type ExpiredNotice = { readonly from: string; readonly upToSeq: number }

/**
 * Ambil dan kosongkan catatan "frame dari X dibuang karena TTL" untuk perangkat ini. Dihapus saat
 * dibaca: ini hanya percepatan - celah `seq` di sisi penerima tetap penentu akhir (§9 "Celah").
 */
export async function takeExpiredNotices(
  ctx: ServiceContext,
  deviceId: string,
): Promise<ExpiredNotice[]> {
  const rows = await ctx.db
    .delete(syncExpired)
    .where(eq(syncExpired.deviceId, deviceId))
    .returning({ from: syncExpired.fromDeviceId, upToSeq: syncExpired.upToSeq })

  return rows
}

/** Catat byte yang dikirim ke penerima (metrik biaya, tanpa isi). Gagal mencatat tidak boleh memutus kirim. */
export async function recordBytesOut(
  ctx: ServiceContext,
  licenseId: string,
  bytes: number,
): Promise<void> {
  await ctx.db
    .insert(syncUsage)
    .values({ licenseId, day: utcDay(ctx.now), bytesOut: bytes })
    .onConflictDoUpdate({
      target: [syncUsage.licenseId, syncUsage.day],
      set: { bytesOut: sql`${syncUsage.bytesOut} + ${bytes}` },
    })
}

export type SyncPurgeSummary = {
  readonly frames: number
  readonly expiredNotes: number
  readonly usageRows: number
}

/**
 * Pembersih berkala relay (task terjadwal): frame lewat `SYNC_RELAY_TTL_DAYS` dibuang, dan untuk
 * tiap penerima yang belum ack dicatat `(pengirim, seq tertinggi)` di `sync_expired` supaya perangkat
 * itu diberi tahu saat connect (`ready.expired`). Hanya frame delta (`seq` ada) yang dicatat; snapshot
 * yang hangus cukup diminta ulang. Idempoten, aman jalan dua proses sekaligus.
 */
export async function purgeSyncRelay(ctx: ServiceContext): Promise<SyncPurgeSummary> {
  const frameCutoff = new Date(ctx.now.getTime() - SYNC_RELAY_TTL_DAYS * MS_PER_DAY)
  const noteCutoff = new Date(ctx.now.getTime() - SYNC_EXPIRED_NOTE_RETENTION_DAYS * MS_PER_DAY)
  const usageCutoff = utcDay(new Date(ctx.now.getTime() - SYNC_USAGE_RETENTION_DAYS * MS_PER_DAY))

  return ctx.db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into ${syncExpired} (device_id, from_device_id, up_to_seq, noted_at)
      select p.device_id, f.sender_device_id, max(f.seq), ${ctx.now.toISOString()}::timestamptz
      from ${syncFrames} f
      join ${syncPending} p on p.frame_id = f.id
      where f.created_at < ${frameCutoff.toISOString()}::timestamptz and f.seq is not null
      group by p.device_id, f.sender_device_id
      on conflict (device_id, from_device_id) do update
        set up_to_seq = greatest(${syncExpired.upToSeq}, excluded.up_to_seq),
            noted_at = excluded.noted_at
    `)

    const frames = await tx
      .delete(syncFrames)
      .where(lt(syncFrames.createdAt, frameCutoff))
      .returning({ id: syncFrames.id })
    const notes = await tx
      .delete(syncExpired)
      .where(lt(syncExpired.notedAt, noteCutoff))
      .returning({ deviceId: syncExpired.deviceId })
    const usage = await tx
      .delete(syncUsage)
      .where(lt(syncUsage.day, usageCutoff))
      .returning({ licenseId: syncUsage.licenseId })

    return { frames: frames.length, expiredNotes: notes.length, usageRows: usage.length }
  })
}
