import {
  DRIVE_OAUTH_CHANNEL,
  buildDriveAuthUrl,
  describeDriveAuthFailure,
  parseDriveAuthFragment,
  type DriveToken,
} from './oauth'

/**
 * Token akses Google Drive - HANYA di variabel modul ini (memori tab). Tidak ke localStorage,
 * IndexedDB, `useState`, atau log. Tab ditutup = token hilang; itu disengaja (AC T29).
 */
let token: DriveToken | null = null

/** Batas tunggu jendela izin; popup yang ditutup user tidak bisa dideteksi andal di bawah COOP. */
const POPUP_TIMEOUT_MS = 3 * 60 * 1000
const POPUP_FEATURES = 'popup,width=480,height=640'

export class DriveAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DriveAuthError'
  }
}

/** Token yang masih berlaku, atau `null`. */
export function currentDriveToken(nowMs: number = Date.now()): string | null {
  if (token === null || token.expiresAtMs <= nowMs) return null
  return token.accessToken
}

export function forgetDriveToken(): void {
  token = null
}

/**
 * Minta token lewat popup. WAJIB dipanggil langsung dari handler klik (sebelum `await` apa pun):
 * browser hanya mengizinkan popup yang dibuka oleh gestur user.
 *
 * Hasil popup datang lewat `BroadcastChannel` (origin sama), bukan `window.opener`: header COOP app
 * memutus `opener` begitu popup berpindah ke domain Google.
 */
export function requestDriveToken(clientId: string): Promise<string> {
  const existing = currentDriveToken()
  if (existing !== null) return Promise.resolve(existing)

  const state = crypto.randomUUID()
  const popup = window.open(
    buildDriveAuthUrl({ clientId, origin: window.location.origin, state }),
    'ip-drive-auth',
    POPUP_FEATURES,
  )
  if (popup === null) return Promise.reject(new DriveAuthError(describeDriveAuthFailure('popup')))

  const channel = new BroadcastChannel(DRIVE_OAUTH_CHANNEL)
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new DriveAuthError(describeDriveAuthFailure('timeout'))),
      POPUP_TIMEOUT_MS,
    )
    channel.onmessage = (event: MessageEvent<{ fragment?: unknown }>) => {
      const fragment = typeof event.data?.fragment === 'string' ? event.data.fragment : ''
      const result = parseDriveAuthFragment(fragment, state, Date.now())
      // Balikan untuk permintaan lain (state beda) diabaikan, bukan dianggap gagal.
      if (!result.ok && result.reason === 'state') return
      clearTimeout(timer)
      if (!result.ok) {
        reject(new DriveAuthError(describeDriveAuthFailure(result.reason)))
        return
      }
      token = result.token
      resolve(result.token.accessToken)
    }
  }).finally(() => channel.close())
}
