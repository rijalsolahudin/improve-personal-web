<script setup lang="ts">
import { GUIDE_BACKUP, guideAnchor } from '~/utils/guide'

const anchor = guideAnchor(GUIDE_BACKUP.id)
const titleId = `${anchor}-title`
</script>

<template>
  <section :id="anchor" class="backup" :aria-labelledby="titleId">
    <h2 :id="titleId" class="title">{{ GUIDE_BACKUP.title }}</h2>
    <p class="lead">{{ GUIDE_BACKUP.lead }}</p>

    <GuideLayerList :layers="GUIDE_BACKUP.blocks" />

    <p class="warning">
      <span class="warning-icon" aria-hidden="true">!</span>
      <span>{{ GUIDE_BACKUP.warning }}</span>
    </p>
  </section>
</template>

<style scoped>
.backup {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: clamp(18px, 3vw, 26px);
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-card);
  background: var(--paper);
  scroll-margin-top: var(--gap-desktop);
}

.backup:target {
  border-color: var(--outline);
  box-shadow: 0 0 0 3px var(--soft);
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: clamp(22px, 3.5vw, 28px);
  line-height: var(--lh-title);
}

.lead {
  max-width: 70ch;
  color: var(--mute-2);
  font-size: var(--fs-body);
  line-height: 1.65;
}

.warning {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: var(--radius-inner);
  background: var(--prio-medium-bg);
  color: var(--prio-medium-fg);
  font-size: var(--fs-caption);
  line-height: 1.55;
}

.warning-icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-pill);
  background: var(--prio-medium-fg);
  color: var(--prio-medium-bg);
  font-size: var(--fs-meta);
  font-weight: var(--fw-strong);
}
</style>
