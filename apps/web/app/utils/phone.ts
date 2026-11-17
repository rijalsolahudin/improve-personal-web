/**
 * Nomor WhatsApp di form beli: pemilih kode negara + mask per negara, dikirim sebagai E.164
 * (`+<kode negara><nomor nasional>`) yang diterima `buyerMobileSchema`.
 *
 * `pattern` hanya mengatur pengelompokan tampilan (`#` = satu digit); digit di luar pola ditempel ke
 * kelompok terakhir sampai `maxDigits`. Validasi panjang sebenarnya tetap milik kontrak.
 */
export type PhoneCountry = {
  /** ISO 3166-1 alpha-2, juga sumber emoji bendera & kunci i18n `purchase.countries.*`. */
  readonly iso: string
  readonly dial: string
  readonly pattern: string
  readonly maxDigits: number
}

const INDONESIA: PhoneCountry = { iso: 'ID', dial: '62', pattern: '###-####-####', maxDigits: 12 }

export const DEFAULT_PHONE_COUNTRY = INDONESIA

/** Indonesia dulu (pasar utama), lalu ASEAN, lalu negara diaspora/kerja yang umum. */
export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  INDONESIA,
  { iso: 'MY', dial: '60', pattern: '##-####-####', maxDigits: 10 },
  { iso: 'SG', dial: '65', pattern: '####-####', maxDigits: 8 },
  { iso: 'BN', dial: '673', pattern: '###-####', maxDigits: 7 },
  { iso: 'TL', dial: '670', pattern: '####-####', maxDigits: 8 },
  { iso: 'TH', dial: '66', pattern: '##-###-####', maxDigits: 9 },
  { iso: 'PH', dial: '63', pattern: '###-###-####', maxDigits: 10 },
  { iso: 'VN', dial: '84', pattern: '###-###-###', maxDigits: 10 },
  { iso: 'AU', dial: '61', pattern: '###-###-###', maxDigits: 9 },
  { iso: 'NZ', dial: '64', pattern: '##-###-####', maxDigits: 10 },
  { iso: 'JP', dial: '81', pattern: '##-####-####', maxDigits: 10 },
  { iso: 'KR', dial: '82', pattern: '##-####-####', maxDigits: 10 },
  { iso: 'CN', dial: '86', pattern: '###-####-####', maxDigits: 11 },
  { iso: 'HK', dial: '852', pattern: '####-####', maxDigits: 8 },
  { iso: 'TW', dial: '886', pattern: '###-###-###', maxDigits: 9 },
  { iso: 'IN', dial: '91', pattern: '#####-#####', maxDigits: 10 },
  { iso: 'SA', dial: '966', pattern: '##-###-####', maxDigits: 9 },
  { iso: 'AE', dial: '971', pattern: '##-###-####', maxDigits: 9 },
  { iso: 'QA', dial: '974', pattern: '####-####', maxDigits: 8 },
  { iso: 'NL', dial: '31', pattern: '#-####-####', maxDigits: 9 },
  { iso: 'DE', dial: '49', pattern: '###-########', maxDigits: 11 },
  { iso: 'GB', dial: '44', pattern: '####-######', maxDigits: 10 },
  { iso: 'US', dial: '1', pattern: '###-###-####', maxDigits: 10 },
]

const REGIONAL_INDICATOR_A = 0x1f1e6

/** Emoji bendera dari dua regional indicator. Windows menampilkannya sebagai huruf kode negara. */
export function flagEmoji(iso: string): string {
  return String.fromCodePoint(
    ...[...iso.toUpperCase()].map((char) => REGIONAL_INDICATOR_A + char.charCodeAt(0) - 65),
  )
}

export function phoneCountryByIso(iso: string): PhoneCountry {
  return PHONE_COUNTRIES.find((country) => country.iso === iso) ?? DEFAULT_PHONE_COUNTRY
}

/**
 * Digit nasional dari ketikan/tempelan: buang non-digit, kode negara bila ditempel bersama `+`,
 * dan 0 di depan (kebiasaan `08…`).
 */
export function nationalDigits(raw: string, country: PhoneCountry): string {
  let digits = raw.replace(/\D/g, '')
  if (raw.trim().startsWith('+') && digits.startsWith(country.dial)) {
    digits = digits.slice(country.dial.length)
  }
  return digits.replace(/^0+/, '').slice(0, country.maxDigits)
}

export function formatNational(digits: string, country: PhoneCountry): string {
  let out = ''
  let index = 0
  for (const slot of country.pattern) {
    if (index >= digits.length) break
    if (slot === '#') {
      out += digits.charAt(index)
      index += 1
    } else {
      out += slot
    }
  }
  return out + digits.slice(index)
}

export function phonePlaceholder(country: PhoneCountry): string {
  return country.pattern.replace(/#/g, 'x')
}

/** Kosong bila belum ada digit, supaya validasi kontrak menandai field wajib. */
export function toE164(digits: string, country: PhoneCountry): string {
  return digits ? `+${country.dial}${digits}` : ''
}

/** Cari negara di pemilih: nama (tanpa beda huruf besar) atau awalan kode (`+65`, `65`). */
export function filterPhoneCountries(
  query: string,
  nameOf: (country: PhoneCountry) => string,
): readonly PhoneCountry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return PHONE_COUNTRIES
  const dialNeedle = needle.replace(/^\+/, '')
  return PHONE_COUNTRIES.filter(
    (country) =>
      nameOf(country).toLowerCase().includes(needle) ||
      (/^\d+$/.test(dialNeedle) && country.dial.startsWith(dialNeedle)),
  )
}
