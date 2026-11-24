package id.stackinnov.improvepersonal.sodium

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.nio.ByteBuffer
import java.security.MessageDigest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.BeforeClass
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Kesamaan byte di PERANGKAT: libsodium hasil build NDK + lem JNI vs `test-vectors/vectors.json`
 * (dihasilkan dari libsodium web). Jest hanya menguji wrapper TS dengan native tiruan; test inilah
 * yang membuktikan jalur native Android.
 *
 *   ./gradlew :ip-sodium:connectedAndroidTest   (nama proyek mengikuti autolinking)
 */
@RunWith(AndroidJUnit4::class)
class IpSodiumVectorsTest {
  companion object {
    private lateinit var vectors: JSONObject

    @BeforeClass
    @JvmStatic
    fun load() {
      val assets = InstrumentationRegistry.getInstrumentation().context.assets
      vectors = JSONObject(assets.open("vectors.json").bufferedReader().use { it.readText() })
      assertEquals(IpSodiumNative.OK, IpSodiumNative.init())
    }

    private const val NULL_HEX = "null"
  }

  private fun hex(value: String): ByteArray =
    ByteArray(value.length / 2) { i -> value.substring(2 * i, 2 * i + 2).toInt(16).toByte() }

  private fun direct(bytes: ByteArray?): ByteBuffer? {
    if (bytes == null || bytes.isEmpty()) return null
    return ByteBuffer.allocateDirect(bytes.size).put(bytes).also { it.flip() }
  }

  private fun out(size: Int): ByteBuffer? = if (size == 0) null else ByteBuffer.allocateDirect(size)

  private fun bytesOf(buffer: ByteBuffer?): ByteArray {
    if (buffer == null) return ByteArray(0)
    val copy = ByteArray(buffer.capacity())
    buffer.duplicate().also { it.clear() }.get(copy)
    return copy
  }

  private fun JSONObject.optHex(name: String): ByteArray? =
    if (isNull(name) || optString(name) == NULL_HEX) null else hex(getString(name))

