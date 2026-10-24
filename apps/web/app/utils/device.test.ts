import { DEVICE_NAME_MAX_LENGTH, deviceInfoSchema, uuidSchema } from '@improve-personal/contracts'
import { beforeEach, describe, expect, it } from 'vitest'

import { currentDeviceInfo, deviceNameFromUserAgent } from './device'
import {
  INSTALLATION_ID_STORAGE_KEY,
  currentInstallationId,
  resetInstallationIdForTest,
} from './device-installation'

const UA = {
  chromeLinux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  operaWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/115.0.0.0',
  firefoxMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
} as const

describe('deviceNameFromUserAgent', () => {
  it.each([
    [UA.chromeLinux, 'Chrome di Linux'],
    [UA.edgeWindows, 'Edge di Windows'],
    [UA.operaWindows, 'Opera di Windows'],
    [UA.firefoxMac, 'Firefox di macOS'],
    [UA.safariIphone, 'Safari di iOS'],
    // Android dicek sebelum Linux: UA-nya memuat "Linux", tapi perangkatnya jelas Android.
    [UA.chromeAndroid, 'Chrome di Android'],
  ])('mengenali %s', (userAgent, expected) => {
    expect(deviceNameFromUserAgent(userAgent)).toBe(expected)
  })

  it('deterministik: input sama menghasilkan nama sama (bukan acak seperti Math.random)', () => {
    expect(deviceNameFromUserAgent(UA.chromeLinux)).toBe(deviceNameFromUserAgent(UA.chromeLinux))
  })

  it('User-Agent yang tidak dikenali memakai potongan UA-nya, bukan nama generik', () => {
    expect(deviceNameFromUserAgent('SomeBot/1.0 (compatible)')).toBe('SomeBot/1.0 (compatible)')
  })

  it.each(['', '   ', '\u0001\u0002'])(
    'UA tanpa petunjuk (%j) → nama cadangan non-kosong',
    (ua) => {
      expect(deviceNameFromUserAgent(ua)).toBe('Browser web')
    },
  )

  it('membuang karakter kontrol dan memotong ke DEVICE_NAME_MAX_LENGTH', () => {
    const name = deviceNameFromUserAgent(`\u0001Unknow n\u0007Browser ${'x'.repeat(200)}`)
    // Dicek per code unit, bukan lewat regex rentang kontrol (`no-control-regex` melarangnya).
    const hasControlCharacter = [...name].some((char) => {
      const code = char.codePointAt(0) ?? 0
      return code < 0x20 || code === 0x7f
    })

    expect(name).toHaveLength(DEVICE_NAME_MAX_LENGTH)
    expect(hasControlCharacter).toBe(false)
  })

  it.each(Object.values(UA))('nama yang dihasilkan lolos deviceNameSchema: %s', (userAgent) => {
    const parsed = deviceInfoSchema.safeParse({
      name: deviceNameFromUserAgent(userAgent),
      platform: 'web',
    })

    expect(parsed.success).toBe(true)
  })
})

describe('currentDeviceInfo', () => {
  beforeEach(() => {
    localStorage.clear()
    resetInstallationIdForTest()
  })

  it('selalu platform web dan nama yang lolos kontrak', () => {
    const info = currentDeviceInfo()

    expect(info.platform).toBe('web')
    expect(info.name.length).toBeGreaterThan(0)
    expect(deviceInfoSchema.safeParse(info).success).toBe(true)
  })

  it('menyertakan installationId UUID yang sah dan disimpan di perangkat', () => {
    const info = currentDeviceInfo()

    expect(uuidSchema.safeParse(info.installationId).success).toBe(true)
    expect(info.installationId).toBe(localStorage.getItem(INSTALLATION_ID_STORAGE_KEY))
  })

  it('dua panggilan memakai instalasi yang sama (bukan id acak per login)', () => {
    expect(currentDeviceInfo().installationId).toBe(currentDeviceInfo().installationId)
  })

  it('deviceInfoSchema menerima bentuk lengkap (name + platform + installationId)', () => {
    expect(deviceInfoSchema.safeParse(currentDeviceInfo()).success).toBe(true)
  })

  it('id instalasi sama dengan yang dipakai jalur lain di app ini', () => {
    expect(currentDeviceInfo().installationId).toBe(currentInstallationId())
  })
})
