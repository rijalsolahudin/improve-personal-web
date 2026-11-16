import { LICENSE_PRICE_IDR } from '@improve-personal/contracts'

/** `99000` -> `Rp99.000` (gaya penulisan harga di UI: tanpa spasi, titik ribuan). */
export function formatRupiah(amount: number): string {
  return `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(amount)}`
}

/** Harga lisensi untuk ditampilkan. Angkanya dari kontrak, sama dengan yang ditagih server. */
export const LICENSE_PRICE_LABEL = formatRupiah(LICENSE_PRICE_IDR)
