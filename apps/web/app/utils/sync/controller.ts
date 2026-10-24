import {
  SYNC_DEBOUNCE_MS,
  pullDelta,
  pushOutbox,
  readSyncStatus,
  type HttpClient,
  type StorageAdapter,
  type SyncStatus,
} from '@improve-personal/core'

import type { LocalDataSession } from '../storage/session'
import { RecordKeyError, decodeRecord } from '../storage/record-codec'
import { RECORD_INDEX_KEEP, type RecordIndexDecision } from '../storage/index-decision'
import { indexEntryForRecord } from '../io/index-entry'
import { createSyncHttpClient } from './client'
import { LOCAL_WRITE_EVENT, notifyRemoteApplied, notifySyncState } from './events'
import { isQuarantined, quarantineRecord } from './quarantine'

/**
 * Pengendali sync di sisi web: kapan push/pull dijalankan, dan bagaimana kegagalannya terlihat.
 *
 * Pembagian tugasnya sengaja:
 * - `packages/core/src/sync` memutuskan APA yang dikirim/diterapkan (LWW, cursor, tombstone).
 * - Berkas ini hanya memasang pemicu platform: app_open, reconnect, resume, interval 5 menit, dan
 *   debounce setelah tulis lokal. Tidak ada logika merge di sini.
 *
 * Dua invarian yang menjaga akun tidak tercampur (QA T76 B1):
 * 1. **Satu siklus per satu generasi.** Tiap `startSync` menaikkan `generation` dan pemilik satu
 *    `AbortController`. `stopSync` membatalkan request yang sedang jalan; siklus generasi lama tidak
 *    pernah menyentuh state generasi baru (cek `active.generation === myGen && active.session.userId`).
 * 2. **Tidak ada request tanpa identitas.** Client bawaan mengirim `x-expected-user-id`; server
 *    menolak request yang cookie-nya sudah berganti akun (mis. login akun lain di tab sebelah).
 *
 * Satu proses sync pada satu waktu. Pemicu yang datang saat proses berjalan tidak memulai proses
 * kedua; mereka menandai `pendingRun` supaya siklus berikutnya menyusul. Tanpa itu, dua push
 * bersamaan bisa mengirim batch yang sama dan dua pull bisa saling menimpa cursor.
 *
 * Record hasil pull yang gagal didekripsi TIDAK pernah dilewati diam-diam: pull berhenti sebelum
 * cursor maju. Satu-satunya pengecualian adalah record yang sudah terbukti rusak - tiga siklus gagal
 * berturut-turut SETELAH kunci sesi terbukti (`PullKeyFailures.keyProven`). Record itu dikarantina
 * (`./quarantine.ts`), lalu siklus berikutnya memakai index `RECORD_INDEX_KEEP` sehingga pull bisa
 * maju tanpa menghapus index lama dan tanpa kehilangan blob. Selama bukti kunci belum ada, SEMUA
 * kegagalan dibaca sebagai masalah kunci/sesi dan tidak ada record yang disimpulkan rusak.
 */

const FOREGROUND_INTERVAL_MS = 5 * 60 * 1_000
/** Pagar anti-loop kalau outbox terus bertambah saat sync berjalan. */
const MAX_PUSH_BATCHES = 100

/**
 * Berapa siklus pull BERTURUT-TURUT satu record boleh gagal dibuka sebelum dinyatakan rusak.
 *
 * Tiga cukup untuk membedakannya dari kegagalan sesaat (kunci baru dipulihkan di tengah, storage
 * sedang sibuk) tanpa membuat user menunggu 5 menit x 3 sebelum datanya bisa masuk.
 */
const QUARANTINE_AFTER_KEY_FAILURES = 3

export type SyncOutcome = {
  readonly pushed: number
  readonly pulled: number
  readonly status: SyncStatus
}

type ActiveSync = {
  /**
   * Nomor urut controller. Naik setiap `startSync`; dipakai siklus yang sedang berjalan untuk tahu
   * apakah ia masih pemilik `active` atau sudah basi.
   */
  readonly generation: number
  readonly session: LocalDataSession
  readonly baseUrl: string
  readonly http: HttpClient
  /**
   * Dibatalkan `stopSync()`. Request yang sedang menunggu jaringan ikut batal - bukan dibiarkan
   * selesai membawa data sesi lama ke server yang cookie-nya sudah akun lain.
   */
  readonly abort: AbortController
  readonly debounceTimer: { current: ReturnType<typeof setTimeout> | null }
  readonly intervalTimer: ReturnType<typeof setInterval>
  readonly onLocalWrite: () => void
  readonly onOnline: () => void
  readonly onVisibility: () => void
}

