import { KEY_TRANSFER_TTL_SECONDS } from '@improve-personal/contracts'
import type { SecureKeyStore } from '@improve-personal/core'

import {
  buildRequestQr,
  buildResponseQr,
  isPairingExpired,
  PairingQrError,
  parseRequestQr,
  parseResponseQr,
} from '~/utils/account/pairing'
import { saveDeviceUnlock } from '~/utils/crypto/device-slot'
import { createWebKeyStore } from '~/utils/crypto/key-store'
import { KeysRequestError, createKeysGateway } from '~/utils/crypto/keys-gateway'
import { zeroKey } from '~/utils/crypto/master-key'
import {
  createTransferRequest,
  sealTransferResponse,
  type TransferRequest,
} from '~/utils/crypto/transfer'
import type { JsonFetch } from '~/utils/http/json-fetch'
import { hasStoredRecords, keyDatabaseName } from '~/utils/storage/session'

import { useAuthSession } from './useAuthSession'
import { useLocalData } from './useLocalData'

/**
 * Tambah perangkat lewat QR (PRD F15 "Tambah Perangkat (ala WhatsApp)", ARCHITECTURE §7).
 *
 * Alurnya dua QR karena server memisahkan "membungkus" dan "mengklaim" (lihat `utils/account/pairing.ts`).
 * Yang perlu dipegang di lapisan ini:
 *
 * - **Kunci utama tidak pernah disimpan di state Vue.** Ia hanya hidup di dalam closure permintaan
 *   transfer (`TransferRequest.openSealed`) dan di argumen `saveDeviceUnlock`, lalu dikosongkan
 *   (`zeroKey`). `ref`/`useState` di sini hanya berisi payload QR yang memang publik dan status UI.
 * - **Masa berlaku & sekali pakai ditegakkan server** (`key_transfers.expires_at`/`claimed_at`).
 *   Hitungan 120 detik di sini hanya untuk QR yang SEDANG ditampilkan: QR basi tidak boleh dipakai
 *   membungkus kunci utama, karena blob-nya tidak akan bisa diklaim.
 * - **Perangkat ini baru vs sudah punya kunci** menentukan arah. Perangkat baru tidak pernah butuh
 *   kunci utama yang sudah ada; perangkat lama tidak boleh menimpa pembuka perangkatnya.
 */

export type DevicePairingError =
  'qr' | 'expired' | 'noSession' | 'locked' | 'alreadyPaired' | 'server'

export type DevicePairingStep = 'idle' | 'request' | 'response' | 'done'

/** Hasil klaim yang perlu diketahui pemanggil. */
export type DevicePairingResult = {
  /**
   * True = pembuka perangkat yang lama DITIMPA kunci hasil transfer.
   *
   * Sesi data lokal yang sedang hidup masih memegang kunci LAMA, jadi pemanggil wajib memuat ulang
   * aplikasi setelah ini - kalau tidak, tulisan berikutnya memakai kunci yang bukan milik akun lagi.
   */
  readonly replacedKey: boolean
}

export type UseDevicePairingOptions = {
  /** Transport HTTP, disuntik di test. Default `$fetch` (cookie sesi ikut otomatis). */
  readonly request?: JsonFetch
  /** Penyimpan kunci milik akun. Disuntik di test supaya tidak butuh IndexedDB. */
  readonly keyStore?: (userId: string) => SecureKeyStore
  /** Operasi berkunci utama (perangkat lama). Disuntik di test; default sesi data lokal. */
  readonly masterKey?: <T>(work: (masterKey: Uint8Array) => Promise<T>) => Promise<T>
  /** Dipanggil setelah perangkat ini berhasil menerima kunci (default: segarkan status akun). */
  readonly onPaired?: (result: DevicePairingResult) => Promise<void>
  /**
   * Boleh menimpa pembuka perangkat yang SUDAH ada dengan kunci hasil transfer? Default: hanya kalau
   * perangkat ini belum menyimpan satu record pun.
   *
   * Disuntik di test karena defaultnya membaca sesi data lokal (IndexedDB + lingkungan browser).
   */
  readonly canReplaceDeviceKey?: () => Promise<boolean>
}

