import { buyerMobileSchema } from '@improve-personal/contracts'
import { describe, expect, it } from 'vitest'

import id from '../../i18n/locales/id.json'

import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  filterPhoneCountries,
  flagEmoji,
  formatNational,
  nationalDigits,
  phoneCountryByIso,
  phonePlaceholder,
  toE164,
} from './phone'

const ID = phoneCountryByIso('ID')
const SG = phoneCountryByIso('SG')

describe('nationalDigits', () => {
  it.each([
    ['0812-3456-7890', '81234567890'],
    ['812 3456 7890', '81234567890'],
    ['+62 812 3456 7890', '81234567890'],
    ['abc', ''],
  ])('%j -> %j', (raw, expected) => {
    expect(nationalDigits(raw, ID)).toBe(expected)
  })

  it('memotong di panjang maksimum negara', () => {
    expect(nationalDigits('1234567890', SG)).toBe('12345678')
  })

  it('kode negara tanpa `+` dianggap bagian nomor', () => {
    expect(nationalDigits('6591234567', SG)).toBe('65912345')
  })
})

describe('formatNational', () => {
  it.each([
    ['', ''],
    ['812', '812'],
    ['8123', '812-3'],
    ['81234567890', '812-3456-7890'],
    ['812345678901', '812-3456-78901'],
  ])('ID %j -> %j', (digits, expected) => {
    expect(formatNational(digits, ID)).toBe(expected)
  })
})

describe('toE164', () => {
  it('kosong bila belum ada digit', () => {
    expect(toE164('', ID)).toBe('')
  })

  it('setiap negara menghasilkan nomor yang diterima kontrak', () => {
    for (const country of PHONE_COUNTRIES) {
      const digits = (country.iso === 'ID' ? '8' : '9').padEnd(country.maxDigits, '1')
      expect(buyerMobileSchema.safeParse(toE164(digits, country)).success, country.iso).toBe(true)
    }
  })
})

describe('negara', () => {
  it('Indonesia jadi default, iso asing jatuh ke default', () => {
    expect(DEFAULT_PHONE_COUNTRY.iso).toBe('ID')
    expect(phoneCountryByIso('XX')).toBe(DEFAULT_PHONE_COUNTRY)
  })

  it('iso unik dan panjang maksimum muat di pola', () => {
    expect(new Set(PHONE_COUNTRIES.map((country) => country.iso)).size).toBe(PHONE_COUNTRIES.length)
    for (const country of PHONE_COUNTRIES) {
      expect(country.maxDigits).toBeGreaterThanOrEqual(country.pattern.split('#').length - 1)
    }
  })

  it('setiap negara punya nama di i18n', () => {
    expect(Object.keys(id.purchase.countries).sort()).toEqual(
      PHONE_COUNTRIES.map((country) => country.iso).sort(),
    )
  })

  it('bendera & placeholder', () => {
    expect(flagEmoji('id')).toBe('🇮🇩')
    expect(phonePlaceholder(ID)).toBe('xxx-xxxx-xxxx')
  })
})

describe('filterPhoneCountries', () => {
  // Locale JSON dikompilasi jadi fungsi oleh plugin i18n; nama cukup peta kecil di sini.
  const NAMES: Record<string, string> = { SG: 'Singapura', MY: 'Malaysia' }
  const nameOf = (country: { iso: string }) => NAMES[country.iso] ?? country.iso
  const isos = (query: string) => filterPhoneCountries(query, nameOf).map((country) => country.iso)

  it('kosong -> semua negara', () => {
    expect(isos('  ')).toHaveLength(PHONE_COUNTRIES.length)
  })

  it('cocokkan nama tanpa beda huruf besar', () => {
    expect(isos('SINGA')).toEqual(['SG'])
  })

  it('cocokkan awalan kode, dengan atau tanpa +', () => {
    expect(isos('+65')).toEqual(['SG'])
    expect(isos('67')).toEqual(['BN', 'TL'])
  })

  it('tidak ada yang cocok -> kosong', () => {
    expect(isos('zzz')).toEqual([])
  })
})
