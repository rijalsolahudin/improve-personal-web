// @vitest-environment node
//
// Test env fail-closed (AC T19, quality gate ARCHITECTURE.md §13.4). Level SERVICE/unit: seluruh
// keputusan di sini murni turunan konfigurasi, jadi tidak butuh HTTP - dan tidak boleh butuh DB untuk
// mayoritas test. Yang butuh DB (kode OTP di production) memakai `helpers/harness`.
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { FIXED_OTP_CODE, requestOtp, verifyOtp } from '../services/otp'
import { hmacSha256, sha256Hex } from '../utils/crypto'
import {
  assertFixedOtpNotInProduction,
  assertNoFixedOtpOverride,
  assertServerEnvForStartup,
  FixedOtpOverrideError,
  isFixedOtpEnabled,
  NON_PRODUCTION_APP_ENVS,
  resolveAppEnv,
  resolveServerEnv,
  ServerEnvError,
} from '../utils/env'
import { uuidv7 } from '../utils/uuid'
import { otpChallenges } from '../db/schema'
import {
  closeTestDb,
  FIXED_NOW,
  makeEnv,
  TEST_DATABASE_URL,
  TEST_GOOGLE_REDIRECT_URI,
  TEST_OTP_PEPPER,
  TEST_RATE_LIMIT_PEPPER,
} from './helpers/harness'
import { captureProblem, testScope } from './helpers/scope'

/** Konfigurasi runtimeConfig private yang valid - dasar semua test di berkas ini. */
function baseConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    appEnv: 'test',
    databaseUrl: TEST_DATABASE_URL,
    otpPepper: TEST_OTP_PEPPER,
    rateLimitPepper: TEST_RATE_LIMIT_PEPPER,
    googleClientId: 'qa-google-client-id',
    googleClientSecret: 'qa-google-client-secret',
    googleRedirectUriWeb: TEST_GOOGLE_REDIRECT_URI,
    googleRedirectUriMobile: TEST_GOOGLE_REDIRECT_URI,
    ...overrides,
  }
}

const PRODUCTION_MAIL = { resendApiKey: 'qa-resend-key', mailFrom: 'qa@improve-personal.test' }

describe('resolveAppEnv (fail-closed: apa pun yang tidak dikenal = production)', () => {
  it('env kosong, hilang, bukan string, atau typo diperlakukan production', () => {
    const unknownValues: readonly unknown[] = [
      undefined,
      null,
      0,
      1,
      {},
      [],
      true,
      '',
      '   ',
      'prod',
      'prd',
      'developmentn',
      'local',
      'dev',
      'test-env',
    ]

    for (const raw of unknownValues) {
      expect(resolveAppEnv(raw)).toBe('production')
    }
  })

  it('env non-production hanya diterima kalau ditulis eksplisit (trim + lowercase)', () => {
    for (const value of NON_PRODUCTION_APP_ENVS) {
      expect(resolveAppEnv(value)).toBe(value)
      expect(resolveAppEnv(` ${value.toUpperCase()} `)).toBe(value)
    }
  })

  it('"production" eksplisit tetap production (tidak ada jalur kedua)', () => {
    expect(resolveAppEnv('production')).toBe('production')
    expect(resolveAppEnv('PRODUCTION')).toBe('production')
  })
})

describe('isFixedOtpEnabled', () => {
  it('aktif HANYA untuk empat env non-production eksplisit', () => {
    for (const appEnv of NON_PRODUCTION_APP_ENVS) {
      expect(isFixedOtpEnabled(appEnv)).toBe(true)
    }

    expect(isFixedOtpEnabled('production')).toBe(false)
    expect(isFixedOtpEnabled(resolveAppEnv(''))).toBe(false)
    expect(isFixedOtpEnabled(resolveAppEnv('prod'))).toBe(false)
  })
})

