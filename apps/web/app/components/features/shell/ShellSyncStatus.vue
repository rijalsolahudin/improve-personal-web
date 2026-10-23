<script setup lang="ts">
import type { StorageAdapter } from '@improve-personal/core'

/**
 * Indikator status sinkronisasi di shell (PRD F15 "Status Sync Terlihat").
 *
 * Sumber datanya `useSyncStatus` → `readSyncStatus` core (bukan kesimpulan komponen): jumlah baris
 * outbox di penyimpanan lokal akun + keadaan jaringan. Belum ada push/pull engine di UI, jadi yang
 * ditampilkan adalah status antrean yang benar-benar ada - bukan "tersinkron" yang dikarang.
 *
 * Selama penyimpanan lokal belum terbuka (SSR, perangkat terkunci, atau storage diblokir) statusnya
 * belum diketahui; badge menampilkan "menunggu status sinkronisasi" alih-alih menebak `synced`.
 *
 * Sesi data lokal dibaca lewat `localData.current()`, BUKAN `ensure()`: `ensure()` menulis state
 * bersama (`loading`) dan itu membuat gate onboarding berkedip tertutup di halaman yang sama.
 */
const SYNC_REFRESH_MS = 60_000

const localData = useLocalData()
const { t } = useI18n()
const { dateTime } = useDateFormat()

const storage = shallowRef<StorageAdapter | null>(null)
const isOnline = ref(true)

const sync = useSyncStatus({
  getStorage: () => storage.value,
  isOnline: () => isOnline.value,
})

const label = computed(() => {
  const status = sync.status.value
  if (status === null) return t('sync.status.unknown')

  return t(`sync.status.${status}`, { n: sync.pendingCount.value })
})

const lastSync = computed(() =>
  sync.lastSyncAtMs.value === null
    ? null
    : t('sync.lastSync', { time: dateTime(sync.lastSyncAtMs.value) }),
)

let timer: ReturnType<typeof setInterval> | null = null

/** Ambil penyimpanan akun yang memang sudah terbuka, lalu baca status dari sana. */
function refresh(): void {
  isOnline.value = navigator.onLine
  storage.value = localData.current()?.storage ?? null
  void sync.refresh()
}

function onVisibility(): void {
  if (document.visibilityState === 'visible') void refresh()
}

onMounted(() => {
  refresh()
  window.addEventListener('online', refresh)
  window.addEventListener('offline', refresh)
  document.addEventListener('visibilitychange', onVisibility)
  timer = setInterval(refresh, SYNC_REFRESH_MS)
})

onBeforeUnmount(() => {
  window.removeEventListener('online', refresh)
  window.removeEventListener('offline', refresh)
  document.removeEventListener('visibilitychange', onVisibility)
  if (timer !== null) clearInterval(timer)
})

// Data lokal yang baru siap (login, pemulihan kunci, import) mengubah sumber statusnya.
watch(
  () => localData.state.value.status,
  (status) => {
    if (status === 'ready') refresh()
  },
)
</script>

<template>
  <p
    class="sync"
    :class="`sync--${sync.status.value ?? 'unknown'}`"
    role="status"
    aria-live="polite"
    :title="lastSync ?? undefined"
  >
    <span class="dot" aria-hidden="true" />
    <span class="text">{{ label }}</span>
    <span v-if="lastSync" class="last">{{ lastSync }}</span>
  </p>
</template>

<style scoped>
.sync {
  display: inline-flex;
  align-items: center;
  gap: var(--space-4, 0.25rem);
  margin: 0 0 var(--space-6, 0.5rem);
  padding: var(--space-3, 0.2rem) var(--space-6, 0.5rem);
  border: var(--border-thin, 1px) solid var(--line, #e6ded1);
  border-radius: var(--radius-pill, 999px);
  background: var(--surface-card, #fffdf8);
  color: var(--text-muted, #6b5e4b);
  font-size: var(--fs-caption, 0.75rem);
  font-weight: var(--fw-medium, 500);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-subtle, #8a7a60);
}

.sync--synced .dot {
  background: var(--success, #1d6b34);
}

.sync--pending .dot {
  background: var(--prio-medium-fg, #8a5a00);
}

.sync--offline .dot,
.sync--error .dot {
  background: var(--danger, #b0283e);
}

.last {
  color: var(--text-subtle, #8a7a60);
}

.last::before {
  content: '·';
  margin-right: var(--space-3, 0.2rem);
}
</style>
