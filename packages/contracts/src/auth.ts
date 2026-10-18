import { z } from 'zod'

import { deviceNameSchema, devicePlatformSchema } from './devices.ts'
import { isoInstantSchema, uuidSchema } from './protocol.ts'

/**
 * Kontrak auth: OTP (PRD F15), Google SSO, dan DTO sesi.
 *
 * Aturan yang mengikat di sini:
 * - Respons OTP SELALU generik: tidak pernah membocorkan apakah email terdaftar (PRD F15 "Pesan
 *   Error"). Karena itu `otpRequestInputSchema` tidak punya field apa pun yang bisa dipakai membedakan
 *   akun baru dari akun lama.
 * - OTP fix `777777` cuma untuk env non-production dan keputusannya di server (`APP_ENV`, fail-closed,
 *   PRD T19). Kontrak ini TIDAK punya flag/header/query untuk menyalakannya - memang tidak boleh ada.
 * - Server cuma menyimpan hash OTP dan hash token sesi. Kontrak ini tidak pernah menerima atau
 *   mengirim hash.
 * - Token mentah sesi HANYA untuk client `mobile` (`sessionDtoSchema`); client `web` memakai cookie
 *   HttpOnly, jadi tidak ada token yang perlu (dan boleh) masuk state/Pinia.
 */

/** Batas panjang email (RFC 5321 praktis). */
export const EMAIL_MAX_LENGTH = 254

/** Kode OTP: 6 digit (PRD F15). */
export const OTP_CODE_LENGTH = 6

/** Masa berlaku OTP <= 10 menit (`server.dbml` `otp_challenges.expires_at`). */
export const OTP_TTL_SECONDS = 600

/** Jeda kirim ulang OTP (PRD F15 flow daftar: "OTP kirim 30 detik"). */
export const OTP_RESEND_COOLDOWN_SECONDS = 30

/** Panjang minimum token sesi opaque (32 byte acak -> base64url >= 43 karakter). */
export const SESSION_TOKEN_MIN_LENGTH = 32

export const CLIENT_KINDS = ['web', 'mobile'] as const

export type ClientKind = (typeof CLIENT_KINDS)[number]

/** Jenis client yang punya sesi (`server.dbml` `sessions.client`). */
export const clientKindSchema = z.enum(CLIENT_KINDS)

/**
 * Info perangkat yang disumbang client saat login. Server yang menerbitkan `devices.id`, jadi schema
 * ini sengaja tidak punya field `id`.
 */
export const deviceInfoSchema = z
  .object({
    name: deviceNameSchema,
    platform: devicePlatformSchema,
  })
  .strict()

export type DeviceInfo = z.infer<typeof deviceInfoSchema>

/**
 * Email: dinormalkan lowercase + di-trim DI SCHEMA, bukan di service, supaya web dan mobile
 * menormalkan dengan cara yang sama (kalau tidak, `Budi@mail.com` dan `budi@mail.com` bisa jadi dua
 * akun). `.max()` dipasang sebelum cek format supaya string raksasa ditolak lebih dulu.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH, `Email maksimum ${EMAIL_MAX_LENGTH} karakter`)
  .pipe(z.email())

/**
 * Kode OTP sebagai STRING 6 digit, bukan number: kode seperti `000123` harus utuh, dan number akan
 * membuang nol di depan.
 */
export const otpCodeSchema = z
  .string()
  .regex(/^[0-9]{6}$/, `Kode OTP harus ${OTP_CODE_LENGTH} digit angka`)

/** `POST /v1/auth/otp/request` - minta kode dikirim ke email. */
export const otpRequestInputSchema = z
  .object({
    email: emailSchema,
    client: clientKindSchema,
    device: deviceInfoSchema,
  })
  .strict()

export type OtpRequestInput = z.infer<typeof otpRequestInputSchema>

/**
 * `POST /v1/auth/otp/verify` - tukar kode jadi sesi untuk perangkat ini.
 *
 * `device` dikirim ulang di verify (bukan cuma di request): server baru membuat baris `devices` saat
 * kode terbukti benar, dan dengan begitu permintaan kode tidak bisa mengisi tabel perangkat.
 */
export const otpVerifyInputSchema = z
  .object({
    email: emailSchema,
    code: otpCodeSchema,
    client: clientKindSchema,
    device: deviceInfoSchema,
  })
  .strict()

export type OtpVerifyInput = z.infer<typeof otpVerifyInputSchema>

/**
 * `GET /v1/auth/google/start?client=`
 *
 * `redirectUri` SENGAJA tidak diterima dari client: server memetakan `client` -> redirect URI yang
 * terdaftar per environment (`server.dbml` `oauth_states.redirect_uri`). Kalau redirect URI boleh
 * dikirim client, endpoint ini jadi open redirect sekaligus jalur pencurian authorization code.
 */
export const googleStartQuerySchema = z.object({ client: clientKindSchema }).strict()

export type GoogleStartQuery = z.infer<typeof googleStartQuerySchema>

