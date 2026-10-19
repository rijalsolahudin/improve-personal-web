import {
  apiDataEnvelopeSchema,
  keyEnvelopeDtoSchema,
  keyEnvelopeListResultSchema,
  keyTransferClaimResultSchema,
  keyTransferCreateResultSchema,
  type ErrorCode,
  type KeyEnvelopeDto,
  type KeyEnvelopePutInput,
  type KeyTransferClaimResult,
  type KeyTransferCreateResult,
} from '@improve-personal/contracts'
import type { z } from 'zod'

import { errorCodeFrom, failureOf, isNetworkFailure, type JsonFetch } from '../http/json-fetch'

/**
 * Gateway klien untuk `/v1/keys/*` (ARCHITECTURE §7, ADR 10-12).
 *
 * Yang perlu dipegang di lapisan ini: server cuma menyimpan blob opak - dan memang tidak ada kode di
 * sini yang membukanya. Envelope `passkey` naik-turun lewat sini; envelope `device` dan `recovery`
 * TIDAK PERNAH lewat sini, karena keduanya bukan milik server (ADR 11-12, `KEY_SLOTS = ['passkey']`).
 *
 * Semua respons divalidasi schema KONTRAK (`.strict()`): bentuk server yang menyimpang ketahuan di
 * batas ini, bukan jadi `undefined` yang menjalar ke UI.
 */

const ENVELOPES_PATH = '/v1/keys/envelopes'
const TRANSFER_PATH = '/v1/keys/transfer'

export type KeysGateway = {
  /** Simpan/timpa envelope slot `passkey`. Server membalas envelope yang tersimpan. */
  putEnvelope: (input: KeyEnvelopePutInput) => Promise<KeyEnvelopeDto>
  /** Envelope yang tersimpan untuk user ini (maksimum satu per slot yang sah). */
  listEnvelopes: () => Promise<readonly KeyEnvelopeDto[]>
  /** Perangkat lama menitipkan kunci utama terenkripsi ke perangkat target. */
  createTransfer: (input: {
    readonly targetDeviceId: string
    readonly blob: string
  }) => Promise<KeyTransferCreateResult>
  /** Perangkat target mengklaim kiriman (sekali pakai, TTL ditentukan server). */
  claimTransfer: (id: string) => Promise<KeyTransferClaimResult>
}

/** Kegagalan request keys, selalu membawa `code` kontrak. Pesan server tidak pernah jadi teks UI. */
export class KeysRequestError extends Error {
  readonly code: ErrorCode
  readonly isNetworkError: boolean

  constructor(code: ErrorCode, options: { isNetworkError?: boolean } = {}) {
    super(`Request keys gagal (${code})`)
    this.name = 'KeysRequestError'
    this.code = code
    this.isNetworkError = options.isNetworkError ?? false
  }
}

/**
 * Amplop sukses per DTO, dari schema kontrak.
 *
 * `apiDataEnvelopeSchema` (`.strict()`) menolak respons yang memuat field di luar `{ data }` - jadi
 * server yang tiba-tiba mengirim bentuk lain ketahuan di sini, bukan di komponen.
 */
const putEnvelopeResponseSchema = apiDataEnvelopeSchema(keyEnvelopeDtoSchema)
const listEnvelopesResponseSchema = apiDataEnvelopeSchema(keyEnvelopeListResultSchema)
const createTransferResponseSchema = apiDataEnvelopeSchema(keyTransferCreateResultSchema)
const claimTransferResponseSchema = apiDataEnvelopeSchema(keyTransferClaimResultSchema)

export function createKeysGateway(request: JsonFetch): KeysGateway {
  /** Baca `{ data: T }`; bentuk yang menyimpang dari kontrak dilaporkan sebagai `INTERNAL`. */
  function readData<T>(schema: z.ZodType<T>): (body: unknown) => T {
    return (body) => {
      const parsed = schema.safeParse(body)
      if (!parsed.success) {
        // Server menjawab, tapi jawabannya bukan yang kita sepakati - bukan salah input user, dan
        // bukan kegagalan jaringan.
        throw new KeysRequestError('INTERNAL')
      }
      return parsed.data
    }
  }

  /** Satu jalur request: kegagalan jaringan/HTTP/bentuk respons -> `KeysRequestError`. */
  async function call<T>(
    path: string,
    options: { readonly method: 'GET' | 'POST' | 'PUT'; readonly body?: Record<string, unknown> },
    parse: (body: unknown) => T,
  ): Promise<T> {
    try {
      return parse(await request(path, options))
    } catch (error) {
      if (error instanceof KeysRequestError) throw error

      const failure = failureOf(error)
      throw new KeysRequestError(errorCodeFrom(failure), {
        isNetworkError: isNetworkFailure(failure),
      })
    }
  }

  return {
    async putEnvelope(input) {
      const { data } = await call(
        ENVELOPES_PATH,
        { method: 'PUT', body: input as unknown as Record<string, unknown> },
        readData(putEnvelopeResponseSchema),
      )
      return data
    },

    async listEnvelopes() {
      const { data } = await call(
        ENVELOPES_PATH,
        { method: 'GET' },
        readData(listEnvelopesResponseSchema),
      )
      return data.envelopes
    },

    async createTransfer(input) {
      const { data } = await call(
        TRANSFER_PATH,
        { method: 'POST', body: input as unknown as Record<string, unknown> },
        readData(createTransferResponseSchema),
      )
      return data
    },

    async claimTransfer(id) {
      const { data } = await call(
        `${TRANSFER_PATH}/${encodeURIComponent(id)}`,
        { method: 'POST' },
        readData(claimTransferResponseSchema),
      )
      return data
    },
  }
}
