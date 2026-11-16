<script setup lang="ts">
const STEPS = ['1', '2', '3'] as const
</script>

<template>
  <section id="cara" class="section dot-grid" aria-labelledby="landing-steps-title">
    <Mascot class="mascot" name="awan" :size="88" />
    <div>
      <p class="kicker">{{ $t('landing.steps.kicker') }}</p>
      <h2 id="landing-steps-title" class="heading">{{ $t('landing.steps.title') }}</h2>
    </div>
    <ol class="grid">
      <li v-for="step in STEPS" :key="step" class="card">
        <span class="number" aria-hidden="true">{{ step }}</span>
        <h3 class="name">{{ $t(`landing.steps.items.${step}.title`) }}</h3>
        <p class="desc">{{ $t(`landing.steps.items.${step}.desc`) }}</p>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.section {
  position: relative;
  width: 100%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  gap: var(--space-32);
  padding: clamp(28px, 5vw, 56px);
  background-color: var(--primary);
  background-size: 24px 24px;
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(40px * var(--rk));
  scroll-margin-top: 110px;
}

.mascot {
  position: absolute;
  right: clamp(16px, 4vw, 48px);
  top: -44px;
  transform: rotate(calc(8deg * var(--bev)));
}

.kicker {
  font-weight: var(--fw-strong);
  font-size: var(--fs-caption);
  letter-spacing: var(--tracking-group);
  /* Kicker di atas `--primary`: `--deep` 3,98:1 (cute/hijau), `--deeper` 5,09:1 (QA #67). */
  color: var(--deeper);
}

.heading {
  margin-top: var(--space-6);
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: calc(clamp(34px, 4.5vw, 52px) * var(--fk-display));
  line-height: var(--lh-tight);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: var(--space-18);
  margin: 0;
  padding: 0;
  list-style: none;
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
  padding: var(--space-24);
  background: #fffbf4;
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(28px * var(--rk));
}

.number {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border-thick) solid var(--outline);
  border-radius: 50%;
  background: var(--accent);
  color: #fffbf4;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-22);
}

.name {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-stat);
  line-height: 1.1;
}

.desc {
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-lg);
  line-height: 1.5;
  color: #6e604e;
  text-wrap: pretty;
}
</style>