  private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }

  private fun pattern(length: Int, start: Int, step: Int): ByteArray =
    ByteArray(length) { i -> ((start + i * step) and 0xff).toByte() }

  @Test
  fun aead() {
    for (v in vectors.getJSONArray("aead").objects()) {
      val message = hex(v.getString("message"))
      val ciphertext = out(message.size + 16)
      assertEquals(
        IpSodiumNative.OK,
        IpSodiumNative.aeadEncrypt(
          ciphertext, direct(message), direct(v.optHex("ad")),
          direct(hex(v.getString("nonce"))), direct(hex(v.getString("key")))
        )
      )
      assertArrayEquals(v.getString("name"), hex(v.getString("ciphertext")), bytesOf(ciphertext))

      val opened = out(message.size)
      assertEquals(
        IpSodiumNative.OK,
        IpSodiumNative.aeadDecrypt(
          opened, direct(hex(v.getString("ciphertext"))), direct(v.optHex("ad")),
          direct(hex(v.getString("nonce"))), direct(hex(v.getString("key")))
        )
      )
      assertArrayEquals(message, bytesOf(opened))
    }
    for (v in vectors.getJSONArray("aeadTampered").objects()) {
      val ciphertext = hex(v.getString("ciphertext"))
      assertEquals(
        v.getString("name"),
        IpSodiumNative.E_VERIFY,
        IpSodiumNative.aeadDecrypt(
          out(ciphertext.size - 16), direct(ciphertext), direct(v.optHex("ad")),
          direct(hex(v.getString("nonce"))), direct(hex(v.getString("key")))
        )
      )
    }
  }

  @Test
  fun kdf() {
    for (v in vectors.getJSONArray("kdf").objects()) {
      val subkey = out(v.getInt("length"))
      assertEquals(
        IpSodiumNative.OK,
        IpSodiumNative.kdfDeriveFromKey(
          subkey, v.getLong("subkeyId"), direct(v.getString("context").toByteArray(Charsets.US_ASCII)),
          direct(hex(v.getString("key")))
        )
      )
      assertArrayEquals(v.getString("name"), hex(v.getString("subkey")), bytesOf(subkey))
    }
  }

  @Test
  fun pwhashArgon2id() {
    for (v in vectors.getJSONArray("pwhash").objects()) {
      val key = ByteArray(v.getInt("length"))
      assertEquals(
        IpSodiumNative.OK,
        IpSodiumNative.pwhash(
          key, hex(v.getString("passwordNfc")), hex(v.getString("salt")),
          v.getLong("opslimit"), v.getLong("memlimit"), v.getInt("alg")
        )
      )
      assertArrayEquals(v.getString("name"), hex(v.getString("key")), key)
    }
  }

  @Test
  fun secretstreamPushPullAndTamper() {
    val stateBytes = IpSodiumNative.secretstreamStateBytes()
    for (v in vectors.getJSONArray("secretstream").objects()) {
      val key = direct(hex(v.getString("key")))
      val header = direct(hex(v.getString("header")))
      val push = ByteBuffer.allocateDirect(stateBytes)
      val pull = ByteBuffer.allocateDirect(stateBytes)
      // State push dari init_pull(header): identik dengan init_push yang menghasilkan header itu.
      assertEquals(IpSodiumNative.OK, IpSodiumNative.secretstreamInitPull(push, header, key))
      assertEquals(IpSodiumNative.OK, IpSodiumNative.secretstreamInitPull(pull, header, key))
      for (chunk in v.getJSONArray("chunks").objects()) {
        val message = hex(chunk.getString("message"))
        val sealed = ByteBuffer.allocateDirect(message.size + 17)
        assertEquals(
          IpSodiumNative.OK,
          IpSodiumNative.secretstreamPush(
            push, sealed, direct(message), direct(chunk.optHex("ad")), chunk.getInt("tag")
          )
        )
        assertArrayEquals(v.getString("name"), hex(chunk.getString("ciphertext")), bytesOf(sealed))

        val opened = out(message.size)
        val tag = IpSodiumNative.secretstreamPull(
          pull, opened, direct(hex(chunk.getString("ciphertext"))), direct(chunk.optHex("ad"))
        )
        assertEquals(chunk.getInt("tag"), tag)
        assertArrayEquals(message, bytesOf(opened))
      }
    }
    for (v in vectors.getJSONArray("secretstreamInvalid").objects()) {
      val state = ByteBuffer.allocateDirect(stateBytes)
      IpSodiumNative.secretstreamInitPull(
        state, direct(hex(v.getString("header"))), direct(hex(v.getString("key")))
      )
      val failedAt = v.getJSONArray("chunks").objects().indexOfFirst { chunk ->
        val ciphertext = hex(chunk.getString("ciphertext"))
        IpSodiumNative.secretstreamPull(
          state, out(ciphertext.size - 17), direct(ciphertext), direct(chunk.optHex("ad"))
        ) < 0
      }
      assertEquals(v.getString("name"), v.getInt("failsAtChunk"), failedAt)
    }
  }

  @Test
  fun secretstreamBackupChunks64k() {
    val stateBytes = IpSodiumNative.secretstreamStateBytes()
    val sha256 = MessageDigest.getInstance("SHA-256")
    for (v in vectors.getJSONArray("secretstreamLarge").objects()) {
      val recipe = v.getJSONObject("plaintext")
      val plaintext = pattern(recipe.getInt("length"), recipe.getInt("start"), recipe.getInt("step"))
      val chunkBytes = v.getInt("chunkBytes")
      val key = direct(hex(v.getString("key")))
      val header = direct(hex(v.getString("header")))
      val push = ByteBuffer.allocateDirect(stateBytes)
      IpSodiumNative.secretstreamInitPull(push, header, key)
      v.getJSONArray("chunks").objects().forEachIndexed { index, expected ->
        val from = index * chunkBytes
        val message = plaintext.copyOfRange(from, minOf(from + chunkBytes, plaintext.size))
        val sealed = ByteBuffer.allocateDirect(message.size + 17)
        val ad = if (index == 0) direct(hex(v.getString("firstChunkAd"))) else null
        IpSodiumNative.secretstreamPush(push, sealed, direct(message), ad, expected.getInt("tag"))
        assertEquals(expected.getInt("ciphertextLength"), sealed.capacity())
        val digest = sha256.digest(bytesOf(sealed)).joinToString("") { "%02x".format(it) }
        assertEquals("chunk $index", expected.getString("ciphertextSha256"), digest)
      }
    }
  }

  @Test
  fun ed25519() {
    for (v in vectors.getJSONArray("sign").objects()) {
      val pk = ByteBuffer.allocateDirect(32)
      val sk = ByteBuffer.allocateDirect(64)
      assertEquals(
        IpSodiumNative.OK,
        IpSodiumNative.signSeedKeypair(pk, sk, direct(hex(v.getString("seed"))))
      )
      assertArrayEquals(hex(v.getString("publicKey")), bytesOf(pk))
      assertArrayEquals(hex(v.getString("secretKey")), bytesOf(sk))

      val signature = ByteBuffer.allocateDirect(64)
      val message = hex(v.getString("message"))
      assertEquals(IpSodiumNative.OK, IpSodiumNative.signDetached(signature, direct(message), sk))
      assertArrayEquals(v.getString("name"), hex(v.getString("signature")), bytesOf(signature))
      assertEquals(IpSodiumNative.OK, IpSodiumNative.signVerifyDetached(signature, direct(message), pk))
    }
    for (v in vectors.getJSONArray("signInvalid").objects()) {
      assertEquals(
        v.getString("name"),
        IpSodiumNative.E_VERIFY,
        IpSodiumNative.signVerifyDetached(
          direct(hex(v.getString("signature"))), direct(hex(v.getString("message"))),
          direct(hex(v.getString("publicKey")))
        )
      )
    }
  }

  @Test
  fun hashes() {
    for (v in vectors.getJSONArray("generichash").objects()) {
      val digest = ByteBuffer.allocateDirect(v.getInt("length"))
      assertEquals(
        IpSodiumNative.OK,
        IpSodiumNative.genericHash(digest, direct(hex(v.getString("message"))), direct(v.optHex("key")))
      )
      assertArrayEquals(v.getString("name"), hex(v.getString("digest")), bytesOf(digest))
    }
    for (v in vectors.getJSONArray("sha256").objects()) {
      val digest = ByteBuffer.allocateDirect(32)
      assertEquals(IpSodiumNative.OK, IpSodiumNative.hashSha256(digest, direct(hex(v.getString("message")))))
      assertArrayEquals(v.getString("name"), hex(v.getString("digest")), bytesOf(digest))
    }
  }

  @Test
  fun padAndBase64() {
    for (v in vectors.getJSONArray("pad").objects()) {
      val unpadded = hex(v.getString("unpadded"))
      val blockSize = v.getInt("blockSize")
      val buf = ByteBuffer.allocateDirect((unpadded.size / blockSize + 1) * blockSize)
      buf.put(unpadded).clear()
      val length = IpSodiumNative.pad(buf, unpadded.size, blockSize)
      assertArrayEquals(hex(v.getString("padded")), bytesOf(buf).copyOf(length))
      assertEquals(unpadded.size, IpSodiumNative.unpad(direct(hex(v.getString("padded"))), blockSize))
    }
    for (v in vectors.getJSONArray("unpadInvalid").objects()) {
      assertEquals(
        IpSodiumNative.E_VERIFY,
        IpSodiumNative.unpad(direct(hex(v.getString("padded"))), v.getInt("blockSize"))
      )
    }
    for (v in vectors.getJSONArray("base64").objects()) {
      val bin = hex(v.getString("bin"))
      assertEquals(v.getString("b64"), IpSodiumNative.toBase64(direct(bin)))
      val decoded = ByteBuffer.allocateDirect(bin.size + 3)
      val length = IpSodiumNative.fromBase64(decoded, v.getString("b64"))
      assertArrayEquals(bin, bytesOf(decoded).copyOf(length))
    }
    val invalid = vectors.getJSONArray("base64Invalid")
    for (i in 0 until invalid.length()) {
      assertEquals(
        IpSodiumNative.E_VERIFY,
        IpSodiumNative.fromBase64(ByteBuffer.allocateDirect(8), invalid.getString(i))
      )
    }
  }

  @Test
  fun randomAndMemzero() {
    val first = ByteBuffer.allocateDirect(32)
    val second = ByteBuffer.allocateDirect(32)
    IpSodiumNative.randombytesBuf(first)
    IpSodiumNative.randombytesBuf(second)
    assertNotEquals(bytesOf(first).toList(), bytesOf(second).toList())
    IpSodiumNative.memzero(first)
    assertArrayEquals(ByteArray(32), bytesOf(first))
  }
}
