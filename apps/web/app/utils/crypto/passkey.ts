import type { KeyEnvelopePutInput } from '@improve-personal/contracts'
import type { SecureKeyMaterial, SecureKeyStore } from '@improve-personal/core'

import { TECH_IDENTITY } from '#shared/tech-identity'

import { aadFor, openWithKey, sealWithKey } from './envelope'
import { assertMasterKey, zeroKey } from './master-key'
import { loadSodium, type SodiumModule } from './sodium'

/**
 * Passkey sebagai pembuka kunci utama (ARCHITECTURE §7, ADR 10-12).
 *
 * Cara kerjanya:
 *
 *   passkey (WebAuthn) --PRF--> output rahasia --KDF--> kunci pembungkus --> envelope (DI SERVER)
 *
 * Tiga hal yang membedakannya dari recovery key, dan semuanya disengaja:
 * 1. **Tidak ada Argon2id di sini.** PRF output berasal dari authenticator, bukan dari kalimat yang
 *    diucapkan manusia - entropinya sudah penuh, jadi memperlambatnya tidak menambah apa pun.
 * 2. **Envelope ini SATU-SATUNYA yang boleh ada di server** (`KEY_SLOTS = ['passkey']`). Server tetap
 *    tidak bisa membukanya: PRF output tidak pernah meninggalkan authenticator.
 * 3. **Salt PRF ikut disimpan di `kdfParams`**, bukan hanya di perangkat ini. PRF menghasilkan nilai
 *    yang berbeda untuk salt yang berbeda, jadi tanpa salt yang sama perangkat baru tidak akan pernah
 *    bisa membuka envelope ini - walau passkey-nya sama. Salt bukan rahasia; yang rahasia adalah
 *    output-nya.
 *
 * `credentialId` disimpan lokal (slot `passkey` di `SecureKeyStore`) sebagai petunjuk, bukan di
 * `kdfParams`: panjang id kredensial bisa melewati batas nilai `kdfParams` (256 karakter), dan
 * perangkat baru tetap bisa menemukan passkey lewat discoverable credential.
 */

/** Jenis bahan kunci untuk slot `passkey`. */
export const PASSKEY_MATERIAL_KIND = 'passkey-webauthn'

/** Nama KDF yang ditulis ke server. */
export const PASSKEY_KDF = 'webauthn-prf'

const PASSKEY_AAD = aadFor('passkey')

/** Konteks KDF subkey - wajib tepat 8 karakter (`crypto_kdf_CONTEXTBYTES`). */
const PRF_CONTEXT = TECH_IDENTITY.passkeyKdfContext

/** Panjang salt PRF (byte). Disimpan di `kdfParams` supaya perangkat lain memakai salt yang sama. */
const PRF_SALT_BYTES = 32

/** Panjang kunci pembungkus hasil KDF. */
const WRAP_KEY_BYTES = 32

/** Permintaan PRF ke authenticator: salt yang dipakai, dan kredensial spesifik kalau kita tahu. */
export type PasskeyPrfRequest = {
  readonly credentialId?: string
  readonly salt: Uint8Array
}

export type PasskeyPrfResult = {
  readonly credentialId: string
  /** Output PRF dari authenticator. TIDAK PERNAH dikirim ke mana pun. */
  readonly prfOutput: Uint8Array
  /**
   * `true` = output ini dari get() (assertion, UV wajib) - jalur yang sama dengan pemulihan di
   * perangkat baru. Output dari create() tidak dijamin sama, jadi hanya yang ini yang boleh dipakai
   * ulang saat verifikasi tanpa meminta sentuhan lagi.
   */
  readonly isAssertion?: boolean
}

/**
 * Batas WebAuthn. Disuntik supaya logika pembungkusan bisa diuji tanpa authenticator nyata
 * (ceritanya sendiri butuh browser - lihat `webauthn.ts`).
 */
export type PasskeyPrfProvider = (request: PasskeyPrfRequest) => Promise<PasskeyPrfResult>

/** Isi `kdfParams` yang dikirim ke server. Semua primitif, sesuai batas `kdfParamsSchema`. */
export type PasskeyKdfParams = {
  readonly kdf: typeof PASSKEY_KDF
  readonly ver: number
  readonly salt: string
}

export type PasskeyEnvelope = {
  /** Kunci utama terbungkus: base64( nonce[24] || ciphertext||tag ). */
  readonly wrappedKey: string
  readonly kdfParams: PasskeyKdfParams
}

