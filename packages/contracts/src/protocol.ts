import { z } from 'zod'

/**
 * Protokol API v1: versi, prefix path, kode error, DTO error, dan primitif wire format.
 *
 * Modul paling dasar di paket ini (dipakai `hlc`, `devices`, `auth`, `sync`, `keys`, `account`) dan
 * sengaja tidak mengimpor modul lain, supaya urutan dependensi tetap satu arah tanpa siklus.
 *
 * Endpoint yang dilayani kontrak ini (ARCHITECTURE.md §9). Versi ada di path, schema-nya di paket ini
 * supaya server, web, dan mobile memakai definisi yang sama:
 *
 *   POST   /v1/auth/otp/request        auth.ts     otpRequestInputSchema
 *   POST   /v1/auth/otp/verify         auth.ts     otpVerifyInputSchema -> sessionDtoSchema
 *   POST   /v1/auth/logout             auth.ts     (tanpa body; sesi perangkat ini dicabut; 204)
 *   GET    /v1/auth/google/start       auth.ts     googleStartQuerySchema -> googleStartResultSchema
 *   GET    /v1/auth/google/callback    auth.ts     googleCallbackQuerySchema -> sessionDtoSchema
 *   GET    /v1/auth/session            auth.ts     currentSessionResultSchema
 *   GET    /v1/devices                 devices.ts  deviceListResultSchema
 *   DELETE /v1/devices/:id             devices.ts  deviceRevokeParamsSchema
 *   GET    /v1/keys/envelopes          keys.ts     keyEnvelopeListResultSchema
 *   PUT    /v1/keys/envelopes          keys.ts     keyEnvelopePutInputSchema
 *   POST   /v1/keys/transfer           keys.ts     keyTransferCreateInputSchema -> ...ResultSchema
 *   POST   /v1/keys/transfer/:id       keys.ts     keyTransferClaimParamsSchema -> ...ResultSchema
 *   POST   /v1/sync/push               sync.ts     syncPushInputSchema -> syncPushResultSchema
 *   GET    /v1/sync/pull               sync.ts     syncPullQuerySchema -> syncPullResultSchema
 *   POST   /v1/account/deletion-otp    account.ts  (tanpa body; email dari SESI; 204)
 *   DELETE /v1/account                 account.ts  deleteAccountInputSchema
 *
 * Dua endpoint terakhir adalah SATU alur (PRD F15 "Hapus Akun Permanen"): `deletion-otp` yang mengirim
 * kode konfirmasi ke email sesi, lalu `DELETE /v1/account` dengan kode itu. Tanpa yang pertama, kode
 * ber-`purpose` `delete_account` tidak bisa diminta sama sekali, jadi alurnya tidak bisa diselesaikan -
 * karena itu ia ikut tercatat di sini, bukan cuma hidup di route.
 *
 * Daftar di atas WAJIB sama dengan isi `apps/web/server/routes/v1/**`; kalau tidak, ada endpoint yang
 * dipakai klien tapi tidak tercatat sebagai kontrak (pernah terjadi pada `deletion-otp` dan
 * `auth/logout`). Kesamaannya dijaga test `apps/web/server/tests/contract-routes.test.ts`.
 *
 * ATURAN AMPLOP (mengikat server dan klien, satu bentuk untuk SEMUA endpoint):
 * - Sukses: SELALU `{ "data": <DTO> }` (`apiDataEnvelopeSchema` / `ApiSuccessResponse`). DTO endpoint
 *   tidak pernah dikirim sebagai body telanjang, sehingga klien tidak perlu tahu per-endpoint apakah
 *   body-nya DTO langsung atau dibungkus.
 * - Gagal: SELALU `{ "error": { code, message, details? } }` (`apiErrorBodySchema` / `ApiErrorBody`),
 *   dengan status dari `ERROR_HTTP_STATUS`. Inilah satu-satunya jalur kegagalan: handler, middleware,
 *   dan plugin error global memakai bentuk yang sama.
 * - Endpoint yang memang TIDAK punya body tetap `204` tanpa body sama sekali - bukan `{ "data": null }`:
 *   `POST /v1/auth/logout`, `DELETE /v1/devices/:id`, `DELETE /v1/account`,
 *   `POST /v1/auth/otp/request`, `POST /v1/account/deletion-otp`. Alasannya dua: (a) tidak ada nilai
 *   yang bisa dibalas, dan `{ "data": null }` memaksa klien membedakan "berhasil tanpa isi" dari
 *   "berhasil dengan isi null"; (b) untuk permintaan OTP, bentuk jawaban yang berbeda-beda (status,
 *   field, atau body apa pun) jadi oracle untuk menebak email mana yang punya akun.
 *
 * `GET /health` juga memakai amplop ini (`{ "data": { status, apiVersion } }`) walau bukan `/v1`, karena
 * ia dilayani jalur handler yang sama.
 *
 * Aturan yang berlaku untuk SEMUA endpoint (ARCHITECTURE.md §8): `user_id` selalu diambil dari sesi
 * di server, TIDAK PERNAH dari body/query/param. Karena itu tidak ada satu pun schema request di
 * paket ini yang punya field `user_id`, `role`, atau `isAdmin` - dan semua objek memakai `.strict()`
 * supaya field asing dari client ditolak, bukan diam-diam diteruskan (cegah mass assignment).
 *
 * Stabilitas kontrak: app mobile versi lama tetap memanggil `v1`, jadi perubahan breaking (buang
 * field, ubah arti field, buang kode error) wajib lewat versi path baru - bukan mengubah schema di
 * sini diam-diam.
 */

