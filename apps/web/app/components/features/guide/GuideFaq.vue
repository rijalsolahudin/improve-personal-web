<script setup lang="ts">
import { GUIDE_COPY, GUIDE_FAQ, guideAnchor } from '~/utils/guide'

const anchor = guideAnchor('faq')
const titleId = `${anchor}-title`
</script>

<template>
  <section :id="anchor" class="faq" :aria-labelledby="titleId">
    <h2 :id="titleId" class="title">{{ GUIDE_COPY.faqTitle }}</h2>
    <p class="lead">{{ GUIDE_COPY.faqLead }}</p>

    <div class="items">
      <details v-for="(item, index) in GUIDE_FAQ" :key="item.question" class="item">
        <summary class="question">
          <span class="number" aria-hidden="true">{{ index + 1 }}</span>
          <span>{{ item.question }}</span>
        </summary>
        <p class="answer">{{ item.answer }}</p>
      </details>
    </div>
  </section>
</template>

<style scoped>
.faq {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: clamp(18px, 3vw, 26px);
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-card);
  background: var(--paper);
  scroll-margin-top: var(--gap-desktop);
}

.faq:target {
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

.items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item {
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-inner);
  background: var(--paper);
}

.item[open] {
  border-color: var(--outline);
  background: var(--soft);
}

.question {
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 12px 14px;
  cursor: pointer;
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-strong);
  line-height: 1.45;
  list-style: none;
}

.question::-webkit-details-marker {
  display: none;
}

.question::after {
  content: '+';
  margin-left: auto;
  color: var(--mute-3);
  font-size: var(--fs-h3);
  line-height: 1;
}

.item[open] .question::after {
  content: '−';
}

.number {
  flex-shrink: 0;
  min-width: 20px;
  color: var(--mute-3);
  font-size: var(--fs-meta);
}

.answer {
  padding: 0 14px 14px 44px;
  color: var(--mute-2);
  font-size: var(--fs-caption);
  line-height: 1.65;
}

@media (max-width: 599px) {
  .answer {
    padding-left: 14px;
  }
}
</style>
