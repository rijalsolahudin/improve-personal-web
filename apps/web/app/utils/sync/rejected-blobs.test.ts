import { afterEach, describe, expect, it } from 'vitest'

import {
  REJECTED_BLOBS_MAX_PER_OWNER,
  REJECTED_BLOBS_STORAGE_KEY,
  clearRejectedBlobsForTest,
  listRejectedBlobs,
  noteRejectedBlob,
} from './rejected-blobs'

afterEach(() => {
  clearRejectedBlobsForTest()
})

describe('catatan blob ditolak', () => {
  it('mencatat id + alasan per pemilik, tanpa menyimpan isi blob', () => {
    noteRejectedBlob('akun-a', 'rec-1', 'foreign', 10)
    noteRejectedBlob('akun-b', 'rec-2', 'v1_closed', 20)

    expect(listRejectedBlobs('akun-a')).toEqual([
      { recordId: 'rec-1', reason: 'foreign', atMs: 10 },
    ])
    expect(listRejectedBlobs('akun-b')).toHaveLength(1)
    expect(localStorage.getItem(REJECTED_BLOBS_STORAGE_KEY)).not.toContain('blob')
  })

  it('idempoten per id: catatan terbaru menggantikan yang lama', () => {
    noteRejectedBlob('akun-a', 'rec-1', 'foreign', 10)
    noteRejectedBlob('akun-a', 'rec-1', 'authentication', 30)

    expect(listRejectedBlobs('akun-a')).toEqual([
      { recordId: 'rec-1', reason: 'authentication', atMs: 30 },
    ])
  })

  it('dibatasi per pemilik; yang paling lama dibuang', () => {
    for (let index = 0; index <= REJECTED_BLOBS_MAX_PER_OWNER; index += 1) {
      noteRejectedBlob('akun-a', `rec-${index}`, 'foreign', index)
    }

    const entries = listRejectedBlobs('akun-a')
    expect(entries).toHaveLength(REJECTED_BLOBS_MAX_PER_OWNER)
    expect(entries[0]?.recordId).toBe('rec-1')
  })

  it('nilai rusak di storage dibaca sebagai kosong, tidak melempar', () => {
    localStorage.setItem(REJECTED_BLOBS_STORAGE_KEY, '{bukan json')

    expect(listRejectedBlobs('akun-a')).toEqual([])
    expect(() => noteRejectedBlob('akun-a', 'rec-1', 'foreign', 1)).not.toThrow()
    expect(listRejectedBlobs('akun-a')).toHaveLength(1)
  })

  it('pemilik atau id kosong diabaikan', () => {
    noteRejectedBlob('', 'rec-1', 'foreign', 1)
    noteRejectedBlob('akun-a', '', 'foreign', 1)

    expect(listRejectedBlobs('akun-a')).toEqual([])
  })
})
