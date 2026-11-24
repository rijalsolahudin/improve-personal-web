/**
 * Fake `expo-secure-store` untuk Jest, meniru perilaku native yang relevan bagi adapter:
 * - Item `requireAuthentication` dan tanpa-auth hidup di "service" berbeda (iOS menambah sufiks
 *   `:auth` / `:no-auth`), jadi baca/hapus harus memakai opsi yang sama dengan saat menulis.
 * - Biometrik berubah: item terikat biometrik dibaca sebagai `null` (Android menelan
 *   `KeyPermanentlyInvalidatedException`; iOS `errSecItemNotFound`), item tanpa-auth tetap ada.
 */

type Options = { requireAuthentication?: boolean; keychainAccessible?: number }

export const AFTER_FIRST_UNLOCK = 0
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1
export const ALWAYS = 4
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 3
export const ALWAYS_THIS_DEVICE_ONLY = 5
export const WHEN_UNLOCKED = 2
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 6

const items = new Map<string, string>()
let isBiometryInvalidated = false
let nextFailure: Error | null = null

function itemKey(key: string, options?: Options): string {
  return `${options?.requireAuthentication === true ? 'auth' : 'no-auth'}:${key}`
}

function takeFailure(): void {
  const failure = nextFailure
  nextFailure = null
  if (failure !== null) throw failure
}

export const getItemAsync = jest.fn(async (key: string, options?: Options) => {
  takeFailure()
  if (options?.requireAuthentication === true && isBiometryInvalidated) return null
  return items.get(itemKey(key, options)) ?? null
})

export const setItemAsync = jest.fn(async (key: string, value: string, options?: Options) => {
  takeFailure()
  items.set(itemKey(key, options), value)
})

export const deleteItemAsync = jest.fn(async (key: string, options?: Options) => {
  takeFailure()
  items.delete(itemKey(key, options))
})

/** Kendali test - hanya dipakai dari `*.test.ts`. */
export const fakeSecureStore = {
  /** Tiru pendaftaran sidik jari/wajah baru: item terikat biometrik tidak terbaca lagi. */
  invalidateBiometry(): void {
    isBiometryInvalidated = true
  },
  /** Panggilan native berikutnya melempar error ini (prompt dibatalkan, lockout, dll.). */
  failNext(error: Error): void {
    nextFailure = error
  },
  /** Timpa nilai item secara langsung (mis. item rusak). */
  corrupt(key: string, value: string, options?: Options): void {
    items.set(itemKey(key, options), value)
  },
  reset(): void {
    items.clear()
    isBiometryInvalidated = false
    nextFailure = null
  },
}
