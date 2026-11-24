import CryptoKit
import Foundation
import XCTest

@testable import IpSodium

/// Kesamaan byte di iOS: libsodium xcframework hasil build + lapisan C vs `test-vectors/vectors.json`
/// (dihasilkan dari libsodium web). Dijalankan lewat test_spec podspec (`pod lib lint`/Xcode
/// "IpSodium-Unit-Tests"). Jest hanya menguji wrapper TS dengan native tiruan.
final class IpSodiumVectorsTests: XCTestCase {
  private static var vectors: [String: Any] = [:]

  override class func setUp() {
    super.setUp()
    let url = Bundle(for: IpSodiumVectorsTests.self).url(forResource: "vectors", withExtension: "json")!
    let data = try! Data(contentsOf: url)
    vectors = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
    precondition(ips_init() == 0)
  }

  private func list(_ name: String) -> [[String: Any]] {
    Self.vectors[name] as! [[String: Any]]
  }

  private func hex(_ value: Any?) -> [UInt8]? {
    guard let text = value as? String else { return nil }
    var bytes = [UInt8]()
    var index = text.startIndex
    while index < text.endIndex {
      let next = text.index(index, offsetBy: 2)
      bytes.append(UInt8(text[index..<next], radix: 16)!)
      index = next
    }
    return bytes
  }

  private func pattern(_ length: Int, _ start: Int, _ step: Int) -> [UInt8] {
    (0..<length).map { UInt8((start + $0 * step) & 0xff) }
  }

  /// Pointer NULL untuk buffer kosong/nil - sama dengan konvensi modul.
  private func withPtr<R>(_ bytes: [UInt8]?, _ body: (UnsafePointer<UInt8>?, Int) -> R) -> R {
    guard let bytes, !bytes.isEmpty else { return body(nil, 0) }
    return bytes.withUnsafeBufferPointer { body($0.baseAddress, $0.count) }
  }

  func testAead() {
    for v in list("aead") {
      let message = hex(v["message"])!, key = hex(v["key"])!, nonce = hex(v["nonce"])!
      let ad = hex(v["ad"])
      var sealed = [UInt8](repeating: 0, count: message.count + 16)
      let rc = withPtr(message) { m, ml in withPtr(ad) { a, al in
        ips_aead_xchacha20poly1305_ietf_encrypt(&sealed, sealed.count, m, ml, a, al, nonce, nonce.count, key, key.count)
      } }
      XCTAssertEqual(rc, 0)
      XCTAssertEqual(sealed, hex(v["ciphertext"]), v["name"] as! String)

      var opened = [UInt8](repeating: 0, count: message.count + 1)
      let open = withPtr(ad) { a, al in
        ips_aead_xchacha20poly1305_ietf_decrypt(&opened, message.count, sealed, sealed.count, a, al, nonce, nonce.count, key, key.count)
      }
      XCTAssertEqual(open, 0)
      XCTAssertEqual(Array(opened.prefix(message.count)), message)
    }
    for v in list("aeadTampered") {
      let c = hex(v["ciphertext"])!, key = hex(v["key"])!, nonce = hex(v["nonce"])!
      var out = [UInt8](repeating: 0, count: c.count)
      let rc = withPtr(hex(v["ad"])) { a, al in
        ips_aead_xchacha20poly1305_ietf_decrypt(&out, c.count - 16, c, c.count, a, al, nonce, nonce.count, key, key.count)
      }
      XCTAssertEqual(rc, -1, v["name"] as! String)
    }
  }

  func testKdf() {
    for v in list("kdf") {
      let key = hex(v["key"])!, context = Array((v["context"] as! String).utf8)
      var out = [UInt8](repeating: 0, count: v["length"] as! Int)
      XCTAssertEqual(
        ips_kdf_derive_from_key(&out, out.count, UInt64(v["subkeyId"] as! Int), context, context.count, key, key.count), 0)
      XCTAssertEqual(out, hex(v["subkey"]), v["name"] as! String)
    }
  }

