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
 * Kenapa ada kedaluwarsa (`atMs` + `QUARANTINE_TTL_MS`): kegagalan bisa berubah sebab. Setelah kunci
 * dipulihkan/di-rekey, record yang dulu tidak bisa dibuka justru bisa dibuka dengan kunci yang benar -
 * tetapi selama ia masih terkarantina, `buildIndex` melewatinya selamanya. Entri yang lebih tua dari
 * tujuh hari dipindahkan ke daftar "due" (`QUARANTINE_DUE_STORAGE_KEY`), tempat `reindexQuarantined()`
 * membangun ulang index-nya dari blob lokal tanpa campur tangan user. Tujuh hari sepadan dengan
 * "karantina ini bukan penjaga data, hanya jalan agar pull tidak macet", dan cukup lama untuk tidak
 * memicu percobaan ulang terus-menerus pada record yang memang rusak.
 *
 * Yang KEDALUWARSA tidak lagi dihitung `isQuarantined()`/`quarantinedCount()`: ia tidak menghalangi
 * pull lagi. UI tetap menampilkannya sebagai "data yang tidak bisa dibuka" lewat `listQuarantined()`
 * sampai index-nya benar-benar terbangun - bagi user, record yang belum tampil tetap belum tampil.
 *
 * Isinya HANYA id record (UUID) dan waktu karantina - tidak ada blob, plaintext, atau potongan kunci.
 * Id record boleh disimpan di perangkat (tidak pernah dikirim ke server), jadi ini tetap dalam aturan
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
 * Id yang karantinanya sudah KEDALUWARSA dan menunggu index-nya dibangun ulang
 * (`utils/sync/reindex.ts`).
 *
 * Kenapa terpisah dari `QUARANTINE_STORAGE_KEY`, bukan langsung dibuang seperti sebelumnya: membuang
 * id membuat record "dicoba lagi" hanya oleh pull, dan pull tidak akan pernah mengirimnya lagi -
 * cursor sudah melewatinya. Record itu tersimpan di `record` dengan `index: 'keep'`, jadi satu-satunya
 * jalan keluarnya adalah membangun ulang index dari blob LOKAL. Daftar ini adalah antrean pekerjaan
 * itu; ia baru dikosongkan setelah percobaan sungguhan (berhasil, record hilang, atau gagal dan
 * dicoba lagi pada muat halaman berikutnya).
 *
 * Isinya sama dengan daftar utama: id record + waktu, tanpa blob/plaintext/potongan kunci.
 */
export const QUARANTINE_DUE_STORAGE_KEY = `${TECH_IDENTITY.storagePrefix}sync-quarantine-due`

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

/**
 * Umur entri karantina. Lewat dari ini entri pindah ke daftar "due" dan index-nya dibangun ulang dari
 * blob lokal (`utils/sync/reindex.ts`); kalau ternyata masih rusak, ia tetap terkarantina.
 */
export const QUARANTINE_TTL_MS = 7 * 24 * 60 * 60 * 1_000

/**
 * Bentuk data di `localStorage`. `version` memberi jalan keluar kalau bentuknya perlu berubah lagi.
 *
 * `version: 1` menyimpan `owners: { [userId]: string[] }` (tanpa waktu). Bentuk itu sengaja DIBUANG,
 * bukan dimigrasikan: isinya bukan data user, hanya percepatan pemulihan. Membuangnya membuat record
 * dicoba lagi sekali - konsekuensi yang justru diinginkan fitur kedaluwarsa ini.
 */
const QUARANTINE_VERSION = 2

/** Bentuk daftar "due"; versi sendiri supaya bentuknya bisa berubah tanpa menggeser daftar utama. */
const QUARANTINE_DUE_VERSION = 1

/** Satu kelompok id yang dikarantina pada waktu yang sama. */
type QuarantineEntry = {
  readonly atMs: number
  readonly ids: readonly string[]
}

type StoredQuarantine = {
  readonly version: number
  readonly owners: Record<string, readonly QuarantineEntry[]>
}

