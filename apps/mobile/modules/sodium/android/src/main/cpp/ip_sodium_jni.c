/*
 * Lem JNI: ByteBuffer langsung (view tanpa salin atas Uint8Array JS) -> cpp/ip_sodium.c.
 *
 * Tidak ada logika kripto atau validasi panjang di sini - semuanya di ip_sodium.c supaya satu
 * implementasi yang diuji di host juga yang berjalan di perangkat. Buffer `null` = NULL/0.
 */
#include <jni.h>
#include <stdlib.h>
#include <string.h>

#include "ip_sodium.h"

#define JNI_FN(name) Java_id_stackinnov_improvepersonal_sodium_IpSodiumNative_##name

typedef struct {
  uint8_t *ptr;
  size_t len;
} view_t;

static view_t view_of(JNIEnv *env, jobject buffer) {
  view_t v = {NULL, 0};
  if (buffer == NULL) return v;
  v.ptr = (uint8_t *)(*env)->GetDirectBufferAddress(env, buffer);
  jlong capacity = (*env)->GetDirectBufferCapacity(env, buffer);
  v.len = (v.ptr == NULL || capacity < 0) ? 0 : (size_t)capacity;
  return v;
}

JNIEXPORT jint JNICALL JNI_FN(init)(JNIEnv *env, jclass clazz) { return ips_init(); }

JNIEXPORT void JNICALL JNI_FN(randombytesBuf)(JNIEnv *env, jclass clazz, jobject out) {
  view_t o = view_of(env, out);
  ips_randombytes_buf(o.ptr, o.len);
}

JNIEXPORT void JNICALL JNI_FN(memzero)(JNIEnv *env, jclass clazz, jobject buf) {
  view_t b = view_of(env, buf);
  ips_memzero(b.ptr, b.len);
}

JNIEXPORT jint JNICALL JNI_FN(aeadEncrypt)(JNIEnv *env, jclass clazz, jobject out, jobject m,
                                           jobject ad, jobject nonce, jobject key) {
  view_t o = view_of(env, out), vm = view_of(env, m), va = view_of(env, ad),
         vn = view_of(env, nonce), vk = view_of(env, key);
  return ips_aead_xchacha20poly1305_ietf_encrypt(o.ptr, o.len, vm.ptr, vm.len, va.ptr, va.len,
                                                 vn.ptr, vn.len, vk.ptr, vk.len);
}

JNIEXPORT jint JNICALL JNI_FN(aeadDecrypt)(JNIEnv *env, jclass clazz, jobject out, jobject c,
                                           jobject ad, jobject nonce, jobject key) {
  view_t o = view_of(env, out), vc = view_of(env, c), va = view_of(env, ad),
         vn = view_of(env, nonce), vk = view_of(env, key);
  return ips_aead_xchacha20poly1305_ietf_decrypt(o.ptr, o.len, vc.ptr, vc.len, va.ptr, va.len,
                                                 vn.ptr, vn.len, vk.ptr, vk.len);
}

JNIEXPORT jint JNICALL JNI_FN(kdfDeriveFromKey)(JNIEnv *env, jclass clazz, jobject out,
                                                jlong subkey_id, jobject ctx, jobject key) {
  view_t o = view_of(env, out), vc = view_of(env, ctx), vk = view_of(env, key);
  if (subkey_id < 0) return IPS_E_ARG;
  return ips_kdf_derive_from_key(o.ptr, o.len, (uint64_t)subkey_id, vc.ptr, vc.len, vk.ptr, vk.len);
}

/*
 * pwhash berjalan di thread latar (AsyncFunction), jadi input berupa salinan byte[] - bukan view
 * atas memori JS yang hanya sah di JS thread. Pemanggil Kotlin menghapus salinan itu sesudahnya.
 */
