// @vitest-environment node
//
// OTP (T19). Level SERVICE terhadap Postgres nyata: sifat "sekali pakai" hanya bisa dibuktikan kalau
// `UPDATE ... WHERE consumed_at IS NULL RETURNING` benar-benar dieksekusi dua kali paralel oleh
// database, jadi tidak ada mock DB di sini.
import { OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_SECONDS } from '@improve-personal/contracts'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { createOtpMailer, noopOtpMailer } from '../services/mailer'
import { escapeHtml } from '../services/email-layout'
import { renderOtpEmail } from '../services/otp-email'
import { FIXED_OTP_CODE, OTP_MAX_ATTEMPTS, requestOtp, verifyOtp } from '../services/otp'
import { consumeRateLimit, RATE_LIMIT_RULES } from '../services/rate-limit'
import { ApiProblem } from '../utils/api-error'
import { hmacSha256 } from '../utils/crypto'
import { otpChallenges, rateLimits, users } from '../db/schema'
import {
  closeTestDb,
  FIXED_NOW,
  makeEnv,
  otpChallengeCount,
  rateLimitCount,
  testDb,
  type Fixture,
} from './helpers/harness'
import { captureProblem, settledOutcomes, testScope } from './helpers/scope'

const scope = testScope()

/** Berapa challenge yang sudah dikonsumsi (`consumed_at` terisi) untuk satu email. */
async function consumedChallengeCount(fixture: Fixture): Promise<number> {
  const rows = await fixture
    .ctx()
    .db.select({ consumedAt: otpChallenges.consumedAt })
    .from(otpChallenges)
    .where(eq(otpChallenges.emailHash, hmacSha256(fixture.email, fixture.env.otpPepper)))

  return rows.filter((row) => row.consumedAt !== null).length
}

async function countUsers(email: string): Promise<number> {
  const rows = await testDb().select({ id: users.id }).from(users).where(eq(users.email, email))
  return rows.length
}

afterEach(async () => {
  await scope.dispose()
})

afterAll(async () => {
  await closeTestDb()
})

describe('requestOtp', () => {
  it('kode fix non-production: mailer tetap dipanggil dengan kode 777777, dan rate limit tetap jalan', async () => {
    const fixture = scope.fixture({ prefix: 'otp-request' })
    const ctx = fixture.ctx()

    await requestOtp(ctx, {
      email: fixture.email,
      purpose: 'login',
      mailer: fixture.mailer.mailer,
    })

    expect(fixture.mailer.mails).toHaveLength(1)
    expect(fixture.mailer.mails.at(0)).toMatchObject({ to: fixture.email, code: FIXED_OTP_CODE })
    expect(await otpChallengeCount(fixture.env, fixture.email)).toBe(1)
    // Rate limit dijalankan di DB, bukan "dianggap ada": barisnya benar-benar terbentuk.
    expect(
      await rateLimitCount(
        fixture.env,
        `email:${hmacSha256(fixture.email, fixture.env.otpPepper)}`,
      ),
    ).toBe(1)
  })

  it('permintaan kode tidak membuat akun - jadi tidak ada oracle "email terdaftar" dari tabel users', async () => {
    const fixture = scope.fixture({ prefix: 'otp-nouser' })

    await requestOtp(fixture.ctx(), {
      email: fixture.email,
      purpose: 'login',
      mailer: fixture.mailer.mailer,
    })

    expect(await countUsers(fixture.email)).toBe(0)
    expect(await otpChallengeCount(fixture.env, fixture.email)).toBe(1)
  })

  it('cooldown kirim ulang: kode baru tidak dibuat & email tidak dikirim dalam 30 detik', async () => {
    const fixture = scope.fixture({ prefix: 'otp-cooldown' })
    const ctx = fixture.ctx()
    const input = { email: fixture.email, purpose: 'login' as const, mailer: fixture.mailer.mailer }

    await requestOtp(ctx, input)
    await requestOtp(ctx, input)

    expect(fixture.mailer.mails).toHaveLength(1)
    expect(await otpChallengeCount(fixture.env, fixture.email)).toBe(1)

    const afterCooldown = fixture.ctxAt(
      new Date(FIXED_NOW.getTime() + (OTP_RESEND_COOLDOWN_SECONDS + 1) * 1000),
    )
    await requestOtp(afterCooldown, input)

    expect(fixture.mailer.mails).toHaveLength(2)
    expect(await otpChallengeCount(fixture.env, fixture.email)).toBe(2)
  })

  it('email tidak pernah disimpan polos di `otp_challenges`', async () => {
    const fixture = scope.fixture({ prefix: 'otp-pii' })

    await requestOtp(fixture.ctx(), {
      email: fixture.email,
      purpose: 'login',
      mailer: fixture.mailer.mailer,
    })

    const rows = await fixture.ctx().db.select().from(otpChallenges)
    expect(JSON.stringify(rows)).not.toContain(fixture.email)
    expect(rows.some((row) => row.emailHash.includes('@'))).toBe(false)
  })
})

