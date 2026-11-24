/*
 * CLI uji host untuk cpp/ip_sodium.c - dijalankan verify-host.mjs, bukan bagian app.
 *
 * Protokol: satu perintah per baris di stdin, token dipisah spasi, byte dalam hex.
 * "-" = NULL (mis. AD tidak ada), "." = buffer kosong. Balasan satu baris di stdout:
 * hasil hex dipisah spasi, "OK", atau "ERR <kode>".
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "ip_sodium.h"

#define LINE_MAX_BYTES (1 << 20)
#define TOKENS_MAX 64

typedef struct {
  uint8_t *data;
  size_t len;
  int is_null;
} buf_t;

static int hexval(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  return -1;
}

static buf_t parse_hex(const char *token) {
  buf_t b = {NULL, 0, 0};
  if (strcmp(token, "-") == 0) {
    b.is_null = 1;
    return b;
  }
  if (strcmp(token, ".") == 0) return b;
  size_t n = strlen(token);
  b.len = n / 2;
  b.data = malloc(b.len == 0 ? 1 : b.len);
  for (size_t i = 0; i < b.len; i++) {
    b.data[i] = (uint8_t)(hexval(token[2 * i]) << 4 | hexval(token[2 * i + 1]));
  }
  return b;
}

static void print_hex(const uint8_t *data, size_t len) {
  if (len == 0) printf(".");
  for (size_t i = 0; i < len; i++) printf("%02x", data[i]);
}

static void pattern(uint8_t *out, size_t len, unsigned start, unsigned step) {
  for (size_t i = 0; i < len; i++) out[i] = (uint8_t)((start + i * step) & 0xff);
}

static void run(char **t, int n) {
  const char *op = t[0];
  if (strcmp(op, "aead_enc") == 0) {
    buf_t key = parse_hex(t[1]), nonce = parse_hex(t[2]), ad = parse_hex(t[3]), m = parse_hex(t[4]);
    size_t out_len = m.len + 16;
    uint8_t *out = malloc(out_len);
    int rc = ips_aead_xchacha20poly1305_ietf_encrypt(out, out_len, m.data, m.len, ad.data, ad.len,
                                                     nonce.data, nonce.len, key.data, key.len);
    if (rc != IPS_OK) printf("ERR %d", rc); else print_hex(out, out_len);
  } else if (strcmp(op, "aead_dec") == 0) {
    buf_t key = parse_hex(t[1]), nonce = parse_hex(t[2]), ad = parse_hex(t[3]), c = parse_hex(t[4]);
    size_t out_len = c.len >= 16 ? c.len - 16 : 0;
    uint8_t *out = malloc(out_len + 1);
    int rc = ips_aead_xchacha20poly1305_ietf_decrypt(out, out_len, c.data, c.len, ad.data, ad.len,
                                                     nonce.data, nonce.len, key.data, key.len);
    if (rc != IPS_OK) printf("ERR %d", rc); else print_hex(out, out_len);
  } else if (strcmp(op, "kdf") == 0) {
    buf_t key = parse_hex(t[1]), ctx = parse_hex(t[2]);
    unsigned long long id = strtoull(t[3], NULL, 10);
    size_t len = strtoul(t[4], NULL, 10);
    uint8_t out[64];
    int rc = ips_kdf_derive_from_key(out, len, id, ctx.data, ctx.len, key.data, key.len);
    if (rc != IPS_OK) printf("ERR %d", rc); else print_hex(out, len);
  } else if (strcmp(op, "pwhash") == 0) {
    buf_t pw = parse_hex(t[1]), salt = parse_hex(t[2]);
    unsigned long long ops = strtoull(t[3], NULL, 10);
    size_t mem = strtoull(t[4], NULL, 10);
    int alg = atoi(t[5]);
    size_t len = strtoul(t[6], NULL, 10);
    uint8_t out[64];
    int rc = ips_pwhash(out, len, pw.data, pw.len, salt.data, salt.len, ops, mem, alg);
    if (rc != IPS_OK) printf("ERR %d", rc); else print_hex(out, len);
  } else if (strcmp(op, "ss_push") == 0) {
    /* ss_push key header (ad tag msg)... - state dari init_pull (identik init_push). */
    buf_t key = parse_hex(t[1]), header = parse_hex(t[2]);
    size_t st_len = ips_secretstream_statebytes();
    uint8_t *st = malloc(st_len);
    int rc = ips_secretstream_init_pull(st, st_len, header.data, header.len, key.data, key.len);
    if (rc != IPS_OK) { printf("ERR %d", rc); return; }
    for (int i = 3; i + 2 < n; i += 3) {
      buf_t ad = parse_hex(t[i]), m = parse_hex(t[i + 2]);
      int tag = atoi(t[i + 1]);
      size_t out_len = m.len + 17;
      uint8_t *out = malloc(out_len);
      rc = ips_secretstream_push(st, st_len, out, out_len, m.data, m.len, ad.data, ad.len, tag);
      if (rc != IPS_OK) { printf("ERR %d", rc); return; }
      print_hex(out, out_len);
      printf(" ");
    }
  } else if (strcmp(op, "ss_pull") == 0) {
    /* ss_pull key header (ad ct)... -> "tag:msg" per chunk, atau "ERR@<index>". */
    buf_t key = parse_hex(t[1]), header = parse_hex(t[2]);
    size_t st_len = ips_secretstream_statebytes();
    uint8_t *st = malloc(st_len);
    int rc = ips_secretstream_init_pull(st, st_len, header.data, header.len, key.data, key.len);
    if (rc != IPS_OK) { printf("ERR %d", rc); return; }
    for (int i = 3, chunk = 0; i + 1 < n; i += 2, chunk++) {
      buf_t ad = parse_hex(t[i]), c = parse_hex(t[i + 1]);
      size_t out_len = c.len >= 17 ? c.len - 17 : 0;
      uint8_t *out = malloc(out_len + 1);
      int tag = ips_secretstream_pull(st, st_len, out, out_len, c.data, c.len, ad.data, ad.len);
      if (tag < 0) { printf("ERR@%d", chunk); return; }
      printf("%d:", tag);
      print_hex(out, out_len);
      printf(" ");
    }
  } else if (strcmp(op, "ss_large") == 0) {
    /* ss_large key header total start step chunk first_ad -> sha256 tiap chunk + "roundtrip=ok". */
    buf_t key = parse_hex(t[1]), header = parse_hex(t[2]), first_ad = parse_hex(t[7]);
    size_t total = strtoul(t[3], NULL, 10), chunk = strtoul(t[6], NULL, 10);
    uint8_t *plain = malloc(total);
    pattern(plain, total, (unsigned)atoi(t[4]), (unsigned)atoi(t[5]));
    size_t st_len = ips_secretstream_statebytes();
    uint8_t *push = malloc(st_len), *pull = malloc(st_len);
    ips_secretstream_init_pull(push, st_len, header.data, header.len, key.data, key.len);
    ips_secretstream_init_pull(pull, st_len, header.data, header.len, key.data, key.len);
    int ok = 1;
    for (size_t off = 0; off < total; off += chunk) {
      size_t m_len = total - off < chunk ? total - off : chunk;
      int is_last = off + chunk >= total;
      size_t c_len = m_len + 17;
      uint8_t *c = malloc(c_len), *back = malloc(m_len + 1), digest[32];
      const uint8_t *ad = off == 0 ? first_ad.data : NULL;
      size_t ad_len = off == 0 ? first_ad.len : 0;
      ips_secretstream_push(push, st_len, c, c_len, plain + off, m_len, ad, ad_len, is_last ? 3 : 0);
      ips_hash_sha256(digest, 32, c, c_len);
      printf("%d:%zu:", is_last ? 3 : 0, c_len);
      print_hex(digest, 32);
      printf(" ");
      int tag = ips_secretstream_pull(pull, st_len, back, m_len, c, c_len, ad, ad_len);
      if (tag != (is_last ? 3 : 0) || memcmp(back, plain + off, m_len) != 0) ok = 0;
    }
    printf("roundtrip=%s", ok ? "ok" : "bad");
  } else if (strcmp(op, "sign_seed") == 0) {
    buf_t seed = parse_hex(t[1]);
    uint8_t pk[32], sk[64];
    int rc = ips_sign_seed_keypair(pk, 32, sk, 64, seed.data, seed.len);
    if (rc != IPS_OK) { printf("ERR %d", rc); return; }
    print_hex(pk, 32);
    printf(" ");
    print_hex(sk, 64);
  } else if (strcmp(op, "sign") == 0) {
    buf_t sk = parse_hex(t[1]), m = parse_hex(t[2]);
    uint8_t sig[64];
    int rc = ips_sign_detached(sig, 64, m.data, m.len, sk.data, sk.len);
    if (rc != IPS_OK) printf("ERR %d", rc); else print_hex(sig, 64);
  } else if (strcmp(op, "verify") == 0) {
    buf_t sig = parse_hex(t[1]), m = parse_hex(t[2]), pk = parse_hex(t[3]);
    int rc = ips_sign_verify_detached(sig.data, sig.len, m.data, m.len, pk.data, pk.len);
    if (rc != IPS_OK) printf("ERR %d", rc); else printf("OK");
  } else if (strcmp(op, "gh") == 0) {
    buf_t m = parse_hex(t[1]), key = parse_hex(t[2]);
    size_t len = strtoul(t[3], NULL, 10);
    uint8_t out[64];
    int rc = ips_generichash(out, len, m.data, m.len, key.data, key.len);
    if (rc != IPS_OK) printf("ERR %d", rc); else print_hex(out, len);
  } else if (strcmp(op, "sha256") == 0) {
    buf_t m = parse_hex(t[1]);
    uint8_t out[32];
    int rc = ips_hash_sha256(out, 32, m.data, m.len);
    if (rc != IPS_OK) printf("ERR %d", rc); else print_hex(out, 32);
  } else if (strcmp(op, "pad") == 0) {
    size_t block = strtoul(t[1], NULL, 10);
    buf_t m = parse_hex(t[2]);
    size_t cap = (m.len / block + 1) * block;
    uint8_t *buf = calloc(cap, 1);
    if (m.len > 0) memcpy(buf, m.data, m.len);
    long len = ips_pad(buf, cap, m.len, block);
    if (len < 0) printf("ERR %ld", len); else print_hex(buf, (size_t)len);
  } else if (strcmp(op, "unpad") == 0) {
    size_t block = strtoul(t[1], NULL, 10);
    buf_t p = parse_hex(t[2]);
    long len = ips_unpad(p.data, p.len, block);
    if (len < 0) printf("ERR %ld", len); else print_hex(p.data, (size_t)len);
  } else if (strcmp(op, "b64enc") == 0) {
    buf_t bin = parse_hex(t[1]);
    size_t out_len = ips_base64_encoded_len(bin.len);
    char *out = malloc(out_len);
    int rc = ips_bin2base64(out, out_len, bin.data, bin.len);
    if (rc != IPS_OK) printf("ERR %d", rc); else printf("%s", out[0] == '\0' ? "." : out);
  } else if (strcmp(op, "b64dec") == 0) {
    /* Teks base64 dikirim sebagai hex UTF-8 supaya spasi/karakter aneh tetap satu token. */
    buf_t text = parse_hex(t[1]);
    size_t cap = text.len * 3 / 4 + 3;
    uint8_t *out = malloc(cap);
    long len = ips_base642bin(out, cap, (const char *)text.data, text.len);
    if (len < 0) printf("ERR %ld", len); else print_hex(out, (size_t)len);
  } else if (strcmp(op, "statebytes") == 0) {
    printf("%zu", ips_secretstream_statebytes());
  } else {
    printf("ERR unknown-op");
  }
}

int main(void) {
  if (ips_init() != IPS_OK) return 2;
  char *line = malloc(LINE_MAX_BYTES);
  while (fgets(line, LINE_MAX_BYTES, stdin) != NULL) {
    char *tokens[TOKENS_MAX];
    int n = 0;
    for (char *tok = strtok(line, " \n"); tok != NULL && n < TOKENS_MAX; tok = strtok(NULL, " \n")) {
      tokens[n++] = tok;
    }
    if (n == 0) continue;
    run(tokens, n);
    printf("\n");
    fflush(stdout);
  }
  return 0;
}
