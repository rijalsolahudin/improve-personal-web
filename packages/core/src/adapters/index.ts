/**
 * `adapters/` - implementasi port untuk test & adapter platform (ARCHITECTURE.md §5).
 *
 * `memory.ts` adalah `StorageAdapter` in-memory yang memenuhi SELURUH kontrak `ports.ts`, dan
 * `contract.ts` adalah suite kontrak yang dijalankan ke tiga adapter: memori, IndexedDB (web), dan
 * SQLite (mobile) - itulah AC T23 ("adapter SQLite lolos test repository yang sama dengan
 * IndexedDB"). Suite itu sengaja TIDAK diekspor dari sini karena bergantung `vitest`; jalur
 * impornya `@improve-personal/core/testing`.
 */

export { createManualClock, createSystemClock, type ManualClock } from './clock.ts'

export { createMemoryStorage, type MemoryStorage, type MemoryStorageOptions } from './memory.ts'
