import { GUARD_STORE, KEY_DATABASE_NAME, openKeyDatabase, type RecoveryGuardRow } from './key-store'

/**
 * Batas percobaan frasa recovery DI PERANGKAT (ARCHITECTURE §7).
 *
 * Kenapa di perangkat dan bukan di server: server tidak mengirim dan tidak menyimpan envelope recovery
 * (ADR 11), jadi jalur ini memang jalan tanpa server - dan tidak ada apa pun di sisi server yang bisa
 * dipakai untuk membatasinya. Kalau pembatasan ini tidak ada, 24 kata bisa diserang offline sepuasnya
 * dengan Argon2id yang justru jadi memperlambat tapi tidak menghentikan.
 *
 * Kenapa disimpan di IndexedDB (bukan di memori): hitungan yang cuma hidup di memori bisa direset
 * dengan reload - dan itu satu-satunya hal yang perlu dilakukan penyerang.
 */

/** Jumlah percobaan gagal sebelum dikunci. */
export const RECOVERY_MAX_ATTEMPTS = 5

/** Lama kunci setelah percobaan habis. "Sebentar" saja: user yang salah ketik 5x biasanya baru sadar. */
export const RECOVERY_LOCK_MS = 5 * 60_000

/** Kunci baris singleton di `recovery_guard`. */
const GUARD_STATE_KEY = 'current'

export type RecoveryGuardStatus = {
  readonly locked: boolean
  /** Waktu (epoch ms) sampai kapan terkunci; `null` kalau tidak terkunci. */
  readonly lockedUntilMs: number | null
  /** Sisa percobaan sebelum terkunci. */
  readonly remainingAttempts: number
}

export type RecoveryGuard = {
  /** Status sekarang. Membaca TIDAK menulis apa pun. */
  status: () => Promise<RecoveryGuardStatus>
  /** Catat satu percobaan gagal; kembalikan status setelahnya. */
  registerFailure: () => Promise<RecoveryGuardStatus>
  /** Reset setelah percobaan berhasil. */
  reset: () => Promise<void>
}

export type RecoveryGuardOptions = {
  /** Nama database kunci. Sama dengan `createWebKeyStore` supaya berbagi database. */
  readonly databaseName?: string
  /** Sumber waktu, disuntik supaya test bisa memeriksa kedaluwarsa kunci tanpa menunggu. */
  readonly now?: () => number
}

function freshStatus(): RecoveryGuardStatus {
  return { locked: false, lockedUntilMs: null, remainingAttempts: RECOVERY_MAX_ATTEMPTS }
}

/**
 * Hitung status dari baris yang tersimpan.
 *
 * Kunci yang sudah lewat waktunya diperlakukan sebagai BELUM PERNAH gagal (jatah penuh lagi). Itu
 * keputusan sadar: mengunci permanen setelah 5 kali salah membuat satu kali salah ketik menghabisi
 * akses user sendiri ke datanya.
 */
function statusFromRow(row: RecoveryGuardRow | undefined, nowMs: number): RecoveryGuardStatus {
  if (row === undefined) return freshStatus()

  if (row.lockedUntilMs !== null && nowMs < row.lockedUntilMs) {
    return { locked: true, lockedUntilMs: row.lockedUntilMs, remainingAttempts: 0 }
  }

  if (row.lockedUntilMs !== null) return freshStatus()

  return {
    locked: false,
    lockedUntilMs: null,
    remainingAttempts: Math.max(0, RECOVERY_MAX_ATTEMPTS - row.failedAttempts),
  }
}

export function createRecoveryGuard(options: RecoveryGuardOptions = {}): RecoveryGuard {
  const databaseName = options.databaseName ?? KEY_DATABASE_NAME
  const now = options.now ?? Date.now

  let databasePromise: ReturnType<typeof openKeyDatabase> | null = null

  function database(): ReturnType<typeof openKeyDatabase> {
    databasePromise ??= openKeyDatabase(databaseName)
    return databasePromise
  }

  async function readRow(): Promise<RecoveryGuardRow | undefined> {
    const db = await database()
    return db.get(GUARD_STORE, GUARD_STATE_KEY)
  }

  async function writeRow(row: RecoveryGuardRow | null): Promise<void> {
    const db = await database()
    const tx = db.transaction(GUARD_STORE, 'readwrite', { durability: 'strict' })

    try {
      if (row === null) await tx.objectStore(GUARD_STORE).delete(GUARD_STATE_KEY)
      else await tx.objectStore(GUARD_STORE).put(row)
      await tx.done
    } catch (error) {
      tx.abort()
      await tx.done.catch(() => undefined)
      throw error
    }
  }

  return {
    async status(): Promise<RecoveryGuardStatus> {
      return statusFromRow(await readRow(), now())
    },

    async registerFailure(): Promise<RecoveryGuardStatus> {
      const nowMs = now()
      const current = statusFromRow(await readRow(), nowMs)

      // Terkunci: tidak menambah hitungan apa pun. Percobaan yang ditolak sebelum dicek tidak boleh
      // memperpanjang hukuman (kalau tidak, menyerang terus-menerus = terkunci selamanya).
      if (current.locked) return current

      const failedAttempts = RECOVERY_MAX_ATTEMPTS - current.remainingAttempts + 1
      const lockedUntilMs =
        failedAttempts >= RECOVERY_MAX_ATTEMPTS ? nowMs + RECOVERY_LOCK_MS : null

      await writeRow({ id: GUARD_STATE_KEY, failedAttempts, lockedUntilMs })

      return {
        locked: lockedUntilMs !== null,
        lockedUntilMs,
        remainingAttempts: Math.max(0, RECOVERY_MAX_ATTEMPTS - failedAttempts),
      }
    },

    async reset(): Promise<void> {
      await writeRow(null)
    },
  }
}
