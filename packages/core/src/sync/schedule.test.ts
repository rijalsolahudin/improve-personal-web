import { describe, expect, it } from 'vitest'

import { createManualClock } from '../adapters/clock.ts'
import { createMemoryStorage } from '../adapters/memory.ts'
import type { RecordVersion } from './merge.ts'
import { decideMerge, pickWinner } from './merge.ts'
import {
  SYNC_DEBOUNCE_MS,
  SYNC_FOREGROUND_INTERVAL_MS,
  dueSyncTriggers,
  shouldPullNow,
  syncDebounceRemainingMs,
} from './schedule.ts'
import { deriveSyncStatus, readSyncStatus } from './status.ts'
import { createHlcGenerator } from './hlc.ts'
import { buildRecordWrite, commitLocalWrite } from './outbox.ts'

/**
 * Jadwal sync (ARCHITECTURE.md §9) dan status yang dibaca UI.
 *
 * Semua fungsi di sini murni: waktu masuk lewat parameter, jadi jadwalnya bisa diuji tanpa menunggu
 * 2 detik/5 menit waktu nyata - dan tanpa `setTimeout` yang tidak bisa diprediksi di CI.
 */

const NOW = 1_700_000_000_000

describe('dueSyncTriggers', () => {
  it('offline: tidak ada pemicu sama sekali (outbox menumpuk, bukan error)', () => {
    expect(
      dueSyncTriggers({
        online: false,
        nowMs: NOW,
        appOpenedAtMs: NOW,
        lastWriteAtMs: NOW - 10_000,
        lastSyncAtMs: null,
        justReconnected: true,
      }),
    ).toEqual([])
  })

  it('app dibuka + baru kembali online: dua pemicu', () => {
    expect(
      dueSyncTriggers({
        online: true,
        nowMs: NOW,
        appOpenedAtMs: NOW,
        lastWriteAtMs: null,
        lastSyncAtMs: NOW,
        justReconnected: true,
      }),
    ).toEqual(['reconnect', 'app_open'])
  })

  it('setelah tulis: baru menyala setelah debounce lewat', () => {
    const justWrote = dueSyncTriggers({
      online: true,
      nowMs: NOW,
      lastWriteAtMs: NOW - 500,
      lastSyncAtMs: NOW,
    })
    expect(justWrote).not.toContain('after_write')

    const afterDebounce = dueSyncTriggers({
      online: true,
      nowMs: NOW,
      lastWriteAtMs: NOW - SYNC_DEBOUNCE_MS,
      lastSyncAtMs: NOW,
    })
    expect(afterDebounce).toContain('after_write')
  })

  it('interval foreground: menyala kalau belum pernah sync atau sudah lewat 5 menit', () => {
    expect(dueSyncTriggers({ online: true, nowMs: NOW, lastSyncAtMs: null })).toContain(
      'foreground_interval',
    )

    expect(dueSyncTriggers({ online: true, nowMs: NOW, lastSyncAtMs: NOW - 1_000 })).not.toContain(
      'foreground_interval',
    )

    expect(
      dueSyncTriggers({
        online: true,
        nowMs: NOW,
        lastSyncAtMs: NOW - SYNC_FOREGROUND_INTERVAL_MS,
      }),
    ).toContain('foreground_interval')
  })

  it('tanpa peristiwa apa pun: tidak ada pemicu', () => {
    expect(dueSyncTriggers({ online: true, nowMs: NOW, lastSyncAtMs: NOW - 1_000 })).toEqual([])
  })
})

describe('syncDebounceRemainingMs', () => {
  it('0 kalau belum ada tulis atau debounce sudah lewat', () => {
    expect(syncDebounceRemainingMs(NOW, null)).toBe(0)
    expect(syncDebounceRemainingMs(NOW, NOW - SYNC_DEBOUNCE_MS - 1)).toBe(0)
  })

  it('sisa waktu dihitung dari tulis terakhir', () => {
    expect(syncDebounceRemainingMs(NOW, NOW - 1_500)).toBe(500)
    expect(syncDebounceRemainingMs(NOW, NOW)).toBe(SYNC_DEBOUNCE_MS)
  })
})

