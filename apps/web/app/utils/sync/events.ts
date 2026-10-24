/**
 * Event jendela untuk koordinasi sync (bukan data user, bukan state Vue).
 *
 * Dipisah dari runner supaya penulis record tidak perlu mengimpor engine sync (push/pull + kontrak):
 * record-writer cukup memberi tahu "ada tulisan lokal", dan plugin sync yang memutuskan kapan
 * mengirim. Nama event memakai prefix teknis yang sama dengan database lokal (`ip-`).
 */

import { clearTrustedSyncReload, markTrustedSyncReload } from './refresh'

/** Ada tulisan lokal baru (record + outbox sudah commit). */
export const LOCAL_WRITE_EVENT = 'ip:local-write'

/** Satu siklus sync selesai (berhasil maupun gagal); UI membaca ulang statusnya. */
export const SYNC_STATE_EVENT = 'ip:sync-state'

/**
 * Pull menerapkan setidaknya satu record dari perangkat lain.
 *
 * Sengaja TANPA payload: jendela bisa mengirim event apa pun dari script same-origin, jadi listener
 * tidak boleh menganggap `detail` sebagai data tepercaya. Penerima hanya membaca ulang penyimpanan
 * lokal (sumber kebenaran), bukan membawa data user lewat event.
 */
export const SYNC_REMOTE_APPLIED_EVENT = 'ip:sync-remote-applied'

function dispatch(name: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(name))
}

export function notifyLocalWrite(): void {
  dispatch(LOCAL_WRITE_EVENT)
}

export function notifySyncState(): void {
  dispatch(SYNC_STATE_EVENT)
}

/**
 * Dipanggil controller setelah pull menerapkan record; store yang ter-hydrate memuat ulang.
 *
 * Penanda `markTrustedSyncReload()` hanya hidup selama dispatch: listener dipanggil sinkron, dan
 * `runSyncReloaders()` mengonsumsinya untuk melewati throttle anti-event-palsu. Event yang dikirim
 * script lain tidak pernah membawa tanda ini.
 */
export function notifyRemoteApplied(): void {
  markTrustedSyncReload()
  try {
    dispatch(SYNC_REMOTE_APPLIED_EVENT)
  } finally {
    clearTrustedSyncReload()
  }
}
