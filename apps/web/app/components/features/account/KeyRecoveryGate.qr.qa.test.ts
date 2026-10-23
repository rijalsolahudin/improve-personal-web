import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LocalDataState } from '~/composables/useLocalData'

import KeyRecoveryGate from './KeyRecoveryGate.vue'

/**
 * AC "tambah perangkat via QR" harus bisa DIMULAI dari perangkat yang membutuhkan kunci.
 *
 * Perangkat baru selalu berakhir di layar ini (`localData.status === 'locked'`) dan layar ini tidak bisa
 * ditutup. Satu-satunya tempat dialog pairing dipasang adalah halaman `/app/akun` di belakang layar ini,
 * jadi kalau di sini tidak ada jalan ke QR, alur dua QR tidak pernah bisa dimulai oleh perangkat baru.
 * PRD F15 menaruh opsi itu di layar pemulihan: "passkey PRF, atau kode pemulihan / QR dari perangkat
 * lama (layar pemulihannya ... dialog 'Buka datamu di perangkat ini')".
 */
const LOCKED_STATE: LocalDataState = {
  status: 'locked',
  isFreshKey: false,
  deviceId: null,
  userId: '018f2c4e-0000-7000-8000-00000000000a',
  error: null,
}

let mounted: VueWrapper | null = null

beforeEach(() => {
  clearNuxtState(['localData', 'auth-session', 'auth-session-pending', 'auth-session-error', 'now'])
  useState<LocalDataState>('localData').value = LOCKED_STATE
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('layar pulih kunci: jalan ke tambah perangkat lewat QR', () => {
  it('menawarkan opsi QR dari perangkat lama (satu-satunya pintu bagi perangkat baru)', async () => {
    mounted = await mountSuspended(KeyRecoveryGate)
    await nextTick()

    const dialog = mounted.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)

    // Tanpa ini, perangkat baru tidak punya cara menampilkan QR permintaan: halaman /app/akun ada di
    // belakang dialog yang tidak bisa ditutup.
    expect(dialog.text()).toMatch(/tambah perangkat|pindai qr|scan qr/i)
  })
})
