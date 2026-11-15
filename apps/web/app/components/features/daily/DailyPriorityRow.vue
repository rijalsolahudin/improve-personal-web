<script setup lang="ts">
import type { PriorityTask } from '~/utils/dailyRoutine'
import { isOverdue } from '~/utils/tasks'

/** Satu baris Prioritas Daily (PRD F12): nomor, judul, sisa waktu (kalau ada deadline). */
const { item, index, now } = defineProps<{ item: PriorityTask; index: number; now: number }>()
const emit = defineEmits<{ toggle: []; focus: [title: string]; edit: [] }>()

const { t } = useI18n()
const formatTimeLeft = useTimeLeft()

const task = computed(() => item.task)
/** Tanpa deadline baris meta tidak dirender (judul rata tengah); task selesai tetap menampilkan status selesai. */
const hasTimeLeft = computed(() => task.value.done || task.value.deadline !== null)
const timeLeft = computed(() =>
  task.value.done ? t('time.done') : formatTimeLeft(task.value.deadline, now),
)
</script>

<template>
  <li class="row hover-reveal" :class="{ done: task.done }">
    <span class="num" aria-hidden="true">{{ index + 1 }}</span>
    <div class="text">
      <span class="task-title">{{ task.title }}</span>
      <span v-if="hasTimeLeft" class="meta">
        <span class="left" :class="{ overdue: isOverdue(task, now) }">{{ timeLeft }}</span>
      </span>
    </div>
    <Button
      v-if="!task.done"
      variant="chip"
      size="xs"
      class="focus reveal"
      :aria-label="$t('daily.focusLabel', { title: task.title })"
      @click="emit('focus', task.title)"
    >
      {{ $t('daily.focus') }}
    </Button>
    <IconButton
      tone="muted"
      :size="32"
      :radius="16"
      class="edit reveal"
      :title="$t('daily.editLabel', { title: task.title })"
      @click="emit('edit')"
    >
      <Icon name="pencil" :size="16" />
    </IconButton>
    <Checkbox
      :checked="task.done"
      size="md"
      :label="$t('common.toggleDone', { title: task.title })"
      @toggle="emit('toggle')"
    />
  </li>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px 12px 16px;
  border: var(--border) solid var(--outline);
  border-radius: calc(20px * var(--rk)) calc(20px * var(--rk)) calc(20px * var(--rk))
    calc(7px * var(--rk));
  background: var(--paper);
  box-shadow: var(--shadow-drop-sm);
}

.num {
  width: 20px;
  flex-shrink: 0;
  text-align: center;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-h1);
  line-height: 1;
  color: var(--accent);
}

.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.task-title {
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  line-height: 1.25;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
}

.left {
  font-weight: var(--fw-strong);
  font-size: var(--fs-meta);
  color: var(--mute-3);
  font-variant-numeric: tabular-nums;
}

.left.overdue {
  color: var(--danger);
}

.done .num,
.done .text {
  /* opacity 0.55 memudarkan nomor (`--accent`) sampai ~2,3:1; token teks >= 5,38:1 (QA #62). */
  color: var(--mute-3);
}

.done .task-title {
  text-decoration: line-through;
  /* Warna diatur di `.done .text`; diulang di sini supaya aturan judul selesai tetap mandiri
     untuk penjaga CSS (QA #62). */
  color: var(--mute-3);
}

.row .focus {
  min-height: 32px;
  padding: 0 12px;
  font-size: var(--fs-caption);
}
</style>
