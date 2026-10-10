<script setup lang="ts">
import { CHAPTER_TONE, chapterStatus, type Chapter } from '~/utils/goals'
import { fromIsoDate } from '~/utils/time'

const { chapters, today } = defineProps<{ chapters: Chapter[]; today: string }>()
defineEmits<{ open: [chapterId: string] }>()

const { dayMonth } = useDateFormat()
const MARK = { selesai: '✓', terlewat: '!', ditutup: '–' } as const

const steps = computed(() =>
  chapters.map((chapter, index) => {
    const status = chapterStatus(chapter, today)
    return {
      chapter,
      status,
      mark: status in MARK ? MARK[status as keyof typeof MARK] : String(index + 1),
      period: `${dayMonth(fromIsoDate(chapter.start).getTime())} – ${dayMonth(fromIsoDate(chapter.end).getTime())}`,
    }
  }),
)
</script>

<template>
  <section class="stepper" aria-labelledby="goal-stepper-title">
    <h3 id="goal-stepper-title" class="title">{{ $t('goals.journey') }}</h3>
    <ol class="steps">
      <li v-for="step in steps" :key="step.chapter.id" class="step" :class="step.status">
        <button type="button" class="step-btn" @click="$emit('open', step.chapter.id)">
          <span class="track">
            <span class="dot" aria-hidden="true">{{ step.mark }}</span>
            <span class="line" aria-hidden="true" />
          </span>
          <span class="body">
            <span class="name">{{ step.chapter.title }}</span>
            <span class="period">{{ step.period }}</span>
            <GoalChip :tone="CHAPTER_TONE[step.status]">
              {{ $t(`goals.chapterStatus.${step.status}`) }}
            </GoalChip>
          </span>
        </button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.stepper {
  padding: 22px 24px;
  border: 2px solid var(--line);
  border-radius: 28px;
  background: var(--paper);
}

.title {
  margin-bottom: 16px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 20px;
}

.steps {
  display: flex;
  overflow-x: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  flex: 1;
  min-width: 140px;
}

.step-btn {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
}

.track {
  display: flex;
  align-items: center;
}

.dot {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid var(--dash);
  border-radius: 50%;
  background: var(--paper);
  font-weight: 800;
  font-size: 15px;
}

.line {
  flex: 1;
  height: 4px;
  margin: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--line);
}

.step:last-child .line {
  background: transparent;
}

.berjalan .dot {
  border-color: var(--goal-solid);
}

.selesai .dot {
  border-color: var(--goal-solid);
  background: var(--goal-solid);
  color: var(--paper);
}

.selesai .line {
  background: var(--goal-solid);
}

.terlewat .dot {
  border-color: #e2445c;
  background: #e2445c;
  color: var(--paper);
}

.body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding-right: 12px;
}

.name {
  font-weight: 800;
  font-size: 15px;
}

.period {
  margin-bottom: 4px;
  font-weight: 700;
  font-size: 13px;
  color: var(--mute);
}
</style>