/** Bahan kunci lokal untuk slot `passkey`: petunjuk kredensial + salt yang sudah dipakai. */
export type PasskeyMaterialHandle = {
  readonly credentialId: string
  readonly salt: string
}

export type PasskeyMaterial = SecureKeyMaterial & {
  readonly kind: typeof PASSKEY_MATERIAL_KIND
  readonly handle: PasskeyMaterialHandle
}

export function createPasskeySalt(sodium: SodiumModule): Uint8Array {
  return sodium.randombytes_buf(PRF_SALT_BYTES)
}

/** Turunkan kunci pembungkus dari output PRF. */
export function derivePasskeyWrapKey(sodium: SodiumModule, prfOutput: Uint8Array): Uint8Array {
  if (prfOutput.length < WRAP_KEY_BYTES) {
    throw new Error(`output PRF terlalu pendek: ${prfOutput.length} byte`)
  }

  return sodium.crypto_kdf_derive_from_key(
    WRAP_KEY_BYTES,
    1,
    PRF_CONTEXT,
    prfOutput.subarray(0, 32),
  )
}

/**
 * Buat envelope passkey dari kunci utama.
 *
 * Mengembalikan dua hal yang harus disimpan di DUA tempat berbeda: `envelope` ke server, `material` ke
 * perangkat. Menaruh keduanya di satu tempat akan menghapus gunanya - envelope aman justru karena
 * pembukanya (passkey + PRF) tidak ada di sana.
 */
export async function createPasskeyEnvelope(
  masterKey: Uint8Array,
  prf: PasskeyPrfProvider,
): Promise<{ envelope: PasskeyEnvelope; material: PasskeyMaterial }> {
  assertMasterKey(masterKey)

  const sodium = await loadSodium()
  const salt = createPasskeySalt(sodium)
  const prfResult = await prf({ salt })

  const wrapKey = derivePasskeyWrapKey(sodium, prfResult.prfOutput)
  const wrappedKey = sealWithKey(sodium, wrapKey, PASSKEY_AAD, masterKey)

  return {
    envelope: {
      wrappedKey,
      kdfParams: {
        kdf: PASSKEY_KDF,
        ver: 1,
        salt: sodium.to_base64(salt, sodium.base64_variants.ORIGINAL),
      },
    },
    material: {
      kind: PASSKEY_MATERIAL_KIND,
      // `credentialId` bukan rahasia - ia petunjuk kredensial mana yang harus dipakai di perangkat ini.
      handle: {
        credentialId: prfResult.credentialId,
        salt: sodium.to_base64(salt, sodium.base64_variants.ORIGINAL),
      },
    },
  }
}

/**
 * Buka kunci utama lewat passkey.
 *
 * Salt diambil dari `kdfParams` (bukan dari material lokal): itulah yang membuat perangkat BARU bisa
 * memakai passkey yang sama terhadap envelope yang sama.
 */
export async function unlockMasterKeyWithPasskey(input: {
  readonly envelope: PasskeyEnvelope
  readonly prf: PasskeyPrfProvider
  readonly credentialId?: string
}): Promise<Uint8Array> {
  const sodium = await loadSodium()
  const { kdfParams } = input.envelope

  if (kdfParams.kdf !== PASSKEY_KDF || kdfParams.ver !== 1) {
    throw new Error(`envelope passkey tidak dikenal: ${kdfParams.kdf} v${String(kdfParams.ver)}`)
  }

  const salt = sodium.from_base64(kdfParams.salt, sodium.base64_variants.ORIGINAL)
  const prfResult = await input.prf({
    ...(input.credentialId === undefined ? {} : { credentialId: input.credentialId }),
    salt,
  })

  const wrapKey = derivePasskeyWrapKey(sodium, prfResult.prfOutput)
  const masterKey = openWithKey(sodium, wrapKey, PASSKEY_AAD, input.envelope.wrappedKey)
  assertMasterKey(masterKey)

  return masterKey
}

/** Envelope passkey baru tidak bisa dibuka kembali - JANGAN dikirim ke server. */
export class PasskeyVerificationError extends Error {
  constructor(options?: { cause?: unknown }) {
    super(
      'passkey baru tidak bisa membuka kunci kembali, jadi tidak disimpan. Coba lagi, atau pakai passkey/perangkat lain',
      options,
    )
  }
}

