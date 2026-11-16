<script setup lang="ts">
/**
 * Tujuan `redirectUrl` Mayar setelah bayar. Halaman ini TIDAK menandai apa pun sebagai lunas - status
 * resmi datang lewat webhook. Isinya cuma arahan: masuk dengan email pembelian.
 */
const { t } = useI18n()
useHead({ title: () => t('purchase.done.title') })

definePageMeta({ layout: false })
</script>

<template>
  <AuthCard>
    <div class="step">
      <AuthHeading :eyebrow="$t('purchase.done.eyebrow')" :title="$t('purchase.done.title')">
        {{ $t('purchase.done.body') }}
      </AuthHeading>
      <NuxtLink :to="LOGIN_PATH" class="cta">{{ $t('purchase.done.cta') }}</NuxtLink>
    </div>
    <template #note>{{ $t('purchase.done.note') }}</template>
  </AuthCard>
</template>

<style scoped>
.step {
  display: flex;
  flex-direction: column;
  gap: var(--space-20);
}

.cta {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  border-radius: var(--radius-pill);
  background: var(--ink);
  color: var(--paper);
  font-weight: var(--fw-strong);
}
</style>
