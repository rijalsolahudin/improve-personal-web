import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { toCssVariables } from '@improve-personal/tokens'
import { describe, expect, it } from 'vitest'

/**
 * `dist/tokens.css` itu artifact (gitignored) yang dibuat `pnpm -F @improve-personal/tokens build`.
 * Jalur normal selalu segar karena task turbo memakai `dependsOn: ["^build"]`. Guard ini menangkap
 * jalur yang melewati turbo: menjalankan dev server / test langsung di `apps/web` dengan artifact basi
 * - kalau tidak dijaga, tampilan pakai token lama tanpa error apa pun.
 */
const distFile = resolve('../../packages/tokens/dist/tokens.css')

describe('artifact CSS token', () => {
  it.skipIf(!existsSync(distFile))('dist/tokens.css sinkron dengan sumber token', () => {
    const built = readFileSync(distFile, 'utf8')
    expect(
      built === toCssVariables(),
      'dist/tokens.css basi - jalankan `pnpm -F @improve-personal/tokens build` (atau `pnpm test` dari root)',
    ).toBe(true)
  })
})