type InFlight = {
  readonly generation: number
  readonly promise: Promise<SyncOutcome | null>
}

let active: ActiveSync | null = null
let generationCounter = 0
let inFlight: InFlight | null = null
let pendingPull = false
let pendingRun = false

/**
 * Kegagalan kunci BERTURUT-TURUT per id record, lintas siklus pull.
 *
 * Module-level (bukan per `execute`) karena bukti "record ini rusak" butuh tiga siklus. Direset saat
 * sesi baru dipasang (`startSync`) dan saat record yang sama berhasil dibuka lagi - kalau tidak,
 * kegagalan lama akan ikut menghukum pemulihan kunci yang berhasil.
 */
const consecutiveKeyFailures = new Map<string, number>()

/**
 * Apakah kunci data sesi ini benar-benar kunci AKUN ini - dibuktikan oleh sesinya, bukan oleh record
 * hasil pull.
 *
 * Kenapa `isFreshKey === false` adalah bukti yang sah: `openLocalDataSession` hanya berhasil kalau
 * perangkat punya slot `device` LALU `unwrapMasterKeyWithDevice` membuka bungkus kunci utama. Itu
 * AES-KW: unwrap-nya terautentikasi (kunci pembuka yang salah atau envelope yang diubah = exception,
 * bukan byte sampah), dan `openLocalDataSession` melempar sebelum controller dipasang
 * (`crypto/device-slot.ts`, `storage/session.ts`). Jadi `isFreshKey === false` berarti kunci data
 * berasal dari envelope akun yang SUDAH ADA di perangkat ini, bukan kunci baru yang dibuat sesi ini.
 *
 * Kenapa bukti ini penting ada di level sesi: kalau bukti hanya berasal dari record yang berhasil
 * dibuka di proses berjalan, ia hilang setiap reload/keluar-masuk `/app` (QA T78 B3) dan tidak pernah
 * didapat kalau halaman pertama seluruhnya rusak (QA T78 B4) - dua bentuk yang membuat pull macet
 * permanen. Bukti ini statis per sesi, jadi tahan reload dan berlaku sejak halaman pertama.
 *
 * `isFreshKey === true` (perangkat pertama akun yang baru membuat kunci di sini) sengaja TIDAK
 * dihitung: di keadaan itu tidak ada envelope akun yang memverifikasi apa pun, sehingga record remote
 * yang tidak bisa dibuka memang layak dicurigai sebagai masalah kunci - kita tetap fail-closed.
 */
function isSessionKeyProven(session: LocalDataSession): boolean {
  return session.isFreshKey === false
}

/** Apa yang diketahui satu siklus pull tentang record yang gagal dibuka. */
type PullKeyFailures = {
  /** Pemilik data (akun) yang sedang sync; daftar karantina disimpan per pemilik. */
  readonly ownerId: string
  /** Record yang gagal dibuka, beserta error aslinya (id = kunci peta). */
  readonly failures: Map<string, RecordKeyError>
  /** Keputusan sudah diambil; mencegah penghitung naik dua kali kalau transaksi diulang adapter. */
  abortedWith: RecordKeyError | null
  /** Karantina baru terjadi di siklus ini, jadi status `error` tidak boleh ditinggalkan. */
  quarantined: boolean
  /**
   * Apakah kunci sesi ini terbukti bisa membuka record akun ini.
   *
   * Milik SATU SIKLUS (objek ini dibuat per `execute`), bukan flag modul: siklus basi yang selesai
   * setelah sesi/akun berganti tidak bisa mewariskan bukti ke generasi berikutnya (A1 review
   * keamanan). Nilai awalnya dari sesi (`isSessionKeyProven`), lalu dinaikkan oleh dekripsi remote
   * yang berhasil DI GENERASI INI (`buildIndex`).
   */
  keyProven: boolean
}

function newPullKeyFailures(ownerId: string, keyProven: boolean): PullKeyFailures {
  return { ownerId, failures: new Map(), abortedWith: null, quarantined: false, keyProven }
}

