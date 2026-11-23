import { BACKUP_MAX_BYTES } from '@improve-personal/core'

/**
 * Drive API v3 secukupnya untuk backup terjadwal (T29): daftar, unggah, unduh, hapus berkas buatan
 * app. Semua request langsung browser -> `www.googleapis.com` dengan token di header `Authorization`
 * (tidak pernah di URL, tidak pernah di-log).
 *
 * Berkas ditandai `appProperties.ipBackup = "1"` supaya daftar versi hanya memuat backup app ini,
 * bukan berkas lain yang kebetulan bernama mirip.
 */

const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const FILE_FIELDS = 'id,name,createdTime,size'
const BACKUP_QUERY = "appProperties has { key='ipBackup' and value='1' } and trashed=false"

/** Versi yang disimpan di Drive (PRD F15); yang lebih lama dihapus setelah unggahan berhasil. */
export const DRIVE_KEEP_VERSIONS = 5

export type DriveFile = {
  readonly id: string
  readonly name: string
  readonly createdTimeMs: number
  readonly sizeBytes: number
}

export class DriveApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(describeDriveStatus(status))
    this.name = 'DriveApiError'
    this.status = status
  }
}

function describeDriveStatus(status: number): string {
  if (status === 401) return 'Izin Google Drive sudah habis. Sambungkan lagi untuk melanjutkan.'
  if (status === 403) return 'Google Drive menolak permintaan (kuota penuh atau izin dicabut).'
  if (status === 404) return 'Berkas backup tidak ditemukan di Google Drive.'
  if (status === 0) return 'Tidak bisa terhubung ke Google Drive. Periksa koneksi lalu coba lagi.'
  return `Google Drive gagal memproses permintaan (kode ${status}). Coba lagi nanti.`
}

type Fetcher = typeof fetch

async function call(
  fetcher: Fetcher,
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  let response: Response
  try {
    response = await fetcher(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      // Token sudah di header; referrer & kredensial cookie tidak ada gunanya untuk Google API.
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
    })
  } catch {
    throw new DriveApiError(0)
  }
  if (!response.ok) throw new DriveApiError(response.status)
  return response
}

type RawFile = { id?: unknown; name?: unknown; createdTime?: unknown; size?: unknown }

function toDriveFile(raw: RawFile): DriveFile | null {
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
  const createdTimeMs = Date.parse(String(raw.createdTime))
  const sizeBytes = Number(raw.size)
  if (!Number.isFinite(createdTimeMs) || !Number.isFinite(sizeBytes)) return null
  return { id: raw.id, name: raw.name, createdTimeMs, sizeBytes }
}

/** Backup app ini di Drive, terbaru dulu. */
export async function listDriveBackups(
  token: string,
  fetcher: Fetcher = fetch,
): Promise<DriveFile[]> {
  const url = new URL(API)
  url.searchParams.set('q', BACKUP_QUERY)
  url.searchParams.set('orderBy', 'createdTime desc')
  url.searchParams.set('fields', `files(${FILE_FIELDS})`)
  url.searchParams.set('pageSize', '20')
  url.searchParams.set('spaces', 'drive')

  const body = (await (await call(fetcher, token, url.toString())).json()) as { files?: RawFile[] }
  return (body.files ?? [])
    .map(toDriveFile)
    .filter((file): file is DriveFile => file !== null)
    .sort((a, b) => b.createdTimeMs - a.createdTimeMs)
}

/**
 * Unggah lewat sesi resumable (dua request): batas unggahan multipart Drive 5 MB, sedangkan backup
 * boleh sampai 32 MB.
 */
export async function uploadDriveBackup(
  token: string,
  name: string,
  bytes: Uint8Array,
  fetcher: Fetcher = fetch,
): Promise<DriveFile> {
  const start = await call(fetcher, token, `${UPLOAD}?uploadType=resumable&fields=${FILE_FIELDS}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/octet-stream',
      'X-Upload-Content-Length': String(bytes.length),
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/octet-stream',
      appProperties: { ipBackup: '1' },
    }),
  })
  const session = start.headers.get('Location')
  // Sesi unggah hanya boleh menuju endpoint Drive sendiri, bukan URL apa pun dari header.
  if (session === null || !session.startsWith(`${UPLOAD}?`)) throw new DriveApiError(502)

  const put = await call(fetcher, token, session, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(bytes),
  })
  const file = toDriveFile((await put.json()) as RawFile)
  if (file === null) throw new DriveApiError(502)
  return file
}

/** Unduh isi berkas. Ukuran dicek dari metadata DULU - berkas raksasa tidak diunduh sama sekali. */
export async function downloadDriveBackup(
  token: string,
  file: DriveFile,
  fetcher: Fetcher = fetch,
): Promise<Uint8Array> {
  if (file.sizeBytes > BACKUP_MAX_BYTES) throw new DriveApiError(413)
  const response = await call(fetcher, token, `${API}/${encodeURIComponent(file.id)}?alt=media`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length > BACKUP_MAX_BYTES) throw new DriveApiError(413)
  return bytes
}

/** Hapus versi di luar `DRIVE_KEEP_VERSIONS` terbaru. Gagal hapus tidak menggagalkan backup. */
export async function pruneDriveBackups(token: string, fetcher: Fetcher = fetch): Promise<number> {
  const files = await listDriveBackups(token, fetcher)
  let removed = 0
  for (const file of files.slice(DRIVE_KEEP_VERSIONS)) {
    try {
      await call(fetcher, token, `${API}/${encodeURIComponent(file.id)}`, { method: 'DELETE' })
      removed += 1
    } catch {
      // Versi lama yang tersisa hanya memakan ruang; dicoba lagi di backup berikutnya.
    }
  }
  return removed
}

/** Cabut token di Google saat Drive diputus. Gagal (offline) tidak menahan pemutusan lokal. */
export async function revokeDriveToken(token: string, fetcher: Fetcher = fetch): Promise<void> {
  try {
    await fetcher('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
  } catch {
    // Token akses tetap kedaluwarsa sendiri dalam ~1 jam.
  }
}
