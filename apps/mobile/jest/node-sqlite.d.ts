// Tipe minimal `node:sqlite` (Node >= 22.13) untuk fake expo-sqlite di Jest. Mobile tidak memasang
// `@types/node` - app berjalan di Hermes, bukan Node - jadi hanya API yang dipakai fake yang ditulis.
declare module 'node:sqlite' {
  type SqlValue = string | number | null | Uint8Array

  interface StatementSync {
    run(...params: SqlValue[]): { changes: number; lastInsertRowid: number }
    get(...params: SqlValue[]): Record<string, SqlValue> | undefined
    all(...params: SqlValue[]): Record<string, SqlValue>[]
  }

  export class DatabaseSync {
    constructor(path: string)
    exec(source: string): void
    prepare(source: string): StatementSync
    close(): void
  }
}

declare module 'node:fs' {
  export function mkdtempSync(prefix: string): string
  export function rmSync(path: string, options: { recursive: boolean; force: boolean }): void
}

declare module 'node:os' {
  export function tmpdir(): string
}

declare module 'node:path' {
  export function join(...parts: string[]): string
}
