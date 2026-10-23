<script setup lang="ts">
import { GUIDE_COPY, guideAnchor, type GuideFeature } from '~/utils/guide'

const { feature } = defineProps<{ feature: GuideFeature }>()

const anchor = guideAnchor(feature.id)
const titleId = `${anchor}-title`
</script>

<template>
  <article :id="anchor" class="card" :aria-labelledby="titleId">
    <div class="head">
      <span class="code">{{ feature.code }}</span>
      <span class="status" :class="`status-${feature.status}`">
        {{ GUIDE_COPY.status[feature.status] }}
      </span>
    </div>

    <h3 :id="titleId" class="title">{{ feature.title }}</h3>
    <p class="summary">{{ feature.summary }}</p>

    <ul class="tips">
      <li v-for="tip in feature.tips" :key="tip" class="tip">{{ tip }}</li>
    </ul>

    <NuxtLink v-if="feature.href" :to="feature.href" class="open">
      {{ GUIDE_COPY.open }} <span aria-hidden="true">→</span>
    </NuxtLink>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px 22px;
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-card);
  background: var(--paper);
  scroll-margin-top: var(--gap-desktop);
}

.card:target {
  border-color: var(--outline);
  box-shadow: 0 0 0 3px var(--soft);
}

.head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.code,
.status {
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  font-size: var(--fs-eyebrow);
  font-weight: var(--fw-strong);
  letter-spacing: 0.04em;
}

.code {
  background: var(--alt);
  color: var(--mute-2);
}

.status-ready {
  background: var(--success-soft);
  color: var(--success);
  box-shadow: inset 0 0 0 1px var(--success-line);
}

.status-via {
  background: var(--soft);
  color: var(--deep);
  box-shadow: inset 0 0 0 1px var(--line);
}

.status-partial {
  background: var(--prio-medium-bg);
  color: var(--prio-medium-fg);
}

.status-soon {
  background: var(--prio-urgent-bg);
  color: var(--prio-urgent-fg);
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-h3);
  line-height: var(--lh-title);
}

.summary {
  max-width: 68ch;
  color: var(--mute-2);
  font-size: var(--fs-body);
  line-height: 1.65;
}

.tips {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tip {
  position: relative;
  padding-left: 20px;
  color: var(--ink);
  font-size: var(--fs-body-sm);
  line-height: 1.55;
}

.tip::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: var(--success);
  font-weight: var(--fw-strong);
}

.open {
  align-self: flex-start;
  font-size: var(--fs-caption);
  font-weight: var(--fw-strong);
}

.open:hover {
  color: var(--ink);
}

@media (max-width: 599px) {
  .card {
    padding: 16px;
  }
}
</style>
