import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LOGIN_PATH } from '~/utils/features'
import type { JsonFetch } from '~/utils/http/json-fetch'

import { useAccountDeletion } from './useAccountDeletion'

/**
 * Hapus akun: konfirmasi email + OTP ulang. Yang diuji adalah perilaku yang bisa dilihat user dan
 * request yang benar-benar dikirim - bukan detail komponen dialognya.
 *
 * Jaringan di-mock di batas (`JsonFetch`); `navigateTo` di-mock karena test tidak punya router.
 */

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)

const USER_ID = '018f2c4e-0000-7000-8000-00000000000a'
const EMAIL = 'kamu@email.com'

const SESSION = {
  user: { id: USER_ID, email: EMAIL },
  device: { id: '018f2c4e-0000-7000-8000-0000000000d1', name: 'Chrome di Linux' },
  expiresAt: '2026-12-31T09:00:00.000Z',
}

function apiError(code: string) {
  return { status: 400, data: { error: { code, message: 'generik' } } }
}

beforeEach(() => {
  navigateToMock.mockReset()
  navigateToMock.mockResolvedValue(undefined)
  clearNuxtState([
    'auth-session',
    'auth-session-pending',
    'auth-session-error',
    'now',
    'accountDeletionSendingCode',
    'accountDeletionBusy',
    'accountDeletionError',
    'accountDeletionResendAt',
  ])
  useState('auth-session').value = SESSION
  useState<number>('now').value = Date.now()
  localStorage.clear()
})

describe('hapus akun', () => {
  it('menolak email yang bukan email akun yang login tanpa menghubungi server', async () => {
    const request = vi.fn<JsonFetch>()
    const deletion = useAccountDeletion({ request })

    expect(await deletion.remove(EMAIL, { email: 'orang@lain.com', code: '123456' })).toBe(false)
    expect(deletion.error.value).toBe('emailMismatch')
    expect(request).not.toHaveBeenCalled()
  })

  it('menolak kode yang belum 6 digit sebelum mengirim permintaan destruktif', async () => {
    const request = vi.fn<JsonFetch>()
    const deletion = useAccountDeletion({ request })

    expect(await deletion.remove(EMAIL, { email: EMAIL, code: '123' })).toBe(false)
    expect(deletion.error.value).toBe('codeIncomplete')
    expect(request).not.toHaveBeenCalled()
  })

  it('mengirim email + kode ke DELETE /v1/account, lalu membersihkan sesi lokal', async () => {
    const request = vi.fn<JsonFetch>(async () => undefined)
    localStorage.setItem('ip-theme', 'kuning')

    const deletion = useAccountDeletion({ request })
    expect(await deletion.remove(EMAIL, { email: ` ${EMAIL} `, code: '654321' })).toBe(true)

    expect(request).toHaveBeenCalledWith('/v1/account', {
      method: 'DELETE',
      body: { email: EMAIL, code: '654321' },
    })
    expect(useState('auth-session').value).toBeNull()
    expect(localStorage.getItem('ip-theme')).toBeNull()
    expect(navigateToMock).toHaveBeenCalledWith(LOGIN_PATH, { external: true, replace: true })
  })

  it('memetakan penolakan server ke pesan yang bisa dibaca, tanpa menyisakan sesi terhapus', async () => {
    const request = vi.fn<JsonFetch>(async () => {
      throw apiError('RATE_LIMITED')
    })

    const deletion = useAccountDeletion({ request })
    expect(await deletion.remove(EMAIL, { email: EMAIL, code: '000000' })).toBe(false)

    expect(deletion.error.value).toBe('rateLimited')
    expect(useState('auth-session').value).not.toBeNull()
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('mengirim kode konfirmasi ke email sesi (bukan email yang diketik) dengan jeda 30 detik', async () => {
    const request = vi.fn<JsonFetch>(async () => undefined)
    const deletion = useAccountDeletion({ request })

    await deletion.requestCode()

    expect(request).toHaveBeenCalledWith('/v1/account/deletion-otp', { method: 'POST' })

    // Jam bersama menyusul beberapa milidetik setelah `requestCode()`; samakan dulu seperti test login.
    useState<number>('now').value = Date.now()
    await nextTick()
    expect(deletion.resendSecondsLeft.value).toBe(30)

    await deletion.requestCode()
    expect(request).toHaveBeenCalledTimes(1)
  })
})
