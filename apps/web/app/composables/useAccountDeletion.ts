import {
  OTP_RESEND_COOLDOWN_SECONDS,
  type DeleteAccountInput,
  type ErrorCode,
} from '@improve-personal/contracts'
import { KEY_SLOTS_LOCAL } from '@improve-personal/core'

import { MS_PER_SECOND } from '~/utils/time'
import { isValidEmail } from '~/utils/validation'
import { AccountRequestError, createAccountGateway } from '~/utils/account/account-gateway'
import type { JsonFetch } from '~/utils/http/json-fetch'
import { LOGIN_PATH } from '~/utils/features'

import { useAuthSession } from './useAuthSession'
import { useLocalData } from './useLocalData'
import { clearAppStorage } from './useLogout'

/**
 * Hapus akun permanen (PRD F15, task T22): konfirmasi email + OTP ulang, lalu bersihkan sesi lokal.
 *
 * Dua keputusan yang menentukan bentuk composable ini:
 *
 * 1. **Kode dikirim ke email SESI, bukan ke kolom yang diketik user.** `POST /v1/account/deletion-otp`
 *    tidak menerima body sama sekali; kalau email boleh dikirim klien, endpoint itu jadi alat spam ke
 *    alamat sembarang. Kolom email di dialog cuma memastikan user sadar akun mana yang dihapus, dan
 *    server menolak kalau nilainya beda dari email sesi.
 * 2. **Sesi lokal dibersihkan setelah server bilang sukses.** Server sudah menghapus baris sesi dan
 *    cookie-nya; menyisakan state client berarti halaman berikutnya memakai `userId` yang tidak ada
 *    lagi. Penyimpanan lokal per akun (`ip-*`) dibuang lewat `clearAppStorage` supaya tidak ada sisa
 *    data milik akun yang sudah tidak ada.
 */

export type AccountDeletionError =
  | 'emailEmpty'
  | 'emailInvalid'
  | 'emailMismatch'
  | 'codeIncomplete'
  | 'codeInvalid'
  | 'rateLimited'
  | 'unavailable'
  | 'generic'

const DELETION_ERROR_BY_CODE: Readonly<Partial<Record<ErrorCode, AccountDeletionError>>> = {
  RATE_LIMITED: 'rateLimited',
  UNAUTHENTICATED: 'generic',
}

export type UseAccountDeletionOptions = {
  /** Transport HTTP, disuntik di test. Default `$fetch` (cookie sesi ikut otomatis). */
  readonly request?: JsonFetch
}

export function useAccountDeletion(options: UseAccountDeletionOptions = {}) {
  const request: JsonFetch = options.request ?? ((path, init) => $fetch(path, init))
  const gateway = createAccountGateway(request)
  const auth = useAuthSession()
  const localData = useLocalData()
  const now = useNow()

  const isSendingCode = useState<boolean>('accountDeletionSendingCode', () => false)
  const isDeleting = useState<boolean>('accountDeletionBusy', () => false)
  const error = useState<AccountDeletionError | null>('accountDeletionError', () => null)
  const resendAt = useState<number>('accountDeletionResendAt', () => 0)

  const resendSecondsLeft = computed(() =>
    Math.max(0, Math.ceil((resendAt.value - now.value) / MS_PER_SECOND)),
  )

  function toError(cause: unknown, validation: AccountDeletionError): AccountDeletionError {
    if (!(cause instanceof AccountRequestError)) return 'generic'
    if (cause.isNetworkError) return 'unavailable'
    if (cause.code === 'VALIDATION_FAILED') return validation

    return DELETION_ERROR_BY_CODE[cause.code] ?? 'generic'
  }

  /** Kirim kode konfirmasi ke email sesi. Jeda kirim ulang dari KONTRAK (server menegakkannya juga). */
  async function requestCode(): Promise<void> {
    // Jeda juga ditegakkan di sini, bukan hanya dengan menonaktifkan tombol: dua klik cepat (atau Enter
    // ganda) tidak boleh menghasilkan dua email konfirmasi untuk aksi destruktif.
    if (isSendingCode.value || resendSecondsLeft.value > 0) return
    isSendingCode.value = true
    error.value = null

    try {
      await gateway.requestDeletionOtp()
      resendAt.value = Date.now() + OTP_RESEND_COOLDOWN_SECONDS * MS_PER_SECOND
    } catch (cause) {
      error.value = toError(cause, 'generic')
    } finally {
      isSendingCode.value = false
    }
  }

  /**
   * Hapus akun. Mengembalikan `true` kalau server sudah menghapus akunnya.
   *
   * Validasi email di sini bukan pengganti otorisasi - server tetap mencocokkan dengan email sesi -
   * tapi mencegah user menghapus akun yang salah ketik tanpa sadar.
   */
  async function remove(sessionEmail: string, input: DeleteAccountInput): Promise<boolean> {
    if (isDeleting.value) return false

    const email = input.email.trim()
    error.value =
      email === ''
        ? 'emailEmpty'
        : !isValidEmail(email)
          ? 'emailInvalid'
          : email.toLowerCase() !== sessionEmail.trim().toLowerCase()
            ? 'emailMismatch'
            : input.code.length !== 6
              ? 'codeIncomplete'
              : null

    if (error.value !== null) return false

    isDeleting.value = true
    try {
      await gateway.deleteAccount({ email, code: input.code })
      await clearLocalAfterDeletion()
      await navigateTo(LOGIN_PATH, { external: true, replace: true })
      return true
    } catch (cause) {
      error.value = toError(cause, 'codeInvalid')
      return false
    } finally {
      isDeleting.value = false
    }
  }

  /**
   * Sesi & penyimpanan lokal milik akun ini dibuang SEBELUM navigasi.
   *
   * Sengaja tidak memanggil `/v1/auth/logout`: baris sesinya sudah tidak ada (hard delete), dan
   * request tambahan ke akun yang sudah dihapus hanya menghasilkan 401. Penghapusan data lokal bersifat
   * best-effort: kegagalan storage (mode privat, tab lain memegang lock) tidak boleh menahan user di
   * akun yang di server sudah tidak ada.
   */
  async function clearLocalAfterDeletion(): Promise<void> {
    const session = localData.current()

    if (session !== null) {
      try {
        await session.storage.wipe()
      } catch {
        // Sisa record terenkripsi tanpa akun tidak bisa dipakai siapa pun; navigasi tetap dilanjutkan.
      }

      for (const slot of KEY_SLOTS_LOCAL) {
        try {
          await session.keyStore.remove(slot)
        } catch {
          // idem: bahan kunci tanpa record bukan data yang bisa dibaca.
        }
      }
    }

    auth.clear()

    try {
      clearAppStorage(localStorage)
    } catch {
      // Storage diblokir (mode privat): tidak ada yang tersimpan, lanjut saja.
    }
  }

  function resetError(): void {
    error.value = null
  }

  return {
    isSendingCode: computed(() => isSendingCode.value),
    isDeleting: computed(() => isDeleting.value),
    error: computed(() => error.value),
    resendSecondsLeft,
    requestCode,
    remove,
    resetError,
  }
}
