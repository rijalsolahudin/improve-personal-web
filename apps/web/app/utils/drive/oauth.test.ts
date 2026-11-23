import { describe, expect, it } from 'vitest'

import { DRIVE_SCOPE, buildDriveAuthUrl, parseDriveAuthFragment } from './oauth'

const NOW = 1_790_000_000_000

describe('buildDriveAuthUrl', () => {
  it('token flow ke Google dengan scope drive.file dan redirect ke halaman balikan app', () => {
    const url = new URL(
      buildDriveAuthUrl({ clientId: 'cid.apps', origin: 'https://app.test', state: 's-1' }),
    )

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('response_type')).toBe('token')
    expect(url.searchParams.get('scope')).toBe(DRIVE_SCOPE)
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.test/oauth/google-drive')
    expect(url.searchParams.get('state')).toBe('s-1')
  })
})

describe('parseDriveAuthFragment', () => {
  const ok = `#access_token=ya29.abc&expires_in=3599&scope=${encodeURIComponent(DRIVE_SCOPE)}&state=s-1`

  it('token sah: kedaluwarsa dimajukan semenit supaya tidak habis di tengah unggahan', () => {
    expect(parseDriveAuthFragment(ok, 's-1', NOW)).toEqual({
      ok: true,
      token: { accessToken: 'ya29.abc', expiresAtMs: NOW + (3599 - 60) * 1000 },
    })
  })

  it('state lain diabaikan (token suntikan dari jendela lain tidak dipakai)', () => {
    expect(parseDriveAuthFragment(ok, 's-2', NOW)).toEqual({ ok: false, reason: 'state' })
  })

  it('user menolak atau melepas centang izin Drive', () => {
    expect(parseDriveAuthFragment('#error=access_denied&state=s-1', 's-1', NOW)).toEqual({
      ok: false,
      reason: 'denied',
    })
    const noDrive = '#access_token=t&expires_in=3599&scope=email&state=s-1'
    expect(parseDriveAuthFragment(noDrive, 's-1', NOW)).toEqual({ ok: false, reason: 'scope' })
  })

  it('fragmen tanpa token/kedaluwarsa tidak dianggap sah', () => {
    expect(parseDriveAuthFragment('#state=s-1', 's-1', NOW)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })
})
