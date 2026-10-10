<script setup lang="ts">
import { moodTints } from '@improve-personal/tokens'

import { splitMentions, type Memo } from '~/utils/memo'
import { formatHourMinute } from '~/utils/time'

/** Satu halaman jurnal tersimpan (design: kertas bergaris, selotip, stempel mood). */
const { memo, index, mood } = defineProps<{ memo: Memo; index: number; mood: number | null }>()
defineEmits<{ remove: [] }>()

const MOODS = ['😢', '😕', '😐', '🙂', '😄'] as const
/** Variasi kecil per urutan supaya tumpukan kertas terlihat alami (design). */
const TILT = [-0.6, 0.5, -0.3] as const
const TAPE = [
  { x: 8, rot: -4, color: '#F7C6DA' },
  { x: 62, rot: 3, color: '#C7E3EE' },
  { x: 30, rot: -2, color: '#CDE8C6' },
] as const

const isConfirming = ref(false)
const segments = computed(() => splitMentions(memo.text))
const tape = computed(() => TAPE[index % TAPE.length] ?? TAPE[0])
const style = computed(() => ({
  transform: `rotate(${TILT[index % TILT.length]}deg)`,
  '--tape-x': `${tape.value.x}%`,
  '--tape-rot': `${tape.value.rot}deg`,
  '--tape': tape.value.color,
}))
</script>

<template>
  <article class="entry" :style="style">
    <span class="tape" aria-hidden="true" />
    <span
      class="stamp"
      :style="{ background: mood === null ? '#f2e4cc' : moodTints[mood] }"
      aria-hidden="true"
    >
      {{ mood === null ? '✎' : MOODS[mood] }}
    </span>
    <header class="head">
      <h3 class="title">{{ memo.title || $t('memo.untitled') }}</h3>
      <span class="time">{{ formatHourMinute(memo.createdAt) }}</span>
    </header>
    <p class="body">
      <template v-for="(segment, i) in segments" :key="i"
        ><MemoMention
          v-if="segment.kind === 'mention'"
          :schedule-id="segment.scheduleId"
          :day="memo.date"
        /><span v-else class="seg">{{ segment.text }}</span></template
      >
    </p>
    <footer class="foot">
      <span class="tags">
        <span v-for="feeling in memo.feelings" :key="feeling" class="tag">#{{ feeling }}</span>
      </span>
      <button
        type="button"
        class="delete"
        @click="isConfirming ? $emit('remove') : (isConfirming = true)"
      >
        {{ $t(isConfirming ? 'memo.deleteConfirm' : 'memo.delete') }}
      </button>
    </footer>
  </article>
</template>

<style scoped>
.entry {
  position: relative;
  padding: 26px 26px 22px 66px;
  border: 2.5px solid var(--ink);
  border-radius: 22px 22px 22px 8px;
  background-color: var(--paper-2);
  background-image:
    linear-gradient(90deg, transparent 46px, #f3b8aa 46px, #f3b8aa 48px, transparent 48px),
    repeating-linear-gradient(transparent 0, transparent 31px, var(--mline) 31px, var(--mline) 32px);
  background-position: 0 22px;
  box-shadow: 0 5px 0 rgb(47 42 36 / 0.1);
}

.tape {
  position: absolute;
  top: -13px;
  left: var(--tape-x);
  width: 96px;
  height: 24px;
  border-radius: 3px;
  background: var(--tape);
  opacity: 0.75;
  transform: rotate(var(--tape-rot));
}

.stamp {
  position: absolute;
  top: -16px;
  right: 18px;
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2.5px solid var(--ink);
  border-radius: 50%;
  font-size: 26px;
  transform: rotate(10deg);
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 12px;
  padding-right: 48px;
}

.title {
  font-family: var(--font-hand);
  font-weight: 400;
  font-size: 26px;
  line-height: 32px;
}

.time {
  font-weight: 800;
  font-size: 12px;
  color: var(--mute-3);
}

.body {
  margin-top: 2px;
  font-family: var(--font-hand);
  font-size: 20px;
  line-height: 32px;
  overflow-wrap: anywhere;
}

/* Baris baru di isi jurnal dipertahankan; spasi template di sekitar chip tidak ikut tampil. */
.seg {
  white-space: pre-wrap;
}

.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  background: var(--alt);
  color: var(--ink-2);
  font-family: var(--font-hand);
  font-size: 15px;
}

.delete {
  padding: 0;
  border: none;
  background: none;
  color: #c2381a;
  font-weight: 800;
  font-size: 12px;
}

@media (max-width: 599px) {
  .entry {
    padding: 24px 16px 18px 56px;
  }
}
</style>
