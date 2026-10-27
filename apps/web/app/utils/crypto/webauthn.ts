import type { PasskeyPrfProvider, PasskeyPrfResult } from './passkey'

/**
 * Batas WebAuthn nyata: `navigator.credentials` + ekstensi `prf` (ARCHITECTURE §7, §5 tabel port).
 *
 * ============================  PERINGATAN JUJUR  ============================
 * Berkas ini TIDAK teruji terhadap authenticator nyata, dan tidak diklaim begitu.
 * `webauthn.test.ts` memakai `navigator.credentials` PALSU: ia mengunci opsi yang kita kirim (UV &
 * discoverable wajib, `excludeCredentials`, user handle) dan cabang hasil `prf` (results / hanya
 * `enabled` / tidak ada). Apakah authenticator sungguhan memberi PRF yang sama di create() dan get(),
 * dan apakah passkey-nya benar-benar ditemukan di perangkat lain, hanya terbukti lewat browser:
 * Playwright dengan virtual authenticator (CDP `WebAuthn.addVirtualAuthenticator`, mendukung `prf`),
 * atau perangkat sungguhan.
 *
 * Logika pembungkusan kunci + verifikasi round trip teruji di `passkey.test.ts` lewat seam
 * `PasskeyPrfProvider`.
 * ============================================================================
 *
 * `prf` menghasilkan nilai rahasia yang stabil untuk pasangan (kredensial, salt). Nilai itu TIDAK
 * PERNAH dikirim ke server dan tidak pernah masuk log - ia hanya dipakai menurunkan kunci pembungkus di
 * memori.
 *
 * Kalau authenticator tidak mendukung `prf`, fungsi di sini MENOLAK dengan pesan jelas. Tidak ada
 * jalur cadangan ke kunci yang lebih lemah: passkey yang tidak bisa menurunkan kunci berarti passkey
 * itu tidak bisa dipakai sebagai pembuka, dan itu harus terlihat.
 */

/** Panjang challenge WebAuthn (byte). */
const CHALLENGE_BYTES = 32

/** Salt PRF yang dipakai di sini selalu 32 byte (dibuat `createPasskeySalt` di `passkey.ts`). */
const PRF_SALT_BYTES = 32

/** Panjang output PRF yang dipakai sebagai bahan kunci (byte). */
const PRF_OUTPUT_BYTES = 32

/** Batas waktu satu upacara WebAuthn (ms). */
const CEREMONY_TIMEOUT_MS = 60_000

/** COSE: ES256 (-7) lalu RS256 (-257) sebagai cadangan authenticator lama. */
const COSE_ES256 = -7
const COSE_RS256 = -257

/**
 * Konteks pemisah domain untuk user handle WebAuthn.
 *
 * JANGAN DIUBAH: berubah = user handle berubah = passkey baru TIDAK lagi menimpa passkey lama akun yang
 * sama di authenticator yang sama, sehingga picker kembali berisi passkey yang tidak berlaku.
 */
const USER_HANDLE_CONTEXT = 'ip-webauthn-user-handle:v1:'

/**
 * Opsi bersama yang memang dibutuhkan semua upacara.
 *
 * `rpId` kosong = browser memakai domain halaman ini - itu yang diinginkan di produksi.
 */
export type WebAuthnAuthenticatorOptions = {
  readonly rpId?: string
}

export type WebAuthnRegistrarOptions = WebAuthnAuthenticatorOptions & {
  readonly rpName: string
  /** Nama akun di authenticator (biasanya email). Bukan rahasia, tapi jangan taruh lebih dari perlu. */
  readonly userName: string
  readonly userDisplayName: string
  /** User handle dari `deriveWebAuthnUserHandle` - stabil per akun, tanpa PII. */
  readonly userHandle: Uint8Array
  /** Kredensial yang sudah dikenal perangkat ini (base64url), supaya tidak dibuat passkey ganda. */
  readonly excludeCredentialIds?: readonly string[]
}

/** Apakah WebAuthn tersedia di konteks ini (client, secure context, API ada). */
export function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials?.create === 'function' &&
    typeof window.PublicKeyCredential === 'function'
  )
}