  func testPwhashArgon2id() {
    for v in list("pwhash") {
      let password = hex(v["passwordNfc"])!, salt = hex(v["salt"])!
      // Kata sandi teks di vektor sengaja NFD; normalisasi NFC menghasilkan byte yang dipakai web.
      XCTAssertEqual(Array((v["passwordText"] as! String).precomposedStringWithCanonicalMapping.utf8), password)
      var out = [UInt8](repeating: 0, count: v["length"] as! Int)
      let rc = ips_pwhash(
        &out, out.count, password, password.count, salt, salt.count,
        UInt64(v["opslimit"] as! Int), v["memlimit"] as! Int, Int32(v["alg"] as! Int))
      XCTAssertEqual(rc, 0)
      XCTAssertEqual(out, hex(v["key"]), v["name"] as! String)
    }
  }

  func testSecretstream() {
    let stateBytes = ips_secretstream_statebytes()
    for v in list("secretstream") {
      let key = hex(v["key"])!, header = hex(v["header"])!
      var push = [UInt8](repeating: 0, count: stateBytes)
      var pull = [UInt8](repeating: 0, count: stateBytes)
      XCTAssertEqual(ips_secretstream_init_pull(&push, stateBytes, header, header.count, key, key.count), 0)
      XCTAssertEqual(ips_secretstream_init_pull(&pull, stateBytes, header, header.count, key, key.count), 0)
      for chunk in v["chunks"] as! [[String: Any]] {
        let message = hex(chunk["message"])!, ad = hex(chunk["ad"]), tag = chunk["tag"] as! Int
        var sealed = [UInt8](repeating: 0, count: message.count + 17)
        let rc = withPtr(message) { m, ml in withPtr(ad) { a, al in
          ips_secretstream_push(&push, stateBytes, &sealed, sealed.count, m, ml, a, al, Int32(tag))
        } }
        XCTAssertEqual(rc, 0)
        XCTAssertEqual(sealed, hex(chunk["ciphertext"]), v["name"] as! String)

        var opened = [UInt8](repeating: 0, count: message.count + 1)
        let pulled = withPtr(ad) { a, al in
          ips_secretstream_pull(&pull, stateBytes, &opened, message.count, sealed, sealed.count, a, al)
        }
        XCTAssertEqual(Int(pulled), tag)
        XCTAssertEqual(Array(opened.prefix(message.count)), message)
      }
    }
    for v in list("secretstreamInvalid") {
      let key = hex(v["key"])!, header = hex(v["header"])!
      var state = [UInt8](repeating: 0, count: stateBytes)
      _ = ips_secretstream_init_pull(&state, stateBytes, header, header.count, key, key.count)
      let chunks = v["chunks"] as! [[String: Any]]
      let failedAt = chunks.firstIndex { chunk in
        let c = hex(chunk["ciphertext"])!
        var out = [UInt8](repeating: 0, count: c.count)
        return withPtr(hex(chunk["ad"])) { a, al in
          ips_secretstream_pull(&state, stateBytes, &out, c.count - 17, c, c.count, a, al)
        } < 0
      }
      XCTAssertEqual(failedAt, v["failsAtChunk"] as? Int, v["name"] as! String)
    }
  }

  func testSecretstreamBackupChunks64k() {
    let stateBytes = ips_secretstream_statebytes()
    for v in list("secretstreamLarge") {
      let recipe = v["plaintext"] as! [String: Int]
      let plaintext = pattern(recipe["length"]!, recipe["start"]!, recipe["step"]!)
      let chunkBytes = v["chunkBytes"] as! Int
      let key = hex(v["key"])!, header = hex(v["header"])!, firstAd = hex(v["firstChunkAd"])!
      var state = [UInt8](repeating: 0, count: stateBytes)
      _ = ips_secretstream_init_pull(&state, stateBytes, header, header.count, key, key.count)
      for (index, expected) in (v["chunks"] as! [[String: Any]]).enumerated() {
        let message = Array(plaintext[(index * chunkBytes)..<min((index + 1) * chunkBytes, plaintext.count)])
        var sealed = [UInt8](repeating: 0, count: message.count + 17)
        let ad: [UInt8]? = index == 0 ? firstAd : nil
        _ = withPtr(ad) { a, al in
          ips_secretstream_push(&state, stateBytes, &sealed, sealed.count, message, message.count, a, al, Int32(expected["tag"] as! Int))
        }
        XCTAssertEqual(sealed.count, expected["ciphertextLength"] as? Int)
        let digest = SHA256.hash(data: sealed).map { String(format: "%02x", $0) }.joined()
        XCTAssertEqual(digest, expected["ciphertextSha256"] as? String, "chunk \(index)")
      }
    }
  }

