<script setup lang="ts">
const { t } = useI18n()
useHead({ title: () => t('login.meta.title') })

const flow = useLoginFlow()

/**
 * Halaman login tidak memakai layout shell: satu kartu di tengah, tanpa sidebar/nav. Ditulis
 * eksplisit (`layout: false`) supaya `<NuxtLayout>` tidak perlu me-resolve layout `default` yang
 * tidak ada - konsekuensinya dulu chunk layout dashboard ikut di-`modulepreload` di rute ini.
 */
definePageMeta({ layout: false })

/**
 * Langkah OTP & pemulihan hanya muncul dari interaksi user, jadi chunk-nya tidak perlu ikut render
 * awal. Langkah pemulihan menarik form kunci (PasswordInput -> ikon, crypto) yang berat; memisahkannya
 * menjaga JS initial `/login` di bawah budget 170 KB (`app/utils/bundle-budget.test.ts`).
 *
 * `defineAsyncComponent` eksplisit, bukan prefix `Lazy`: loader-nya bisa diuji (import dinamis yang
 * sama dipakai test komponen) dan tetap satu chunk terpisah hasil code-splitting Vite.
 */
const AuthOtpStep = defineAsyncComponent(() => import('~/components/features/auth/AuthOtpStep.vue'))
const AuthRecoveryStep = defineAsyncComponent(
  () => import('~/components/features/auth/AuthRecoveryStep.vue'),
)
</script>

<template>
  <div class="page">
    <div class="card">
      <!-- Panel merek: teks statis + maskot hias. Markup-nya dirender di server (LCP halaman ini),
           hidrasinya tidak dibutuhkan karena tidak ada interaksi - jadi chunk maskot/BrandMark
           tidak ikut render-blocking JS. -->
      <LazyAuthBrandPanel hydrate-never />
      <div class="form-side">
        <AuthEmailStep v-if="flow.step.value === 'choose'" :flow="flow" />
        <AuthOtpStep v-else-if="flow.step.value === 'otp'" :flow="flow" />
        <AuthRecoveryStep v-else @back="flow.backToEmail" />
        <p class="terms">{{ $t('login.terms') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(16px, 4vw, 40px);
  background-color: #f6ebda;
  background-image:
    linear-gradient(rgba(47, 42, 36, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(47, 42, 36, 0.05) 1px, transparent 1px);
  background-size: 28px 28px;
}

.card {
  width: 100%;
  max-width: 980px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
  overflow: hidden;
  background: #fffdf8;
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(36px * var(--rk));
  box-shadow: 0 8px 0 rgba(47, 42, 36, 0.14);
}

.form-side {
  min-height: 520px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 20px;
  padding: clamp(24px, 4vw, 44px);
}

.terms {
  margin-top: auto;
  padding-top: 8px;
  font-weight: var(--fw-medium);
  font-size: var(--fs-meta);
  line-height: 1.5;
  color: #8a7a60;
}
</style>