/**
 * Apakah siklus `current` sudah bukan milik pengendali aktif? Terjadi saat `stopSync` (logout, pindah
 * rute, reload), ganti sesi/akun, atau generasi yang lebih baru dipasang.
 *
 * Dipakai `execute` sebagai pagar di setiap `await`, dan dipakai `buildIndex` karena `indexFor`
 * dipanggil core DI LUAR transaksi: hasil dekripsi bisa mendarat setelah sesi berganti, dan hasil itu
 * tidak boleh menambah bukti (atau apa pun) untuk generasi berikutnya.
 */
function isGenerationStale(current: ActiveSync): boolean {
  return (
    active === null ||
    active.generation !== current.generation ||
    active.session.userId !== current.session.userId
  )
}

/** Mulai (atau ganti) pengendali untuk sesi data lokal yang sudah terbuka. */
export function startSync(
  session: LocalDataSession,
  baseUrl: string,
  options: { readonly http?: HttpClient; readonly autoStart?: boolean } = {},
): () => void {
  stopSync()

  generationCounter += 1
  const generation = generationCounter
  const abort = new AbortController()

  // Bukti "record rusak" terikat ke AKUN yang membuka data: akun berikutnya tidak boleh mewarisi
  // penghitung (bisa langsung mengarantina record pertamanya). Daftar karantina sendiri disimpan per
  // pemilik (`./quarantine.ts`), jadi akun lain tidak menghapus milik akun ini.
  //
  // Bukti kunci tidak direset di sini karena ia bukan state modul: tiap siklus memulainya dari
  // `isSessionKeyProven(session)` + dekripsi sukses di generasi itu sendiri (`execute`). Tidak ada
  // yang bisa diwariskan siklus basi ke generasi baru (A1), dan `stopSync` tidak perlu menyapu apa pun.
  consecutiveKeyFailures.clear()

  // Client bawaan selalu membawa identitas pemilik sesi. `http` yang disuntik (test/tool) memikul
  // tanggung jawab yang sama, tetapi tidak dipaksa di sini supaya controller tetap bisa diuji tanpa
  // jaringan.
  const http = options.http ?? createSyncHttpClient({ baseUrl, expectedUserId: session.userId })
  const debounceTimer: { current: ReturnType<typeof setTimeout> | null } = { current: null }

  const onLocalWrite = (): void => {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      void runSync({ pull: false })
    }, SYNC_DEBOUNCE_MS)
  }

  const onOnline = (): void => {
    void runSync({ pull: true })
  }

  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') void runSync({ pull: true })
  }

  const intervalTimer = setInterval(() => {
    void runSync({ pull: true })
  }, FOREGROUND_INTERVAL_MS)

  active = {
    generation,
    session,
    baseUrl,
    http,
    abort,
    debounceTimer,
    intervalTimer,
    onLocalWrite,
    onOnline,
    onVisibility,
  }

  window.addEventListener(LOCAL_WRITE_EVENT, onLocalWrite)
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisibility)

  // app_open: jalan sekali saat sesi siap, tidak menunggu timer pertama.
  if (options.autoStart !== false) void runSync({ pull: true })

  return stopSync
}

/**
 * Hentikan pengendali aktif. Idempoten: memanggilnya dua kali (atau saat belum pernah start) aman.
 *
 * Request yang sedang jalan DIBATALKAN, dan `inFlight` dilepas: siklus akun berikutnya tidak boleh
 * menunggu - atau mewarisi hasil - promise milik akun sebelumnya.
 */
export function stopSync(): void {
  const current = active
  if (current === null) return

  window.removeEventListener(LOCAL_WRITE_EVENT, current.onLocalWrite)
  window.removeEventListener('online', current.onOnline)
  document.removeEventListener('visibilitychange', current.onVisibility)
  if (current.debounceTimer.current !== null) clearTimeout(current.debounceTimer.current)
  clearInterval(current.intervalTimer)

  current.abort.abort()

  active = null
  inFlight = null
  pendingPull = false
  pendingRun = false
}

/** Dipakai tombol "Coba lagi" di indikator status. */
export function requestSyncNow(): void {
  void runSync({ pull: true })
}

/**
 * Satu siklus sync. `pull` hanya diminta untuk app_open/reconnect/resume/interval; setelah tulis
 * lokal cukup push, karena cursor tidak berubah dan pull tambahan hanya membakar kuota.
 */