describe('verifyOtp', () => {
  it('sekali pakai secara ATOMIK: dua verify paralel dengan kode sama -> tepat satu sukses', async () => {
    const fixture = scope.fixture({ prefix: 'otp-atomic' })
    const code = FIXED_OTP_CODE

    await requestOtp(fixture.ctx(), {
      email: fixture.email,
      purpose: 'login',
      mailer: fixture.mailer.mailer,
    })

    const results = await Promise.allSettled([
      verifyOtp(fixture.ctx(), { email: fixture.email, code, purpose: 'login' }),
      verifyOtp(fixture.ctx(), { email: fixture.email, code, purpose: 'login' }),
    ])

    const outcomes = settledOutcomes(results)
    expect(outcomes.filter((outcome) => outcome === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome === 'rejected')).toHaveLength(1)

    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected).toMatchObject({ reason: expect.objectContaining({ code: 'OTP_INVALID' }) })

    // Bukti di DB: challenge dikonsumsi tepat sekali (yang kalah kalah pada `WHERE consumed_at IS NULL`).
    expect(await consumedChallengeCount(fixture)).toBe(1)
    // Dan hanya satu akun yang dibuat, bukan dua.
    expect(await countUsers(fixture.email)).toBe(1)
  })

  it('kode yang sama setelah dikonsumsi ditolak (sekali pakai, bukan sekali pakai-per-detak)', async () => {
    const fixture = scope.fixture({ prefix: 'otp-reuse' })

    await requestOtp(fixture.ctx(), {
      email: fixture.email,
      purpose: 'login',
      mailer: fixture.mailer.mailer,
    })

    await expect(
      verifyOtp(fixture.ctx(), { email: fixture.email, code: FIXED_OTP_CODE, purpose: 'login' }),
    ).resolves.toMatchObject({ userId: expect.any(String) })

    const reuse = await captureProblem(
      verifyOtp(fixture.ctx(), { email: fixture.email, code: FIXED_OTP_CODE, purpose: 'login' }),
    )
    expect(reuse?.code).toBe('OTP_INVALID')
  })

  it('tanpa challenge sama sekali -> OTP_INVALID (bukan 500, bukan sukses)', async () => {
    const fixture = scope.fixture({ prefix: 'otp-missing' })

    const problem = await captureProblem(
      verifyOtp(fixture.ctx(), {
        email: fixture.email,
        code: FIXED_OTP_CODE,
        purpose: 'login',
      }),
    )

    expect(problem).toMatchObject({ code: 'OTP_INVALID', statusCode: 400 })
  })

  it('kedaluwarsa melewati TTL ditolak `OTP_EXPIRED`; satu detik sebelum TTL masih diterima', async () => {
    const fixture = scope.fixture({ prefix: 'otp-expiry' })

    await requestOtp(fixture.ctx(), {
      email: fixture.email,
      purpose: 'login',
      mailer: fixture.mailer.mailer,
    })

    const justExpired = fixture.ctxAt(new Date(FIXED_NOW.getTime() + (OTP_TTL_SECONDS + 1) * 1000))
    const expired = await captureProblem(
      verifyOtp(justExpired, { email: fixture.email, code: FIXED_OTP_CODE, purpose: 'login' }),
    )
    expect(expired?.code).toBe('OTP_EXPIRED')

    const stillValid = fixture.ctxAt(new Date(FIXED_NOW.getTime() + (OTP_TTL_SECONDS - 1) * 1000))
    const accepted = await captureProblem(
      verifyOtp(stillValid, { email: fixture.email, code: FIXED_OTP_CODE, purpose: 'login' }),
    )
    expect(accepted).toBeNull()
  })

  it(`batas ${OTP_MAX_ATTEMPTS} percobaan salah ditegakkan: kode benar setelahnya pun ditolak`, async () => {
    const fixture = scope.fixture({ prefix: 'otp-attempts' })

    await requestOtp(fixture.ctx(), {
      email: fixture.email,
      purpose: 'login',
      mailer: fixture.mailer.mailer,
    })

    for (let attempt = 0; attempt < OTP_MAX_ATTEMPTS; attempt += 1) {
      const problem = await captureProblem(
        verifyOtp(fixture.ctx(), { email: fixture.email, code: '000000', purpose: 'login' }),
      )
      expect(problem?.code).toBe('OTP_INVALID')
    }

    const rows = await fixture
      .ctx()
      .db.select({ attempts: otpChallenges.attempts })
      .from(otpChallenges)
      .where(eq(otpChallenges.emailHash, hmacSha256(fixture.email, fixture.env.otpPepper)))
    expect(rows.at(0)?.attempts).toBe(OTP_MAX_ATTEMPTS)

    const afterLimit = await captureProblem(
      verifyOtp(fixture.ctx(), { email: fixture.email, code: FIXED_OTP_CODE, purpose: 'login' }),
    )
    expect(afterLimit?.code).toBe('OTP_INVALID')
  })

  it('kode untuk purpose lain tidak bisa dipakai (purpose ditentukan endpoint, bukan klien)', async () => {
    const fixture = scope.fixture({ prefix: 'otp-purpose' })

    await requestOtp(fixture.ctx(), {
      email: fixture.email,
      purpose: 'delete_account',
      mailer: fixture.mailer.mailer,
    })

    const problem = await captureProblem(
      verifyOtp(fixture.ctx(), { email: fixture.email, code: FIXED_OTP_CODE, purpose: 'login' }),
    )
    expect(problem?.code).toBe('OTP_INVALID')
  })
})

