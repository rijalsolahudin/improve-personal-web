<script setup lang="ts">
import { GUIDE_COPY, GUIDE_GROUPS, guideFeaturesInGroup } from '~/utils/guide'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.panduan.label') })

const groups = GUIDE_GROUPS.map((group) => ({
  group,
  label: GUIDE_COPY.groupLabel[group],
  items: guideFeaturesInGroup(group),
})).filter(({ items }) => items.length > 0)

const featureCount = GUIDE_GROUPS.reduce(
  (total, group) => total + guideFeaturesInGroup(group).length,
  0,
)
</script>

<template>
  <div id="panduan-atas" class="guide">
    <header class="hero">
      <p class="eyebrow">{{ GUIDE_COPY.eyebrow }}</p>
      <h1 class="title">{{ GUIDE_COPY.title }}</h1>
      <p class="lead">{{ GUIDE_COPY.lead }}</p>
      <p class="intro">{{ GUIDE_COPY.intro }}</p>
      <ul class="meta" aria-label="Isi panduan">
        <li>{{ featureCount }} fitur</li>
        <li>Keamanan &amp; pemulihan</li>
        <li>{{ GUIDE_COPY.tocLabel }} bisa diklik</li>
      </ul>
    </header>

    <div class="layout">
      <GuideToc />

      <div class="content">
        <GuideSecurity />

        <section
          v-for="{ group, label, items } in groups"
          :key="group"
          class="group"
          :aria-label="label"
        >
          <h2 class="group-title">{{ label }}</h2>
          <div class="cards">
            <GuideFeatureCard v-for="item in items" :key="item.id" :feature="item" />
          </div>
        </section>

        <GuideBackup />
        <GuideFaq />
      </div>
    </div>
  </div>
</template>

<style scoped>
.guide {
  display: flex;
  flex-direction: column;
  gap: var(--space-24);
  padding-bottom: var(--space-80);
}

.hero {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  max-width: 780px;
  padding: clamp(20px, 3vw, 32px);
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-hero);
  background: var(--paper);
  box-shadow: var(--shadow-drop-sm);
}

.eyebrow {
  color: var(--deep);
  font-weight: var(--fw-strong);
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: calc(clamp(32px, 5vw, 46px) * var(--fk-display));
  line-height: var(--lh-title);
}

.lead {
  max-width: 64ch;
  color: var(--ink);
  font-size: var(--fs-body-lg);
  line-height: 1.6;
}

.intro {
  max-width: 66ch;
  color: var(--mute-2);
  font-size: var(--fs-body-sm);
  line-height: 1.6;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-6);
  margin: var(--space-6) 0 0;
  padding: 0;
  list-style: none;
}

.meta li {
  padding: var(--space-4) var(--space-10);
  border-radius: var(--radius-pill);
  background: var(--alt);
  color: var(--mute-2);
  font-size: var(--fs-meta);
  font-weight: var(--fw-strong);
}

.layout {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  gap: var(--gap-desktop);
  align-items: start;
}

.content {
  display: flex;
  flex-direction: column;
  gap: var(--space-24);
  min-width: 0;
}

.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
}

.group-title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: calc(clamp(22px, 3.5vw, 28px) * var(--fk-display));
  line-height: var(--lh-title);
}

.cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
}

@media (max-width: 899px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-18);
  }

  .guide {
    gap: var(--space-18);
    padding-bottom: var(--space-112);
  }
}
</style>