/**
 * User handle WebAuthn (`user.id`) untuk satu akun: SHA-256(konteks || id akun server).
 *
 * Kenapa diturunkan, bukan acak per aktivasi: authenticator memakai pasangan (rpId, user handle) untuk
 * menentukan "passkey akun ini". Handle acak membuat setiap aktivasi menambah passkey BARU, sementara
 * server hanya menyimpan satu envelope - passkey lama tetap tampil di picker tapi tidak lagi membuka apa
 * pun. Dengan handle stabil, registrasi ulang di authenticator yang sama menimpa passkey lama.
 *
 * Kenapa diturunkan, bukan disimpan: tidak ada state tambahan yang bisa hilang atau berbeda antar
 * perangkat - perangkat mana pun menghasilkan handle yang sama dari id akun yang sama.
 *
 * Kenapa di-hash, bukan id akun mentah: spesifikasi melarang PII di user handle, dan handle ini disimpan
 * authenticator (bisa ikut tersinkron ke pengelola passkey pihak ketiga). Id akun memang bukan
 * email/nama, tapi ia pengenal yang sama dengan di server dan log; hash dengan konteks tetap memutus
 * kaitan langsung itu tanpa butuh rahasia. Handle bukan rahasia - ia tidak membuka apa pun.
 */
export async function deriveWebAuthnUserHandle(
  accountId: string,
): Promise<Uint8Array<ArrayBuffer>> {
  if (accountId.length === 0)
    throw new Error('id akun kosong: user handle passkey tidak bisa dibuat')

  const input = new TextEncoder().encode(USER_HANDLE_CONTEXT + accountId)
  return new Uint8Array(await crypto.subtle.digest('SHA-256', input))
}

/**
 * Pembuat kredensial baru (registrasi) yang sekaligus mengevaluasi PRF.
 *
 * Satu sentuhan kalau authenticator mengembalikan `prf.results` saat create(). Banyak authenticator
 * hanya melaporkan `prf.enabled` saat registrasi; untuk itu dilakukan get() langsung terhadap kredensial
 * baru dengan salt yang sama (satu sentuhan tambahan). Hasil get() ditandai `isAssertion` - itu jalur
 * yang sama persis dengan yang dipakai perangkat baru saat memulihkan.
 */
export function createWebAuthnRegistrar(options: WebAuthnRegistrarOptions): PasskeyPrfProvider {
  return async ({ salt }) => {
    assertAvailable()
    assertSalt(salt)

    const credential = await createCredential(options, salt)
    const extensions = credential.getClientExtensionResults()
    const prfOutput = prfOutputOf(extensions)

    if (prfOutput !== null) return { credentialId: credential.id, prfOutput }

    if (!isPrfEnabled(extensions)) {
      throw new Error(
        'authenticator ini tidak mendukung prf: passkey tidak bisa dipakai sebagai pembuka',
      )
    }

    const assertion = await requestAssertion(options.rpId, new Uint8Array(credential.rawId), salt)
    return { ...assertion, isAssertion: true }
  }
}

/**
 * Pembuka kredensial yang sudah ada.
 *
 * `credentialId` opsional: kalau diisi, authenticator langsung diarahkan ke kredensial itu. Kalau tidak,
 * discoverable credential-lah yang menemukannya - itu yang dipakai perangkat BARU, yang belum pernah
 * menyimpan petunjuk lokal.
 */
export function createWebAuthnAuthenticator(
  options: WebAuthnAuthenticatorOptions = {},
): PasskeyPrfProvider {
  return async ({ credentialId, salt }) => {
    assertAvailable()
    assertSalt(salt)

    return requestAssertion(
      options.rpId,
      credentialId === undefined ? undefined : base64UrlToBytes(credentialId),
      salt,
    )
  }
}

