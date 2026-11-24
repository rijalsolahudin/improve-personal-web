/*
 * Lapisan C tipis di atas libsodium, dipakai bersama oleh JNI (Android), Swift (iOS), dan CLI uji host.
 *
 * Kenapa ada lapisan ini, bukan memanggil libsodium langsung dari Kotlin/Swift:
 * - Validasi panjang SATU tempat: semua buffer datang dengan panjang eksplisit dan dicek terhadap
 *   konstanta libsodium sebelum dipakai. Buffer JS yang salah ukuran = kode error, bukan baca/tulis
 *   di luar batas.
 * - Output ditulis ke buffer milik pemanggil (Uint8Array dari JS). Tidak ada salinan plaintext/kunci
 *   di heap JVM/Swift yang tidak bisa dihapus; temporari di sini dihapus `sodium_memzero`.
 * - Bisa dikompilasi & diuji di host (gcc) terhadap vektor yang sama dengan perangkat.
 *
 * Konvensi: kembalian IPS_OK (0) = sukses; negatif = gagal. Tidak ada fungsi yang mencetak/me-log.
 */
#ifndef IP_SODIUM_H
#define IP_SODIUM_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define IPS_OK 0
/* MAC/tanda tangan/padding tidak valid - hasil normal untuk data rusak atau kunci salah. */
#define IPS_E_VERIFY (-1)
/* Panjang/parameter tidak sesuai kontrak fungsi: bug pemanggil. */
#define IPS_E_ARG (-2)
/* libsodium gagal (mis. Argon2id kehabisan memori) atau belum terinisialisasi. */
#define IPS_E_INTERNAL (-3)

int ips_init(void);

void ips_randombytes_buf(uint8_t *out, size_t out_len);
void ips_memzero(uint8_t *buf, size_t len);

int ips_aead_xchacha20poly1305_ietf_encrypt(uint8_t *out, size_t out_len, const uint8_t *m,
                                            size_t m_len, const uint8_t *ad, size_t ad_len,
                                            const uint8_t *nonce, size_t nonce_len,
                                            const uint8_t *key, size_t key_len);
int ips_aead_xchacha20poly1305_ietf_decrypt(uint8_t *out, size_t out_len, const uint8_t *c,
                                            size_t c_len, const uint8_t *ad, size_t ad_len,
                                            const uint8_t *nonce, size_t nonce_len,
                                            const uint8_t *key, size_t key_len);

int ips_kdf_derive_from_key(uint8_t *out, size_t out_len, uint64_t subkey_id, const uint8_t *ctx,
                            size_t ctx_len, const uint8_t *key, size_t key_len);

int ips_pwhash(uint8_t *out, size_t out_len, const uint8_t *password, size_t password_len,
               const uint8_t *salt, size_t salt_len, uint64_t opslimit, size_t memlimit, int alg);

/* State secretstream milik pemanggil (crypto_secretstream_xchacha20poly1305_STATEBYTES byte). */
size_t ips_secretstream_statebytes(void);
int ips_secretstream_init_push(uint8_t *state, size_t state_len, uint8_t *header,
                               size_t header_len, const uint8_t *key, size_t key_len);
int ips_secretstream_push(uint8_t *state, size_t state_len, uint8_t *out, size_t out_len,
                          const uint8_t *m, size_t m_len, const uint8_t *ad, size_t ad_len,
                          int tag);
int ips_secretstream_init_pull(uint8_t *state, size_t state_len, const uint8_t *header,
                               size_t header_len, const uint8_t *key, size_t key_len);
/* Sukses: kembalikan tag (>= 0). Gagal: IPS_E_VERIFY / IPS_E_ARG. */
int ips_secretstream_pull(uint8_t *state, size_t state_len, uint8_t *out, size_t out_len,
                          const uint8_t *c, size_t c_len, const uint8_t *ad, size_t ad_len);

int ips_sign_keypair(uint8_t *pk, size_t pk_len, uint8_t *sk, size_t sk_len);
int ips_sign_seed_keypair(uint8_t *pk, size_t pk_len, uint8_t *sk, size_t sk_len,
                          const uint8_t *seed, size_t seed_len);
int ips_sign_detached(uint8_t *sig, size_t sig_len, const uint8_t *m, size_t m_len,
                      const uint8_t *sk, size_t sk_len);
int ips_sign_verify_detached(const uint8_t *sig, size_t sig_len, const uint8_t *m, size_t m_len,
                             const uint8_t *pk, size_t pk_len);

int ips_generichash(uint8_t *out, size_t out_len, const uint8_t *m, size_t m_len,
                    const uint8_t *key, size_t key_len);
int ips_hash_sha256(uint8_t *out, size_t out_len, const uint8_t *m, size_t m_len);

/*
 * Padding ISO/IEC 7816-4 (`sodium_pad`). `buf` berkapasitas `buf_len`, berisi `unpadded_len` byte data.
 * Sukses: kembalikan panjang setelah padding. `ips_unpad` mengembalikan panjang sebelum padding.
 */
long ips_pad(uint8_t *buf, size_t buf_len, size_t unpadded_len, size_t block_size);
long ips_unpad(const uint8_t *buf, size_t buf_len, size_t block_size);

/* Base64 varian ORIGINAL (standar, dengan '='), constant-time. `out` termasuk terminator NUL. */
size_t ips_base64_encoded_len(size_t bin_len);
int ips_bin2base64(char *out, size_t out_len, const uint8_t *bin, size_t bin_len);
/* Sukses: kembalikan jumlah byte biner yang ditulis (>= 0). */
long ips_base642bin(uint8_t *out, size_t out_len, const char *b64, size_t b64_len);

#ifdef __cplusplus
}
#endif

#endif
