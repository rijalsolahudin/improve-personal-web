import { TECH_IDENTITY } from '#shared/tech-identity'

/**
 * Karantina record yang blob-nya TIDAK BISA dibuka lagi.
 *
 * Masalah yang diselesaikan: satu record hasil pull yang gagal didekripsi (`RecordKeyError`) membuat
 * `record_index`-nya tidak bisa dibangun, dan controller menghentikan pull supaya cursor tidak maju di
 * atas data yang belum tentu terbaca. Kegagalannya deterministik: "Coba lagi" akan gagal di record yang
 * sama, selamanya - record lain di halaman itu tidak pernah masuk. Setelah record yang sama gagal
 * beberapa siklus BERTURUT-TURUT (controller yang memutuskan kapan), record itu dinyatakan rusak dan
 * dicatat di sini. Siklus berikutnya membangun index-nya dengan `RECORD_INDEX_KEEP` sehingga pull bisa
 * maju tanpa menghapus index lama dan tanpa membuang blob.
 *
 * Kenapa di `localStorage`, bukan cuma di memori: tanpa persist, setiap muat halaman butuh tiga siklus
 * gagal lagi (~15 menit pada interval 5 menit) sebelum pull jalan lagi - user melihat "Gagal sinkron"
 * berulang tanpa sebab yang bisa ia mengerti.
 *
 * Isinya HANYA id record (UUID) - tidak ada blob, plaintext, atau potongan kunci. Id record boleh
 * disimpan di perangkat (tidak pernah dikirim ke server), jadi ini tetap dalam aturan
 * `shared-security.md`.
 *
 * Semua fungsi aman saat `localStorage` diblokir/penuh (mode privat) atau saat SSR: tidak pernah
 * melempar, dan operasi yang butuh storage menjadi no-op. Controller memeriksa hasil
 * `isQuarantined()` sesudah menulis - kalau belum berlaku, ia tidak menjanjikan pemulihan yang tidak
 * terjadi.
 */

/** Awalan key `ip-` (sama dengan `clearAppStorage` saat logout, jadi ikut tersapu). */
export const QUARANTINE_STORAGE_KEY = `${TECH_IDENTITY.storagePrefix}sync-quarantine`
/** Pemilik daftar di atas. Berganti akun = daftar lama tidak relevan dan dibuang. */
export const QUARANTINE_OWNER_KEY = `${TECH_IDENTITY.storagePrefix}sync-quarantine-owner`

/**
 * Batas jumlah id yang disimpan. Id yang paling lama dibuang lebih dulu.
 *
 * Angkanya sengaja jauh di atas jumlah record rusak yang realistis; tujuannya menjaga `localStorage`
 * tidak tumbuh tanpa batas kalau ada bug yang mengarantinakan banyak record.
 */
export const QUARANTINE_MAX_RECORDS = 200

/**
 * Pemilik daftar yang sedang aktif. `null` = belum ada sesi data lokal, sehingga tidak ada id yang
 * boleh DITAMBAHKAN (tidak bisa diatribusikan ke akun mana pun). Pembacaan tetap boleh: daftar yang
 * tersimpan memang milik akun terakhir yang membuka data di perangkat ini.
 */
let activeOwnerId: string | null = null

/** `localStorage` kalau ada dan bisa diakses; `null` saat SSR atau storage diblokir. */
function storageOrNull(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    // Safari/Chrome mode privat bisa melempar saat properti diakses, bukan hanya saat ditulis.
    return null
  }
}

function readOwner(store: Storage): string | null {
  try {
    return store.getItem(QUARANTINE_OWNER_KEY)
  } catch {
    return null
  }
}

function readIds(store: Storage): string[] {
  let raw: string | null
  try {
    raw = store.getItem(QUARANTINE_STORAGE_KEY)
  } catch {
    return []
  }

  if (raw === null) return []

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === 'string' && value.length > 0)
  } catch {
    // Nilai rusak (pernah ditulis versi lain / editor dev): anggap kosong, jangan melempar.
    return []
  }
}

function writeIds(store: Storage, ids: readonly string[]): void {
  try {
    store.setItem(QUARANTINE_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Kuota penuh/mode privat: karantina tidak bertahan. `isQuarantined()` sesudahnya akan bilang
    // "belum berlaku", jadi controller tidak berpura-pura pull sudah pulih.
  }
}

/**
 * Tetapkan daftar karantina milik akun ini.
 *
 * Dipanggil controller setiap sesi data lokal dibuka. Kalau pemilik yang tersimpan berbeda, daftar
 * lama DIBUANG: id record akun lain tidak ada artinya di sini, dan membiarkannya berarti record akun
 * baru bisa terlewat hanya karena kebetulan id-nya sama.
 */
export function adoptQuarantineAccount(userId: string): void {
  activeOwnerId = userId

  const store = storageOrNull()
  if (store === null) return
  if (readOwner(store) === userId) return

  writeIds(store, [])
  try {
    store.setItem(QUARANTINE_OWNER_KEY, userId)
  } catch {
    // Tidak ada yang bisa disimpan; keputusan untuk sesi berjalan tetap dipegang controller.
  }
}

/** True kalau record ini sudah dinyatakan tidak bisa dibuka. */
export function isQuarantined(recordId: string): boolean {
  const store = storageOrNull()
  if (store === null) return false

  return readIds(store).includes(recordId)
}

/**
 * Catat record sebagai tidak bisa dibuka. Idempoten: id yang sudah ada tidak digeser urutannya.
 *
 * No-op kalau belum ada akun aktif atau storage tidak bisa ditulis - id tanpa pemilik tidak boleh
 * masuk daftar, dan daftar yang tidak bisa dibaca ulang tidak boleh diklaim berlaku.
 */
export function quarantineRecord(recordId: string): void {
  if (activeOwnerId === null) return

  const store = storageOrNull()
  if (store === null) return

  const ids = readIds(store)
  if (ids.includes(recordId)) return

  // `slice(-MAX)` membuang id yang paling lama masuk lebih dulu.
  writeIds(store, [...ids, recordId].slice(-QUARANTINE_MAX_RECORDS))
}

/** Jumlah record terkarantina - dipakai indikator status agar user tahu ada data yang tidak tampil. */
export function quarantinedCount(): number {
  const store = storageOrNull()
  if (store === null) return 0

  return readIds(store).length
}

/** Dipakai test: daftar & pemilik tidak boleh diwarisi antar kasus. */
export function clearQuarantineForTest(): void {
  activeOwnerId = null

  const store = storageOrNull()
  if (store === null) return

  try {
    store.removeItem(QUARANTINE_STORAGE_KEY)
    store.removeItem(QUARANTINE_OWNER_KEY)
  } catch {
    // Storage diblokir: tidak ada yang bisa dibersihkan.
  }
}
