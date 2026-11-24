package id.stackinnov.improvepersonal.sodium

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.typedarray.Uint8Array
import java.nio.ByteBuffer

/** Argumen tidak sesuai kontrak (panjang buffer/parameter) - bug pemanggil, bukan data rusak. */
internal class SodiumArgumentException : CodedException("argumen sodium tidak valid")

/** libsodium gagal (mis. Argon2id kehabisan memori). Pesan sengaja generik: tanpa isi buffer. */
internal class SodiumInternalException : CodedException("operasi sodium gagal")

/**
 * Expo Module `IpSodium` (New Architecture/JSI). Pintu masuk app: `src/platform/sodium.ts`.
 *
 * - Fungsi sinkron menerima `Uint8Array` dan memakai view langsung ke memori JS (tanpa salinan di
 *   heap JVM); output ditulis ke `Uint8Array` milik pemanggil.
 * - Hasil "verifikasi gagal" (MAC/tanda tangan/padding/base64 rusak) = nilai balik false/-1, bukan
 *   exception, supaya pemanggil membedakan data rusak dari bug.
 * - `pwhash` asinkron: Argon2id MODERATE (256 MiB) memakan detik dan tidak boleh memblok JS thread.
 */
class IpSodiumModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("IpSodium")

    OnCreate {
      if (IpSodiumNative.init() != IpSodiumNative.OK) throw SodiumInternalException()
    }

    Function("randombytesBuf") { out: Uint8Array -> IpSodiumNative.randombytesBuf(out.view()) }
    Function("memzero") { buf: Uint8Array -> IpSodiumNative.memzero(buf.view()) }

    Function("aeadXChaCha20Poly1305IetfEncrypt") {
        out: Uint8Array, message: Uint8Array, ad: Uint8Array?, nonce: Uint8Array, key: Uint8Array ->
      requireOk(IpSodiumNative.aeadEncrypt(out.view(), message.view(), ad?.view(), nonce.view(), key.view()))
    }
    Function("aeadXChaCha20Poly1305IetfDecrypt") {
        out: Uint8Array, ciphertext: Uint8Array, ad: Uint8Array?, nonce: Uint8Array, key: Uint8Array ->
      isVerified(
        IpSodiumNative.aeadDecrypt(out.view(), ciphertext.view(), ad?.view(), nonce.view(), key.view())
      )
    }

    Function("kdfDeriveFromKey") { out: Uint8Array, subkeyId: Long, context: Uint8Array, key: Uint8Array ->
      requireOk(IpSodiumNative.kdfDeriveFromKey(out.view(), subkeyId, context.view(), key.view()))
    }

    AsyncFunction("pwhash") {
        outLength: Int, password: ByteArray, salt: ByteArray, opslimit: Long, memlimit: Long, alg: Int ->
      val out = ByteArray(outLength)
      try {
        requireOk(IpSodiumNative.pwhash(out, password, salt, opslimit, memlimit, alg))
        out
      } finally {
        // Salinan kata sandi di heap JVM dibuang secepatnya; `out` milik JS setelah dikembalikan.
        password.fill(0)
      }
    }

    Function("secretstreamStateBytes") { IpSodiumNative.secretstreamStateBytes() }
    Function("secretstreamInitPush") { state: Uint8Array, header: Uint8Array, key: Uint8Array ->
      requireOk(IpSodiumNative.secretstreamInitPush(state.view(), header.view(), key.view()))
    }
    Function("secretstreamPush") {
        state: Uint8Array, out: Uint8Array, message: Uint8Array, ad: Uint8Array?, tag: Int ->
      requireOk(IpSodiumNative.secretstreamPush(state.view(), out.view(), message.view(), ad?.view(), tag))
    }
    Function("secretstreamInitPull") { state: Uint8Array, header: Uint8Array, key: Uint8Array ->
      isVerified(IpSodiumNative.secretstreamInitPull(state.view(), header.view(), key.view()))
    }
    Function("secretstreamPull") { state: Uint8Array, out: Uint8Array, ciphertext: Uint8Array, ad: Uint8Array? ->
      val tag = IpSodiumNative.secretstreamPull(state.view(), out.view(), ciphertext.view(), ad?.view())
      if (tag == IpSodiumNative.E_VERIFY) -1 else requireNonNegative(tag)
    }

    Function("signKeypair") { pk: Uint8Array, sk: Uint8Array ->
      requireOk(IpSodiumNative.signKeypair(pk.view(), sk.view()))
    }
    Function("signSeedKeypair") { pk: Uint8Array, sk: Uint8Array, seed: Uint8Array ->
      requireOk(IpSodiumNative.signSeedKeypair(pk.view(), sk.view(), seed.view()))
    }
    Function("signDetached") { sig: Uint8Array, message: Uint8Array, sk: Uint8Array ->
      requireOk(IpSodiumNative.signDetached(sig.view(), message.view(), sk.view()))
    }
    Function("signVerifyDetached") { sig: Uint8Array, message: Uint8Array, pk: Uint8Array ->
      isVerified(IpSodiumNative.signVerifyDetached(sig.view(), message.view(), pk.view()))
    }

    Function("genericHash") { out: Uint8Array, message: Uint8Array, key: Uint8Array? ->
      requireOk(IpSodiumNative.genericHash(out.view(), message.view(), key?.view()))
    }
    Function("hashSha256") { out: Uint8Array, message: Uint8Array ->
      requireOk(IpSodiumNative.hashSha256(out.view(), message.view()))
    }

    Function("pad") { buf: Uint8Array, unpaddedLength: Int, blockSize: Int ->
      requireNonNegative(IpSodiumNative.pad(buf.view(), unpaddedLength, blockSize))
    }
    Function("unpad") { buf: Uint8Array, blockSize: Int ->
      val length = IpSodiumNative.unpad(buf.view(), blockSize)
      if (length == IpSodiumNative.E_VERIFY) -1 else requireNonNegative(length)
    }

    Function("toBase64") { bin: Uint8Array ->
      IpSodiumNative.toBase64(bin.view()) ?: throw SodiumInternalException()
    }
    Function("fromBase64") { out: Uint8Array, text: String ->
      val length = IpSodiumNative.fromBase64(out.view(), text)
      if (length == IpSodiumNative.E_VERIFY) -1 else requireNonNegative(length)
    }
  }
}

/** View tanpa salin atas Uint8Array JS; `null` untuk buffer kosong (NULL/0 di sisi C). */
private fun Uint8Array.view(): ByteBuffer? = if (byteLength == 0) null else toDirectBuffer()

private fun requireOk(code: Int) {
  requireNonNegative(code)
}

private fun requireNonNegative(code: Int): Int = when {
  code >= 0 -> code
  code == IpSodiumNative.E_ARG -> throw SodiumArgumentException()
  else -> throw SodiumInternalException()
}

private fun isVerified(code: Int): Boolean {
  if (code == IpSodiumNative.E_VERIFY) return false
  requireOk(code)
  return true
}