/**
 * Buat envelope passkey, lalu BUKTIKAN envelope itu bisa dibuka sebelum diserahkan ke pemanggil.
 *
 * Kenapa wajib: envelope passkey adalah satu-satunya yang ada di server dan jalur pemulihan default.
 * Envelope yang tidak bisa dibuka (PRF create() berbeda dengan get(), UV berbeda, kredensial lain)
 * baru ketahuan saat perangkat hilang - saat itu datanya sudah tidak bisa diselamatkan. Kalau verifikasi
 * gagal, fungsi ini melempar `PasskeyVerificationError` dan tidak mengembalikan envelope apa pun, jadi
 * pemanggil tidak punya apa-apa untuk dikirim.
 *
 * Verifikasinya lewat `unlockMasterKeyWithPasskey` - jalur yang sama dengan pemulihan:
 * - PRF registrasi dari create(): `authenticate` dipanggil (get() sungguhan, satu sentuhan) supaya
 *   terbukti assertion menghasilkan PRF yang sama.
 * - PRF registrasi sudah dari get() (`isAssertion`): assertion-nya sudah terjadi dengan salt & UV yang
 *   sama, jadi output itu dipakai ulang - tidak perlu sentuhan ketiga.
 *
 * Salinan kunci utama hasil buka kembali di-zero di sini; kunci utama milik pemanggil tetap milik
 * pemanggil (`withMasterKey` yang mengosongkannya).
 */
export async function createVerifiedPasskeyEnvelope(input: {
  readonly masterKey: Uint8Array
  readonly register: PasskeyPrfProvider
  readonly authenticate: PasskeyPrfProvider
}): Promise<{ envelope: PasskeyEnvelope; material: PasskeyMaterial }> {
  const captured: { registration: PasskeyPrfResult | null } = { registration: null }
  const created = await createPasskeyEnvelope(input.masterKey, async (request) => {
    captured.registration = await input.register(request)
    return captured.registration
  })

  const { registration } = captured
  const verifier: PasskeyPrfProvider =
    registration?.isAssertion === true ? async () => registration : input.authenticate

  let reopened: Uint8Array
  try {
    reopened = await unlockMasterKeyWithPasskey({
      envelope: created.envelope,
      prf: verifier,
      credentialId: created.material.handle.credentialId,
    })
  } catch (cause) {
    throw new PasskeyVerificationError({ cause })
  }

  try {
    const sodium = await loadSodium()
    if (!sodium.memcmp(reopened, input.masterKey)) throw new PasskeyVerificationError()
  } finally {
    zeroKey(reopened)
  }

  return created
}

/** Bentuk input yang dikirim ke `PUT /v1/keys/envelopes` - slot selalu `passkey`. */
export function toEnvelopePutInput(envelope: PasskeyEnvelope): KeyEnvelopePutInput {
  return { slot: 'passkey', wrappedKey: envelope.wrappedKey, kdfParams: envelope.kdfParams }
}

/** Simpan petunjuk lokal (kredensial + salt) untuk perangkat ini. */
export async function savePasskeyMaterial(
  keyStore: SecureKeyStore,
  material: PasskeyMaterial,
): Promise<void> {
  await keyStore.put('passkey', material)
}

/**
 * Ambil petunjuk lokal, atau `null` kalau perangkat ini belum pernah memakai passkey.
 *
 * Bentuknya divalidasi di sini (bukan di `key-store.ts`) karena hanya modul ini yang tahu artinya;
 * nilai yang tidak dikenal DITOLAK, tidak ditebak.
 */
export async function readPasskeyMaterial(
  keyStore: SecureKeyStore,
): Promise<PasskeyMaterialHandle | null> {
  const material = await keyStore.get('passkey')
  if (material === null) return null

  if (material.kind !== PASSKEY_MATERIAL_KIND) {
    throw new Error(`bahan kunci slot passkey tidak dikenal: "${material.kind}"`)
  }

  const handle = material.handle as Partial<PasskeyMaterialHandle> | null
  if (
    typeof handle !== 'object' ||
    handle === null ||
    typeof handle.credentialId !== 'string' ||
    typeof handle.salt !== 'string'
  ) {
    throw new Error('bahan kunci slot passkey rusak: handle tidak lengkap')
  }

  return { credentialId: handle.credentialId, salt: handle.salt }
}
