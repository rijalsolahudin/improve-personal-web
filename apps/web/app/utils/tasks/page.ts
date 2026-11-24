import type { RecordIndexEntry } from '@improve-personal/core'

import { decodeRecord } from '../storage/record-codec'
import type { LocalDataSession } from '../storage/session'
import {
  toIsoDate,
  TASK_FILTERS,
  type Priority,
  type Task,
  type TaskFilter,
  type TaskSort,
} from '@improve-personal/core/planner'
import { todoFlagsOf } from './flags'

/**
 * Baca daftar To-do lewat `record_index`, bukan `listAll`.
 *
 * Kenapa: `listAll` mendekripsi SETIAP record task (bench #137: 50k task = 2,8 detik) hanya untuk
 * memfilter "belum selesai" dan mengurutkan prioritas. Status selesai + prioritas kini ikut ditulis
 * sebagai flag plaintext di baris index (`utils/tasks/flags.ts`), jadi:
 *
 * 1. filter, urut, dan hitungan chip dijawab dari baris index (tanpa dekripsi);
 * 2. hanya halaman yang benar-benar tampil yang didekripsi.
 *
 * Baris lama (dibuat sebelum flag ada) di-backfill sekali di sini: record-nya didekripsi, flag-nya
 * ditulis ulang ke index. Setelah itu biayanya tidak kembali ke O(N) dekripsi.
 */
export type TodoIndexEntry = RecordIndexEntry & {
  readonly doneRank: 0 | 1
  readonly priorityRank: 0 | 1 | 2
}

export type TodoQuery = {
  readonly filter: TaskFilter
  readonly sort: TaskSort
  readonly nowMs: number
  readonly offset?: number
  readonly limit?: number
}

/** Deadline kosong selalu di bawah (sama dengan `sortTasks` di UI). */
const NO_DEADLINE = Number.POSITIVE_INFINITY

function hasFlags(entry: RecordIndexEntry): entry is TodoIndexEntry {
  return entry.doneRank !== undefined && entry.priorityRank !== undefined
}

function byDeadline(a: TodoIndexEntry, b: TodoIndexEntry): number {
  return (
    (a.rangeStartMs ?? NO_DEADLINE) - (b.rangeStartMs ?? NO_DEADLINE) ||
    a.recordId.localeCompare(b.recordId)
  )
}

export function matchesTodoEntry(
  entry: TodoIndexEntry,
  filter: TaskFilter,
  nowMs: number,
): boolean {
  switch (filter) {
    case 'semua':
      return entry.doneRank === 0
    case 'selesai':
      return entry.doneRank === 1
    case 'hari':
      return (
        entry.doneRank === 0 &&
        entry.rangeStartMs !== null &&
        toIsoDate(new Date(entry.rangeStartMs)) === toIsoDate(new Date(nowMs))
      )
    case 'mendatang':
      return entry.doneRank === 0 && entry.rangeStartMs !== null && entry.rangeStartMs > nowMs
    case 'terlambat':
      return entry.doneRank === 0 && entry.rangeStartMs !== null && entry.rangeStartMs < nowMs
  }
}

export function compareTodoEntries(
  sort: TaskSort,
): (a: TodoIndexEntry, b: TodoIndexEntry) => number {
  return sort === 'prioritas'
    ? (a, b) => a.priorityRank - b.priorityRank || byDeadline(a, b)
    : byDeadline
}

/** Hitungan chip filter + total, satu lintasan atas baris index. */
export function countTodoEntries(
  entries: readonly TodoIndexEntry[],
  nowMs: number,
): Record<TaskFilter, number> {
  const counts = {} as Record<TaskFilter, number>
  for (const filter of TASK_FILTERS) counts[filter] = 0

  for (const entry of entries) {
    for (const filter of TASK_FILTERS) {
      if (matchesTodoEntry(entry, filter, nowMs)) counts[filter] += 1
    }
  }

  return counts
}

/** Id yang masuk halaman ini, sudah difilter + diurutkan. */
export function selectTodoIds(entries: readonly TodoIndexEntry[], query: TodoQuery): string[] {
  const offset = Math.max(0, query.offset ?? 0)
  const matched = entries
    .filter((entry) => matchesTodoEntry(entry, query.filter, query.nowMs))
    .sort(compareTodoEntries(query.sort))

  const page =
    query.limit === undefined ? matched.slice(offset) : matched.slice(offset, offset + query.limit)
  return page.map((entry) => entry.recordId)
}

