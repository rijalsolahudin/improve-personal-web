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
        <NuxtLink :to="APP_HOME_PATH" class="btn btn-primary">{{
          $t('landing.hero.cta')
        }}</NuxtLink>
        <a href="#fitur" class="btn btn-outline">{{ $t('landing.hero.secondary') }}</a>
      </div>
      <p class="note">{{ $t('landing.hero.note') }}</p>
    </div>
    <!--
      Cuplikan dashboard di hero: murni hiasan statis (`aria-hidden`), tidak punya state atau
      interaksi. Dirender saat build/pre-render, tetapi tidak dihidrasi - chunk maskot yang
      dibutuhkannya tidak lagi masuk `modulepreload` halaman ini (Nuxt masih memberi hint
      `prefetch` prioritas rendah karena komponennya async; itu perilaku framework).
    -->
    <LazyLandingPreviewCard hydrate-never />
  </header>
</template>

<style scoped>
.hero {
  width: 100%;
  max-width: 1200px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr));
  align-items: center;
  gap: 48px;
}

.copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 22px;
}

.badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px 6px 8px;
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
  font-size: clamp(44px, 6vw, 72px);
  line-height: 1.12;
  letter-spacing: -0.01em;
  text-wrap: balance;
}

.highlight {
  padding: 0 6px;
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
  font-size: 19px;
  line-height: 1.55;
  color: #6e604e;
  text-wrap: pretty;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.btn {
  padding: 16px 28px;
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-pill);
  font-weight: var(--fw-strong);
  font-size: 17px;
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
  padding: 16px 24px;
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
  font-size: 20px;
  color: var(--deep);
  transform: rotate(calc(-2deg * var(--bev)));
}
</style>