describe('kode OTP tidak pernah bocor ke log (security.md §11)', () => {
  it('tidak ada satu baris log pun selama alur minta + verifikasi OTP', async () => {
    const captured: unknown[] = []
    const spies = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
      vi.spyOn(console, 'debug'),
    ]
    for (const spy of spies) {
      spy.mockImplementation((...args: unknown[]) => {
        captured.push(...args)
      })
    }

    try {
      const fixture = scope.fixture({ prefix: 'otp-log' })

      await requestOtp(fixture.ctx(), {
        email: fixture.email,
        purpose: 'login',
        mailer: fixture.mailer.mailer,
      })

      // Jalur gagal (kode salah) juga tidak boleh mencatat kode - di sini kodenya `000000` yang salah,
      // dan kode sahnya `FIXED_OTP_CODE`.
      const problem = await captureProblem(
        verifyOtp(fixture.ctx(), { email: fixture.email, code: '000000', purpose: 'login' }),
      )
      expect(problem?.code).toBe('OTP_INVALID')

      const flat = JSON.stringify(captured)
      expect(flat).not.toContain('000000')
      expect(flat).not.toContain(FIXED_OTP_CODE)
      expect(flat).not.toContain(fixture.email)
      expect(captured).toEqual([])
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })
})

describe('rate limit OTP di Postgres (bukan in-memory)', () => {
  it('penghitung tersimpan sebagai baris `rate_limits` dengan window yang dibulatkan', async () => {
    const fixture = scope.fixture({ prefix: 'rl-otp' })
    const ctx = fixture.ctx()
    const identifier = `email:${hmacSha256(fixture.email, ctx.env.otpPepper)}`
    const windowMs = RATE_LIMIT_RULES['otp:email'].windowSeconds * 1000

    await consumeRateLimit(ctx, 'otp:email', identifier)

    const rows = await ctx.db
      .select()
      .from(rateLimits)
      .where(eq(rateLimits.bucket, hmacSha256(identifier, ctx.env.rateLimitPepper)))

    expect(rows).toHaveLength(1)
    expect(rows.at(0)?.scope).toBe('otp:email')
    expect(rows.at(0)?.count).toBe(1)
    expect((rows.at(0)?.windowStart.getTime() ?? Number.NaN) % windowMs).toBe(0)
    // Identifier tidak disimpan polos: bucket-nya HMAC, bukan email.
    expect(JSON.stringify(rows)).not.toContain(fixture.email)
    expect(await rateLimitCount(fixture.env, identifier)).toBe(1)
  })

  it('jatah habis -> RATE_LIMITED (429) dengan Retry-After, dan penghitung di DB ikut naik', async () => {
    const fixture = scope.fixture({ prefix: 'rl-exhaust' })
    const ctx = fixture.ctx()
    const identifier = `email:${hmacSha256(fixture.email, ctx.env.otpPepper)}`
    const limit = RATE_LIMIT_RULES['otp:email'].limit

    for (let attempt = 0; attempt < limit; attempt += 1) {
      await consumeRateLimit(ctx, 'otp:email', identifier)
    }

    let problem: ApiProblem | null = null
    try {
      await consumeRateLimit(ctx, 'otp:email', identifier)
    } catch (error) {
      if (!(error instanceof ApiProblem)) throw error
      problem = error
    }

    expect(problem?.code).toBe('RATE_LIMITED')
    expect(problem?.statusCode).toBe(429)
    expect(problem?.headers?.['retry-after']).toMatch(/^[0-9]+$/)
    expect(await rateLimitCount(fixture.env, identifier)).toBe(limit + 1)
  })

  it('window terpisah dihitung terpisah (bukan satu penghitung abadi)', async () => {
    const fixture = scope.fixture({ prefix: 'rl-window' })
    const identifier = `email:${hmacSha256(fixture.email, fixture.env.otpPepper)}`
    const windowMs = RATE_LIMIT_RULES['otp:email'].windowSeconds * 1000

    await consumeRateLimit(fixture.ctx(), 'otp:email', identifier)
    await consumeRateLimit(
      fixture.ctxAt(new Date(FIXED_NOW.getTime() + windowMs)),
      'otp:email',
      identifier,
    )

    const rows = await fixture
      .ctx()
      .db.select()
      .from(rateLimits)
      .where(eq(rateLimits.bucket, hmacSha256(identifier, fixture.env.rateLimitPepper)))

    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.count === 1)).toBe(true)
  })
})

