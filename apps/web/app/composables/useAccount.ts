import type { DeviceDto } from '@improve-personal/contracts'
import type { SecureKeyStore } from '@improve-personal/core'

import {
  DevicesRequestError,
  createDevicesGateway,
  type DevicesGateway,
} from '~/utils/account/devices-gateway'
import { KeysRequestError, createKeysGateway, type KeysGateway } from '~/utils/crypto/keys-gateway'
import { buildBackupCode } from '~/utils/account/backup-code'
import { RECOVERY_MATERIAL_KIND } from '~/utils/account/recovery-file'
import {
  createVerifiedPasskeyEnvelope,
  readPasskeyMaterial,
  savePasskeyMaterial,
  toEnvelopePutInput,
} from '~/utils/crypto/passkey'
import {
  createRecoveryEnvelope,
  createRecoveryWords,
  type RecoveryEnvelope,
} from '~/utils/crypto/recovery'
import {
  createWebAuthnAuthenticator,
  createWebAuthnRegistrar,
  deriveWebAuthnUserHandle,
  isWebAuthnAvailable,
} from '~/utils/crypto/webauthn'
import { BRAND } from '#shared/brand'
import type { JsonFetch } from '~/utils/http/json-fetch'

import { useLocalData } from './useLocalData'

/**
 * Halaman "Akun & perangkat": status pembuka kunci + perangkat (PRD T22, ARCHITECTURE §7).
 *
 * Aturan yang menentukan bentuk composable ini:
 *
 * - **Pembuka kunci = passkey.** Versi sebelumnya meminta user menulis 24 kata; itu dihapus dari UI
 *   karena membingungkan. Envelope passkey dititip ke server (satu-satunya slot yang boleh, ADR 10-11),
 *   sedangkan PRF dari authenticator tidak pernah keluar dari perangkat.
 * - **Kunci utama hanya hidup selama operasi.** Pembuatan envelope lewat `withMasterKey`, yang membuka
 *   kunci utama dari pembuka perangkat lalu mengosongkannya lagi.
 * - **Tidak ada bahan kunci di `useState`.** Status (non-rahasia) boleh; bahan kunci tidak - `useState`
 *   ikut diserialisasi ke `window.__NUXT__` (security.md §2).
 */

export type KeySlotStatus = 'unset' | 'set'

export type AccountDevice = DeviceDto & { readonly isCurrent: boolean }

export type UseAccountOptions = {
  /** Transport HTTP, disuntik di test. Default `$fetch` (cookie sesi ikut otomatis). */
  readonly request?: JsonFetch
  /** Penyimpan kunci, disuntik di test. Default database kunci aplikasi. */
  readonly keyStore?: SecureKeyStore
}