type StoredDueQuarantine = {
  readonly version: number
  readonly owners: Record<string, readonly QuarantineEntry[]>
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

function stringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

/**
 * Ratakan entri menjadi daftar id yang masih berlaku: duplikat dibuang (id yang sama tidak dihitung
 * dua kali), id paling lama dibuang lebih dulu saat melewati `QUARANTINE_MAX_RECORDS`, dan entri
 * kosong dihilangkan. Urutan hasil tetap kronologis (lama -> baru).
 */
function normalizeEntries(entries: readonly QuarantineEntry[]): QuarantineEntry[] {
  const newestFirst: QuarantineEntry[] = []
  const seen = new Set<string>()
  let kept = 0

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry === undefined) continue

    const ids: string[] = []
    // Iterasi dari id TERBARU di batch supaya pemotongan membuang id paling lama lebih dulu.
    for (let idIndex = entry.ids.length - 1; idIndex >= 0; idIndex -= 1) {
      const id = entry.ids[idIndex]
      if (id === undefined || seen.has(id)) continue

      seen.add(id)
      ids.push(id)
      kept += 1
      if (kept >= QUARANTINE_MAX_RECORDS) break
    }

    ids.reverse()
    if (ids.length > 0) newestFirst.push({ atMs: entry.atMs, ids })
    if (kept >= QUARANTINE_MAX_RECORDS) break
  }

  return newestFirst.reverse()
}

/**
 * Baca satu daftar milik pemilik. Nilai rusak dibuang; entri yang umurnya lewat TTL dipisahkan ke
 * `due` (bukan dibuang - lihat `QUARANTINE_DUE_STORAGE_KEY`). `pruned` menandakan hasilnya perlu
 * ditulis ulang supaya bentuk di `localStorage` sama dengan yang dipakai di memori.
 */
function readEntries(
  value: unknown,
  nowMs: number,
): {
  readonly entries: QuarantineEntry[]
  readonly due: QuarantineEntry[]
  readonly pruned: boolean
} {
  if (!Array.isArray(value)) return { entries: [], due: [], pruned: true }

  const parsed: QuarantineEntry[] = []
  const expired: QuarantineEntry[] = []
  let pruned = false

  for (const raw of value) {
    if (!isRecord(raw)) {
      pruned = true
      continue
    }

    const rawIds = stringIds(raw.ids)
    const ids = [...new Set(rawIds)]
    if (ids.length !== rawIds.length) pruned = true

    const { atMs } = raw
    if (typeof atMs !== 'number' || !Number.isFinite(atMs)) {
      pruned = true
      continue
    }

    if (ids.length === 0) {
      pruned = true
      continue
    }

    if (nowMs - atMs > QUARANTINE_TTL_MS) {
      pruned = true
      expired.push({ atMs, ids })
      continue
    }

    parsed.push({ atMs, ids })
  }

  const entries = normalizeEntries(parsed)
  const parsedIdCount = parsed.reduce((total, entry) => total + entry.ids.length, 0)
  const normalizedIdCount = entries.reduce((total, entry) => total + entry.ids.length, 0)
  if (parsedIdCount !== normalizedIdCount) pruned = true

  return { entries, due: normalizeEntries(expired), pruned }
}

/**
 * Baca daftar per pemilik. Nilai rusak (JSON lama, editor dev, versi lain) dibaca sebagai kosong -
 * karantina hanya mempercepat pemulihan, bukan penjaga data, jadi lebih baik mulai dari nol daripada
 * melempar dan menghentikan sync.
 */