describe('requestOtp saat transport email AKTIF (non-production + `NUXT_SMTP_URL`)', () => {
  /**
   * AC T19 yang diuji di sini adalah KETERKAITAN-nya, bukan dua perilaku terpisah: `isFixedOtpEnabled`
   * mematikan mode fix begitu transport ada, dan `requestOtp` harus ikut menghasilkan kode acak -
   * kalau tidak, email berisi kode acak sementara yang diterima server tetap `777777` (atau
   * sebaliknya), dan login tidak pernah selesai.
   *
   * Transport-nya disuntik (`fixture.mailer`), jadi test ini tidak menyentuh Mailpit/SMTP mana pun -
   * yang dibuktikan adalah kode yang DIPILIH dan DISIMPAN, bukan pengiriman jaringannya.
   */
  it('yang dipakai kode 6 digit acak (bukan 777777), disimpan sebagai hash kode itu, dan tetap bisa ditukar', async () => {
    const fixture = scope.fixture({
      prefix: 'otp-smtp-random',
      env: makeEnv({
        appEnv: 'development',
        smtpUrl: 'smtp://127.0.0.1:1025',
        mailFrom: 'Improve Personal <no-reply@local.test>',
      }),
    })
    const ctx = fixture.ctx()

    // Prasyarat: transport terisi = mode fix mati.
    expect(ctx.env.fixedOtpEnabled).toBe(false)

    await requestOtp(ctx, {
      email: fixture.email,
      purpose: 'login',
      mailer: fixture.mailer.mailer,
    })

    const mail = fixture.mailer.mails.at(0)
    expect(mail?.code).toMatch(/^[0-9]{6}$/)

    const rows = await ctx.db
      .select()
      .from(otpChallenges)
      .where(eq(otpChallenges.emailHash, hmacSha256(fixture.email, ctx.env.otpPepper)))
    expect(rows).toHaveLength(1)
    // Yang disimpan adalah hash dari kode yang DIKIRIM - bukan kode fix.
    expect(rows.at(0)?.codeHash).toBe(hmacSha256(mail?.code ?? '', ctx.env.otpPepper))

    // Peluang kode acak kebetulan `777777` adalah 1 dari 10^6; kalau itu terjadi, test ini tidak boleh
    // menyesatkan dengan mengklaim kode fix ditolak.
    if (mail?.code !== FIXED_OTP_CODE) {
      const fixedRejected = await captureProblem(
        verifyOtp(ctx, { email: fixture.email, code: FIXED_OTP_CODE, purpose: 'login' }),
      )
      expect(fixedRejected?.code).toBe('OTP_INVALID')
    }

    // Dan kode yang benar-benar dikirim tetap lolos - jalur verifikasi tidak ikut berubah.
    const accepted = await captureProblem(
      verifyOtp(ctx, { email: fixture.email, code: mail?.code ?? '', purpose: 'login' }),
    )
    expect(accepted).toBeNull()
  })

  it('rate limit per email tetap dihitung walau transport email aktif', async () => {
    const fixture = scope.fixture({
      prefix: 'otp-smtp-rate-limit',
      env: makeEnv({
        appEnv: 'staging',
        smtpUrl: 'smtp://127.0.0.1:1025',
        mailFrom: 'qa@improve-personal.test',
      }),
    })

    await requestOtp(fixture.ctx(), {
      email: fixture.email,
      purpose: 'login',
      mailer: fixture.mailer.mailer,
    })

    const identifier = `email:${hmacSha256(fixture.email, fixture.env.otpPepper)}`
    expect(await rateLimitCount(fixture.env, identifier)).toBe(1)
  })
})