describe('resolveServerEnv - server menolak start kalau env tidak valid', () => {
  it('production tanpa kredensial email -> throw (lebih baik gagal start daripada tidak bisa login)', () => {
    expect(() => resolveServerEnv(baseConfig({ appEnv: 'production' }))).toThrow(ServerEnvError)
    expect(() =>
      resolveServerEnv(baseConfig({ appEnv: 'production', resendApiKey: '', mailFrom: '  ' })),
    ).toThrow(ServerEnvError)
  })

  it('APP_ENV kosong/hilang diperlakukan production, jadi kredensial email ikut wajib', () => {
    expect(() =>
      resolveServerEnv(baseConfig({ appEnv: '', resendApiKey: '', mailFrom: '' })),
    ).toThrow(ServerEnvError)
    expect(() =>
      resolveServerEnv({ ...baseConfig({ resendApiKey: '', mailFrom: '' }), appEnv: undefined }),
    ).toThrow(ServerEnvError)
  })

  it('env test tidak butuh kredensial email dan menyalakan kode fix', () => {
    const env = resolveServerEnv(baseConfig())

    expect(env.isProduction).toBe(false)
    expect(env.fixedOtpEnabled).toBe(true)
    expect(env.appEnv).toBe('test')
  })

  it('production + upaya menyalakan mode OTP fix -> ditolak, bukan "hampir aman"', () => {
    // Kombinasi "production & mode fix aktif" dicek dari dua arah: (1) tidak ada nilai APP_ENV yang
    // menghasilkan `isProduction && fixedOtpEnabled`, dan (2) key env yang mencoba menyalakannya
    // membuat server menolak start.
    for (const raw of ['production', 'PRODUCTION', '', 'prod', undefined] as const) {
      const env = resolveServerEnv(
        baseConfig({ appEnv: raw, ...PRODUCTION_MAIL, otpFixed: true, fixedOtpEnabled: true }),
      )

      expect(env.isProduction).toBe(true)
      expect(env.fixedOtpEnabled).toBe(false)
    }

    expect(() => assertNoFixedOtpOverride({}, ['NUXT_OTP_FIX'])).toThrow(ServerEnvError)
  })

  it('pepper pendek/absen ditolak - HMAC dengan kunci pendek praktis bisa di-brute-force', () => {
    expect(() => resolveServerEnv(baseConfig({ otpPepper: 'pendek' }))).toThrow(ServerEnvError)
    expect(() => resolveServerEnv(baseConfig({ rateLimitPepper: '' }))).toThrow(ServerEnvError)
    expect(() => resolveServerEnv({ ...baseConfig(), otpPepper: undefined })).toThrow(
      ServerEnvError,
    )
  })

  it('databaseUrl wajib connection string Postgres', () => {
    expect(() => resolveServerEnv(baseConfig({ databaseUrl: 'mysql://x' }))).toThrow(ServerEnvError)
    expect(() => resolveServerEnv(baseConfig({ databaseUrl: '' }))).toThrow(ServerEnvError)
  })

  it('CORS "*" ditolak dan hop proxy di luar rentang ditolak', () => {
    expect(() => resolveServerEnv(baseConfig({ corsAllowedOrigins: '*' }))).toThrow(ServerEnvError)
    expect(() => resolveServerEnv(baseConfig({ trustedProxyHops: '99' }))).toThrow(ServerEnvError)
    expect(() => resolveServerEnv(baseConfig({ trustedProxyHops: -1 }))).toThrow(ServerEnvError)
  })

  it('pesan error menyebut NAMA variabel saja, tidak pernah nilainya', () => {
    const secretValue = 'rahasia-yang-pendek'

    let thrown: unknown = null
    try {
      resolveServerEnv(baseConfig({ otpPepper: secretValue }))
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(ServerEnvError)
    const message = thrown instanceof Error ? thrown.message : ''
    expect(message).toContain('otpPepper')
    expect(message).not.toContain(secretValue)
  })
})

describe('assertNoFixedOtpOverride (jalur KEDUA untuk menyalakan OTP fix dilarang)', () => {
  it.each([
    'NUXT_OTP_FIX',
    'NUXT_OTP_FIXED',
    'NUXT_OTP_FIXED_CODE',
    'NUXT_OTP_BYPASS',
    'NUXT_OTP_MOCK',
    'NUXT_OTP_DEMO',
    'NUXT_PIN_STATIC',
    'NUXT_OTP_FIXED.OTP',
  ])('env %s ditolak', (name) => {
    expect(() => assertNoFixedOtpOverride({}, [name])).toThrow(ServerEnvError)
  })

  it('key runtimeConfig yang mencoba menyalakan mode fix ditolak', () => {
    expect(() => assertNoFixedOtpOverride({ otpFixed: true }, [])).toThrow(ServerEnvError)
    expect(() => assertNoFixedOtpOverride({ otpBypass: 'true', pinMock: 1 }, [])).toThrow(
      ServerEnvError,
    )
  })

  it('konfigurasi normal (pepper, appEnv) lolos', () => {
    expect(() =>
      assertNoFixedOtpOverride({ otpPepper: 'x', rateLimitPepper: 'y', appEnv: 'production' }, [
        'NUXT_OTP_PEPPER',
        'NUXT_RATE_LIMIT_PEPPER',
        'NUXT_APP_ENV',
      ]),
    ).not.toThrow()
  })

  it('error-nya menyebut key yang bermasalah, bukan nilainya', () => {
    try {
      assertNoFixedOtpOverride({}, ['NUXT_OTP_FIX'])
      expect.unreachable('assertNoFixedOtpOverride seharusnya melempar')
    } catch (error) {
      expect(error).toBeInstanceOf(ServerEnvError)
      if (error instanceof ServerEnvError) {
        expect(error.fields.join(',')).toContain('NUXT_OTP_FIX')
      }
    }
  })
})

describe('kode OTP fix tidak pernah istimewa di production (T19 AC)', () => {
  const scope = testScope()

  afterEach(async () => {
    await scope.dispose()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  it('production memakai kode acak 6 digit dan `fixedOtpEnabled` tetap false', async () => {
    const fixture = scope.fixture({
      prefix: 'prod-otp',
      env: makeEnv({ appEnv: 'production', ...PRODUCTION_MAIL }),
    })
    const ctx = fixture.ctx()

    expect(ctx.env.isProduction).toBe(true)
    expect(ctx.env.fixedOtpEnabled).toBe(false)

    await requestOtp(ctx, {
      email: fixture.email,
      purpose: 'login',
      mailer: fixture.mailer.mailer,
    })

    const [mail] = fixture.mailer.mails
    expect(mail?.code).toMatch(/^[0-9]{6}$/)
    expect(mail?.to).toBe(fixture.email)

    // Kode dari mailer (kode acak production) memang bisa ditukar; yang tidak bisa adalah kode fix.
    const problem = await captureProblem(
      verifyOtp(ctx, { email: fixture.email, code: FIXED_OTP_CODE, purpose: 'login' }),
    )

    if (mail?.code === FIXED_OTP_CODE) {
      // Praktis tidak mungkin (1 dari 10^6), tapi kalau terjadi test ini tidak boleh menyesatkan.
      expect(problem).toBeNull()
    } else {
      expect(problem?.code).toBe('OTP_INVALID')
    }
  })

  it('challenge dengan kode asli 123456 menolak 777777 (tanpa bergantung mailer)', async () => {
    const fixture = scope.fixture({
      prefix: 'prod-manual',
      env: makeEnv({ appEnv: 'production', ...PRODUCTION_MAIL }),
    })
    const ctx = fixture.ctx()

    await ctx.db.insert(otpChallenges).values({
      id: uuidv7(FIXED_NOW.getTime()),
      emailHash: hmacSha256(fixture.email, ctx.env.otpPepper),
      codeHash: hmacSha256('123456', ctx.env.otpPepper),
      purpose: 'login',
      attempts: 0,
      createdAt: FIXED_NOW,
      expiresAt: new Date(FIXED_NOW.getTime() + 600_000),
    })

    const rejected = await captureProblem(
      verifyOtp(ctx, { email: fixture.email, code: FIXED_OTP_CODE, purpose: 'login' }),
    )
    expect(rejected?.code).toBe('OTP_INVALID')

    // Sanity: kode yang memang benar tetap diterima, jadi penolakan di atas bukan karena jalurnya rusak.
    const accepted = await captureProblem(
      verifyOtp(ctx, { email: fixture.email, code: '123456', purpose: 'login' }),
    )
    expect(accepted).toBeNull()
  })

  it('code hash OTP selalu HMAC, bukan kode polos', async () => {
    const fixture = scope.fixture({ prefix: 'hash-otp' })
    const ctx = fixture.ctx()

    await requestOtp(ctx, {
      email: fixture.email,
      purpose: 'login',
      mailer: fixture.mailer.mailer,
    })

    const rows = await ctx.db.select().from(otpChallenges)
    const row = rows.find(
      (candidate) => candidate.emailHash === hmacSha256(fixture.email, ctx.env.otpPepper),
    )

    expect(row?.codeHash).toBe(hmacSha256(FIXED_OTP_CODE, ctx.env.otpPepper))
    expect(row?.codeHash).toHaveLength(64)
    expect(row?.codeHash).not.toContain(FIXED_OTP_CODE)
    // Email juga tidak pernah disimpan polos.
    expect(sha256Hex(fixture.email)).not.toBe(row?.emailHash)
    expect(JSON.stringify(row)).not.toContain(fixture.email)
  })
})

describe('assertServerEnvForStartup (validasi yang dijalankan plugin startup)', () => {
  it('production + upaya menyalakan mode OTP fix -> server MENOLAK start', () => {
    // Ini AC T19 yang paling berbahaya kalau lolos: `NUXT_OTP_FIX=true` di production = siapa pun
    // bisa login dengan 777777. Mode fix HARUS murni turunan APP_ENV.
    expect(() =>
      assertServerEnvForStartup(baseConfig({ appEnv: 'production', ...PRODUCTION_MAIL }), [
        'NUXT_OTP_FIX',
      ]),
    ).toThrow(ServerEnvError)

    expect(() =>
      assertServerEnvForStartup(baseConfig({ appEnv: 'test' }), ['NUXT_OTP_BYPASS']),
    ).toThrow(ServerEnvError)
  })

  it('production tanpa kredensial email -> server MENOLAK start (bukan jalan setengah)', () => {
    expect(() => assertServerEnvForStartup(baseConfig({ appEnv: 'production' }), [])).toThrow(
      ServerEnvError,
    )
  })

  it('env tidak dikenal/kosong diperlakukan production -> kredensial email wajib', () => {
    expect(() => assertServerEnvForStartup(baseConfig({ appEnv: 'prod' }), [])).toThrow(
      ServerEnvError,
    )
    expect(() => assertServerEnvForStartup(baseConfig({ appEnv: '' }), [])).toThrow(ServerEnvError)
  })

  it('konfigurasi valid lolos dan mengembalikan env yang dipakai server', () => {
    const production = assertServerEnvForStartup(
      baseConfig({ appEnv: 'production', ...PRODUCTION_MAIL }),
      [],
    )
    expect(production.isProduction).toBe(true)
    expect(production.fixedOtpEnabled).toBe(false)

    const test = assertServerEnvForStartup(baseConfig(), [])
    expect(test.appEnv).toBe('test')
    expect(test.fixedOtpEnabled).toBe(true)
  })

  it('NODE_ENV=production + APP_ENV non-production (mode OTP fix) -> MENOLAK start (M3)', () => {
    // Inilah AC T19 yang sebelumnya cuma terpenuhi sebagian: satu-satunya jalur yang bisa menyalakan
    // `777777` adalah `NUXT_APP_ENV` eksplisit non-production, dan TIDAK ADA yang menolak start kalau
    // deployment produksi salah label (`NODE_ENV=production` dari image, `NUXT_APP_ENV` terisi dari
    // template env). Akibatnya siapa pun bisa login sebagai email siapa pun.
    for (const wrongLabel of NON_PRODUCTION_APP_ENVS) {
      expect(
        () => assertServerEnvForStartup(baseConfig({ appEnv: wrongLabel }), [], 'production'),
        `APP_ENV=${wrongLabel} + NODE_ENV=production seharusnya ditolak`,
      ).toThrow(FixedOtpOverrideError)
    }
  })

  it('kombinasi terlarang itu tetap ditolak walau APP_ENV-nya tidak valid sama sekali', () => {
    // `prod` (typo) diperlakukan `production` oleh `resolveAppEnv`, jadi mode fix TIDAK menyala dan
    // yang gagal adalah validasi env lain - bukan pemeriksaan silang ini. Yang penting: tidak ada
    // kombinasi yang lolos dengan mode fix hidup.
    expect(() =>
      assertServerEnvForStartup(baseConfig({ appEnv: 'prod' }), [], 'production'),
    ).toThrow(ServerEnvError)

    const fixed = resolveServerEnv(baseConfig({ appEnv: 'staging' }))
    expect(fixed.fixedOtpEnabled).toBe(true)
    expect(() => assertFixedOtpNotInProduction(fixed, 'production')).toThrow(FixedOtpOverrideError)
  })

  it('NODE_ENV non-production tetap boleh menjalankan mode fix (dev/e2e), dan production aman', () => {
    for (const nodeEnv of ['development', 'test', undefined, '', 'TEST']) {
      expect(() =>
        assertServerEnvForStartup(baseConfig({ appEnv: 'staging' }), [], nodeEnv),
      ).not.toThrow()
    }

    // Production dengan label yang benar: mode fix mati, jadi tidak ada yang perlu ditolak.
    expect(() =>
      assertServerEnvForStartup(
        baseConfig({ appEnv: 'production', ...PRODUCTION_MAIL }),
        [],
        'production',
      ),
    ).not.toThrow()
  })

  it('pesan penolakan hanya menyebut NAMA variabel, tidak pernah nilainya (M3)', () => {
    try {
      assertServerEnvForStartup(baseConfig({ appEnv: 'staging' }), [], 'production')
      expect.unreachable('kombinasi NODE_ENV=production + mode fix harus ditolak')
    } catch (error) {
      expect(error).toBeInstanceOf(FixedOtpOverrideError)
      if (error instanceof FixedOtpOverrideError) {
        expect(error.fields.join(',')).toContain('NODE_ENV')
        expect(error.message).not.toContain(TEST_OTP_PEPPER)
        expect(error.message).not.toContain(TEST_RATE_LIMIT_PEPPER)
      }
    }
  })
})
