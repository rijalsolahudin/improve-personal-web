import { BACKUP_MAX_BYTES } from '@improve-personal/core'
import { describe, expect, it, vi } from 'vitest'

import { readBackupFileText } from './read-file'

/**
 * Pagar pertama import: berkas kebesaran ditolak dari `File.size`, TANPA membaca isinya.
 *
 * Ini bukan optimisasi. Batas 32 MB milik core diperiksa pada string yang sudah ada di memori, jadi
 * `file.text()` untuk berkas 500 MB akan menghabiskan memori perangkat lebih dulu - dan penolakannya
 * tidak pernah sampai ke user.
 */

function fakeFile(options: { readonly size: number; readonly text?: () => Promise<string> }): File {
  return {
    name: 'backup.json',
    size: options.size,
    text: options.text ?? (async () => '{}'),
  } as unknown as File
}

describe('readBackupFileText', () => {
  it('menolak berkas di atas batas tanpa memanggil text() sama sekali', async () => {
    const text = vi.fn(async () => '{"besar":true}')
    const result = await readBackupFileText(fakeFile({ size: BACKUP_MAX_BYTES + 1, text }))

    expect(text).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('terlalu besar')
    expect(result.message).toContain('tidak dibaca')
  })

  it('menerima berkas tepat di batas dan mengembalikan isinya', async () => {
    const result = await readBackupFileText(
      fakeFile({ size: BACKUP_MAX_BYTES, text: async () => '{"format":"ip-backup"}' }),
    )

    expect(result).toEqual({ ok: true, text: '{"format":"ip-backup"}' })
  })

  it('berkas yang gagal dibaca menghasilkan pesan, bukan error tak tertangani', async () => {
    const result = await readBackupFileText(
      fakeFile({
        size: 10,
        text: async () => {
          throw new Error('disk error')
        },
      }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('tidak bisa dibaca')
  })
})
