import { describe, expect, it } from 'vitest'

import { AVATAR_SOURCE_MAX_BYTES, AvatarImageError, coverCrop, resizeAvatar } from './avatar'

describe('coverCrop', () => {
  it('memotong sisi panjang gambar landscape di tengah', () => {
    expect(coverCrop(400, 200)).toEqual({ sx: 100, sy: 0, size: 200 })
  })

  it('memotong sisi panjang gambar portrait di tengah', () => {
    expect(coverCrop(300, 501)).toEqual({ sx: 0, sy: 100, size: 300 })
  })

  it('gambar persegi tidak dipotong', () => {
    expect(coverCrop(256, 256)).toEqual({ sx: 0, sy: 0, size: 256 })
  })
})

describe('resizeAvatar', () => {
  it.each([
    ['bukan gambar', new Blob(['hai'], { type: 'text/plain' })],
    ['SVG', new Blob(['<svg/>'], { type: 'image/svg+xml' })],
  ])('menolak %s sebelum didecode', async (_label, file) => {
    await expect(resizeAvatar(file)).rejects.toMatchObject({ reason: 'notImage' })
  })

  it('menolak berkas asli yang terlalu besar', async () => {
    const huge = { type: 'image/jpeg', size: AVATAR_SOURCE_MAX_BYTES + 1 } as Blob
    await expect(resizeAvatar(huge)).rejects.toBeInstanceOf(AvatarImageError)
    await expect(resizeAvatar(huge)).rejects.toMatchObject({ reason: 'tooLarge' })
  })
})
