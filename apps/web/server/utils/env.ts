import { z } from 'zod'

/**
 * Validasi env server - fail-closed.
 *
 * Aturan yang mengikat (security.md §1, ARCHITECTURE.md §8, PRD F15/T19):
 * - Secret HANYA dari key PRIVATE `runtimeConfig` (diisi lewat env `NUXT_*`). Tidak ada satu pun
 *   field di sini yang boleh masuk `runtimeConfig.public`.
 * - `APP_ENV` untuk keputusan keamanan dibaca dari key private, BUKAN dari
 *   `runtimeConfig.public.appEnv` (nilai itu ter-serialize ke klien, jadi keputusan keamanan tidak
 *   boleh bergantung padanya).
 * - Nilai env yang tidak dikenal/kosong = `production` (fail-closed). Karena itu `777777` tidak
 *   pernah diterima di production: mode OTP fix hanya turunan dari `APP_ENV` yang EKSPLISIT
 *   non-production, dan tidak ada flag/header/query client yang bisa menyalakannya.
 * - Validasi jalan saat startup (plugin `server/plugins/env.ts`): env tidak valid = server nolak
 *   start, bukan gagal diam-diam saat request pertama.
 *
 * Pesan error hanya menyebut NAMA variabel, tidak pernah nilainya - laporan startup yang bocor
 * sama bahayanya dengan secret yang bocor.
 */

/** Env non-production yang diizinkan. Di luar daftar ini (termasuk `production`) = production. */
export const NON_PRODUCTION_APP_ENVS = ['development', 'staging', 'test', 'preview'] as const

export type NonProductionAppEnv = (typeof NON_PRODUCTION_APP_ENVS)[number]

export type AppEnv = NonProductionAppEnv | 'production'

/** Panjang minimum pepper. HMAC dengan kunci pendek praktis bisa di-brute-force. */
const PEPPER_MIN_LENGTH = 32

/** Batas jumlah hop proxy yang boleh dipercaya. Lebih dari ini = salah konfigurasi. */
const MAX_TRUSTED_PROXY_HOPS = 10

/**
 * Nama key env yang, kalau ada, berarti seseorang mencoba menyalakan mode OTP fix di luar `APP_ENV`.
 * Server menolak start kalau menemukannya: mode fix HARUS turunan dari `APP_ENV` saja, supaya tidak
 * ada jalur kedua yang bisa lupa dimatikan saat deploy production.
 */
const FIXED_OTP_OVERRIDE_KEY_PATTERN = /(otp|pin)[._-]*(fix|fixed|bypass|mock|static|demo)/i

/**
 * Normalisasi `APP_ENV`. Trim + lowercase, lalu allowlist eksplisit.
 *
 * `undefined`, string kosong, `production`, dan nilai typo seperti `prod` semuanya jatuh ke
 * `production` - satu arah yang aman, tanpa cabang "kayaknya development".
 */
export function resolveAppEnv(raw: unknown): AppEnv {
  if (typeof raw !== 'string') return 'production'

  const normalized = raw.trim().toLowerCase()
  const match = NON_PRODUCTION_APP_ENVS.find((candidate) => candidate === normalized)
  return match ?? 'production'
}

/** Mode OTP fix aktif HANYA di env non-production yang eksplisit. */
export function isFixedOtpEnabled(appEnv: AppEnv): boolean {
  return appEnv !== 'production'
}

const pepperSchema = (variableName: string) =>
  z
    .string({ error: `${variableName} wajib diisi` })
    .min(PEPPER_MIN_LENGTH, `${variableName} minimum ${PEPPER_MIN_LENGTH} karakter`)

/** Origin CORS: `https://app.example.com,https://staging.example.com`. `*` ditolak. */
const corsOriginsSchema = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .refine(
    (origins) => origins.every((origin) => origin !== '*'),
    'CORS tidak boleh memakai "*" bersama credentials - daftarkan origin eksplisit',
  )
  .refine(
    (origins) => origins.every((origin) => URL.canParse(origin)),
    'setiap origin CORS harus URL lengkap (mis. https://app.example.com)',
  )

