// @vitest-environment node
//
// Pemeriksaan syarat lingkungan. Probe-nya disuntik LENGKAP (bukan mengubah global), supaya
// deterministik dan supaya "sengaja tidak ada" benar-benar bisa dinyatakan di test.
import { describe, expect, it } from 'vitest'

import {
  checkLocalDataEnvironment,
  localEnvironmentError,
  readLocalEnvironment,
  type LocalEnvironmentProbe,
} from './environment'

/** Lingkungan ideal: semua syarat ada. */
const PRESENT: LocalEnvironmentProbe = {
  isSecureContext: true,
  subtle: {},
  indexedDb: {},
  locks: {},
}

describe('checkLocalDataEnvironment', () => {
  it('lingkungan lengkap = ok, tanpa masalah', () => {
    expect(checkLocalDataEnvironment(PRESENT)).toEqual({ ok: true, problems: [] })
  })

  it('konteks tidak aman dilaporkan dengan saran yang bisa dieksekusi', () => {
    const check = checkLocalDataEnvironment({ ...PRESENT, isSecureContext: false })

    expect(check.ok).toBe(false)
    expect(check.problems).toHaveLength(1)
    expect(check.problems.join(' ')).toContain('localhost')
  })

  it('menyebut SEMUA yang kurang, bukan hanya yang pertama', () => {
    // Inilah yang terjadi di `http://<IP-LAN>`: WebCrypto dan Web Locks hilang bersamaan.
    const check = checkLocalDataEnvironment({
      isSecureContext: false,
      subtle: undefined,
      indexedDb: undefined,
      locks: undefined,
    })

    expect(check.ok).toBe(false)
    expect(check.problems).toHaveLength(4)
    expect(check.problems.join(' ')).toMatch(/WebCrypto/)
    expect(check.problems.join(' ')).toMatch(/Web Locks/)
    expect(check.problems.join(' ')).toMatch(/IndexedDB/)
  })

  it('pesan errornya memuat semua sebab, supaya tidak perlu menebak', () => {
    const error = localEnvironmentError(
      checkLocalDataEnvironment({
        ...PRESENT,
        subtle: undefined,
        indexedDb: undefined,
        locks: undefined,
      }).problems,
    )

    expect(error.message).toContain('WebCrypto')
    expect(error.message).toContain('IndexedDB')
    expect(error.message).toContain('Web Locks')
  })
})

describe('readLocalEnvironment', () => {
  it('membaca global apa adanya; di runtime node belum tentu lengkap', () => {
    const probe = readLocalEnvironment()

    // Yang bisa dipastikan di node: WebCrypto ada. Sisanya sengaja tidak diasumsikan - test ini
    // memastikan fungsinya membaca global, bukan mengarang nilai.
    expect(probe.subtle).toBeDefined()
    expect(typeof probe.isSecureContext === 'boolean' || probe.isSecureContext === undefined).toBe(
      true,
    )
  })
})
