<script setup lang="ts">
import { planPriceLabel } from '~/utils/price'

const PHONE_WIDTH = 600
const PHONE_HEIGHT = 1298
/** Screenshot Daily dipotret 1440x1300 (`scripts/landing/shots.ts`) supaya Habit ikut terlihat. */
const DAILY_SHOT_HEIGHT = 1444
</script>

<template>
  <header class="hero">
    <div class="copy">
      <p class="badge">
        <span class="badge-dot" aria-hidden="true" />
        {{ $t('landing.hero.badge') }}
      </p>
      <h1 class="title">
        {{ $t('landing.hero.titleLead') }}
        <span class="highlight">{{ $t('landing.hero.titleHighlight') }}</span>
      </h1>
      <p class="lead">{{ $t('landing.hero.lead') }}</p>
      <div class="actions">
        <a href="#harga" class="btn btn-primary">{{ $t('landing.hero.cta') }}</a>
        <a href="#fitur" class="btn btn-outline">{{ $t('landing.hero.secondary') }}</a>
      </div>
      <p class="note">{{ $t('landing.hero.note', { price: planPriceLabel('monthly') }) }}</p>
    </div>

    <div class="stage">
      <LandingShot
        name="daily"
        :alt="$t('landing.hero.shotAlt')"
        is-eager
        :height="DAILY_SHOT_HEIGHT"
        sizes="(min-width: 1200px) 1100px, 100vw"
      />
      <!-- Versi HP: hiasan pendamping (alt kosong) - isinya sama dengan screenshot di sebelahnya. -->
      <img
        class="phone"
        src="/landing/daily-phone.webp"
        alt=""
        :width="PHONE_WIDTH"
        :height="PHONE_HEIGHT"
        loading="lazy"
        decoding="async"
      />
    </div>
  </header>
</template>

<style scoped>
.hero {
  width: 100%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(40px, 6vw, 72px);
}

.stage {
  position: relative;
  width: 100%;
  max-width: 1100px;
}

.phone {
  position: absolute;
  right: clamp(-48px, -3vw, -16px);
  bottom: -40px;
  width: clamp(120px, 17%, 190px);
  height: auto;
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(26px * var(--rk));
  box-shadow: calc(6px * var(--sx)) calc(6px * var(--sy)) calc(6px * var(--sbl))
    var(--shadow-color, var(--ink));
  transform: rotate(calc(4deg * var(--bev)));
}

/* Di layar sempit screenshot HP menutupi terlalu banyak isi screenshot utama. */
@media (max-width: 640px) {
  .phone {
    display: none;
  }
}

.copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-22);
  text-align: center;
}

.badge {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-6) var(--space-14) var(--space-6) var(--space-8);
  background: #fffbf4;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-pill);
  font-weight: var(--fw-strong);
  font-size: var(--fs-caption);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.badge-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--primary);
  border: var(--border-thin) solid var(--outline);
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  max-width: 15em;
  font-size: calc(clamp(40px, 6vw, 72px) * var(--fk-display));
  line-height: 1.12;
  letter-spacing: -0.01em;
  text-wrap: balance;
}

.highlight {
  padding: 0 var(--space-6);
  border-radius: calc(10px * var(--rk));
  background: linear-gradient(
    transparent 22%,
    var(--primary) 22%,
    var(--primary) 92%,
    transparent 92%
  );
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.lead {
  max-width: 30em;
  font-weight: var(--fw-medium);
  font-size: var(--fs-19);
  line-height: 1.55;
  color: #6e604e;
  text-wrap: pretty;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-12);
}

.btn {
  padding: var(--space-16) var(--space-28);
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-pill);
  font-weight: var(--fw-strong);
  font-size: var(--fs-17);
}

.btn-primary {
  background: var(--accent);
  color: #fffbf4;
  box-shadow: calc(5px * var(--sx)) calc(5px * var(--sy)) calc(5px * var(--sbl))
    var(--shadow-color, var(--ink));
  transition: transform 0.12s;
}

.btn-primary:hover {
  color: #fffbf4;
  transform: translateY(2px);
}

.btn-outline {
  padding: var(--space-16) var(--space-24);
  background: #fffbf4;
  color: var(--ink);
}

.btn-outline:hover {
  background: var(--soft);
  color: var(--ink);
}

.note {
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; paragraf mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-20);
  color: var(--deep);
  transform: rotate(calc(-2deg * var(--bev)));
}
</style>