function readOwners(store: Storage, nowMs = Date.now()): Map<string, QuarantineEntry[]> {
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

  let pruned = false
  const owners = new Map<string, QuarantineEntry[]>()
  /** Entri yang baru saja kedaluwarsa: dipindahkan, bukan dibuang. */
  const expired = new Map<string, readonly QuarantineEntry[]>()

  for (const [ownerId, value] of Object.entries(parsed.owners)) {
    if (ownerId.length === 0) {
      pruned = true
      continue
    }

    const result = readEntries(value, nowMs)
    if (result.pruned) pruned = true
    if (result.due.length > 0) expired.set(ownerId, result.due)
    if (result.entries.length === 0) continue

    owners.set(ownerId, result.entries)
  }

  if (owners.size > QUARANTINE_MAX_OWNERS) {
    pruned = true
    trimOwners(owners)
  }

  // Yang kedaluwarsa TIDAK dibuang: ia pindah ke daftar "due" supaya index-nya bisa dibangun ulang
  // dari blob lokal (`utils/sync/reindex.ts`). Antrean ditulis LEBIH DULU: kalau kuota menolaknya,
  // daftar utama belum kehilangan id-nya - id yang hilang dari dua daftar tidak akan pernah dicoba lagi.
  //
  // Bentuk yang tidak valid tetap dibersihkan saat dibaca (bukan hanya diabaikan): kalau tidak, daftar
  // akan terus tumbuh dan record yang sudah bisa dibuka tidak pernah "bersih" dari penyimpanan.
  const movedAllExpired = expired.size === 0 || appendDue(store, expired)
  if (pruned && movedAllExpired) writeOwners(store, owners)

  return owners
}

/**
 * Baca daftar "due" per pemilik: id yang karantinanya sudah lewat TTL dan menunggu index-nya dibangun
 * ulang. Bentuknya sama dengan daftar utama, tapi TIDAK ada penyaringan umur - semuanya sudah basi.
 */
