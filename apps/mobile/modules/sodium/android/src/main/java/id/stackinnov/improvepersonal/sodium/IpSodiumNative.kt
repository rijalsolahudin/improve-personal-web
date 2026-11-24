package id.stackinnov.improvepersonal.sodium

import java.nio.ByteBuffer

/**
 * Deklarasi JNI ke `libipsodium.so` (cpp/ip_sodium.c + libsodium statis hasil build-libsodium.sh).
 *
 * Semua fungsi mengembalikan kode `ip_sodium.h`: 0 = OK, -1 = verifikasi gagal, -2 = argumen salah,
 * -3 = galat internal. Dipakai [IpSodiumModule] dan test instrumented (androidTest) - test memanggil
 * lapisan ini langsung supaya vektor menguji jalur native yang sama dengan app.
 */
internal object IpSodiumNative {
  const val OK = 0
  const val E_VERIFY = -1
  const val E_ARG = -2

  init {
    System.loadLibrary("ipsodium")
  }

  @JvmStatic external fun init(): Int
  @JvmStatic external fun randombytesBuf(out: ByteBuffer?)
  @JvmStatic external fun memzero(buf: ByteBuffer?)

  @JvmStatic external fun aeadEncrypt(
    out: ByteBuffer?, message: ByteBuffer?, ad: ByteBuffer?, nonce: ByteBuffer?, key: ByteBuffer?
  ): Int

  @JvmStatic external fun aeadDecrypt(
    out: ByteBuffer?, ciphertext: ByteBuffer?, ad: ByteBuffer?, nonce: ByteBuffer?, key: ByteBuffer?
  ): Int

  @JvmStatic external fun kdfDeriveFromKey(
    out: ByteBuffer?, subkeyId: Long, context: ByteBuffer?, key: ByteBuffer?
  ): Int

  @JvmStatic external fun pwhash(
    out: ByteArray, password: ByteArray, salt: ByteArray, opslimit: Long, memlimit: Long, alg: Int
  ): Int

  @JvmStatic external fun secretstreamStateBytes(): Int
  @JvmStatic external fun secretstreamInitPush(state: ByteBuffer?, header: ByteBuffer?, key: ByteBuffer?): Int
  @JvmStatic external fun secretstreamPush(
    state: ByteBuffer?, out: ByteBuffer?, message: ByteBuffer?, ad: ByteBuffer?, tag: Int
  ): Int
  @JvmStatic external fun secretstreamInitPull(state: ByteBuffer?, header: ByteBuffer?, key: ByteBuffer?): Int
  @JvmStatic external fun secretstreamPull(
    state: ByteBuffer?, out: ByteBuffer?, ciphertext: ByteBuffer?, ad: ByteBuffer?
  ): Int

  @JvmStatic external fun signKeypair(pk: ByteBuffer?, sk: ByteBuffer?): Int
  @JvmStatic external fun signSeedKeypair(pk: ByteBuffer?, sk: ByteBuffer?, seed: ByteBuffer?): Int
  @JvmStatic external fun signDetached(sig: ByteBuffer?, message: ByteBuffer?, sk: ByteBuffer?): Int
  @JvmStatic external fun signVerifyDetached(sig: ByteBuffer?, message: ByteBuffer?, pk: ByteBuffer?): Int

  @JvmStatic external fun genericHash(out: ByteBuffer?, message: ByteBuffer?, key: ByteBuffer?): Int
  @JvmStatic external fun hashSha256(out: ByteBuffer?, message: ByteBuffer?): Int

  @JvmStatic external fun pad(buf: ByteBuffer?, unpaddedLength: Int, blockSize: Int): Int
  @JvmStatic external fun unpad(buf: ByteBuffer?, blockSize: Int): Int

  @JvmStatic external fun toBase64(bin: ByteBuffer?): String?
  @JvmStatic external fun fromBase64(out: ByteBuffer?, text: String): Int
}
