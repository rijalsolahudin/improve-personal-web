// Suite kontrak core (`@improve-personal/core/testing`) mengimpor `vitest`. Di Jest, API yang dipakai
// suite itu (describe/it/expect/beforeEach) sudah tersedia sebagai global dengan semantik yang sama.
// Dibaca lewat `globalThis` karena nama ekspor di bawah menutupi nama global di modul ini.
type JestGlobals = {
  readonly afterEach: jest.Lifecycle
  readonly beforeEach: jest.Lifecycle
  readonly describe: jest.Describe
  readonly expect: jest.Expect
  readonly it: jest.It
}

export const { afterEach, beforeEach, describe, expect, it } = globalThis as unknown as JestGlobals