describe('pemilihan mailer (batas keluar email: Resend / SMTP - tidak ada yang menyentuh jaringan)', () => {
  it('non-production TANPA transport: email tidak dikirim - mailer-nya no-op, tanpa jalur jaringan sama sekali', async () => {
    const mailer = createOtpMailer(makeEnv({ appEnv: 'test' }))

    expect(mailer).toBe(noopOtpMailer)
    await expect(
      mailer.sendOtp({ to: 'qa@qa.test', code: FIXED_OTP_CODE, purpose: 'login' }),
    ).resolves.toBeUndefined()
  })

  it('non-production + `NUXT_SMTP_URL`: email BENAR-BENAR dikirim, dan kode fix mati di env itu', async () => {
    const sent: Array<{ from: string; to: string; subject: string; text: string; html: string }> =
      []
    const env = makeEnv({
      appEnv: 'development',
      smtpUrl: 'smtp://127.0.0.1:1025',
      mailFrom: 'Improve Personal <no-reply@local.test>',
    })

    const mailer = createOtpMailer(env, {
      smtpSend: async (message) => {
        sent.push(message)
      },
    })

    expect(mailer).not.toBe(noopOtpMailer)

    await mailer.sendOtp({ to: 'qa@qa.test', code: '123456', purpose: 'login' })

    expect(sent).toHaveLength(1)
    expect(sent.at(0)).toMatchObject({
      from: 'Improve Personal <no-reply@local.test>',
      to: 'qa@qa.test',
    })
    expect(sent.at(0)?.subject.length ?? 0).toBeGreaterThan(0)
    expect(sent.at(0)?.text).toContain('123456')
    // Jalur SMTP juga mengirim HTML, bukan cuma teks polos: Mailpit/staging harus menampilkan
    // kartu yang sama dengan production (Resend).
    expect(sent.at(0)?.html).toContain('123456')
    expect(sent.at(0)?.html).toContain('<!DOCTYPE html>')

    // Keterkaitan yang mudah terlewat: begitu transport ada, `fixedOtpEnabled` HARUS false. Kalau
    // tetap true, `requestOtp` akan mengirim kode fix sementara `verifyOtp` membandingkan dengan kode
    // yang benar-benar dikirim - dua-duanya sepakat di `777777`, tapi user yang membaca inbox-nya
    // melihat kode random dan login tidak pernah bisa selesai.
    expect(env.fixedOtpEnabled).toBe(false)
  })

  it('subject mengikuti purpose, jadi kode hapus akun tidak tertukar dengan kode login', async () => {
    const sent: Array<{ subject: string; text: string; html: string }> = []
    const mailer = createOtpMailer(
      makeEnv({
        appEnv: 'staging',
        smtpUrl: 'smtp://127.0.0.1:1025',
        mailFrom: 'qa@improve-personal.test',
      }),
      {
        smtpSend: async (message) => {
          sent.push(message)
        },
      },
    )

    await mailer.sendOtp({ to: 'qa@qa.test', code: '111111', purpose: 'login' })
    await mailer.sendOtp({ to: 'qa@qa.test', code: '222222', purpose: 'delete_account' })

    expect(sent).toHaveLength(2)
    expect(sent[0]?.subject).not.toBe(sent[1]?.subject)
    expect(sent[0]?.text).toContain('111111')
    expect(sent[1]?.text).toContain('222222')
  })

  it('production: kode benar-benar dikirim lewat Resend (fetch disuntik, tidak menyentuh jaringan)', async () => {
    const calls: Array<{ url: string; body: string; authorization: string }> = []
    const mailer = createOtpMailer(
      makeEnv({
        appEnv: 'production',
        resendApiKey: 'qa-resend-key',
        mailFrom: 'qa@improve-personal.test',
      }),
      {
        fetchImpl: async (url: string, init: RequestInit) => {
          calls.push({
            url: String(url),
            body: String(init.body),
            authorization: String((init.headers as Record<string, string>)['authorization']),
          })

          return new Response('{}', { status: 200 })
        },
      },
    )

    await mailer.sendOtp({ to: 'qa@qa.test', code: '123456', purpose: 'login' })

    expect(calls).toHaveLength(1)
    expect(calls.at(0)?.url).toBe('https://api.resend.com/emails')
    expect(calls.at(0)?.authorization).toBe('Bearer qa-resend-key')

    const body = JSON.parse(calls.at(0)?.body ?? '{}') as {
      text?: string
      html?: string
      subject?: string
    }
    // `text` tetap ada sebagai fallback, dan `html` tidak menggantikannya.
    expect(body.text).toContain('123456')
    expect(body.html).toContain('123456')
    // Struktur layout benar-benar terkirim, bukan cuma kode di dalam <pre>.
    expect(body.html).toContain('Improve')
    expect(body.html).toContain('Courier New')
    expect(body.html).toContain('KODE MASUK · SEKALI PAKAI')
    expect(body.html).toMatch(/<html[\s>]/)
    expect(body.subject?.length ?? 0).toBeGreaterThan(0)
  })
})

