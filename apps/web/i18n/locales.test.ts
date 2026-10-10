import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Dibaca mentah: import JSON biasa sudah dikompilasi plugin i18n di environment test.
const id: unknown = JSON.parse(readFileSync(resolve('i18n/locales/id.json'), 'utf8'))

/** Semua string pesan beserta path-nya. */
function messages(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]]
  if (typeof node !== 'object' || node === null) return []
  return Object.entries(node).flatMap(([key, value]) =>
    messages(value, path ? `${path}.${key}` : key),
  )
}

describe('locale id', () => {
  // vue-i18n: `@` = linked message, `|` = pluralisasi. Karakter literal wajib ditulis {'@'}.
  it('tidak ada "@" atau "|" mentah yang bikin kompilasi pesan gagal', () => {
    const broken = messages(id).filter(([, text]) => /[@|]/.test(text.replace(/\{'[@|]'\}/g, '')))
    expect(broken).toEqual([])
  })
})