  func testEd25519() {
    for v in list("sign") {
      let seed = hex(v["seed"])!
      var pk = [UInt8](repeating: 0, count: 32), sk = [UInt8](repeating: 0, count: 64)
      XCTAssertEqual(ips_sign_seed_keypair(&pk, 32, &sk, 64, seed, seed.count), 0)
      XCTAssertEqual(pk, hex(v["publicKey"]))
      XCTAssertEqual(sk, hex(v["secretKey"]))
      let message = hex(v["message"])!
      var sig = [UInt8](repeating: 0, count: 64)
      XCTAssertEqual(withPtr(message) { m, ml in ips_sign_detached(&sig, 64, m, ml, sk, 64) }, 0)
      XCTAssertEqual(sig, hex(v["signature"]), v["name"] as! String)
      XCTAssertEqual(withPtr(message) { m, ml in ips_sign_verify_detached(sig, 64, m, ml, pk, 32) }, 0)
    }
    for v in list("signInvalid") {
      let sig = hex(v["signature"])!, pk = hex(v["publicKey"])!
      let rc = withPtr(hex(v["message"])) { m, ml in ips_sign_verify_detached(sig, sig.count, m, ml, pk, pk.count) }
      XCTAssertEqual(rc, -1, v["name"] as! String)
    }
  }

  func testHashes() {
    for v in list("generichash") {
      var out = [UInt8](repeating: 0, count: v["length"] as! Int)
      let rc = withPtr(hex(v["message"])) { m, ml in withPtr(hex(v["key"])) { k, kl in
        ips_generichash(&out, out.count, m, ml, k, kl)
      } }
      XCTAssertEqual(rc, 0)
      XCTAssertEqual(out, hex(v["digest"]), v["name"] as! String)
    }
    for v in list("sha256") {
      var out = [UInt8](repeating: 0, count: 32)
      XCTAssertEqual(withPtr(hex(v["message"])) { m, ml in ips_hash_sha256(&out, 32, m, ml) }, 0)
      XCTAssertEqual(out, hex(v["digest"]), v["name"] as! String)
    }
  }

  func testPadAndBase64() {
    for v in list("pad") {
      let unpadded = hex(v["unpadded"])!, blockSize = v["blockSize"] as! Int
      var buf = unpadded + [UInt8](repeating: 0, count: (unpadded.count / blockSize + 1) * blockSize - unpadded.count)
      let length = ips_pad(&buf, buf.count, unpadded.count, blockSize)
      XCTAssertEqual(Array(buf.prefix(length)), hex(v["padded"]))
      let padded = hex(v["padded"])!
      XCTAssertEqual(ips_unpad(padded, padded.count, blockSize), unpadded.count)
    }
    for v in list("unpadInvalid") {
      let padded = hex(v["padded"])!
      XCTAssertEqual(ips_unpad(padded, padded.count, v["blockSize"] as! Int), -1)
    }
    for v in list("base64") {
      let bin = hex(v["bin"])!
      var encoded = [CChar](repeating: 0, count: ips_base64_encoded_len(bin.count))
      XCTAssertEqual(withPtr(bin) { b, bl in ips_bin2base64(&encoded, encoded.count, b, bl) }, 0)
      XCTAssertEqual(String(cString: encoded), v["b64"] as? String)
    }
    for text in Self.vectors["base64Invalid"] as! [String] {
      var out = [UInt8](repeating: 0, count: 8)
      let chars = Array(text.utf8CString.dropLast())
      XCTAssertEqual(ips_base642bin(&out, out.count, chars, chars.count), -1, text)
    }
  }
}
