import { describe, expect, it } from 'vitest'

import { FEATURES, FEATURE_IDS, MOBILE_TAB_IDS, getFeature, isFeatureId } from './features'

describe('registri fitur', () => {
  it('mencakup tepat 15 fitur PRD (F1–F15), masing-masing sekali', () => {
    expect(FEATURES.map((feature) => feature.id).sort()).toEqual([...FEATURE_IDS].sort())
    const codes = FEATURES.map((feature) => Number(feature.code.slice(1))).sort((a, b) => a - b)
    expect(codes).toEqual(Array.from({ length: 15 }, (_, index) => index + 1))
  })

  it('path unik dan semuanya di bawah /app', () => {
    const paths = FEATURES.map((feature) => feature.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const path of paths) expect(path === '/app' || path.startsWith('/app/')).toBe(true)
  })

  it('tab mobile menunjuk fitur yang terdaftar', () => {
    for (const id of MOBILE_TAB_IDS) expect(getFeature(id).id).toBe(id)
  })

  it('isFeatureId hanya menerima id terdaftar', () => {
    expect(isFeatureId('goals')).toBe(true)
    expect(isFeatureId('admin')).toBe(false)
    expect(isFeatureId(['goals'])).toBe(false)
  })
})