/**
 * Hasil `GET /v1/auth/google/start` untuk client `mobile`.
 *
 * Client `web` diarahkan lewat `302` (browser yang jadi agen, tidak ada body), sedangkan `mobile`
 * menerima URL di body supaya app membukanya di browser sistem. Bentuk ini sudah dipakai klien
 * (lihat `server/routes/v1/auth/google/start.get.ts`) tapi belum punya schema kontrak - jadi
 * ditambahkan sekarang sebagai ADDITIVE: field-nya sengaja minimal dan tidak mengubah bentuk yang
 * sudah dipakai klien mana pun.
 *
 * TIDAK ada token di sini: sesi baru terbit di langkah callback. `expiresAt` = kedaluwarsa `state`
 * OAuth (TTL `oauth_states`, <= 10 menit).
 */
export const googleStartResultSchema = z
  .object({
    // Regex, bukan `URL.canParse`: paket ini TS murni tanpa lib DOM/Node (ARCHITECTURE.md §3), jadi
    // global `URL` tidak tersedia. URL otorisasi Google selalu https absolut.
    authorizationUrl: z
      .string()
      .max(2048)
      .regex(/^https:\/\/[^\s]+$/, 'authorizationUrl harus URL https absolut'),
    expiresAt: isoInstantSchema,
  })
  .strict()

export type GoogleStartResult = z.infer<typeof googleStartResultSchema>

/**
 * `GET /v1/auth/google/callback?code=&state=`
 *
 * `code` dan `state` wajib; keduanya cuma diteruskan ke Google. `scope`, `authuser`, `prompt`, dan
 * `hd` boleh ikut datang dari Google: itu param yang ditambahkan penyedianya sendiri, dan menolaknya
 * akan membuat login production gagal walau tidak ada yang salah dengan aplikasi. Nilai lain tetap
 * ditolak (`.strict()`), jadi toleransi ini tidak membuka pintu untuk field asing.
 */
export const googleCallbackQuerySchema = z
  .object({
    code: z.string().min(1).max(2048),
    state: z.string().min(1).max(512),
    scope: z.string().max(512).optional(),
    authuser: z.string().max(8).optional(),
    prompt: z.string().max(64).optional(),
    hd: z.string().max(253).optional(),
  })
  .strict()

export type GoogleCallbackQuery = z.infer<typeof googleCallbackQuerySchema>

/** User yang boleh dilihat client: tanpa hash, tanpa field internal. */
export const sessionUserSchema = z.object({ id: uuidSchema, email: emailSchema }).strict()

export type SessionUser = z.infer<typeof sessionUserSchema>

/** Perangkat sesi ini. Cukup id + nama untuk ditampilkan; detail lain ada di `deviceDtoSchema`. */
export const sessionDeviceSchema = z.object({ id: uuidSchema, name: deviceNameSchema }).strict()

export type SessionDevice = z.infer<typeof sessionDeviceSchema>

const SESSION_DTO_FIELDS = {
  user: sessionUserSchema,
  device: sessionDeviceSchema,
  expiresAt: isoInstantSchema,
}

/**
 * Sesi untuk client `web`: TIDAK ada token di body.
 *
 * Web memakai cookie `HttpOnly; Secure; SameSite=Lax` (ARCHITECTURE.md §8), jadi token mentah tidak
 * pernah perlu menyentuh JavaScript - dan karena itu tidak bisa dicuri XSS.
 */
export const webSessionDtoSchema = z
  .object({ ...SESSION_DTO_FIELDS, client: z.literal('web') })
  .strict()

export type WebSessionDto = z.infer<typeof webSessionDtoSchema>

/** Sesi untuk client `mobile`: token mentah ada di body, karena native menyimpannya di SecureStore. */
export const mobileSessionDtoSchema = z
  .object({
    ...SESSION_DTO_FIELDS,
    client: z.literal('mobile'),
    token: z.string().min(SESSION_TOKEN_MIN_LENGTH).max(512),
  })
  .strict()

export type MobileSessionDto = z.infer<typeof mobileSessionDtoSchema>

/**
 * `GET /v1/auth/session` - sesi yang SEDANG berlaku untuk request ini.
 *
 * Sengaja tanpa `client` dan tanpa `token`: endpoint ini cuma MEMBACA sesi yang sudah ada, bukan
 * menerbitkannya. `sessionDtoSchema` tidak bisa dipakai di sini karena union-nya mewajibkan `client`
 * terisi - dan `mobile` tanpa `token` ditolak schema-nya, padahal pembacaan sesi berlaku sama untuk
 * web (cookie HttpOnly) maupun mobile (bearer).
 *
 * Dipakai klien web untuk memulihkan state login setelah reload: token ada di cookie `HttpOnly`, jadi
 * JavaScript tidak punya cara lain untuk tahu apakah sesinya masih hidup.
 */
export const currentSessionResultSchema = z.object(SESSION_DTO_FIELDS).strict()

export type CurrentSessionResult = z.infer<typeof currentSessionResultSchema>

/**
 * DTO sesi hasil login (OTP maupun Google).
 *
 * Bentuk union atas `client`, BUKAN satu objek dengan `token` opsional: token untuk web bukan cuma
 * "tidak diisi", tapi memang dilarang ada. Dengan union, salah pakai (mengirim token ke web atau lupa
 * mengirim ke mobile) ditolak saat parse - bukan jadi kebiasaan yang tidak kelihatan di review.
 */
export const sessionDtoSchema = z.discriminatedUnion('client', [
  webSessionDtoSchema,
  mobileSessionDtoSchema,
])

export type SessionDto = z.infer<typeof sessionDtoSchema>
