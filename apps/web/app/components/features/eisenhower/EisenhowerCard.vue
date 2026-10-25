<script setup lang="ts">
import { isOverdue, type Task } from '~/utils/tasks'

/** Kartu task di kuadran: pegangan drag, centang, sisa waktu, titik prioritas, "▶ Fokus", keluarkan. */
const {
  task,
  now,
  isDragging = false,
} = defineProps<{
  task: Task
  now: number
  isDragging?: boolean
}>()
defineEmits<{ toggle: []; remove: []; focus: [title: string] }>()

const { t } = useI18n()
const formatTimeLeft = useTimeLeft()
const timeLeft = computed(() => (task.done ? t('time.done') : formatTimeLeft(task.deadline, now)))
</script>

<template>
  <li
    class="card hover-reveal"
    :class="{ done: task.done, dragging: isDragging }"
    :data-drop-item="task.id"
  >
    <span class="grip" data-drag-handle aria-hidden="true">⋮⋮</span>
    <Checkbox
      :checked="task.done"
      :label="$t('common.toggleDone', { title: task.title })"
      @toggle="$emit('toggle')"
    />
    <span class="text">
      <span class="title">{{ task.title }}</span>
      <span class="left" :class="{ overdue: isOverdue(task, now) }">{{ timeLeft }}</span>
    </span>
    <span
      class="prio"
      :style="{ background: `var(--prio-${task.priority}-fg)` }"
      :title="$t(`priority.${task.priority}`)"
    />
    <Button
      v-if="!task.done"
      variant="chip"
      size="xs"
      class="focus reveal"
      :aria-label="$t('daily.focusLabel', { title: task.title })"
      @click.stop="$emit('focus', task.title)"
    >
      {{ $t('daily.focus') }}
    </Button>
    <IconButton
      tone="muted"
      :size="26"
      :radius="9"
      class="remove"
      :title="$t('eisenhower.removeTask', { title: task.title })"
      @click="$emit('remove')"
    >
      ×
    </IconButton>
  </li>
</template>

<style scoped>
.card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 10px 6px;
  border: var(--border) solid var(--outline);
  border-radius: calc(16px * var(--rk)) calc(16px * var(--rk)) calc(16px * var(--rk))
    calc(6px * var(--rk));
  background: var(--paper);
  box-shadow: calc(3px * var(--sx)) calc(3px * var(--sy)) calc(3px * var(--sbl))
    var(--shadow-color, rgb(47 42 36 / 0.12));
  cursor: grab;
  user-select: none;
}

.card.dragging {
  /* 0.35 memudarkan judul di bawah AA. 0.7 masih jelas "terangkat" (plus kursor grab) dan
     teks `--ink` tetap >= 4,84:1 di `--paper` (QA #62). */
  opacity: 0.7;
}

.grip {
  padding: 4px 2px;
  color: var(--mute-3);
  font-weight: var(--fw-strong);
  cursor: grab;
  touch-action: none;
}

.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.title {
  font-weight: var(--fw-strong);
  font-size: 14px;
}

.done .title {
  text-decoration: line-through;
  /* `--mute-3` >= 5,38:1 di `--paper`; opacity 0.55 hanya ~3,2:1 (QA #62). */
  color: var(--mute-3);
}

.left {
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--mute);
}

.left.overdue {
  color: #c2381a;
}

.prio {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
}

/* Design kartu Eisenhower: pill "▶ Fokus" 26px, padding 0 10, teks 12px. Button xs sudah
   segitu; dikunci di sini supaya tidak ikut mengecil kalau primitif berubah. */
.card > .focus {
  min-height: 26px;
  padding: 0 10px;
  font-size: 12px;
}

/* Design: "×" 26px dengan glyph 14px (IconButton menurunkan font dari ukuran tombol → 11px)
   dan tinta redup, bukan aksen tema. */
.card > .remove {
  color: var(--mute-2);
  font-size: 14px;
}
</style>
