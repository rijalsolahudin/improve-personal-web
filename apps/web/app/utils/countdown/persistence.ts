import {
  countdownSchema,
  fromLocalDateTime,
  localDateOf,
  localTimeOf,
  type Countdown as CoreCountdown,
} from '@improve-personal/core'

import { COUNTDOWN_COLORS, type Countdown } from '../countdown'
import { formatMinutes, toMinutes } from '../schedule'
import { createRepository } from '../storage/repository'
import type { LocalDataSession } from '../storage/session'

/**
 * Persistensi countdown: `Countdown` (UI) <-> record `countdown` core.
 *
 * Dua hal yang dipetakan secara eksplisit:
 * - `targetAt` menyimpan tanggal ASLI (bukan kejadian berikutnya), plus `isYearly`, supaya ulang
 *   tahun tetap bergulir ke tahun depan setelah lewat.
 * - `stickerId` adalah ikon: sticker bundled (ID ASCII) atau emoji, sesuai catatan DBML. Saat
 *   dimuat, icon ASCII dianggap sticker dan sisanya emoji.
 */

const DEFAULT_EMOJI = '🎉'
/** ID sticker bundled berupa slug ASCII; emoji pasti bukan ASCII. */
const STICKER_ID = /^[\x20-\x7e]+$/

function repository(session: LocalDataSession) {
  return createRepository<CoreCountdown>(session, 'countdown')
}

function targetAtOf(countdown: Countdown, tz: string): number {
  const minutes = countdown.time ? toMinutes(countdown.time) : 0
  return fromLocalDateTime({
    localDate: countdown.date,
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
    tz,
  })
}

export function toCoreCountdown(
  countdown: Countdown,
  tz: string,
  nowMs: number,
  previous?: CoreCountdown,
): CoreCountdown {
  const icon = countdown.sticker ?? countdown.emoji
  return {
    id: countdown.id,
    name: countdown.title,
    targetAt: targetAtOf(countdown, tz),
    color: countdown.color,
    stickerId: icon || null,
    isYearly: countdown.yearly,
    isAllDay: countdown.time === '',
    isArchived: countdown.archived,
    archivedAt: countdown.archived ? (previous?.archivedAt ?? nowMs) : null,
    createdAt: previous?.createdAt ?? nowMs,
    updatedAt: nowMs,
  }
}

export function fromCoreCountdown(payload: CoreCountdown, tz: string): Countdown {
  const time = localTimeOf(payload.targetAt, tz)
  const icon = payload.stickerId
  const isSticker = icon !== null && STICKER_ID.test(icon)

  return {
    id: payload.id,
    title: payload.name,
    date: localDateOf(payload.targetAt, tz),
    time: payload.isAllDay ? '' : formatMinutes(time.hour * 60 + time.minute),
    emoji: icon !== null && !isSticker ? icon : DEFAULT_EMOJI,
    sticker: isSticker ? icon : null,
    color: payload.color ?? COUNTDOWN_COLORS[0],
    yearly: payload.isYearly,
    archived: payload.isArchived,
  }
}

export async function loadCountdowns(session: LocalDataSession, tz: string): Promise<Countdown[]> {
  const records = await repository(session).listAll({ includeDeleted: false })
  return records.map((record) => fromCoreCountdown(countdownSchema.parse(record.data), tz))
}

export async function persistCountdown(
  session: LocalDataSession,
  countdown: Countdown,
  tz: string,
): Promise<void> {
  const existing = await repository(session).getById(countdown.id)
  const previous = existing === null ? undefined : countdownSchema.parse(existing.data)
  const targetAt = targetAtOf(countdown, tz)

  await session.writer.write({
    id: countdown.id,
    type: 'countdown',
    data: () => toCoreCountdown(countdown, tz, session.clock.nowMs(), previous),
    index: { rangeStartMs: targetAt, rangeEndMs: null },
  })
}

export async function removeCountdown(session: LocalDataSession, id: string): Promise<void> {
  await session.writer.remove({ id })
}
