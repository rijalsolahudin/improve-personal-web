import { describe, expect, it } from 'vitest'

import {
  CLIENT_KINDS,
  clientKindSchema,
  currentSessionResultSchema,
  deviceInfoSchema,
  emailSchema,
  googleCallbackQuerySchema,
  googleStartQuerySchema,
  googleStartResultSchema,
  mobileSessionDtoSchema,
  otpCodeSchema,
  otpRequestInputSchema,
  otpVerifyInputSchema,
  sessionDtoSchema,
  webSessionDtoSchema,
} from './auth.ts'

const DEVICE = { name: 'HP Bayu', platform: 'android' } as const

const SESSION_BASE = {
  user: { id: '018fabc1-def2-7abc-8def-0123456789ab', email: 'bayu@example.com' },
  device: { id: '018fabc1-def2-7abc-8def-0123456789ac', name: 'HP Bayu' },
  expiresAt: '2024-01-02T03:04:05.678Z',
} as const

describe('emailSchema', () => {
  it('menormalkan trim + lowercase supaya satu akun tidak jadi dua', () => {
    expect(emailSchema.parse('  Budi@Example.COM ')).toBe('budi@example.com')
  })

  it('menolak email tanpa @, domain tanpa titik, dan yang terlalu panjang', () => {
    expect(emailSchema.safeParse('budi').success).toBe(false)
    expect(emailSchema.safeParse('budi@localhost').success).toBe(false)
    expect(emailSchema.safeParse(`${'a'.repeat(250)}@example.com`).success).toBe(false)
  })
})

describe('deviceInfoSchema', () => {
  it('menerima nama + platform yang sah, dan men-trim namanya', () => {
    expect(deviceInfoSchema.parse({ name: '  HP Bayu  ', platform: 'ios' })).toEqual({
      name: 'HP Bayu',
      platform: 'ios',
    })
  })

  it('menolak nama kosong, nama kepanjangan, dan platform di luar enum', () => {
    expect(deviceInfoSchema.safeParse({ name: '   ', platform: 'web' }).success).toBe(false)
    expect(deviceInfoSchema.safeParse({ name: 'x'.repeat(65), platform: 'web' }).success).toBe(
      false,
    )
    expect(deviceInfoSchema.safeParse({ name: 'HP', platform: 'linux' }).success).toBe(false)
  })

  it('menolak nama yang memuat karakter kontrol (ikut masuk log server)', () => {
    expect(deviceInfoSchema.safeParse({ name: 'HP\npalsu', platform: 'web' }).success).toBe(false)
  })

  it('menolak field asing (cegah mass assignment)', () => {
    expect(deviceInfoSchema.safeParse({ name: 'HP', platform: 'web', isAdmin: true }).success).toBe(
      false,
    )
  })

  it('installationId opsional: menerima UUID dan menolak nilai yang bukan UUID', () => {
    const installationId = '018fabc1-def2-7abc-8def-0123456789ab'

    // Ada: diteruskan apa adanya (server memakainya untuk memilih baris `devices`).
    expect(
      deviceInfoSchema.parse({ name: 'HP Bayu', platform: 'android', installationId }),
    ).toEqual({
      name: 'HP Bayu',
      platform: 'android',
      installationId,
    })
    // Tidak ada: tetap sah - build lama belum mengirim field ini dan harus tetap bisa login.
    expect(deviceInfoSchema.safeParse({ name: 'HP Bayu', platform: 'android' }).success).toBe(true)
    // Nilai asal-asalan ditolak, bukan diabaikan diam-diam: kalau lolos, semua instalasi akan
    // tampak identik dan bug "login di perangkat lain mematikan sesi" kembali.
    expect(
      deviceInfoSchema.safeParse({ name: 'HP', platform: 'web', installationId: 'bukan-uuid' })
        .success,
    ).toBe(false)
    expect(
      deviceInfoSchema.safeParse({ name: 'HP', platform: 'web', installationId: null }).success,
    ).toBe(false)
  })

  it('installationId ikut di body OTP request/verify (satu sumber schema, bukan duplikat)', () => {
    const installationId = '018fabc1-def2-7abc-8def-0123456789ab'
    const device = { name: 'HP Bayu', platform: 'android', installationId } as const

    expect(
      otpRequestInputSchema.safeParse({ email: 'budi@example.com', client: 'mobile', device })
        .success,
    ).toBe(true)
    expect(
      otpVerifyInputSchema.safeParse({
        email: 'budi@example.com',
        code: '000123',
        client: 'mobile',
        device,
      }).success,
    ).toBe(true)
  })
})

