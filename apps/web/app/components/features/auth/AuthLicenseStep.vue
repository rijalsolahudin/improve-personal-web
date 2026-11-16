<script setup lang="ts">
import type { LoginFlow } from '~/composables/useLoginFlow'

/**
 * Langkah setelah login berhasil tapi lisensi belum bisa diaktivasi (ADR 15): email belum membeli,
 * jatah perangkat habis, atau server tak terjangkau. Pesan memakai `login.license.<sebab>`.
 */
const { flow } = defineProps<{ flow: LoginFlow }>()

const isRetrying = ref(false)

const reason = computed(() => flow.licenseError.value ?? 'unavailable')
const canBuy = computed(() => reason.value === 'notPurchased')

async function retry(): Promise<void> {
  if (isRetrying.value) return
  isRetrying.value = true
  try {
    await flow.retryLicense()
  } finally {
    isRetrying.value = false
  }
}
</script>

<template>
  <div class="step">
    <AuthHeading
      :eyebrow="$t('login.license.eyebrow')"
      :title="$t(`login.license.${reason}.title`)"
    >
      {{ $t(`login.license.${reason}.body`) }}
    </AuthHeading>

    <div class="actions">
      <NuxtLink v-if="canBuy" :to="PURCHASE_PATH" class="buy">{{
        $t('login.license.buy')
      }}</NuxtLink>
      <AuthPrimaryButton type="button" :is-loading="isRetrying" @click="retry">
        {{ $t('login.license.retry') }}
      </AuthPrimaryButton>
      <Button variant="soft" size="sm" @click="flow.switchEmail">
        {{ $t('login.license.otherEmail') }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.step {
  display: flex;
  flex-direction: column;
  gap: var(--space-20);
}

.actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-10);
}

.buy {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-pill);
  background: var(--paper);
  color: var(--ink);
  font-weight: var(--fw-strong);
}
</style>
