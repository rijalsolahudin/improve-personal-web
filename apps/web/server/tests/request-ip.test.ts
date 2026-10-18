// @vitest-environment node
//
// `resolveClientIp` / `forwardedForEntry` - unit murni (tanpa request, tanpa DB).
//
// Kenapa diuji terpisah: seluruh limit per-IP bergantung pada fungsi ini, dan cara kerjanya
// (hop proxy) adalah tempat kesalahan konfigurasi paling mahal. Test ini MENGUNCI perilaku yang ada
// sekarang, bukan mengidealkan: kalau perilakunya diubah, test ini yang harus diubah lebih dulu.
import { describe, expect, it } from 'vitest'

import { forwardedForEntry, resolveClientIp } from '../utils/request-ip'

const SOCKET_IP = '203.0.113.9'

describe('trustedProxyHops = 0 (default): header klien TIDAK dipercaya sama sekali', () => {
  it('X-Forwarded-For apa pun diabaikan; yang dipakai alamat socket', () => {
    // Ini yang membuat pemalsuan IP mustahil dengan setelan default - dan alasan `hops` lebih rendah
    // selalu fail-closed (bukan "aman karena kebetulan").
    for (const forwardedFor of [undefined, '1.1.1.1', '1.1.1.1, 2.2.2.2', 'ngawur', '127.0.0.1']) {
      expect(resolveClientIp(forwardedFor, SOCKET_IP, 0), `XFF "${forwardedFor}"`).toBe(SOCKET_IP)
    }
  })

  it('tanpa IP socket pun tidak menebak (null, bukan nilai dari header)', () => {
    expect(resolveClientIp('1.1.1.1', undefined, 0)).toBeNull()
  })
})

describe('trustedProxyHops >= 1: entri yang dipakai adalah `panjang - 1 - hops`', () => {
  it('header lebih pendek dari jumlah hop -> pakai socket (fail-closed, bukan menebak)', () => {
    // Konsekuensi yang WAJIB disadari (temuan M5): dengan satu proxy yang MENIMPA header, XFF hanya
    // berisi SATU entri (`client`) - dan `hops = 1` TIDAK mengambilnya, melainkan jatuh ke alamat
    // socket. Alamat socket = IP proxy, jadi SELURUH pengguna berbagi satu bucket per-IP (`otp:ip`
    // 20/15 menit): satu penyerang bisa memblokir permintaan OTP semua orang.
    expect(forwardedForEntry('1.1.1.1', 1)).toBeNull()
    expect(resolveClientIp('1.1.1.1', SOCKET_IP, 1)).toBe(SOCKET_IP)

    expect(forwardedForEntry('1.1.1.1, 2.2.2.2', 2)).toBeNull()
    expect(resolveClientIp('1.1.1.1, 2.2.2.2', SOCKET_IP, 2)).toBe(SOCKET_IP)
  })

  it('satu hop: entri yang dipakai bergeser satu ke kiri, jadi proxy WAJIB menimpa header', () => {
    // Request dari klien yang mengirim XFF sendiri, melewati SATU proxy yang MENAMBAHKAN entri di
    // kanan: header menjadi `[palsu, klien-asli]`. `hops = 1` mengambil entri paling KIRI, yaitu
    // `[palsu]` - berarti proxy yang cuma menambahkan (tanpa menimpa) membuat limit per-IP bisa
    // dibelokkan klien. Karena itu `proxy_set_header X-Forwarded-For $remote_addr` (menimpa) adalah
    // syarat, bukan saran, dan jumlah hop harus disetel sesuai topologi nyata.
    expect(forwardedForEntry('9.9.9.9, 198.51.100.7', 1)).toBe('9.9.9.9')

    // Tanpa header sama sekali tidak ada tebakan.
    expect(forwardedForEntry(undefined, 1)).toBeNull()
  })

  it('header dengan jumlah entri yang diharapkan dipakai apa adanya', () => {
    // `hops + 1` entri: yang dipakai entri paling kanan ke-`hops`.
    expect(forwardedForEntry('9.9.9.9, 198.51.100.7, 10.0.0.1', 2)).toBe('9.9.9.9')
    expect(forwardedForEntry(' 198.51.100.7 , 10.0.0.1 ', 1)).toBe('198.51.100.7')
  })

  it('entri kosong dibuang sebelum menghitung posisi (tidak menggeser hasil)', () => {
    expect(forwardedForEntry('9.9.9.9,,198.51.100.7,10.0.0.1', 2)).toBe('9.9.9.9')
  })
})
