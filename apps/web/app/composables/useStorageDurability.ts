import {
  formatBytes,
  isStorageLow,
  isStoragePersisted,
  readStorageEstimate,
  requestStoragePersistence,
  storageManager,
  storageUsageRatio,
} from '~/utils/storage/durability'

export type UseStorageDurabilityOptions = {
  /** Untuk test: ganti `navigator.storage`. `undefined` = pakai browser. */
  readonly manager?: StorageManager | null
}

/**
 * Status penyimpanan lokal untuk kartu Akun.
 *
 * Membaca `estimate()` + `persisted()` saat mount dan menyediakan aksi `protect()` untuk meminta
 * status persistent. Semua angka disimpan sebagai ref; di SSR nilainya `null` karena tidak ada
 * `navigator.storage` (tidak ada yang dirender sebelum hidrasi).
 */
export function useStorageDurability(options: UseStorageDurabilityOptions = {}) {
  function resolveManager(): StorageManager | null {
    return options.manager === undefined ? storageManager() : options.manager
  }

  const persisted = ref<boolean | null>(null)
  const usage = ref<number | null>(null)
  const quota = ref<number | null>(null)
  const busy = ref(false)

  const isSupported = computed(() => resolveManager() !== null)
  const ratio = computed(() => storageUsageRatio({ usage: usage.value, quota: quota.value }))
  const isLow = computed(() => isStorageLow(ratio.value))
  const percent = computed(() => (ratio.value === null ? 0 : Math.round(ratio.value * 100)))
  const formattedUsage = computed(() => (usage.value === null ? '-' : formatBytes(usage.value)))
  const formattedQuota = computed(() => (quota.value === null ? '-' : formatBytes(quota.value)))

  async function refresh(): Promise<void> {
    const manager = resolveManager()
    if (!manager) return

    const [estimate, isPersisted] = await Promise.all([
      readStorageEstimate(manager),
      isStoragePersisted(manager),
    ])

    usage.value = estimate.usage
    quota.value = estimate.quota
    persisted.value = isPersisted
  }

  async function protect(): Promise<boolean> {
    if (busy.value) return persisted.value === true

    busy.value = true
    try {
      const manager = resolveManager()
      persisted.value = (await requestStoragePersistence(manager)) ? true : false
      await refresh()
      return persisted.value === true
    } finally {
      busy.value = false
    }
  }

  onMounted(() => {
    void refresh()
  })

  return {
    persisted,
    usage,
    quota,
    ratio,
    isLow,
    isSupported,
    busy,
    percent,
    formattedUsage,
    formattedQuota,
    refresh,
    protect,
  }
}
