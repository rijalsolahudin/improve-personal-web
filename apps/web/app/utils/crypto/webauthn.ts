import type { PasskeyPrfProvider, PasskeyPrfResult } from './passkey'

/**
 * Batas WebAuthn nyata: `navigator.credentials` + ekstensi `prf` (ARCHITECTURE §7, §5 tabel port).
 *
 * ============================  PERINGATAN JUJUR  ============================
 * Berkas ini TIDAK diuji di node, dan tidak diklaim teruji. `navigator.credentials.create/get`
 * membutuhkan authenticator nyata (platform authenticator / security key) plus ekstensi `prf`, jadi
 * verifikasinya harus lewat browser: Playwright dengan virtual authenticator (CDP
 * `WebAuthn.addVirtualAuthenticator`, mendukung `prf`), atau perangkat sungguhan.
 *
 * Yang SUDAH teruji (di `passkey.test.ts`) adalah logika pembungkusan kuncinya, lewat seam
 * `PasskeyPrfProvider` yang disuntik. Artinya: kalau bagian ini salah, yang salah adalah pemanggilan
 * WebAuthn-nya - bukan cara kunci dibungkus/dibuka.
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

export type WebAuthnOptions = {
  /** Relying party id - domain tempat passkey didaftarkan (`window.location.hostname` di produksi). */
  readonly rpId?: string
  readonly rpName: string
  /** Nama akun di authenticator (biasanya email). Bukan rahasia, tapi jangan taruh lebih dari perlu. */
  readonly userName: string
  readonly userDisplayName: string
  /** Id user WebAuthn (byte acak, TIDAK boleh mengandung PII). Dibuat sekali per akun. */
  readonly userId: Uint8Array
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
 * Pembuat kredensial baru (registrasi) yang sekaligus mengevaluasi PRF.
 *
 * Dipakai saat onboarding: satu kali sentuhan user menghasilkan kredensial + kunci pembungkus.
 */
export function createWebAuthnRegistrar(options: WebAuthnOptions): PasskeyPrfProvider {
  return async ({ salt }) => {
    assertAvailable()
    assertSalt(salt)

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(CHALLENGE_BYTES),
        rp: { id: options.rpId, name: options.rpName },
        user: {
          id: toBytes(options.userId),
          name: options.userName,
          displayName: options.userDisplayName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
        timeout: 60_000,
        attestation: 'none',
        extensions: { prf: { eval: { first: toBytes(salt) } } },
      },
    })) as PublicKeyCredential | null

    if (credential === null) throw new Error('registrasi passkey dibatalkan')

    return {
      credentialId: credential.id,
      prfOutput: readPrfOutput(credential.getClientExtensionResults(), 'registrasi'),
    }
  }
}

/**
 * Pembuka kredensial yang sudah ada.
 *
 * `credentialId` opsional: kalau diisi, authenticator langsung diarahkan ke kredensial itu. Kalau tidak,
 * discoverable credential-lah yang menemukannya - itu yang dipakai perangkat BARU, yang belum pernah
 * menyimpan petunjuk lokal.
 */
export function createWebAuthnAuthenticator(options: WebAuthnOptions): PasskeyPrfProvider {
  return async ({ credentialId, salt }) => {
    assertAvailable()
    assertSalt(salt)

    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(CHALLENGE_BYTES),
        rpId: options.rpId,
        allowCredentials:
          credentialId === undefined
            ? []
            : [{ type: 'public-key', id: toBytes(base64UrlToBytes(credentialId)) }],
        userVerification: 'preferred',
        timeout: 60_000,
        extensions: { prf: { eval: { first: toBytes(salt) } } },
      },
    })) as PublicKeyCredential | null

    if (credential === null) throw new Error('permintaan passkey dibatalkan')

    return {
      credentialId: credential.id,
      prfOutput: readPrfOutput(credential.getClientExtensionResults(), 'permintaan'),
    }
  }
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

/**
 * Baca hasil PRF, ATAU menolak.
 *
 * Bentuk responsnya `getClientExtensionResults().prf.results.first` (ArrayBuffer). Authenticator yang
 * tidak mendukung `prf` tidak mengisi field ini - dan itu bukan "sekadar kosong": tanpa PRF tidak ada
 * bahan kunci sama sekali, jadi menolak adalah satu-satunya jawaban yang jujur.
 */
function readPrfOutput(
  extensions: AuthenticationExtensionsClientOutputs,
  context: string,
): Uint8Array {
  const prf = extensions.prf as { results?: { first?: ArrayBuffer | null } } | undefined
  const first = prf?.results?.first

  if (!(first instanceof ArrayBuffer) || first.byteLength < 32) {
    throw new Error(
      `authenticator ini tidak mengembalikan hasil prf saat ${context}: passkey tidak bisa dipakai sebagai pembuka`,
    )
  }

  return new Uint8Array(first.slice(0, 32))
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

/** Dipakai test/browser helper untuk membuat id user acak tanpa PII. */
export function createWebAuthnUserId(): Uint8Array<ArrayBuffer> {
  return randomBytes(16)
}

export type { PasskeyPrfResult }
