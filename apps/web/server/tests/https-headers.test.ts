// @vitest-environment node
//
// Transport HTTPS & header keamanan (AC T19: "semua lalu lintas HTTPS").
//
// Kenapa lewat HTTP sungguhan (server Nitro hasil build, `setup({ server: true })`): HSTS dan CSP
// dipasang modul `nuxt-security` di lapisan respons, bukan di handler. Satu-satunya cara membuktikan
// header itu benar-benar terkirim adalah melihat byte respons dari server yang berjalan.
//
// Yang diuji di sini adalah bagian AC T19 yang menyangkut transport, bukan seluruh checklist
// security.md §6 (CSP nonce, framing, dsb. punya cakupan sendiri di test lain):
// - HSTS wajib ada dengan `max-age` >= 15552000 (~180 hari) + `includeSubDomains`, karena itu satu-satunya
//   cara aplikasi memaksa browser tidak pernah kembali ke `http://` setelah kunjungan pertama.
// - `upgrade-insecure-requests` di CSP: subresource `http://` yang lolos ke HTML dinaikkan ke https
//   oleh browser, jadi tidak ada jalur campuran (mixed content).
// - Permintaan lintas-origin TIDAK diberi izin CORS (apalagi `*`), jadi respons `/v1` berisi data
//   per akun tidak bisa dibaca JavaScript dari origin lain.
import { afterAll, describe, expect, it } from 'vitest'

import { setup, url } from '@nuxt/test-utils/e2e'

import { closeTestDb } from './helpers/harness'

await setup({ server: true })

/** Batas bawah HSTS: 180 hari. Di bawah itu perlindungan praktis hilang antar kunjungan. */
const MIN_HSTS_MAX_AGE_SECONDS = 15_552_000

async function headersOf(
  path: string,
  request: { readonly headers?: Record<string, string> } = {},
): Promise<Headers> {
  const response = await fetch(url(path), {
    redirect: 'manual',
    headers: request.headers,
  })

  return response.headers
}

function hstsMaxAge(header: string | null): number {
  const match = /max-age=([0-9]+)/i.exec(header ?? '')
  return match?.[1] === undefined ? 0 : Number(match[1])
}

afterAll(async () => {
  await closeTestDb()
})

describe('HSTS: browser dipaksa memakai HTTPS', () => {
  it('respons API membawa `Strict-Transport-Security` dengan max-age memadai + includeSubDomains', async () => {
    const headers = await headersOf('/v1/auth/session')
    const hsts = headers.get('strict-transport-security')

    expect(hsts, 'header HSTS tidak terkirim').not.toBeNull()
    expect(hstsMaxAge(hsts)).toBeGreaterThanOrEqual(MIN_HSTS_MAX_AGE_SECONDS)
    expect(hsts).toMatch(/includeSubDomains/i)

    // Header transport lain yang wajib menyertai: tipe konten tidak boleh ditebak browser.
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    // Respons per-user tidak boleh masuk cache bersama.
    expect(headers.get('cache-control')).toContain('no-store')
  })

  it('halaman HTML membawa HSTS dan CSP dengan `upgrade-insecure-requests` (tanpa mixed content)', async () => {
    const headers = await headersOf('/login')
    const csp = headers.get('content-security-policy') ?? ''

    expect(headers.get('strict-transport-security'), 'HSTS hilang di halaman HTML').not.toBeNull()
    expect(csp).toContain('upgrade-insecure-requests')
    // `frame-ancestors 'none'` = halaman login tidak bisa dibingkai (clickjacking).
    expect(csp).toContain("frame-ancestors 'none'")
  })
})

describe('CORS: respons `/v1` tidak bisa dibaca origin lain', () => {
  it('request lintas-origin tidak mendapat izin CORS (bukan `*`, tanpa credentials)', async () => {
    const headers = await headersOf('/v1/auth/session', {
      headers: { origin: 'https://evil.test' },
    })

    expect(headers.get('access-control-allow-origin')).toBeNull()
    expect(headers.get('access-control-allow-credentials')).toBeNull()
  })
})
