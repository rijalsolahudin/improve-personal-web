import type { DeviceDto } from '@improve-personal/contracts'

import {
  DevicesRequestError,
  createDevicesGateway,
  type DevicesGateway,
} from '~/utils/account/devices-gateway'
import type { JsonFetch } from '~/utils/http/json-fetch'

import { useAuthSession } from './useAuthSession'

/**
 * Modal "Akun & perangkat": daftar perangkat yang login (PRD F15).
 *
 * Tidak ada lagi status kunci di sini: kunci at-rest milik server, dan kunci perangkat hanya melindungi
 * salinan lokal (dibuat otomatis, tidak perlu diatur user). Yang tersisa adalah perangkat + logout jarak
 * jauh.
 *
 * Status non-rahasia boleh masuk `useState`; tidak ada bahan kunci di modul ini.
 */

export type AccountDevice = DeviceDto & { readonly isCurrent: boolean }

export type UseAccountOptions = {
  /** Transport HTTP, disuntik di test. Default `$fetch` (cookie sesi ikut otomatis). */
  readonly request?: JsonFetch
}

export function useAccount(options: UseAccountOptions = {}) {
  const auth = useAuthSession()
  const request: JsonFetch = options.request ?? ((path, init) => $fetch(path, init))
  const devices: DevicesGateway = createDevicesGateway(request)

  const status = useState<'idle' | 'loading' | 'ready' | 'error'>('accountStatus', () => 'idle')
  const error = useState<string | null>('accountError', () => null)
  const busy = useState<boolean>('accountBusy', () => false)
  const deviceList = useState<AccountDevice[]>('accountDevices', () => [])

  function describe(cause: unknown): string {
    if (cause instanceof DevicesRequestError) {
      return cause.isNetworkError ? 'server tidak terjangkau' : `server menolak (${cause.code})`
    }

    return cause instanceof Error ? cause.message : 'terjadi kesalahan'
  }

  /** Muat daftar perangkat. */
  async function load(): Promise<void> {
    status.value = 'loading'

    try {
      // Id baris `devices` di server ada di sesi auth. `session.deviceId` milik data lokal adalah id
      // HLC perangkat - identitas lain, tidak pernah sama dengan id di daftar ini.
      const currentDeviceId = auth.session.value?.device.id ?? null
      const rows = await devices.list()

      deviceList.value = rows.map((device) => ({
        ...device,
        isCurrent: device.id === currentDeviceId,
      }))
      error.value = null
      status.value = 'ready'
    } catch (cause) {
      status.value = 'error'
      error.value = describe(cause)
    }
  }

  /** Jalankan aksi perangkat lalu segarkan daftarnya; kegagalan masuk `error`. */
  async function mutateDevice(action: () => Promise<void>): Promise<void> {
    busy.value = true

    try {
      await action()
      await load()
    } catch (cause) {
      status.value = 'error'
      error.value = describe(cause)
    } finally {
      busy.value = false
    }
  }

  /** Logout jarak jauh: cabut perangkat lain. */
  const revokeDevice = (id: string): Promise<void> => mutateDevice(() => devices.revoke(id))

  /** Hapus jejak perangkat yang sudah dicabut dari daftar. */
  const removeDevice = (id: string): Promise<void> => mutateDevice(() => devices.remove(id))

  return {
    status: computed(() => status.value),
    error: computed(() => error.value),
    busy: computed(() => busy.value),
    devices: computed(() => deviceList.value),
    load,
    revokeDevice,
    removeDevice,
  }
}
