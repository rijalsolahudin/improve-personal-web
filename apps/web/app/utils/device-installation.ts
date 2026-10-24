import type { Clock } from '@improve-personal/core'
import { uuidSchema } from '@improve-personal/contracts'

import { TECH_IDENTITY } from '#shared/tech-identity'
import { createUuidV7Generator } from '~/utils/storage/uuid'

/**
 * Id INSTALASI browser: UUIDv7 yang dibuat sekali per instalasi dan disimpan di perangkat.
 *
 * Kenapa perlu: nama perangkat diturunkan dari User-Agent (`"Chrome di Linux"`), jadi dua mesin - atau
 * dua profil Chrome di mesin yang sama - menghasilkan nama yang sama persis. Server memakai
 * `name` + `platform` untuk mencocokkan baris perangkat, sehingga login di perangkat kedua memakai
 * baris yang sama dengan perangkat pertama dan rotasi sesi saat login mematikan sesi yang lain
 * (Ergonio #80). `installationId` adalah pembeda utamanya; nama tetap dikirim untuk ditampilkan.
 *
 * **Nilainya BUKAN kredensial.** Server hanya memakainya untuk memilih baris `devices` mana yang
 * dipakai ulang, tidak pernah untuk otorisasi apa pun - siapa pun yang bisa membaca `localStorage`
 * sudah memegang origin ini. Karena itu id ini juga DILARANG masuk log (lihat `shared-security.md`):
 * tidak ada nilainya untuk debugging, dan ia penanda perangkat yang stabil.
 *
 * Bentuk yang dihasilkan harus lolos `uuidSchema` di kontrak (karena itu UUIDv7 dari generator repo,
 * bukan `crypto.randomUUID()` yang v4 - schema memang menerima versi apa pun, tapi satu generator
 * membuat bentuk id perangkat seragam dengan id lain di app).
 *
 * Semua jalur aman saat SSR, saat `localStorage` diblokir (mode privat), dan saat isinya rusak:
 * fungsi ini TIDAK PERNAH melempar. Login tidak boleh gagal hanya karena storage perangkat bermasalah.
 */

/** Awalan `ip-` (sama dengan `storagePrefix`): ikut dikenali sebagai milik app. */
export const INSTALLATION_ID_STORAGE_KEY = `${TECH_IDENTITY.storagePrefix}install-id`

/**
 * Jam untuk generator UUIDv7.
 *
 * Ditulis lokal, bukan `createSystemClock()` dari core: modul ini ikut chunk login yang dimuat malas
 * (lihat `useAuthGateway`), dan mengimpor barrel core hanya untuk `Date.now()` menambah berat chunk
 * yang tidak ada gunanya. `monotonicMs` tidak dipakai generator id, jadi nilainya hanya memenuhi
 * bentuk `Clock`.
 */
const SYSTEM_CLOCK: Clock = {
  nowMs: () => Date.now(),
  monotonicMs: () => Date.now(),
}

const generateInstallationId = createUuidV7Generator({ clock: SYSTEM_CLOCK })

/**
 * Id yang sudah ditetapkan pada sesi halaman ini - APA PUN asal-usulnya.
 *
 * `requestEmailOtp` dan `verifyEmailOtp` harus mengaku sebagai satu instalasi. Tanpa cache, kondisi
 * yang membuat id tidak bisa disimpan (storage melempar, nilai rusak) menghasilkan id berbeda tiap
 * panggilan: server membuat baris perangkat di request OTP lalu baris kedua saat verify, satu login
 * memakai dua slot perangkat dan lama-lama kena `DEVICE_LIMIT_REACHED`.
 *
 * Tidak diisi saat SSR: modul ini hidup di proses server yang dipakai banyak request, jadi cache di
 * sana akan membagikan satu id ke semua user. Login berjalan di client, jadi server tidak butuh id
 * yang stabil antar panggilan.
 */
let sessionInstallationId: string | null = null

type StoredValue =
  | { readonly kind: 'missing' }
  | { readonly kind: 'valid'; readonly value: string }
  | { readonly kind: 'unusable' }

/** `true` saat kode berjalan di browser; `false` saat SSR (tidak ada `window`). */
function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

/** `localStorage` kalau ada dan bisa diakses; `null` saat SSR atau storage diblokir. */
function openStorage(): Storage | null {
  try {
    if (!isBrowser()) return null
    return window.localStorage
  } catch {
    // Safari/Chrome mode privat bisa melempar saat properti diakses, bukan hanya saat ditulis.
    return null
  }
}

/**
 * Baca nilai tersimpan dan pilah tiga keadaan yang berbeda perlakuannya.
 *
 * `missing` dan `unusable` tidak boleh disamakan: yang kosong boleh diisi id baru, sedangkan yang
 * RUSAK dibiarkan apa adanya. Menimpanya berarti menghapus jejak bahwa storage perangkat ini bermasalah
 * (isi yang tidak bisa dibaca bisa berasal dari versi lain yang sedang menulis key yang sama), dan id
 * instalasi tidak cukup penting untuk melakukan itu.
 */
function readStored(storage: Storage): StoredValue {
  let raw: string | null

  try {
    raw = storage.getItem(INSTALLATION_ID_STORAGE_KEY)
  } catch {
    return { kind: 'unusable' }
  }

  if (raw === null) return { kind: 'missing' }

  const parsed = uuidSchema.safeParse(raw)
  return parsed.success ? { kind: 'valid', value: parsed.data } : { kind: 'unusable' }
}

/**
 * Id instalasi untuk pemanggil sekarang.
 *
 * Idempoten: nilai yang sah dipakai ulang, dan id yang baru dibuat di-cache untuk sisa sesi halaman -
 * termasuk saat storage melempar atau isinya rusak, karena kondisi itu tidak boleh membuat request OTP
 * dan verify mengaku sebagai dua instalasi. Saat SSR hasilnya id baru per panggilan (lihat komentar
 * `sessionInstallationId`). Fungsi ini tidak pernah melempar.
 */
export function currentInstallationId(): string {
  if (sessionInstallationId !== null) return sessionInstallationId

  // SSR: jangan sentuh storage dan jangan cache (cache modul di server lintas request).
  if (!isBrowser()) return generateInstallationId()

  const storage = openStorage()

  // Browser tapi `window.localStorage` melempar saat properti diakses (mode privat lama, WebView
  // dengan DOM storage dimatikan): tetap cache id untuk halaman ini supaya OTP request + verify
  // memakai instalasi yang sama. Tidak ada yang ditulis - storage-nya memang tidak bisa dipakai.
  if (storage === null) {
    sessionInstallationId = generateInstallationId()
    return sessionInstallationId
  }

  const stored = readStored(storage)

  if (stored.kind === 'valid') {
    sessionInstallationId = stored.value
    return stored.value
  }

  const generated = generateInstallationId()

  if (stored.kind === 'missing') {
    try {
      storage.setItem(INSTALLATION_ID_STORAGE_KEY, generated)
    } catch {
      // Kuota penuh / diblokir: id tetap dipakai untuk halaman ini supaya login bisa jalan.
    }
  }

  sessionInstallationId = generated
  return generated
}

/** Dipakai test: cache modul tidak boleh diwarisi antar kasus. */
export function resetInstallationIdForTest(): void {
  sessionInstallationId = null
}
