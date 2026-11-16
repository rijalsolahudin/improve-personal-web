<script setup lang="ts">
/**
 * Janji privasi (ADR 15). Hanya yang SUDAH berlaku di app: data lokal terenkripsi kunci perangkat,
 * jalan offline, dan pindah lewat berkas backup. Transfer QR & backup Drive belum dibangun (T27-T32),
 * jadi sengaja belum disebut.
 */
const ITEMS = ['local', 'offline', 'backup'] as const
</script>

<template>
  <section id="privasi" class="section dot-grid" aria-labelledby="landing-privacy-title">
    <span class="mascot" aria-hidden="true"><Mascot name="awan" :size="88" /></span>
    <div class="head">
      <p class="kicker">{{ $t('landing.privacy.kicker') }}</p>
      <h2 id="landing-privacy-title" class="heading">{{ $t('landing.privacy.title') }}</h2>
    </div>
    <ul class="grid">
      <li v-for="item in ITEMS" :key="item" class="card">
        <h3 class="name">{{ $t(`landing.privacy.items.${item}.title`) }}</h3>
        <p class="desc">{{ $t(`landing.privacy.items.${item}.desc`) }}</p>
      </li>
    </ul>
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
  /* Kicker di atas `--primary`: `--deeper` lulus AA di semua tema (QA #67). */
  color: var(--deeper);
}

.heading {
  max-width: 18em;
  margin-top: var(--space-6);
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: calc(clamp(32px, 4.2vw, 48px) * var(--fk-display));
  line-height: var(--lh-tight);
  text-wrap: balance;
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
  gap: var(--space-10);
  padding: var(--space-24);
  background: #fffbf4;
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(28px * var(--rk));
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
