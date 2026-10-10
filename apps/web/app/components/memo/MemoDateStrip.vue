<script setup lang="ts">
import { moodTints } from '@improve-personal/tokens'

import { memosOn, type Memo } from '~/utils/memo'
import { fromIsoDate } from '~/utils/time'

/** Strip tanggal jurnal (design): tanggal, hari, pratinjau, mood. */
const { dates, today, memos, plain } = defineProps<{
  dates: string[]
  today: string
  memos: Memo[]
  plain: (text: string) => string
}>()
const selected = defineModel<string>({ required: true })

const MOODS = ['😢', '😕', '😐', '🙂', '😄'] as const
const { t } = useI18n()
const { moodOn } = useMemos()
const { weekdayLong, monthShort } = useDateFormat()

const items = computed(() =>
  dates.map((day) => {
    const date = fromIsoDate(day)
    const first = memosOn(memos, day)[0]
    const mood = moodOn(day)
    return {
      day,
      n: date.getDate(),
      month: monthShort(date.getTime()),
      label: day === today ? t('memo.today') : weekdayLong(date.getTime()),
      preview: first ? plain(first.title || first.text) : t('memo.noEntryPreview'),
      mood: mood === null ? '·' : MOODS[mood],
      moodTint: mood === null ? '#f2e4cc' : moodTints[mood],
    }
  }),
)
</script>

<template>
  <div class="strip" role="listbox" :aria-label="$t('memo.datesLabel')">
    <button
      v-for="item in items"
      :key="item.day"
      type="button"
      class="date"
      role="option"
      :aria-selected="selected === item.day"
      @click="selected = item.day"
    >
      <span class="when">
        <span class="n">{{ item.n }}</span>
        <span class="month">{{ item.month }}</span>
      </span>
      <span class="text">
        <span class="label">{{ item.label }}</span>
        <span class="preview">{{ item.preview }}</span>
      </span>
      <span class="mood" :style="{ background: item.moodTint }" aria-hidden="true">{{
        item.mood
      }}</span>
    </button>
    <p v-if="!items.length" class="none">{{ $t('memo.noMatch') }}</p>
  </div>
</template>

<style scoped>
.strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 2px 8px;
}

.date {
  width: 230px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 2.5px solid transparent;
  border-radius: 18px;
  background: transparent;
  text-align: left;
}

.date:hover {
  background: var(--paper);
}

.date[aria-selected='true'] {
  border-color: var(--ink);
  background: var(--paper-2);
}

.when {
  width: 46px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.n {
  font-family: var(--font-hand);
  font-size: 28px;
  line-height: 1;
}

.month {
  font-weight: 800;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mute-3);
}

.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.label {
  font-weight: 800;
  font-size: 14px;
}

.preview {
  overflow: hidden;
  font-family: var(--font-hand);
  font-size: 15px;
  color: var(--mute-2);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.mood {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 18px;
  transform: rotate(-8deg);
}

.none {
  padding: 12px;
  font-family: var(--font-hand);
  font-size: 17px;
  color: var(--mute);
}
</style>
