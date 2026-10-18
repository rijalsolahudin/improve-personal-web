import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  API_PREFIX,
  API_VERSION,
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  GENERIC_ERROR_MESSAGES,
  apiDataEnvelopeSchema,
  apiErrorBodySchema,
  apiErrorSchema,
  apiResponseSchema,
  base64MaxLengthForBytes,
  base64WithinBytesSchema,
  integerQuerySchema,
  isBase64,
  isIsoInstant,
  isoInstantSchema,
  optionalIntegerQuerySchema,
  utf8ByteLength,
  uuidSchema,
  type ApiSuccessResponse,
} from './protocol.ts'

describe('versi & prefix protokol', () => {
  it('versi ada di path, bukan di header', () => {
    expect(API_VERSION).toBe('v1')
    expect(API_PREFIX).toBe('/v1')
  })
})

describe('ERROR_CODES', () => {
  it('setiap kode punya status HTTP dan pesan generik', () => {
    expect(Object.keys(ERROR_HTTP_STATUS).sort()).toEqual([...ERROR_CODES].sort())
    expect(Object.keys(GENERIC_ERROR_MESSAGES).sort()).toEqual([...ERROR_CODES].sort())
  })

  it('pesan OTP tidak membocorkan apakah email terdaftar', () => {
    const pesan = GENERIC_ERROR_MESSAGES.OTP_INVALID

    expect(pesan).not.toMatch(/terdaftar|belum terdaftar|tidak ditemukan|belum punya akun/i)

    // Satu pesan untuk dua sebab (email salah / kode salah) - itu yang bikin tidak ada oracle.
    expect(pesan).toMatch(/email/i)
    expect(pesan).toMatch(/kode/i)
  })

  it('SYNC_RESET_REQUIRED = 409 (cursor di bawah watermark purge)', () => {
    expect(ERROR_HTTP_STATUS.SYNC_RESET_REQUIRED).toBe(409)
  })

  it('DEVICE_LIMIT_REACHED ada sebagai kode tersendiri, bukan FORBIDDEN (409 Conflict)', () => {
    // Batas perangkat = keadaan resource, bukan kehilangan hak -> 409, dan kodenya BEDA dari
    // FORBIDDEN supaya client bisa menampilkan pesan "hapus salah satu perangkat".
    expect(ERROR_CODES).toContain('DEVICE_LIMIT_REACHED')
    expect(ERROR_HTTP_STATUS.DEVICE_LIMIT_REACHED).toBe(409)
    expect(ERROR_HTTP_STATUS.DEVICE_LIMIT_REACHED).not.toBe(ERROR_HTTP_STATUS.FORBIDDEN)
    expect(GENERIC_ERROR_MESSAGES.DEVICE_LIMIT_REACHED).toMatch(/perangkat/i)
  })

  it('METHOD_NOT_ALLOWED memetakan 405 (bukan jatuh ke INTERNAL/500)', () => {
    expect(ERROR_CODES).toContain('METHOD_NOT_ALLOWED')
    expect(ERROR_HTTP_STATUS.METHOD_NOT_ALLOWED).toBe(405)
    expect(ERROR_HTTP_STATUS.METHOD_NOT_ALLOWED).not.toBe(ERROR_HTTP_STATUS.INTERNAL)
  })
})

