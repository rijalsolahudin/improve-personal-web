import {
  apiDataEnvelopeSchema,
  deviceListResultSchema,
  type DeviceDto,
  type ErrorCode,
} from '@improve-personal/contracts'
import type { z } from 'zod'

import { errorCodeFrom, failureOf, isNetworkFailure, type JsonFetch } from '../http/json-fetch'

/**
 * Gateway klien untuk `/v1/devices/*` (PRD F15 halaman "Perangkat", T19 "logout jarak jauh").
 *
 * Yang perlu dipegang di lapisan ini:
 * - **Kepemilikan tidak pernah ditentukan klien.** `revoke` hanya mengirim id; server yang mencocokkan
 *   `(devices.id, user_id dari sesi)`. Perangkat milik orang lain dan id yang tidak ada sama-sama
 *   `NOT_FOUND` - jadi UI tidak boleh (dan tidak bisa) membedakannya.
 * - **Respons divalidasi schema kontrak** (`.strict()`), sehingga kolom baru yang tidak disepakati
 *   ketahuan di batas ini, bukan jadi `undefined` di komponen.
 * - DTO **tidak memuat IP mentah** (hanya kota), jadi tidak ada yang perlu disaring di UI.
 */

const DEVICES_PATH = '/v1/devices'

export type DevicesGateway = {
  /** Daftar perangkat akun ini (termasuk yang sudah di-revoke, sebagai jejak audit). */
  list: () => Promise<readonly DeviceDto[]>
  /** Logout jarak jauh: soft-revoke perangkat + tutup sesinya di server. */
  revoke: (id: string) => Promise<void>
}

/** Kegagalan request perangkat, selalu membawa `code` kontrak. Pesan server tidak jadi teks UI. */
export class DevicesRequestError extends Error {
  readonly code: ErrorCode
  readonly isNetworkError: boolean

  constructor(code: ErrorCode, options: { isNetworkError?: boolean } = {}) {
    super(`Request perangkat gagal (${code})`)
    this.name = 'DevicesRequestError'
    this.code = code
    this.isNetworkError = options.isNetworkError ?? false
  }
}

const listResponseSchema = apiDataEnvelopeSchema(deviceListResultSchema)

export function createDevicesGateway(request: JsonFetch): DevicesGateway {
  function toError(error: unknown): DevicesRequestError {
    if (error instanceof DevicesRequestError) return error

    const failure = failureOf(error)
    return new DevicesRequestError(errorCodeFrom(failure), {
      isNetworkError: isNetworkFailure(failure),
    })
  }

  function readData<T>(schema: z.ZodType<T>) {
    return (body: unknown): T => {
      const parsed = schema.safeParse(body)
      if (!parsed.success) throw new DevicesRequestError('INTERNAL')
      return parsed.data
    }
  }

  return {
    async list() {
      try {
        const { data } = readData(listResponseSchema)(
          await request(DEVICES_PATH, { method: 'GET' }),
        )
        return data.devices
      } catch (error) {
        throw toError(error)
      }
    },

    async revoke(id) {
      try {
        // `204 No Content`: tidak ada body yang bisa diparse, jadi jangan memaksa membaca JSON.
        await request(`${DEVICES_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' })
      } catch (error) {
        throw toError(error)
      }
    },
  }
}
