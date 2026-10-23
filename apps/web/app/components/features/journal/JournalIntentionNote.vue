<script setup lang="ts">
import type { Goal } from '~/utils/goals'
import type { Intention } from '~/utils/journal'

/** Satu kertas niat (design): nomor, centang, teks tulisan tangan, chip goal, hapus. */
const { intention, n, goal, look } = defineProps<{
  intention: Intention
  n: number
  goal: Pick<Goal, 'title' | 'category'> | null
  look: { bg: string; tape: string; rotate: number }
}>()
const emit = defineEmits<{ toggle: []; 'cycle-goal': []; remove: [] }>()

const goalStyle = computed(() =>
  goal
    ? { background: `var(--cat-${goal.category}-tint)`, color: `var(--cat-${goal.category}-text)` }
    : undefined,
)
</script>

<template>
  <li
    class="note"
    :class="{ done: intention.done }"
    :style="{ '--note-bg': look.bg, '--note-rot': `${look.rotate}deg` }"
  >
    <span class="tape" :style="{ background: look.tape }" aria-hidden="true" />
    <button type="button" class="note-main" :aria-pressed="intention.done" @click="emit('toggle')">
      <span class="note-head">
        <span class="num">{{ n }}</span>
        <span class="check" aria-hidden="true">{{ intention.done ? '✓' : '' }}</span>
      </span>
      <span class="note-text">{{ intention.text }}</span>
    </button>
    <span class="note-foot">
      <button
        type="button"
        class="goal"
        :class="{ empty: !goal }"
        :style="goalStyle"
        :title="$t('journal.goalCycle')"
        @click="emit('cycle-goal')"
      >
        {{ goal?.title ?? $t('journal.goalLink') }}
      </button>
      <button type="button" class="remove" @click="emit('remove')">{{ $t('memo.delete') }}</button>
    </span>
  </li>
</template>

<style scoped>
.note {
  position: relative;
  min-height: 140px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 14px 10px;
  border: var(--border) solid var(--outline);
  border-radius: calc(20px * var(--rk));
  background: var(--note-bg);
  box-shadow: calc(5px * var(--sx)) calc(5px * var(--sy)) calc(5px * var(--sbl))
    var(--shadow-color, rgb(47 42 36 / 0.18));
  transform: rotate(calc(var(--note-rot) * var(--bev)));
}

.note.done {
  background: #f3f9ef;
}

.tape {
  position: absolute;
  top: -10px;
  left: 50%;
  width: 56px;
  height: 18px;
  margin-left: -28px;
  opacity: 0.8;
  transform: rotate(-4deg);
}

.note-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  border: none;
  background: none;
  color: var(--ink);
  text-align: left;
}

.note-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.num {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 18px;
  line-height: 1;
  color: var(--deep);
}

.check {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border) solid var(--outline);
  border-radius: calc(8px * var(--rk)) calc(8px * var(--rk)) calc(8px * var(--rk))
    calc(3px * var(--rk));
  background: var(--paper);
  color: var(--paper);
  font-weight: var(--fw-strong);
  font-size: 13px;
}

.done .check {
  background: #3e8a32;
}

.note-text {
  font-family: var(--font-hand);
  font-size: 20px;
  line-height: 1.2;
  text-wrap: pretty;
}

.done .note-text {
  text-decoration: line-through;
  /* Latar kartu selesai `#f3f9ef`: `--mute-3` >= 5,30:1; opacity 0.6 hanya ~3,7:1 (QA #62). */
  color: var(--mute-3);
}

.note-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.goal {
  min-width: 0;
  overflow: hidden;
  padding: 3px 8px;
  border: 1.5px dashed transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  font-weight: var(--fw-strong);
  font-size: 11px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.goal.empty {
  border-color: var(--dash);
  color: var(--mute-3);
}

.remove {
  flex-shrink: 0;
  padding: 2px 4px;
  border: none;
  background: none;
  color: var(--mute-3);
  font-weight: var(--fw-strong);
  font-size: 12px;
}

.remove:hover {
  color: var(--danger);
}
</style>
