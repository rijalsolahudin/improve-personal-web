// @vitest-environment node
import { HttpError } from '@improve-personal/core'
import { describe, expect, it, vi } from 'vitest'

import { createSyncHttpClient, SYNC_EXPECTED_USER_HEADER, type SyncFetcher } from './client'

const EXPECTED_USER_ID = '11111111-1111-4111-8111-111111111111'

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function clientWith(fetcher: SyncFetcher) {
  return createSyncHttpClient({ baseUrl: 'https://app.test', fetcher })
}

describe('createSyncHttpClient', () => {
  it('mengirim body JSON dan membuka amplop { data } untuk push', async () => {
    const fetcher = vi.fn<SyncFetcher>(async () =>
      response(200, { data: { results: [{ id: 'a', status: 'applied', serverSeq: 1 }] } }),
    )

    const client = clientWith(fetcher)
    const result = await client.postJson('/v1/sync/push', { records: [] })

    expect(result).toEqual({ results: [{ id: 'a', status: 'applied', serverSeq: 1 }] })
    expect(fetcher).toHaveBeenCalledWith(
      'https://app.test/v1/sync/push',
      expect.objectContaining({ method: 'POST', body: '{"records":[]}' }),
    )
  })

  it('memakai path + query dari URL core, bukan origin pemanggil', async () => {
    const fetcher = vi.fn<SyncFetcher>(async () => response(200, { data: { records: [] } }))
    const client = clientWith(fetcher)

    await client.getJson('https://evil.test/v1/sync/pull?cursor=7&limit=10')

    expect(fetcher).toHaveBeenCalledWith(
      'https://app.test/v1/sync/pull?cursor=7&limit=10',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('memetakan status error ke HttpError dengan kode kontrak', async () => {
    const client = clientWith(async () =>
      response(409, { error: { code: 'SYNC_RESET_REQUIRED', message: 'reset' } }),
    )

    await expect(client.getJson('/v1/sync/pull?cursor=1&limit=10')).rejects.toMatchObject({
      name: 'HttpError',
      status: 409,
      code: 'SYNC_RESET_REQUIRED',
    })
  })

  it('meneruskan kegagalan jaringan sebagai error non-HttpError (artinya offline)', async () => {
    const client = clientWith(async () => {
      throw new TypeError('fetch failed')
    })

    const failure = client.getJson('/v1/sync/pull')

    await expect(failure).rejects.toBeInstanceOf(TypeError)
    await expect(failure).rejects.not.toBeInstanceOf(HttpError)
  })

  it('mengirim header identitas pemilik data lokal pada push & pull', async () => {
    const fetcher = vi.fn<SyncFetcher>(async () => response(200, { data: { records: [] } }))
    const client = createSyncHttpClient({
      baseUrl: 'https://app.test',
      fetcher,
      expectedUserId: EXPECTED_USER_ID,
    })

    await client.getJson('/v1/sync/pull?cursor=1&limit=10')
    await client.postJson('/v1/sync/push', { records: [] })

    for (const call of fetcher.mock.calls) {
      expect(call[1].headers[SYNC_EXPECTED_USER_HEADER]).toBe(EXPECTED_USER_ID)
    }
  })

  it('membatalkan request jaringan saat signal pemanggil di-abort (stopSync)', async () => {
    // Regresi QA T76 H1: `stopSync()` hanya berguna kalau sinyalnya benar-benar sampai ke `fetch`.
    // Tanpa test ini, `mergeSignal` bisa diam-diam membuang sinyal pemanggil dan siklus akun lama
    // tetap selesai membawa data sesi lama.
    const controller = new AbortController()
    let sawAbort = false

    const fetcher = vi.fn<SyncFetcher>(async (_url, init) => {
      if (init.signal === undefined) throw new Error('signal pemanggil tidak diteruskan ke fetch')

      return await new Promise<never>((_resolve, reject) => {
        const onAbort = (): void => {
          sawAbort = true
          reject(new Error('aborted'))
        }

        if (init.signal?.aborted === true) {
          onAbort()
          return
        }

        init.signal?.addEventListener('abort', onAbort, { once: true })
      })
    })

    const client = createSyncHttpClient({
      baseUrl: 'https://app.test',
      fetcher,
      expectedUserId: EXPECTED_USER_ID,
    })

    const running = client.getJson('/v1/sync/pull?cursor=0&limit=10', {
      signal: controller.signal,
    })

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    controller.abort()

    await expect(running).rejects.toThrow('aborted')
    expect(sawAbort).toBe(true)
  })

  it('tanpa `expectedUserId` header identitas tidak dikirim (bukan string kosong)', async () => {
    const fetcher = vi.fn<SyncFetcher>(async () => response(200, { data: { records: [] } }))
    const client = clientWith(fetcher)

    await client.getJson('/v1/sync/pull')

    expect(fetcher.mock.calls[0]?.[1].headers).not.toHaveProperty(SYNC_EXPECTED_USER_HEADER)
  })

  it('fallback tanpa AbortSignal.any tetap meneruskan abort pemanggil', async () => {
    const originalAny = AbortSignal.any
    // Browser lama (Safari 16-17.3 dll) tidak punya AbortSignal.any. Fallback tidak boleh membuang
    // sinyal pemanggil, kalau tidak `stopSync()` tidak membatalkan request yang sedang jalan.
    Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true })

    try {
      const controller = new AbortController()
      let sawAbort = false
      const fetcher = vi.fn<SyncFetcher>(
        async (_url, init) =>
          await new Promise<never>((_resolve, reject) => {
            const onAbort = (): void => {
              sawAbort = true
              reject(new Error('aborted'))
            }

            if (init.signal?.aborted === true) return onAbort()
            init.signal?.addEventListener('abort', onAbort, { once: true })
          }),
      )

      const client = createSyncHttpClient({ baseUrl: 'https://app.test', fetcher })
      const running = client.getJson('/v1/sync/pull', { signal: controller.signal })

      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
      controller.abort()

      await expect(running).rejects.toThrow('aborted')
      expect(sawAbort).toBe(true)
    } finally {
      Object.defineProperty(AbortSignal, 'any', {
        value: originalAny,
        configurable: true,
      })
    }
  })
})
