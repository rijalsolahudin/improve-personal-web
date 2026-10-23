import type { DeleteAccountInput, ErrorCode } from '@improve-personal/contracts'

import { errorCodeFrom, failureOf, isNetworkFailure, type JsonFetch } from '../http/json-fetch'

/**
 * Gateway klien untuk hapus akun (PRD F15 "Hapus Akun Permanen").
 *
 * Dua langkah, dan urutannya mengikat: `POST /v1/account/deletion-otp` mengirim kode ber-`purpose`
 * `delete_account` ke email SESI (bukan email yang diketik user), lalu `DELETE /v1/account` dengan
 * email + kode itu. Server yang memutuskan akun mana yang dihapus (sesi + kode); field `email` di body
 * cuma penegasan user, bukan penentu.
 *
 * Yang sengaja tidak ada di sini: field `confirm`/`force`. Konfirmasi lewat string yang bisa ditulis
 * siapa saja dari console bukan bukti kepemilikan - kodenya yang jadi bukti.
 */

const DELETION_OTP_PATH = '/v1/account/deletion-otp'
const ACCOUNT_PATH = '/v1/account'

export type AccountGateway = {
  /** Kirim kode konfirmasi ke email sesi. Respons `204` tanpa body, sengaja tidak membedakan apa pun. */
  requestDeletionOtp: () => Promise<void>
  /** Hapus akun permanen. Sukses = `204`; cookie sesi dibersihkan server. */
  deleteAccount: (input: DeleteAccountInput) => Promise<void>
}

/** Kegagalan request akun, selalu membawa `code` kontrak. Pesan server tidak jadi teks UI. */
export class AccountRequestError extends Error {
  readonly code: ErrorCode
  readonly isNetworkError: boolean

  constructor(code: ErrorCode, options: { isNetworkError?: boolean } = {}) {
    super(`Request akun gagal (${code})`)
    this.name = 'AccountRequestError'
    this.code = code
    this.isNetworkError = options.isNetworkError ?? false
  }
}

export function createAccountGateway(request: JsonFetch): AccountGateway {
  function toError(error: unknown): AccountRequestError {
    if (error instanceof AccountRequestError) return error

    const failure = failureOf(error)
    return new AccountRequestError(errorCodeFrom(failure), {
      isNetworkError: isNetworkFailure(failure),
    })
  }

  return {
    async requestDeletionOtp() {
      try {
        await request(DELETION_OTP_PATH, { method: 'POST' })
      } catch (error) {
        throw toError(error)
      }
    },

    async deleteAccount(input) {
      try {
        // `204 No Content`: tidak ada body yang bisa diparse, jadi jangan memaksa membaca JSON.
        await request(ACCOUNT_PATH, {
          method: 'DELETE',
          body: { email: input.email, code: input.code },
        })
      } catch (error) {
        throw toError(error)
      }
    },
  }
}
