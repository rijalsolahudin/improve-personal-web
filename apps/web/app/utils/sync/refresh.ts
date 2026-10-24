import { getCurrentScope, onScopeDispose } from 'vue'

/**
 * Registry "muat ulang store setelah pull".
 *
 * Kenapa registry, bukan memanggil composable langsung dari `ShellSyncStatus`:
 * `useCountdowns()`/`usePomodoro()`/`useGoals()` di setup shell akan membuat `useNow()` (timer per
 * detik) dan membaca `localStorage` di SETIAP halaman dashboard, padahal halaman itu belum tentu
 * memakai datanya. Registry hanya berisi store yang benar-benar dipakai halaman yang sedang terbuka:
 * composable mendaftarkan dirinya saat dipanggil, dan yang tidak pernah dipanggil tidak ikut dimuat.
 *
 * Urutan (`RELOAD_ORDER`) bukan alfabetis, dan itu penting:
 * - `goalLinks` lebih dulu: task/jadwal/habit membangun tautannya dari snapshot ini.
 * - `goals` sebelum task/habit/jadwal, tetapi presentation-nya dihitung ulang oleh watcher `useGoals`
 *   begitu sumber (task/habit/jadwal) selesai dimuat - jadi angka progress tidak basi.
 */

import type { LocalDataSession } from '~/utils/storage/session'

export type SyncReloadKey =
  | 'goalLinks'
  | 'goals'
  | 'tasks'
  | 'schedules'
  | 'habits'
  | 'countdowns'
  | 'memos'
  | 'pomodoro'
  | 'appearance'

/**
 * Urutan muat ulang. Hiasan halaman (`useDeco`) sengaja TIDAK ada di sini: itemnya disimpan di
 * `localStorage`, bukan record synced, jadi tidak ada yang perlu dibaca ulang setelah pull.
 */
export const RELOAD_ORDER: readonly SyncReloadKey[] = [
  'goalLinks',
  'goals',
  'tasks',
  'schedules',
  'habits',
  'countdowns',
  'memos',
  'pomodoro',
  'appearance',
]

const reloaders = new Map<SyncReloadKey, () => Promise<void>>()

/**
 * Jeda minimum antar putaran yang dipicu event jendela.
 *
 * `SYNC_REMOTE_APPLIED_EVENT` sengaja tanpa payload dan bisa dikirim siapa pun di origin yang sama
 * (script, extension). Tanpa jeda, setiap `dispatchEvent` = satu pembacaan ulang + dekripsi SEMUA
 * store yang terdaftar - pengganda kerja lokal yang murah dipicu. Pull yang benar-benar menerapkan
 * data datang paling cepat beberapa detik sekali (interval 5 menit / reconnect), jadi 1 detik tidak
 * mungkin menelan pull nyata.
 */
const RELOAD_THROTTLE_MS = 1_000

/** Satu putaran yang sedang berjalan; `null` = tidak ada. */
let round: Promise<void> | null = null
/** Ada permintaan yang datang saat putaran berjalan: jalankan TEPAT satu putaran tambahan. */
let repeatRequested = false
/** Permintaan susulan itu berasal dari pull NYATA (bukan event jendela). */
let repeatTrusted = false
/** Kapan putaran terakhir selesai (`0` = belum pernah / baru direset). */
let lastRoundEndedAtMs = 0
/** Kapan putaran terakhir MULAI - throttle diukur dari sini, bukan hanya dari akhir putaran. */
let lastRoundStartedAtMs = 0

/**
 * Permintaan berikutnya berasal dari pull NYATA (bukan event jendela), jadi throttle dilewati.
 *
 * Dinyalakan hanya di dalam `notifyRemoteApplied()` selama dispatch berlangsung: listener dipanggil
 * sinkron, jadi tanda ini tidak pernah bertahan untuk event palsu berikutnya. Tanpa ini, pull nyata
 * yang datang cepat (mis. beberapa perubahan beruntun dari perangkat lain) bisa ditelan throttle -
 * data baru tidak pernah tampil sampai pull berikutnya.
 */
let trustedRunPending = false

/** Tandai satu putaran berikutnya sebagai pull nyata. Hanya dipakai `notifyRemoteApplied()`. */
export function markTrustedSyncReload(): void {
  trustedRunPending = true
}

/** Buang tanda pull nyata setelah dispatch selesai (tidak ada listener = tanda tidak dipakai). */
export function clearTrustedSyncReload(): void {
  trustedRunPending = false
}

/**
 * Daftarkan cara memuat ulang satu store. Pemanggil berikutnya dengan kunci yang sama menimpa
 * closure sebelumnya - aman karena semua pemanggil `useX()` melihat `useState` yang sama, jadi
 * closure-nya setara. Yang penting: pendaftaran tidak menahan referensi komponen.
 */
export function registerSyncReloader(key: SyncReloadKey, reload: () => Promise<void>): void {
  // Server tidak punya jendela dan tidak pernah menjalankan reloader; menyimpan closure dari satu
  // request di modul bersama justru bisa membocorkan `useState` request itu ke request lain.
  if (typeof window === 'undefined') return
  reloaders.set(key, reload)

  // Lepas saat komponen pemiliknya unmount: tanpa ini, store yang hanya dipakai halaman lama terus
  // dibaca ulang setiap pull. Hanya melepas kalau entri itu MASIH milik closure ini - pemanggil
  // `useX()` yang lebih baru (halaman lain yang masih terbuka) sudah menimpa entri dengan closure
  // setara dan tidak boleh ikut dicabut.
  const scope = getCurrentScope()
  if (scope === undefined) return
  onScopeDispose(() => {
    if (reloaders.get(key) === reload) reloaders.delete(key)
  })
}

