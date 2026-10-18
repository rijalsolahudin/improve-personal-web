import { z } from 'zod'

/**
 * Hybrid logical clock (HLC) - satu-satunya tempat perbandingan HLC di project ini.
 *
 * Kenapa harus satu tempat (`apps/web/docs/server.dbml`, tabel `records`): "membandingkan string hlc
 * mentah akan SALAH begitu panjang digitnya beda ('999-0-a' > '1000-0-b'). Karena itu dibandingkan
 * sebagai tuple (hlc_wall_ms, hlc_counter, hlc_device). Poison compare-nya ditulis SEKALI di
 * packages/contracts/src/hlc.ts dan dipakai server + client - kalau dua implementasi berbeda, data
 * bisa divergen permanen."
 *
 * Konsekuensinya untuk pemakai (`packages/core` dan `apps/server`): DILARANG menulis ulang
 * perbandingan HLC, `hlcA > hlcB`, atau `localeCompare` atas string HLC. Impor `compareHlc` dari sini.
 *
 * Format string: `${wallMs}-${counter}-${deviceId}`.
 * - `wallMs`  : epoch ms UTC perangkat saat record ditulis.
 * - `counter` : penomoran tulisan di milidetik yang sama (juga dipakai kalau jam perangkat mundur).
 * - `deviceId`: id perangkat penulis - tie-breaker terakhir supaya hasilnya selalu sama di semua
 *               perangkat (ARCHITECTURE.md §9: "Tie -> deviceId terbesar").
 *
 * `deviceId` selalu dinormalkan ke bentuk KANONIK: lowercase tanpa tanda hubung. Server menyimpan
 * `records.hlc_device` dalam bentuk itu (`server.dbml`), jadi server dan client membandingkan string
 * yang persis sama - kalau tidak, tie-break bisa berbeda antara dua tempat.
 */

/** Pemisah antar bagian HLC. */
export const HLC_SEPARATOR = '-'

/** Batas panjang string HLC sebelum dipecah - menahan input raksasa dari jaringan. */
export const HLC_MAX_LENGTH = 200

/** `wallMs` = epoch ms UTC, wajib integer aman JS (bukan float, NaN, atau negatif). */
export const HLC_MAX_WALL_MS = Number.MAX_SAFE_INTEGER

/** `counter` wajib muat kolom `int4` Postgres (`server.dbml` `records.hlc_counter`). */
export const HLC_MAX_COUNTER = 2_147_483_647

/** Panjang maksimum `deviceId` kanonik (UUID tanpa tanda hubung = 32 karakter). */
export const HLC_MAX_DEVICE_ID_LENGTH = 64

/** Bagian HLC yang sudah tervalidasi. `deviceId` di sini SELALU sudah kanonik. */
export type HlcTuple = {
  readonly wallMs: number
  readonly counter: number
  readonly deviceId: string
}

/** Urutan `-1 | 0 | 1`, bentuk yang sama dengan komparator `Array.prototype.sort`. */
export type HlcOrder = -1 | 0 | 1

export const HLC_INVALID_REASONS = [
  'not_a_string',
  'empty',
  'too_long',
  'missing_parts',
  'invalid_wall_ms',
  'invalid_counter',
  'invalid_device_id',
] as const

export type HlcInvalidReason = (typeof HLC_INVALID_REASONS)[number]

const HLC_INVALID_LABELS: Record<HlcInvalidReason, string> = {
  not_a_string: 'bukan string',
  empty: 'string kosong',
  too_long: `lebih dari ${HLC_MAX_LENGTH} karakter`,
  missing_parts: 'tidak berbentuk wallMs-counter-deviceId',
  invalid_wall_ms: 'wallMs bukan epoch ms non-negatif',
  invalid_counter: 'counter bukan integer non-negatif',
  invalid_device_id: 'deviceId bukan [a-z0-9] setelah normalisasi',
}

/** HLC bukan rahasia (metadata plaintext), jadi cuplikannya aman muncul di pesan error. */
const EXCERPT_MAX_LENGTH = 40

function excerptOf(value: unknown): string {
  if (typeof value !== 'string') return `(${typeof value})`
  return value.length > EXCERPT_MAX_LENGTH ? `${value.slice(0, EXCERPT_MAX_LENGTH)}...` : value
}