const redirectUriSchema = (variableName: string) =>
  z
    .string({ error: `${variableName} wajib diisi` })
    .refine((value) => URL.canParse(value), `${variableName} harus URL lengkap`)

const trustedProxyHopsSchema = z
  .union([z.number(), z.string()])
  .default(0)
  .transform((value) => (typeof value === 'number' ? value : Number(value.trim())))
  .refine(
    (value) => Number.isInteger(value) && value >= 0 && value <= MAX_TRUSTED_PROXY_HOPS,
    `jumlah hop proxy harus integer 0..${MAX_TRUSTED_PROXY_HOPS}`,
  )

const serverEnvSchema = z
  .object({
    appEnv: z.unknown().transform(resolveAppEnv),
    databaseUrl: z
      .string({ error: 'NUXT_DATABASE_URL wajib diisi' })
      .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
        error: 'NUXT_DATABASE_URL harus connection string Postgres',
      }),
    otpPepper: pepperSchema('NUXT_OTP_PEPPER'),
    rateLimitPepper: pepperSchema('NUXT_RATE_LIMIT_PEPPER'),
    googleClientId: z.string({ error: 'NUXT_GOOGLE_CLIENT_ID wajib diisi' }).min(1),
    googleClientSecret: z.string({ error: 'NUXT_GOOGLE_CLIENT_SECRET wajib diisi' }).min(1),
    googleRedirectUriWeb: redirectUriSchema('NUXT_GOOGLE_REDIRECT_URI_WEB'),
    googleRedirectUriMobile: redirectUriSchema('NUXT_GOOGLE_REDIRECT_URI_MOBILE'),
    corsAllowedOrigins: corsOriginsSchema,
    trustedProxyHops: trustedProxyHopsSchema,
    /**
     * Kredensial email: wajib HANYA di production (dicek di `resolveServerEnv`).
     *
     * Di non-production email tidak pernah dikirim (PRD F15), jadi mewajibkannya di semua env hanya
     * akan membuat developer mengisi nilai palsu - dan nilai palsu itulah yang nanti ikut ke
     * production.
     */
    resendApiKey: z.string().default(''),
    mailFrom: z.string().default(''),
  })
  .transform((value) => ({
    ...value,
    isProduction: value.appEnv === 'production',
    fixedOtpEnabled: isFixedOtpEnabled(value.appEnv),
  }))

export type ServerEnv = z.infer<typeof serverEnvSchema>

/** Error env yang membawa daftar field bermasalah - dipakai plugin startup untuk menolak start. */
export class ServerEnvError extends Error {
  readonly fields: readonly string[]

  constructor(fields: readonly string[]) {
    super(`Konfigurasi env server tidak valid (${fields.join(', ')})`)
    this.name = 'ServerEnvError'
    this.fields = fields
  }
}

/**
 * Pelanggaran "jalur kedua mode OTP fix" - turunan `ServerEnvError` supaya kode yang menangkap error
 * env tetap kompatibel, tapi plugin startup bisa MEMBEDAKANNYA.
 *
 * Bedanya penting: pelanggaran ini harus menolak start di SEMUA environment (termasuk non-production),
 * sedangkan env yang cuma belum lengkap boleh dilewati di non-production agar `nuxt dev` tetap jalan.
 * Tanpa tipe terpisah, plugin tidak punya cara membedakan dua sebab kegagalan itu.
 */
export class FixedOtpOverrideError extends ServerEnvError {
  constructor(fields: readonly string[]) {
    super(fields)
    this.name = 'FixedOtpOverrideError'
  }
}

