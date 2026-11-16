<script setup lang="ts">
import { isOverdue, type Task } from '~/utils/tasks'

/**
 * Kartu task di kuadran: pegangan drag, centang, sisa waktu, titik prioritas, "▶ Fokus", keluarkan.
 *
 * "▶ Fokus" melayang di pojok kanan bawah kartu (absolute), bukan ikut baris: tombol hover-reveal
 * tetap memakan lebar walau transparan, dan di kuadran yang sempit lebar itu dulu memeras judul
 * jadi satu kata per baris.
 */
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
      <span class="meta">
        <span class="left" :class="{ overdue: isOverdue(task, now) }">{{ timeLeft }}</span>
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
      </span>
    </span>
    <span
      class="prio"
      :style="{ background: `var(--prio-${task.priority}-fg)` }"
      :title="$t(`priority.${task.priority}`)"
    />
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
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-10);
  padding: var(--space-10) var(--space-12) var(--space-10) var(--space-6);
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
  padding: var(--space-4) 2px;
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
  gap: 2px;
}

.title {
  font-weight: var(--fw-strong);
  font-size: var(--fs-14);
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.meta {
  display: flex;
  align-items: center;
}

.done .title {
  text-decoration: line-through;
  /* `--mute-3` >= 5,38:1 di `--paper`; opacity 0.55 hanya ~3,2:1 (QA #62). */
  color: var(--mute-3);
}

.left {
  font-weight: var(--fw-body);
  font-size: var(--fs-12);
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

/* Design kartu Eisenhower: pill "▶ Fokus" 22px, padding 0 10, teks 12px. Melayang di kiri kolom
   titik prioritas + "×" (48px dari kanan) supaya tidak menutupi keduanya saat muncul. */
.meta > .focus {
  position: absolute;
  right: 48px;
  bottom: var(--space-6);
  min-height: 22px;
  padding: 0 var(--space-10);
  font-size: var(--fs-12);
}

/* Design: "×" 26px dengan glyph 14px (IconButton menurunkan font dari ukuran tombol → 11px)
   dan tinta redup, bukan aksen tema. */
.card > .remove {
  color: var(--mute-2);
  font-size: var(--fs-14);
}
</style>
