#include "ip_sodium.h"

#include <limits.h>
#include <string.h>
#include <sodium.h>

/* Pointer NULL hanya sah untuk buffer kosong (JS bisa mengirim Uint8Array panjang 0). */
#define IPS_BUF_OK(ptr, len) ((ptr) != NULL || (len) == 0)

int ips_init(void) { return sodium_init() < 0 ? IPS_E_INTERNAL : IPS_OK; }

void ips_randombytes_buf(uint8_t *out, size_t out_len) {
  if (out_len > 0) randombytes_buf(out, out_len);
}

void ips_memzero(uint8_t *buf, size_t len) {
  if (len > 0) sodium_memzero(buf, len);
}

int ips_aead_xchacha20poly1305_ietf_encrypt(uint8_t *out, size_t out_len, const uint8_t *m,
                                            size_t m_len, const uint8_t *ad, size_t ad_len,
                                            const uint8_t *nonce, size_t nonce_len,
                                            const uint8_t *key, size_t key_len) {
  if (m_len > crypto_aead_xchacha20poly1305_ietf_MESSAGEBYTES_MAX ||
      out_len != m_len + crypto_aead_xchacha20poly1305_ietf_ABYTES ||
      nonce_len != crypto_aead_xchacha20poly1305_ietf_NPUBBYTES ||
      key_len != crypto_aead_xchacha20poly1305_ietf_KEYBYTES || !IPS_BUF_OK(m, m_len) ||
      !IPS_BUF_OK(ad, ad_len)) {
    return IPS_E_ARG;
  }
  unsigned long long written = 0;
  crypto_aead_xchacha20poly1305_ietf_encrypt(out, &written, m, m_len, ad, ad_len, NULL, nonce,
                                             key);
  return written == out_len ? IPS_OK : IPS_E_INTERNAL;
}

int ips_aead_xchacha20poly1305_ietf_decrypt(uint8_t *out, size_t out_len, const uint8_t *c,
                                            size_t c_len, const uint8_t *ad, size_t ad_len,
                                            const uint8_t *nonce, size_t nonce_len,
                                            const uint8_t *key, size_t key_len) {
  if (c_len < crypto_aead_xchacha20poly1305_ietf_ABYTES ||
      out_len != c_len - crypto_aead_xchacha20poly1305_ietf_ABYTES ||
      nonce_len != crypto_aead_xchacha20poly1305_ietf_NPUBBYTES ||
      key_len != crypto_aead_xchacha20poly1305_ietf_KEYBYTES || !IPS_BUF_OK(ad, ad_len)) {
    return IPS_E_ARG;
  }
  unsigned long long written = 0;
  if (crypto_aead_xchacha20poly1305_ietf_decrypt(out, &written, NULL, c, c_len, ad, ad_len, nonce,
                                                 key) != 0) {
    /* libsodium tidak menulis plaintext saat MAC gagal; tetap dihapus supaya kontraknya jelas. */
    ips_memzero(out, out_len);
    return IPS_E_VERIFY;
  }
  return written == out_len ? IPS_OK : IPS_E_INTERNAL;
}

int ips_kdf_derive_from_key(uint8_t *out, size_t out_len, uint64_t subkey_id, const uint8_t *ctx,
                            size_t ctx_len, const uint8_t *key, size_t key_len) {
  if (out_len < crypto_kdf_BYTES_MIN || out_len > crypto_kdf_BYTES_MAX ||
      ctx_len != crypto_kdf_CONTEXTBYTES || key_len != crypto_kdf_KEYBYTES) {
    return IPS_E_ARG;
  }
  /* Konteks libsodium = char[8] TANPA terminator; disalin supaya tipe & panjangnya pasti. */
  char context[crypto_kdf_CONTEXTBYTES];
  for (size_t i = 0; i < crypto_kdf_CONTEXTBYTES; i++) context[i] = (char)ctx[i];
  return crypto_kdf_derive_from_key(out, out_len, subkey_id, context, key) == 0 ? IPS_OK
                                                                                 : IPS_E_INTERNAL;
}

int ips_pwhash(uint8_t *out, size_t out_len, const uint8_t *password, size_t password_len,
               const uint8_t *salt, size_t salt_len, uint64_t opslimit, size_t memlimit, int alg) {
  if (alg != crypto_pwhash_ALG_ARGON2ID13 || out_len < crypto_pwhash_BYTES_MIN ||
      salt_len != crypto_pwhash_SALTBYTES || opslimit < crypto_pwhash_OPSLIMIT_MIN ||
      opslimit > crypto_pwhash_OPSLIMIT_MAX || memlimit < crypto_pwhash_MEMLIMIT_MIN ||
      memlimit > crypto_pwhash_MEMLIMIT_MAX || password_len > crypto_pwhash_PASSWD_MAX ||
      !IPS_BUF_OK(password, password_len)) {
    return IPS_E_ARG;
  }
  if (crypto_pwhash(out, out_len, (const char *)password, password_len, salt, opslimit, memlimit,
                    alg) != 0) {
    ips_memzero(out, out_len);
    return IPS_E_INTERNAL;
  }
  return IPS_OK;
}