export function useAccount(options: UseAccountOptions = {}) {
  const localData = useLocalData()
  const request: JsonFetch = options.request ?? ((path, init) => $fetch(path, init))
  const keys: KeysGateway = createKeysGateway(request)
  const devices: DevicesGateway = createDevicesGateway(request)

  const status = useState<'idle' | 'loading' | 'ready' | 'error'>('accountStatus', () => 'idle')
  const passkey = useState<KeySlotStatus>('accountPasskey', () => 'unset')
  const recovery = useState<KeySlotStatus>('accountRecovery', () => 'unset')

  /**
   * Kode pemulihan yang baru dibuat. `ref` biasa, BUKAN `useState`: isinya membuka seluruh data user,
   * dan `useState` ikut diserialisasi ke payload SSR (security.md §2).
   */
  const freshRecoveryCode = ref<string | null>(null)
  const freshRecoveryEnvelope = ref<RecoveryEnvelope | null>(null)
  const freshRecoveryFileName = ref<string | null>(null)
  const error = useState<string | null>('accountError', () => null)
  const busy = useState<boolean>('accountBusy', () => false)
  const deviceList = useState<AccountDevice[]>('accountDevices', () => [])

  function describe(cause: unknown): string {
    if (cause instanceof KeysRequestError || cause instanceof DevicesRequestError) {
      return cause.isNetworkError ? 'server tidak terjangkau' : `server menolak (${cause.code})`
    }

    return cause instanceof Error ? cause.message : 'terjadi kesalahan'
  }

  /**
   * Penyimpanan kunci milik akun yang sedang login.
   *
   * Diambil dari sesi lokal (`session.keyStore`), BUKAN `createWebKeyStore()` tanpa nama: itu database
   * PERANGKAT yang tidak dipisah per akun, dan pernah membuat akun B melihat passkey milik akun A
   * (popup onboarding tidak muncul, statusnya "sudah diatur"). Override di test tetap dihormati.
   */
  async function resolveKeyStore(): Promise<SecureKeyStore> {
    if (options.keyStore !== undefined) return options.keyStore

    const session = await localData.ensure()
    if (session === null) throw new Error('data lokal belum bisa dibuka')

    return session.keyStore
  }

  /** Status pembuka + daftar perangkat. Tidak pernah menyentuh bahan kunci. */
  async function load(): Promise<void> {
    status.value = 'loading'

    try {
      const session = await localData.ensure()

      if (session === null) {
        // Belum login / SSR: belum ada penyimpanan kunci milik akun, jadi statusnya "belum diatur" -
        // bukan error. Gate onboarding tetap menunggu `status === ready`.
        passkey.value = 'unset'
        recovery.value = 'unset'
        deviceList.value = []
        status.value = 'ready'
        return
      }

      const keyStore = options.keyStore ?? session.keyStore
      passkey.value = (await keyStore.has('passkey')) ? 'set' : 'unset'
      recovery.value = (await keyStore.has('recovery')) ? 'set' : 'unset'

      const rows = await devices.list()
      deviceList.value = rows.map((device) => ({
        ...device,
        isCurrent: device.id === session.deviceId,
      }))
      error.value = null
      status.value = 'ready'
    } catch (cause) {
      status.value = 'error'
      error.value = describe(cause)
    }
  }

  /**
   * Aktifkan passkey sebagai pembuka kunci.
   *
   * Butuh WebAuthn nyata: di luar browser (SSR, test, browser tanpa secure context) aksinya MENOLAK
   * dengan pesan jelas - tidak ada jalur cadangan ke pembuka yang lebih lemah.
   *
   * Urutannya penting karena slot server cuma satu dan `putEnvelope` MENIMPA envelope yang ada:
   * envelope baru baru dikirim SETELAH terbukti bisa dibuka kembali (`createVerifiedPasskeyEnvelope`).
   * Verifikasi gagal = envelope lama di server tetap utuh, dan petunjuk lokal tidak ditulis.
   */
  async function activatePasskey(input: {
    readonly userName: string
    readonly userDisplayName: string
  }): Promise<void> {
    busy.value = true

    try {
      if (!isWebAuthnAvailable()) {
        throw new Error('passkey butuh browser dengan WebAuthn (dan koneksi aman)')
      }

      const session = await localData.ensure()
      if (session === null) throw new Error('data lokal belum bisa dibuka')

      const keyStore = await resolveKeyStore()
      const known = await knownCredentialId(keyStore)

      const register = createWebAuthnRegistrar({
        rpName: BRAND.passkeyName,
        userName: input.userName,
        userDisplayName: input.userDisplayName,
        userHandle: await deriveWebAuthnUserHandle(session.userId),
        excludeCredentialIds: known === null ? [] : [known],
      })

      const { envelope, material } = await session.withMasterKey((masterKey) =>
        createVerifiedPasskeyEnvelope({
          masterKey,
          register,
          authenticate: createWebAuthnAuthenticator(),
        }),
      )

      // Envelope ke SERVER (satu-satunya slot yang boleh), petunjuk kredensial ke perangkat.
      await keys.putEnvelope(toEnvelopePutInput(envelope))
      await savePasskeyMaterial(keyStore, toStorable(material))

      await load()
    } catch (cause) {
      status.value = 'error'
      error.value = describe(cause)
    } finally {
      busy.value = false
    }
  }

  /**
   * Siapkan kode pemulihan: 24 kata + envelope-nya dalam SATU string.
   *
   * Kata-katanya TIDAK ditampilkan ke user - itu inti keputusannya: user tidak perlu menulis apa pun.
   * Yang perlu dia lakukan cuma menyimpan kode ini di tempat yang dia percaya (cloud/password manager),
   * dan UI menyebutkan apa artinya memegang kode ini.
   */
  async function createRecoveryBackup(): Promise<void> {
    busy.value = true

    try {
      const session = await localData.ensure()
      if (session === null) throw new Error('data lokal belum bisa dibuka')

      const words = createRecoveryWords()
      const envelope = await session.withMasterKey((masterKey) =>
        createRecoveryEnvelope(masterKey, words),
      )

      freshRecoveryCode.value = await buildBackupCode({ words, envelope })
      freshRecoveryEnvelope.value = envelope
      freshRecoveryFileName.value = 'ip-recovery-code.txt'
    } catch (cause) {
      status.value = 'error'
      error.value = describe(cause)
    } finally {
      busy.value = false
    }
  }

  /**
   * Berkas cadangan untuk jalur unduh: teks yang berisi KODE pemulihan.
   *
   * Sengaja bukan hanya envelope: berkas yang cuma memuat envelope tidak bisa memulihkan apa pun tanpa
   * 24 katanya (aturan PRD:907). Menawarkan berkas seperti itu membuat user merasa sudah punya backup
   * padahal belum.
   */
  function recoveryBackupFile(): { readonly name: string; readonly text: string } | null {
    const code = freshRecoveryCode.value
    const name = freshRecoveryFileName.value
    if (code === null || name === null) return null

    return { name, text: code + '\n' }
  }

  /**
   * Tandai kode pemulihan sudah disimpan user.
   *
   * Envelope-nya disimpan ke slot `recovery` di perangkat (dbml: envelope milik user sendiri), dan itu
   * membuat statusnya jadi "sudah diatur".
   */
  async function markRecoveryBackupSaved(): Promise<void> {
    const envelope = freshRecoveryEnvelope.value
    if (envelope === null) return

    busy.value = true

    try {
      const keyStore = await resolveKeyStore()
      await keyStore.put('recovery', {
        kind: RECOVERY_MATERIAL_KIND,
        handle: { envelope: toStorable(envelope) },
      })

      freshRecoveryCode.value = null
      freshRecoveryEnvelope.value = null
      freshRecoveryFileName.value = null

      await load()
    } catch (cause) {
      status.value = 'error'
      error.value = describe(cause)
    } finally {
      busy.value = false
    }
  }

  /** Logout jarak jauh: cabut perangkat lain, lalu segarkan daftarnya. */
  async function revokeDevice(id: string): Promise<void> {
    busy.value = true

    try {
      await devices.revoke(id)
      await load()
    } catch (cause) {
      status.value = 'error'
      error.value = describe(cause)
    } finally {
      busy.value = false
    }
  }

  return {
    status: computed(() => status.value),
    passkey: computed(() => passkey.value),
    recovery: computed(() => recovery.value),
    freshRecoveryCode: computed(() => freshRecoveryCode.value),
    error: computed(() => error.value),
    busy: computed(() => busy.value),
    devices: computed(() => deviceList.value),
    load,
    createRecoveryBackup,
    recoveryBackupFile,
    markRecoveryBackupSaved,
    activatePasskey,
    revokeDevice,
  }
}

/**
 * Kredensial yang sudah dikenal perangkat ini, untuk `excludeCredentials`.
 *
 * Petunjuk yang rusak dianggap tidak ada, bukan menggagalkan aktivasi: gunanya hanya mencegah passkey
 * ganda, dan aktivasi yang berhasil menimpanya dengan petunjuk baru - menolak di sini malah mengunci
 * user dari satu-satunya jalan memperbaikinya.
 */
async function knownCredentialId(keyStore: SecureKeyStore): Promise<string | null> {
  const handle = await readPasskeyMaterial(keyStore).catch(() => null)
  return handle?.credentialId ?? null
}

/**
 * Salin nilai jadi data JSON biasa sebelum diserahkan ke IndexedDB.
 *
 * Bukan formalitas: nilai yang dibaca dari `ref`/composable adalah **Proxy** Vue, dan IndexedDB menolak
 * Proxy dengan `DataCloneError` ("could not be cloned"). Kegagalannya hanya muncul di browser - test node
 * memakai objek biasa - dan akibatnya: envelope tidak tersimpan, onboarding tidak pernah selesai, dan
 * pesannya cuma "gagal menyimpan". Kejadian nyata, ketahuan saat mengetes di browser.
 */
function toStorable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
