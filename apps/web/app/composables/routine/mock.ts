import type { RoutineStep } from '~/utils/dailyRoutine'

/** Langkah rutinitas contoh fase 1 (Desktop.dc.html `DEF_R`). Diganti repository lokal. */
export function createRoutineMock(): RoutineStep[] {
  return [
    { id: 'r1', title: 'Minum segelas air', block: 'pagi' },
    { id: 'r2', title: 'Stretching 10 mnt', block: 'pagi' },
    { id: 'r3', title: 'Tulis niat hari ini', block: 'pagi' },
    { id: 'r4', title: 'Jalan kaki 10 mnt', block: 'siang' },
    { id: 'r5', title: 'Cek ulang prioritas', block: 'siang' },
    { id: 'r6', title: 'Beresin meja', block: 'malam' },
    { id: 'r7', title: 'Siapin to-do besok', block: 'malam' },
    { id: 'r8', title: 'Isi jurnal & cek niat', block: 'malam' },
  ]
}
