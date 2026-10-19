import {
  eisenhowerPlacementSchema,
  todoSchema,
  type EisenhowerPlacement,
  type Todo,
} from '@improve-personal/core'

import { createRepository } from '../storage/repository'
import type { LocalDataSession } from '../storage/session'
import type { Priority, Quadrant, Task } from '../tasks'

/**
 * Persistensi task: `Task` (bentuk yang dipakai UI) ↔ record `todo` + `eisenhower_placement`.
 *
 * Kenapa ada lapisan ini: PRD memisahkan dua entitas - `todo` (F2) dan `eisenhower_placement` (F3) -
 * sedangkan UI memakai satu bentuk `Task` dengan field `quadrant`. Pemisahan itu disengaja di data
 * (kuadran punya `position` sendiri, dan satu item hanya boleh punya satu penempatan), jadi penerjemahan
 * dua arah itu memang perlu satu tempat yang jelas - bukan disebar di komponen.
 *
 * Yang dipegang di sini:
 * - **Field yang tidak dipakai UI tidak hilang.** `note` dan `scheduleOccurrenceAt` dibawa terus dari
 *   record lama saat menimpa; kalau tidak, sekadar mengubah prioritas akan menghapus catatan yang sudah
 *   ditulis user.
 * - **Id payload = id record**, dijamin lewat `id` yang diberikan pemanggil (id record datang dari
 *   `session.newId()`, jadi UUIDv7 - bukan `crypto.randomUUID()` yang v4 dan ditolak schema).
 * - **Kuadran diterjemahkan eksplisit.** Kosakata UI (`plan`/`drop`) sengaja berbeda dari kosakata data
 *   (`schedule`/`delete`); pemetaannya ada di sini, bukan ditebak per komponen.
 */

/** Kosakata UI -> kosakata data. */
export const QUADRANT_TO_CORE: Readonly<Record<Quadrant, EisenhowerPlacement['quadrant']>> = {
  do: 'do',
  plan: 'schedule',
  delegate: 'delegate',
  drop: 'delete',
}

/** Kosakata data -> kosakata UI. */
export const QUADRANT_FROM_CORE: Readonly<Record<EisenhowerPlacement['quadrant'], Quadrant>> = {
  do: 'do',
  schedule: 'plan',
  delegate: 'delegate',
  delete: 'drop',
}

/** Repository yang dipakai modul ini (placement tidak ada di `RepositorySet`, jadi dibuat di sini). */
function placementsOf(session: LocalDataSession) {
  return createRepository(session, 'eisenhower_placement')
}

/**
 * `Task` -> payload `todo`.
 *
 * `previous` = record lama (kalau ada). Dipakai untuk mempertahankan field yang UI belum punya, dan
 * `createdAt` yang seharusnya tidak berubah hanya karena record ditimpa.
 */
export function toTodoPayload(task: Task, nowMs: number, previous?: Todo): Todo {
  return {
    id: task.id,
    title: task.title,
    note: previous?.note ?? null,
    deadlineAt: task.deadline,
    priority: task.priority,
    isDone: task.done,
    // `completedAt` hanya terisi saat selesai, dan dibuang saat dibuka lagi (aturan core) - kalau
    // dibiarkan, Overview akan menghitung "selesai hari ini" dari timestamp basi.
    completedAt: task.done ? (previous?.completedAt ?? nowMs) : null,
    scheduleId: task.scheduleId,
    scheduleOccurrenceAt: previous?.scheduleOccurrenceAt ?? null,
    createdAt: previous?.createdAt ?? nowMs,
    updatedAt: nowMs,
  }
}

/** `Task` -> payload `placement`, atau `null` kalau task belum dipilah ke kuadran mana pun. */
export function toPlacementPayload(input: {
  readonly task: Task
  readonly placementId: string
  readonly nowMs: number
  readonly previous?: EisenhowerPlacement
}): EisenhowerPlacement | null {
  const { task } = input
  if (task.quadrant === null) return null

  return {
    id: input.placementId,
    todoId: task.id,
    quadrant: QUADRANT_TO_CORE[task.quadrant],
    // Urutan di dalam kuadran belum diatur UI (F3 position); nilai lama dipertahankan apa adanya.
    position: input.previous?.position ?? 0,
    createdAt: input.previous?.createdAt ?? input.nowMs,
  }
}

