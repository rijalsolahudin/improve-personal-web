<script setup lang="ts">
import { BUYER_NAME_MAX_LENGTH } from '@improve-personal/contracts'

import type { PurchaseField } from '~/composables/usePurchase'
import { planPriceLabel } from '~/utils/price'
import { EMAIL_MAX_LENGTH } from '~/utils/validation'

/** Form beli lisensi (ADR 15 + ADR 16): paket, nama, email pembelian, nomor WA -> halaman bayar Mayar. */
const purchase = usePurchase()

function hasError(field: PurchaseField): boolean {
  return purchase.fieldErrors.value.includes(field)
}
</script>

<template>
  <div class="step">
    <AuthHeading :eyebrow="$t('purchase.eyebrow')" :title="$t('purchase.title')">
      {{ $t('purchase.sub') }}
    </AuthHeading>

    <form class="form" novalidate @submit.prevent="purchase.submit">
      <PurchasePlanPicker v-model="purchase.plan.value" />

      <div class="field">
        <label class="label" for="purchase-name">{{ $t('purchase.nameLabel') }}</label>
        <Input
          id="purchase-name"
          v-model="purchase.name.value"
          variant="bare"
          class="input"
          :class="{ invalid: hasError('name') }"
          autocomplete="name"
          :placeholder="$t('purchase.namePlaceholder')"
          :maxlength="BUYER_NAME_MAX_LENGTH"
        />
      </div>

      <div class="field">
        <label class="label" for="purchase-email">{{ $t('purchase.emailLabel') }}</label>
        <Input
          id="purchase-email"
          v-model="purchase.email.value"
          variant="bare"
          class="input"
          :class="{ invalid: hasError('email') }"
          type="email"
          autocomplete="email"
          :placeholder="$t('purchase.emailPlaceholder')"
          :maxlength="EMAIL_MAX_LENGTH"
        />
        <p class="hint">{{ $t('purchase.emailHint') }}</p>
      </div>

      <div class="field">
        <label class="label" for="purchase-mobile">{{ $t('purchase.mobileLabel') }}</label>
        <PurchaseMobileInput
          id="purchase-mobile"
          v-model="purchase.mobile.value"
          :is-invalid="hasError('mobile')"
        />
      </div>

      <p v-if="purchase.fieldErrors.value.length > 0" class="error" role="alert">
        {{ $t('purchase.error.fields') }}
      </p>
      <p v-else-if="purchase.error.value" class="error" role="alert">
        {{ $t(`purchase.error.${purchase.error.value}`) }}
      </p>

      <AuthPrimaryButton :is-loading="purchase.isSubmitting.value">
        {{ $t('purchase.submit', { price: planPriceLabel(purchase.plan.value) }) }}
      </AuthPrimaryButton>
    </form>

    <NuxtLink :to="LOGIN_PATH" class="login-link">{{ $t('purchase.haveLicense') }}</NuxtLink>
  </div>
</template>

<style scoped>
.step,
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-16);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.label {
  font-weight: var(--fw-strong);
  font-size: var(--fs-meta);
  letter-spacing: var(--tracking-group);
  color: #8a7a60;
}

.input {
  min-height: 52px;
  padding: 0 var(--space-16);
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-inner);
  background: #fffdf8;
}

.input.invalid {
  border-color: var(--danger);
}

.hint {
  font-size: var(--fs-meta);
  color: #8a7a60;
}

.error {
  color: var(--danger);
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-sm);
}

.login-link {
  align-self: center;
  font-weight: var(--fw-strong);
  font-size: var(--fs-body-sm);
  color: var(--ink);
  text-decoration: underline;
}
</style>
