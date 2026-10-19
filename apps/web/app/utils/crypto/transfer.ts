import { assertMasterKey } from './master-key'
import { loadSodium, type SodiumModule } from './sodium'

/**
 * Transfer kunci utama antar perangkat lewat QR (ARCHITECTURE §7: "QR transfer: X25519 ephemeral").
 *
 * Alur lengkapnya (relay server, TTL ≤ 2 menit, sekali pakai):
 *
 *   perangkat BARU : bikin keypair ephemeral, tampilkan QR { v, publicKey, nonce }
 *   perangkat LAMA : scan QR -> bungkus kunci utama ke publicKey itu -> POST /v1/keys/transfer
 *   server         : simpan blob opak (tidak bisa dibuka) + id, TTL 120 detik
 *   perangkat BARU : klaim id -> contoh `openSealed(blob)` -> kunci utama
 *
 * Yang dipakai untuk membungkus: **sealed box** (`crypto_box_seal`). Ia mengambil public key lawan
 * bicara, membuat keypair sementara sendiri, lalu membungkusnya bersama pesan - jadi perangkat lama
 * tidak perlu punya kunci rahasianya sendiri, dan arahnya satu arah (hanya pemilik private key
 * ephemeral itu yang bisa membuka).
 *
 * `nonce` dari QR disertakan DI DALAM pesan terenkripsi (bukan sebagai AAD - sealed box tidak punya
 * AAD). Fungsinya memastikan blob yang diterima memang jawaban untuk QR yang sedang tampil, bukan
 * kiriman lama yang tertukar.
 *
 * TTL dan "sekali pakai" ditegakkan SERVER (`key_transfers.expires_at`/`claimed_at`), bukan di sini:
 * klien tidak boleh jadi satu-satunya penjaga masa berlaku sebuah envelope kunci.
 */

/** Versi format QR. Payload dengan versi lain DITOLAK, bukan ditebak. */
export const TRANSFER_QR_VERSION = 1

/** Panjang nonce di QR (byte). Bukan rahasia; hanya pengikat permintaan dan jawaban. */
const TRANSFER_NONCE_BYTES = 16

/** Isi QR yang ditampilkan perangkat baru. */
export type TransferQrPayload = {
  readonly v: typeof TRANSFER_QR_VERSION
  /** Public key ephemeral perangkat baru, base64. */
  readonly publicKey: string
  readonly nonce: string
}

/**
 * Permintaan transfer di sisi perangkat BARU.
 *
 * `openSealed` menutup private key ephemeral di dalam closure: kunci itu tidak pernah keluar, dan
 * memang tidak perlu - yang perlu dikirim ke server hanyalah `blob` hasil pembungkusan.
 */
export type TransferRequest = {
  /** String yang dimasukkan ke QR. */
  readonly qrPayload: string
  /** Buka blob yang diklaim dari server -> kunci utama. */
  readonly openSealed: (blobBase64: string) => Promise<Uint8Array>
}

/** Buat permintaan transfer baru (perangkat baru menampilkan QR-nya). */
export async function createTransferRequest(): Promise<TransferRequest> {
  const sodium = await loadSodium()
  const keyPair = sodium.crypto_box_keypair()
  const nonce = sodium.randombytes_buf(TRANSFER_NONCE_BYTES)

  const payload: TransferQrPayload = {
    v: TRANSFER_QR_VERSION,
    publicKey: sodium.to_base64(keyPair.publicKey, sodium.base64_variants.ORIGINAL),
    nonce: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
  }

  return {
    qrPayload: JSON.stringify(payload),

    async openSealed(blobBase64: string): Promise<Uint8Array> {
      const sealed = sodium.from_base64(blobBase64, sodium.base64_variants.ORIGINAL)

      let plaintext: string
      try {
        plaintext = sodium.to_string(
          sodium.crypto_box_seal_open(sealed, keyPair.publicKey, keyPair.privateKey),
        )
      } catch (error) {
        // Termasuk blob yang dikirim ke permintaan lain: sealed box hanya bisa dibuka oleh keypair
        // yang public key-nya dipakai saat membungkus.
        throw new Error('kiriman kunci tidak bisa dibuka: bukan untuk permintaan ini', {
          cause: error,
        })
      }

      const parsed = parseSealedTransfer(sodium, plaintext)
      if (parsed.nonce !== payload.nonce) {
        throw new Error('kiriman kunci bukan jawaban untuk QR yang sedang tampil')
      }

      assertMasterKey(parsed.masterKey)

      return parsed.masterKey
    },
  }
}

