<template>
  <nav class="nav" :aria-label="$t('landing.nav.label')">
    <NuxtLink to="/" class="home-link"><BrandMark wordmark="inline" /></NuxtLink>
    <div class="links">
      <a href="#fitur" class="link">{{ $t('landing.nav.features') }}</a>
      <a href="#cara" class="link">{{ $t('landing.nav.how') }}</a>
      <NuxtLink to="/login" class="cta">{{ $t('landing.nav.cta') }}</NuxtLink>
    </div>
  </nav>
</template>

<style scoped>
.nav {
  position: sticky;
  top: 16px;
  z-index: 20;
  width: 100%;
  max-width: 1200px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 10px 10px 16px;
  background: #fffbf4;
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-drop);
}

.home-link {
  color: var(--ink);
}

.links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.link,
.cta {
  border-radius: var(--radius-pill);
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
}

.link {
  padding: 10px 16px;
  color: var(--ink);
}

.link:hover {
  background: var(--soft);
  color: var(--ink);
}

.cta {
  padding: 11px 20px;
  background: var(--accent);
  color: #fffbf4;
}

.cta:hover {
  background: var(--deeper);
  color: #fffbf4;
}

@media (max-width: 599px) {
  .link {
    display: none;
  }
}
</style>
