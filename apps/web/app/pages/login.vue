<script setup lang="ts">
const { t } = useI18n()
useHead({ title: () => t('login.meta.title') })

const flow = useLoginFlow()

// Halaman ini di-SSR, tapi token lisensi & sesi baru bisa dibaca di client: arahkan user yang sudah
// berlisensi kembali ke app, dan aktivasi otomatis kalau sesi sudah ada (kembali dari Google).
onMounted(() => {
  void flow.resume()
})

/**
 * Halaman login tidak memakai layout shell: satu kartu di tengah, tanpa sidebar/nav. Ditulis
 * eksplisit (`layout: false`) supaya `<NuxtLayout>` tidak perlu me-resolve layout `default` yang
 * tidak ada - konsekuensinya dulu chunk layout dashboard ikut di-`modulepreload` di rute ini.
 */
definePageMeta({ layout: false })

/**
 * Langkah OTP hanya muncul dari interaksi user, jadi chunk-nya tidak perlu ikut render awal.
 *
 * `defineAsyncComponent` eksplisit, bukan prefix `Lazy`: loader-nya bisa diuji (import dinamis yang
 * sama dipakai test komponen) dan tetap satu chunk terpisah hasil code-splitting Vite.
 */
const AuthOtpStep = defineAsyncComponent(() => import('~/components/features/auth/AuthOtpStep.vue'))
</script>

<template>
  <AuthCard>
    <AuthEmailStep v-if="flow.step.value === 'choose'" :flow="flow" />
    <AuthOtpStep v-else-if="flow.step.value === 'otp'" :flow="flow" />
    <LazyAuthLicenseStep v-else :flow="flow" />
    <template #note>{{ $t('login.terms') }}</template>
  </AuthCard>
</template>