export function runSync(options: { readonly pull: boolean }): Promise<SyncOutcome | null> {
  const current = active
  if (current === null) return Promise.resolve(null)

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    notifySyncState()
    return Promise.resolve(null)
  }

  pendingRun = true
  pendingPull ||= options.pull
  if (inFlight !== null && inFlight.generation === current.generation) return inFlight.promise

  const generation = current.generation
  const promise = execute(current).finally(() => {
    // Generasi lain sudah mengambil alih (`stopSync` melepas `inFlight`): akhir siklus akun lama
    // tidak boleh menutup siklus akun baru, apalagi menjadwalkan siklus untuknya.
    if (inFlight?.promise !== promise) return

    inFlight = null

    // Pemicu yang datang saat siklus ini berjalan tidak boleh hilang (mis. user menulis lagi saat
    // push sedang mengirim). Jalankan satu siklus susulan; `pendingPull` menentukan perlu pull atau
    // cukup push.
    if (pendingRun && active?.generation === generation) {
      pendingRun = false
      void runSync({ pull: pendingPull })
    }
  })

  inFlight = { generation, promise }
  return promise
}

async function execute(current: ActiveSync): Promise<SyncOutcome | null> {
  const mySession = current.session

  /**
   * Siklus ini masih milik sesi yang aktif? Diperiksa SEBELUM dan SESUDAH tiap await besar: `stopSync`
   * (logout, ganti akun, pindah rute) bisa terjadi kapan saja saat request menunggu jaringan.
   */
  const isStale = (): boolean => isGenerationStale(current)

  if (isStale()) return null

  // Permintaan yang sudah memicu siklus ini dianggap tertangani; permintaan BARU selama menunggu
  // jaringan akan menyalakan `pendingRun` lagi lewat `runSync`.
  pendingRun = false

  const { baseUrl, http, abort } = current
  const nowMs = (): number => mySession.clock.nowMs()

  let pushed = 0
  let pulled = 0
  /** Diisi selama pull; dipakai `catch` untuk tahu apakah karantina baru saja terjadi. */
  const keyFailures = newPullKeyFailures(mySession.userId, isSessionKeyProven(mySession))

  try {
    // Push berulang: satu panggilan hanya mengirim maksimal satu batch. Import besar bisa
    // meninggalkan ribuan baris, dan timer tidak boleh menunggu 5 menit untuk batch berikutnya.
    for (let batch = 0; batch < MAX_PUSH_BATCHES; batch += 1) {
      if (isStale() || !navigator.onLine) break

      const summary = await pushOutbox({
        storage: mySession.storage,
        http,
        url: `${baseUrl}/v1/sync/push`,
        nowMs: nowMs(),
        hlc: mySession.hlc,
        signal: abort.signal,
      })

      if (isStale()) return null

      pushed += summary.sent
      if (summary.sent === 0 || summary.status === 'offline' || summary.status === 'error') break
      if ((await mySession.storage.countOutbox()) === 0) break
    }

    // Hanya generasi pemilik yang boleh mengonsumsi permintaan pull - kalau tidak, permintaan milik
    // akun baru ikut terpakai oleh siklus akun lama.
    if (isStale()) return null

    const shouldPull = pendingPull
    pendingPull = false

    if (shouldPull && navigator.onLine) {
      const summary = await pullDelta({
        storage: guardPullMerge(mySession.storage, keyFailures),
        http,
        url: `${baseUrl}/v1/sync/pull`,
        nowMs: nowMs(),
        hlc: mySession.hlc,
        signal: abort.signal,
        indexFor: (remote) => buildIndex(current, remote, keyFailures),
      })

      if (isStale()) return null

      pulled += summary.applied

      // Hanya pull yang BENAR-BENAR menerapkan sesuatu yang memicu muat ulang store: pull kosong
      // terjadi tiap 5 menit dan tidak boleh membuat halaman membaca ulang penyimpanan.
      if (summary.applied > 0) notifyRemoteApplied()
    }

    const status = await readSyncStatus({
      storage: mySession.storage,
      online: navigator.onLine,
    })

    return { pushed, pulled, status }
  } catch {
    if (isStale()) return null

    // Karantina baru = siklus ini "gagal" hanya karena record yang sudah dinyatakan rusak belum
    // dilewati. Jangan tinggalkan status `error` (user tidak punya aksi yang bisa memperbaikinya) dan
    // jadwalkan SATU siklus susulan lewat mekanisme `pendingRun` yang sudah ada: siklus itu memakai
    // `RECORD_INDEX_KEEP` untuk record karantina, jadi pull bisa maju sekarang - bukan 5 menit lagi.
    if (keyFailures.quarantined) {
      pendingRun = true
      pendingPull = true

      const status = await readSyncStatus({
        storage: mySession.storage,
        online: navigator.onLine,
      }).catch(() => 'error' as const)

      return { pushed, pulled, status }
    }

    // Kegagalan yang tidak ditangani core (mis. `RecordKeyError`: kunci tidak bisa membuka record,
    // atau adapter storage gagal) berarti siklus berhenti di TENGAH. Statusnya ditandai `error`
    // supaya indikator tidak menampilkan "menunggu/tersinkron" padahal ada yang gagal dan supaya user
    // mendapat tombol coba lagi. Kalau penandaan itu pun gagal, status dibaca apa adanya dari storage.
    const status = await markError(mySession.storage).catch(() =>
      readSyncStatus({ storage: mySession.storage, online: navigator.onLine }).catch(
        () => 'error' as const,
      ),
    )

    return { pushed, pulled, status }
  } finally {
    if (!isStale()) notifySyncState()
  }
}

