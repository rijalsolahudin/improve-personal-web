import 'fake-indexeddb/auto'

import {
  createManualClock,
  createMemoryStorage,
  validateBackupText,
  type CryptoProvider,
} from '@improve-personal/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { decryptBackup } from '~/utils/crypto/backup-crypto'
import { DRIVE_OAUTH_CHANNEL, DRIVE_SCOPE } from '~/utils/drive/oauth'
import { forgetDriveToken } from '~/utils/drive/token'
import { BACKUP_LAST_AT_KEY } from '~/utils/io/backup-reminder'

import { useDriveBackup } from './useDriveBackup'

/**
 * Alur Drive end-to-end di batas jaringan: popup Google (window.open + BroadcastChannel), Drive API
 * (`fetch`), dan IndexedDB (fake-indexeddb) dipalsukan; kripto, penyimpanan konfigurasi, dan
 * penyusunan berkas memakai kode asli. Yang dibuktikan: yang diunggah adalah ciphertext yang hanya
 * terbuka dengan kata sandi backup, kata sandi tidak tersimpan, dan putus mencabut token.
 */

const NOW = 1_790_000_000_000
const PASSWORD = 'Kucing-makan-ikan-7'
const SESSION_URL =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=u'

const provider: CryptoProvider = {
  sealRecord: async ({ plaintext }) => plaintext,
  openRecord: async ({ blob }) => blob,
}
const session = {
  storage: createMemoryStorage({ clock: createManualClock(NOW) }),
  provider,
  dataKey: { kind: 'test', handle: null },
  clock: createManualClock(NOW),
}

vi.mock('~/composables/useLocalData', () => ({
  useLocalData: () => ({ ensure: async () => session }),
}))

type Call = { url: string; init: RequestInit }
let calls: Call[] = []

function grantOnOpen(): void {
  vi.spyOn(window, 'open').mockImplementation((url) => {
    const state = new URL(String(url)).searchParams.get('state') ?? ''
    const channel = new BroadcastChannel(DRIVE_OAUTH_CHANNEL)
    const fragment = `#access_token=TOKEN&expires_in=3599&scope=${encodeURIComponent(DRIVE_SCOPE)}&state=${state}`
    setTimeout(() => {
      channel.postMessage({ fragment })
      channel.close()
    }, 0)
    return {} as Window
  })
}

beforeEach(() => {
  calls = []
  localStorage.clear()
  forgetDriveToken()
  clearNuxtState(['driveConfig', 'driveConfigLoaded', 'backupLastAt'])
  grantOnOpen()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      calls.push({ url, init })
      if (url === SESSION_URL) {
        return new Response(
          JSON.stringify({
            id: 'f1',
            name: 'b.ipbackup',
            createdTime: '2026-11-20T00:00:00Z',
            size: '9',
          }),
        )
      }
      if (url.includes('uploadType=resumable')) {
        return new Response(null, { status: 200, headers: { Location: SESSION_URL } })
      }
      if (url.includes('/drive/v3/files?')) return new Response(JSON.stringify({ files: [] }))
      return new Response(null, { status: 200 })
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useDriveBackup', () => {
  it('sambung: unggahan pertama adalah ciphertext yang terbuka dengan kata sandi backup', async () => {
    const drive = useDriveBackup()
    await drive.connect(PASSWORD, 'daily')

    expect(drive.error.value).toBeNull()
    const put = calls.find((call) => call.init.method === 'PUT')
    const bytes = put?.init.body as Uint8Array
    const text = new TextDecoder().decode(bytes)
    expect(text.startsWith('{"format":"ip-backup-enc"')).toBe(true)
    expect(text).not.toContain('"records"')

    expect(validateBackupText(await decryptBackup(bytes, PASSWORD)).ok).toBe(true)
    expect(drive.config.value).toEqual({ schedule: 'daily', lastBackupAtMs: NOW })
    expect(localStorage.getItem(BACKUP_LAST_AT_KEY)).toBe(String(NOW))
    // Kata sandi tidak pernah keluar dari perangkat atau tersimpan di localStorage.
    expect(calls.some((call) => String(call.init.body).includes(PASSWORD))).toBe(false)
    expect(JSON.stringify({ ...localStorage })).not.toContain(PASSWORD)
  }, 20_000)

  it('backup berikutnya memakai kunci tersimpan (tanpa kata sandi) dan token di memori', async () => {
    const drive = useDriveBackup()
    await drive.connect(PASSWORD, 'weekly')
    calls = []

    await drive.backupNow()

    expect(window.open).toHaveBeenCalledTimes(1)
    const put = calls.find((call) => call.init.method === 'PUT')
    expect(validateBackupText(await decryptBackup(put?.init.body as Uint8Array, PASSWORD)).ok).toBe(
      true,
    )
  }, 20_000)

  it('putus: token dicabut di Google dan konfigurasi dihapus', async () => {
    const drive = useDriveBackup()
    await drive.connect(PASSWORD, 'weekly')

    await drive.disconnect()

    const revoke = calls.find((call) => call.url === 'https://oauth2.googleapis.com/revoke')
    expect(String(revoke?.init.body)).toBe('token=TOKEN')
    expect(drive.isConnected.value).toBe(false)
    clearNuxtState(['driveConfig', 'driveConfigLoaded'])
    const fresh = useDriveBackup()
    await fresh.load()
    expect(fresh.isConnected.value).toBe(false)
  }, 20_000)

  it('popup diblokir: pesan jelas, tidak ada request ke Drive', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const drive = useDriveBackup()

    await drive.backupNow()

    expect(drive.error.value).toContain('diblokir browser')
    expect(calls).toHaveLength(0)
  })
})
