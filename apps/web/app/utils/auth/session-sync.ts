import { watch } from 'vue'

import { TECH_IDENTITY } from '#shared/tech-identity'
import { APP_HOME_PATH } from '~/utils/features'
import { safeRedirectPath } from '~/utils/validation'

/**
 * Sinkronisasi IDENTITAS sesi antar-tab.
 *
 * Masalahnya nyata dan bukan teoretis: cookie sesi dipakai bersama SEMUA tab di satu origin,
 * sedangkan state Vue tidak. Tab-1 login akun A, tab-2 logout lalu login akun B -> cookie sudah jadi
 * B, tapi tab-1 masih memegang `auth.session` akun A, store berisi data A, dan controller sync terus
 * mengirim batch A dengan header `x-expected-user-id` A (ditolak server berulang kali). Tab-1 baru
 * benar setelah halaman dimuat ulang. Ini sisa risiko H1 security review #76.
 *
 * Dua arah, satu modul:
 * - **keluar**: perubahan `auth.session.user.id` (login akun lain, logout, atau `refresh()` yang
 *   menemukan akun berbeda) diumumkan ke tab lain. Identitas yang sama TIDAK diumumkan - sinyal untuk
 *   identitas yang sama hanya membakar satu request `/v1/auth/session` di tiap tab.
 * - **masuk**: sinyal dari tab lain memicu `refresh()`; kalau identitasnya memang berubah, halaman
 *   dimuat ulang (bukan memutasi store satu per satu - seluruh `useState` di tab ini memang milik akun
 *   lain).
 *
 * Transport: `BroadcastChannel` kalau tersedia, `storage` event sebagai cadangan (browser lama). Di
 * SSR - dan di lingkungan mana pun tanpa keduanya - seluruh jalur no-op, bukan error.
 *
 * Modul ini SENGAJA dimuat malas oleh `plugins/auth-session.client.ts`: ia bukan bagian first paint
 * (halaman publik tidak memegang data akun yang bisa basi), dan kalau ikut graf awal ia menembus
 * budget JS awal 170 KB gzip (performance.md).
 */

/** Nama kanal. Prefix teknis `ip-` sama dengan penyimpanan lokal (`shared/tech-identity.ts`). */
export const AUTH_SESSION_CHANNEL_NAME = `${TECH_IDENTITY.storagePrefix}auth-session`

/**
 * Key `localStorage` untuk transport cadangan.
 *
 * Failover hanya memakai satu key milik app; `clearAppStorage` (logout) menyapunya bersama key
 * `ip-*` lain, dan itu tidak masalah: sinyal ini tidak perlu bertahan.
 */
export const AUTH_SESSION_SIGNAL_KEY = `${TECH_IDENTITY.storagePrefix}auth-session-signal`

/** Isi pesan: penanda tetap, tanpa data user. Penerima tidak membaca isi selain "ada perubahan". */
export const AUTH_SESSION_SIGNAL = 'identity-changed'

/**
 * Kunci penyimpanan fungsi pembersih di instance Nuxt.
 *
 * HMR di dev bisa mengevaluasi ulang pemasangan tanpa membuang instance Nuxt-nya; tanpa melepas
 * listener lama, satu sinyal ditangani dua kali dan dua permintaan `refresh()` berjalan.
 */
const CLEANUP_KEY = '_ipAuthSessionChannelCleanup'

/**
 * Penanda bahwa hook `vueApp.onUnmount` sudah dipasang untuk instance Nuxt ini.
 *
 * Pemasangan ulang (HMR) tidak boleh menambah hook baru setiap kali - hook lama akan memanggil
 * pembersih yang sudah tidak aktif, dan daftarnya tumbuh tanpa batas selama sesi dev.
 */
const UNMOUNT_HOOK_KEY = '_ipAuthSessionChannelUnmountHooked'

export type SessionChangeListener = () => void

type NuxtApplication = ReturnType<typeof useNuxtApp>
type Cleanup = () => void

