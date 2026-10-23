import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import LoginPage from './login.vue'

let mounted: VueWrapper | null = null

async function mount(): Promise<VueWrapper> {
  mounted = await mountSuspended(LoginPage)
  return mounted
}

beforeEach(() => {
  clearNuxtState(['auth-session', 'auth-session-pending', 'auth-session-error', 'now'])
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('halaman login (T22)', () => {
  it('menampilkan daftar/login email OTP + Google SSO', async () => {
    const wrapper = await mount()

    expect(wrapper.text()).toMatch(/kirim kode otp/i)
    expect(wrapper.text()).toMatch(/lanjut dengan google/i)
    expect(wrapper.find('#login-email').exists()).toBe(true)
  })

  it('menawarkan alur lupa OTP: "Pakai passkey atau kode pemulihan?"', async () => {
    const wrapper = await mount()

    // AC T22: user yang tidak bisa menerima OTP harus punya jalan ke passkey / kode pemulihan
    // SEBELUM terkunci di layar "masukkan kode". Tanpa ini tidak ada jalan masuk sama sekali.
    expect(wrapper.text()).toMatch(/pakai passkey atau kode pemulihan/i)
  })
})
