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
  isDaily = false,
} = defineProps<{
  task: Task
  /** Info deadline di kanan, mis. "14:00". */
  meta?: string
  /** Deadline lewat: info deadline merah. */
  isOverdue?: boolean
  /** Versi rapat untuk di dalam kartu jadwal; tinggi = LINKED_ROW_PX (utils/calendarGrid). */
  isDense?: boolean
  /** Baris kartu To-do Daily (design): checkbox 22px, judul 600, latar hover tanpa garis pemisah. */
  isDaily?: boolean
  /** Tampilkan tombol edit (buka form task). */
  canEdit?: boolean
}>()
const emit = defineEmits<{ toggle: []; focus: [title: string]; edit: [] }>()

const size = computed(() => {
  if (isDense) return 'sm'
  return isDaily ? 'md' : 'lg'
})
</script>

<template>
  <div class="line hover-reveal" :class="{ done: task.done, dense: isDense, daily: isDaily }">
    <Checkbox
      :checked="task.done"
      :size="size"
      :label="$t('common.toggleDone', { title: task.title })"
      @toggle="emit('toggle')"
    />
    <span class="title">{{ task.title }}</span>
    <Button
      v-if="!task.done"
      variant="chip"
      size="xs"
      class="focus reveal"
      :aria-label="$t('daily.focusLabel', { title: task.title })"
      @click.stop="emit('focus', task.title)"
    >
      {{ $t('daily.focus') }}
    </Button>
    <IconButton
      v-if="canEdit"
      tone="muted"
      :size="26"
      :radius="13"
      class="edit reveal"
      :title="$t('daily.editLabel', { title: task.title })"
      @click.stop="emit('edit')"
    >
      <Icon name="pencil" :size="14" />
    </IconButton>
    <PriorityBadge :level="task.priority" :size="size === 'lg' ? 'md' : 'sm'" />
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

/* Design kartu To-do Daily: baris selebar kartu (margin negatif), tanpa garis pemisah. */
.daily {
  gap: 12px;
  padding: 9px 8px;
  margin: 0 -8px;
  border-bottom: 0;
  border-radius: var(--radius-inner);
}

.daily:hover {
  background: var(--hover);
}

.title {
  flex: 1;
  min-width: 0;
  font-weight: var(--fw-strong);
  font-size: var(--fs-body-sm);
  line-height: 1.25;
}

.daily .title {
  font-weight: var(--fw-medium);
  font-size: 14.5px;
}

.dense .title {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.done .title {
  text-decoration: line-through;
  /* Baris ini juga dipakai di dalam kartu jadwal yang latarnya campuran warna kategori
     (`color-mix(--ev-solid 15%, --paper)`). `--mute-3` bisa jatuh ke 4,32:1 di sana, jadi pakai
     `--mute` yang terukur >= 4,89:1 pada seluruh campuran kategori (QA #62). */
  color: var(--mute);
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

.focus:hover,
.dense .focus {
  min-height: 20px;
  padding: 0 8px;
  font-size: 10.5px;
}

/* Design Daily memakai pill "▶ Fokus" 26px yang tidak mengecil saat hover. */
.daily .focus,
.daily .focus:hover {
  min-height: 26px;
  padding: 0 10px;
  font-size: 12px;
}
</style>
