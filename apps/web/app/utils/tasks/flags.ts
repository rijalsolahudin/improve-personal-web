import type { RecordIndexEntry } from '@improve-personal/core'

/**
 * Flag turunan `todo` yang disimpan plaintext di `record_index`.
 *
 * Kebutuhannya datang dari benchmark #137/#139: filter ("semua"/"selesai") dan urutan prioritas
 * hanya bisa dijawab dengan mendekripsi seluruh record task kalau status selesai dan prioritas tidak
 * ada di baris index. Nilai di sini adalah satu-satunya sumber untuk jalur tulis lokal
 * (`storage/record-writer.ts`), pull sync, reindex, dan import (`io/index-entry.ts`) - supaya
 * keduanya tidak bisa berbeda pendapat.
 *
 * Baris lama tanpa flag tetap sah; pembaca mengisinya lewat
 * `utils/tasks/page.ts` (backfill sekali per record).
 */
export type TodoIndexFlags = Pick<RecordIndexEntry, 'doneRank' | 'priorityRank'>

/** `null`/absen = bukan `todo` (tidak ada flag). */
export function todoFlagsOf(type: string, data: unknown): TodoIndexFlags | Record<string, never> {
  if (type !== 'todo') return {}

  const done = fieldOf(data, 'isDone')
  const priority = fieldOf(data, 'priority')

  return {
    doneRank: done === true ? 1 : 0,
    priorityRank: priority === 'urgent' ? 0 : priority === 'low' ? 2 : 1,
  }
}

function fieldOf(data: unknown, key: string): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
  return (data as Record<string, unknown>)[key]
}
