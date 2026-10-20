// @vitest-environment node
//
// Persistensi countdown: model presentasi <-> record `countdown` core, lewat sesi data lokal nyata.
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import { createManualClock, type ManualClock } from '@improve-personal/core'

import type { Countdown } from '../countdown'
import { openLocalDataSession, type LocalDataSession } from '../storage/session'
import { loadCountdowns, persistCountdown, removeCountdown, toCoreCountdown } from './persistence'

const START_MS = 1_700_000_000_000
const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const TZ = 'Asia/Jakarta'

Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })

let counter = 0

function names() {
  counter += 1
  return {
    databaseName: `ip-countdown-test-${counter}`,
    keysDatabaseName: `ip-countdown-test-keys-${counter}`,
  }
}

type OpenSession = LocalDataSession & { readonly clock: ManualClock }

async function openSession(dbNames: ReturnType<typeof names>): Promise<OpenSession> {
  const clock = createManualClock(START_MS)
  const session = await openLocalDataSession({ userId: USER_ID, clock, ...dbNames })
  return { ...session, clock }
}

function countdown(session: LocalDataSession, overrides: Partial<Countdown> = {}): Countdown {
  return {
    id: session.newId(),
    title: 'Ulang tahun Ibu',
    date: '2026-12-24',
    time: '',
    emoji: '🎂',
    sticker: null,
    color: '#F03FBF',
    yearly: true,
    archived: false,
    ...overrides,
  }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('persistensi countdown', () => {
  it('simpan lalu muat: yearly, sepanjang hari, dan emoji kembali utuh', async () => {
    const session = await openSession(names())
    const saved = countdown(session)

    await persistCountdown(session, saved, TZ)

    expect(await loadCountdowns(session, TZ)).toEqual([saved])
  })

  it('sticker ASCII disimpan sebagai sticker, emoji sebagai emoji', async () => {
    const session = await openSession(names())
    const emoji = countdown(session, { title: 'Emoji', emoji: '🎉' })
    const sticker = countdown(session, { title: 'Sticker', sticker: 'cat-happy', emoji: '🎉' })

    await persistCountdown(session, emoji, TZ)
    await persistCountdown(session, sticker, TZ)

    const loaded = await loadCountdowns(session, TZ)
    expect(loaded.find((item) => item.title === 'Emoji')).toMatchObject({
      emoji: '🎉',
      sticker: null,
    })
    expect(loaded.find((item) => item.title === 'Sticker')).toMatchObject({
      sticker: 'cat-happy',
      emoji: '🎉',
    })
  })

  it('target dengan jam tidak dianggap sepanjang hari', async () => {
    const session = await openSession(names())
    const saved = countdown(session, { date: '2026-12-24', time: '19:30', yearly: false })

    const payload = toCoreCountdown(saved, TZ, START_MS)
    expect(payload).toMatchObject({ isAllDay: false, isYearly: false })
    await persistCountdown(session, saved, TZ)
    expect(await loadCountdowns(session, TZ)).toEqual([saved])
  })

  it('arsip menyimpan archivedAt, dan membatalkan arsip mengosongkannya lagi', async () => {
    const session = await openSession(names())
    const saved = countdown(session)

    session.clock.advance(5_000)
    await persistCountdown(session, { ...saved, archived: true }, TZ)
    const archived = (await session.repos.countdown.getById(saved.id))?.data as Record<
      string,
      unknown
    >
    expect(archived.archivedAt).toBe(START_MS + 5_000)

    await persistCountdown(session, { ...saved, archived: false }, TZ)
    const active = (await session.repos.countdown.getById(saved.id))?.data as Record<
      string,
      unknown
    >
    expect(active.archivedAt).toBeNull()
    expect(active.createdAt).toBe(START_MS + 5_000)
  })

  it('hapus countdown = tombstone, tidak muncul lagi setelah sesi dibuka ulang', async () => {
    const dbNames = names()
    const session = await openSession(dbNames)
    const saved = countdown(session)

    await persistCountdown(session, saved, TZ)
    await removeCountdown(session, saved.id)

    expect(await loadCountdowns(session, TZ)).toEqual([])
    expect(await loadCountdowns(await openSession(dbNames), TZ)).toEqual([])
  })

  it('tanggal asli tetap dipakai untuk yearly (bukan tanggal kejadian berikutnya)', async () => {
    const session = await openSession(names())
    const saved = countdown(session, { date: '2001-03-15', time: '', yearly: true })

    await persistCountdown(session, saved, TZ)
    const payload = (await session.repos.countdown.getById(saved.id))?.data as Record<
      string,
      unknown
    >
    expect(payload.isYearly).toBe(true)
    expect(payload.targetAt).toBe(new Date('2001-03-15T00:00:00+07:00').getTime())
    expect((await loadCountdowns(session, TZ))[0]?.date).toBe('2001-03-15')
  })
})
