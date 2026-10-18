import { z } from 'zod'

import { todoPrioritySchema } from '../enums.ts'
import { epochMsSchema, uuidV7Schema } from './primitives.ts'

/**
 * F2 Todo, F3 Eisenhower placement.
 *
 * `todo` menyimpan deadline + prioritas; sisa waktu dinamis TIDAK disimpan - dihitung dari
 * `deadline_at` oleh satu ticker global (`calc/remaining-time.ts`), bukan `setInterval` per item.
 */

export const todoSchema = z
  .object({
    id: uuidV7Schema,
    title: z.string().trim().min(1).max(500),
    note: z.string().max(20_000).nullable(),
    /** Epoch ms UTC; opsional (task tanpa deadline). */
    deadlineAt: epochMsSchema.nullable(),
    priority: todoPrioritySchema,
    isDone: z.boolean(),
    completedAt: epochMsSchema.nullable(),
    /** Soft ref ke jadwal; bisa ke kejadian tertentu. Boleh menunjuk record yang sudah dihapus. */
    scheduleId: uuidV7Schema.nullable(),
    /** Kalau tertaut ke satu kejadian dari jadwal rutin. */
    scheduleOccurrenceAt: epochMsSchema.nullable(),
    createdAt: epochMsSchema,
    updatedAt: epochMsSchema,
  })
  .strict()

export type Todo = z.infer<typeof todoSchema>

/**
 * Aturan murni: task dianggap "selesai" konsisten antara `is_done` dan `completed_at`.
 *
 * `completed_at` diisi HANYA saat `is_done` true, dan dibuang saat task dibuka lagi - kalau tidak,
 * Overview bisa menghitung "task selesai hari ini" dari timestamp basi.
 */
export function applyCompletion(todo: Todo, isDone: boolean, atMs: number): Todo {
  return { ...todo, isDone, completedAt: isDone ? atMs : null }
}

/**
 * Aturan murni (AC T5 filter F2): klasifikasi task relatif ke "hari ini".
 *
 * `todayStartMs`/`todayEndMs` dihitung pemanggil dari tz perangkat - fungsi ini tidak menyentuh tz.
 */
export function todoBucket(
  todo: Pick<Todo, 'isDone' | 'deadlineAt'>,
  todayStartMs: number,
  todayEndMs: number,
): 'done' | 'today' | 'upcoming' | 'overdue' | 'undated' {
  if (todo.isDone) return 'done'
  if (todo.deadlineAt === null) return 'undated'
  if (todo.deadlineAt < todayStartMs) return 'overdue'
  if (todo.deadlineAt <= todayEndMs) return 'today'
  return 'upcoming'
}

/**
 * F3 `eisenhower_placement`.
 *
 * `position` = posisi ordinal DI DALAM kuadran, bukan pixel absolut (DBML menegaskan ini) supaya
 * layout tidak rusak saat ukuran layar berbeda.
 *
 * `todo_id` unik (`uq_eisenhower_todo`): satu task tidak boleh dobel masuk matrix.
 */
export const eisenhowerPlacementSchema = z
  .object({
    id: uuidV7Schema,
    todoId: uuidV7Schema,
    quadrant: z.enum(['do', 'schedule', 'delegate', 'delete']),
    position: z.int().min(0).max(100_000),
    createdAt: epochMsSchema,
  })
  .strict()

export type EisenhowerPlacement = z.infer<typeof eisenhowerPlacementSchema>

/**
 * Aturan murni: item yang boleh ditambahkan ke matrix.
 *
 * "Wajib pilih dari to-do list yang belum ada di matrix" (PRD F3) - jadi task yang sudah punya
 * placement ditolak, bukan dipindah diam-diam.
 */
export function canAddToMatrix(
  todo: Pick<Todo, 'id'>,
  existingPlacements: readonly Pick<EisenhowerPlacement, 'todoId'>[],
): boolean {
  return !existingPlacements.some((placement) => placement.todoId === todo.id)
}

/**
 * Aturan murni "Bersihkan yang selesai": buang placement untuk task yang `is_done` true.
 * Task-nya sendiri TETAP ada (PRD F3) - yang dihapus cuma baris placement.
 */
export function partitionsForCleanup(
  placements: readonly EisenhowerPlacement[],
  doneTodoIds: ReadonlySet<string>,
): {
  readonly keep: readonly EisenhowerPlacement[]
  readonly removed: readonly EisenhowerPlacement[]
} {
  const keep: EisenhowerPlacement[] = []
  const removed: EisenhowerPlacement[] = []

  for (const placement of placements) {
    if (doneTodoIds.has(placement.todoId)) removed.push(placement)
    else keep.push(placement)
  }

  return { keep, removed }
}

/**
 * Aturan murni: posisi ordinal setelah drag & drop di dalam satu kuadran.
 *
 * Menghasilkan daftar id berurutan untuk satu kuadran (urutan tampil = urutan `position`). `from`/`to`
 * di-clamp ke rentang daftar supaya drag di luar batas tidak menghasilkan `position` negatif.
 */
export function reorderPlacements(
  orderedIds: readonly string[],
  fromIndex: number,
  toIndex: number,
): readonly string[] {
  const result = [...orderedIds]
  if (result.length === 0) return result

  const from = Math.min(Math.max(fromIndex, 0), result.length - 1)
  const to = Math.min(Math.max(toIndex, 0), result.length - 1)
  if (from === to) return result

  const [moved] = result.splice(from, 1)
  if (moved === undefined) return result
  result.splice(to, 0, moved)
  return result
}