describe('template email OTP (HTML): layout reusable, copy per purpose, escaping', () => {
  it(`durasi berlaku dihitung dari OTP_TTL_SECONDS (${OTP_TTL_SECONDS} detik), bukan angka hardcode`, () => {
    const email = renderOtpEmail({ code: '482913', purpose: 'login' })

    expect(email.html).toContain(`${OTP_TTL_SECONDS / 60} menit`)
    expect(email.text).toContain(`${OTP_TTL_SECONDS / 60} menit`)
  })

  it('durasi ikut parameter `ttlSeconds`, jadi tidak ada "10 menit" yang ditempel manual', () => {
    const tigaMenit = renderOtpEmail({ code: '482913', purpose: 'login', ttlSeconds: 180 })
    expect(tigaMenit.html).toContain('3 menit')
    expect(tigaMenit.html).not.toContain('10 menit')
    expect(tigaMenit.text).toContain('3 menit')

    // Detik yang tidak bulat ke menit tetap dilaporkan jujur, bukan dibulatkan ke atas.
    const sembilanPuluhDetik = renderOtpEmail({ code: '482913', purpose: 'login', ttlSeconds: 90 })
    expect(sembilanPuluhDetik.html).toContain('90 detik')
  })

  it('kedua purpose memakai layout yang sama (brand + footer) tapi copy tidak tertukar', () => {
    const login = renderOtpEmail({ code: '111111', purpose: 'login' })
    const deletion = renderOtpEmail({ code: '222222', purpose: 'delete_account' })

    for (const email of [login, deletion]) {
      expect(email.html).toContain('<!DOCTYPE html>')
      expect(email.html).toContain('>ip</td>')
      expect(email.html).toContain('Improve')
      expect(email.html).toContain('Personal')
      expect(email.html).toContain('border:3px dashed')
      expect(email.html).toContain('user-select:all')
      expect(email.html).toContain('Email otomatis karena')
      expect(email.html).toContain('Jakarta, Indonesia')
      expect(email.html).toContain('<!--[if mso]>')
      expect(email.html).toContain('prefers-color-scheme:dark')
      expect(email.html).toContain('max-width:620px')
      expect(email.html).toContain('mailto:halo@improvepersonal.app')
    }

    expect(login.html).toContain('KODE MASUK · SEKALI PAKAI')
    expect(login.html).not.toContain('KONFIRMASI HAPUS AKUN')
    expect(login.html).toContain('Nggak merasa minta kode')
    expect(login.html).not.toContain('Nggak merasa minta hapus akun')

    expect(deletion.html).toContain('KONFIRMASI HAPUS AKUN · SEKALI PAKAI')
    expect(deletion.html).not.toContain('KODE MASUK · SEKALI PAKAI')
    expect(deletion.html).toContain('Nggak merasa minta hapus akun')
    expect(deletion.html).not.toContain('Nggak merasa minta kode')

    // Kode masing-masing hanya ada di emailnya sendiri - tidak ada template yang tertukar.
    expect(login.html).toContain('111111')
    expect(login.html).not.toContain('222222')
    expect(deletion.html).toContain('222222')
    expect(deletion.html).not.toContain('111111')

    expect(login.subject).not.toBe(deletion.subject)
  })

  it('nilai dinamis di-escape: kode bertanda HTML tidak lolos jadi markup', () => {
    const email = renderOtpEmail({ code: '<script>&', purpose: 'login' })

    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;&amp;')
    // Teks polos sengaja apa adanya - escaping hanya urusan HTML.
    expect(email.text).toContain('<script>&')
  })

  it('escapeHtml menutup semua karakter yang bisa memutus struktur email', () => {
    expect(escapeHtml(`<b>"x"&'y'</b>`)).toBe('&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;')
    // `&` di-escape SEKALI; kalau dobel, user membaca `&amp;lt;` di inbox.
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })
})
