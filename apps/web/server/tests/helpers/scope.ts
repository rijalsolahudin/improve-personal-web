import { ApiProblem } from '../../utils/api-error'

import { closeTestDb, createFixture, type Fixture, type ServerEnv } from './harness'

/**
 * Scope test: kumpulkan fixture, buang datanya setelah tiap test.
 *
 * Dipakai supaya test bisa dijalankan berulang kali tanpa saldo data (`afterEach` -> `dispose()`),
 * tanpa truncate tabel: truncate akan menghapus data berkas test lain yang jalan paralel.
 */

export type TestScope = {
  /** Fixture baru: email + IP + env + mailer palsu, dengan `cleanup()` sendiri. */
  fixture(options?: { prefix?: string; env?: ServerEnv }): Fixture
  /** Buang seluruh baris milik semua fixture yang sudah dibuat. */
  dispose(): Promise<void>
}

export function testScope(): TestScope {
  const fixtures: Fixture[] = []

  return {
    fixture(options) {
      const created = createFixture(options)
      fixtures.push(created)
      return created
    },
    async dispose() {
      for (const created of fixtures.splice(0)) await created.cleanup()
    },
  }
}

export type CapturedProblem = {
  readonly code: string
  readonly statusCode: number
}

/**
 * Jalankan promise yang seharusnya gagal, ambil `ApiProblem`-nya.
 *
 * Dipakai untuk membandingkan KODE error antar kasus (mis. "perangkat user lain" vs "id tidak
 * dikenal" harus sama-sama `NOT_FOUND`), dan untuk membaca status dari kontrak - bukan dari teks
 * pesan.
 */
export async function captureProblem(promise: Promise<unknown>): Promise<CapturedProblem | null> {
  try {
    await promise
    return null
  } catch (error) {
    if (error instanceof ApiProblem) {
      return { code: error.code, statusCode: error.statusCode }
    }

    throw error
  }
}

/** `Promise.allSettled` yang mengembalikan status per promise tanpa bergantung urutan. */
export function settledOutcomes(results: readonly PromiseSettledResult<unknown>[]): string[] {
  return results.map((result) => (result.status === 'fulfilled' ? 'fulfilled' : 'rejected'))
}

export { closeTestDb }
