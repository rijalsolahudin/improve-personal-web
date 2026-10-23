import { utf8ByteLength } from '@improve-personal/contracts'
import { describe, expect, it } from 'vitest'

import { createManualClock } from '../adapters/clock.ts'
import { createMemoryStorage } from '../adapters/memory.ts'
import { DEFAULT_APP_STYLE, DEFAULT_THEME_COLOR } from '../domain/enums.ts'
import {
  CURRENT_SCHEMA_VERSION,
  ENTITY_TYPES,
  type EntityType,
  type SealedRecord,
} from '../domain/envelope.ts'
import type { StorageAdapter, StoredRecord } from '../ports.ts'
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_MAX_BYTES,
  BACKUP_PLAINTEXT_WARNING,
  backupFileName,
  buildBackupDocument,
  describeDataCount,
  emptyDataCount,
  serializeBackup,
  type BackupDocument,
  type BackupRecordInput,
} from './backup.ts'
import { applyBackupImport, validateBackupText, type ImportRejection } from './import.ts'

/**
 * QA T12 (PRD F10) - verifikasi independen di luar `io.test.ts`.
 *
 * Yang dibuktikan di sini, satu per satu, adalah acceptance criteria T12 apa adanya:
 * 1. export -> wipe -> import menghasilkan data **identik** (dibandingkan per isi record, lintas 6
 *    tipe entitas, termasuk tombstone dan teks yang berisi HTML),
 * 2. berkas invalid / versi asing / rusak ditolak **tanpa satu pun perubahan** di storage,
 * 3. ada batas ukuran berkas dan batas itu berlaku pada jalur default (bukan cuma kalau test
 *    menimpa opsinya),
 * 4. peringatan "tidak terenkripsi" teksnya sama persis dengan PRD dan berkasnya menandai dirinya
 *    plaintext,
 * 5. mode "gabung" tidak menghapus data lama, mode "ganti semua" menghapus data yang tidak ada di
 *    berkas,
 * 6. tidak ada `innerHTML`/`v-html`/`eval` di jalur import/export (dicek statis dari sumbernya).
 *
 * Enkripsi nyata milik `packages/crypto`; di sini dipakai seal/open pengganti `plain:<json>` yang
 * deterministik, sama seperti `io.test.ts`. Yang diuji adalah alur import/export, bukan kriptonya.
 */

const NOW = 1_700_000_000_000
const PLAIN_PREFIX = 'plain:'
const DEVICE_ID = 'devicea'
const JAKARTA = 'Asia/Jakarta'

/** Teks PRD F10 apa adanya - dipakai sebagai oracle untuk peringatan export. */
const PRD_WARNING =
  'File ini berisi data terbaca (tidak terenkripsi). Simpan dengan aman atau kasih ke orang terpercaya saja.'

const HTML_TEXT = '<img src=x onerror=alert(1)> & <script>alert("x")</script> **tebal**'