/** Versi protokol. Naikkan dengan MENAMBAH versi path baru, bukan dengan mengubah schema `v1`. */
export const API_VERSION = 'v1'

export type ApiVersion = typeof API_VERSION

/** Prefix path semua endpoint: dipakai server untuk mount router, client untuk menyusun URL. */
export const API_PREFIX = `/${API_VERSION}`

/**
 * Kode error yang stabil. Client memetakan ini ke perilaku (retry, tampilkan pesan, paksa login),
 * jadi arti kode yang sudah ada tidak boleh berubah - tambah kode baru kalau perlu.
 */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'OAUTH_INVALID',
  'SYNC_RESET_REQUIRED',
  'PAYLOAD_TOO_LARGE',
  /**
   * Batas jumlah perangkat AKTIF per user tercapai (`MAX_ACTIVE_DEVICES_PER_USER` = 10,
   * `server.dbml` `devices`). Sebelumnya kegagalan ini dilaporkan sebagai `FORBIDDEN`, yang
   * menyembunyikan sebabnya dari client: FORBIDDEN berarti "tidak punya hak", sedangkan di sini user
   * memang berhak - dia cuma sudah memakai jatah 10 perangkat dan harus menghapus salah satu dulu.
   */
  'DEVICE_LIMIT_REACHED',
  /**
   * Method HTTP tidak dilayani endpoint (405). Muncul dari router Nitro/H3 (mis. `GET` ke route yang
   * cuma punya handler `POST`). Sebelumnya jatuh ke `INTERNAL` (500) dan ikut ter-log sebagai
   * kegagalan server, padahal ini 4xx alur normal.
   */
  'METHOD_NOT_ALLOWED',
  'INTERNAL',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export const errorCodeSchema = z.enum(ERROR_CODES)

/**
 * Kode error -> HTTP status. Ditempatkan di kontrak supaya status tidak ditentukan per-endpoint
 * (kalau tidak, endpoint baru gampang mengembalikan 500 untuk kegagalan yang sebenarnya 400).
 *
 * `SYNC_RESET_REQUIRED` = 409: cursor client di bawah `sync_watermarks.purged_seq`
 * (`apps/web/docs/server.dbml`), jadi client wajib reset cursor ke 0 lalu full pull.
 */