/**
 * Satu kanal per tab, dipakai BERSAMA oleh pengirim dan penerima.
 *
 * Itu disengaja: `BroadcastChannel` tidak mengirim pesan ke objek yang mem-posting-nya, jadi tab
 * yang baru login/logout tidak memicu dirinya sendiri. Dua instance (satu pengirim, satu penerima)
 * akan membuat tab memanggil `refresh()` sia-sia setiap kali ia sendiri mengubah sesi.
 */
let channel: BroadcastChannel | null = null
let isChannelListening = false
let isStorageListening = false

const listeners = new Set<SessionChangeListener>()

/**
 * Kanal `BroadcastChannel`, atau `null` kalau lingkungan ini tidak mendukungnya.
 *
 * Konstruktor bisa melempar (mis. kebijakan privasi ketat), jadi kegagalan diperlakukan sama dengan
 * "tidak tersedia" - pemanggil jatuh ke `storage` event.
 */
function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null
  if (channel !== null) return channel

  try {
    channel = new BroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
  } catch {
    return null
  }

  // Node punya `unref` di BroadcastChannel-nya (dipakai test/SSR lokal): kanal pasif tidak boleh
  // menahan proses tetap hidup. Di browser fungsi ini tidak ada, jadi tidak berefek.
  const unref = (channel as BroadcastChannel & { unref?: () => void }).unref
  if (typeof unref === 'function') unref.call(channel)

  return channel
}

/** Setiap pendengar dipanggil sekali per sinyal (pendengar di sini hanya memicu kerja asinkron). */
function notifyListeners(): void {
  for (const listener of [...listeners]) listener()
}

function onStorageSignal(event: StorageEvent): void {
  // Nilai hanya penanda; `newValue === null` berarti key dihapus (mis. `clearAppStorage` saat
  // logout), bukan sinyal baru - tab lain tetap diberi tahu oleh sinyal clear() yang sebenarnya.
  if (event.key !== AUTH_SESSION_SIGNAL_KEY || event.newValue === null) return
  notifyListeners()
}

function attachTransport(): void {
  const broadcast = getChannel()

  if (broadcast !== null) {
    if (!isChannelListening) {
      broadcast.addEventListener('message', notifyListeners)
      isChannelListening = true
    }
    return
  }

  if (typeof window === 'undefined' || isStorageListening) return
  window.addEventListener('storage', onStorageSignal)
  isStorageListening = true
}

function detachTransport(): void {
  if (channel !== null && isChannelListening) {
    channel.removeEventListener('message', notifyListeners)
    isChannelListening = false
  }

  if (typeof window !== 'undefined' && isStorageListening) {
    window.removeEventListener('storage', onStorageSignal)
    isStorageListening = false
  }

  // Tidak ada pendengar = tidak perlu koneksi. Kanal ditutup supaya tab tidak menyisakan kanal tak
  // terpakai; pengumuman berikutnya membuat kanal baru (murah - sekali per perubahan identitas).
  channel?.close()
  channel = null
}

/**
 * Umumkan bahwa identitas sesi berubah. Tanpa payload - lihat catatan modul.
 *
 * Dipanggil HANYA kalau identitas benar-benar berganti (login akun lain, logout, atau `refresh()`
 * yang menemukan akun berbeda).
 */
export function announceSessionChange(): void {
  const broadcast = getChannel()

  if (broadcast !== null) {
    try {
      broadcast.postMessage(AUTH_SESSION_SIGNAL)
      return
    } catch {
      // Kanal tertutup/tidak bisa dipakai: jatuh ke `storage` supaya tab lain tetap tahu.
    }
  }

  announceWithStorage()
}

function announceWithStorage(): void {
  if (typeof window === 'undefined') return

  try {
    // `storage` event baru terkirim kalau nilainya BERUBAH, jadi nilainya diberi cap waktu. Isinya
    // tidak pernah dibaca penerima.
    window.localStorage.setItem(AUTH_SESSION_SIGNAL_KEY, String(Date.now()))
  } catch {
    // Storage diblokir (mode privat): tidak ada jalan memberi tahu tab lain. Tab basi tetap tidak
    // bisa merusak data - server menolak batch dengan identitas yang tidak cocok.
  }
}

