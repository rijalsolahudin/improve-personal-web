<script setup lang="ts">
import {
  GOAL_MAX_CHAPTERS,
  isChapterDraftOutOfRange,
  nextChapterDraft,
  type ChapterDraft,
  type GoalDraft,
} from '~/utils/goals'

/**
 * Baris chapter di form goal: judul + periode, urut ↑↓, hapus. Selalu dihitung dari
 * `draft.chapters` (objek reaktif milik parent, selalu terbaru) supaya dua perubahan
 * beruntun dalam satu tick tidak saling menimpa.
 */
const { draft, showErrors } = defineProps<{ draft: GoalDraft; showErrors: boolean }>()
const emit = defineEmits<{ change: [chapters: ChapterDraft[]] }>()

function patch(index: number, change: Partial<ChapterDraft>): void {
  emit(
    'change',
    draft.chapters.map((row, i) => (i === index ? { ...row, ...change } : row)),
  )
}

function move(index: number, delta: -1 | 1): void {
  const target = index + delta
  if (target < 0 || target >= draft.chapters.length) return
  const next = [...draft.chapters]
  const [row] = next.splice(index, 1)
  if (row) next.splice(target, 0, row)
  emit('change', next)
}

function remove(index: number): void {
  emit(
    'change',
    draft.chapters.filter((_, i) => i !== index),
  )
}

function add(): void {
  emit('change', [...draft.chapters, nextChapterDraft(draft, crypto.randomUUID())])
}
</script>

<template>
  <fieldset class="chapters">
    <legend class="head">
      <span class="label">{{ $t('goals.form.chapters') }}</span>
      <span class="hint">{{ $t('goals.form.chaptersHint') }}</span>
    </legend>
    <div
      v-for="(row, index) in draft.chapters"
      :key="row.key"
      class="row"
      :class="{ invalid: showErrors && isChapterDraftOutOfRange(row, draft) }"
    >
      <span class="num" aria-hidden="true">{{ index + 1 }}</span>
      <Input
        class="title"
        size="sm"
        :model-value="row.title"
        maxlength="120"
        :placeholder="$t('goals.form.chapterTitle')"
        :aria-label="$t('goals.form.chapterTitleN', { n: index + 1 })"
        @update:model-value="(value) => patch(index, { title: String(value) })"
      />
      <Input
        class="date"
        size="sm"
        type="date"
        :model-value="row.start"
        :min="draft.start"
        :max="draft.end"
        :aria-label="$t('goals.form.chapterStartN', { n: index + 1 })"
        @update:model-value="(value) => patch(index, { start: String(value) })"
      />
      <Input
        class="date"
        size="sm"
        type="date"
        :model-value="row.end"
        :min="draft.start"
        :max="draft.end"
        :aria-label="$t('goals.form.chapterEndN', { n: index + 1 })"
        @update:model-value="(value) => patch(index, { end: String(value) })"
      />
      <span class="tools">
        <IconButton
          tone="bare"
          :size="32"
          :radius="10"
          :title="$t('goals.form.up', { n: index + 1 })"
          @click="move(index, -1)"
        >
          ↑
        </IconButton>
        <IconButton
          tone="bare"
          :size="32"
          :radius="10"
          :title="$t('goals.form.down', { n: index + 1 })"
          @click="move(index, 1)"
        >
          ↓
        </IconButton>
        <IconButton
          tone="danger"
          :size="32"
          :radius="10"
          :title="$t('goals.form.removeChapter', { n: index + 1 })"
          @click="remove(index)"
        >
          ×
        </IconButton>
      </span>
    </div>
    <Button v-if="draft.chapters.length < GOAL_MAX_CHAPTERS" variant="dashed" block @click="add">
      + {{ $t('goals.form.addChapter') }}
    </Button>
  </fieldset>
</template>

<style scoped>
.chapters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: none;
}

.head {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  padding: 0;
}

.label {
  font-weight: var(--fw-strong);
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mute-2);
}

.hint {
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--mute);
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: var(--border-thin) solid transparent;
  border-radius: var(--radius-row);
  background: var(--alt);
}

.row.invalid {
  border-color: var(--danger);
}

.num {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: calc(10px * var(--rk));
  background: var(--chip);
  font-family: var(--font-display);
  font-weight: var(--fw-display);
}

.title {
  flex: 2 1 160px;
}

.date {
  flex: 1 1 130px;
  padding: 9px 10px;
  font-size: 14px;
}

.tools {
  display: flex;
  gap: 4px;
}
</style>
