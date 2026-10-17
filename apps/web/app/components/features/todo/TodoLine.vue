<script setup lang="ts">
import type { Task } from '~/utils/tasks'

/**
 * Satu baris to-do (design Daily Routine): centang, judul, "▶ Fokus", edit, prioritas, info deadline.
 * Dipakai di kartu To-do Daily Routine dan di dalam kartu jadwal timeline Kalender.
 */
const {
  task,
  meta = '',
  isOverdue = false,
  isDense = false,
} = defineProps<{
  task: Task
  /** Info deadline di kanan, mis. "14:00". */
  meta?: string
  /** Deadline lewat: info deadline merah. */
  isOverdue?: boolean
  /** Versi rapat untuk di dalam kartu jadwal; tinggi = LINKED_ROW_PX (utils/calendarGrid). */
  isDense?: boolean
  /** Tampilkan tombol edit (buka form task). */
  canEdit?: boolean
}>()
const emit = defineEmits<{ toggle: []; focus: [title: string]; edit: [] }>()

const size = computed(() => (isDense ? 'sm' : 'md'))
</script>

<template>
  <div class="line hover-reveal" :class="{ done: task.done, dense: isDense }">
    <Checkbox
      :checked="task.done"
      :size="size"
      :label="$t('common.toggleDone', { title: task.title })"
      @toggle="emit('toggle')"
    />
    <span class="title">{{ task.title }}</span>
    <button
      v-if="!task.done"
      type="button"
      class="focus reveal"
      :aria-label="$t('daily.focusLabel', { title: task.title })"
      @click.stop="emit('focus', task.title)"
    >
      {{ $t('daily.focus') }}
    </button>
    <button
      v-if="canEdit"
      type="button"
      class="edit reveal"
      :aria-label="$t('daily.editLabel', { title: task.title })"
      @click.stop="emit('edit')"
    >
      <Icon name="pencil" :size="14" />
    </button>
    <PriorityBadge :level="task.priority" :size="size" />
    <span v-if="meta" class="meta" :class="{ overdue: isOverdue }">{{ meta }}</span>
  </div>
</template>

<style scoped>
.line {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 2px;
  border-bottom: var(--border-thin) solid var(--mline);
}

.dense {
  height: 28px;
  gap: 8px;
  padding: 0 2px;
}

.title {
  flex: 1;
  min-width: 0;
  font-weight: var(--fw-strong);
  font-size: var(--fs-body-sm);
  line-height: 1.25;
}

.dense .title {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.done .title {
  text-decoration: line-through;
  opacity: 0.55;
}

.meta {
  flex-shrink: 0;
  font-weight: var(--fw-strong);
  font-size: 11.5px;
  color: var(--mute-3);
  font-variant-numeric: tabular-nums;
}

.meta.overdue {
  color: var(--danger);
}

.focus {
  height: 26px;
  flex-shrink: 0;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--chip);
  color: var(--deep);
  font-weight: var(--fw-strong);
  font-size: 11.5px;
  white-space: nowrap;
}

.edit {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--chip);
  color: var(--deep);
}

.focus:hover,
.edit:hover {
  background: var(--hover);
}

.dense .focus {
  height: 20px;
  padding: 0 8px;
  font-size: 10.5px;
}
</style>
