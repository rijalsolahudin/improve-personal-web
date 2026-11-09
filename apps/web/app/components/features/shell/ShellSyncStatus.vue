<script setup lang="ts">
import type { StorageAdapter, SyncStatus } from '@improve-personal/core'

import { SYNC_REMOTE_APPLIED_EVENT, SYNC_STATE_EVENT } from '~/utils/sync/events'
import { runSyncReloaders } from '~/utils/sync/refresh'

/**
 * Indikator sinkronisasi di dock kanan bawah (PRD F15 "Status Sync Terlihat").
 *
 * Sumber statusnya `useSyncStatus` → `readSyncStatus` core (bukan kesimpulan komponen): jumlah baris
 * outbox di penyimpanan lokal akun + keadaan jaringan. Push/pull dijalankan plugin
 * `sync.client.ts`; setelah satu siklus selesai event `SYNC_STATE_EVENT` memicu pembacaan ulang, jadi
 * indikator tidak menunggu polling 60 detik.
 *
 * Yang tampil hanya saat perlu dilihat:
 * - sedang sync → "Menyinkronkan…" (sinyal `useSyncActivity`, bukan status storage);
 * - menunggu dikirim / offline / gagal → status itu, dengan tombol "Coba lagi" saat gagal;
 * - tersinkron / status belum diketahui (storage belum terbuka) → tidak ada elemen. Status "sudah
 *   beres" tidak perlu diberitahukan terus-menerus di setiap halaman.
 *
 * Sesi data lokal dibaca lewat `localData.current()`, BUKAN `ensure()`: `ensure()` menulis state
 * bersama (`loading`) dan itu memicu pekerjaan tambahan di halaman yang sama.
 */
const SYNC_REFRESH_MS = 60_000

/** Status yang tetap perlu dilihat user walau tidak ada siklus berjalan. */
const ATTENTION_STATUSES: readonly SyncStatus[] = ['pending', 'offline', 'error']

const localData = useLocalData()
const { t } = useI18n()
const { dateTime } = useDateFormat()

const { isSyncing } = useSyncActivity()

const storage = shallowRef<StorageAdapter | null>(null)
const isOnline = ref(true)

const sync = useSyncStatus({
  getStorage: () => storage.value,
  isOnline: () => isOnline.value,
})

/**
 * Apakah wrapper perlu dirender sama sekali.
 *
 * `.sync-wrap` adalah item flex di `.fab-dock`; item tanpa isi tetap dihitung `gap`, jadi membiarkannya
 * sebagai elemen kosong menambah 10 px jarak Pomodoro↔Hias. Karena itu `v-if` dipasang di ROOT, bukan
 * hanya di anak-anaknya. Komponennya sendiri tetap ter-mount (listener sync, interval, dan `watch`
 * sesi data lokal jalan seperti biasa) - yang hilang hanya elemen DOM-nya.
 */
const showIndicator = computed(() => {
  const status = sync.status.value

  return isSyncing.value || (status !== null && ATTENTION_STATUSES.includes(status))
})

const label = computed(() => {
  if (isSyncing.value) return t('sync.status.syncing')

  const status = sync.status.value
  if (status === null) return ''

  return t(`sync.status.${status}`, { n: sync.pendingCount.value })
})

/** Kelas warna mengikuti status storage; saat siklus berjalan yang tampil spinner, bukan dot. */
const tone = computed(() => sync.status.value ?? 'unknown')

const lastSync = computed(() =>
  sync.lastSyncAtMs.value === null
    ? null
    : t('sync.lastSync', { time: dateTime(sync.lastSyncAtMs.value) }),
)

let timer: ReturnType<typeof setInterval> | null = null

/** Ambil penyimpanan akun yang memang sudah terbuka, lalu baca status dari sana. */
async function refresh(): Promise<void> {
  isOnline.value = navigator.onLine
  storage.value = localData.current()?.storage ?? null
  await sync.refresh()
}

async function requestCycle(): Promise<void> {
  // Controller dimuat malas: indikator status tampil di setiap halaman shell, sedangkan kode sync
  // hanya dibutuhkan setelah user menekan tombol.
  const { requestSyncNow } = await import('~/utils/sync/controller')
  requestSyncNow()
}

async function retry(): Promise<void> {
  await requestCycle()
}

function onVisibility(): void {
  if (document.visibilityState === 'visible') void refresh()
}

