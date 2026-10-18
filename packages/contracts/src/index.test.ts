import { describe, expect, it } from 'vitest'

import * as accountModule from './account.ts'
import * as authModule from './auth.ts'
import * as devicesModule from './devices.ts'
import * as hlcModule from './hlc.ts'
import * as contracts from './index.ts'
import * as keysModule from './keys.ts'
import * as protocolModule from './protocol.ts'
import * as syncModule from './sync.ts'

/**
 * Nama yang WAJIB ada di permukaan publik paket ini.
 *
 * Test ini penjaga kontrak: `apps/server`, `packages/core`, `apps/web`, dan `apps/mobile` mengimpor
 * dari `@improve-personal/contracts`, jadi menghapus atau mengganti nama satu saja = perubahan breaking
 * yang harus lewat versi protokol baru, bukan diam-diam lolos karena barrel-nya masih "kelihatan rapi".
 */
const NAMA_WAJIB = [
  'API_VERSION',
  'API_PREFIX',
  'ERROR_CODES',
  'ERROR_HTTP_STATUS',
  'GENERIC_ERROR_MESSAGES',
  'apiErrorSchema',
  'apiErrorBodySchema',
  'apiDataEnvelopeSchema',
  'apiResponseSchema',
  'HlcFormatError',
  'compareHlc',
  'formatHlc',
  'parseHlc',
  'tryParseHlc',
  'hlcSchema',
  'clientKindSchema',
  'deviceInfoSchema',
  'emailSchema',
  'otpRequestInputSchema',
  'otpVerifyInputSchema',
  'googleStartQuerySchema',
  'googleStartResultSchema',
  'googleCallbackQuerySchema',
  'sessionDtoSchema',
  'deviceDtoSchema',
  'sealedRecordDtoSchema',
  'syncPushInputSchema',
  'syncPushResultSchema',
  'syncPullQuerySchema',
  'syncPullResultSchema',
  'SYNC_MAX_BATCH',
  'KEY_SLOTS',
  'keySlotSchema',
  'keyEnvelopePutInputSchema',
  'keyTransferCreateResultSchema',
  'KEY_TRANSFER_TTL_SECONDS',
  'otpPurposeSchema',
  'deleteAccountInputSchema',
] as const

/**
 * Modul sumber beserta namespace-nya.
 *
 * Dipakai untuk memeriksa arah yang tidak dijaga `NAMA_WAJIB`: daftar itu cuma membuktikan nama yang
 * SUDAH tercatat masih ada, bukan bahwa ekspor BARU di modul sumber benar-benar ikut keluar lewat
 * barrel. Ekspor yang lupa dimasukkan ke `index.ts` tetap hijau di sana, dan baru ketahuan saat ada
 * paket yang mencoba mengimpornya dari `@improve-personal/contracts`.
 */
const MODULES = {
  'account.ts': accountModule,
  'auth.ts': authModule,
  'devices.ts': devicesModule,
  'hlc.ts': hlcModule,
  'keys.ts': keysModule,
  'protocol.ts': protocolModule,
  'sync.ts': syncModule,
} as const

describe('permukaan publik index.ts', () => {
  it('semua nama yang dipakai paket lain benar-benar terekspor', () => {
    const hilang = NAMA_WAJIB.filter((nama) => !(nama in contracts))

    expect(hilang).toEqual([])
  })

  it('nilai runtime yang jadi patokan lintas paket', () => {
    expect(contracts.API_VERSION).toBe('v1')
    expect(contracts.API_PREFIX).toBe('/v1')
    expect(contracts.ERROR_CODES).toHaveLength(13)
    expect(contracts.KEY_SLOTS).toEqual(['passkey'])
    expect(contracts.SYNC_MAX_BATCH).toBe(500)
    expect(contracts.KEY_TRANSFER_TTL_SECONDS).toBe(120)
    expect(contracts.compareHlc('999-0-a', '1000-0-b')).toBe(-1)
  })

  it('amplop respons tersedia dari barrel: sukses `{ data }`, gagal `{ error }`', () => {
    const sukses = contracts.apiDataEnvelopeSchema(contracts.deviceDtoSchema)
    const endpoint = contracts.apiResponseSchema(contracts.deviceDtoSchema)

    expect(sukses.safeParse({ data: {} }).success).toBe(false)
    expect(
      contracts.apiErrorBodySchema.safeParse({ error: { code: 'INTERNAL', message: 'x' } }).success,
    ).toBe(true)
    expect(contracts.apiErrorBodySchema.safeParse({ code: 'INTERNAL', message: 'x' }).success).toBe(
      false,
    )
    expect(endpoint.safeParse({ error: { code: 'NOT_FOUND', message: 'x' } }).success).toBe(true)
  })

  it('setiap ekspor runtime modul sumber ikut terekspor dari index.ts', () => {
    const hilang = Object.entries(MODULES).flatMap(([nama, modul]) =>
      Object.keys(modul)
        .filter((kunci) => !(kunci in contracts))
        .map((kunci) => `${nama}: ${kunci}`),
    )

    expect(hilang).toEqual([])
  })
})
