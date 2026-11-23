import { BACKUP_MAX_BYTES } from '@improve-personal/core'

import { formatByteSize } from './preview'

/**
 * Baca isi berkas backup SETELAH memastikan ukurannya masuk akal.
 *
 * Urutannya bukan detail: `validateBackupText` memeriksa batas 32 MB pada *string* yang sudah ada di
 * memori, jadi pemanggil yang langsung `file.text()` untuk berkas 500 MB akan kehabisan memori di HP
 * sebelum batas itu sempat dicek. `File.size` sudah diketahui tanpa membaca apa pun - itu yang dipakai
 * sebagai pagar pertama.
 */

export type BackupFileReadResult =
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly message: string }

export type BackupFileBytesResult =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly message: string }

const UNREADABLE_MESSAGE = 'Berkas tidak bisa dibaca. Coba pilih ulang berkasnya dari penyimpanan.'

function tooLargeMessage(file: File, maxBytes: number): string | null {
  if (file.size <= maxBytes) return null
  return `Berkas terlalu besar (${formatByteSize(file.size)}, batas ${formatByteSize(maxBytes)}). Berkasnya tidak dibaca sama sekali.`
}

export async function readBackupFileText(
  file: File,
  maxBytes: number = BACKUP_MAX_BYTES,
): Promise<BackupFileReadResult> {
  const tooLarge = tooLargeMessage(file, maxBytes)
  if (tooLarge !== null) return { ok: false, message: tooLarge }

  try {
    return { ok: true, text: await file.text() }
  } catch {
    return { ok: false, message: UNREADABLE_MESSAGE }
  }
}

/** Sama seperti `readBackupFileText`, untuk berkas biner `.ipbackup` (pagar ukuran yang sama). */
export async function readBackupFileBytes(
  file: File,
  maxBytes: number = BACKUP_MAX_BYTES,
): Promise<BackupFileBytesResult> {
  const tooLarge = tooLargeMessage(file, maxBytes)
  if (tooLarge !== null) return { ok: false, message: tooLarge }

  try {
    return { ok: true, bytes: new Uint8Array(await file.arrayBuffer()) }
  } catch {
    return { ok: false, message: UNREADABLE_MESSAGE }
  }
}