export const ERROR_HTTP_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  OTP_INVALID: 400,
  OTP_EXPIRED: 400,
  OAUTH_INVALID: 400,
  SYNC_RESET_REQUIRED: 409,
  PAYLOAD_TOO_LARGE: 413,
  // 409 Conflict: permintaan sah, tapi bertentangan dengan keadaan resource saat ini (user sudah
  // memakai 10 slot perangkat aktif). Bukan 403 - user tidak kehilangan hak, cuma kehabisan jatah.
  DEVICE_LIMIT_REACHED: 409,
  METHOD_NOT_ALLOWED: 405,
  INTERNAL: 500,
} as const satisfies Record<ErrorCode, number>

export type ErrorHttpStatus = (typeof ERROR_HTTP_STATUS)[ErrorCode]

/**
 * Pesan default per kode error - generik dan aman ditampilkan apa adanya (UI bahasa Indonesia,
 * ARCHITECTURE.md §11).
 *
 * Server WAJIB memakai pesan ini (atau yang sederajat generiknya) untuk jalur auth: PRD F15 melarang
 * membedakan "email terdaftar" dan "email tidak terdaftar". Karena itu `OTP_INVALID` menyebut email
 * dan kode sekaligus - satu pesan untuk dua sebab, jadi tidak ada oracle untuk menebak email.
 */
export const GENERIC_ERROR_MESSAGES = {
  VALIDATION_FAILED: 'Data yang dikirim tidak valid.',
  UNAUTHENTICATED: 'Sesi tidak valid atau sudah berakhir. Silakan masuk lagi.',
  FORBIDDEN: 'Tidak punya akses ke data ini.',
  NOT_FOUND: 'Data yang diminta tidak ditemukan.',
  RATE_LIMITED: 'Terlalu banyak percobaan. Coba lagi sebentar lagi.',
  OTP_INVALID: 'Email atau kode OTP tidak valid.',
  OTP_EXPIRED: 'Kode OTP sudah kedaluwarsa. Minta kode baru.',
  OAUTH_INVALID: 'Proses masuk dengan Google gagal. Coba lagi.',
  SYNC_RESET_REQUIRED:
    'Riwayat sinkronisasi sudah dipangkas. Perangkat ini perlu sinkronisasi penuh.',
  PAYLOAD_TOO_LARGE: 'Data yang dikirim terlalu besar.',
  DEVICE_LIMIT_REACHED:
    'Jumlah perangkat aktif sudah mencapai batas. Hapus salah satu perangkat lalu coba lagi.',
  METHOD_NOT_ALLOWED: 'Metode permintaan ini tidak dilayani untuk alamat tersebut.',
  INTERNAL: 'Terjadi kesalahan di server.',
} as const satisfies Record<ErrorCode, string>

// -----------------------------------------------------------------------------
// Amplop respons: `{ data }` untuk sukses, `{ error }` untuk gagal
// -----------------------------------------------------------------------------

/**
 * Isi detail kegagalan (TANPA pembungkus `error`).
 *
 * `message` wajib generik: dilarang memuat stack, query SQL, nama tabel, atau fakta sensitif
 * (PRD F15 "Pesan Error"). `details` opsional dan HANYA untuk info yang aman ditampilkan - dilarang
 * memuat input user, email, token, blob, atau apa pun yang bisa dipakai menebak data.
 *
 * `.strict()` di sini bukan hiasan: body error yang memuat field tambahan (mis. `stack`) DITOLAK saat
 * klien memvalidasinya, sehingga satu kebocoran di server tidak pernah diam-diam jadi bagian kontrak.
 */
