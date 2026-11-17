<script setup lang="ts">
const { t } = useI18n()
useHead({ title: () => t('purchase.meta.title') })

definePageMeta({ layout: false })
</script>

<template>
  <AuthCard panel="purchase">
    <PurchaseForm />
    <template #note>{{ $t('purchase.note') }}</template>
  </AuthCard>
</template>
