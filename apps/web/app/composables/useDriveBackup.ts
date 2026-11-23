import { BackupExportLimitError, EncryptedBackupError } from '@improve-personal/core'

import { deriveNewBackupKey } from '~/utils/crypto/backup-crypto'
import {
  DriveApiError,
  downloadDriveBackup,
  listDriveBackups,
  pruneDriveBackups,
  revokeDriveToken,
  uploadDriveBackup,
  type DriveFile,
} from '~/utils/drive/api'
import {
  DRIVE_SCHEDULE_MS,
  clearDriveConfig,
  loadDriveConfig,
  saveDriveConfig,
  unlockDriveBackupKey,
  updateDriveConfig,
  type DriveConfigSummary,
  type DriveSchedule,
} from '~/utils/drive/config-store'
import {
  DriveAuthError,
  currentDriveToken,
  forgetDriveToken,
  requestDriveToken,
} from '~/utils/drive/token'
import { createEncryptedBackupFile } from '~/utils/io/export'
import { deviceTimeZone } from '~/utils/time'

import { useBackupReminder } from './useBackupReminder'
import { useLocalData } from './useLocalData'

/**
 * Backup terjadwal ke Google Drive (PRD F15, T29) - browser langsung ke Google, tidak lewat server.
 *
 * - Berkas dienkripsi di perangkat (format `.ipbackup` yang sama) SEBELUM diunggah.
 * - Kunci backup dibungkus kunci perangkat; kata sandi hanya dipakai sekali saat menyambung.
 * - Token Google hanya di memori (`utils/drive/token.ts`). Tanpa refresh token, backup yang jatuh
 *   tempo setelah token habis menunggu satu ketukan user (pengingat Daily) - trade-off alur
 *   client-only yang disengaja: tidak ada server yang menyimpan kredensial Google user.
 *
 * Setiap aksi yang butuh token WAJIB dipanggil langsung dari handler klik: `requestDriveToken`
 * membuka popup sebelum `await` pertama.
 */
