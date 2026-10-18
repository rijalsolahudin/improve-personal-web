// @vitest-environment node
//
// Penjaga sinkronisasi antara KONTRAK dan ROUTE.
//
// `packages/contracts/src/protocol.ts` memuat daftar endpoint `/v1` yang dilayani API. Daftar itu adalah
// bagian dari kontrak: web dan mobile membacanya untuk tahu endpoint apa yang boleh dipanggil. Kalau
// daftar itu dan isi `server/routes/v1` berbeda, yang salah SATU-SATUNYA sumber kebenaran - pernah
// terjadi pada `POST /v1/account/deletion-otp` dan `POST /v1/auth/logout`, dua endpoint yang jalan tapi
// tidak tercatat sebagai kontrak.
//
// Test ini tidak memeriksa perilaku (itu tugas test HTTP): ia cuma memastikan tidak ada endpoint yang
// hidup diam-diam di satu sisi saja, supaya divergensinya ketahuan di CI - bukan dari klien yang
// terheran-heran endpoint itu tidak ada di dokumentasi.
import { readdir, readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const ROUTES_DIR = new URL('../routes/v1/', import.meta.url)
const PROTOCOL_SOURCE = new URL('../../../../packages/contracts/src/protocol.ts', import.meta.url)

const METHODS = ['get', 'post', 'put', 'delete', 'patch'] as const

/** `devices/[id].delete.ts` -> `DELETE /v1/devices/:id`; `keys/transfer/index.post.ts` -> `POST /v1/keys/transfer`. */
function endpointOf(relativePath: string): string | null {
  const match = /^(.*)\.([a-z]+)\.ts$/.exec(relativePath)
  if (!match) return null

  const [, namePath, method] = match
  if (!method || !METHODS.includes(method as (typeof METHODS)[number])) return null

  // `index` adalah nama berkas, bukan segmen URL (konvensi router Nitro).
  const segments = (namePath ?? '').split('/').filter((seg) => seg !== '' && seg !== 'index')

  // Prefix `/v1` ditulis eksplisit: `walk` di-root di `server/routes/v1`, jadi path relatifnya belum
  // memuat prefix yang dipakai daftar endpoint di kontrak.
  return `${method.toUpperCase()} /v1/${segments.join('/')}`.replace(/\/\[([^\]]+)\]/g, '/:$1')
}

async function walk(directory: URL, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
    if (entry.isDirectory()) files.push(...(await walk(child, `${prefix}${entry.name}/`)))
    else files.push(`${prefix}${entry.name}`)
  }

  return files
}

/** Baris daftar endpoint di komentar `protocol.ts`: `*   POST   /v1/auth/logout  auth.ts  ...`. */
function documentedEndpoints(source: string): string[] {
  const found: string[] = []

  for (const line of source.split('\n')) {
    const match = /^\s*\*\s+(GET|POST|PUT|DELETE|PATCH)\s+(\/v1\/\S+)/.exec(line)
    if (match?.[1] && match[2]) found.push(`${match[1]} ${match[2]}`)
  }

  return found
}

describe('daftar endpoint kontrak vs route `/v1`', () => {
  it('setiap endpoint kontrak punya route, dan setiap route tercatat di kontrak', async () => {
    const routes = (await walk(ROUTES_DIR))
      .map(endpointOf)
      .filter((endpoint): endpoint is string => endpoint !== null)
    const documented = documentedEndpoints(await readFile(PROTOCOL_SOURCE, 'utf8'))

    // Sanity check dulu: kalau regex penelusurannya sendiri rusak, dua perbandingan di bawah akan
    // "lulus" dengan dua himpunan kosong - test yang selalu lulus lebih buruk daripada tidak ada test.
    expect(
      documented.length,
      'daftar endpoint di protocol.ts tidak terbaca',
    ).toBeGreaterThanOrEqual(14)
    expect(routes.length, 'route `/v1` tidak terbaca').toBeGreaterThanOrEqual(14)

    const routeSet = new Set(routes)
    const documentedSet = new Set(documented)

    expect(
      [...routeSet].filter((endpoint) => !documentedSet.has(endpoint)).sort(),
      'route tanpa kontrak',
    ).toEqual([])
    expect(
      [...documentedSet].filter((endpoint) => !routeSet.has(endpoint)).sort(),
      'kontrak tanpa route',
    ).toEqual([])

    // Daftar ganda akan menyembunyikan salah satu entri saat orang membacanya.
    expect(documented.length, 'endpoint yang tercatat dua kali').toBe(documentedSet.size)
    expect(routes.length, 'route yang terhitung dua kali').toBe(routeSet.size)
  })
})
