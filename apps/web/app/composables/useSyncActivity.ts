import type { ComputedRef } from 'vue'

import { isSyncRunning, onSyncActivity } from '~/utils/sync/activity'

export type UseSyncActivityResult = {
  /** `true` selama satu siklus push/pull berjalan. */
  readonly isSyncing: ComputedRef<boolean>
}

/**
 * Apakah sync sedang berjalan, untuk indikator di shell.
 *
 * Berlangganan baru dipasang saat mount: registry `utils/sync/activity.ts` hidup di level modul, dan
 * pada SSR modul itu dipakai bersama antar-request. Membaca `isSyncRunning()` dulu menangani kasus
 * komponen dipasang saat siklus sudah berjalan (mis. pindah halaman di tengah push).
 */
export function useSyncActivity(): UseSyncActivityResult {
  const isSyncing = ref(false)

  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    isSyncing.value = isSyncRunning()
    unsubscribe = onSyncActivity((running) => {
      isSyncing.value = running
    })
  })

  onBeforeUnmount(() => {
    unsubscribe?.()
    unsubscribe = null
  })

  return { isSyncing: computed(() => isSyncing.value) }
}
