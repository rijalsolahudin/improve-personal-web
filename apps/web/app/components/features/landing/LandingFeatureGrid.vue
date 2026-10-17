<script setup lang="ts">
import type { FeatureId } from '~/utils/features'

/** Sembilan fitur yang ditonjolkan di landing (urutan sesuai Landing Page.dc.html). */
const SHOWCASE: readonly FeatureId[] = [
  'goals',
  'kalender',
  'to-do',
  'eisenhower',
  'pomodoro',
  'habit',
  'memo',
  'overview',
  'countdown',
]
const features = SHOWCASE.map(getFeature)
</script>

<template>
  <section id="fitur" class="section" aria-labelledby="landing-features-title">
    <div class="intro">
      <div>
        <p class="kicker">{{ $t('landing.features.kicker') }}</p>
        <h2 id="landing-features-title" class="heading">
          {{ $t('landing.features.titleLine1') }}<br />{{ $t('landing.features.titleLine2') }}
        </h2>
      </div>
      <p class="lead">{{ $t('landing.features.lead') }}</p>
    </div>
    <ul class="grid">
      <li v-for="feature in features" :key="feature.id" class="card">
        <AppIcon :glyph="feature.glyph" :color="feature.color" :size="52" />
        <div>
          <h3 class="name">{{ $t(`feature.${feature.id}.label`) }}</h3>
          <p class="desc">{{ $t(`landing.features.desc.${feature.id}`) }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.section {
  width: 100%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  gap: 32px;
  scroll-margin-top: 110px;
}

.intro {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.kicker {
  font-weight: var(--fw-strong);
  font-size: var(--fs-caption);
  letter-spacing: var(--tracking-group);
  color: var(--deep);
}

.heading {
  margin-top: 6px;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: clamp(34px, 4.5vw, 52px);
  line-height: var(--lh-tight);
  text-wrap: balance;
}

.lead {
  max-width: 26em;
  font-weight: var(--fw-medium);
  font-size: 17px;
  line-height: 1.55;
  color: #6e604e;
  text-wrap: pretty;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
  gap: 18px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  background: #fffbf4;
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(28px * var(--rk));
  box-shadow: var(--shadow-drop);
  transition: transform 0.15s;
}

.card:hover {
  transform: translateY(-4px) rotate(calc(-0.6deg * var(--bev)));
}

.name {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 24px;
  line-height: 1.1;
}

.desc {
  margin-top: 4px;
  font-weight: var(--fw-medium);
  font-size: var(--fs-body);
  line-height: 1.5;
  color: #6e604e;
  text-wrap: pretty;
}
</style>
