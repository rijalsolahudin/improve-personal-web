import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LICENSE_STORAGE_KEY } from '~/utils/license/token'

import SignOutDialog from './SignOutDialog.vue'

/**
 * "Keluar dari perangkat ini" (ADR 15): yang dilepas hanya lisensi + sesi login. Data lokal tidak
 * boleh ikut terhapus, dan kegagalan jaringan saat mencabut sesi tidak boleh menahan user keluar.
 */
const { navigateToMock, signOutMock } = vi.hoisted(() => ({
  navigateToMock: vi.fn(),
  signOutMock: vi.fn(),
}))
mockNuxtImport('navigateTo', () => navigateToMock)
vi.mock('~/composables/auth/http-gateway', () => ({
  useAuthGateway: () => ({ signOut: signOutMock }),
}))

const DATA_KEY = 'ip-memo-paper'
let mounted: VueWrapper | null = null

beforeEach(() => {
  navigateToMock.mockReset()
  signOutMock.mockReset().mockResolvedValue(undefined)
  localStorage.setItem(LICENSE_STORAGE_KEY, 'token-sah')
  localStorage.setItem(DATA_KEY, 'biru')
})

afterEach(() => {
  mounted?.unmount()
  mounted = null
  localStorage.clear()
})

async function confirmLeave(): Promise<VueWrapper> {
  mounted = await mountSuspended(SignOutDialog, { props: { open: true }, attachTo: document.body })
  const confirm = mounted.findAll('button').find((button) => button.text() === 'Keluar')
  await confirm?.trigger('click')
  await flushPromises()
  return mounted
}

describe('SignOutDialog', () => {
  it('melepas lisensi, mencabut sesi, lalu ke /login - data lokal tetap', async () => {
    const wrapper = await confirmLeave()

    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(LICENSE_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(DATA_KEY)).toBe('biru')
    expect(navigateToMock).toHaveBeenCalledWith('/login')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('tetap keluar walau mencabut sesi gagal (offline)', async () => {
    signOutMock.mockRejectedValue(new Error('offline'))

    await confirmLeave()

    expect(localStorage.getItem(LICENSE_STORAGE_KEY)).toBeNull()
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })
})