/**
 * Error HLC yang membawa alasan terstruktur (`reason`), bukan cuma pesan.
 *
 * Pesannya memuat alasan yang terbaca manusia + cuplikan nilai yang salah (dipotong), karena HLC
 * datang dari data yang dikirim client - tanpa cuplikan, satu record rusak di antara 500 record
 * batch praktis tidak bisa dilacak.
 */
export class HlcFormatError extends Error {
  readonly reason: HlcInvalidReason

  constructor(reason: HlcInvalidReason, detail: string) {
    super(`hlc tidak valid (${HLC_INVALID_LABELS[reason]}): ${detail}`)
    this.name = 'HlcFormatError'
    this.reason = reason
  }
}

/** Hasil parse HLC untuk jalur yang tidak boleh melempar error (mis. loop merge di client). */
export type HlcParseResult =
  ({ readonly ok: true } & HlcTuple) | { readonly ok: false; readonly reason: HlcInvalidReason }

const WALL_MS_PATTERN = /^[0-9]{1,16}$/
const COUNTER_PATTERN = /^[0-9]{1,10}$/
const DEVICE_ID_PATTERN = /^[a-z0-9]+$/

function isCanonicalDeviceId(value: string): boolean {
  return (
    value.length > 0 && value.length <= HLC_MAX_DEVICE_ID_LENGTH && DEVICE_ID_PATTERN.test(value)
  )
}

/**
 * Bentuk kanonik `deviceId` untuk perbandingan: lowercase, tanpa tanda hubung.
 *
 * Dipakai juga oleh server saat mengisi `records.hlc_device` (`server.dbml`), jadi satu fungsi ini
 * yang menentukan bentuk yang dibandingkan di dua sisi.
 */
export function normalizeDeviceId(deviceId: string): string {
  return deviceId.toLowerCase().replaceAll(HLC_SEPARATOR, '')
}

/**
 * Pecah + validasi string HLC tanpa melempar error.
 *
 * Dipakai `compareHlc` dan `hlcSchema`. Menerima `unknown` karena sering dipanggil dengan hasil
 * `JSON.parse` yang belum tentu string.
 *
 * Spasi sengaja TIDAK di-trim: HLC selalu dibuat mesin (`formatHlc`), jadi spasi berarti data sudah
 * rusak - lebih baik ditolak daripada diterima dengan arti yang diam-diam berbeda.
 */
export function tryParseHlc(value: unknown): HlcParseResult {
  if (typeof value !== 'string') return { ok: false, reason: 'not_a_string' }
  if (value.length === 0) return { ok: false, reason: 'empty' }
  if (value.length > HLC_MAX_LENGTH) return { ok: false, reason: 'too_long' }

  // `deviceId` boleh memuat tanda hubung (UUID), jadi hanya dua pemisah PERTAMA yang dipakai.
  const firstSeparator = value.indexOf(HLC_SEPARATOR)
  const secondSeparator = value.indexOf(HLC_SEPARATOR, firstSeparator + 1)
  if (firstSeparator <= 0 || secondSeparator <= firstSeparator + 1) {
    return { ok: false, reason: 'missing_parts' }
  }

  const rawWallMs = value.slice(0, firstSeparator)
  const rawCounter = value.slice(firstSeparator + 1, secondSeparator)
  const rawDeviceId = value.slice(secondSeparator + 1)

  if (!WALL_MS_PATTERN.test(rawWallMs)) return { ok: false, reason: 'invalid_wall_ms' }
  const wallMs = Number(rawWallMs)
  if (!Number.isSafeInteger(wallMs) || wallMs < 0 || wallMs > HLC_MAX_WALL_MS) {
    return { ok: false, reason: 'invalid_wall_ms' }
  }

  if (!COUNTER_PATTERN.test(rawCounter)) return { ok: false, reason: 'invalid_counter' }
  const counter = Number(rawCounter)
  if (!Number.isSafeInteger(counter) || counter < 0 || counter > HLC_MAX_COUNTER) {
    return { ok: false, reason: 'invalid_counter' }
  }

  // `rawDeviceId` kosong jatuh ke `invalid_device_id`; deviceId ber-tanda hubung dinormalkan.
  const deviceId = normalizeDeviceId(rawDeviceId)
  if (!isCanonicalDeviceId(deviceId)) return { ok: false, reason: 'invalid_device_id' }

  return { ok: true, wallMs, counter, deviceId }
}

