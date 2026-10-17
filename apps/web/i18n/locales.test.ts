import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { STYLE_NAMES, THEME_NAMES } from '@improve-personal/tokens'
import { describe, expect, it } from 'vitest'

// Dibaca mentah: import JSON biasa sudah dikompilasi plugin i18n di environment test.
const id: unknown = JSON.parse(readFileSync(resolve('i18n/locales/id.json'), 'utf8'))

/** Nilai pesan di `path` (dot-separated), atau `undefined` kalau tidak ada. */
function read(path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined,
      id,
    )
}

/** Kunci `uiStyle.<gaya>.label`/`.desc` yang belum ada - tombol panel "Tampilan" (PRD F16). */
function missingStyleMessages(names: readonly string[]): string[] {
  return names.flatMap((name) =>
    ['label', 'desc']
      .filter((key) => typeof read(`uiStyle.${name}.${key}`) !== 'string')
      .map((key) => `uiStyle.${name}.${key}`),
  )
}

function missingThemeMessages(names: readonly string[]): string[] {
  return names.filter((name) => typeof read(`theme.${name}`) !== 'string').map((n) => `theme.${n}`)
}

/** Nama di locale yang sudah tidak ada di daftar token (sisa setelah gaya/tema dihapus). */
function staleNames(section: 'uiStyle' | 'theme', known: readonly string[]): string[] {
  return Object.keys(read(section) as object).filter(
    (name) => !(known as readonly string[]).includes(name),
  )
}

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

  // Menambah tema/gaya di `@improve-personal/tokens` tanpa menambah pesan di sini = tombol
  // di panel "Tampilan" tampil kosong. Guard ini bikin ketahuannya di test, bukan di UI.
  it('tiap tema punya label', () => {
    expect(missingThemeMessages(THEME_NAMES)).toEqual([])
  })

  it('tiap gaya punya label + desc', () => {
    expect(missingStyleMessages(STYLE_NAMES)).toEqual([])
  })

  it('tidak menyimpan label gaya/tema yang sudah dihapus dari tokens', () => {
    expect(staleNames('uiStyle', STYLE_NAMES)).toEqual([])
    expect(staleNames('theme', THEME_NAMES)).toEqual([])
  })

  it('guard-nya melaporkan gaya/tema baru yang belum dilokalkan', () => {
    expect(missingStyleMessages(['gaya-baru'])).toEqual([
      'uiStyle.gaya-baru.label',
      'uiStyle.gaya-baru.desc',
    ])
    expect(missingThemeMessages(['tema-baru'])).toEqual(['theme.tema-baru'])
  })
})
