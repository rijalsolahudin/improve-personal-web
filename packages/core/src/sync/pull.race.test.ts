import { compareHlc, type ServerRecord } from '@improve-personal/contracts'
import { describe, expect, it } from 'vitest'

import { createManualClock } from '../adapters/clock.ts'
import { createMemoryStorage } from '../adapters/memory.ts'
import type { RecordIndexEntry } from '../domain/envelope.ts'
import type { HttpClient } from '../ports.ts'
import { createHlcGenerator } from './hlc.ts'
import { buildRecordWrite, commitLocalWrite, syncOpFor } from './outbox.ts'
import { pullDelta } from './pull.ts'

/**
 * Regresi temuan security review M2 + M3 pada `pull.ts`.
 *
 * M2: versi lokal dibaca sebelum `indexFor` (kripto) dan sesudahnya. Tanpa baca ulang, edit lokal
 * ber-HLC lebih tinggi yang mendarat selama blob halaman didekripsi ditimpa versi server yang lebih
 * tua - data user kembali ke isi lama tanpa error.
 *
 * M3: `indexFor` boleh menjawab `'keep'`. Dipakai shell saat blob gagal didekripsi: record tetap
 * diterapkan, tapi baris `record_index` lama tidak boleh dihapus (kalau dihapus, record hilang dari
 * kalender/overview/export padahal datanya ada).
 */

const START_MS = 1_700_000_000_000
const RECORD_ID = '018f2c4e-0000-7000-8000-000000000001'
const OLDER_HLC = '1699999999999-0-deviceb'

function remoteRecord(input: { readonly hlc: string }): ServerRecord {
  return {
    id: RECORD_ID,
    hlc: input.hlc,
    deleted: false,
    // Base64 sah; core tidak pernah membuka isinya.
    blob: 'AAAAAAAA',
    serverSeq: 1,
  }
}

function httpWithOnePage(record: ServerRecord): HttpClient {
  let call = 0

  return {
    postJson: async <T>(): Promise<T> => {
      throw new Error('pull tidak boleh memakai push')
    },
    getJson: async <T>(): Promise<T> => {
      call += 1
      // Halaman kedua kosong: pull berhenti karena tidak ada delta, bukan karena menghitung record.
      return (call === 1
        ? { records: [record], nextCursor: 1 }
        : { records: [], nextCursor: 1 }) as unknown as T
    },
  } as HttpClient
}

const INDEX: RecordIndexEntry = {
  recordId: RECORD_ID,
  entityType: 'todo',
  rangeStartMs: START_MS,
  rangeEndMs: null,
  updatedAtMs: START_MS,
}

describe('pullDelta: tulisan lokal yang mendarat selama indexFor (M2)', () => {
  it('edit lokal ber-HLC lebih tinggi menang, walau masuk saat indexFor berjalan', async () => {
    const clock = createManualClock(START_MS)
    const storage = createMemoryStorage({ clock })
    const hlc = createHlcGenerator({ deviceId: 'device-a', clock })
    const remoteHlc = hlc.tick()

    let localHlc = ''
    const summary = await pullDelta({
      storage,
      http: httpWithOnePage(remoteRecord({ hlc: remoteHlc })),
      url: '/v1/sync/pull',
      nowMs: START_MS,
      hlc,
      indexFor: async () => {
        // Persis jendela balapan yang dilaporkan: shell mendekripsi blob (await), dan SELAMA itu
        // user menyimpan edit. HLC perangkat ini sudah melewati HLC server (di-`observe` pull).
        await Promise.resolve()
        localHlc = hlc.tick()

        await commitLocalWrite({
          storage,
          write: buildRecordWrite({
            sealed: { id: RECORD_ID, hlc: localHlc, deleted: false, blob: 'EDIT-LOKAL' },
            index: null,
            op: syncOpFor({ deleted: false }),
            outbox: { id: 'outbox-lokal', queuedAtMs: START_MS },
          }),
        })

        return INDEX
      },
    })

    // Prasyarat test ini: edit lokal memang LEBIH BARU dari versi server.
    expect(compareHlc(localHlc, remoteHlc)).toBeGreaterThan(0)
    expect(summary.applied).toBe(0)
    expect(summary.skipped).toBe(1)

    const stored = await storage.getRecord(RECORD_ID)
    expect(stored?.hlc).toBe(localHlc)
    expect(stored?.blob).toBe('EDIT-LOKAL')
  })
})

describe("pullDelta: indexFor 'keep' (M3)", () => {
  it('mempertahankan baris record_index lama saat blob tidak bisa didekripsi', async () => {
    const clock = createManualClock(START_MS)
    const storage = createMemoryStorage({ clock })
    const hlc = createHlcGenerator({ deviceId: 'device-a', clock })

    await commitLocalWrite({
      storage,
      write: buildRecordWrite({
        sealed: { id: RECORD_ID, hlc: OLDER_HLC, deleted: false, blob: 'LAMA' },
        index: INDEX,
        op: 'put',
        outbox: { id: 'outbox-lama', queuedAtMs: START_MS },
      }),
    })

    const summary = await pullDelta({
      storage,
      http: httpWithOnePage(remoteRecord({ hlc: '1700000005000-0-deviceb' })),
      url: '/v1/sync/pull',
      nowMs: START_MS,
      hlc,
      // Shell mengembalikan 'keep' kalau dekripsi blob gagal (mis. skema lebih baru).
      indexFor: () => 'keep',
    })

    expect(summary.applied).toBe(1)
    expect((await storage.getRecord(RECORD_ID))?.blob).toBe('AAAAAAAA')
    // Inilah inti M3: record tetap bisa ditemukan lewat index lamanya.
    await expect(storage.listIndexByType('todo')).resolves.toEqual([INDEX])
  })

  it('tidak mengarang baris index saat belum ada yang bisa dipertahankan', async () => {
    const clock = createManualClock(START_MS)
    const storage = createMemoryStorage({ clock })
    const hlc = createHlcGenerator({ deviceId: 'device-a', clock })

    const summary = await pullDelta({
      storage,
      http: httpWithOnePage(remoteRecord({ hlc: '1700000005000-0-deviceb' })),
      url: '/v1/sync/pull',
      nowMs: START_MS,
      hlc,
      indexFor: (): 'keep' => 'keep',
    })

    expect(summary.applied).toBe(1)
    await expect(storage.listIndexByType('todo')).resolves.toEqual([])
  })

  it('indexFor null TETAP menghapus baris index lama', async () => {
    const clock = createManualClock(START_MS)
    const storage = createMemoryStorage({ clock })
    const hlc = createHlcGenerator({ deviceId: 'device-a', clock })

    await commitLocalWrite({
      storage,
      write: buildRecordWrite({
        sealed: { id: RECORD_ID, hlc: OLDER_HLC, deleted: false, blob: 'LAMA' },
        index: INDEX,
        op: 'put',
        outbox: { id: 'outbox-lama', queuedAtMs: START_MS },
      }),
    })

    await pullDelta({
      storage,
      http: httpWithOnePage(remoteRecord({ hlc: '1700000005000-0-deviceb' })),
      url: '/v1/sync/pull',
      nowMs: START_MS,
      hlc,
      indexFor: () => null,
    })

    await expect(storage.listIndexByType('todo')).resolves.toEqual([])
  })
})
