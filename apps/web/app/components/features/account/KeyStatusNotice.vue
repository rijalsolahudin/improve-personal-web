<script setup lang="ts">
/**
 * Peringatan status kunci (ARCHITECTURE §7).
 *
 * Dua keadaan yang harus terlihat, bukan disembunyikan:
 * - `isFreshKey`: kunci utama baru dibuat di perangkat ini dan envelope recovery BELUM ada. Artinya
 *   perangkat ini satu-satunya pemegang akses - kalau hilang, datanya hilang. Itu konsekuensi jujur
 *   dari E2EE, dan user berhak tahu sebelum menulis data penting.
 * - `error`: data lokal tidak bisa dibuka (mis. penyimpanan diblokir), sehingga daftar tampak kosong.
 *   Diam di sini akan membuat user menyimpulkan "data saya hilang" tanpa sebab.
 *
 * Komponen ini hanya menampilkan status yang sudah dihitung composable - ia tidak menyentuh kunci,
 * tidak menyimpan apa pun, dan tidak pernah menampilkan nilai kunci.
 */
const { state } = useLocalData()

const isFreshKey = computed(() => state.value.status === 'ready' && state.value.isFreshKey)
const hasError = computed(() => state.value.status === 'error')
</script>

<template>
  <p v-if="isFreshKey" class="key-notice key-notice--warn" role="status">
    {{ $t('keys.freshKeyWarning') }}
  </p>
  <p v-else-if="hasError" class="key-notice key-notice--error" role="alert">
    {{ $t('keys.localDataError') }}
    <!--
      Sebab teknis ditampilkan apa adanya: pesan ini dari kode kita sendiri (bukan pesan server), dan
      tanpa ini user maupun kita tidak punya cara tahu apa yang kurang - mis. "WebCrypto tidak
      tersedia" vs "konteks tidak aman" punya perbaikan yang berbeda.
    -->
    <span v-if="state.error" class="key-notice-detail">
      {{ $t('keys.localDataErrorDetail') }} {{ state.error }}
    </span>
  </p>
</template>

<style scoped>
.key-notice {
  margin: 0 0 1rem;
  padding: 0.6rem 0.9rem;
  border-radius: 0.6rem;
  border: 1px solid currentcolor;
  font-size: 0.85rem;
  line-height: 1.4;
}

.key-notice--warn {
  color: #8a5a00;
  background: #fff0c8;
}

.key-notice--error {
  color: #b0283e;
  background: #ffe1da;
}

.key-notice-detail {
  display: block;
  margin-top: 0.35rem;
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  word-break: break-word;
}
</style>
