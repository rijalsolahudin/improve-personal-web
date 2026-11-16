/**
 * Ukuran font & spasi komponen harus lewat token (`--fs-*`, `--space-*`), bukan px mentah: hanya
 * token yang dikali pengali gaya (`--fk*`, `--dk`), jadi px mentah membuat gaya non-Cute tidak bisa
 * menyesuaikan ukuran dan jaraknya (task #142).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const APP_DIR = import.meta.dirname

const vueFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })

const styleLines = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].flatMap((match) =>
    (match[1] ?? '').split('\n'),
  )

/** Garis rambut ≤3px (offset optis, bukan jarak tata letak) boleh tetap px. */
const RAW_SPACE =
  /^\s*(padding|margin|gap|row-gap|column-gap)(-[a-z-]+)?:[^;(]*(?<![\d.])([4-9]|[1-9]\d+)(\.\d+)?px/
const RAW_FONT_SIZE = /^\s*font-size:\s*[\d.]+px/

function violations(pattern: RegExp): string[] {
  return vueFiles(APP_DIR).flatMap((file) =>
    styleLines(file)
      .filter((line) => pattern.test(line))
      .map((line) => `${relative(APP_DIR, file)}: ${line.trim()}`),
  )
}

describe('token ukuran di style komponen', () => {
  it('font-size memakai token --fs-*, bukan px mentah', () => {
    expect(violations(RAW_FONT_SIZE)).toEqual([])
  })

  it('padding/margin/gap memakai token --space-*, bukan px mentah', () => {
    expect(violations(RAW_SPACE)).toEqual([])
  })
})
