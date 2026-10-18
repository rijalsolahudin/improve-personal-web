/**
 * Kapan sync dijalankan (ARCHITECTURE.md §9, PRD F15 "Sync").
 *
 * Di sini cuma KEPUTUSAN, bukan timer. Timer platform (`setTimeout`, `visibilitychange`, `AppState`,
 * `online`/`offline` event) adalah tugas `Scheduler` + adapter (ARCHITECTURE.md §5) - kalau timer
 * ditanam di core, jadwal sync jadi tidak bisa diuji tanpa menunggu waktu nyata, dan web & native
 * akan punya dua jadwal yang berbeda diam-diam.
 *
 * Semua fungsi di berkas ini murni: waktu masuk lewat parameter.
 */

/** Setelah tulis lokal, tunggu ~2 detik dulu - user biasanya nulis beberapa kali berturut-turut. */
export const SYNC_DEBOUNCE_MS = 2_000

/** Selama app di foreground, sync dikerjakan tiap 5 menit (round sekali, bukan timer per item). */
export const SYNC_FOREGROUND_INTERVAL_MS = 5 * 60 * 1_000

/** Pemicu sync yang dikenal. Shell tinggal memasang listener untuk tiap nilainya. */
export const SYNC_TRIGGERS = [
  /** Saat app dibuka/di-resume. */
  'app_open',
  /** Setelah tulis lokal, dengan debounce. */
  'after_write',
  /** Timer berkala selama foreground. */
  'foreground_interval',
  /** Saat koneksi kembali. */
  'reconnect',
] as const

export type SyncTrigger = (typeof SYNC_TRIGGERS)[number]

export type SyncScheduleInput = {
  /** Shell yang tahu status jaringan (web: `navigator.onLine`; native: `expo-network`). */
  readonly online: boolean
  readonly nowMs: number
  /** Kapan app baru dibuka/di-resume; `null`/kosong kalau bukan karena itu. */
  readonly appOpenedAtMs?: number | null
  /** Kapan tulis lokal terakhir terjadi; `null` kalau belum ada tulis. */
  readonly lastWriteAtMs?: number | null
  /** Kapan sync terakhir selesai (push atau pull); `null` kalau belum pernah. */
  readonly lastSyncAtMs?: number | null
  /** True kalau perangkat baru saja kembali online (transisi offline -> online). */
  readonly justReconnected?: boolean
}

/**
 * Pemicu yang HARUS dijalankan sekarang.
 *
 * Hasilnya kosong berarti "tidak ada yang perlu dikerjakan" - dan itu jawaban yang sah, bukan error.
 * Saat offline hasilnya SELALU kosong: tidak ada yang bisa dikirim, dan mencoba terus justru
 * menghabiskan baterai.
 *
 * `foreground_interval` sengaja juga menyala saat `lastSyncAtMs` masih `null` - artinya "belum pernah
 * sync", dan dibiarkan berarti perangkat baru tidak pernah menarik data sampai user menulis sesuatu.
 */
export function dueSyncTriggers(input: SyncScheduleInput): readonly SyncTrigger[] {
  if (!input.online) return []

  const triggers: SyncTrigger[] = []

  if (input.justReconnected === true) triggers.push('reconnect')
  if (input.appOpenedAtMs !== undefined && input.appOpenedAtMs !== null) triggers.push('app_open')

  const lastWriteAtMs = input.lastWriteAtMs
  if (
    lastWriteAtMs !== undefined &&
    lastWriteAtMs !== null &&
    input.nowMs - lastWriteAtMs >= SYNC_DEBOUNCE_MS
  ) {
    triggers.push('after_write')
  }

  const lastSyncAtMs = input.lastSyncAtMs
  if (
    lastSyncAtMs === undefined ||
    lastSyncAtMs === null ||
    input.nowMs - lastSyncAtMs >= SYNC_FOREGROUND_INTERVAL_MS
  ) {
    triggers.push('foreground_interval')
  }

  return triggers
}

/**
 * Sisa waktu debounce setelah tulis terakhir; `0` kalau sudah boleh sync.
 *
 * Dipakai shell untuk memasang satu `Scheduler.setTimeout` yang di-reset tiap kali user menulis:
 * tulisan ke-10 dalam 2 detik tidak boleh jadi 10 request push.
 */
export function syncDebounceRemainingMs(
  nowMs: number,
  lastWriteAtMs: number | null | undefined,
): number {
  if (lastWriteAtMs === undefined || lastWriteAtMs === null) return 0

  const elapsed = nowMs - lastWriteAtMs
  if (elapsed >= SYNC_DEBOUNCE_MS) return 0

  return SYNC_DEBOUNCE_MS - elapsed
}

/**
 * Apakah satu kali sync perlu dikerjakan dari sisi pull.
 *
 * Push selalu dicoba (kalau ada outbox), tapi pull yang tidak pernah lewat interval dan tidak dipicu
 * peristiwa itu mubazir: cursor tidak berubah, jadi jawabannya pasti "tidak ada yang baru".
 */
export function shouldPullNow(input: {
  readonly triggers: readonly SyncTrigger[]
  readonly lastSyncAtMs: number | null | undefined
  readonly nowMs: number
}): boolean {
  if (input.triggers.length === 0) return false
  if (input.triggers.includes('reconnect') || input.triggers.includes('app_open')) return true
  if (input.lastSyncAtMs === undefined || input.lastSyncAtMs === null) return true

  return input.nowMs - input.lastSyncAtMs >= SYNC_FOREGROUND_INTERVAL_MS
}