/** Record -> bentuk UI. */
export function toTask(todo: Todo, placement: EisenhowerPlacement | null): Task {
  return {
    id: todo.id,
    title: todo.title,
    priority: todo.priority as Priority,
    deadline: todo.deadlineAt,
    done: todo.isDone,
    scheduleId: todo.scheduleId,
    quadrant: placement === null ? null : QUADRANT_FROM_CORE[placement.quadrant],
  }
}

/**
 * Semua task yang belum dihapus, lengkap dengan kuadrannya.
 *
 * Penempatan dibaca sekaligus lalu dipetakan per `todoId` - bukan satu query per task (itu N+1, dan
 * tabelnya kecil: satu baris per task yang dipilah).
 */
export async function loadTasks(session: LocalDataSession): Promise<Task[]> {
  const todos = await session.repos.todo.listAll({ includeDeleted: false })
  const placements = await placementsOf(session).listAll({ includeDeleted: false })

  const byTodoId = new Map<string, EisenhowerPlacement>()
  for (const record of placements) {
    const placement = eisenhowerPlacementSchema.parse(record.data)
    byTodoId.set(placement.todoId, placement)
  }

  return todos.map((record) =>
    toTask(todoSchema.parse(record.data), byTodoId.get(record.id) ?? null),
  )
}

/**
 * Simpan satu task (baru atau hasil edit): record `todo` + `placement`-nya.
 *
 * Kalau task dikeluarkan dari kuadran, baris placement-nya dihapus sebagai tombstone - bukan
 * dibiarkan, yang akan membuat task "muncul lagi" di matrix setelah reload.
 */
export async function persistTask(session: LocalDataSession, task: Task): Promise<void> {
  const nowMs = session.clock.nowMs()

  const existingTodo = await session.repos.todo.getById(task.id)
  const previous = existingTodo === null ? undefined : todoSchema.parse(existingTodo.data)

  await session.writer.write({
    id: task.id,
    type: 'todo',
    data: () => toTodoPayload(task, nowMs, previous),
    // Deadline jadi kunci rentang: kalender/overview memakai ini, bukan memindai semua record.
    index: { rangeStartMs: task.deadline, rangeEndMs: null },
  })

  const existingPlacement = await findPlacement(session, task.id)
  const placementId = existingPlacement?.id ?? session.newId()

  if (task.quadrant === null) {
    if (existingPlacement !== null) await session.writer.remove({ id: existingPlacement.id })
    return
  }

  const payload = toPlacementPayload({
    task,
    placementId,
    nowMs,
    previous: existingPlacement ?? undefined,
  })
  if (payload === null) return

  await session.writer.write({
    id: placementId,
    type: 'eisenhower_placement',
    data: () => payload,
    // Placement tidak punya dimensi waktu; baris index tetap ditulis supaya record-nya bisa ditemukan
    // berdasarkan tipe (`listAll`).
    index: null,
  })
}

/** Hapus task (tombstone) beserta penempatannya. */
export async function removeTask(session: LocalDataSession, id: string): Promise<void> {
  const existingPlacement = await findPlacement(session, id)

  await session.writer.remove({
    id,
    index: null,
  })

  if (existingPlacement !== null) await session.writer.remove({ id: existingPlacement.id })
}

/** Penempatan milik satu task, atau `null`. */
async function findPlacement(
  session: LocalDataSession,
  todoId: string,
): Promise<EisenhowerPlacement | null> {
  const placements = await placementsOf(session).listAll({ includeDeleted: false })

  for (const record of placements) {
    const placement = eisenhowerPlacementSchema.parse(record.data)
    if (placement.todoId === todoId) return placement
  }

  return null
}