describe('otpCodeSchema', () => {
  it('menerima tepat 6 digit sebagai string (nol di depan tetap utuh)', () => {
    expect(otpCodeSchema.parse('000123')).toBe('000123')
    expect(otpCodeSchema.parse('123456')).toBe('123456')
  })

  it('menolak 5 digit, 7 digit, huruf, dan spasi', () => {
    for (const invalid of ['12345', '1234567', 'abcdef', '12345 ', ' 123456', '123 56']) {
      expect(otpCodeSchema.safeParse(invalid).success, `harus ditolak: "${invalid}"`).toBe(false)
    }
  })
})

describe('otpRequestInputSchema / otpVerifyInputSchema', () => {
  it('menerima request yang lengkap', () => {
    expect(
      otpRequestInputSchema.safeParse({
        email: 'budi@example.com',
        client: 'web',
        device: DEVICE,
      }).success,
    ).toBe(true)

    expect(
      otpVerifyInputSchema.safeParse({
        email: '  Budi@Example.com',
        code: '777777',
        client: 'mobile',
        device: DEVICE,
      }).success,
    ).toBe(true)
  })

  it('menolak client di luar web/mobile dan field identitas di body', () => {
    expect(
      otpRequestInputSchema.safeParse({ email: 'a@b.com', client: 'desktop', device: DEVICE })
        .success,
    ).toBe(false)

    // `user_id` DILARANG ada di body: identitas selalu dari sesi (ARCHITECTURE.md §8).
    expect(
      otpRequestInputSchema.safeParse({
        email: 'a@b.com',
        client: 'web',
        device: DEVICE,
        userId: '018fabc1-def2-7abc-8def-0123456789ab',
      }).success,
    ).toBe(false)
  })

  it('menolak request tanpa device atau tanpa kode', () => {
    expect(otpRequestInputSchema.safeParse({ email: 'a@b.com', client: 'web' }).success).toBe(false)
    expect(
      otpVerifyInputSchema.safeParse({ email: 'a@b.com', client: 'web', device: DEVICE }).success,
    ).toBe(false)
  })
})

describe('clientKindSchema', () => {
  it('hanya web dan mobile', () => {
    expect([...CLIENT_KINDS]).toEqual(['web', 'mobile'])
    expect(clientKindSchema.safeParse('web').success).toBe(true)
    expect(clientKindSchema.safeParse('mobile').success).toBe(true)
    expect(clientKindSchema.safeParse('desktop').success).toBe(false)
  })
})

describe('Google OAuth', () => {
  it('start: client menentukan redirect URI di server, client TIDAK mengirim redirectUri', () => {
    expect(googleStartQuerySchema.parse({ client: 'mobile' })).toEqual({ client: 'mobile' })
    expect(googleStartQuerySchema.safeParse({ client: 'web' }).success).toBe(true)

    // Kalau redirectUri diterima dari client, endpoint ini jadi open redirect.
    expect(
      googleStartQuerySchema.safeParse({ client: 'web', redirectUri: 'https://jahat.example' })
        .success,
    ).toBe(false)
  })

  it('start: installationId opsional diterima, tapi schema TETAP strict untuk field lain', () => {
    const installationId = '018fabc1-def2-7abc-8def-0123456789ab'

    // Ada: diteruskan apa adanya (server menyimpannya di baris `oauth_states`).
    expect(googleStartQuerySchema.parse({ client: 'web', installationId })).toEqual({
      client: 'web',
      installationId,
    })
    // Tidak ada: tetap sah - build lama/mobile belum mengirim field ini dan harus tetap bisa login.
    expect(googleStartQuerySchema.parse({ client: 'mobile' })).toEqual({ client: 'mobile' })
    // Nilai asal-asalan ditolak, bukan diabaikan: kalau lolos, semua instalasi tampak identik dan
    // bug "login di perangkat lain mematikan sesi" kembali di jalur Google.
    expect(
      googleStartQuerySchema.safeParse({ client: 'web', installationId: 'bukan-uuid' }).success,
    ).toBe(false)
    expect(googleStartQuerySchema.safeParse({ client: 'web', installationId: null }).success).toBe(
      false,
    )

    // `installationId` diterima BUKAN berarti kontraknya melebar: field asing - terutama yang bisa
    // membelokkan tujuan/identitas flow - tetap ditolak.
    for (const extra of [
      { redirectUri: 'https://jahat.example' },
      { redirect_uri: 'https://jahat.example' },
      { state: 'state-dari-luar' },
      { code: 'code-dari-luar' },
      { device: DEVICE },
    ]) {
      expect(
        googleStartQuerySchema.safeParse({ client: 'web', installationId, ...extra }).success,
        `harus ditolak: ${JSON.stringify(extra)}`,
      ).toBe(false)
    }
  })

  it('hasil start (mobile): authorizationUrl + expiresAt, tanpa token', () => {
    expect(
      googleStartResultSchema.safeParse({
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=y',
        expiresAt: '2024-01-02T03:04:05.678Z',
      }).success,
    ).toBe(true)
  })

  it('hasil start: menolak URL tidak valid, expiresAt bukan ISO, dan token yang diselundupkan', () => {
    expect(
      googleStartResultSchema.safeParse({ authorizationUrl: 'bukan-url', expiresAt: 'x' }).success,
    ).toBe(false)
    // URL non-https ditolak (schema-nya khusus URL https absolut Google).
    expect(
      googleStartResultSchema.safeParse({
        authorizationUrl: 'http://accounts.google.com/o',
        expiresAt: '2024-01-02T03:04:05.678Z',
      }).success,
    ).toBe(false)
    expect(
      googleStartResultSchema.safeParse({
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        expiresAt: '2024-01-02T03:04:05.678Z',
        token: 'x'.repeat(43),
      }).success,
    ).toBe(false)
  })

  it('callback: code + state wajib', () => {
    expect(googleCallbackQuerySchema.parse({ code: 'abc', state: 'xyz' })).toEqual({
      code: 'abc',
      state: 'xyz',
    })
    expect(googleCallbackQuerySchema.safeParse({ code: 'abc' }).success).toBe(false)
    expect(googleCallbackQuerySchema.safeParse({ state: 'xyz' }).success).toBe(false)
    expect(googleCallbackQuerySchema.safeParse({ code: '', state: 'xyz' }).success).toBe(false)
  })

  it('callback: param tambahan dari Google ditoleransi, field asing tetap ditolak', () => {
    expect(
      googleCallbackQuerySchema.safeParse({
        code: 'abc',
        state: 'xyz',
        scope: 'email profile',
        authuser: '0',
        prompt: 'consent',
        hd: 'example.com',
      }).success,
    ).toBe(true)

    expect(
      googleCallbackQuerySchema.safeParse({ code: 'abc', state: 'xyz', redirect_uri: 'https://x' })
        .success,
    ).toBe(false)
  })
})

