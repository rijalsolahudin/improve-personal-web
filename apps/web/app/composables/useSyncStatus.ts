import { readSyncStatus, type StorageAdapter, type SyncStatus } from '@improve-personal/core'
import type { ComputedRef } from 'vue'

import { quarantinedCount } from '~/utils/sync/quarantine'

/**
 * Status sinkronisasi yang ditampilkan shell (PRD F15 "Status Sync Terlihat").
 *
 * Sumbernya `readSyncStatus` dari core - satu tempat yang sama dengan mobile - supaya UI tidak
 * menyimpulkan statusnya sendiri dari "kelihatannya offline" atau "ada request yang gagal". Yang
 * dilaporkan di sini apa adanya:
 *
 * - `offline` : `navigator.onLine` bilang tidak ada koneksi.
 * - `error`   : ada baris outbox bertanda gagal (atau `sync_state.status` = `error`).
 * - `pending` : masih ada baris outbox menunggu dikirim (jumlahnya ikut ditampilkan).
 * - `synced`  : outbox kosong dan tidak ada kegagalan tercatat.
 *
 * Belum ada push/pull engine yang jalan dari UI (T21). Karena itu layar ini TIDAK menampilkan
 * "terakhir sinkron" yang dikarang: waktunya diambil dari `sync_state` (`lastPushAtMs`/`lastPullAtMs`)
 * dan disembunyikan selama belum pernah ada sinkronisasi.
 */

export type SyncStatusSource = {
  /** Penyimpanan lokal akun, atau `null` kalau belum dibuka (SSR, perangkat terkunci). */
  readonly getStorage: () => StorageAdapter | null
  /** Keadaan jaringan saat ini. Dibaca ulang setiap `refresh()`, bukan disimpan di sini. */
  readonly isOnline: () => boolean
  /**
   * Akun yang sedang aktif, atau `null` kalau belum login. Daftar karantina disimpan per pemilik
   * (`utils/sync/quarantine.ts`), jadi angka "tidak bisa dibuka" hanya boleh berasal dari akun ini -
   * bukan dari akun yang barusan logout di tab lain.
   */
  readonly getOwnerId: () => string | null
}

export type UseSyncStatusResult = {
  readonly status: ComputedRef<SyncStatus | null>
  readonly pendingCount: ComputedRef<number>
  readonly lastSyncAtMs: ComputedRef<number | null>
  /**
   * Jumlah record yang tidak bisa dibuka dan sudah dikarantina (lihat `utils/sync/quarantine.ts`).
   * Ini BUKAN status sync: data tetap tersimpan di perangkat dan pull berjalan lagi; yang hilang
   * hanya tampilannya. Karena itu UI menampilkannya sebagai keterangan terpisah.
   */
  readonly blockedCount: ComputedRef<number>
  readonly refresh: () => Promise<void>
}

export function useSyncStatus(source: SyncStatusSource): UseSyncStatusResult {
  const status = ref<SyncStatus | null>(null)
  const pendingCount = ref(0)
  const lastSyncAtMs = ref<number | null>(null)
  const blockedCount = ref(0)

  async function refresh(): Promise<void> {
    // Dibaca lebih dulu dan tanpa menunggu storage IndexedDB: daftar karantina ada di `localStorage`
    // perangkat, jadi keterangannya tetap bisa tampil walau penyimpanan akun belum terbuka.
    const ownerId = source.getOwnerId()
    blockedCount.value = ownerId === null ? 0 : quarantinedCount(ownerId)

    const storage = source.getStorage()
    if (storage === null) {
      status.value = null
      pendingCount.value = 0
      lastSyncAtMs.value = null
      return
    }

    try {
      const [pending, state] = await Promise.all([storage.countOutbox(), storage.getSyncState()])

      pendingCount.value = pending
      status.value = await readSyncStatus({
        storage,
        online: source.isOnline(),
        hasError: state?.status === 'error' ? true : undefined,
      })

      const pushed = state?.lastPushAtMs ?? null
      const pulled = state?.lastPullAtMs ?? null
      lastSyncAtMs.value =
        pushed === null && pulled === null ? null : Math.max(pushed ?? 0, pulled ?? 0)
    } catch {
      // Penyimpanan lokal gagal dibaca: itu bukan "tidak ada yang menunggu", jadi jangan berpura-pura
      // `synced`. Statusnya jadi `error` dan user bisa mencoba lagi saat halaman dimuat ulang.
      status.value = 'error'
      pendingCount.value = 0
      lastSyncAtMs.value = null
    }
  }

  return {
    status: computed(() => status.value),
    pendingCount: computed(() => pendingCount.value),
    lastSyncAtMs: computed(() => lastSyncAtMs.value),
    blockedCount: computed(() => blockedCount.value),
    refresh,
  }
}