JNIEXPORT jint JNICALL JNI_FN(pwhash)(JNIEnv *env, jclass clazz, jbyteArray out,
                                      jbyteArray password, jbyteArray salt, jlong opslimit,
                                      jlong memlimit, jint alg) {
  if (opslimit < 0 || memlimit < 0) return IPS_E_ARG;
  jsize out_len = (*env)->GetArrayLength(env, out);
  jsize pw_len = (*env)->GetArrayLength(env, password);
  jsize salt_len = (*env)->GetArrayLength(env, salt);
  uint8_t *o = malloc(out_len > 0 ? (size_t)out_len : 1);
  uint8_t *pw = malloc(pw_len > 0 ? (size_t)pw_len : 1);
  uint8_t *s = malloc(salt_len > 0 ? (size_t)salt_len : 1);
  if (o == NULL || pw == NULL || s == NULL) {
    free(o);
    free(pw);
    free(s);
    return IPS_E_INTERNAL;
  }
  (*env)->GetByteArrayRegion(env, password, 0, pw_len, (jbyte *)pw);
  (*env)->GetByteArrayRegion(env, salt, 0, salt_len, (jbyte *)s);
  int rc = ips_pwhash(o, (size_t)out_len, pw, (size_t)pw_len, s, (size_t)salt_len,
                      (uint64_t)opslimit, (size_t)memlimit, alg);
  if (rc == IPS_OK) (*env)->SetByteArrayRegion(env, out, 0, out_len, (const jbyte *)o);
  ips_memzero(o, (size_t)out_len);
  ips_memzero(pw, (size_t)pw_len);
  free(o);
  free(pw);
  free(s);
  return rc;
}

JNIEXPORT jint JNICALL JNI_FN(secretstreamStateBytes)(JNIEnv *env, jclass clazz) {
  return (jint)ips_secretstream_statebytes();
}

JNIEXPORT jint JNICALL JNI_FN(secretstreamInitPush)(JNIEnv *env, jclass clazz, jobject state,
                                                    jobject header, jobject key) {
  view_t s = view_of(env, state), h = view_of(env, header), k = view_of(env, key);
  return ips_secretstream_init_push(s.ptr, s.len, h.ptr, h.len, k.ptr, k.len);
}

JNIEXPORT jint JNICALL JNI_FN(secretstreamPush)(JNIEnv *env, jclass clazz, jobject state,
                                                jobject out, jobject m, jobject ad, jint tag) {
  view_t s = view_of(env, state), o = view_of(env, out), vm = view_of(env, m),
         va = view_of(env, ad);
  return ips_secretstream_push(s.ptr, s.len, o.ptr, o.len, vm.ptr, vm.len, va.ptr, va.len, tag);
}

JNIEXPORT jint JNICALL JNI_FN(secretstreamInitPull)(JNIEnv *env, jclass clazz, jobject state,
                                                    jobject header, jobject key) {
  view_t s = view_of(env, state), h = view_of(env, header), k = view_of(env, key);
  return ips_secretstream_init_pull(s.ptr, s.len, h.ptr, h.len, k.ptr, k.len);
}

JNIEXPORT jint JNICALL JNI_FN(secretstreamPull)(JNIEnv *env, jclass clazz, jobject state,
                                                jobject out, jobject c, jobject ad) {
  view_t s = view_of(env, state), o = view_of(env, out), vc = view_of(env, c),
         va = view_of(env, ad);
  return ips_secretstream_pull(s.ptr, s.len, o.ptr, o.len, vc.ptr, vc.len, va.ptr, va.len);
}

JNIEXPORT jint JNICALL JNI_FN(signKeypair)(JNIEnv *env, jclass clazz, jobject pk, jobject sk) {
  view_t p = view_of(env, pk), s = view_of(env, sk);
  return ips_sign_keypair(p.ptr, p.len, s.ptr, s.len);
}

