/**
 * `repository/` - interface repository + helper index rentang (AC T2, AC T23).
 *
 * Ini cuma interface & logika penyusunan index; implementasinya hidup di adapter platform. Yang
 * penting di sini cuma satu: fitur tidak pernah menyentuh `StorageAdapter` langsung, supaya jalur
 * panas (kalender/overview/daily) selalu lewat `record_index` dan bukan decrypt semua record.
 *
 * Catatan: `RangeQuery` dan `RecordIndexEntry` sengaja TIDAK di-export ulang dari `types.ts` di sini
 * - nama itu sudah keluar lewat `domain/storage.ts` (yang juga dari `ports.ts`), dan mengekspornya
 * dua kali dengan dua jalur cuma membuat `export *` di barrel utama jadi ambigu.
 */

export type {
  EntityRecord,
  OutboxIntent,
  RangeIndexInput,
  RangeQuerySpec,
  Repository,
  RepositorySet,
  SaveRecordInput,
} from './types.ts'

export {
  INDEXED_ENTITY_TYPES,
  compareIndexEntries,
  indexOverlapsRange,
  normalizeQueryRange,
  pointRangeIndex,
  scheduleRangeIndex,
} from './index-entry.ts'