describe('amplop error `{ error: { code, message, details? } }`', () => {
  it('apiErrorSchema menerima bentuk minimal dan dengan details', () => {
    expect(apiErrorSchema.safeParse({ code: 'NOT_FOUND', message: 'Tidak ada.' }).success).toBe(
      true,
    )
    expect(
      apiErrorSchema.safeParse({
        code: 'RATE_LIMITED',
        message: 'Terlalu banyak percobaan.',
        details: { retryAfterSeconds: 30 },
      }).success,
    ).toBe(true)
  })

  it('apiErrorBodySchema menerima HANYA bentuk bersarang, bukan bentuk datar', () => {
    expect(
      apiErrorBodySchema.safeParse({ error: { code: 'NOT_FOUND', message: 'Tidak ada.' } }).success,
    ).toBe(true)
    expect(
      apiErrorBodySchema.safeParse({ error: { code: 'OTP_INVALID', message: 'x' } }).success,
    ).toBe(true)
    expect(
      apiErrorBodySchema.safeParse({
        error: { code: 'RATE_LIMITED', message: 'x', details: { retryAfterSeconds: 30 } },
      }).success,
    ).toBe(true)

    // Bentuk pra-amplop (datar) sudah bukan kontrak dan harus ditolak klien.
    expect(apiErrorBodySchema.safeParse({ code: 'NOT_FOUND', message: 'x' }).success).toBe(false)
    // Amplop sukses juga bukan amplop error.
    expect(apiErrorBodySchema.safeParse({ data: { status: 'ok' } }).success).toBe(false)
  })

  it('menolak kode error tak dikenal, pesan kosong, dan field asing di kedua lapis', () => {
    expect(
      apiErrorBodySchema.safeParse({ error: { code: 'TOO_MANY_REQUESTS', message: 'x' } }).success,
    ).toBe(false)
    expect(apiErrorBodySchema.safeParse({ error: { code: 'INTERNAL', message: '' } }).success).toBe(
      false,
    )
    expect(
      apiErrorBodySchema.safeParse({
        error: { code: 'INTERNAL', message: 'x', stack: 'Error: ...' },
      }).success,
    ).toBe(false)
    expect(
      apiErrorBodySchema.safeParse({
        error: { code: 'INTERNAL', message: 'x' },
        cause: 'pg: relation "users" does not exist',
      }).success,
    ).toBe(false)
  })
})

describe('amplop sukses `{ data }` & deskripsi satu endpoint', () => {
  // DTO contoh: bentuknya tidak penting di sini - yang diuji amplopnya, bukan isinya.
  const dtoSchema = z.object({ id: z.string() }).strict()

  it('apiDataEnvelopeSchema menaruh DTO di `data` dan menolak amplop error', () => {
    const schema = apiDataEnvelopeSchema(dtoSchema)

    expect(schema.safeParse({ data: { id: 'a' } }).success).toBe(true)
    expect(schema.safeParse({ data: { id: 'a' }, extra: 1 }).success).toBe(false)
    expect(schema.safeParse({ data: { id: 'a', extra: 1 } }).success).toBe(false)
    expect(schema.safeParse({ error: { code: 'INTERNAL', message: 'x' } }).success).toBe(false)
    // DTO telanjang (tanpa amplop) juga bukan respons yang sah.
    expect(schema.safeParse({ id: 'a' }).success).toBe(false)
  })

  it('apiResponseSchema menerima sukses DAN gagal, menolak yang di luar keduanya', () => {
    const schema = apiResponseSchema(dtoSchema)

    expect(schema.safeParse({ data: { id: 'a' } }).success).toBe(true)
    expect(schema.safeParse({ error: { code: 'NOT_FOUND', message: 'x' } }).success).toBe(true)
    expect(
      schema.safeParse({ error: { code: 'NOT_FOUND', message: 'x' }, data: { id: 'a' } }).success,
    ).toBe(false)
    expect(schema.safeParse({ code: 'NOT_FOUND', message: 'x' }).success).toBe(false)
  })

  it('`ApiSuccessResponse<T>` sebentuk dengan schema amplop sukses', () => {
    // Pemeriksaan arah tipe: nilai yang lolos schema harus bisa dipakai sebagai `ApiSuccessResponse`,
    // dan sebaliknya - kalau keduanya menyimpang, baris ini yang gagal lebih dulu saat typecheck.
    const parsed = apiDataEnvelopeSchema(dtoSchema).parse({ data: { id: 'a' } })
    const asTipe: ApiSuccessResponse<{ id: string }> = parsed
    const back: typeof parsed = asTipe

    expect(back.data.id).toBe('a')
  })
})

describe('uuidSchema', () => {
  it('menerima UUID versi apa pun dan menormalkannya jadi lowercase', () => {
    expect(uuidSchema.parse('018FABC1-DEF2-4ABC-8DEF-0123456789AB')).toBe(
      '018fabc1-def2-4abc-8def-0123456789ab',
    )
    expect(uuidSchema.safeParse('018fabc1-def2-7abc-8def-0123456789ab').success).toBe(true)
  })

  it('menolak UUID tanpa tanda hubung, bentuk pendek, dan string acak', () => {
    expect(uuidSchema.safeParse('018fabc1def24abc8def0123456789ab').success).toBe(false)
    expect(uuidSchema.safeParse('018fabc1-def2-4abc-8def').success).toBe(false)
    expect(uuidSchema.safeParse('bukan-uuid').success).toBe(false)
  })
})