export const apiErrorSchema = z
  .object({
    code: errorCodeSchema,
    /** Pesan siap tampil. Dibatasi panjangnya supaya tidak jadi jalur menyelundupkan data. */
    message: z.string().min(1).max(300),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export type ApiError = z.infer<typeof apiErrorSchema>

/**
 * Amplop kegagalan untuk semua endpoint, supaya web dan mobile menanganinya seragam.
 *
 * Kenapa `error` dibungkus satu lapis, bukan `{ code, message }` di akar body: dengan begitu satu
 * body TIDAK PERNAH ambigu antara "respons sukses yang kebetulan punya field `code`" dan "respons
 * gagal". Klien cukup memeriksa status HTTP sekali, lalu tahu lapis mana yang harus dibaca - dan
 * penambahan field di amplop (mis. metadata request) tidak lagi bertabrakan dengan field DTO.
 */
export const apiErrorBodySchema = z.object({ error: apiErrorSchema }).strict()

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>

/**
 * Amplop sukses: `{ data: <DTO> }`.
 *
 * Fungsi ini yang membuat klien tidak perlu menghafal per-endpoint: DTO apa pun (objek, array, union)
 * selalu bisa dibaca lewat `.data`, dengan schema yang sama persis seperti yang diuji server.
 */
export function apiDataEnvelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({ data: dataSchema }).strict()
}

export type ApiSuccessResponse<T> = { data: T }

/**
 * Deskripsi LENGKAP satu endpoint: sukses ATAU gagal, dalam satu schema.
 *
 * Dipakai klien (dan test) untuk memvalidasi body apa pun yang datang dari endpoint itu tanpa merakit
 * sendiri gabungan amplop sukses + amplop error - kalau tiap pemanggil merakit sendiri, cepat atau
 * lambat ada yang lupa jalur error-nya dan kontraknya jadi tidak seragam lagi.
 */
export function apiResponseSchema<T extends z.ZodType>(dataSchema: T) {
  return z.union([apiDataEnvelopeSchema(dataSchema), apiErrorBodySchema])
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorBody

// -----------------------------------------------------------------------------
// Primitif wire format (dipakai devices / auth / sync / keys / account)
// -----------------------------------------------------------------------------

/** Bentuk kanonik UUID: lowercase + tanda hubung (RFC 9562). */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * UUID, selalu dinormalkan ke bentuk kanonik (lowercase).
 *
 * Record memakai UUIDv7 yang dibuat client (ARCHITECTURE.md §6), server memakai UUID untuk id
 * perangkat/sesi. Schema ini menerima versi UUID apa pun (import/backup dan client versi lama tidak
 * boleh mati hanya karena beda versi UUID), tapi bentuknya dikunci lowercase supaya id yang sama
 * tidak pernah jadi dua string berbeda antara web dan mobile - perbandingan id ikut menentukan
 * hasil LWW saat tie.
 */
export const uuidSchema = z.string().toLowerCase().regex(UUID_PATTERN, 'bukan UUID kanonik')

/** Bentuk instan yang kita kirim di wire: ISO-8601 UTC dengan `Z` (tanpa offset lain). */
export const ISO_INSTANT_PATTERN =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$/

/** Panjang maksimum instan ISO-8601 dengan milidetik: `2024-01-02T03:04:05.678Z`. */
export const ISO_INSTANT_MAX_LENGTH = 24

export function isIsoInstant(value: string): boolean {
  return (
    value.length <= ISO_INSTANT_MAX_LENGTH &&
    ISO_INSTANT_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  )
}

/**
 * Instan waktu di wire = ISO-8601 UTC.
 *
 * Pilihan sadar: di DB lokal waktu disimpan sebagai epoch ms UTC (ARCHITECTURE.md §11), tapi di wire
 * dipakai string ISO karena `timestamptz` Postgres dan `toISOString()` di JS sudah sepakat soal itu,
 * dan `expiresAt`/`lastSeenAt` harus terbaca manusia saat debugging. Regex + `Date.parse` ditulis
 * eksplisit (bukan helper format zod) supaya formatnya tidak berubah diam-diam saat zod naik versi.
 */
export const isoInstantSchema = z
  .string()
  .max(ISO_INSTANT_MAX_LENGTH)
  .refine(isIsoInstant, 'bukan instan ISO-8601 UTC (contoh: 2024-01-02T03:04:05.678Z)')

/**
 * Panjang string base64 maksimum untuk `bytes` byte biner (padding standar).
 *
 * Sengaja membatasi PANJANG STRING, bukan hasil decode: server bisa menolak payload kebesaran
 * sebelum sempat men-decode. Batasnya konservatif (bisa longgar ~2 byte di tepi), dan itu cukup -
 * tujuannya membatasi memori, bukan presisi byte.
 */
export function base64MaxLengthForBytes(bytes: number): number {
  return Math.ceil(bytes / 3) * 4
}

const BASE64_ALPHABET_PATTERN = /^[A-Za-z0-9+/]*$/

/**
 * Base64 standar (bukan base64url) untuk data biner di transport JSON: `blob` record dan
 * `wrappedKey`/envelope. Di Postgres keduanya `bytea`, jadi encoding ini murni soal wire format.
 *
 * Padding WAJIB (panjang kelipatan 4) supaya bentuknya satu saja: `btoa`, `Buffer.toString('base64')`,
 * dan encoder native semuanya mem-pad, jadi tidak ada alasan menerima varian tanpa padding.
 */
export function isBase64(value: string): boolean {
  if (value.length % 4 !== 0) return false

  let unpadded = value
  if (unpadded.endsWith('==')) unpadded = unpadded.slice(0, -2)
  else if (unpadded.endsWith('=')) unpadded = unpadded.slice(0, -1)

  // Sisa 1 karakter tidak mungkin hasil base64 ('A' bukan, 'AA'/'AAA' iya).
  return unpadded.length % 4 !== 1 && BASE64_ALPHABET_PATTERN.test(unpadded)
}

/**
 * Base64 dengan batas ukuran hasil decode. `.max()` dipasang SEBELUM `.refine()` supaya string
 * raksasa ditolak berdasarkan panjangnya saja, tanpa dipindai ulang.
 */
export function base64WithinBytesSchema(maxBytes: number, label: string) {
  return z
    .string()
    .max(base64MaxLengthForBytes(maxBytes), `${label} melebihi ${maxBytes} byte`)
    .refine(isBase64, `${label} bukan base64 standar`)
}

/**
 * Panjang UTF-8 dalam byte, tanpa `Buffer`/`TextEncoder` (dua-duanya platform-specific dan dilarang
 * di `packages/*`).
 *
 * Karakter astral dihitung berlebih (2 code unit x 3 byte), jadi hasilnya batas ATAS: untuk
 * pengecekan batas ukuran, lebih baik menolak sedikit terlalu awal daripada menerima terlalu besar.
 */
export function utf8ByteLength(value: string): number {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else bytes += 3
  }
  return bytes
}

/**
 * Bilangan bulat dari query string.
 *
 * Konversinya ditulis eksplisit, bukan `z.coerce.number()`: `coerce` mengubah `''` jadi 0 dan
 * menerima `'1e9'`, `'0x10'`, `' 7 '` - artinya parameter yang sama bisa berarti beda antara web dan
 * mobile. Di sini yang sah cuma digit polos, lalu dicek rentangnya.
 */
export function integerQuerySchema(min: number, max: number, label: string) {
  return z
    .string()
    .regex(/^[0-9]{1,16}$/, `${label} harus bilangan bulat non-negatif`)
    .transform((value) => Number(value))
    .refine(
      (value) => Number.isSafeInteger(value) && value >= min && value <= max,
      `${label} harus di antara ${min} dan ${max}`,
    )
}

/**
 * Query opsional dengan nilai fallback.
 *
 * Fallback ditulis sebagai transform, bukan `.default()`: nilai default di zod masuk ke jalur parse
 * schema (yang di sini bertipe string), jadi `default(0)` bisa ditolak oleh schema string. Jalur ini
 * juga berlaku di `packages/core` (client), dan tidak ada alasan mengambil risiko itu.
 */
export function optionalIntegerQuerySchema(
  min: number,
  max: number,
  label: string,
  fallback: number,
) {
  return integerQuerySchema(min, max, label)
    .optional()
    .transform((value) => value ?? fallback)
}
