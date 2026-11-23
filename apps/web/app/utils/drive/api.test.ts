import { BACKUP_MAX_BYTES } from '@improve-personal/core'
import { describe, expect, it } from 'vitest'

import {
  DRIVE_KEEP_VERSIONS,
  DriveApiError,
  downloadDriveBackup,
  listDriveBackups,
  pruneDriveBackups,
  uploadDriveBackup,
  type DriveFile,
} from './api'

/**
 * Drive API di batas jaringan: `fetch` palsu yang mencatat setiap request. Yang dikunci: token
 * hanya di header (bukan URL), unggahan memakai sesi resumable milik Google saja, berkas raksasa
 * tidak diunduh, dan hanya 5 versi terbaru yang dipertahankan.
 */

type Call = { url: string; init: RequestInit }

function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: Call[] = []
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    calls.push({ url, init })
    return handler(url, init)
  }) as typeof fetch
  return { calls, fetcher }
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init })

function rawFile(n: number) {
  return {
    id: `f${n}`,
    name: `improve-personal-backup-${n}.ipbackup`,
    createdTime: new Date(Date.UTC(2026, 10, n)).toISOString(),
    size: '100',
  }
}

describe('listDriveBackups', () => {
  it('hanya berkas bertanda ipBackup, terbaru dulu; token di header, bukan URL', async () => {
    const { calls, fetcher } = fakeFetch(() =>
      json({ files: [rawFile(1), rawFile(3), rawFile(2)] }),
    )

    const files = await listDriveBackups('TOKEN', fetcher)

    expect(files.map((file) => file.id)).toEqual(['f3', 'f2', 'f1'])
    expect(new URL(calls[0]?.url ?? '').searchParams.get('q')).toContain(
      "key='ipBackup' and value='1'",
    )
    expect(calls[0]?.url).not.toContain('TOKEN')
    expect(new Headers(calls[0]?.init.headers).get('Authorization')).toBe('Bearer TOKEN')
  })

  it('401 jadi DriveApiError dengan pesan sambungkan lagi', async () => {
    const { fetcher } = fakeFetch(() => new Response('', { status: 401 }))
    await expect(listDriveBackups('T', fetcher)).rejects.toThrow(/Sambungkan lagi/)
  })
})

describe('uploadDriveBackup', () => {
  it('sesi resumable: metadata dulu, lalu byte ciphertext ke URL sesi dari Google', async () => {
    const session =
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=x'
    const { calls, fetcher } = fakeFetch((url) =>
      url === session
        ? json(rawFile(9))
        : new Response(null, { status: 200, headers: { Location: session } }),
    )

    const file = await uploadDriveBackup('T', 'a.ipbackup', new Uint8Array([1, 2, 3]), fetcher)

    expect(file.id).toBe('f9')
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      name: 'a.ipbackup',
      appProperties: { ipBackup: '1' },
    })
    expect(calls[1]?.init.method).toBe('PUT')
    expect([...(calls[1]?.init.body as Uint8Array)]).toEqual([1, 2, 3])
  })

  it('URL sesi di luar endpoint unggah Drive ditolak - byte tidak dikirim ke mana pun', async () => {
    const { calls, fetcher } = fakeFetch(
      () => new Response(null, { status: 200, headers: { Location: 'https://evil.test/up' } }),
    )

    await expect(uploadDriveBackup('T', 'a', new Uint8Array(1), fetcher)).rejects.toBeInstanceOf(
      DriveApiError,
    )
    expect(calls).toHaveLength(1)
  })
})

describe('downloadDriveBackup', () => {
  it('berkas di atas batas import tidak diunduh sama sekali', async () => {
    const { calls, fetcher } = fakeFetch(() => new Response(new Uint8Array(1)))
    const huge: DriveFile = {
      id: 'x',
      name: 'x',
      createdTimeMs: 0,
      sizeBytes: BACKUP_MAX_BYTES + 1,
    }

    await expect(downloadDriveBackup('T', huge, fetcher)).rejects.toMatchObject({ status: 413 })
    expect(calls).toHaveLength(0)
  })
})

describe('pruneDriveBackups', () => {
  it(`menyisakan ${DRIVE_KEEP_VERSIONS} versi terbaru; gagal hapus satu tidak menghentikan sisanya`, async () => {
    const all = Array.from({ length: 8 }, (_, index) => rawFile(index + 1))
    const { calls, fetcher } = fakeFetch((url, init) => {
      if (init.method !== 'DELETE') return json({ files: all })
      return new Response(null, { status: url.endsWith('/f2') ? 500 : 204 })
    })

    expect(await pruneDriveBackups('T', fetcher)).toBe(2)
    const deleted = calls.filter((call) => call.init.method === 'DELETE').map((call) => call.url)
    expect(deleted.map((url) => url.split('/').pop())).toEqual(['f3', 'f2', 'f1'])
  })
})
