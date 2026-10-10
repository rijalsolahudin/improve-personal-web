<script setup lang="ts">
import type { HomeGoal } from '~/composables/home/types'

const { goal } = defineProps<{ goal: HomeGoal & { daysLeft: number } }>()

const palette = computed(() => ({
  '--goal-solid': `var(--cat-${goal.category})`,
  '--goal-tint': `var(--cat-${goal.category}-tint)`,
  '--goal-text': `var(--cat-${goal.category}-text)`,
}))
</script>

<template>
  <section class="card" :style="palette" aria-labelledby="home-goal-title">
    <div class="row">
      <UiProgressRing
        :percent="goal.progress"
        :size="52"
        :hole="0.73"
        color="var(--goal-solid)"
        inner="var(--goal-tint)"
        class="ring"
      >
        {{ goal.progress }}%
      </UiProgressRing>
      <div class="text">
        <p class="eyebrow label">
          <span class="wide">{{ $t('home.goal.eyebrow', { n: goal.daysLeft }) }}</span>
          <span class="narrow">{{ $t('home.goal.eyebrowShort', { n: goal.daysLeft }) }}</span>
        </p>
        <h2 id="home-goal-title" class="title">{{ goal.title }}</h2>
        <p v-if="goal.nextItem" class="next">{{ $t('home.goal.next', { item: goal.nextItem }) }}</p>
      </div>
      <NuxtLink :to="getFeature('goals').path" class="open">{{ $t('home.goal.open') }}</NuxtLink>
    </div>
    <ul class="chapters" :aria-label="$t('home.goal.chapters')">
      <li
        v-for="chapter in goal.chapters"
        :key="chapter.id"
        class="chapter"
        :title="chapter.title"
        :aria-label="$t('home.goal.chapter', { title: chapter.title, n: chapter.progress })"
      >
        <span class="fill" :style="{ width: `${chapter.progress}%` }" />
      </li>
    </ul>
  </section>
</template>

<style scoped>
.card {
  padding: 16px 18px;
  background: var(--goal-tint);
  border-radius: 28px;
}

.row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.ring {
  font-size: 14px;
}

.text {
  flex: 1;
  min-width: 0;
}

.label {
  color: var(--goal-text);
}

.title,
.next {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--fs-h2);
  line-height: var(--lh-title);
}

.next {
  font-weight: 700;
  font-size: var(--fs-meta);
  color: var(--goal-text);
}

.open {
  flex-shrink: 0;
  font-weight: 800;
  font-size: var(--fs-caption);
  color: var(--goal-text);
}

.open:hover {
  color: var(--ink);
}

.narrow {
  display: none;
}

.chapters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.chapter {
  height: 8px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.65);
}

.fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--goal-solid);
}

@media (max-width: 599px) {
  .card {
    padding: 14px 16px;
    border-radius: var(--radius-hero);
  }

  .row {
    gap: 12px;
  }

  .wide {
    display: none;
  }

  .narrow {
    display: inline;
  }

  .title {
    font-size: 19px;
  }
}
</style>
