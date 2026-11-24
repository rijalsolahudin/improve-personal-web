import ExpoModulesCore
import Foundation

/// Argumen tidak sesuai kontrak (panjang buffer/parameter) - bug pemanggil, bukan data rusak.
final class SodiumArgumentException: Exception, @unchecked Sendable {
  override var reason: String { "argumen sodium tidak valid" }
}

/// libsodium gagal (mis. Argon2id kehabisan memori). Pesan sengaja generik: tanpa isi buffer.
final class SodiumInternalException: Exception, @unchecked Sendable {
  override var reason: String { "operasi sodium gagal" }
}

// Kode balik `cpp/ip_sodium.h` (makro negatif tidak selalu diimpor Swift, jadi ditulis ulang).
private let ipsOK: Int32 = 0
private let ipsVerifyFailed: Int32 = -1
private let ipsBadArgument: Int32 = -2

/// `sodium_init` sekali, thread-safe (inisialisasi global Swift bersifat lazy + atomik).
private let isSodiumReady: Bool = ips_init() == ipsOK

private func requireReady() throws {
  guard isSodiumReady else { throw SodiumInternalException() }
}

@discardableResult
private func requireNonNegative<T: BinaryInteger>(_ code: T) throws -> T {
  if code >= 0 { return code }
  if code == T(ipsBadArgument) { throw SodiumArgumentException() }
  throw SodiumInternalException()
}

private func isVerified(_ code: Int32) throws -> Bool {
  if code == ipsVerifyFailed { return false }
  try requireNonNegative(code)
  return true
}

/// View tanpa salin atas Uint8Array JS; NULL/0 untuk buffer kosong atau `nil`.
private func view(_ array: Uint8Array?) -> (UnsafeMutablePointer<UInt8>?, Int) {
  guard let array, array.byteLength > 0 else { return (nil, 0) }
  return (array.rawPointer.assumingMemoryBound(to: UInt8.self), array.byteLength)
}

