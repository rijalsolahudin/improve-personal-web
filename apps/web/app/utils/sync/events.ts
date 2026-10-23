/**
 * Event jendela untuk koordinasi sync (bukan data user, bukan state Vue).
 *
 * Dipisah dari runner supaya penulis record tidak perlu mengimpor engine sync (push/pull + kontrak):
 * record-writer cukup memberi tahu "ada tulisan lokal", dan plugin sync yang memutuskan kapan
 * mengirim. Nama event memakai prefix teknis yang sama dengan database lokal (`ip-`).
 */

/** Ada tulisan lokal baru (record + outbox sudah commit). */
export const LOCAL_WRITE_EVENT = 'ip:local-write'

/** Satu siklus sync selesai (berhasil maupun gagal); UI membaca ulang statusnya. */
export const SYNC_STATE_EVENT = 'ip:sync-state'

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