/**
 * Dengarkan sinyal identitas sesi. Mengembalikan fungsi untuk berhenti mendengarkan.
 *
 * Modul ini yang menjaga transport hanya terpasang sekali walau `subscribe` dipanggil berkali-kali.
 */
export function subscribeSessionChange(listener: SessionChangeListener): () => void {
  listeners.add(listener)
  attachTransport()

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) detachTransport()
  }
}

/**
 * Pasang pengumum + pendengar sinyal identitas untuk satu instance Nuxt. Mengembalikan pelepasnya.
 *
 * Dipanggil `plugins/auth-session.client.ts`; dipisah ke fungsi supaya pemasangan ulang (HMR) bisa
 * diuji sebagai perilaku, bukan sebagai efek samping pemuatan modul.
 */
export function installSessionSync(nuxtApp: NuxtApplication): Cleanup {
  const auth = useAuthSession()

  const previousCleanup = nuxtApp[CLEANUP_KEY] as Cleanup | undefined
  if (typeof previousCleanup === 'function') previousCleanup()

  /** Satu rekonsiliasi pada satu waktu; sinyal beruntun tidak diantrikan (yang terakhir sudah basi). */
  let isReconciling = false

  /**
   * Sinyal diterima: tanya server siapa pemilik sesi sekarang.
   *
   * `refresh()` (bukan `ensureLoaded()`) karena state lokal justru yang sedang dicurigai; `before`
   * diambil SEBELUM request karena itulah identitas yang tampil di tab ini sekarang.
   */
  async function reconcile(): Promise<void> {
    if (isReconciling) return
    isReconciling = true

    try {
      const before = auth.session.value?.user.id ?? null
      const current = await auth.refresh()

      // Gagal menghubungi server: identitas sebenarnya belum diketahui. Reload di sini artinya
      // menebak, dan tebakan yang salah = halaman memuat ulang berulang selama offline. Guard rute
      // tetap memutuskan pada navigasi berikutnya.
      if (auth.error.value !== null) return

      const after = current?.user.id ?? null
      if (after === before) return

      // `external` = navigasi dokumen penuh: semua `useState`, store Pinia, dan sesi data lokal yang
      // sudah terbuka ikut dibuang. Tujuannya tetap halaman ini, tetapi divalidasi `safeRedirectPath`
      // (helper yang sama dengan guard/login) supaya muat ulang tidak pernah diarahkan ke URL di luar
      // app (security.md §5).
      await navigateTo(safeRedirectPath(nuxtApp._route.fullPath, APP_HOME_PATH), {
        external: true,
        replace: true,
      })
    } finally {
      isReconciling = false
    }
  }

  // Keluar: setiap perubahan identitas yang sudah diterima state ini diteruskan ke tab lain. Tanpa
  // `immediate`: saat aplikasi baru dimuat tidak ada yang perlu diumumkan.
  const stopWatchingIdentity = watch(
    () => auth.session.value?.user.id ?? null,
    (next, previous) => {
      if (next !== previous) announceSessionChange()
    },
  )

  const unsubscribe = subscribeSessionChange(() => {
    void reconcile()
  })

  const cleanup = (): void => {
    stopWatchingIdentity()
    unsubscribe()
  }

  nuxtApp[CLEANUP_KEY] = cleanup

  // Nuxt tidak punya hook `app:beforeUnmount`; `vueApp.onUnmount` adalah titik yang setara dan hanya
  // terpicu saat aplikasi benar-benar dibuang (mis. test meng-unmount root, atau HMR membuang app).
  // Dipasang SEKALI per instance: hook-nya membersihkan pemasangan yang aktif saat itu.
  if (nuxtApp[UNMOUNT_HOOK_KEY] !== true) {
    nuxtApp[UNMOUNT_HOOK_KEY] = true
    nuxtApp.vueApp.onUnmount(() => {
      const active = nuxtApp[CLEANUP_KEY] as Cleanup | undefined
      active?.()
      nuxtApp[CLEANUP_KEY] = undefined
    })
  }

  return cleanup
}

/** Dipakai test: pendengar & transport tidak boleh diwarisi antar kasus. */
export function resetSessionSyncForTest(): void {
  listeners.clear()
  detachTransport()
}