describe('shouldPullNow', () => {
  it('tanpa pemicu: tidak ada pull', () => {
    expect(shouldPullNow({ triggers: [], lastSyncAtMs: null, nowMs: NOW })).toBe(false)
  })

  it('peristiwa penting (buka app / kembali online) selalu pull', () => {
    expect(shouldPullNow({ triggers: ['app_open'], lastSyncAtMs: NOW, nowMs: NOW })).toBe(true)
    expect(shouldPullNow({ triggers: ['reconnect'], lastSyncAtMs: NOW, nowMs: NOW })).toBe(true)
  })

  it('tulis lokal saja tidak perlu pull kalau baru saja sync', () => {
    expect(
      shouldPullNow({ triggers: ['after_write'], lastSyncAtMs: NOW - 1_000, nowMs: NOW }),
    ).toBe(false)
    expect(
      shouldPullNow({
        triggers: ['after_write'],
        lastSyncAtMs: NOW - SYNC_FOREGROUND_INTERVAL_MS,
        nowMs: NOW,
      }),
    ).toBe(true)
  })
})

describe('deriveSyncStatus', () => {
  it('prioritas: offline > error > pending > synced', () => {
    expect(deriveSyncStatus({ online: false, pendingCount: 3, hasError: true })).toBe('offline')
    expect(deriveSyncStatus({ online: true, pendingCount: 3, hasError: true })).toBe('error')
    expect(deriveSyncStatus({ online: true, pendingCount: 3, hasError: false })).toBe('pending')
    expect(deriveSyncStatus({ online: true, pendingCount: 0, hasError: false })).toBe('synced')
  })

  it('readSyncStatus membaca jumlah baris outbox', async () => {
    const clock = createManualClock(NOW)
    const storage = createMemoryStorage({ clock })
    const hlc = createHlcGenerator({ deviceId: 'devicea', clock })

    expect(await readSyncStatus({ storage, online: true })).toBe('synced')

    await commitLocalWrite({
      storage,
      write: buildRecordWrite({
        sealed: {
          id: '018f2c4e-0000-7000-8000-000000000001',
          hlc: hlc.tick(),
          deleted: false,
          blob: 'QUJD',
        },
        index: null,
        op: 'put',
        outbox: { id: 'outbox-1', queuedAtMs: clock.nowMs() },
      }),
    })

    expect(await readSyncStatus({ storage, online: true })).toBe('pending')
    expect(await readSyncStatus({ storage, online: false })).toBe('offline')
  })
})

describe('decideMerge (LWW)', () => {
  function version(n: number, deviceId = 'devicea', deleted = false): RecordVersion {
    return {
      id: '018f2c4e-0000-7000-8000-000000000001',
      hlc: `${NOW + n}-0-${deviceId}`,
      deleted,
    }
  }

  it('record lokal belum ada: versi masuk diterapkan', () => {
    expect(decideMerge(null, version(1))).toEqual({
      action: 'insert',
      reason: 'local_missing',
      winner: 'incoming',
    })
  })

  it('HLC lebih besar menang', () => {
    expect(decideMerge(version(1), version(2))).toEqual({
      action: 'replace',
      reason: 'incoming_newer',
      winner: 'incoming',
    })
    expect(decideMerge(version(2), version(1))).toEqual({
      action: 'skip',
      reason: 'local_newer',
      winner: 'local',
    })
  })

  it('HLC identik: tidak ada yang menang (idempoten saat pull ulang)', () => {
    expect(decideMerge(version(1), version(1))).toEqual({
      action: 'skip',
      reason: 'same_hlc',
      winner: 'none',
    })
  })

  it('seri wall + counter: deviceId terbesar menang (sama di dua perangkat)', () => {
    expect(decideMerge(version(1, 'devicea'), version(1, 'deviceb')).winner).toBe('incoming')
    expect(decideMerge(version(1, 'deviceb'), version(1, 'devicea')).winner).toBe('local')
  })

  it('HLC masuk yang rusak tidak pernah menang', () => {
    const broken: RecordVersion = {
      id: '018f2c4e-0000-7000-8000-000000000001',
      hlc: 'bukan-hlc',
      deleted: false,
    }
    expect(decideMerge(version(1), broken)).toEqual({
      action: 'skip',
      reason: 'incoming_invalid',
      winner: 'local',
    })
  })

  it('tombstone ikut aturan yang sama: hapus menang kalau HLC-nya lebih besar', () => {
    expect(decideMerge(version(1), version(2, 'devicea', true)).winner).toBe('incoming')
    expect(decideMerge(version(2, 'devicea', true), version(1)).winner).toBe('local')
  })

  it('pickWinner mengembalikan null untuk HLC identik', () => {
    expect(pickWinner(version(1), version(1))).toBeNull()
    expect(pickWinner(version(1), version(3))?.hlc).toBe(version(3).hlc)
  })
})
