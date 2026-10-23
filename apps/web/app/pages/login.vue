<script setup lang="ts">
const { t } = useI18n()
useHead({ title: () => t('login.meta.title') })

const flow = useLoginFlow()
</script>

<template>
  <div class="page">
    <div class="card">
      <AuthBrandPanel />
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
