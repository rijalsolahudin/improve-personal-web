import { PROFILE_AVATAR_MAX_LENGTH, PROFILE_AVATAR_SIZE_PX } from '@improve-personal/core'

/** Kualitas WebP/JPEG; 0.85 di 256px menghasilkan ~15-40 KB base64. */
const AVATAR_QUALITY = 0.85

/** Batas berkas asli sebelum diproses: mencegah decode gambar raksasa yang membekukan tab. */
export const AVATAR_SOURCE_MAX_BYTES = 15 * 1024 * 1024

export type CoverCrop = { readonly sx: number; readonly sy: number; readonly size: number }

/** Potongan persegi di tengah gambar (seperti `object-fit: cover`). Murni, tanpa DOM. */
export function coverCrop(width: number, height: number): CoverCrop {
  const size = Math.min(width, height)
  return { sx: Math.floor((width - size) / 2), sy: Math.floor((height - size) / 2), size }
}

export class AvatarImageError extends Error {
  constructor(readonly reason: 'notImage' | 'tooLarge' | 'decode' | 'encode') {
    super(`foto profil tidak bisa dipakai (${reason})`)
    this.name = 'AvatarImageError'
  }
}

/**
 * Ubah berkas gambar pilihan user jadi data URL persegi 256px.
 *
 * Foto dikecilkan di perangkat, jadi foto asli (beserta metadata EXIF seperti lokasi) tidak pernah
 * disimpan atau tersinkron - canvas hanya membawa piksel.
 */
export async function resizeAvatar(file: Blob): Promise<string> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    throw new AvatarImageError('notImage')
  }
  if (file.size > AVATAR_SOURCE_MAX_BYTES) throw new AvatarImageError('tooLarge')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new AvatarImageError('decode')
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = PROFILE_AVATAR_SIZE_PX
    canvas.height = PROFILE_AVATAR_SIZE_PX
    const context = canvas.getContext('2d')
    if (context === null) throw new AvatarImageError('encode')

    const crop = coverCrop(bitmap.width, bitmap.height)
    context.drawImage(
      bitmap,
      crop.sx,
      crop.sy,
      crop.size,
      crop.size,
      0,
      0,
      PROFILE_AVATAR_SIZE_PX,
      PROFILE_AVATAR_SIZE_PX,
    )

    // Browser tanpa encoder WebP diam-diam mengembalikan PNG: pakai JPEG supaya ukurannya tetap kecil.
    let dataUrl = canvas.toDataURL('image/webp', AVATAR_QUALITY)
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL('image/jpeg', AVATAR_QUALITY)
    }
    if (dataUrl.length > PROFILE_AVATAR_MAX_LENGTH) throw new AvatarImageError('encode')

    return dataUrl
  } finally {
    bitmap.close()
  }
}
