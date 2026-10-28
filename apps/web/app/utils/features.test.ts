import { describe, expect, it } from 'vitest'

import {
  FEATURES,
  FEATURE_IDS,
  MOBILE_TAB_IDS,
  NAV_GROUPS,
  MOBILE_MENU_EXTRA_IDS,
  featureIdFromPath,
  featuresInGroup,
  getFeature,
  isFeatureId,
} from './features'

describe('registri fitur', () => {
  it('mencakup tepat 14 fitur PRD ber-halaman (F1–F14), masing-masing sekali', () => {
    expect(FEATURES.map((feature) => feature.id).sort()).toEqual([...FEATURE_IDS].sort())
    const codes = FEATURES.map((feature) => Number(feature.code.slice(1))).sort((a, b) => a - b)
    expect(codes).toEqual(Array.from({ length: 14 }, (_, index) => index + 1))
  })

  it('path unik dan semuanya di bawah /app', () => {
    const paths = FEATURES.map((feature) => feature.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const path of paths) expect(path === '/app' || path.startsWith('/app/')).toBe(true)
  })

  it('tab mobile menunjuk fitur yang terdaftar', () => {
    for (const id of MOBILE_TAB_IDS) expect(getFeature(id).id).toBe(id)
  })

  it('menu HP menyertakan pintu ke Import & Export (F10) di luar tiga grup utama', () => {
    // Tanpa entri ini halaman backup tidak punya jalan masuk sama sekali di HP: sidebar (tempat menu
    // akun berada) disembunyikan di layar kecil.
    expect(MOBILE_MENU_EXTRA_IDS).toContain('import-export')
    for (const id of MOBILE_MENU_EXTRA_IDS) expect(getFeature(id).id).toBe(id)
    expect(NAV_GROUPS).not.toContain('lainnya')
  })

  it('navigasi utama mengikuti urutan Desktop.dc.html', () => {
    const nav = NAV_GROUPS.map((group) => featuresInGroup(group).map((feature) => feature.id))
    expect(nav).toEqual([
      ['home', 'goals'],
      ['kalender', 'countdown', 'to-do', 'eisenhower'],
      ['pomodoro', 'habit', 'memo', 'overview'],
    ])
  })

  it('isFeatureId hanya menerima id terdaftar', () => {
    expect(isFeatureId('goals')).toBe(true)
    expect(isFeatureId('admin')).toBe(false)
    expect(isFeatureId(['goals'])).toBe(false)
  })
})

describe('featureIdFromPath', () => {
  it('halaman fitur punya id sendiri; selain itu home', () => {
    expect(featureIdFromPath('/app')).toBe('home')
    expect(featureIdFromPath('/app/goals')).toBe('goals')
    expect(featureIdFromPath('/app/kalender/')).toBe('kalender')
    expect(featureIdFromPath('/app/bukan-fitur')).toBe('home')
    expect(featureIdFromPath('/login')).toBe('home')
  })
})