/**
 * Baris index `todo` dengan flag lengkap. Baris yang belum ber-flag di-backfill sekali.
 *
 * Backfill dipecah per `BACKFILL_CHUNK` dan menyerahkan kendali ke event loop di antaranya: 50k
 * record butuh ~6 detik (bench #138), dan satu transaksi raksasa akan membekukan tab selama itu.
 * Pemanggil bisa menampilkan progres lewat `onProgress`.
 *
 * Record yang gagal didekripsi (rusak/kunci salah) dilewati - lebih jujur daripada menampilkannya di
 * filter yang salah. Record seperti itu tetap terlihat di jalur pemulihan (`reindex`).
 */
export const BACKFILL_CHUNK = 200

export type TodoIndexLoadOptions = {
  readonly onProgress?: (done: number, total: number) => void
}

export async function loadTodoIndex(
  session: LocalDataSession,
  options: TodoIndexLoadOptions = {},
): Promise<TodoIndexEntry[]> {
  const entries = await session.storage.listIndexByType('todo')
  const missing = entries.filter((entry) => !hasFlags(entry))

  if (missing.length === 0) return entries.map((entry) => entry as TodoIndexEntry)

  const entryById = new Map(missing.map((entry) => [entry.recordId, entry]))
  const backfilledById = new Map<string, TodoIndexEntry>()
  options.onProgress?.(0, missing.length)

  for (let start = 0; start < missing.length; start += BACKFILL_CHUNK) {
    const chunk = missing.slice(start, start + BACKFILL_CHUNK)
    const stored = await session.storage.getRecords(chunk.map((entry) => entry.recordId))
    const filled: TodoIndexEntry[] = []

    for (const row of stored) {
      if (row.deleted) continue
      const entry = entryById.get(row.id)
      if (entry === undefined) continue
      try {
        const record = await decodeRecord(session.provider, session.dataKey, row)
        const flags = todoFlagsOf(record.type, record.data)
        if (flags.doneRank === undefined || flags.priorityRank === undefined) continue
        filled.push({ ...entry, doneRank: flags.doneRank, priorityRank: flags.priorityRank })
      } catch {
        // Record tak terbuka: biarkan tanpa flag (tidak ikut daftar) sampai jalur pemulihan memperbaiki.
      }
    }

    if (filled.length > 0) {
      await session.storage.runTransaction('todo.index.flags', async (tx) => {
        for (const entry of filled) await tx.putRecordIndex(entry.recordId, entry)
      })
      for (const entry of filled) backfilledById.set(entry.recordId, entry)
    }

    options.onProgress?.(Math.min(start + chunk.length, missing.length), missing.length)
    // Beri kesempatan paint/input di antara chunk (satu transaksi 50k = tab beku 6 detik).
    if (start + BACKFILL_CHUNK < missing.length) await yieldToMain()
  }

  return entries.flatMap((entry) => {
    const filled = backfilledById.get(entry.recordId) ?? (hasFlags(entry) ? entry : null)
    return filled === null ? [] : [filled]
  })
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Halaman task siap render: id dari index, lalu hanya record halaman itu yang didekripsi.
 *
 * `quadrant`/`position` tidak diisi di sini - halaman To-do tidak memakainya (matrix Eisenhower
 * membaca placement lewat jalur sendiri). `null`/`0` dipakai supaya bentuk `Task` tetap utuh.
 */
export async function loadTodoPage(
  session: LocalDataSession,
  query: TodoQuery,
): Promise<{ tasks: Task[]; counts: Record<TaskFilter, number> }> {
  const entries = await loadTodoIndex(session)
  const counts = countTodoEntries(entries, query.nowMs)
  const ids = selectTodoIds(entries, query)

  const stored = await session.storage.getRecords(ids)
  const byId = new Map(stored.map((row) => [row.id, row]))
  const tasks: Task[] = []

  for (const id of ids) {
    const row = byId.get(id)
    if (row === undefined || row.deleted) continue
    const record = await decodeRecord(session.provider, session.dataKey, row)
    const data = record.data as {
      title: string
      priority: Priority
      deadlineAt: number | null
      isDone: boolean
      scheduleId: string | null
    }
    tasks.push({
      id,
      title: data.title,
      priority: data.priority,
      deadline: data.deadlineAt,
      done: data.isDone,
      scheduleId: data.scheduleId,
      quadrant: null,
      position: 0,
    })
  }

  return { tasks, counts }
}
