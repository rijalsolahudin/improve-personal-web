import type { Priority, Quadrant, Task } from '~/utils/tasks'
import { MS_PER_HOUR } from '~/utils/time'

/**
 * Task contoh fase 1 (isi Home Desktop.dc.html), deadline relatif ke `now`.
 * Diganti repository lokal (packages/core).
 */
export function createTasksMock(now: number): Task[] {
  const task = (
    id: string,
    title: string,
    priority: Priority,
    hoursFromNow: number | null,
    extra: { done?: boolean; scheduleId?: string; quadrant?: Quadrant } = {},
  ): Task => ({
    id,
    title,
    priority,
    deadline: hoursFromNow === null ? null : now + hoursFromNow * MS_PER_HOUR,
    done: extra.done ?? false,
    scheduleId: extra.scheduleId ?? null,
    quadrant: extra.quadrant ?? null,
  })

  return [
    task('t1', 'Selesai modul 4 — VPC', 'urgent', 3, {
      scheduleId: 'aws',
      quadrant: 'do',
    }),
    task('t2', 'Bayar tagihan internet', 'medium', 6, { quadrant: 'plan' }),
    task('t3', 'Review catatan kelas', 'low', 27, {
      done: true,
      scheduleId: 'aws',
      quadrant: 'plan',
    }),
    task('t4', 'Kirim draft laporan', 'urgent', -2, {
      quadrant: 'do',
    }),
    task('t5', 'Balas email vendor', 'medium', 30, { quadrant: 'delegate' }),
    task('t6', 'Rapikan folder download', 'low', 120, { quadrant: 'drop' }),
    task('t7', 'Siapkan slide presentasi', 'urgent', 50, { scheduleId: 'stand' }),
    task('t8', 'Beli kado Mama', 'medium', 400),
    task('t9', 'Perpanjang SIM', 'low', null),
  ]
}