function readDue(store: Storage): Map<string, QuarantineEntry[]> {
  let raw: string | null
  try {
    raw = store.getItem(QUARANTINE_DUE_STORAGE_KEY)
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

  if (!isRecord(parsed) || parsed.version !== QUARANTINE_DUE_VERSION || !isRecord(parsed.owners)) {
    return new Map()
  }

  const owners = new Map<string, QuarantineEntry[]>()

  for (const [ownerId, value] of Object.entries(parsed.owners)) {
    if (ownerId.length === 0) continue

    const entries = readDueEntries(value)
    if (entries.length === 0) continue

    owners.set(ownerId, entries)
  }

  if (owners.size > QUARANTINE_MAX_OWNERS) trimOwners(owners)

  return owners
}

/** Validasi satu daftar "due" tanpa aturan umur; bentuk rusak cukup dilewati. */
function readDueEntries(value: unknown): QuarantineEntry[] {
  if (!Array.isArray(value)) return []

  const parsed: QuarantineEntry[] = []

  for (const raw of value) {
    if (!isRecord(raw)) continue

    const ids = [...new Set(stringIds(raw.ids))]
    const { atMs } = raw
    if (ids.length === 0) continue
    if (typeof atMs !== 'number' || !Number.isFinite(atMs)) continue

    parsed.push({ atMs, ids })
  }

  return normalizeEntries(parsed)
}

/**
 * Tambahkan entri kedaluwarsa ke daftar "due" (digabung dengan yang sudah ada).
 *
 * Mengembalikan `true` kalau antreannya benar-benar tersimpan - pemanggil memakainya untuk memutuskan
 * apakah daftar utama boleh "kehilangan" id tersebut.
 */
function appendDue(store: Storage, additions: Map<string, readonly QuarantineEntry[]>): boolean {
  const due = readDue(store)

  for (const [ownerId, entries] of additions) {
    due.set(ownerId, normalizeEntries([...(due.get(ownerId) ?? []), ...entries]))
  }

  trimOwners(due)
  return writeDue(store, due)
}

function writeDue(store: Storage, owners: Map<string, QuarantineEntry[]>): boolean {
  try {
    // Key dihapus, bukan ditulis sebagai objek kosong: `localStorage` dipakai bersama semua tab, dan
    // key kosong hanya menambah entri yang tidak berarti apa pun.
    if (owners.size === 0) {
      store.removeItem(QUARANTINE_DUE_STORAGE_KEY)
      return true
    }

    const snapshot: StoredDueQuarantine = {
      version: QUARANTINE_DUE_VERSION,
      owners: Object.fromEntries(owners),
    }

    store.setItem(QUARANTINE_DUE_STORAGE_KEY, JSON.stringify(snapshot))
    return true
  } catch {
    // Kuota penuh/mode privat: antrean tidak tersimpan, dan pemanggil tidak membuang id-nya dari daftar
    // utama - record yang id-nya hilang dari dua daftar tidak akan pernah dicoba lagi.
    return false
  }
}

/** Buang pemilik yang paling lama tidak menulis sampai jumlahnya di bawah batas. */
function trimOwners(owners: Map<string, QuarantineEntry[]>): void {
  while (owners.size > QUARANTINE_MAX_OWNERS) {
    const oldest = owners.keys().next().value
    if (oldest === undefined) return
    owners.delete(oldest)
  }
}

function writeOwners(store: Storage, owners: Map<string, QuarantineEntry[]>): void {
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

  return (
    readOwners(store)
      .get(ownerId)
      ?.some((entry) => entry.ids.includes(recordId)) ?? false
  )
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

  const nowMs = Date.now()
  const owners = readOwners(store, nowMs)
  const entries = owners.get(ownerId) ?? []
  if (entries.some((entry) => entry.ids.includes(recordId))) return

  const newest = entries[entries.length - 1]
  // Karantina dalam milidetik yang sama digabung: satu halaman dengan banyak record rusak tidak
  // menghasilkan ratusan batch kecil, dan id-id itu memang berumur sama.
  const next: QuarantineEntry[] =
    newest !== undefined && newest.atMs === nowMs
      ? [...entries.slice(0, -1), { atMs: nowMs, ids: [...newest.ids, recordId] }]
      : [...entries, { atMs: nowMs, ids: [recordId] }]

  // Pemilik ditulis ulang di urutan TERAKHIR: urutan peta = bukti terakhir menulis, jadi pemilik yang
  // paling lama tidak menulis yang dibuang saat `QUARANTINE_MAX_OWNERS` tercapai (lihat `trimOwners`).
  owners.delete(ownerId)
  owners.set(ownerId, normalizeEntries(next))
  trimOwners(owners)

  writeOwners(store, owners)
  // Id yang sama tidak boleh tinggal di daftar "due": kalau tidak, reindex akan mencoba membangun
  // index-nya lagi padahal ia baru saja gagal (dan sudah dihitung sebagai terkarantina di sini).
  removeDueIds(store, ownerId, [recordId])
}

/**
 * Jumlah record terkarantina yang MASIH berlaku milik satu pemilik - dipakai controller untuk tahu
 * apakah daftar sudah penuh (`QUARANTINE_MAX_RECORDS`). Angka akun lain tidak pernah ikut dihitung,
 * dan id duplikat tidak dihitung dua kali (dibaca lewat `normalizeEntries`).
 *
 * Entri yang sudah kedaluwarsa tidak ikut: angka untuk UI memakai `listQuarantined()`, yang menghitung
 * juga record yang menunggu index-nya dibangun ulang.
 */
export function quarantinedCount(ownerId: string): number {
  if (ownerId.length === 0) return 0

  const store = storageOrNull()
  if (store === null) return 0

  return (
    readOwners(store)
      .get(ownerId)
      ?.reduce((total, entry) => total + entry.ids.length, 0) ?? 0
  )
}

/**
 * Hapus karantina SATU pemilik - termasuk antrean "due"-nya. Dipakai setelah pemulihan kunci berhasil
 * (setelah index dibangun ulang) dan oleh aksi "Coba buka ulang": record milik akun itu dicoba lagi,
 * daftar akun lain tidak disentuh.
 */
export function clearQuarantine(ownerId: string): void {
  if (ownerId.length === 0) return

  const store = storageOrNull()
  if (store === null) return

  const owners = readOwners(store)
  if (owners.delete(ownerId)) writeOwners(store, owners)

  const due = readDue(store)
  if (due.delete(ownerId)) writeDue(store, due)
}

/** Satu id yang sedang terkarantina, beserta umur karantinanya. */
export type QuarantinedRecord = {
  readonly recordId: string
  /** Kapan id ini dikarantina (epoch ms). */
  readonly atMs: number
  /**
   * True = umurnya sudah lewat `QUARANTINE_TTL_MS` dan ia TIDAK lagi menghalangi pull. Index-nya
   * menunggu dibangun ulang dari blob lokal (`utils/sync/reindex.ts`), bukan menunggu pull mengirim
   * ulang record (cursor sudah melewatinya).
   */
  readonly isDue: boolean
}

/**
 * Semua id terkarantina milik satu pemilik: yang masih berlaku (`isDue: false`) dan yang sudah
 * kedaluwarsa (`isDue: true`).
 *
 * Dipakai `reindexQuarantined()`; tidak pernah melempar, dan daftar kosong saat storage diblokir.
 */
export function listQuarantined(ownerId: string): readonly QuarantinedRecord[] {
  if (ownerId.length === 0) return []

  const store = storageOrNull()
  if (store === null) return []

  const result: QuarantinedRecord[] = []
  const seen = new Set<string>()

  // `readOwners` lebih dulu: ia yang memindahkan entri yang baru kedaluwarsa ke daftar "due".
  //
  // Id yang sama bisa sesaat ada di dua daftar kalau proses berhenti di antara dua penulisan (antrean
  // ditulis dulu, baru daftar utama). Dedupe di sini membuat angka yang dilihat user tidak pernah dobel.
  for (const entry of readOwners(store).get(ownerId) ?? []) {
    for (const recordId of entry.ids) {
      if (seen.has(recordId)) continue
      seen.add(recordId)
      result.push({ recordId, atMs: entry.atMs, isDue: false })
    }
  }

  for (const entry of readDue(store).get(ownerId) ?? []) {
    for (const recordId of entry.ids) {
      if (seen.has(recordId)) continue
      seen.add(recordId)
      result.push({ recordId, atMs: entry.atMs, isDue: true })
    }
  }

  return result
}

/**
 * Keluarkan id tertentu dari karantina pemiliknya (daftar utama maupun antrean "due").
 *
 * Dipakai setelah index record berhasil dibangun ulang, atau saat record-nya ternyata tidak ada lagi
 * di penyimpanan - dua keadaan yang tidak butuh percobaan berikutnya.
 */
export function releaseQuarantined(ownerId: string, recordIds: readonly string[]): void {
  if (ownerId.length === 0 || recordIds.length === 0) return

  const store = storageOrNull()
  if (store === null) return

  const remove = new Set(recordIds)
  const owners = readOwners(store)
  const entries = owners.get(ownerId)
  if (entries !== undefined) {
    const kept = dropIds(entries, remove)
    if (kept.length === 0) owners.delete(ownerId)
    else owners.set(ownerId, kept)
    writeOwners(store, owners)
  }

  removeDueIds(store, ownerId, recordIds)
}

/** Buang id tertentu dari antrean "due" satu pemilik; menulis hanya kalau benar-benar berubah. */
function removeDueIds(store: Storage, ownerId: string, recordIds: readonly string[]): void {
  const due = readDue(store)
  const entries = due.get(ownerId)
  if (entries === undefined) return

  const kept = dropIds(entries, new Set(recordIds))
  if (kept.length === entries.length) return

  if (kept.length === 0) due.delete(ownerId)
  else due.set(ownerId, kept)

  writeDue(store, due)
}

/** Salinan entri tanpa id yang diminta; grup yang kosong ikut hilang. */
function dropIds(
  entries: readonly QuarantineEntry[],
  remove: ReadonlySet<string>,
): QuarantineEntry[] {
  const result: QuarantineEntry[] = []

  for (const entry of entries) {
    const ids = entry.ids.filter((recordId) => !remove.has(recordId))
    if (ids.length > 0) result.push({ atMs: entry.atMs, ids })
  }

  return result
}

/** Dipakai test: daftar tidak boleh diwarisi antar kasus. */
export function clearQuarantineForTest(): void {
  const store = storageOrNull()
  if (store === null) return

  try {
    store.removeItem(QUARANTINE_STORAGE_KEY)
    store.removeItem(QUARANTINE_DUE_STORAGE_KEY)
  } catch {
    // Storage diblokir: tidak ada yang bisa dibersihkan.
  }
}
