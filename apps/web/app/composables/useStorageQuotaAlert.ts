import {
  clearStorageQuotaError,
  onStorageQuotaChange,
  storageQuotaState,
  type StorageQuotaState,
} from '~/utils/storage/pressure'

export type UseStorageQuotaAlertResult = {
  /** `true` selama tulisan terakhir gagal karena kuota penuh dan belum ditutup user. */
  readonly isBlocked: ComputedRef<boolean>
  readonly state: ComputedRef<StorageQuotaState | null>
  /** Tutup banner; tulisan berikutnya yang gagal akan memunculkannya lagi. */
  readonly dismiss: () => void
}

/**
 * Status "kuota penuh" untuk banner shell.
 *
 * Sinyalnya berasal dari `utils/storage/pressure.ts` (dikirim `guardStorageWrite`). Komponen yang
 * dipasang setelah kejadian tetap melihat state awal, jadi berpindah halaman tidak menghilangkan
 * peringatan sebelum user menutupnya.
 */
export function useStorageQuotaAlert(): UseStorageQuotaAlertResult {
  const state = ref<StorageQuotaState | null>(null)

  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    state.value = storageQuotaState()
    unsubscribe = onStorageQuotaChange((next) => {
      state.value = next
    })
  })

  onBeforeUnmount(() => {
    unsubscribe?.()
    unsubscribe = null
  })

  return {
    isBlocked: computed(() => state.value !== null),
    state: computed(() => state.value),
    dismiss: () => clearStorageQuotaError(),
  }
}
