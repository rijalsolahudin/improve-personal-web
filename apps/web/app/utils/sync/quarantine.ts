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
 * Kenapa per PEMILIK (`userId`), bukan satu daftar bersama: `localStorage` dipakai bersama semua tab.
 * Dulu tab akun B yang membuka sesi mengosongkan daftar tab akun A yang masih sync, sehingga A harus
 * mengulang tiga siklus (pull-nya berhenti selama itu), dan `blockedCount()` tanpa pemilik bisa
 * menampilkan angka akun sebelumnya sesaat setelah ganti akun. Sekarang tiap akun punya daftarnya
 * sendiri; satu tab tidak pernah menghapus milik tab lain.
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

/**
 * Batas jumlah id PER PEMILIK. Id yang paling lama dibuang lebih dulu.
 *
 * Angkanya sengaja jauh di atas jumlah record rusak yang realistis; tujuannya menjaga `localStorage`
 * tidak tumbuh tanpa batas kalau ada bug yang mengarantinakan banyak record.
 */
export const QUARANTINE_MAX_RECORDS = 200

/**
 * Batas jumlah pemilik yang disimpan. Nomor 3 cukup untuk "akun ini, akun sebelumnya, dan satu lagi
 * yang mungkin masih dipakai di tab lain"; lebih dari itu hanya menambah `localStorage` tanpa guna.
 * Pemilik yang paling lama TIDAK menulis dibuang lebih dulu.
 */
export const QUARANTINE_MAX_OWNERS = 3

/** Bentuk data di `localStorage`. `version` memberi jalan keluar kalau bentuknya perlu berubah lagi. */
const QUARANTINE_VERSION = 1

type StoredQuarantine = {
  readonly version: number
  readonly owners: Record<string, readonly string[]>
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const ids = value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0,
  )

  // Duplikat dari tulisan versi lain tidak boleh membuat penghitung lebih besar dari jumlah record.
  return [...new Set(ids)].slice(-QUARANTINE_MAX_RECORDS)
}

/**
 * Baca daftar per pemilik. Nilai rusak (JSON lama, editor dev, versi lain) dibaca sebagai kosong -
 * karantina hanya mempercepat pemulihan, bukan penjaga data, jadi lebih baik mulai dari nol daripada
 * melempar dan menghentikan sync.
 */
function readOwners(store: Storage): Map<string, string[]> {
  let raw: string | null
  try {
    raw = store.getItem(QUARANTINE_STORAGE_KEY)
  } catch {
    return new Map()
  }

  if (raw === null) return new Map()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return new Map()
  }

  if (!isRecord(parsed) || parsed.version !== QUARANTINE_VERSION || !isRecord(parsed.owners)) {
    return new Map()
  }

  const owners = new Map<string, string[]>()
  for (const [ownerId, ids] of Object.entries(parsed.owners)) {
    if (ownerId.length === 0) continue
    owners.set(ownerId, cleanIds(ids))
  }

  trimOwners(owners)
  return owners
}

/** Buang pemilik yang paling lama tidak menulis sampai jumlahnya di bawah batas. */
function trimOwners(owners: Map<string, string[]>): void {
  while (owners.size > QUARANTINE_MAX_OWNERS) {
    const oldest = owners.keys().next().value
    if (oldest === undefined) return
    owners.delete(oldest)
  }
}

function writeOwners(store: Storage, owners: Map<string, string[]>): void {
  const snapshot: StoredQuarantine = {
    version: QUARANTINE_VERSION,
    owners: Object.fromEntries(owners),
  }

  try {
    store.setItem(QUARANTINE_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Kuota penuh/mode privat: karantina tidak bertahan. `isQuarantined()` sesudahnya akan bilang
    // "belum berlaku", jadi controller tidak berpura-pura pull sudah pulih.
  }
}

/** True kalau record ini sudah dinyatakan tidak bisa dibuka oleh pemilik `ownerId`. */
export function isQuarantined(ownerId: string, recordId: string): boolean {
  if (ownerId.length === 0 || recordId.length === 0) return false

  const store = storageOrNull()
  if (store === null) return false

  return readOwners(store).get(ownerId)?.includes(recordId) ?? false
}

/**
 * Catat record sebagai tidak bisa dibuka untuk pemilik `ownerId`. Idempoten: id yang sudah ada tidak
 * digeser urutannya.
 *
 * No-op kalau pemilik/id kosong atau storage tidak bisa ditulis - daftar yang tidak bisa dibaca ulang
 * tidak boleh diklaim berlaku.
 */
export function quarantineRecord(ownerId: string, recordId: string): void {
  if (ownerId.length === 0 || recordId.length === 0) return

  const store = storageOrNull()
  if (store === null) return

  const owners = readOwners(store)
  const ids = owners.get(ownerId) ?? []
  if (ids.includes(recordId)) return

  // Pemilik ditulis ulang di urutan TERAKHIR: urutan peta = bukti terakhir menulis, jadi pemilik yang
  // paling lama tidak menulis yang dibuang saat `QUARANTINE_MAX_OWNERS` tercapai (lihat `trimOwners`).
  owners.delete(ownerId)
  // `slice(-MAX)` membuang id yang paling lama masuk lebih dulu.
  owners.set(ownerId, [...ids, recordId].slice(-QUARANTINE_MAX_RECORDS))
  trimOwners(owners)

  writeOwners(store, owners)
}

/**
 * Jumlah record terkarantina milik satu pemilik - dipakai indikator status agar user tahu ada data
 * yang tidak tampil. Angka akun lain tidak pernah ikut dihitung.
 */
export function quarantinedCount(ownerId: string): number {
  if (ownerId.length === 0) return 0

  const store = storageOrNull()
  if (store === null) return 0

  return readOwners(store).get(ownerId)?.length ?? 0
}

/** Dipakai test: daftar tidak boleh diwarisi antar kasus. */
export function clearQuarantineForTest(): void {
  const store = storageOrNull()
  if (store === null) return

  try {
    store.removeItem(QUARANTINE_STORAGE_KEY)
  } catch {
    // Storage diblokir: tidak ada yang bisa dibersihkan.
  }
}
