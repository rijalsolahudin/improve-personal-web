import { DEVICE_NAME_MAX_LENGTH, type DeviceInfo } from '@improve-personal/contracts'

import { currentInstallationId } from './device-installation'

/**
 * Info perangkat yang disumbang web saat login (`deviceInfoSchema` di kontrak: `name` + `platform` +
 * `installationId`; `devices.id` diterbitkan server, jadi client tidak pernah mengirim id).
 *
 * Nama diturunkan dari User-Agent, bukan dibuat acak: `Math.random()` membuat nama perangkat berubah
 * tiap login, sehingga user tidak bisa mengenali perangkatnya sendiri di halaman Perangkat (PRD F15)
 * - dan string kosong ditolak `deviceNameSchema` (server menjawab 400). Fungsi di sini murni:
 * User-Agent di-inject, jadi bisa diuji tanpa DOM dan hasilnya deterministik (input sama, output sama).
 *
 * Nama saja TIDAK cukup membedakan perangkat - dua mesin dengan browser + OS sama menghasilkan nama
 * identik (Ergonio #80). Karena itu `installationId` ikut dikirim: satu id per instalasi browser,
 * dipakai server sebagai pembeda utama. Id itu bukan kredensial, jadi ia tidak pernah dipakai untuk
 * otorisasi dan tidak boleh di-log (lihat `./device-installation`).
 */

/** Platform yang selalu dikirim web (enum kontrak `devicePlatformSchema`). */
const WEB_PLATFORM = 'web' as const

/** Dipakai kalau User-Agent tidak memberi petunjuk apa pun (kosong/diblokir). */
const FALLBACK_DEVICE_NAME = 'Browser web'

type DeviceNameRule = { readonly name: string; readonly pattern: RegExp }

/**
 * Urutan penting - yang lebih spesifik lebih dulu: Edge dan Opera menyebut dirinya Chrome, dan Chrome
 * di iOS menyebut dirinya Safari.
 */
const BROWSER_RULES: readonly DeviceNameRule[] = [
  { name: 'Edge', pattern: /Edg[A-Z]?\// },
  { name: 'Opera', pattern: /OPR\// },
  { name: 'Chrome', pattern: /Chrome\// },
  { name: 'Firefox', pattern: /Firefox\// },
  { name: 'Safari', pattern: /Safari\// },
]

/** Android WAJIB dicek sebelum Linux: setiap User-Agent Android memuat "Linux". */
const PLATFORM_RULES: readonly DeviceNameRule[] = [
  { name: 'Windows', pattern: /Windows NT/ },
  { name: 'Android', pattern: /Android/ },
  { name: 'iOS', pattern: /(iPhone|iPad|iPod)/ },
  { name: 'macOS', pattern: /Mac OS X/ },
  { name: 'Linux', pattern: /Linux/ },
]

function firstMatch(rules: readonly DeviceNameRule[], userAgent: string): string | null {
  return rules.find((rule) => rule.pattern.test(userAgent))?.name ?? null
}

/**
 * Buang karakter kontrol (newline bisa memalsukan satu baris log server, dan `deviceNameSchema`
 * menolaknya) lalu rapikan spasi pinggir.
 *
 * Dicek per code unit, bukan lewat regex rentang kontrol: `no-control-regex` melarang pola semacam itu.
 */
function sanitize(value: string): string {
  let cleaned = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    cleaned += code < 0x20 || code === 0x7f ? ' ' : char
  }
  return cleaned.trim()
}

/** `deviceNameSchema` menolak nama lebih dari `DEVICE_NAME_MAX_LENGTH` karakter (server: 400). */
function clamp(value: string): string {
  return value.slice(0, DEVICE_NAME_MAX_LENGTH)
}

/**
 * Nama perangkat yang bisa dibaca manusia: `"<browser> di <platform>"` (mis. "Chrome di Linux").
 *
 * User-Agent yang tidak dikenali memakai potongan User-Agent-nya sendiri (dibersihkan & dipotong):
 * itu tetap lebih berguna di daftar Perangkat daripada nama generik untuk semua perangkat asing.
 */
export function deviceNameFromUserAgent(userAgent: string): string {
  const browser = firstMatch(BROWSER_RULES, userAgent)
  const platform = firstMatch(PLATFORM_RULES, userAgent)

  if (browser && platform) return clamp(`${browser} di ${platform}`)
  if (browser) return clamp(browser)

  return clamp(sanitize(userAgent)) || FALLBACK_DEVICE_NAME
}

/** User-Agent browser sekarang. `navigator` tidak ada saat SSR/test tanpa DOM: UA kosong = nama fallback. */
function currentUserAgent(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent
}

/**
 * Info perangkat yang SELALU membawa `installationId`.
 *
 * `DeviceInfo` di kontrak membuat field itu opsional (klien lama belum mengirimnya), sedangkan web
 * selalu punya id instalasi. Tipe ini menyatakan fakta itu supaya pemanggil tidak perlu menangani
 * kemungkinan "tidak ada id" yang sebenarnya tidak pernah terjadi.
 */
export type CurrentDeviceInfo = DeviceInfo & { readonly installationId: string }

/** Info perangkat untuk `otpRequestInputSchema`/`otpVerifyInputSchema`; kontrak yang memvalidasinya. */
export function currentDeviceInfo(): CurrentDeviceInfo {
  return {
    name: deviceNameFromUserAgent(currentUserAgent()),
    platform: WEB_PLATFORM,
    installationId: currentInstallationId(),
  }
}