/**
 * Jalankan reloader yang terdaftar, berurutan, serial.
 *
 * Permintaan yang datang saat putaran berjalan tidak mengantre tanpa batas: cukup menandai satu
 * putaran tambahan. Event pull bisa datang berkali-kali (interval 5 menit + reconnect), dan tanpa
 * penggabungan itu setiap event akan menjadwalkan pembacaan storage sendiri.
 *
 * `fromWindowEvent` menandai permintaan yang datang lewat event jendela: itu kanal yang bisa dipakai
 * siapa pun di origin yang sama (script, extension), jadi permintaan kedua dalam
 * `RELOAD_THROTTLE_MS` DIABAIKAN (bukan dijadwalkan ulang). Putaran berikutnya yang sah akan datang
 * bersama pull berikutnya. Pemanggil programatik (mis. test alur pull) tidak di-throttle, dan pull
 * NYATA yang sampai lewat event melewati jeda ini lewat `markTrustedSyncReload()`.
 *
 * Promise ini TIDAK pernah reject: tiap store sudah melaporkan kegagalannya lewat `status`/`error`.
 * Satu store yang gagal tidak boleh menghentikan store lain - pull tetap berhasil untuk data lain.
 */
export function runSyncReloaders(
  options: { readonly fromWindowEvent?: boolean } = {},
): Promise<void> {
  // Throttle diperiksa SEBELUM cabang "putaran sedang berjalan". Tanpa itu, burst event jendela
  // selama satu putaran panjang terus menyalakan `repeatRequested` dan berubah jadi putaran
  // tambahan tanpa henti (terukur 81 putaran dalam 250 ms). Pull nyata tetap lolos lewat
  // `trustedRunPending`.
  if (options.fromWindowEvent === true && !trustedRunPending && isThrottled()) {
    return round ?? Promise.resolve()
  }

  if (round !== null) {
    repeatRequested = true
    if (trustedRunPending) {
      // Pull nyata yang datang saat putaran berjalan tetap harus dijalankan setelah putaran ini,
      // walau ia jatuh tepat di ekor loop (lihat `startRound`).
      repeatTrusted = true
      trustedRunPending = false
    }
    return round
  }

  trustedRunPending = false
  return startRound()
}

/**
 * Apakah permintaan dari kanal event jendela masih di dalam jendela jeda?
 *
 * Diukur dari `max(mulai, selesai)` putaran terakhir: putaran panjang membuat "selesai" jauh di
 * belakang, sedangkan "mulai" menjaga burst di TENGAH putaran tetap dibatasi.
 */
function isThrottled(): boolean {
  const lastMs = Math.max(lastRoundStartedAtMs, lastRoundEndedAtMs)
  return lastMs !== 0 && Date.now() - lastMs < RELOAD_THROTTLE_MS
}

/**
 * Satu putaran reloader, tanpa cek throttle: pemanggil (`runSyncReloaders` atau ekor putaran
 * sebelumnya) sudah memutuskan bahwa putaran ini memang perlu jalan.
 */
function startRound(): Promise<void> {
  lastRoundStartedAtMs = Date.now()
  round = (async () => {
    do {
      repeatRequested = false
      repeatTrusted = false
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
    lastRoundEndedAtMs = Date.now()

    // Permintaan bisa masuk setelah loop memeriksa `repeatRequested` terakhir kali, tapi sebelum
    // promise ini selesai (lost wakeup). Pull nyata TIDAK boleh hilang: jalankan putaran susulan.
    // Permintaan dari event jendela yang jatuh di jendela sempit itu cukup diabaikan - throttle di
    // atas memang menahannya.
    if (repeatRequested && repeatTrusted) {
      repeatRequested = false
      repeatTrusted = false
      void startRound()
    }
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
 * `ensure()` adalah pembuka sesi: saat belum terbuka ia menulis `status = 'loading'`, dan plugin sync
 * memakai status itu untuk mematikan lalu memasang ulang controller (`stopSync` -> `attach` ->
 * `startSync` dengan pull). Jadi satu reload yang memanggil `ensure()` = satu siklus sync tambahan -
 * M1 security review #77: satu event menghasilkan 6-9 `GET /v1/sync/pull`. Pembaca memakai sesi yang
 * SUDAH terbuka; `fallback` hanya untuk keadaan yang tidak punya sesi terbuka (SSR, atau test yang
 * menyuntik sesi lewat `options.session`).
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
 * Sesi reload masih milik akun aktif? Diperiksa SESUDAH await (membaca + mendekripsi tabel bisa
 * lambat): akun bisa berganti di tengahnya, dan menulis hasil milik akun lama ke `useState` berarti
 * data akun A tampil di akun B.
 *
 * Sesi hasil `current()` dibandingkan dengan pemilik yang terbuka sekarang. Kalau tidak ada sesi
 * terbuka sama sekali, hasil bacaan sesi itu TIDAK ditulis: justru itulah bentuk "akun baru saja
 * berganti/ditutup". Sesi suntikan test tidak punya padanan di `current()`, jadi tidak ada akun
 * nyata yang bisa dibandingkan dan hasilnya tetap dipakai.
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
 * dimuat pada putaran sync selanjutnya.
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

/** Dipakai test: registry & status putaran tidak boleh diwarisi antar kasus. */
export function resetSyncReloadersForTest(): void {
  reloaders.clear()
  round = null
  repeatRequested = false
  repeatTrusted = false
  lastRoundEndedAtMs = 0
  lastRoundStartedAtMs = 0
  trustedRunPending = false
}
