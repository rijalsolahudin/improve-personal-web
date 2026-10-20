import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ENCRYPTED_BACKUP_FORMAT } from '~/utils/account/encrypted-backup'
import type { LocalDataState } from '~/composables/useLocalData'

import KeyRecoveryGate from './KeyRecoveryGate.vue'

/**
 * Layar "buka datamu di perangkat ini": muncul hanya saat perangkat terkunci, tidak bisa ditutup, dan
 * selalu punya jalan keluar (logout). Kripto pembukaannya diuji di `utils/account/unlock.test.ts`.
 */
let mounted: VueWrapper | null = null

function setStatus(status: LocalDataState['status']): void {
  useState<LocalDataState>('localData').value = {
    status,
    isFreshKey: false,
    deviceId: null,
    userId: null,
    error: null,
  }
}

beforeEach(() => {
  clearNuxtState(['localData'])
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('layar pulih kunci', () => {
  it('muncul saat perangkat terkunci, dan hanya saat itu', async () => {
    mounted = await mountSuspended(KeyRecoveryGate)

    setStatus('ready')
    await nextTick()
    expect(mounted.find('[role="dialog"]').exists()).toBe(false)

    setStatus('locked')
    await nextTick()
    expect(mounted.find('[role="dialog"]').exists()).toBe(true)
    expect(mounted.find('textarea').exists()).toBe(true)
  })

  it('tidak bisa ditutup dengan Esc, dan punya jalan keluar lewat logout', async () => {
    mounted = await mountSuspended(KeyRecoveryGate)
    setStatus('locked')
    await nextTick()

    await mounted.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(mounted.find('[role="dialog"]').exists()).toBe(true)
    expect(mounted.text()).toContain('Keluar dari akun')
  })

  it('tombol kode pemulihan mati selama kodenya kosong', async () => {
    mounted = await mountSuspended(KeyRecoveryGate)
    setStatus('locked')
    await nextTick()

    const submit = mounted.find('button[type="submit"]')
    expect(submit.attributes('disabled')).toBeDefined()

    await mounted.find('textarea').setValue('iprk1.abc')
    expect(submit.attributes('disabled')).toBeUndefined()
  })
  it('berkas terenkripsi meminta kata sandinya, dan bisa kembali ke kode biasa', async () => {
    mounted = await mountSuspended(KeyRecoveryGate)
    setStatus('locked')
    await nextTick()

    const input = mounted.find('input[type="file"]')
    const file = new File([JSON.stringify({ format: ENCRYPTED_BACKUP_FORMAT })], 'cadangan.json', {
      type: 'application/json',
    })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await flushPromises()

    expect(mounted.find('textarea').exists()).toBe(false)
    const passphrase = mounted.find('input[type="password"]')
    expect(passphrase.exists()).toBe(true)

    const submit = mounted.find('button[type="submit"]')
    expect(submit.attributes('disabled')).toBeDefined()
    await passphrase.setValue('kata-sandi-panjang')
    expect(submit.attributes('disabled')).toBeUndefined()

    await mounted.find('button[type="button"].file').trigger('click')
    expect(mounted.find('textarea').exists()).toBe(true)
  })
})