/**
 * Cek invariant startup: tidak boleh ada key env yang menyalakan mode OTP fix di luar `APP_ENV`.
 *
 * `envNames` = NAMA variabel environment (bukan nilainya). Membaca nama env aman dan memang perlu:
 * tanpa ini, `NUXT_OTP_FIX=true` di production akan menyalakan kode fix tanpa jejak di kode mana pun.
 *
 * Catatan: "production + mode fix aktif" TIDAK bisa terjadi lewat `APP_ENV` - `fixedOtpEnabled` murni
 * turunan `resolveAppEnv()`, dan `resolveAppEnv()` memetakan apa pun yang bukan salah satu dari empat
 * env non-production (termasuk string kosong) ke `production`. Tapi itu hanya benar kalau `APP_ENV`
 * benar. Kalau deployment production salah label (`NODE_ENV=production` dari image, sementara
 * `NUXT_APP_ENV` terisi `staging`/`test` karena template env yang di-copy), mode fix HIDUP di
 * production. Itu yang ditutup `assertFixedOtpNotInProduction` di bawah - bukan di sini, karena
 * pemeriksaan itu butuh `NODE_ENV` (parameter terpisah, lihat `assertServerEnvForStartup`).
 */
export function assertNoFixedOtpOverride(
  config: Record<string, unknown>,
  envNames: readonly string[] = [],
): void {
  const offendingKeys = Object.keys(config).filter((key) =>
    FIXED_OTP_OVERRIDE_KEY_PATTERN.test(key),
  )
  const offendingEnvNames = envNames.filter((name) => FIXED_OTP_OVERRIDE_KEY_PATTERN.test(name))

  if (offendingKeys.length > 0 || offendingEnvNames.length > 0) {
    throw new FixedOtpOverrideError(
      [...offendingKeys, ...offendingEnvNames].map((key) => `${key} (mode OTP fix dilarang)`),
    )
  }
}

/**
 * Parse + validasi konfigurasi runtime jadi `ServerEnv`.
 *
 * `config` sengaja bertipe `Record<string, unknown>`, bukan tipe runtimeConfig Nuxt: service cukup
 * menerima objek biasa, jadi unit test bisa memanggilnya tanpa instance Nitro sama sekali.
 */
export function resolveServerEnv(config: Record<string, unknown>): ServerEnv {
  const parsed = serverEnvSchema.safeParse(config)
  if (!parsed.success) {
    throw new ServerEnvError(parsed.error.issues.map((issue) => issue.path.join('.') || 'config'))
  }

  const env = parsed.data

  // Wajib hanya di production: di sana email benar-benar dikirim, dan production tanpa kredensial
  // email berarti user tidak bisa login sama sekali. Lebih baik gagal start daripada jalan setengah.
  const missingProductionKeys = (
    [
      ['NUXT_RESEND_API_KEY', env.resendApiKey],
      ['NUXT_MAIL_FROM', env.mailFrom],
    ] as const
  )
    .filter(([, value]) => value.trim().length === 0)
    .map(([name]) => name)

  if (env.isProduction && missingProductionKeys.length > 0) {
    throw new ServerEnvError(missingProductionKeys.map((name) => `${name} wajib di production`))
  }

  return env
}

/**
 * `NODE_ENV` yang dianggap "deployment production". Selain ini (mis. `test`, `development`, kosong)
 * tidak memicu pemeriksaan silang - lihat alasannya di `assertFixedOtpNotInProduction`.
 */
const PRODUCTION_NODE_ENV = 'production'

/**
 * Cross-check: mode OTP fix TIDAK BOLEH hidup di deployment production (temuan M3 audit keamanan,
 * AC T19 yang sebelumnya hanya terpenuhi sebagian).
 *
 * Kenapa perlu, padahal `fixedOtpEnabled` cuma turunan `APP_ENV`: turunan itu benar hanya kalau
 * `NUXT_APP_ENV` diisi benar. Yang mau ditutup adalah salah setel yang sangat mudah terjadi - image
 * production dijalankan dengan `NUXT_APP_ENV=staging` (nilai dari template `.env.example`, atau typo di
 * secret manager). Akibatnya siapa pun bisa masuk sebagai email siapa pun dengan kode `777777`, dan
 * tidak ada satu log pun yang mengatakannya.
 *
 * Yang dibandingkan adalah `NODE_ENV` (fakta proses: image production dibangun/dijalankan dengan
 * `NODE_ENV=production`), BUKAN nilai lain yang bisa ikut salah label seperti `APP_ENV`.
 *
 * `nodeEnv` sengaja parameter eksplisit, bukan dibaca dari `process.env` di dalam sini: fungsi ini
 * tetap murni & bisa diuji tanpa menyentuh environment proses. Yang membacanya plugin startup.
 *
 * Yang SENGAJA tidak dianggap produksi: `NODE_ENV` selain `production` (termasuk kosong). Non-production
 * adalah tempat mode fix memang boleh hidup (login demo, e2e), dan menolak start di sana akan mematikan
 * `nuxt dev`/suite test tanpa menambah keamanan apa pun - jalur ini murni soal "deployment produksi".
 */
