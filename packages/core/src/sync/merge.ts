import { compareHlc, isValidHlc } from '@improve-personal/contracts'

/**
 * Keputusan merge LWW (ARCHITECTURE.md §9, ADR 3) - satu tempat, dipakai push, pull, dan import.
 *
 * Aturannya cuma satu: **HLC lebih besar menang; seri berarti record itu memang versi yang sama.**
 * Perbandingan WAJIB lewat `compareHlc` dari `@improve-personal/contracts` (tuple, bukan string) -
 * `'999-0-a' > '1000-0-b'` kalau dibandingkan sebagai string, dan itu bug yang bikin pemenang berbeda
 * di dua perangkat.
 *
 * Kenapa HLC dan bukan `updatedAtMs`/jam dinding: jam HP bisa disetel ngaco, HLC tidak ikut ngaco.
 * Record dari perangkat dengan jam 2035 yang nilai HLC-nya lebih kecil tetap KALAH.
 */

/** Bagian record yang ikut diputuskan LWW. Sengaja bukan `StoredRecord`: import tidak punya `blob`. */
export type RecordVersion = {
  readonly id: string
  readonly hlc: string
  readonly deleted: boolean
  /**
   * `true` kalau blob versi ini tersimpan tanpa pernah bisa dibuka perangkat ini (`StoredRecord.opaque`).
   * Hanya relevan untuk sisi lokal; lihat `DecideMergeOptions.incomingAuthenticated`.
   */
  readonly opaque?: boolean
}

export type DecideMergeOptions = {
  /**
   * Versi masuk TERBUKTI sah: blob-nya dibuka dengan kunci perangkat ini (v2 KID sendiri/legacy, atau
   * v1 terbuka sebelum `v1Closed`). Versi sah menang atas record lokal `opaque` berapa pun HLC-nya
   * (spec #120 M3): HLC milik blob yang tidak terbukti tidak boleh membayangi versi sah selamanya.
   * Default `false` - tanpa bukti, LWW biasa; ini menjaga perilaku tombstone `'keep'` (#111).
   */
  readonly incomingAuthenticated?: boolean
}

/** `insert` = record baru; `replace` = versi masuk menang; `skip` = versi lokal (atau sama) menang. */
export type MergeAction = 'insert' | 'replace' | 'skip'

export type MergeReason =
  | 'local_missing'
  | 'incoming_newer'
  | 'local_newer'
  | 'same_hlc'
  /** Lokal `opaque`, masuk terautentikasi: menang tanpa membandingkan HLC (M3). */
  | 'local_opaque'
  /**
   * HLC versi masuk tidak bisa dibaca. `compareHlc` memperlakukan HLC rusak sebagai paling kecil,
   * jadi keputusannya `skip` - record rusak tidak boleh menimpa data sehat.
   */
  | 'incoming_invalid'

/**
 * `incoming_invalid` dijaga eksplisit di `decideMerge`: `compareHlc` sudah menaruh HLC rusak di bawah
 * yang valid, tapi memisahkan alasannya membuat log bisa membedakan "versi lama" dari "data rusak".
 */
export type MergeDecision = {
  readonly action: MergeAction
  readonly reason: MergeReason
  /** Versi mana yang menang. `none` hanya untuk `skip` karena HLC identik. */
  readonly winner: 'local' | 'incoming' | 'none'
}

export function decideMerge(
  local: RecordVersion | null,
  incoming: RecordVersion,
  options: DecideMergeOptions = {},
): MergeDecision {
  if (local === null) {
    return { action: 'insert', reason: 'local_missing', winner: 'incoming' }
  }

  // Guard eksplisit sebelum membandingkan: `compareHlc` memang sudah menaruh HLC rusak di bawah yang
  // valid, tapi kalau KEDUA sisi rusak, pembandingnya jatuh ke perbandingan string mentah - dan di
  // situ hasilnya tidak berarti apa-apa. Lebih jujur: versi masuk yang rusak tidak pernah menang.
  if (!isValidHlc(incoming.hlc)) {
    return { action: 'skip', reason: 'incoming_invalid', winner: 'local' }
  }

  // Sesudah guard HLC rusak: versi sah dengan HLC tak terbaca tetap tidak boleh ditulis.
  if (local.opaque === true && options.incomingAuthenticated === true) {
    return { action: 'replace', reason: 'local_opaque', winner: 'incoming' }
  }

  const order = compareHlc(incoming.hlc, local.hlc)

  if (order > 0) {
    return { action: 'replace', reason: 'incoming_newer', winner: 'incoming' }
  }

  if (order === 0) {
    return { action: 'skip', reason: 'same_hlc', winner: 'none' }
  }

  return { action: 'skip', reason: 'local_newer', winner: 'local' }
}

/**
 * Pilih pemenang dari dua versi tanpa mempedulikan sisi mana yang lokal.
 *
 * Dipakai kalau tidak ada "sisi lokal" yang jelas - mis. dua record dari dua halaman pull yang sama,
 * atau saat menyusun laporan konflik.
 */
export function pickWinner(a: RecordVersion, b: RecordVersion): RecordVersion | null {
  const order = compareHlc(a.hlc, b.hlc)
  if (order === 0) return null
  return order > 0 ? a : b
}
