import { describe, expect, it } from 'vitest'

import { createManualClock, createMemoryStorage } from '@improve-personal/core'

import {
  BACKUP_STALE_AFTER_MS,
  backupReminderLevel,
  hasOwnContent,
  daysSinceBackup,
  readTimestamp,
  writeTimestamp,
} from './backup-reminder'

const NOW = 1_790_000_000_000
const DAY = 24 * 60 * 60 * 1000

describe('backupReminderLevel', () => {
  const base = {
    lastBackupAtMs: null,
    snoozedUntilMs: null,
    nowMs: NOW,
    isPersisted: true,
    needsOnboarding: false,
    isDriveDue: false,
  }

  it('Drive terjadwal lewat -> ajakan backup Drive walau backup terakhir masih baru; tetap bisa ditunda', () => {
    expect(backupReminderLevel({ ...base, isDriveDue: true, lastBackupAtMs: NOW - DAY })).toBe(
      'drive',
    )
    expect(backupReminderLevel({ ...base, isDriveDue: true, snoozedUntilMs: NOW + 1 })).toBe('none')
  })

  it('perangkat kosong yang belum memilih jalur -> layar awal, mengalahkan tunda', () => {
    expect(backupReminderLevel({ ...base, needsOnboarding: true, snoozedUntilMs: NOW + DAY })).toBe(
      'welcome',
    )
  })

  it('belum pernah backup -> tampil', () => {
    expect(backupReminderLevel(base)).toBe('gentle')
  })

  it('backup <= 7 hari -> diam; > 7 hari -> tampil', () => {
    expect(backupReminderLevel({ ...base, lastBackupAtMs: NOW - BACKUP_STALE_AFTER_MS })).toBe(
      'none',
    )
    expect(backupReminderLevel({ ...base, lastBackupAtMs: NOW - BACKUP_STALE_AFTER_MS - 1 })).toBe(
      'gentle',
    )
  })

  it('ditunda hanya sampai waktu tunda habis, lalu muncul lagi', () => {
    expect(backupReminderLevel({ ...base, snoozedUntilMs: NOW + 1 })).toBe('none')
    expect(backupReminderLevel({ ...base, snoozedUntilMs: NOW })).toBe('gentle')
  })

  it('persist() ditolak -> versi tegas', () => {
    expect(backupReminderLevel({ ...base, isPersisted: false })).toBe('urgent')
    expect(backupReminderLevel({ ...base, isPersisted: null })).toBe('gentle')
  })
})

it('daysSinceBackup membulatkan ke bawah, null kalau belum pernah', () => {
  expect(daysSinceBackup(null, NOW)).toBeNull()
  expect(daysSinceBackup(NOW - 8 * DAY - 5, NOW)).toBe(8)
})

describe('timestamp di localStorage', () => {
  it('bolak-balik; nilai rusak dianggap tidak ada', () => {
    const storage = new Map<string, string>()
    const fake = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } as unknown as Storage

    writeTimestamp('k', NOW, fake)
    expect(readTimestamp('k', fake)).toBe(NOW)
    storage.set('k', 'bukan-angka')
    expect(readTimestamp('k', fake)).toBeNull()
  })

  it('storage yang melempar (mode privat) tidak menggagalkan apa pun', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    } as unknown as Storage

    expect(readTimestamp('k', broken)).toBeNull()
    expect(() => writeTimestamp('k', NOW, broken)).not.toThrow()
  })
})

describe('hasOwnContent', () => {
  it('penyimpanan kosong -> false', async () => {
    expect(await hasOwnContent(createMemoryStorage({ clock: createManualClock(NOW) }))).toBe(false)
  })

  it('cukup satu entri index tulisan user -> true, tanpa membuka record', async () => {
    const storage = createMemoryStorage({ clock: createManualClock(NOW) })
    const listed: string[] = []
    const spy = {
      ...storage,
      listIndexByType: async (type: Parameters<typeof storage.listIndexByType>[0]) => {
        listed.push(type)
        return type === 'todo' ? [{} as never] : []
      },
    }

    expect(await hasOwnContent(spy)).toBe(true)
    expect(listed).toEqual(['schedule', 'todo'])
  })
})