export function assertFixedOtpNotInProduction(env: ServerEnv, nodeEnv: string | undefined): void {
  if (!env.fixedOtpEnabled) return
  if (nodeEnv?.trim().toLowerCase() !== PRODUCTION_NODE_ENV) return

  throw new FixedOtpOverrideError([
    'NODE_ENV=production (mode OTP fix dilarang di production; periksa NUXT_APP_ENV)',
  ])
}

/**
 * Validasi yang dijalankan SAAT STARTUP server (dipakai plugin `server/plugins/env.ts`).
 *
 * Menggabungkan tiga pemeriksaan yang harus selalu bersama:
 * 1. `assertNoFixedOtpOverride` - jalur kedua yang menyalakan mode OTP fix (env/flag di luar
 *    `APP_ENV`) DILARANG, di env mana pun. Paling penting justru di production: `NUXT_OTP_FIX=true`
 *    yang lolos berarti siapa pun bisa login dengan `777777`.
 * 2. `resolveServerEnv` - env wajib terisi & valid. Di production kegagalan di sini = server MENOLAK
 *    start (fail-closed, ARCHITECTURE.md §8).
 * 3. `assertFixedOtpNotInProduction` - `NODE_ENV=production` + mode fix aktif = MENOLAK start. Ini
 *    menutup satu-satunya sisa cara `777777` bisa hidup di deployment produksi: `APP_ENV` yang salah
 *    label (temuan M3).
 *
 * Dipisah dari plugin supaya perilakunya bisa diuji tanpa membangun instance Nitro: fungsinya murni
 * (menerima `config`, daftar NAMA env, dan `nodeEnv` - tidak menyentuh `process.env` sendiri) dan
 * melempar `ServerEnvError` yang membawa daftar field bermasalah.
 *
 * Pesan error hanya menyebut NAMA variabel, tidak pernah nilainya.
 */
export function assertServerEnvForStartup(
  config: Record<string, unknown>,
  envNames: readonly string[] = [],
  nodeEnv?: string,
): ServerEnv {
  // Dijalankan lebih dulu: pelanggaran ini yang paling berbahaya, jadi jangan sampai tertutup oleh
  // kegagalan validasi env lain yang lebih "berisik".
  assertNoFixedOtpOverride(config, envNames)

  const env = resolveServerEnv(config)
  assertFixedOtpNotInProduction(env, nodeEnv)

  return env
}

/**
 * `ServerEnv` milik request ini.
 *
 * Hanya dipanggil dari `server/**` (tidak pernah dari kode yang bisa jalan di client) dan selalu
 * lewat `useRuntimeConfig(event)` - bukan `process.env`, bukan `import.meta.env`.
 */
export function serverEnv(event?: H3Event): ServerEnv {
  // Satu-satunya cast tipe di `server/**`, dan alasannya teknis: `useRuntimeConfig` datang dari
  // nitropack dan parameternya bertipe `H3Event` dari alias `h3` yang di tsconfig Nuxt diarahkan ke
  // h3 v2, sedangkan event runtime server bertipe h3 v1 (lihat `shared/h3-event.d.ts`). Dua tipe
  // bernama sama dari dua versi berbeda tidak saling kompatibel walau objeknya sama, jadi satu cast di
  // sini - yang dilewatkan tetap event request yang sama, jadi perilakunya tidak berubah.
  const runtimeEvent = event as unknown as Parameters<typeof useRuntimeConfig>[0]
  const runtimeConfig = useRuntimeConfig(runtimeEvent) as unknown as Record<string, unknown>
  return resolveServerEnv(runtimeConfig)
}
