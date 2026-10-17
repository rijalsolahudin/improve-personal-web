<script setup lang="ts">
import type { MascotName } from '~/utils/mascots'

const STICKERS: readonly { name: MascotName; tilt: number }[] = [
  { name: 'kelinci', tilt: -8 },
  { name: 'kucing', tilt: 5 },
  { name: 'ayam', tilt: -3 },
  { name: 'beruang', tilt: 7 },
  { name: 'rubah', tilt: -6 },
  { name: 'anjing', tilt: 4 },
  { name: 'bunga', tilt: -5 },
  { name: 'jamur', tilt: 6 },
]
</script>

<template>
  <section class="outro" aria-labelledby="landing-outro-title">
    <div class="stickers" aria-hidden="true">
      <Mascot
        v-for="sticker in STICKERS"
        :key="sticker.name"
        :name="sticker.name"
        :size="64"
        :style="{ transform: `rotate(${sticker.tilt}deg)` }"
      />
    </div>
    <h2 id="landing-outro-title" class="heading">{{ $t('landing.outro.title') }}</h2>
    <p class="lead">{{ $t('landing.outro.lead') }}</p>
    <NuxtLink to="/login" class="cta">{{ $t('landing.outro.cta') }}</NuxtLink>
  </section>
</template>

<style scoped>
.outro {
  width: 100%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
  text-align: center;
}

.stickers {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: center;
  gap: 6px;
}

.heading {
  max-width: 14em;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: clamp(36px, 5vw, 60px);
  line-height: var(--lh-tight);
  text-wrap: balance;
}

.lead {
  max-width: 28em;
  font-weight: var(--fw-medium);
  font-size: 18px;
  line-height: 1.55;
  color: #6e604e;
}

.cta {
  padding: 18px 34px;
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: #fffbf4;
  font-weight: var(--fw-strong);
  font-size: 18px;
  box-shadow: calc(5px * var(--sx)) calc(5px * var(--sy)) calc(5px * var(--sbl))
    var(--shadow-color, var(--ink));
  transition: transform 0.12s;
}

.cta:hover {
  color: #fffbf4;
  transform: translateY(2px);
}
</style>
