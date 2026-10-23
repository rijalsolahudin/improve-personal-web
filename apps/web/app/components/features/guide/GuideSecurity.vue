<script setup lang="ts">
import { GUIDE_SECURITY, guideAnchor } from '~/utils/guide'

const anchor = guideAnchor(GUIDE_SECURITY.id)
const titleId = `${anchor}-title`
</script>

<template>
  <section :id="anchor" class="security" :aria-labelledby="titleId">
    <header class="head">
      <span class="shield" aria-hidden="true">🔒</span>
      <div>
        <h2 :id="titleId" class="title">{{ GUIDE_SECURITY.title }}</h2>
        <p class="lead">{{ GUIDE_SECURITY.lead }}</p>
      </div>
    </header>

    <h3 class="subtitle">{{ GUIDE_SECURITY.layersTitle }}</h3>
    <GuideLayerList :layers="GUIDE_SECURITY.layers" numbered />

    <div class="columns">
      <section class="knows">
        <h3 class="subtitle">{{ GUIDE_SECURITY.knowsTitle }}</h3>
        <ul class="list">
          <li v-for="item in GUIDE_SECURITY.knows" :key="item">{{ item }}</li>
        </ul>
      </section>
      <section class="not-knows">
        <h3 class="subtitle">{{ GUIDE_SECURITY.notKnowsTitle }}</h3>
        <ul class="list">
          <li v-for="item in GUIDE_SECURITY.notKnows" :key="item">{{ item }}</li>
        </ul>
      </section>
    </div>

    <section class="recovery">
      <h3 class="subtitle">{{ GUIDE_SECURITY.recoveryTitle }}</h3>
      <ol class="steps">
        <li v-for="step in GUIDE_SECURITY.recoverySteps" :key="step">{{ step }}</li>
      </ol>
      <p class="lost">{{ GUIDE_SECURITY.lost }}</p>
      <p class="soon">{{ GUIDE_SECURITY.soon }}</p>
    </section>
  </section>
</template>

<style scoped>
.security {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: clamp(18px, 3vw, 28px);
  border: var(--border-thick) solid var(--outline);
  border-radius: var(--radius-hero);
  background: var(--paper);
  box-shadow: var(--shadow-drop-sm);
  scroll-margin-top: var(--gap-desktop);
}

.security:target {
  outline: 3px solid var(--accent);
  outline-offset: 4px;
}

.head {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.shield {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 44px;
  height: 44px;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-leaf);
  background: var(--soft);
  font-size: 20px;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: clamp(24px, 4vw, 32px);
  line-height: var(--lh-title);
}

.lead {
  max-width: 70ch;
  margin-top: 6px;
  color: var(--mute-2);
  font-size: var(--fs-body);
  line-height: 1.65;
}

.subtitle {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-h3);
}

.columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 12px;
}

.knows,
.not-knows {
  padding: 14px;
  border-radius: var(--radius-inner);
}

.knows {
  background: var(--success-soft);
  box-shadow: inset 0 0 0 1px var(--success-line);
}

.not-knows {
  background: var(--soft);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: var(--fs-caption);
  line-height: 1.55;
}

.recovery {
  padding-top: 16px;
  border-top: var(--border-thin) dashed var(--dash);
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 10px 0 0;
  padding-left: 20px;
  font-size: var(--fs-body-sm);
  line-height: 1.6;
}

.lost,
.soon {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: var(--radius-inner);
  font-size: var(--fs-caption);
  line-height: 1.55;
}

.lost {
  background: var(--prio-urgent-bg);
  color: var(--prio-urgent-fg);
}

.soon {
  background: var(--prio-medium-bg);
  color: var(--prio-medium-fg);
}

@media (max-width: 599px) {
  .head {
    gap: 10px;
  }

  .shield {
    width: 36px;
    height: 36px;
    font-size: 17px;
  }
}
</style>
