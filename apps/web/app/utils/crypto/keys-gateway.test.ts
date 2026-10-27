// @vitest-environment node
//
// Gateway klaim identitas kunci (`/v1/keys/identity`): path, method, body, dan pemetaan error ke kode
// kontrak. Jaringan dimock di batas (`JsonFetch`), bukan composable-nya.
import { describe, expect, it } from 'vitest'

import { KeysRequestError, createKeysGateway } from './keys-gateway'

const KID = 'LBaTVGaXKfW710NOCIXptA'
const CLAIMED = {
  kid: KID,
  claimedAt: '2026-10-27T00:00:00.000Z',
  claimedByDeviceLabel: 'Laptop',
}

describe('gateway keys: identitas kunci', () => {
  it('claimIdentity: PUT /v1/keys/identity dengan body { kid } dan parsing DTO kontrak', async () => {
    const calls: Array<{ path: string; method: string; body?: unknown }> = []
    const gateway = createKeysGateway(async (path, options) => {
      calls.push({ path, method: options.method, body: options.body })
      return { data: CLAIMED }
    })

    await expect(gateway.claimIdentity(KID)).resolves.toEqual(CLAIMED)
    expect(calls).toEqual([{ path: '/v1/keys/identity', method: 'PUT', body: { kid: KID } }])
  })

  it('getIdentity: GET tanpa body; akun belum mengklaim = kid null', async () => {
    const calls: Array<{ path: string; method: string; body?: unknown }> = []
    const gateway = createKeysGateway(async (path, options) => {
      calls.push({ path, method: options.method, body: options.body })
      return { data: { kid: null, claimedAt: null, claimedByDeviceLabel: null } }
    })

    await expect(gateway.getIdentity()).resolves.toMatchObject({ kid: null })
    expect(calls).toEqual([{ path: '/v1/keys/identity', method: 'GET', body: undefined }])
  })

  it('409 KEY_IDENTITY_CONFLICT dipetakan ke KeysRequestError berkode itu', async () => {
    const gateway = createKeysGateway(async () => {
      throw {
        status: 409,
        data: {
          error: {
            code: 'KEY_IDENTITY_CONFLICT',
            message: 'x',
            details: { claimedAt: CLAIMED.claimedAt, claimedByDeviceLabel: null },
          },
        },
      }
    })

    const failure = gateway.claimIdentity(KID)
    await expect(failure).rejects.toBeInstanceOf(KeysRequestError)
    await expect(failure).rejects.toMatchObject({
      code: 'KEY_IDENTITY_CONFLICT',
      isNetworkError: false,
    })
  })

  it('kegagalan jaringan dibedakan, dan respons menyimpang dilaporkan INTERNAL', async () => {
    const offline = createKeysGateway(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(offline.claimIdentity(KID)).rejects.toMatchObject({ isNetworkError: true })

    const malformed = createKeysGateway(async () => ({ data: { kid: 'bukan-kid' } }))
    await expect(malformed.getIdentity()).rejects.toMatchObject({ code: 'INTERNAL' })
  })
})
