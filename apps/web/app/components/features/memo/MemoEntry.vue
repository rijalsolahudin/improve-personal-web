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
}))
</script>

<template>
  <article class="entry" :style="style">
    <Tape :width="96" :top="-13" :left="`${tape.x}%`" :rotate="tape.rot" :color="tape.color" />
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
        /><MemoGoalMention
          v-else-if="segment.kind === 'goal-mention'"
          :goal-id="segment.goalId"
        /><span v-else class="seg">{{ segment.text }}</span></template
      >
    </p>
    <footer class="foot">
      <span class="tags">
        <span v-for="feeling in memo.feelings" :key="feeling" class="tag">#{{ feeling }}</span>
      </span>
      <Button variant="link-danger" @click="isConfirming ? $emit('remove') : (isConfirming = true)">
        {{ $t(isConfirming ? 'memo.deleteConfirm' : 'memo.delete') }}
      </Button>
    </footer>
  </article>
</template>

<style scoped>
/* Design v2 (`mm.entries`): halaman jurnal tersimpan = kertas diam, garis `--line` tipis
   tanpa bayangan keras. Stempel mood tetap 2.5px karena itu elemen dekoratif yang menonjol. */
.entry {
  position: relative;
  padding: var(--space-28) var(--space-28) var(--space-22) var(--space-64);
  border: var(--border-thin) solid var(--line);
  border-radius: calc(22px * var(--rk)) calc(22px * var(--rk)) calc(22px * var(--rk))
    calc(8px * var(--rk));
  background-color: var(--paper-2);
  background-image:
    linear-gradient(90deg, transparent 46px, #f3b8aa 46px, #f3b8aa 48px, transparent 48px),
    repeating-linear-gradient(transparent 0, transparent 31px, var(--mline) 31px, var(--mline) 32px);
  background-position: 0 22px;
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
  border: var(--border) solid var(--outline);
  border-radius: 50%;
  font-size: var(--fs-26);
  transform: rotate(10deg);
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-12);
  padding-right: var(--space-48);
}

.title {
  font-family: var(--font-hand);
  font-weight: 400;
  font-size: var(--fs-hand-26);
  line-height: 32px;
}

.time {
  font-weight: var(--fw-strong);
  font-size: var(--fs-12);
  color: var(--mute-3);
}

.body {
  margin-top: 2px;
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; paragraf mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-20);
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
  gap: var(--space-10);
  margin-top: var(--space-10);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-6);
}

.tag {
  padding: 2px var(--space-10);
  border-radius: var(--radius-pill);
  background: var(--alt);
  color: var(--ink-2);
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; tag mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-15);
}

@media (max-width: 599px) {
  .entry {
    padding: var(--space-24) var(--space-16) var(--space-18) var(--space-56);
  }
}
</style>
