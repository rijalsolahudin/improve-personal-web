import { beforeEach, describe, expect, it } from 'vitest'

import { AUTH_SESSION_STATE_KEYS } from './useAuthSession'
import { useLoginFlow } from './useLoginFlow'

/**
 * Langkah "lupa OTP" (PRD F15): dari email/OTP user bisa pindah ke pilihan passkey / kode pemulihan,
 * lalu kembali tanpa kehilangan email yang sudah diketik.
 *
 * Test terpisah dari `useLoginFlow.test.ts` karena berkas itu milik QA; di sini yang diuji hanya
 * perpindahan langkah, bukan alur OTP yang sudah dicakup di sana.
 */
beforeEach(() => {
  clearNuxtState(Object.values(AUTH_SESSION_STATE_KEYS))
})

describe('langkah lupa OTP', () => {
  it('membuka langkah pemulihan dari email/OTP dan bisa kembali', () => {
    const flow = useLoginFlow()

    flow.setEmail('kamu@email.com')
    flow.openRecovery()
    expect(flow.step.value).toBe('recovery')

    flow.backToEmail()
    expect(flow.step.value).toBe('choose')
    expect(flow.email.value).toBe('kamu@email.com')
    expect(flow.otpError.value).toBeNull()
  })
})
