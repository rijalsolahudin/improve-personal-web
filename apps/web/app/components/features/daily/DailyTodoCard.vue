<script setup lang="ts">
import type { TodayTask } from '~/utils/dailyRoutine'
import { TASK_TITLE_MAX } from '~/utils/tasks'
import { formatHourMinute, toIsoDate } from '~/utils/time'

/** To-do hari ini dalam satu daftar (selesai & belum digabung) + quick add (PRD F12). */
const { items, today } = defineProps<{
  items: readonly TodayTask[]
  /** Tanggal ISO hari ini, untuk menandai deadline hari sebelumnya. */
  today: string
}>()
const emit = defineEmits<{
  toggle: [id: string]
  focus: [title: string]
  edit: [id: string]
  add: [title: string]
}>()

const { t } = useI18n()
const { dayMonth } = useDateFormat()
const draft = ref('')

const doneCount = computed(() => items.filter(({ task }) => task.done).length)
const pct = computed(() => (items.length ? Math.round((doneCount.value / items.length) * 100) : 0))
/** Tanpa deadline → tanpa jam; deadline hari sebelumnya ikut tanggalnya. */
function deadlineMeta(deadline: number | null): string {
  if (deadline === null) return ''
  const time = formatHourMinute(deadline)
  return toIsoDate(new Date(deadline)) < today ? `${dayMonth(deadline)} · ${time}` : time
}

const rows = computed(() =>
  items.map(({ task, isOverdue }) => ({ task, isOverdue, meta: deadlineMeta(task.deadline) })),
)

function submit(): void {
  const title = draft.value.trim()
  if (!title) return
  emit('add', title)
  draft.value = ''
}
</script>

<template>
  <section class="card" aria-labelledby="daily-todo-title">
    <DailyCardHead
      class="card-head"
      icon="list-checks"
      color="--icon-todo"
      :title="$t('daily.todo.title')"
      title-id="daily-todo-title"
      :link-label="$t('daily.todo.link')"
      :link-to="getFeature('to-do').path"
      :pct="pct"
      :meta="t('daily.meta', { done: doneCount, total: items.length })"
    />
    <TodoLine
      v-for="{ task, isOverdue, meta } in rows"
      :key="task.id"
      :task="task"
      :meta="meta"
      :is-overdue="isOverdue"
      can-edit
      @toggle="emit('toggle', task.id)"
      @focus="emit('focus', $event)"
      @edit="emit('edit', task.id)"
    />
    <p v-if="!items.length" class="empty">{{ $t('daily.todo.empty') }}</p>
    <form class="add" @submit.prevent="submit">
      <span class="plus" aria-hidden="true">+</span>
      <input
        v-model="draft"
        class="add-input"
        :maxlength="TASK_TITLE_MAX"
        :placeholder="$t('daily.todo.add')"
        :aria-label="$t('daily.todo.addLabel')"
      />
    </form>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  padding: 16px 18px;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-card);
  background: var(--paper);
  box-shadow: var(--shadow-drop-sm);
}

.card-head {
  padding-bottom: 12px;
  border-bottom: var(--border-thin) dashed var(--dash);
}

.empty {
  padding: 14px 4px 4px;
  font-family: var(--font-hand);
  font-size: var(--fs-hand-body);
  color: var(--mute);
}

.add {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding: 8px 12px;
  border: var(--border-thin) dashed var(--dash-2);
  border-radius: var(--radius-row);
}

.add:focus-within {
  border-color: var(--outline);
  border-style: solid;
}

.plus {
  font-weight: var(--fw-strong);
  font-size: 18px;
  color: var(--accent);
}

.add-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  font-weight: var(--fw-body);
  font-size: var(--fs-body-sm);
}
</style>