/** Tandai `sync_state.status = 'error'` - satu-satunya jalur yang membuat UI menawarkan coba lagi. */
async function markError(storage: StorageAdapter): Promise<SyncStatus> {
  await storage.runTransaction('sync.error', async (tx) => {
    await tx.patchSyncState({ status: 'error' })
  })

  return 'error'
}

/**
 * `record_index` untuk record hasil pull.
 *
 * Tipe dan rentang ada DI DALAM blob, jadi harus didekripsi dulu. Dua kelas kegagalan diperlakukan
 * berbeda - dan bedanya menjaga data:
 *
 * - **Kunci/kripto gagal (`RecordKeyError`)**: dicatat di `keyFailures` lalu `'keep'` dikembalikan
 *   BUKAN dilempar. Core perlu terus mendekripsi record lain supaya kita bisa membedakan "kunci salah"
 *   (semua gagal) dari "satu record rusak" (kunci sudah terbukti bisa membuka record lain di sesi ini).
 *   Keputusan dan penghentian pull terjadi sebelum halaman ditulis - lihat `decidePullKeyFailures`.
 *   Kalau `'keep'` dibiarkan lolos sampai transaksi, cursor akan maju di atas record yang belum tentu
 *   terbaca; itu yang dilarang.
 * - **Payload/skema tidak dikenal**: hanya index record itu yang tidak bisa dibangun. Record tetap
 *   disimpan dan baris index lama DIBIARKAN (`'keep'`) - `null` akan MENGHAPUS-nya dan membuat record
 *   hilang dari UI/export selamanya.
 *
 * Record yang sudah dikarantina tidak dicoba dibuka lagi: kegagalannya deterministik, dan mencoba
 * ulang tiap siklus berarti pull berhenti selamanya.
 */
async function buildIndex(
  current: ActiveSync,
  remote: {
    readonly id: string
    readonly hlc: string
    readonly deleted: boolean
    readonly blob: string
  },
  keyFailures: PullKeyFailures,
): Promise<RecordIndexDecision> {
  const session = current.session

  if (isQuarantined(session.userId, remote.id)) return RECORD_INDEX_KEEP

  const now = session.clock.nowMs()

  let record
  try {
    record = await decodeRecord(session.provider, session.dataKey, {
      ...remote,
      createdAtMs: now,
      updatedAtMs: now,
    })
  } catch (error) {
    if (!(error instanceof RecordKeyError)) return RECORD_INDEX_KEEP

    keyFailures.failures.set(error.recordId, error)
    return RECORD_INDEX_KEEP
  }

  // Kunci generasi ini terbukti bisa membuka record: mulai sekarang kegagalan record LAIN boleh
  // dinilai sebagai "record itu rusak", bukan "kunci salah" (lihat `decidePullKeyFailures`).
  //
  // Bukti ditulis ke objek SIKLUS INI (bukan flag modul) dan hanya kalau generasinya masih aktif:
  // dekripsi ini terjadi di luar transaksi, jadi bisa mendarat setelah sesi/akun berganti. Siklus basi
  // tidak boleh "meminjamkan" bukti kunci ke generasi berikutnya (A1 review keamanan).
  if (!isGenerationStale(current)) keyFailures.keyProven = true
  // Record yang sama berhasil dibuka = rangkaian kegagalannya putus. Tanpa ini, "3 kali gagal" berarti
  // "3 kali seumur hidup", bukan berturut-turut.
  consecutiveKeyFailures.delete(remote.id)

  return indexEntryForRecord(record, now)
}