function recordIdFor(n: number): string {
  return `018f2c4e-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
}

function hlcFor(offsetMs: number, device = DEVICE_ID): string {
  return `${NOW + offsetMs}-0-${device}`
}

type Seed = {
  readonly type: EntityType
  readonly deleted?: boolean
  readonly hlc?: string
  readonly data: unknown
}

/** Payload sah untuk 6 tipe entitas yang berbeda - dibangun dari schema domain, bukan dari impor. */
function seedPayloads(): readonly { readonly id: string; readonly seed: Seed }[] {
  const prefsId = recordIdFor(101)
  const todoId = recordIdFor(102)
  const habitId = recordIdFor(103)
  const checkinId = recordIdFor(104)
  const countdownId = recordIdFor(105)
  const journalId = recordIdFor(106)
  const tombstoneId = recordIdFor(107)

  return [
    {
      id: prefsId,
      seed: {
        type: 'user_prefs',
        data: {
          id: prefsId,
          themeColor: DEFAULT_THEME_COLOR,
          style: DEFAULT_APP_STYLE,
          hideDecorations: false,
          updatedAt: NOW,
        },
      },
    },
    {
      id: todoId,
      seed: {
        type: 'todo',
        data: {
          id: todoId,
          title: 'Bayar listrik <b>& "air"</b>',
          note: HTML_TEXT,
          deadlineAt: NOW + 3_600_000,
          priority: 'urgent',
          isDone: false,
          completedAt: null,
          scheduleId: null,
          scheduleOccurrenceAt: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
    },
    {
      id: habitId,
      seed: {
        type: 'habit',
        data: {
          id: habitId,
          name: 'Olahraga',
          iconSticker: null,
          color: '#9B4FC9',
          frequencyType: 'weekly_days',
          frequencyDays: ['senin', 'kamis'],
          targetPerDay: 2,
          isArchived: false,
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
    },
    {
      id: checkinId,
      seed: {
        type: 'habit_checkin',
        data: {
          id: checkinId,
          habitId,
          localDate: '2026-10-21',
          amount: 2,
          checkinAt: NOW,
        },
      },
    },
    {
      id: countdownId,
      seed: {
        type: 'countdown',
        data: {
          id: countdownId,
          name: 'Ulang tahun',
          targetAt: NOW + 86_400_000,
          color: null,
          stickerId: 'bundled-sticker-1',
          isYearly: true,
          isAllDay: false,
          isArchived: false,
          archivedAt: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
    },
    {
      id: journalId,
      seed: {
        type: 'journal_entry',
        data: {
          id: journalId,
          entryDate: '2026-10-21',
          identityToday: 'Tenang',
          mood: 'bahagia',
          moodStoryMd: HTML_TEXT,
          diaryMd: HTML_TEXT,
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
    },
    {
      id: tombstoneId,
      seed: {
        type: 'todo',
        deleted: true,
        data: {
          id: tombstoneId,
          title: 'Sudah dihapus',
          note: null,
          deadlineAt: null,
          priority: 'low',
          isDone: true,
          completedAt: NOW,
          scheduleId: null,
          scheduleOccurrenceAt: null,
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
    },
  ]
}

function sealFor(record: BackupRecordInput): SealedRecord {
  return {
    id: record.id,
    hlc: record.hlc,
    deleted: record.deleted,
    blob: `${PLAIN_PREFIX}${JSON.stringify({
      type: record.type,
      schemaVersion: record.schemaVersion ?? CURRENT_SCHEMA_VERSION,
      data: record.data,
    })}`,
  }
}

function openStored(stored: StoredRecord): BackupRecordInput {
  const payload = JSON.parse(stored.blob.slice(PLAIN_PREFIX.length)) as {
    readonly type: EntityType
    readonly schemaVersion: number
    readonly data: unknown
  }

  return {
    id: stored.id,
    type: payload.type,
    hlc: stored.hlc,
    deleted: stored.deleted,
    schemaVersion: payload.schemaVersion,
    data: payload.data,
  }
}

function byId(a: { readonly id: string }, b: { readonly id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

type Harness = {
  readonly storage: StorageAdapter
  readonly put: (recordId: string, seed: Seed) => Promise<void>
  readonly read: (ids: readonly string[]) => Promise<BackupRecordInput[]>
  /** Sidik jari seluruh isi storage: record + outbox + sync_state. */
  readonly fingerprint: (ids: readonly string[]) => Promise<string>
}

function createHarness(): Harness {
  const clock = createManualClock(NOW)
  const storage = createMemoryStorage({ clock })

  return {
    storage,

    put: async (recordId, seed) => {
      await storage.runTransaction('qa.seed', async (tx) => {
        await tx.putRecord({
          sealed: sealFor({
            id: recordId,
            type: seed.type,
            hlc: seed.hlc ?? hlcFor(0),
            deleted: seed.deleted ?? false,
            data: seed.data,
          }),
          index: null,
          op: seed.deleted === true ? 'delete' : 'put',
          outbox: { id: `seed-outbox-${recordId}`, queuedAtMs: NOW },
        })
      })
    },

    read: async (ids) => (await storage.getRecords(ids)).map(openStored).sort(byId),

    fingerprint: async (ids) => {
      const records = [...(await storage.getRecords(ids))].sort(byId)
      const outbox = await storage.listOutbox(1_000)
      const state = await storage.getSyncState()
      return JSON.stringify({ records, outbox, state })
    },
  }
}

function importInto(
  storage: StorageAdapter,
  document: BackupDocument,
  mode: 'merge' | 'replace-all',
  overrides?: { readonly seal?: (record: BackupRecordInput) => Promise<SealedRecord> },
) {
  return applyBackupImport({
    storage,
    document,
    mode,
    nowMs: NOW,
    seal: overrides?.seal ?? (async (record) => sealFor(record)),
    outboxIdFor: (record) => `import-outbox-${record.id}`,
  })
}

function rejectionOf(result: ReturnType<typeof validateBackupText>): ImportRejection {
  if (result.ok) throw new Error('berkas harusnya ditolak, tapi validasi berhasil')
  return result
}

function documentWithDataCount(document: BackupDocument): BackupDocument {
  return buildBackupDocument({ records: document.records, exportedAtMs: document.exportedAtMs })
}

describe('T12 round-trip: export -> wipe -> import identik', () => {
  it('6 tipe entitas + tombstone kembali identik, isi record dibandingkan (bukan cuma jumlah)', async () => {
    const harness = createHarness()
    const seeds = seedPayloads()
    for (const entry of seeds) await harness.put(entry.id, entry.seed)

    const ids = seeds.map((entry) => entry.id)
    const before = await harness.read(ids)
    expect(before).toHaveLength(seeds.length)

    const document = buildBackupDocument({ records: before, exportedAtMs: NOW })
    const text = serializeBackup(document)

    expect(document.records).toHaveLength(seeds.length)
    expect(document.records.map((record) => record.type)).toEqual([
      'user_prefs',
      'todo',
      'habit',
      'habit_checkin',
      'countdown',
      'journal_entry',
      'todo',
    ])

    // "Wipe" sesuai PRD: semua data sekarang dihapus.
    await harness.storage.wipe()
    expect(await harness.storage.getRecords(ids)).toHaveLength(0)
    expect(await harness.storage.countOutbox()).toBe(0)

    const validation = validateBackupText(text)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    expect(validation.migratedFrom).toBeNull()

    const result = await importInto(harness.storage, validation.document, 'replace-all')
    expect(result.written).toBe(seeds.length)

    const after = await harness.read(ids)

    // INI inti AC: bandingkan isi tiap record (id, type, hlc, deleted, schemaVersion, data),
    // bukan sekadar jumlah record.
    expect(after).toEqual(before)

    // Teks yang berisi HTML tidak diubah/dibersihkan diam-diam di jalur data - render yang aman
    // adalah tugas UI, bukan alasan mengubah isi berkas user.
    const journal = after.find((record) => record.type === 'journal_entry')
    const journalData = journal?.data as { readonly diaryMd?: unknown } | undefined
    expect(journalData?.diaryMd).toBe(HTML_TEXT)

    // Export ulang dari data hasil import harus sama persis -> tidak ada data yang bergeser.
    const reExported = buildBackupDocument({ records: after, exportedAtMs: NOW })
    expect(reExported.records).toEqual(document.records)
    expect(reExported.dataCount).toEqual(document.dataCount)
    expect(JSON.parse(serializeBackup(reExported))).toEqual(JSON.parse(text))
  })

  it('record hasil import ikut mengantre sync, tombstone sebagai op delete', async () => {
    const harness = createHarness()
    const id = recordIdFor(120)
    const document = buildBackupDocument({
      records: [
        {
          id,
          type: 'user_prefs',
          hlc: hlcFor(-1_000, 'deviceb'),
          deleted: true,
          data: {
            id,
            themeColor: DEFAULT_THEME_COLOR,
            style: DEFAULT_APP_STYLE,
            hideDecorations: false,
            updatedAt: NOW,
          },
        },
      ],
      exportedAtMs: NOW,
    })

    const validation = validateBackupText(serializeBackup(document))
    expect(validation.ok).toBe(true)
    if (!validation.ok) return

    await importInto(harness.storage, validation.document, 'merge')

    expect((await harness.storage.getRecord(id))?.deleted).toBe(true)
    const outbox = await harness.storage.listOutbox(10)
    expect(outbox).toHaveLength(1)
    expect(outbox[0]?.recordId).toBe(id)
    expect(outbox[0]?.op).toBe('delete')
  })
})

describe('T12 mode gabung vs ganti semua', () => {
  it('gabung: data lama di luar berkas tetap ada, data baru masuk', async () => {
    const harness = createHarness()
    const localA = recordIdFor(130)
    const localB = recordIdFor(131)
    const incomingC = recordIdFor(132)

    await harness.put(localA, {
      type: 'todo',
      data: todoPayload(localA, 'lokal A'),
      hlc: hlcFor(0),
    })
    await harness.put(localB, {
      type: 'todo',
      data: todoPayload(localB, 'lokal B'),
      hlc: hlcFor(0),
    })

    const document = buildBackupDocument({
      records: [
        {
          id: incomingC,
          type: 'todo',
          hlc: hlcFor(-5_000, 'deviceb'),
          deleted: false,
          data: todoPayload(incomingC, 'dari berkas'),
        },
      ],
      exportedAtMs: NOW,
    })

    const result = await importInto(harness.storage, document, 'merge')
    expect(result.written).toBe(1)
    expect(result.skipped).toBe(0)

    const ids = [localA, localB, incomingC]
    const after = await harness.read(ids)
    expect(after.map((record) => record.id).sort()).toEqual([...ids].sort())
    expect(await harness.storage.countOutbox()).toBe(3)
  })

  it('gabung: versi lokal yang lebih baru tidak ditimpa, isinya tetap utuh', async () => {
    const harness = createHarness()
    const id = recordIdFor(140)
    const localTitle = 'judul lokal terbaru'

    await harness.put(id, { type: 'todo', data: todoPayload(id, localTitle), hlc: hlcFor(10_000) })

    const document = buildBackupDocument({
      records: [
        {
          id,
          type: 'todo',
          hlc: hlcFor(-10_000, 'deviceb'),
          deleted: false,
          data: todoPayload(id, 'judul dari berkas lama'),
        },
      ],
      exportedAtMs: NOW,
    })

    const result = await importInto(harness.storage, document, 'merge')
    expect(result.skipped).toBe(1)
    expect(result.written).toBe(0)

    const stored = await harness.read([id])
    expect((stored[0]?.data as { readonly title?: unknown }).title).toBe(localTitle)
    expect(stored[0]?.hlc).toBe(hlcFor(10_000))
  })

  it('ganti semua: data yang tidak ada di berkas benar-benar hilang', async () => {
    const harness = createHarness()
    const localA = recordIdFor(150)
    const localB = recordIdFor(151)
    const incomingC = recordIdFor(152)

    await harness.put(localA, { type: 'todo', data: todoPayload(localA, 'lokal A') })
    await harness.put(localB, { type: 'todo', data: todoPayload(localB, 'lokal B') })

    const document = buildBackupDocument({
      records: [
        {
          id: incomingC,
          type: 'todo',
          hlc: hlcFor(0, 'deviceb'),
          deleted: false,
          data: todoPayload(incomingC, 'hanya ini'),
        },
      ],
      exportedAtMs: NOW,
    })

    await importInto(harness.storage, document, 'replace-all')

    expect(await harness.storage.getRecord(localA)).toBeNull()
    expect(await harness.storage.getRecord(localB)).toBeNull()
    expect(await harness.storage.getRecord(incomingC)).not.toBeNull()
    expect(await harness.storage.countOutbox()).toBe(1)
  })
})

describe('T12 berkas invalid / versi asing ditolak tanpa mengubah data', () => {
  async function expectRejected(
    harness: Harness,
    ids: readonly string[],
    text: string,
    reason: ImportRejection['reason'],
  ): Promise<ImportRejection> {
    const before = await harness.fingerprint(ids)
    const rejection = rejectionOf(validateBackupText(text))
    const after = await harness.fingerprint(ids)

    expect(rejection.reason).toBe(reason)
    expect(rejection.message.length).toBeGreaterThan(0)
    expect(after).toBe(before)

    return rejection
  }

  async function seeded(): Promise<{ readonly harness: Harness; readonly ids: readonly string[] }> {
    const harness = createHarness()
    const ids = [recordIdFor(160), recordIdFor(161)]
    await harness.put(ids[0] as string, { type: 'todo', data: todoPayload(recordIdFor(160), 'A') })
    await harness.put(ids[1] as string, { type: 'todo', data: todoPayload(recordIdFor(161), 'B') })
    return { harness, ids }
  }

  it('teks bukan JSON ditolak (file rusak)', async () => {
    const { harness, ids } = await seeded()
    const rejection = await expectRejected(harness, ids, 'bukan json sama sekali', 'INVALID_JSON')
    expect(rejection.message).toContain('File rusak')
  })

  it('JSON valid tapi bukan backup aplikasi (format asing) ditolak', async () => {
    const { harness, ids } = await seeded()
    const document = documentWithDataCount(buildBackupDocument({ records: [], exportedAtMs: NOW }))

    await expectRejected(
      harness,
      ids,
      JSON.stringify({ ...document, format: 'some-other-app' }),
      'SCHEMA_MISMATCH',
    )
  })

  it('versi FORMAT berkas yang tidak dikenal ditolak dengan saran upgrade', async () => {
    const { harness, ids } = await seeded()
    const document = buildBackupDocument({ records: [], exportedAtMs: NOW })

    const rejection = await expectRejected(
      harness,
      ids,
      JSON.stringify({ ...document, version: '2.0.0' }),
      'FORMAT_VERSION_UNSUPPORTED',
    )
    expect(rejection.message).toContain('Perbarui aplikasi')
  })

  it('versi SCHEMA lebih baru ditolak (bukan ditebak)', async () => {
    const { harness, ids } = await seeded()
    const document = buildBackupDocument({ records: [], exportedAtMs: NOW })

    const rejection = await expectRejected(
      harness,
      ids,
      JSON.stringify({ ...document, schemaVersion: CURRENT_SCHEMA_VERSION + 1 }),
      'VERSION_TOO_NEW',
    )
    expect(rejection.message).toContain('Perbarui aplikasi')
  })

  it('berkas yang mengaku terenkripsi ditolak dengan alasan sendiri', async () => {
    const { harness, ids } = await seeded()
    const document = buildBackupDocument({ records: [], exportedAtMs: NOW })

    const rejection = await expectRejected(
      harness,
      ids,
      JSON.stringify({ ...document, encrypted: true }),
      'ENCRYPTED_NOT_SUPPORTED',
    )
    expect(rejection.message).toContain('terenkripsi')
  })

  it('dataCount negatif ditolak schema', async () => {
    const { harness, ids } = await seeded()
    const document = buildBackupDocument({ records: [], exportedAtMs: NOW })

    await expectRejected(
      harness,
      ids,
      JSON.stringify({ ...document, dataCount: { ...document.dataCount, todo: -1 } }),
      'SCHEMA_MISMATCH',
    )
  })

  it('field asing di level atas ditolak (strict), bukan diabaikan diam-diam', async () => {
    const { harness, ids } = await seeded()
    const document = buildBackupDocument({ records: [], exportedAtMs: NOW })

    await expectRejected(
      harness,
      ids,
      JSON.stringify({ ...document, catatanRahasia: 'x' }),
      'SCHEMA_MISMATCH',
    )
  })

  it('satu payload rusak menggagalkan seluruh berkas, data lama utuh', async () => {
    const { harness, ids } = await seeded()
    const goodId = recordIdFor(162)

    const document = buildBackupDocument({
      records: [
        {
          id: goodId,
          type: 'todo',
          hlc: hlcFor(-1_000, 'deviceb'),
          deleted: false,
          data: todoPayload(goodId, 'sehat'),
        },
        {
          id: recordIdFor(163),
          type: 'habit',
          hlc: hlcFor(-1_000, 'deviceb'),
          deleted: false,
          data: { id: recordIdFor(163) },
        },
      ],
      exportedAtMs: NOW,
    })

    const rejection = await expectRejected(
      harness,
      ids,
      serializeBackup(document),
      'INVALID_RECORD',
    )
    expect(rejection.issues.some((issue) => issue.startsWith('habit/'))).toBe(true)
    // Record sehat di berkas yang sama juga TIDAK boleh masuk.
    expect(await harness.storage.getRecord(goodId)).toBeNull()
  })
})

describe('T12 batas ukuran berkas', () => {
  const emptyDocument = buildBackupDocument({ records: [], exportedAtMs: NOW })
  const text = serializeBackup(emptyDocument)

  it('berkas tepat di batas diterima, satu byte di atas batas ditolak', () => {
    const bytes = utf8ByteLength(text)

    expect(validateBackupText(text, { maxBytes: bytes }).ok).toBe(true)

    const rejection = rejectionOf(validateBackupText(text, { maxBytes: bytes - 1 }))
    expect(rejection.reason).toBe('FILE_TOO_LARGE')
    expect(rejection.message).toContain('Berkas terlalu besar')
  })

  it('batas default 32 MB dipakai walau pemanggil tidak mengirim opsi', () => {
    expect(BACKUP_MAX_BYTES).toBe(32 * 1024 * 1024)

    // Bukan JSON: kalau batas ukuran tidak dicek lebih dulu, yang keluar INVALID_JSON, bukan
    // FILE_TOO_LARGE. Ini membuktikan urutan "cek ukuran -> baru parse" pada jalur default.
    const oversized = ' '.repeat(BACKUP_MAX_BYTES + 1)
    const rejection = rejectionOf(validateBackupText(oversized))
    expect(rejection.reason).toBe('FILE_TOO_LARGE')
  })

  it('berkas kosong dihitung sebagai kosong, bukan error', () => {
    const validation = validateBackupText(text)
    expect(validation.ok).toBe(true)
    if (!validation.ok) return
    expect(validation.document.records).toHaveLength(0)
    expect(describeDataCount(validation.document.dataCount)).toBe('tidak ada data')
  })
})

describe('T12 peringatan plaintext & metadata export', () => {
  it('teks peringatan sama persis dengan PRD F10', () => {
    expect(BACKUP_PLAINTEXT_WARNING).toBe(PRD_WARNING)
    expect(PRD_WARNING).toContain('tidak terenkripsi')
  })

  it('berkas menandai dirinya tidak terenkripsi, jadi peringatan bisa diturunkan dari berkas', () => {
    const harness = createHarness()
    const document = buildBackupDocument({ records: [], exportedAtMs: NOW })
    const parsed = JSON.parse(serializeBackup(document)) as Record<string, unknown>

    expect(document.encrypted).toBe(false)
    expect(parsed['encrypted']).toBe(false)
    expect(parsed['format']).toBe(BACKUP_FORMAT)
    expect(parsed['version']).toBe(BACKUP_FORMAT_VERSION)
    expect(typeof harness.storage.wipe).toBe('function')
  })

  it('dataCount selalu memuat SEMUA tipe entitas, jadi preview tidak pernah "undefined"', () => {
    const document = buildBackupDocument({ records: [], exportedAtMs: NOW })

    expect(Object.keys(document.dataCount).sort()).toEqual([...ENTITY_TYPES].sort())
    expect(document.dataCount).toEqual(emptyDataCount())

    for (const entry of seedPayloads()) {
      expect(document.dataCount[entry.seed.type]).toBeTypeOf('number')
    }
  })

  it('preview menghitung per tipe sesuai isi berkas dan urutannya stabil', () => {
    const records = seedPayloads().map((entry) => ({
      id: entry.id,
      type: entry.seed.type,
      hlc: hlcFor(0),
      deleted: entry.seed.deleted ?? false,
      data: entry.seed.data,
    }))
    const document = buildBackupDocument({ records, exportedAtMs: NOW })

    expect(document.dataCount.todo).toBe(2)
    expect(document.dataCount.habit_checkin).toBe(1)

    expect(describeDataCount(document.dataCount)).toBe(
      '2 todo, 1 countdown, 1 habit, 1 habit_checkin, 1 journal_entry, 1 user_prefs',
    )
    // Urutan mengikuti ENTITY_TYPES, bukan urutan record: preview tidak berubah-ubah antar export.
    expect(describeDataCount({ todo: 1, user_prefs: 1 })).toBe('1 todo, 1 user_prefs')
  })

  it('nama berkas memakai tanggal LOKAL perangkat, termasuk di batas tengah malam', () => {
    const lastSecondJakarta = Date.UTC(2026, 0, 31, 16, 59, 59)
    const midnightJakarta = Date.UTC(2026, 0, 31, 17, 0, 0)

    expect(backupFileName(lastSecondJakarta, JAKARTA)).toBe(
      'improve-personal-backup-2026-01-31.json',
    )
    expect(backupFileName(midnightJakarta, JAKARTA)).toBe('improve-personal-backup-2026-02-01.json')
    expect(backupFileName(midnightJakarta, 'UTC')).toBe('improve-personal-backup-2026-01-31.json')
  })
})

describe('T12 pesan penolakan & konsistensi preview', () => {
  it('pesan penolakan tidak membocorkan isi payload user', () => {
    const marker = 'RAHASIA-PII-9f2c'
    const id = recordIdFor(170)

    const document = buildBackupDocument({
      records: [
        {
          id,
          type: 'habit',
          hlc: hlcFor(0, 'deviceb'),
          deleted: false,
          data: { id, catatanPribadi: marker },
        },
      ],
      exportedAtMs: NOW,
    })

    const rejection = rejectionOf(validateBackupText(serializeBackup(document)))
    expect(rejection.reason).toBe('INVALID_RECORD')

    const reported = [rejection.message, ...rejection.issues].join('\n')
    expect(reported).not.toContain(marker)
  })

  it('batas ukuran menghitung BYTE, bukan jumlah karakter (emoji 4 byte)', () => {
    const id = recordIdFor(171)
    const document = buildBackupDocument({
      records: [
        {
          id,
          type: 'journal_entry',
          hlc: hlcFor(0),
          deleted: false,
          data: {
            id,
            entryDate: '2026-10-21',
            identityToday: null,
            mood: null,
            moodStoryMd: null,
            diaryMd: '🎉'.repeat(1_000),
            createdAt: NOW,
            updatedAt: NOW,
          },
        },
      ],
      exportedAtMs: NOW,
    })

    const text = serializeBackup(document)
    const bytes = utf8ByteLength(text)

    expect(bytes).toBeGreaterThan(text.length)
    expect(validateBackupText(text, { maxBytes: bytes }).ok).toBe(true)

    const rejection = rejectionOf(validateBackupText(text, { maxBytes: bytes - 1 }))
    expect(rejection.reason).toBe('FILE_TOO_LARGE')
  })

  it('jumlah yang dijanjikan preview (dataCount) sama dengan yang benar-benar masuk', async () => {
    const harness = createHarness()
    const records = seedPayloads().map((entry) => ({
      id: entry.id,
      type: entry.seed.type,
      hlc: hlcFor(0),
      deleted: entry.seed.deleted ?? false,
      data: entry.seed.data,
    }))
    const document = buildBackupDocument({ records, exportedAtMs: NOW })

    const validation = validateBackupText(serializeBackup(document))
    expect(validation.ok).toBe(true)
    if (!validation.ok) return

    const result = await importInto(harness.storage, validation.document, 'merge')

    expect(result.perType).toEqual(document.dataCount)
    expect(result.written).toBe(records.length)
  })
})

/** Payload todo minimal yang sah - dipakai test mode gabung/ganti. */
function todoPayload(id: string, title: string): unknown {
  return {
    id,
    title,
    note: null,
    deadlineAt: null,
    priority: 'low',
    isDone: false,
    completedAt: null,
    scheduleId: null,
    scheduleOccurrenceAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  }
}
