<script setup lang="ts">
/**
 * Fitur utama, satu baris per fitur: teks + screenshot asli, berselang-seling kiri/kanan. Daily
 * tidak diulang di sini - screenshot-nya sudah jadi gambar utama hero.
 * Teks per fitur di `landing.showcase.items.<key>` (kicker, title, desc, p1-p3).
 */
const ITEMS = [
  { key: 'calendar', shot: 'kalender' },
  { key: 'tasks', shot: 'eisenhower' },
  { key: 'habit', shot: 'habit' },
  { key: 'journal', shot: 'journal' },
  { key: 'goals', shot: 'goals' },
] as const

const POINTS = ['p1', 'p2', 'p3'] as const
</script>

<template>
  <section id="fitur" class="section" aria-labelledby="landing-showcase-title">
    <div class="head">
      <p class="kicker">{{ $t('landing.showcase.kicker') }}</p>
      <h2 id="landing-showcase-title" class="heading">{{ $t('landing.showcase.title') }}</h2>
      <p class="lead">{{ $t('landing.showcase.lead') }}</p>
    </div>

    <article v-for="item in ITEMS" :key="item.key" class="row">
      <div class="copy">
        <p class="item-kicker">{{ $t(`landing.showcase.items.${item.key}.kicker`) }}</p>
        <h3 class="item-title">{{ $t(`landing.showcase.items.${item.key}.title`) }}</h3>
        <p class="item-desc">{{ $t(`landing.showcase.items.${item.key}.desc`) }}</p>
        <ul class="points">
          <li v-for="point in POINTS" :key="point" class="point">
            {{ $t(`landing.showcase.items.${item.key}.${point}`) }}
          </li>
        </ul>
      </div>
      <LandingShot
        class="shot"
        :name="item.shot"
        :alt="$t(`landing.showcase.items.${item.key}.alt`)"
      />
    </article>
  </section>
</template>

<style scoped>
.section {
  width: 100%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  gap: clamp(56px, 8vw, 104px);
  scroll-margin-top: 110px;
}

.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-10);
  text-align: center;
}

.kicker,
.item-kicker {
  font-weight: var(--fw-strong);
  font-size: var(--fs-caption);
  letter-spacing: var(--tracking-group);
  color: var(--deeper);
}

.heading {
  max-width: 16em;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: calc(clamp(34px, 4.5vw, 52px) * var(--fk-display));
  line-height: var(--lh-tight);
  text-wrap: balance;
}

.lead {
  max-width: 34em;
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-lg);
  line-height: 1.5;
  color: #6e604e;
  text-wrap: pretty;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  align-items: center;
  gap: clamp(28px, 5vw, 64px);
}

/* Berselang-seling: baris genap menaruh screenshot di kiri. */
.row:nth-of-type(even) .copy {
  order: 2;
}

.copy {
  display: flex;
  flex-direction: column;
  gap: var(--space-14);
}

.item-title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: calc(clamp(28px, 3.2vw, 40px) * var(--fk-display));
  line-height: 1.12;
  text-wrap: balance;
}

.item-desc {
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-lg);
  line-height: 1.55;
  color: #6e604e;
  text-wrap: pretty;
}

.points {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  margin: 0;
  padding: 0;
  list-style: none;
}

.point {
  display: flex;
  gap: var(--space-10);
  font-weight: var(--fw-strong);
  line-height: 1.4;
}

.point::before {
  content: '';
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border: var(--border-thin) solid var(--outline);
  border-radius: 50%;
  background: var(--primary);
}

@media (max-width: 860px) {
  .row {
    grid-template-columns: minmax(0, 1fr);
  }

  .row:nth-of-type(even) .copy {
    order: 0;
  }
}
</style>
