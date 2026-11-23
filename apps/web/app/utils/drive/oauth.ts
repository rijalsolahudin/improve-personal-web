/**
 * Izin Google Drive langsung dari browser (T29): OAuth 2.0 "token" flow lewat popup, tanpa server
 * kami dan tanpa skrip pihak ketiga (Google Identity Services tidak dimuat - CSP tetap ketat).
 *
 * Scope `drive.file`: app hanya bisa melihat/mengubah berkas yang ia buat sendiri. Dipilih alih-alih
 * `drive.appdata` karena berkas `.ipbackup` tetap terlihat & bisa diunduh user dari Drive walau app
 * ini tidak bisa dibuka - backup yang hanya bisa dibaca app sendiri rapuh. Keduanya scope
 * non-sensitif, jadi tidak butuh verifikasi OAuth tingkat "sensitive/restricted".
 *
 * Token akses hanya di memori (tidak ada refresh token di alur client-only). Konsekuensinya: backup
 * terjadwal yang jatuh tempo saat token sudah habis butuh satu ketukan user untuk membuka popup.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const DRIVE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
/** Path halaman balikan; WAJIB sama persis dengan redirect URI di Google Cloud Console. */
export const DRIVE_REDIRECT_PATH = '/oauth/google-drive'
/** Kanal antar-tab (origin sama) untuk menyerahkan hasil popup ke tab app. */
export const DRIVE_OAUTH_CHANNEL = 'ip-drive-oauth'

export type DriveAuthUrlInput = {
  readonly clientId: string
  readonly origin: string
  /** Nilai acak sekali pakai; balikan dengan `state` lain diabaikan (cegah token suntikan). */
  readonly state: string
  /** Petunjuk akun dari izin sebelumnya, supaya user tidak memilih akun lagi. */
  readonly loginHint?: string
}

export function buildDriveAuthUrl(input: DriveAuthUrlInput): string {
  const url = new URL(DRIVE_AUTH_ENDPOINT)
  url.searchParams.set('client_id', input.clientId)
  url.searchParams.set('redirect_uri', `${input.origin}${DRIVE_REDIRECT_PATH}`)
  url.searchParams.set('response_type', 'token')
  url.searchParams.set('scope', DRIVE_SCOPE)
  url.searchParams.set('state', input.state)
  url.searchParams.set('include_granted_scopes', 'false')
  if (input.loginHint) url.searchParams.set('login_hint', input.loginHint)
  return url.toString()
}

export type DriveToken = {
  readonly accessToken: string
  readonly expiresAtMs: number
}

export type DriveAuthResult =
  | { readonly ok: true; readonly token: DriveToken }
  | { readonly ok: false; readonly reason: 'denied' | 'state' | 'scope' | 'invalid' }

/**
 * Baca fragmen balikan Google (`#access_token=...&state=...`). `state` wajib cocok, dan scope yang
 * diberikan wajib memuat `drive.file` - user bisa saja mencentang-lepas izin Drive di layar Google.
 */
export function parseDriveAuthFragment(
  fragment: string,
  expectedState: string,
  nowMs: number,
): DriveAuthResult {
  const params = new URLSearchParams(fragment.startsWith('#') ? fragment.slice(1) : fragment)
  if (params.get('state') !== expectedState) return { ok: false, reason: 'state' }
  if (params.get('error') !== null) return { ok: false, reason: 'denied' }

  const accessToken = params.get('access_token')
  const expiresIn = Number(params.get('expires_in'))
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return { ok: false, reason: 'invalid' }
  }
  if (!(params.get('scope') ?? '').split(' ').includes(DRIVE_SCOPE)) {
    return { ok: false, reason: 'scope' }
  }

  // Dikurangi semenit supaya token tidak habis di tengah unggahan.
  return { ok: true, token: { accessToken, expiresAtMs: nowMs + (expiresIn - 60) * 1000 } }
}

export function describeDriveAuthFailure(
  reason: Exclude<DriveAuthResult, { ok: true }>['reason'] | 'popup' | 'timeout',
): string {
  switch (reason) {
    case 'denied':
      return 'Izin Google Drive tidak diberikan.'
    case 'scope':
      return 'Izin akses berkas Drive tidak dicentang. Sambungkan lagi dan izinkan akses berkas.'
    case 'popup':
      return 'Jendela izin Google diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.'
    case 'timeout':
      return 'Jendela izin Google ditutup atau terlalu lama. Coba lagi.'
    case 'state':
    case 'invalid':
      return 'Balasan izin Google tidak valid. Coba lagi.'
  }
}
