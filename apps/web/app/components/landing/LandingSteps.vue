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
  gap: 32px;
  padding: clamp(28px, 5vw, 56px);
  background-color: var(--primary);
  background-size: 24px 24px;
  border: var(--border-thick) solid var(--ink);
  border-radius: 40px;
  scroll-margin-top: 110px;
}

.mascot {
  position: absolute;
  right: clamp(16px, 4vw, 48px);
  top: -44px;
  transform: rotate(8deg);
}

.kicker {
  font-weight: 800;
  font-size: var(--fs-caption);
  letter-spacing: var(--tracking-group);
  color: var(--deep);
}

.heading {
  margin-top: 6px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(34px, 4.5vw, 52px);
  line-height: var(--lh-tight);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: 18px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  background: #fffbf4;
  border: var(--border-thick) solid var(--ink);
  border-radius: 28px;
}

.number {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border-thick) solid var(--ink);
  border-radius: 50%;
  background: var(--accent);
  color: #fffbf4;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 22px;
}

.name {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--fs-stat);
  line-height: 1.1;
}

.desc {
  font-weight: 600;
  font-size: var(--fs-body-lg);
  line-height: 1.5;
  color: #6e604e;
  text-wrap: pretty;
}
</style>
