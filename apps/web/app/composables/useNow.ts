/**
 * Jam global aplikasi (epoch ms). Diperbarui oleh SATU ticker di `plugins/ticker.client.ts`
 * (ARCHITECTURE §11: satu ticker per app, bukan per item).
 */
export function useNow() {
  return useState<number>('now', () => Date.now())
}