JNIEXPORT jint JNICALL JNI_FN(signSeedKeypair)(JNIEnv *env, jclass clazz, jobject pk, jobject sk,
                                               jobject seed) {
  view_t p = view_of(env, pk), s = view_of(env, sk), sd = view_of(env, seed);
  return ips_sign_seed_keypair(p.ptr, p.len, s.ptr, s.len, sd.ptr, sd.len);
}

JNIEXPORT jint JNICALL JNI_FN(signDetached)(JNIEnv *env, jclass clazz, jobject sig, jobject m,
                                            jobject sk) {
  view_t vs = view_of(env, sig), vm = view_of(env, m), vk = view_of(env, sk);
  return ips_sign_detached(vs.ptr, vs.len, vm.ptr, vm.len, vk.ptr, vk.len);
}

JNIEXPORT jint JNICALL JNI_FN(signVerifyDetached)(JNIEnv *env, jclass clazz, jobject sig,
                                                  jobject m, jobject pk) {
  view_t vs = view_of(env, sig), vm = view_of(env, m), vp = view_of(env, pk);
  return ips_sign_verify_detached(vs.ptr, vs.len, vm.ptr, vm.len, vp.ptr, vp.len);
}

JNIEXPORT jint JNICALL JNI_FN(genericHash)(JNIEnv *env, jclass clazz, jobject out, jobject m,
                                           jobject key) {
  view_t o = view_of(env, out), vm = view_of(env, m), vk = view_of(env, key);
  return ips_generichash(o.ptr, o.len, vm.ptr, vm.len, vk.ptr, vk.len);
}

JNIEXPORT jint JNICALL JNI_FN(hashSha256)(JNIEnv *env, jclass clazz, jobject out, jobject m) {
  view_t o = view_of(env, out), vm = view_of(env, m);
  return ips_hash_sha256(o.ptr, o.len, vm.ptr, vm.len);
}

JNIEXPORT jint JNICALL JNI_FN(pad)(JNIEnv *env, jclass clazz, jobject buf, jint unpadded_len,
                                   jint block_size) {
  view_t b = view_of(env, buf);
  if (unpadded_len < 0 || block_size <= 0) return IPS_E_ARG;
  long rc = ips_pad(b.ptr, b.len, (size_t)unpadded_len, (size_t)block_size);
  return rc > INT32_MAX ? IPS_E_ARG : (jint)rc;
}

JNIEXPORT jint JNICALL JNI_FN(unpad)(JNIEnv *env, jclass clazz, jobject buf, jint block_size) {
  view_t b = view_of(env, buf);
  if (block_size <= 0) return IPS_E_ARG;
  long rc = ips_unpad(b.ptr, b.len, (size_t)block_size);
  return rc > INT32_MAX ? IPS_E_ARG : (jint)rc;
}

JNIEXPORT jstring JNICALL JNI_FN(toBase64)(JNIEnv *env, jclass clazz, jobject bin) {
  view_t b = view_of(env, bin);
  size_t out_len = ips_base64_encoded_len(b.len);
  char *out = malloc(out_len);
  if (out == NULL) return NULL;
  jstring result = NULL;
  if (ips_bin2base64(out, out_len, b.ptr, b.len) == IPS_OK) result = (*env)->NewStringUTF(env, out);
  ips_memzero((uint8_t *)out, out_len);
  free(out);
  return result;
}

JNIEXPORT jint JNICALL JNI_FN(fromBase64)(JNIEnv *env, jclass clazz, jobject out, jstring text) {
  view_t o = view_of(env, out);
  const char *chars = (*env)->GetStringUTFChars(env, text, NULL);
  if (chars == NULL) return IPS_E_INTERNAL;
  jsize len = (*env)->GetStringUTFLength(env, text);
  long rc = ips_base642bin(o.ptr, o.len, chars, (size_t)len);
  (*env)->ReleaseStringUTFChars(env, text, chars);
  return rc > INT32_MAX ? IPS_E_ARG : (jint)rc;
}
