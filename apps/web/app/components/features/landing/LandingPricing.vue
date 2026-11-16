<script setup lang="ts">
import { LICENSE_PLAN_IDS } from '@improve-personal/contracts'

import {
  YEARLY_PER_MONTH_LABEL,
  YEARLY_SAVING_PERCENT,
  planPriceLabel,
  purchasePathFor,
} from '~/utils/price'
</script>

<template>
  <section id="harga" class="section" aria-labelledby="landing-pricing-title">
    <div class="head">
      <p class="kicker">{{ $t('landing.pricing.kicker') }}</p>
      <h2 id="landing-pricing-title" class="heading">{{ $t('landing.pricing.title') }}</h2>
      <p class="lead">{{ $t('landing.pricing.lead') }}</p>
    </div>
    <ul class="grid">
      <li
        v-for="id in LICENSE_PLAN_IDS"
        :key="id"
        class="card"
        :class="{ featured: id === 'yearly' }"
      >
        <p v-if="id === 'yearly'" class="badge">
          {{ $t('landing.pricing.featured', { percent: YEARLY_SAVING_PERCENT }) }}
        </p>
        <h3 class="name">{{ $t(`plans.${id}.name`) }}</h3>
        <p class="price">
          {{ planPriceLabel(id) }}<span class="period">{{ $t(`plans.${id}.period`) }}</span>
        </p>
        <p class="desc">
          {{ $t(`landing.pricing.items.${id}`, { perMonth: YEARLY_PER_MONTH_LABEL }) }}
        </p>
        <NuxtLink :to="purchasePathFor(id)" class="cta">
          {{ $t('landing.pricing.cta', { plan: $t(`plans.${id}.name`) }) }}
        </NuxtLink>
      </li>
    </ul>
    <p class="note">{{ $t('landing.pricing.note') }}</p>
  </section>
</template>

<style scoped>
.section {
  width: 100%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  gap: var(--space-32);
  scroll-margin-top: 110px;
}

.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-10);
  text-align: center;
}

.kicker {
  font-weight: var(--fw-strong);
  font-size: var(--fs-caption);
  letter-spacing: var(--tracking-group);
  color: var(--deeper);
}

.heading {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: calc(clamp(34px, 4.5vw, 52px) * var(--fk-display));
  line-height: var(--lh-tight);
  text-wrap: balance;
}

.lead {
  max-width: 32em;
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-lg);
  line-height: 1.5;
  color: #6e604e;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  align-items: stretch;
  gap: var(--space-18);
  margin: 0;
  padding: 0;
  list-style: none;
}

.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
  padding: var(--space-28) var(--space-24) var(--space-24);
  background: #fffbf4;
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(28px * var(--rk));
}

.card.featured {
  background: var(--primary);
  box-shadow: calc(5px * var(--sx)) calc(5px * var(--sy)) calc(5px * var(--sbl))
    var(--shadow-color, var(--ink));
}

.badge {
  position: absolute;
  top: -16px;
  left: var(--space-24);
  padding: var(--space-4) var(--space-12);
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: #fffbf4;
  font-weight: var(--fw-strong);
  font-size: var(--fs-meta);
}

.name {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-stat);
  line-height: 1.1;
}

.price {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: calc(clamp(30px, 3.5vw, 40px) * var(--fk-display));
  line-height: 1;
}

.period {
  margin-left: var(--space-4);
  font-family: var(--font-body);
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-sm);
  color: #6e604e;
}

.desc {
  flex: 1;
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-lg);
  line-height: 1.5;
  color: #6e604e;
  text-wrap: pretty;
}

.cta {
  align-self: stretch;
  padding: var(--space-14) var(--space-24);
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-pill);
  background: #fffbf4;
  color: var(--ink);
  font-weight: var(--fw-strong);
  text-align: center;
  transition: transform 0.12s;
}

.featured .cta {
  background: var(--accent);
  color: #fffbf4;
}

.cta:hover {
  transform: translateY(2px);
}
</style>
