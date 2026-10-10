import { describe, expect, it } from 'vitest'

import { isValidEmail, safeRedirectPath } from './validation'

describe('isValidEmail', () => {
  it.each(['kamu@email.com', '  a.b+tag@sub.domain.id  '])('menerima %s', (email) => {
    expect(isValidEmail(email)).toBe(true)
  })

  it.each(['', 'kamu', 'kamu@', 'kamu@email', 'ka mu@email.com', `${'a'.repeat(250)}@x.id`])(
    'menolak %s',
    (email) => {
      expect(isValidEmail(email)).toBe(false)
    },
  )
})

describe('safeRedirectPath (cegah open redirect)', () => {
  it.each([
    ['/app', '/app'],
    ['/app/goals', '/app/goals'],
    ['/app/memo?tanggal=2026-10-09#baru', '/app/memo?tanggal=2026-10-09#baru'],
  ])('mengizinkan path internal %s', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected)
  })

  it.each([
    undefined,
    null,
    ['/app'],
    'https://evil.example/app',
    '//evil.example/app',
    '/\\evil.example',
    '/app\\..\\login',
    'javascript:alert(1)',
    '/login',
    '/application',
    '/app/../login',
  ])('menolak %s → fallback /app', (input) => {
    expect(safeRedirectPath(input)).toBe('/app')
  })
})