/**
 * Pull menerapkan record perangkat lain: store yang ter-hydrate di halaman ini memuat ulang datanya.
 *
 * Hanya store yang mendaftar (dipakai halaman ini) yang jalan - lihat `utils/sync/refresh.ts`.
 * Handler-nya fungsi modul yang sama tiap mount, dan listener dilepas saat unmount, jadi tidak ada
 * listener ganda saat komponen dipasang ulang.
 *
 * `fromWindowEvent` wajib: jendela bisa mengirim event ini dari script mana pun, jadi permintaan
 * beruntun di-throttle. Pull nyata membawa tanda tepercaya dari `notifyRemoteApplied()`.
 */
function onRemoteApplied(): void {
  void runSyncReloaders({ fromWindowEvent: true })
}

/** Jaringan berubah / siklus sync selesai: status dan angka karantina dibaca ulang. */
function onSyncState(): void {
  void refresh()
}

function onConnectivityChange(): void {
  void refresh()
}

onMounted(() => {
  void refresh()
  window.addEventListener('online', onConnectivityChange)
  window.addEventListener('offline', onConnectivityChange)
  window.addEventListener(SYNC_STATE_EVENT, onSyncState)
  window.addEventListener(SYNC_REMOTE_APPLIED_EVENT, onRemoteApplied)
  document.addEventListener('visibilitychange', onVisibility)
  timer = setInterval(onSyncState, SYNC_REFRESH_MS)
})

onBeforeUnmount(() => {
  window.removeEventListener('online', onConnectivityChange)
  window.removeEventListener('offline', onConnectivityChange)
  window.removeEventListener(SYNC_STATE_EVENT, onSyncState)
  window.removeEventListener(SYNC_REMOTE_APPLIED_EVENT, onRemoteApplied)
  document.removeEventListener('visibilitychange', onVisibility)
  if (timer !== null) clearInterval(timer)
})

// Data lokal yang baru siap (login, pemulihan kunci, import) mengubah sumber statusnya.
watch(
  () => localData.state.value.status,
  (status) => {
    if (status === 'ready') void refresh()
  },
)
</script>

<template>
  <div v-if="showIndicator" class="sync-wrap">
    <div class="sync-row">
      <p
        class="sync"
        :class="`sync--${tone}`"
        role="status"
        aria-live="polite"
        :title="lastSync ?? undefined"
      >
        <span v-if="isSyncing" class="spinner" aria-hidden="true" />
        <span v-else class="dot" aria-hidden="true" />
        <span class="text">{{ label }}</span>
      </p>
      <button
        v-if="sync.status.value === 'error' && !isSyncing"
        type="button"
        class="retry"
        @click="retry"
      >
        {{ t('sync.retry') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.sync-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-4, 0.5rem);
  max-width: min(320px, calc(100vw - 28px));
}

.sync-row {
  display: flex;
  align-items: center;
  gap: var(--space-4, 0.5rem);
}

.sync {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3, 0.375rem);
  margin: 0;
  padding: 0 var(--space-6, 0.75rem);
  height: 32px;
  border: var(--border-thin, 2px) solid var(--line, #e6ded1);
  border-radius: var(--radius-pill, 999px);
  background: var(--surface-card, #fffdf8);
  color: var(--text-muted, #6b5e4b);
  font-size: var(--fs-caption, 0.8125rem);
  font-weight: var(--fw-medium, 500);
  white-space: nowrap;
}

.retry {
  padding: 0 var(--space-6, 0.75rem);
  height: 32px;
  border: var(--border-thin, 2px) solid var(--line, #e6ded1);
  border-radius: var(--radius-pill, 999px);
  background: transparent;
  color: var(--text-muted, #6b5e4b);
  font-size: var(--fs-caption, 0.8125rem);
  cursor: pointer;
}

.retry:hover {
  border-color: var(--danger, #b0283e);
  color: var(--danger, #b0283e);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-subtle, #8a7a60);
}

.sync--pending .dot {
  background: var(--prio-medium-fg, #8a5a00);
}

.sync--offline .dot,
.sync--error .dot {
  background: var(--danger, #b0283e);
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--line, #e6ded1);
  border-top-color: var(--text-muted, #6b5e4b);
  border-radius: 50%;
  animation: sync-spin 0.8s linear infinite;
}

@keyframes sync-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Getaran/perputaran terus-menerus bisa mengganggu; teks "Menyinkronkan…" sudah cukup jelas. */
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>