/**
 * Bungkus storage untuk satu siklus pull: tolak transaksi merge kalau masih ada record yang gagal
 * dibuka dan belum dinyatakan rusak.
 *
 * Kenapa di transaksi, bukan langsung di `indexFor`: keputusan "kunci salah vs satu record rusak"
 * butuh hasil dekripsi SELURUH halaman. Melempar di record pertama membuat record lain tidak pernah
 * dicoba, sehingga kunci yang salah dan record rusak terlihat sama. Merge adalah titik terakhir sebelum
 * record ditulis dan cursor maju - di situlah penolakan harus terjadi.
 */
function guardPullMerge(storage: StorageAdapter, keyFailures: PullKeyFailures): StorageAdapter {
  const guarded: StorageAdapter = {
    ...storage,
    runTransaction: (label, fn) => {
      const abort = label === 'sync.pull.merge' ? decidePullKeyFailures(keyFailures) : null
      if (abort !== null) return Promise.reject(abort)

      return storage.runTransaction(label, fn)
    },
  }

  return guarded
}

/**
 * Putuskan apa arti kegagalan kunci di satu siklus pull, lalu kembalikan error untuk membatalkan merge.
 *
 * Aturannya:
 * - **Kunci belum terbukti** (`keyFailures.keyProven === false`) = masalah kunci/sesi, bukan record
 *   rusak. Pull berhenti, `status = 'error'`, tidak ada karantina. Mengarantina di sini akan
 *   menyembunyikan kunci yang salah sebagai "data rusak" dan membiarkan pull melewati SEMUA data yang
 *   tak terbaca.
 *
 *   Bukti yang dipakai adalah bukti LEVEL SESI, bukan "ada record lain yang berhasil di halaman/siklus
 *   ini". Penghitung per halaman selalu 0 begitu cursor parkir di halaman yang hanya berisi record
 *   rusak, sehingga kasus paling penting (record rusak = record terbaru di halaman terakhir) tidak
 *   pernah pulih (QA T78 B1). Dua sumber bukti, keduanya tidak bergantung pada halaman yang sedang
 *   diproses:
 *   1. sesi dibuka dengan kunci yang sudah ada (`isFreshKey === false`) - lihat
 *      `isSessionKeyProven`; statis per sesi sehingga tahan reload (B3) dan berlaku di halaman
 *      pertama (B4);
 *   2. ada record remote yang berhasil didekripsi di GENERASI ini (`buildIndex`) - bukti tambahan
 *      untuk sesi dengan kunci baru; disimpan per siklus supaya siklus basi tidak bisa mewariskannya
 *      (A1).
 *
 *   Kunci salah tetap tertangkap karena ia membuat record PERTAMA di sesi pun gagal, dan perangkat
 *   dengan kunci baru tetap fail-closed sampai ia benar-benar membuka satu record.
 * - **Kunci sudah terbukti** = record yang gagal memang rusak. Penghitungnya naik; setelah
 *   `QUARANTINE_AFTER_KEY_FAILURES` siklus berturut-turut record itu dikarantina supaya siklus
 *   berikutnya bisa maju dengan index `'keep'`.
 */
function decidePullKeyFailures(keyFailures: PullKeyFailures): RecordKeyError | null {
  if (keyFailures.failures.size === 0) return null
  if (keyFailures.abortedWith !== null) return keyFailures.abortedWith

  const firstFailure = keyFailures.failures.values().next().value
  if (firstFailure === undefined) return null

  if (!keyFailures.keyProven) {
    keyFailures.abortedWith = firstFailure
    return firstFailure
  }

  for (const recordId of keyFailures.failures.keys()) {
    const failures = (consecutiveKeyFailures.get(recordId) ?? 0) + 1

    if (failures < QUARANTINE_AFTER_KEY_FAILURES) {
      consecutiveKeyFailures.set(recordId, failures)
      continue
    }

    quarantineRecord(keyFailures.ownerId, recordId)
    consecutiveKeyFailures.delete(recordId)

    // Storage bisa menolak tulisan (mode privat/penuh). Jangan menjanjikan pemulihan yang tidak
    // terjadi: kalau karantina tidak benar-benar berlaku, siklus berikutnya tetap akan gagal dan
    // status `error` memang jawaban yang jujur.
    if (isQuarantined(keyFailures.ownerId, recordId)) keyFailures.quarantined = true
  }

  keyFailures.abortedWith = firstFailure
  return firstFailure
}