/**
 * Versi melempar dari `tryParseHlc`: untuk input yang datang dari jaringan dan harus ditolak dengan
 * jelas (VALIDATION_FAILED di server), atau bug programmer yang harus kelihatan di test.
 */
export function parseHlc(value: unknown): HlcTuple {
  const result = tryParseHlc(value)
  if (!result.ok) {
    throw new HlcFormatError(result.reason, `nilai "${excerptOf(value)}"`)
  }

  return { wallMs: result.wallMs, counter: result.counter, deviceId: result.deviceId }
}

/**
 * Susun string HLC dari bagiannya - satu-satunya cara menulis HLC.
 *
 * `deviceId` ditulis kanonik (lowercase, tanpa tanda hubung) supaya hasilnya deterministik di semua
 * platform, dan validasinya lengkap supaya hasil `formatHlc` SELALU bisa dibaca ulang `parseHlc`.
 * Melempar `HlcFormatError` hanya untuk kesalahan programmer: bagian HLC dibuat di perangkat sendiri,
 * bukan input user.
 */
export function formatHlc(tuple: HlcTuple): string {
  const { wallMs, counter, deviceId } = tuple

  if (typeof wallMs !== 'number' || !Number.isSafeInteger(wallMs) || wallMs < 0) {
    throw new HlcFormatError('invalid_wall_ms', `wallMs = ${excerptOf(wallMs)}`)
  }
  if (
    typeof counter !== 'number' ||
    !Number.isSafeInteger(counter) ||
    counter < 0 ||
    counter > HLC_MAX_COUNTER
  ) {
    throw new HlcFormatError('invalid_counter', `counter = ${excerptOf(counter)}`)
  }

  const canonicalDeviceId = typeof deviceId === 'string' ? normalizeDeviceId(deviceId) : ''
  if (!isCanonicalDeviceId(canonicalDeviceId)) {
    throw new HlcFormatError('invalid_device_id', `deviceId = "${excerptOf(deviceId)}"`)
  }

  return `${wallMs}${HLC_SEPARATOR}${counter}${HLC_SEPARATOR}${canonicalDeviceId}`
}

/**
 * Bandingkan dua HLC sebagai tuple `(wallMs, counter, deviceId)` - bukan sebagai string.
 *
 * Tidak pernah melempar error dan tidak punya efek samping. HLC yang tidak valid TIDAK PERNAH menang
 * atas yang valid (diperlakukan paling kecil), supaya record rusak tidak bisa menimpa data sehat
 * lewat LWW. Kalau dua-duanya tidak valid, hasilnya deterministik dari perbandingan string mentah -
 * di situ urutannya memang tidak berarti, tapi harus konsisten supaya pull berulang stabil.
 */
export function compareHlc(a: string, b: string): HlcOrder {
  const left = tryParseHlc(a)
  const right = tryParseHlc(b)

  if (left.ok && right.ok) {
    if (left.wallMs !== right.wallMs) return left.wallMs < right.wallMs ? -1 : 1
    if (left.counter !== right.counter) return left.counter < right.counter ? -1 : 1
    if (left.deviceId !== right.deviceId) return left.deviceId < right.deviceId ? -1 : 1
    return 0
  }

  if (left.ok) return 1
  if (right.ok) return -1

  if (a === b) return 0
  return a < b ? -1 : 1
}

/** Guard murah untuk input yang belum validasi (mis. sebelum menyentuh DB). */
export function isValidHlc(value: unknown): boolean {
  return tryParseHlc(value).ok
}

/**
 * Skema zod untuk string HLC.
 *
 * Dipakai `sync.ts` supaya record yang masuk tidak pernah membawa HLC yang tak bisa dibandingkan
 * server. `.max()` dipasang sebelum `.refine()` supaya string raksasa ditolak murah.
 */
export const hlcSchema = z.string().max(HLC_MAX_LENGTH).refine(isValidHlc, 'hlc tidak valid')
