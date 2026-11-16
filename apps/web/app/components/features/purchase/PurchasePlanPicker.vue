<script setup lang="ts">
import { LICENSE_PLAN_IDS, type LicensePlanId } from '@improve-personal/contracts'

import { YEARLY_SAVING_PERCENT, planPriceLabel } from '~/utils/price'

/** Pilihan paket di halaman beli (ADR 16). Radio asli, jadi keyboard & pembaca layar jalan tanpa JS tambahan. */
const plan = defineModel<LicensePlanId>({ required: true })
</script>

<template>
  <fieldset class="plans">
    <legend class="label">{{ $t('purchase.planLabel') }}</legend>
    <label
      v-for="id in LICENSE_PLAN_IDS"
      :key="id"
      class="plan"
      :class="{ selected: plan === id, featured: id === 'yearly' }"
    >
      <input v-model="plan" class="radio" type="radio" name="plan" :value="id" />
      <span class="name">
        {{ $t(`plans.${id}.name`) }}
        <span v-if="id === 'yearly'" class="badge">
          {{ $t('plans.saving', { percent: YEARLY_SAVING_PERCENT }) }}
        </span>
      </span>
      <span class="price">
        {{ planPriceLabel(id) }}<span class="period">{{ $t(`plans.${id}.period`) }}</span>
      </span>
    </label>
  </fieldset>
</template>

<style scoped>
.plans {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  margin: 0;
  padding: 0;
  border: 0;
}

.label {
  margin-bottom: var(--space-6);
  font-weight: var(--fw-strong);
  font-size: var(--fs-meta);
  letter-spacing: var(--tracking-group);
  color: #8a7a60;
}

.plan {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  min-height: 56px;
  padding: var(--space-10) var(--space-16);
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-inner);
  background: #fffdf8;
  cursor: pointer;
}

.plan.selected {
  background: var(--primary);
}

.plan:has(.radio:focus-visible) {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

.radio {
  accent-color: var(--accent);
  width: 18px;
  height: 18px;
  margin: 0;
}

.name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-8);
  flex: 1;
  font-weight: var(--fw-strong);
}

.badge {
  padding: 2px var(--space-8);
  border: var(--border-thin) solid var(--outline);
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: #fffbf4;
  font-size: var(--fs-meta);
}

.price {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-18);
  white-space: nowrap;
}

.period {
  font-family: inherit;
  font-weight: var(--fw-medium);
  font-size: var(--fs-meta);
  color: #6e604e;
}
</style>