async function createCredential(
  options: WebAuthnRegistrarOptions,
  salt: Uint8Array,
): Promise<PublicKeyCredential> {
  let credential: PublicKeyCredential | null

  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(CHALLENGE_BYTES),
        rp: { id: options.rpId, name: options.rpName },
        user: {
          id: toBytes(options.userHandle),
          name: options.userName,
          displayName: options.userDisplayName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: COSE_ES256 },
          { type: 'public-key', alg: COSE_RS256 },
        ],
        excludeCredentials: (options.excludeCredentialIds ?? []).map((id) => ({
          type: 'public-key' as const,
          id: base64UrlToBytes(id),
        })),
        authenticatorSelection: {
          // WAJIB discoverable: `credentialId` hanya disimpan di perangkat ini, jadi perangkat BARU
          // menemukan passkey tanpa `allowCredentials` - kredensial non-discoverable tidak akan pernah
          // muncul di sana. `requireResidentKey` untuk browser/authenticator yang hanya mengenal L1.
          residentKey: 'required',
          requireResidentKey: true,
          // WAJIB UV: hmac-secret (dasar `prf`) memakai rahasia BERBEDA dengan vs tanpa verifikasi
          // user. Kalau registrasi berjalan tanpa UV tapi pemulihan dengan UV (atau sebaliknya),
          // output PRF-nya beda dan envelope tidak akan pernah terbuka.
          userVerification: 'required',
        },
        timeout: CEREMONY_TIMEOUT_MS,
        attestation: 'none',
        extensions: { prf: { eval: { first: toBytes(salt) } } },
      },
    })) as PublicKeyCredential | null
  } catch (cause) {
    // `excludeCredentials` cocok: authenticator ini sudah memegang passkey yang dikenal perangkat ini.
    if (cause instanceof DOMException && cause.name === 'InvalidStateError') {
      throw new Error(
        'authenticator ini sudah menyimpan passkey akun ini: pakai passkey itu, atau hapus dulu dari pengelola passkey',
        { cause },
      )
    }
    throw cause
  }

  if (credential === null) throw new Error('registrasi passkey dibatalkan')
  return credential
}

async function requestAssertion(
  rpId: string | undefined,
  credentialId: Uint8Array<ArrayBuffer> | undefined,
  salt: Uint8Array,
): Promise<PasskeyPrfResult> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(CHALLENGE_BYTES),
      rpId,
      allowCredentials:
        credentialId === undefined ? [] : [{ type: 'public-key', id: credentialId }],
      // WAJIB sama dengan registrasi: PRF dengan dan tanpa UV menghasilkan nilai berbeda.
      userVerification: 'required',
      timeout: CEREMONY_TIMEOUT_MS,
      extensions: { prf: { eval: { first: toBytes(salt) } } },
    },
  })) as PublicKeyCredential | null

  if (credential === null) throw new Error('permintaan passkey dibatalkan')

  const prfOutput = prfOutputOf(credential.getClientExtensionResults())
  if (prfOutput === null) {
    throw new Error(
      'authenticator ini tidak mengembalikan hasil prf saat permintaan: passkey tidak bisa dipakai sebagai pembuka',
    )
  }

  return { credentialId: credential.id, prfOutput }
}

function assertAvailable(): void {
  if (!isWebAuthnAvailable()) {
    throw new Error('WebAuthn tidak tersedia di konteks ini (butuh browser + secure context)')
  }
}

function assertSalt(salt: Uint8Array): void {
  if (salt.length !== PRF_SALT_BYTES) {
    throw new Error(`salt PRF harus ${PRF_SALT_BYTES} byte, dapat ${salt.length}`)
  }
}

type PrfClientOutput = {
  readonly enabled?: boolean
  readonly results?: { readonly first?: ArrayBuffer | null }
}

/**
 * Hasil PRF, atau `null` kalau authenticator tidak mengisinya.
 *
 * Bentuknya `getClientExtensionResults().prf.results.first` (ArrayBuffer). `null` BUKAN "boleh lanjut":
 * pemanggil yang memutuskan - get() susulan (registrasi) atau menolak (permintaan). Tanpa PRF tidak ada
 * bahan kunci sama sekali, dan tidak ada jalur ke kunci yang lebih lemah.
 */
function prfOutputOf(extensions: AuthenticationExtensionsClientOutputs): Uint8Array | null {
  const first = (extensions.prf as PrfClientOutput | undefined)?.results?.first

  if (!(first instanceof ArrayBuffer) || first.byteLength < PRF_OUTPUT_BYTES) return null
  return new Uint8Array(first.slice(0, PRF_OUTPUT_BYTES))
}

function isPrfEnabled(extensions: AuthenticationExtensionsClientOutputs): boolean {
  return (extensions.prf as PrfClientOutput | undefined)?.enabled === true
}

/**
 * Salin byte ke view di atas `ArrayBuffer` baru.
 *
 * Bukan formalitas tipe: `BufferSource` DOM hanya menerima view di atas `ArrayBuffer`, sedangkan
 * `Uint8Array` bisa merupakan view di atas `SharedArrayBuffer`. Salinan kecil ini menghapus pertanyaan
 * itu, dan membuat kode ini tidak bergantung dari mana byte-nya datang.
 */
function toBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes)
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length))
  crypto.getRandomValues(bytes)
  return bytes
}

/** Id kredensial WebAuthn berbentuk base64url; konversi ini tidak memakai `Buffer` (kode browser). */
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export type { PasskeyPrfResult }