describe('sessionDtoSchema', () => {
  it('web: tanpa token (web pakai cookie HttpOnly)', () => {
    expect(webSessionDtoSchema.safeParse({ ...SESSION_BASE, client: 'web' }).success).toBe(true)

    // Token di body web = token yang bisa dicuri XSS, jadi harus ditolak.
    expect(
      sessionDtoSchema.safeParse({ ...SESSION_BASE, client: 'web', token: 'x'.repeat(43) }).success,
    ).toBe(false)
  })

  it('mobile: token wajib ada', () => {
    expect(sessionDtoSchema.safeParse({ ...SESSION_BASE, client: 'mobile' }).success).toBe(false)
    expect(
      mobileSessionDtoSchema.safeParse({ ...SESSION_BASE, client: 'mobile', token: 'x'.repeat(43) })
        .success,
    ).toBe(true)
    expect(
      sessionDtoSchema.safeParse({ ...SESSION_BASE, client: 'mobile', token: 'x'.repeat(43) })
        .success,
    ).toBe(true)
  })

  it('menolak token yang terlalu pendek dan expiresAt yang bukan instan ISO', () => {
    expect(
      sessionDtoSchema.safeParse({ ...SESSION_BASE, client: 'mobile', token: 'pendek' }).success,
    ).toBe(false)
    expect(
      sessionDtoSchema.safeParse({
        ...SESSION_BASE,
        client: 'web',
        expiresAt: 1_700_000_000_000,
      }).success,
    ).toBe(false)
  })

  it('menormalkan email di DTO dan menolak field asing', () => {
    const parsed = sessionDtoSchema.parse({
      ...SESSION_BASE,
      user: { ...SESSION_BASE.user, email: '  Bayu@Example.com ' },
      client: 'web',
    })

    expect(parsed.user.email).toBe('bayu@example.com')
    expect(
      sessionDtoSchema.safeParse({ ...SESSION_BASE, client: 'web', refreshToken: 'x' }).success,
    ).toBe(false)
  })
})

describe('currentSessionResultSchema', () => {
  it('menerima sesi tanpa client dan tanpa token (berlaku untuk web maupun mobile)', () => {
    expect(currentSessionResultSchema.safeParse(SESSION_BASE).success).toBe(true)
  })

  it('menolak token dan field asing - endpoint ini cuma membaca sesi, tidak menerbitkan', () => {
    expect(
      currentSessionResultSchema.safeParse({ ...SESSION_BASE, token: 'x'.repeat(43) }).success,
    ).toBe(false)
    expect(currentSessionResultSchema.safeParse({ ...SESSION_BASE, client: 'web' }).success).toBe(
      false,
    )
  })
})
