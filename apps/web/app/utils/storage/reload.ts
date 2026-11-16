import type { LocalDataSession } from '~/utils/storage/session'

/**
 * Registry "muat ulang store setelah data lokal berubah di luar store" - mis. import/restore yang
 * menulis langsung ke penyimpanan lewat core, bukan lewat composable fitur.
 *
 * Kenapa registry, bukan memanggil composable langsung dari pemicu: memanggil `useCountdowns()`/
 * `usePomodoro()`/`useGoals()` dari sana akan membuat store yang tidak dipakai halaman ikut dimuat.
 * Registry hanya berisi store yang benar-benar dipakai: composable mendaftarkan dirinya saat
 * dipanggil, dan yang tidak pernah dipanggil tidak ada di sini.
 *
 * Urutan (`RELOAD_ORDER`) bukan alfabetis, dan itu penting:
 * - `goalLinks` lebih dulu: task/jadwal/habit membangun tautannya dari snapshot itu.
 * - `goals` sebelum task/habit/jadwal, tetapi presentation-nya dihitung ulang begitu sumber
 *   (task/habit/jadwal) selesai dimuat - jadi angka progress tidak basi.
 */

export type DataReloadKey =
  | 'goalCategories'
  | 'goalLinks'
  | 'goals'
  | 'tasks'
  | 'schedules'
  | 'habits'
  | 'countdowns'
  | 'memos'
  | 'journalStickers'
  | 'pomodoro'
  | 'appearance'
  | 'profile'

/**
 * Urutan muat ulang. Hiasan halaman (`useDeco`) sengaja TIDAK ada di sini: itemnya disimpan di
 * `localStorage`, bukan record, jadi tidak ada yang perlu dibaca ulang setelah import/restore.
 */
export const RELOAD_ORDER: readonly DataReloadKey[] = [
  'goalCategories',
  'goalLinks',
  'goals',
  'tasks',
  'schedules',
  'habits',
  'countdowns',
  'memos',
  'journalStickers',
  'pomodoro',
  'appearance',
  'profile',
]

const reloaders = new Map<DataReloadKey, () => Promise<void>>()

/** Satu putaran yang sedang berjalan; `null` = tidak ada. */
let round: Promise<void> | null = null
/** Ada permintaan yang datang saat putaran berjalan: jalankan TEPAT satu putaran tambahan. */
let repeatRequested = false

/**
 * Daftarkan cara memuat ulang satu store. Pemanggil berikutnya dengan kunci yang sama menimpa
 * closure sebelumnya - aman karena semua pemanggil `useX()` melihat `useState` yang sama, jadi
 * closure-nya setara. Yang penting: pendaftaran tidak menahan referensi komponen.
 *
 * Entri TIDAK dilepas saat halaman ditinggalkan, dan itu disengaja: melepasnya butuh
 * `getCurrentScope`/`onScopeDispose` dari Vue, dan impor itu memecah chunk runtime sehingga JS awal
 * landing melewati budget 170 KB (gagal gerbang `bundle-budget.test.ts`). Biayanya kecil - setiap
 * putaran membaca ulang store yang pernah dipakai halaman sebelumnya, maksimal satu pembacaan per key.
 */
export function registerDataReloader(key: DataReloadKey, reload: () => Promise<void>): void {
  // Server tidak punya jendela dan tidak pernah menjalankan reloader; menyimpan closure dari satu
  // request di modul bersama justru bisa membocorkan `useState` request itu ke request lain.
  if (typeof window === 'undefined') return
  reloaders.set(key, reload)
}

/**
 * Jalankan reloader yang terdaftar, berurutan, serial.
 *
 * Permintaan yang datang saat putaran berjalan tidak mengantre tanpa batas: cukup menandai satu
 * putaran tambahan, supaya tulisan yang masuk di tengah putaran tetap terbaca.
 *
 * Promise ini TIDAK pernah reject: tiap store sudah melaporkan kegagalannya lewat `status`/`error`.
 * Satu store yang gagal tidak boleh menghentikan store lain.
 */
export function runDataReloaders(): Promise<void> {
  if (round !== null) {
    repeatRequested = true
    return round
  }

  round = (async () => {
    do {
      repeatRequested = false
      for (const key of RELOAD_ORDER) {
        const reload = reloaders.get(key)
        if (reload === undefined) continue
        try {
          await reload()
        } catch {
          // Store melaporkan errornya sendiri; di sini cukup jangan menularkannya ke store lain.
        }
      }
    } while (repeatRequested)
  })().finally(() => {
    round = null
  })

  return round
}

/** Sesi untuk satu putaran reload, beserta asal sesinya. */
export type ReloadSession<T extends { readonly userId: string } = LocalDataSession> = {
  readonly session: T
  /** `true` = sesi berasal dari `localData.current()`; pemiliknya wajib dicek lagi setelah await. */
  readonly isOpened: boolean
}

/**
 * Ambil sesi untuk `reload()` TANPA membuka penyimpanan.
 *
 * `ensure()` adalah pembuka sesi (menulis `status = 'loading'`, memuat modul kripto). Reload hanya
 * relevan untuk store yang datanya sudah pernah dimuat, jadi pembaca memakai sesi yang SUDAH terbuka;
 * `fallback` hanya untuk keadaan yang tidak punya sesi terbuka (SSR, atau test yang menyuntik sesi
 * lewat `options.session`).
 */
export async function reloadSession<T extends { readonly userId: string }>(
  current: () => LocalDataSession | null,
  fallback: () => Promise<T | null>,
): Promise<ReloadSession<LocalDataSession | T> | null> {
  const opened = current()
  if (opened !== null) return { session: opened, isOpened: true }

  const session = await fallback()
  return session === null ? null : { session, isOpened: false }
}

/**
 * Sesi reload masih sesi yang terbuka? Diperiksa SESUDAH await (membaca + mendekripsi tabel bisa
 * lambat): kalau sesi ditutup di tengahnya, hasil bacaannya tidak boleh ditulis ke `useState`.
 *
 * Sesi hasil `current()` dibandingkan dengan pemilik yang terbuka sekarang. Sesi suntikan test tidak
 * punya padanan di `current()`, jadi hasilnya tetap dipakai.
 */
export function isReloadSessionActive<T extends { readonly userId: string }>(
  target: ReloadSession<T>,
  current: () => { readonly userId: string } | null,
): boolean {
  const active = current()
  if (active !== null) return active.userId === target.session.userId

  return !target.isOpened
}

/**
 * Baca ulang setelah antrean tulis kosong.
 *
 * Tanpa menunggu antrean, reload bisa membaca penyimpanan SEBELUM tulisan yang sedang berjalan
 * mendarat, lalu mengembalikan UI ke nilai lama tepat setelah user menekan toggle. Bila antrean
 * bertambah selama pembacaan (tulisan baru masuk), tunggu tulisan itu lalu baca sekali lagi - bukan
 * berulang tanpa batas, karena store lain sudah melaporkan errornya sendiri dan data berikutnya akan
 * dimuat pada putaran reload berikutnya.
 */
export async function readAfterWrites<T>(
  currentQueue: () => Promise<unknown>,
  read: () => Promise<T>,
): Promise<T> {
  const pending = currentQueue()
  await pending.catch(() => undefined)

  const result = await read()

  const next = currentQueue()
  if (next === pending) return result

  await next.catch(() => undefined)
  return read()
}

/** Dipakai test supaya registry tidak bocor antar kasus. */
export function resetDataReloadersForTest(): void {
  reloaders.clear()
  round = null
  repeatRequested = false
}
