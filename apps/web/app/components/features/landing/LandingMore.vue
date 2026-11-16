<script setup lang="ts">
/** Fitur pendukung: kartu kecil dengan screenshot asli. Teks di `landing.more.items.<key>`. */
const ITEMS = [
  { key: 'overview', shot: 'overview' },
  { key: 'pomodoro', shot: 'pomodoro' },
  { key: 'countdown', shot: 'countdown' },
] as const
</script>

<template>
  <section class="section" aria-labelledby="landing-more-title">
    <h2 id="landing-more-title" class="heading">{{ $t('landing.more.title') }}</h2>
    <ul class="grid">
      <li v-for="item in ITEMS" :key="item.key" class="card">
        <LandingShot
          :name="item.shot"
          :alt="$t(`landing.more.items.${item.key}.alt`)"
          sizes="(min-width: 1024px) 380px, 100vw"
        />
        <h3 class="name">{{ $t(`landing.more.items.${item.key}.title`) }}</h3>
        <p class="desc">{{ $t(`landing.more.items.${item.key}.desc`) }}</p>
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
  gap: var(--space-32);
}

.heading {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: calc(clamp(28px, 3.5vw, 40px) * var(--fk-display));
  line-height: var(--lh-tight);
  text-align: center;
  text-wrap: balance;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: var(--space-24);
  margin: 0;
  padding: 0;
  list-style: none;
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
}

.name {
  margin-top: var(--space-8);
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