describe('instan waktu', () => {
  it('menerima ISO-8601 UTC dengan dan tanpa milidetik', () => {
    expect(isIsoInstant('2024-01-02T03:04:05Z')).toBe(true)
    expect(isIsoInstant('2024-01-02T03:04:05.678Z')).toBe(true)
    expect(isoInstantSchema.safeParse('2024-01-02T03:04:05.678Z').success).toBe(true)
  })

  it('menolak offset non-UTC, tanggal telanjang, dan tanggal yang tidak ada', () => {
    expect(isIsoInstant('2024-01-02T03:04:05+07:00')).toBe(false)
    expect(isIsoInstant('2024-01-02T03:04:05z')).toBe(false)
    expect(isIsoInstant('2024-01-02')).toBe(false)
    expect(isIsoInstant('2024-13-45T00:00:00Z')).toBe(false)
  })
})

describe('base64', () => {
  it('menerima base64 standar ber-padding, termasuk string kosong', () => {
    expect(isBase64('')).toBe(true)
    expect(isBase64('AAAA')).toBe(true)
    expect(isBase64('AAA=')).toBe(true)
    expect(isBase64('AA==')).toBe(true)
  })

  it('menolak tanpa padding, padding salah, dan karakter di luar alfabet', () => {
    expect(isBase64('AAA')).toBe(false)
    expect(isBase64('A')).toBe(false)
    expect(isBase64('A===')).toBe(false)
    expect(isBase64('AA=A')).toBe(false)
    expect(isBase64('AB_C')).toBe(false)
  })

  it('base64MaxLengthForBytes menghitung batas panjang string, bukan hasil decode', () => {
    expect(base64MaxLengthForBytes(3)).toBe(4)
    expect(base64MaxLengthForBytes(4096)).toBe(5464)
  })

  it('base64WithinBytesSchema menolak payload kebesaran berdasarkan panjangnya', () => {
    const schema = base64WithinBytesSchema(16, 'blob')
    const batasPanjang = base64MaxLengthForBytes(16)

    expect(schema.safeParse('A'.repeat(batasPanjang)).success).toBe(true)
    expect(schema.safeParse('A'.repeat(batasPanjang + 4)).success).toBe(false)
    expect(schema.safeParse('A'.repeat(3)).success).toBe(false)
  })
})

describe('utf8ByteLength', () => {
  it('menghitung byte UTF-8 tanpa Buffer/TextEncoder', () => {
    expect(utf8ByteLength('abc')).toBe(3)
    expect(utf8ByteLength('cafe\u0301')).toBe(6)
    expect(utf8ByteLength('é')).toBe(2)
    expect(utf8ByteLength('日')).toBe(3)
  })

  it('over-estimasi karakter astral: batas ukuran harus aman, bukan presisi byte', () => {
    // 4 byte sebenarnya, dihitung 6 (2 code unit x 3) - sengaja, supaya tidak pernah menerima kebesaran.
    expect(utf8ByteLength('🙂')).toBe(6)
  })
})

describe('query integer', () => {
  it('menerima digit polos dan menolak bentuk lain', () => {
    const schema = integerQuerySchema(0, 100, 'cursor')

    expect(schema.parse('7')).toBe(7)
    expect(schema.parse('007')).toBe(7)
    expect(schema.parse('100')).toBe(100)

    for (const invalid of ['', 'abc', '-1', '1.5', '1e9', '0x10', ' 7 ', '101', '+7']) {
      expect(schema.safeParse(invalid).success, `harus ditolak: "${invalid}"`).toBe(false)
    }
  })

  it('menolak angka di luar rentang aman JS', () => {
    const schema = integerQuerySchema(0, Number.MAX_SAFE_INTEGER, 'cursor')

    expect(schema.safeParse('9999999999999999').success).toBe(false)
  })

  it('query opsional memakai fallback saat tidak dikirim, tanpa ikut diparse sebagai string', () => {
    const schema = optionalIntegerQuerySchema(0, 500, 'limit', 200)

    expect(schema.parse(undefined)).toBe(200)
    expect(schema.parse('42')).toBe(42)
  })
})