/// Expo Module `IpSodium`. Kontrak sama dengan versi Kotlin; pintu masuk app: `src/platform/sodium.ts`.
public final class IpSodiumModule: Module {
  public func definition() -> ModuleDefinition {
    Name("IpSodium")

    Function("randombytesBuf") { (out: Uint8Array) throws in
      try requireReady()
      let (o, ol) = view(out)
      ips_randombytes_buf(o, ol)
    }
    Function("memzero") { (buf: Uint8Array) in
      let (b, bl) = view(buf)
      ips_memzero(b, bl)
    }

    Function("aeadXChaCha20Poly1305IetfEncrypt") {
      (out: Uint8Array, message: Uint8Array, ad: Uint8Array?, nonce: Uint8Array, key: Uint8Array) throws in
      try requireReady()
      let (o, ol) = view(out), (m, ml) = view(message), (a, al) = view(ad)
      let (n, nl) = view(nonce), (k, kl) = view(key)
      try requireNonNegative(ips_aead_xchacha20poly1305_ietf_encrypt(o, ol, m, ml, a, al, n, nl, k, kl))
    }
    Function("aeadXChaCha20Poly1305IetfDecrypt") {
      (out: Uint8Array, ciphertext: Uint8Array, ad: Uint8Array?, nonce: Uint8Array, key: Uint8Array) throws -> Bool in
      try requireReady()
      let (o, ol) = view(out), (c, cl) = view(ciphertext), (a, al) = view(ad)
      let (n, nl) = view(nonce), (k, kl) = view(key)
      return try isVerified(ips_aead_xchacha20poly1305_ietf_decrypt(o, ol, c, cl, a, al, n, nl, k, kl))
    }

    Function("kdfDeriveFromKey") { (out: Uint8Array, subkeyId: Int, context: Uint8Array, key: Uint8Array) throws in
      try requireReady()
      guard subkeyId >= 0 else { throw SodiumArgumentException() }
      let (o, ol) = view(out), (c, cl) = view(context), (k, kl) = view(key)
      try requireNonNegative(ips_kdf_derive_from_key(o, ol, UInt64(subkeyId), c, cl, k, kl))
    }

    // Asinkron: Argon2id MODERATE (256 MiB) memakan detik dan tidak boleh memblok JS thread. Input
    // berupa salinan `Data` (view memori JS hanya sah di JS thread).
    AsyncFunction("pwhash") {
      (outLength: Int, password: Data, salt: Data, opslimit: Int, memlimit: Int, alg: Int) throws -> Data in
      try requireReady()
      guard outLength > 0, opslimit >= 0, memlimit >= 0, let algorithm = Int32(exactly: alg) else {
        throw SodiumArgumentException()
      }
      var out = Data(count: outLength)
      let code = out.withUnsafeMutableBytes { outRaw in
        password.withUnsafeBytes { pwRaw in
          salt.withUnsafeBytes { saltRaw in
            ips_pwhash(
              outRaw.bindMemory(to: UInt8.self).baseAddress, outLength,
              pwRaw.bindMemory(to: UInt8.self).baseAddress, pwRaw.count,
              saltRaw.bindMemory(to: UInt8.self).baseAddress, saltRaw.count,
              UInt64(opslimit), memlimit, algorithm)
          }
        }
      }
      // Salinan kata sandi dihapus di tempat (bukan lewat `var` yang memicu copy-on-write).
      password.withUnsafeBytes { raw in
        ips_memzero(UnsafeMutablePointer(mutating: raw.bindMemory(to: UInt8.self).baseAddress), raw.count)
      }
      try requireNonNegative(code)
      return out
    }

    Function("secretstreamStateBytes") { () -> Int in
      ips_secretstream_statebytes()
    }
    Function("secretstreamInitPush") { (state: Uint8Array, header: Uint8Array, key: Uint8Array) throws in
      try requireReady()
      let (s, sl) = view(state), (h, hl) = view(header), (k, kl) = view(key)
      try requireNonNegative(ips_secretstream_init_push(s, sl, h, hl, k, kl))
    }
    Function("secretstreamPush") {
      (state: Uint8Array, out: Uint8Array, message: Uint8Array, ad: Uint8Array?, tag: Int) throws in
      try requireReady()
      guard let tagValue = Int32(exactly: tag) else { throw SodiumArgumentException() }
      let (s, sl) = view(state), (o, ol) = view(out), (m, ml) = view(message), (a, al) = view(ad)
      try requireNonNegative(ips_secretstream_push(s, sl, o, ol, m, ml, a, al, tagValue))
    }
    Function("secretstreamInitPull") { (state: Uint8Array, header: Uint8Array, key: Uint8Array) throws -> Bool in
      try requireReady()
      let (s, sl) = view(state), (h, hl) = view(header), (k, kl) = view(key)
      return try isVerified(ips_secretstream_init_pull(s, sl, h, hl, k, kl))
    }
    Function("secretstreamPull") {
      (state: Uint8Array, out: Uint8Array, ciphertext: Uint8Array, ad: Uint8Array?) throws -> Int in
      try requireReady()
      let (s, sl) = view(state), (o, ol) = view(out), (c, cl) = view(ciphertext), (a, al) = view(ad)
      let tag = ips_secretstream_pull(s, sl, o, ol, c, cl, a, al)
      return tag == ipsVerifyFailed ? -1 : Int(try requireNonNegative(tag))
    }

    Function("signKeypair") { (pk: Uint8Array, sk: Uint8Array) throws in
      try requireReady()
      let (p, pl) = view(pk), (s, sl) = view(sk)
      try requireNonNegative(ips_sign_keypair(p, pl, s, sl))
    }
    Function("signSeedKeypair") { (pk: Uint8Array, sk: Uint8Array, seed: Uint8Array) throws in
      try requireReady()
      let (p, pl) = view(pk), (s, sl) = view(sk), (d, dl) = view(seed)
      try requireNonNegative(ips_sign_seed_keypair(p, pl, s, sl, d, dl))
    }
    Function("signDetached") { (sig: Uint8Array, message: Uint8Array, sk: Uint8Array) throws in
      try requireReady()
      let (g, gl) = view(sig), (m, ml) = view(message), (s, sl) = view(sk)
      try requireNonNegative(ips_sign_detached(g, gl, m, ml, s, sl))
    }
    Function("signVerifyDetached") { (sig: Uint8Array, message: Uint8Array, pk: Uint8Array) throws -> Bool in
      try requireReady()
      let (g, gl) = view(sig), (m, ml) = view(message), (p, pl) = view(pk)
      return try isVerified(ips_sign_verify_detached(g, gl, m, ml, p, pl))
    }

    Function("genericHash") { (out: Uint8Array, message: Uint8Array, key: Uint8Array?) throws in
      try requireReady()
      let (o, ol) = view(out), (m, ml) = view(message), (k, kl) = view(key)
      try requireNonNegative(ips_generichash(o, ol, m, ml, k, kl))
    }
    Function("hashSha256") { (out: Uint8Array, message: Uint8Array) throws in
      try requireReady()
      let (o, ol) = view(out), (m, ml) = view(message)
      try requireNonNegative(ips_hash_sha256(o, ol, m, ml))
    }

    Function("pad") { (buf: Uint8Array, unpaddedLength: Int, blockSize: Int) throws -> Int in
      guard unpaddedLength >= 0, blockSize > 0 else { throw SodiumArgumentException() }
      let (b, bl) = view(buf)
      return try requireNonNegative(ips_pad(b, bl, unpaddedLength, blockSize))
    }
    Function("unpad") { (buf: Uint8Array, blockSize: Int) throws -> Int in
      guard blockSize > 0 else { throw SodiumArgumentException() }
      let (b, bl) = view(buf)
      let length = ips_unpad(b, bl, blockSize)
      return length == Int(ipsVerifyFailed) ? -1 : try requireNonNegative(length)
    }

    Function("toBase64") { (bin: Uint8Array) throws -> String in
      let (b, bl) = view(bin)
      var out = [CChar](repeating: 0, count: ips_base64_encoded_len(bl))
      try requireNonNegative(ips_bin2base64(&out, out.count, b, bl))
      return String(cString: out)
    }
    Function("fromBase64") { (out: Uint8Array, text: String) throws -> Int in
      let (o, ol) = view(out)
      let chars = Array(text.utf8CString.dropLast())
      let length = chars.withUnsafeBufferPointer { ips_base642bin(o, ol, $0.baseAddress, $0.count) }
      return length == Int(ipsVerifyFailed) ? -1 : try requireNonNegative(length)
    }
  }
}