size_t ips_secretstream_statebytes(void) {
  return crypto_secretstream_xchacha20poly1305_statebytes();
}

int ips_secretstream_init_push(uint8_t *state, size_t state_len, uint8_t *header,
                               size_t header_len, const uint8_t *key, size_t key_len) {
  if (state_len != sizeof(crypto_secretstream_xchacha20poly1305_state) ||
      header_len != crypto_secretstream_xchacha20poly1305_HEADERBYTES ||
      key_len != crypto_secretstream_xchacha20poly1305_KEYBYTES) {
    return IPS_E_ARG;
  }
  crypto_secretstream_xchacha20poly1305_state st;
  crypto_secretstream_xchacha20poly1305_init_push(&st, header, key);
  memcpy(state, &st, sizeof st);
  sodium_memzero(&st, sizeof st);
  return IPS_OK;
}

int ips_secretstream_push(uint8_t *state, size_t state_len, uint8_t *out, size_t out_len,
                          const uint8_t *m, size_t m_len, const uint8_t *ad, size_t ad_len,
                          int tag) {
  if (state_len != sizeof(crypto_secretstream_xchacha20poly1305_state) ||
      m_len > crypto_secretstream_xchacha20poly1305_MESSAGEBYTES_MAX ||
      out_len != m_len + crypto_secretstream_xchacha20poly1305_ABYTES || tag < 0 ||
      tag > UCHAR_MAX || !IPS_BUF_OK(m, m_len) || !IPS_BUF_OK(ad, ad_len)) {
    return IPS_E_ARG;
  }
  crypto_secretstream_xchacha20poly1305_state st;
  memcpy(&st, state, sizeof st);
  unsigned long long written = 0;
  crypto_secretstream_xchacha20poly1305_push(&st, out, &written, m, m_len, ad, ad_len,
                                             (unsigned char)tag);
  memcpy(state, &st, sizeof st);
  sodium_memzero(&st, sizeof st);
  return written == out_len ? IPS_OK : IPS_E_INTERNAL;
}

int ips_secretstream_init_pull(uint8_t *state, size_t state_len, const uint8_t *header,
                               size_t header_len, const uint8_t *key, size_t key_len) {
  if (state_len != sizeof(crypto_secretstream_xchacha20poly1305_state) ||
      header_len != crypto_secretstream_xchacha20poly1305_HEADERBYTES ||
      key_len != crypto_secretstream_xchacha20poly1305_KEYBYTES) {
    return IPS_E_ARG;
  }
  crypto_secretstream_xchacha20poly1305_state st;
  int rc = crypto_secretstream_xchacha20poly1305_init_pull(&st, header, key);
  memcpy(state, &st, sizeof st);
  sodium_memzero(&st, sizeof st);
  return rc == 0 ? IPS_OK : IPS_E_VERIFY;
}

int ips_secretstream_pull(uint8_t *state, size_t state_len, uint8_t *out, size_t out_len,
                          const uint8_t *c, size_t c_len, const uint8_t *ad, size_t ad_len) {
  if (state_len != sizeof(crypto_secretstream_xchacha20poly1305_state) ||
      c_len < crypto_secretstream_xchacha20poly1305_ABYTES ||
      out_len != c_len - crypto_secretstream_xchacha20poly1305_ABYTES ||
      !IPS_BUF_OK(ad, ad_len)) {
    return IPS_E_ARG;
  }
  crypto_secretstream_xchacha20poly1305_state st;
  memcpy(&st, state, sizeof st);
  unsigned long long written = 0;
  unsigned char tag = 0;
  int rc = crypto_secretstream_xchacha20poly1305_pull(&st, out, &written, &tag, c, c_len, ad,
                                                      ad_len);
  if (rc != 0) {
    /* State TIDAK dimajukan saat gagal: stream yang rusak tidak bisa dilanjutkan diam-diam. */
    sodium_memzero(&st, sizeof st);
    ips_memzero(out, out_len);
    return IPS_E_VERIFY;
  }
  memcpy(state, &st, sizeof st);
  sodium_memzero(&st, sizeof st);
  return written == out_len ? (int)tag : IPS_E_INTERNAL;
}

int ips_sign_keypair(uint8_t *pk, size_t pk_len, uint8_t *sk, size_t sk_len) {
  if (pk_len != crypto_sign_ed25519_PUBLICKEYBYTES ||
      sk_len != crypto_sign_ed25519_SECRETKEYBYTES) {
    return IPS_E_ARG;
  }
  return crypto_sign_ed25519_keypair(pk, sk) == 0 ? IPS_OK : IPS_E_INTERNAL;
}