class PairingSessionError extends Error {
  readonly reason: 'noSession' | 'locked' | 'alreadyPaired'

  constructor(reason: 'noSession' | 'locked' | 'alreadyPaired') {
    super(`sesi pairing tidak siap (${reason})`)
    this.name = 'PairingSessionError'
    this.reason = reason
  }
}

export function useDevicePairing(options: UseDevicePairingOptions = {}) {
  const auth = useAuthSession()
  const localData = useLocalData()
  const now = useNow()
  const request: JsonFetch = options.request ?? ((path, init) => $fetch(path, init))
  const keys = createKeysGateway(request)

  const step = ref<DevicePairingStep>('idle')
  const qrValue = ref<string | null>(null)
  /** Waktu kedaluwarsa QR yang sedang tampil (`null` = belum ada). */
  const deadlineMs = ref<number | null>(null)
  const error = ref<DevicePairingError | null>(null)
  const busy = ref(false)

  /**
   * Permintaan transfer yang sedang berjalan. Disimpan di closure modul composable, BUKAN di `ref`:
   * di dalamnya ada private key ephemeral, dan state reaktif ikut terbaca siapa pun yang memegang
   * instance komponen.
   */
  let pending: TransferRequest | null = null

  const secondsLeft = computed(() =>
    deadlineMs.value === null ? 0 : Math.max(0, Math.ceil((deadlineMs.value - now.value) / 1000)),
  )
  const isExpired = computed(
    () => deadlineMs.value !== null && isPairingExpired(deadlineMs.value, now.value),
  )

  function reset(): void {
    step.value = 'idle'
    qrValue.value = null
    deadlineMs.value = null
    error.value = null
    pending = null
  }

  async function requireSession() {
    const session = await auth.ensureLoaded()
    if (session === null) throw new PairingSessionError('noSession')
    return session
  }

  function keyStoreFor(userId: string): SecureKeyStore {
    return (
      options.keyStore?.(userId) ?? createWebKeyStore({ databaseName: keyDatabaseName(userId) })
    )
  }

  async function withMasterKey<T>(work: (masterKey: Uint8Array) => Promise<T>): Promise<T> {
    if (options.masterKey !== undefined) return options.masterKey(work)

    const session = await localData.ensure()
    if (session === null) throw new PairingSessionError('locked')

    return session.withMasterKey(work)
  }

  /**
   * Boleh menimpa pembuka perangkat yang sudah ada dengan kunci hasil transfer?
   *
   * `openLocalDataSession` membuat kunci utama baru setiap kali server belum punya envelope passkey -
   * termasuk di perangkat kedua yang sebenarnya mau dipasangkan. Tanpa pengecualian ini, klaim QR
   * selalu ditolak `alreadyPaired`, padahal perangkatnya belum menyimpan apa pun dengan kunci itu.
   *
   * Syaratnya ketat dan sengaja tidak melihat "fresh" saja: kunci boleh ditimpa HANYA kalau tidak ada
   * satu record pun di perangkat ini. Kalau ada, record itu terenkripsi kunci lama dan menimpanya
   * berarti data tersebut tidak akan pernah bisa dibuka - menolak pairing jauh lebih baik.
   */
  async function canReplaceDeviceKey(): Promise<boolean> {
    if (options.canReplaceDeviceKey !== undefined) return options.canReplaceDeviceKey()

    const session = await localData.ensure()
    if (session === null) return false

    return !(await hasStoredRecords(session.storage))
  }

  /** Perangkat BARU: buat keypair ephemeral lalu tampilkan QR permintaan. */
  async function startAsNewDevice(): Promise<void> {
    reset()
    busy.value = true

    try {
      const session = await requireSession()
      pending = await createTransferRequest()
      qrValue.value = buildRequestQr(pending.qrPayload, session.device.id)
      // QR yang menampilkan keypair lama tidak berguna lagi setelah perangkat lama selesai; batas yang
      // sama dengan TTL transfer (120 detik) membuat tampilan ini tidak menjanjikan lebih dari server.
      deadlineMs.value = now.value + KEY_TRANSFER_TTL_SECONDS * 1000
      step.value = 'request'
    } catch (cause) {
      error.value = describe(cause)
    } finally {
      busy.value = false
    }
  }

  /** Perangkat BARU: pindai/tempel QR jawaban, klaim envelope, simpan pembuka perangkat. */
  async function claimResponse(text: string): Promise<void> {
    if (busy.value) return
    busy.value = true
    error.value = null

    try {
      if (pending === null) throw new PairingSessionError('noSession')
      const session = await requireSession()
      const { id } = parseResponseQr(text.trim())

      // Diperiksa SEBELUM klaim: klaim bersifat sekali pakai, jadi perangkat yang sudah punya kunci
      // tidak boleh "membakar" kiriman yang masih dibutuhkan perangkat lain. Pengecualiannya perangkat
      // yang kuncinya dibuat otomatis dan belum dipakai menyimpan apa pun (lihat `canReplaceDeviceKey`).
      const keyStore = keyStoreFor(session.user.id)
      const replacedKey = await keyStore.has('device')
      if (replacedKey && !(await canReplaceDeviceKey())) {
        throw new PairingSessionError('alreadyPaired')
      }

      const { blob } = await keys.claimTransfer(id)
      const masterKey = await pending.openSealed(blob)

      try {
        // Diperiksa ULANG tepat sebelum menimpa: antara klaim dikirim dan blob diterima, tab lain bisa
        // saja sudah menulis record dengan kunci lama. Klaim yang hangus lebih murah daripada data yang
        // tidak bisa dibuka lagi.
        if (replacedKey && !(await canReplaceDeviceKey())) {
          throw new PairingSessionError('alreadyPaired')
        }

        // `saveDeviceUnlock` sengaja menolak menimpa slot yang terisi ("pakai rotasi eksplisit").
        // Perangkat yang kuncinya dibuat otomatis aman dirotasi: `canReplaceDeviceKey` sudah memastikan
        // tidak ada satu record pun yang dienkripsi kunci lama, jadi yang dibuang bukan data.
        if (replacedKey) await keyStore.remove('device')
        await saveDeviceUnlock(keyStore, masterKey)
      } finally {
        zeroKey(masterKey)
      }

      pending = null
      step.value = 'done'
      deadlineMs.value = null
      await options.onPaired?.({ replacedKey })
    } catch (cause) {
      error.value = describe(cause)
    } finally {
      busy.value = false
    }
  }

  /** Perangkat LAMA: bungkus kunci utama untuk QR permintaan, lalu tampilkan QR jawaban. */
  async function pairFromRequest(text: string): Promise<void> {
    if (busy.value) return
    busy.value = true
    error.value = null

    try {
      await requireSession()
      const { payload, deviceId } = parseRequestQr(text.trim())

      const blob = await withMasterKey((masterKey) =>
        sealTransferResponse(JSON.stringify(payload), masterKey),
      )
      const result = await keys.createTransfer({ targetDeviceId: deviceId, blob })

      qrValue.value = buildResponseQr(result)
      // Masa berlaku ditentukan SERVER (`expiresAt`), bukan dihitung ulang di sini.
      deadlineMs.value = Date.parse(result.expiresAt)
      step.value = 'response'
    } catch (cause) {
      error.value = describe(cause)
    } finally {
      busy.value = false
    }
  }

  return {
    step: computed(() => step.value),
    qrValue: computed(() => qrValue.value),
    secondsLeft,
    isExpired,
    error: computed(() => error.value),
    busy: computed(() => busy.value),
    startAsNewDevice,
    claimResponse,
    pairFromRequest,
    reset,
    clearError: () => {
      error.value = null
    },
  }
}

function describe(cause: unknown): DevicePairingError {
  if (cause instanceof PairingQrError) return 'qr'
  if (cause instanceof PairingSessionError) return cause.reason
  if (cause instanceof KeysRequestError) {
    // Server menjawab `NOT_FOUND` yang sama untuk "tidak ada / kedaluwarsa / sudah diklaim / bukan
    // perangkat ini" (supaya tidak jadi oracle). "Kedaluwarsa atau sudah dipakai" adalah bacaan yang
    // paling mungkin bagi user.
    return cause.code === 'NOT_FOUND' ? 'expired' : 'server'
  }

  return 'server'
}
