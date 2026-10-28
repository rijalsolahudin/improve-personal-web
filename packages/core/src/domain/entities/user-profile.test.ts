import { describe, expect, it } from 'vitest'

import {
  PROFILE_AVATAR_MAX_LENGTH,
  PROFILE_DISPLAY_NAME_MAX_LENGTH,
  userProfileSchema,
} from './user-profile.ts'

const ID = '018f2c4e-0000-7000-8000-000000000001'
const WEBP = 'data:image/webp;base64,UklGRhoAAABXRUJQ'

function profile(overrides: object = {}) {
  return { id: ID, displayName: 'Rijal', avatar: WEBP, updatedAt: 1, ...overrides }
}

describe('userProfileSchema', () => {
  it('menerima profil lengkap dan profil tanpa foto', () => {
    expect(userProfileSchema.safeParse(profile()).success).toBe(true)
    expect(userProfileSchema.safeParse(profile({ avatar: null, displayName: '' })).success).toBe(
      true,
    )
  })

  it('merapikan spasi nama tanpa menolak', () => {
    expect(userProfileSchema.parse(profile({ displayName: '  Rijal  ' })).displayName).toBe('Rijal')
  })

  it('menolak nama melebihi batas', () => {
    const tooLong = 'a'.repeat(PROFILE_DISPLAY_NAME_MAX_LENGTH + 1)
    expect(userProfileSchema.safeParse(profile({ displayName: tooLong })).success).toBe(false)
  })

  it.each([
    ['SVG (bisa memuat script)', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['skema javascript', 'javascript:alert(1)'],
    ['URL luar', 'https://contoh.id/foto.png'],
    ['base64 rusak', 'data:image/png;base64,<script>'],
  ])('menolak foto: %s', (_label, avatar) => {
    expect(userProfileSchema.safeParse(profile({ avatar })).success).toBe(false)
  })

  it('menolak foto melebihi batas panjang', () => {
    const header = 'data:image/webp;base64,'
    const avatar = header + 'A'.repeat(PROFILE_AVATAR_MAX_LENGTH - header.length + 1)
    expect(userProfileSchema.safeParse(profile({ avatar })).success).toBe(false)
  })

  it('menolak field asing', () => {
    expect(userProfileSchema.safeParse(profile({ email: 'a@b.id' })).success).toBe(false)
  })
})