export function useDriveBackup() {
  const clientId = useRuntimeConfig().public.googleDriveClientId
  const config = useState<DriveConfigSummary | null>('driveConfig', () => null)
  const isLoaded = useState('driveConfigLoaded', () => false)
  const reminder = useBackupReminder()
  const localData = useLocalData()

  const isBusy = ref(false)
  const error = ref<string | null>(null)
  const status = ref<string | null>(null)

  const isAvailable = computed(() => clientId !== '')
  const isConnected = computed(() => config.value !== null)
  const isDue = computed(() => {
    const current = config.value
    if (current === null) return false
    return (
      current.lastBackupAtMs === null ||
      Date.now() - current.lastBackupAtMs >= DRIVE_SCHEDULE_MS[current.schedule]
    )
  })

  async function load(): Promise<void> {
    if (!import.meta.client || isLoaded.value) return
    try {
      config.value = await loadDriveConfig()
    } catch {
      // IndexedDB tidak tersedia (mode privat ketat): anggap belum tersambung, fitur lain tetap jalan.
      config.value = null
    }
    isLoaded.value = true
  }

  async function run<T>(work: () => Promise<T>): Promise<T | null> {
    isBusy.value = true
    error.value = null
    status.value = null
    try {
      return await work()
    } catch (cause) {
      error.value = describeDriveFailure(cause)
      if (cause instanceof DriveApiError && cause.status === 401) forgetDriveToken()
      return null
    } finally {
      isBusy.value = false
    }
  }

  /**
   * Aksi yang butuh token. Popup dibuka SINKRON di sini (masih dalam gestur klik), lalu sisanya
   * berjalan di `run`. Saat sibuk tidak ada popup yang dibuka sama sekali.
   */
  function withToken<T>(work: (token: string) => Promise<T>): Promise<T | null> {
    if (isBusy.value) return Promise.resolve(null)
    const token = requestDriveToken(clientId)
    // Penolakan ditangani `run`; tanpa ini, popup yang gagal sebelum `await` jadi unhandled.
    token.catch(() => undefined)
    return run(async () => work(await token))
  }

  /** Enkripsi data lokal dengan kunci tersimpan -> unggah -> pangkas versi lama. */
  async function upload(token: string): Promise<void> {
    const session = await localData.ensure()
    if (session === null) throw new Error('Data lokal belum bisa dibuka di perangkat ini.')
    const backupKey = await unlockDriveBackupKey()
    if (backupKey === null) throw new Error('Google Drive belum disambungkan di perangkat ini.')

    const nowMs = session.clock.nowMs()
    let file: Awaited<ReturnType<typeof createEncryptedBackupFile>>
    try {
      file = await createEncryptedBackupFile({
        source: session,
        exportedAtMs: nowMs,
        tz: deviceTimeZone(),
        key: { backupKey },
      })
    } finally {
      backupKey.key.fill(0)
    }

    await uploadDriveBackup(token, file.name, file.bytes)
    await pruneDriveBackups(token)
    await updateDriveConfig({ lastBackupAtMs: nowMs })
    config.value = config.value === null ? null : { ...config.value, lastBackupAtMs: nowMs }
    reminder.markBackedUp(nowMs)
    status.value = `Backup ${file.recordCount} data tersimpan di Google Drive.`
  }

  /** Sambungkan Drive: izin Google, kunci dari kata sandi (di worker), lalu backup pertama. */
  async function connect(password: string, schedule: DriveSchedule): Promise<void> {
    await withToken(async (token) => {
      const backupKey = await deriveNewBackupKey(password)
      try {
        await saveDriveConfig(backupKey, schedule)
      } finally {
        backupKey.key.fill(0)
      }
      config.value = { schedule, lastBackupAtMs: null }
      await upload(token)
    })
  }

  async function backupNow(): Promise<void> {
    await withToken(upload)
  }

  async function setSchedule(schedule: DriveSchedule): Promise<void> {
    if (isBusy.value) return
    await run(async () => {
      await updateDriveConfig({ schedule })
      config.value = config.value === null ? null : { ...config.value, schedule }
    })
  }

  /** Putus: cabut token & hapus kunci tersimpan. Berkas yang sudah ada di Drive tetap milik user. */
  async function disconnect(): Promise<void> {
    if (isBusy.value) return
    await run(async () => {
      const token = currentDriveToken()
      forgetDriveToken()
      if (token !== null) await revokeDriveToken(token)
      await clearDriveConfig()
      config.value = null
      status.value = 'Google Drive diputus. Berkas backup yang sudah ada tetap di Drive kamu.'
    })
  }

  /** Daftar versi untuk dipulihkan (dipakai juga di perangkat baru yang belum tersambung). */
  function listVersions(): Promise<DriveFile[] | null> {
    return withToken(async (token) => {
      const files = await listDriveBackups(token)
      if (files.length === 0) status.value = 'Belum ada backup app ini di Google Drive.'
      return files
    })
  }

  function downloadVersion(file: DriveFile): Promise<Uint8Array | null> {
    return withToken((token) => downloadDriveBackup(token, file))
  }

  return {
    isAvailable,
    isConnected,
    isDue,
    isBusy: computed(() => isBusy.value),
    error: computed(() => error.value),
    status: computed(() => status.value),
    config: computed(() => config.value),
    load,
    connect,
    backupNow,
    setSchedule,
    disconnect,
    listVersions,
    downloadVersion,
  }
}

function describeDriveFailure(cause: unknown): string {
  if (
    cause instanceof DriveApiError ||
    cause instanceof DriveAuthError ||
    cause instanceof EncryptedBackupError ||
    cause instanceof BackupExportLimitError
  ) {
    return cause.message
  }
  return cause instanceof Error ? cause.message : 'Backup Google Drive gagal. Coba lagi.'
}