/**
 * Baca payload QR dari perangkat baru.
 *
 * Ditolak dengan alasan jelas kalau versinya bukan yang dikenal atau bentuknya tidak lengkap - QR bisa
 * dari aplikasi lain, dan menebaknya berarti membungkus kunci utama ke public key yang tidak dikenal.
 */
export function parseTransferQrPayload(qrPayload: string): TransferQrPayload {
  let raw: unknown
  try {
    raw = JSON.parse(qrPayload)
  } catch (error) {
    throw new Error('QR transfer bukan JSON yang sah', { cause: error })
  }

  const candidate = raw as Partial<TransferQrPayload> | null
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    candidate.v !== TRANSFER_QR_VERSION ||
    typeof candidate.publicKey !== 'string' ||
    candidate.publicKey.length === 0 ||
    typeof candidate.nonce !== 'string' ||
    candidate.nonce.length === 0
  ) {
    throw new Error('QR transfer tidak dikenal atau tidak lengkap')
  }

  return { v: TRANSFER_QR_VERSION, publicKey: candidate.publicKey, nonce: candidate.nonce }
}

/**
 * Bungkus kunci utama untuk permintaan transfer ini (perangkat LAMA).
 *
 * Hasilnya blob base64 yang dikirim ke server; server tidak bisa membukanya, dan perangkat lain yang
 * bukan pemilik keypair ephemeral itu juga tidak.
 */
export async function sealTransferResponse(
  qrPayload: string,
  masterKey: Uint8Array,
): Promise<string> {
  assertMasterKey(masterKey)

  const sodium = await loadSodium()
  const request = parseTransferQrPayload(qrPayload)
  const publicKey = sodium.from_base64(request.publicKey, sodium.base64_variants.ORIGINAL)

  const plaintext = JSON.stringify({
    v: TRANSFER_QR_VERSION,
    nonce: request.nonce,
    masterKey: sodium.to_base64(masterKey, sodium.base64_variants.ORIGINAL),
  })

  return sodium.to_base64(
    sodium.crypto_box_seal(sodium.from_string(plaintext), publicKey),
    sodium.base64_variants.ORIGINAL,
  )
}

/** Isi pesan terenkripsi yang dibawa dalam sealed box. */
function parseSealedTransfer(
  sodium: SodiumModule,
  plaintext: string,
): {
  readonly nonce: string
  readonly masterKey: Uint8Array
} {
  let raw: unknown
  try {
    raw = JSON.parse(plaintext)
  } catch (error) {
    throw new Error('isi kiriman kunci bukan JSON yang sah', { cause: error })
  }

  const candidate = raw as { v?: unknown; nonce?: unknown; masterKey?: unknown } | null
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    candidate.v !== TRANSFER_QR_VERSION ||
    typeof candidate.nonce !== 'string' ||
    typeof candidate.masterKey !== 'string'
  ) {
    throw new Error('isi kiriman kunci tidak lengkap')
  }

  // `from_base64` libsodium - BUKAN `Buffer`: modul ini jalan di browser, dan `Buffer` tidak ada di sana.
  return {
    nonce: candidate.nonce,
    masterKey: sodium.from_base64(candidate.masterKey, sodium.base64_variants.ORIGINAL),
  }
}