int ips_sign_seed_keypair(uint8_t *pk, size_t pk_len, uint8_t *sk, size_t sk_len,
                          const uint8_t *seed, size_t seed_len) {
  if (pk_len != crypto_sign_ed25519_PUBLICKEYBYTES ||
      sk_len != crypto_sign_ed25519_SECRETKEYBYTES || seed_len != crypto_sign_ed25519_SEEDBYTES) {
    return IPS_E_ARG;
  }
  return crypto_sign_ed25519_seed_keypair(pk, sk, seed) == 0 ? IPS_OK : IPS_E_INTERNAL;
}

int ips_sign_detached(uint8_t *sig, size_t sig_len, const uint8_t *m, size_t m_len,
                      const uint8_t *sk, size_t sk_len) {
  if (sig_len != crypto_sign_ed25519_BYTES || sk_len != crypto_sign_ed25519_SECRETKEYBYTES ||
      !IPS_BUF_OK(m, m_len)) {
    return IPS_E_ARG;
  }
  return crypto_sign_ed25519_detached(sig, NULL, m, m_len, sk) == 0 ? IPS_OK : IPS_E_INTERNAL;
}

int ips_sign_verify_detached(const uint8_t *sig, size_t sig_len, const uint8_t *m, size_t m_len,
                             const uint8_t *pk, size_t pk_len) {
  if (sig_len != crypto_sign_ed25519_BYTES || pk_len != crypto_sign_ed25519_PUBLICKEYBYTES ||
      !IPS_BUF_OK(m, m_len)) {
    return IPS_E_ARG;
  }
  return crypto_sign_ed25519_verify_detached(sig, m, m_len, pk) == 0 ? IPS_OK : IPS_E_VERIFY;
}

int ips_generichash(uint8_t *out, size_t out_len, const uint8_t *m, size_t m_len,
                    const uint8_t *key, size_t key_len) {
  if (out_len < crypto_generichash_BYTES_MIN || out_len > crypto_generichash_BYTES_MAX ||
      (key_len != 0 &&
       (key_len < crypto_generichash_KEYBYTES_MIN || key_len > crypto_generichash_KEYBYTES_MAX)) ||
      !IPS_BUF_OK(m, m_len) || !IPS_BUF_OK(key, key_len)) {
    return IPS_E_ARG;
  }
  return crypto_generichash(out, out_len, m, m_len, key_len == 0 ? NULL : key, key_len) == 0
             ? IPS_OK
             : IPS_E_INTERNAL;
}

int ips_hash_sha256(uint8_t *out, size_t out_len, const uint8_t *m, size_t m_len) {
  if (out_len != crypto_hash_sha256_BYTES || !IPS_BUF_OK(m, m_len)) return IPS_E_ARG;
  return crypto_hash_sha256(out, m, m_len) == 0 ? IPS_OK : IPS_E_INTERNAL;
}

long ips_pad(uint8_t *buf, size_t buf_len, size_t unpadded_len, size_t block_size) {
  size_t padded = 0;
  if (block_size == 0 || unpadded_len > buf_len || !IPS_BUF_OK(buf, buf_len)) return IPS_E_ARG;
  if (sodium_pad(&padded, buf, unpadded_len, block_size, buf_len) != 0 || padded > LONG_MAX) {
    return IPS_E_ARG;
  }
  return (long)padded;
}

long ips_unpad(const uint8_t *buf, size_t buf_len, size_t block_size) {
  size_t unpadded = 0;
  if (block_size == 0 || !IPS_BUF_OK(buf, buf_len)) return IPS_E_ARG;
  if (sodium_unpad(&unpadded, buf, buf_len, block_size) != 0 || unpadded > LONG_MAX) {
    return IPS_E_VERIFY;
  }
  return (long)unpadded;
}

size_t ips_base64_encoded_len(size_t bin_len) {
  return sodium_base64_ENCODED_LEN(bin_len, sodium_base64_VARIANT_ORIGINAL);
}

int ips_bin2base64(char *out, size_t out_len, const uint8_t *bin, size_t bin_len) {
  if (out_len != ips_base64_encoded_len(bin_len) || !IPS_BUF_OK(bin, bin_len)) return IPS_E_ARG;
  sodium_bin2base64(out, out_len, bin, bin_len, sodium_base64_VARIANT_ORIGINAL);
  return IPS_OK;
}

long ips_base642bin(uint8_t *out, size_t out_len, const char *b64, size_t b64_len) {
  size_t written = 0;
  const char *end = NULL;
  if (!IPS_BUF_OK(b64, b64_len) || !IPS_BUF_OK(out, out_len)) return IPS_E_ARG;
  if (sodium_base642bin(out, out_len, b64, b64_len, NULL, &written, &end,
                        sodium_base64_VARIANT_ORIGINAL) != 0 ||
      end != b64 + b64_len || written > LONG_MAX) {
    /* Sisa karakter tak terbaca = input bukan base64 murni; ditolak, bukan dipotong diam-diam. */
    ips_memzero(out, out_len);
    return IPS_E_VERIFY;
  }
  return (long)written;
}
