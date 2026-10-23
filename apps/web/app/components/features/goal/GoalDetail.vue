<script setup lang="ts">
import {
  chapterProgress,
  chapterStatus,
  closeChapter,
  extendChapter,
  focusChapterIndex,
  itemsProgress,
  shiftChapter,
  toggleChapterDone,
  type Chapter,
  type Goal,
} from '~/utils/goals'
import { fromIsoDate } from '~/utils/time'

const { goal, today } = defineProps<{ goal: Goal; today: string }>()
defineEmits<{ edit: []; 'pick-cover': [] }>()

const { t } = useI18n()
const { dayMonth } = useDateFormat()
const { updateChapter, toggleTask } = useGoals()

const ALONG = 'along'
/** Override buka/tutup dari user; default = chapter yang sedang berjalan/terlewat. */
const opened = ref<Record<string, boolean>>({})
watch(
  () => goal.id,
  () => (opened.value = {}),
)
const focusId = computed(() => goal.chapters[focusChapterIndex(goal, today)]?.id)
const isOpen = (key: string): boolean => opened.value[key] ?? key === focusId.value
const toggle = (key: string): void => {
  opened.value = { ...opened.value, [key]: !isOpen(key) }
}

const palette = computed(() => ({
  '--goal-solid': `var(--cat-${goal.category})`,
  '--goal-tint': `var(--cat-${goal.category}-tint)`,
  '--goal-text': `var(--cat-${goal.category}-text)`,
}))

const period = (chapter: Chapter): string =>
  `${dayMonth(fromIsoDate(chapter.start).getTime())} – ${dayMonth(fromIsoDate(chapter.end).getTime())}`

const sections = computed(() =>
  goal.chapters.map((chapter, index) => {
    const status = chapterStatus(chapter, today)
    const canMark = status === 'berjalan' || (status === 'selesai' && chapter.isManualDone)
    return {
      chapter,
      badge: String(index + 1),
      status,
      progress: chapterProgress(chapter),
      sub: t('goals.chapterSub', { period: period(chapter), n: chapter.items.length }),
      markLabel: canMark ? t(chapter.isManualDone ? 'goals.unmarkDone' : 'goals.markDone') : null,
    }
  }),
)

function review(chapterId: string, action: 'extend' | 'shift' | 'close'): void {
  const apply: Record<typeof action, (chapter: Chapter) => Chapter> = {
    extend: (chapter) => extendChapter(chapter, today, goal.end),
    shift: (chapter) => shiftChapter(chapter, today, goal.end),
    close: closeChapter,
  }
  updateChapter(goal.id, chapterId, apply[action])
}

function openChapter(chapterId: string): void {
  opened.value = { ...opened.value, [chapterId]: true }
}
</script>

<template>
  <div class="detail" :style="palette">
    <GoalHero :goal="goal" :today="today" @edit="$emit('edit')" @pick-cover="$emit('pick-cover')" />
    <GoalStepper
      v-if="goal.chapters.length"
      :chapters="goal.chapters"
      :today="today"
      @open="openChapter"
    />
    <GoalSection
      v-if="goal.along.length"
      badge="∞"
      :title="$t('goals.along')"
      :sub="$t('goals.alongSub', { n: goal.along.length })"
      :progress="itemsProgress(goal.along)"
      :items="goal.along"
      :is-open="isOpen(ALONG)"
      @toggle="toggle(ALONG)"
      @toggle-item="(itemId) => toggleTask(goal.id, null, itemId)"
    />
    <GoalSection
      v-for="section in sections"
      :key="section.chapter.id"
      :badge="section.badge"
      :title="section.chapter.title"
      :sub="section.sub"
      :status="section.status"
      :progress="section.progress"
      :items="section.chapter.items"
      :is-open="isOpen(section.chapter.id)"
      :mark-label="section.markLabel"
      @toggle="toggle(section.chapter.id)"
      @toggle-item="(itemId) => toggleTask(goal.id, section.chapter.id, itemId)"
      @review="(action) => review(section.chapter.id, action)"
      @mark="updateChapter(goal.id, section.chapter.id, toggleChapterDone)"
    />
  </div>
</template>

<style scoped>
.detail {
  flex: 999 1 480px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
</style>
