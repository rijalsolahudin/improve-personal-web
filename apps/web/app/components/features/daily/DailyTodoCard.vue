<script setup lang="ts">
import { TODAY_TASK_LIMIT, type TodayTask } from '~/utils/dailyRoutine'
import { TASK_TITLE_MAX, type Task } from '~/utils/tasks'
import { formatHourMinute, toIsoDate } from '~/utils/time'

/** To-do hari ini dalam satu daftar + quick add (PRD F12). */
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
const isExpanded = ref(false)

interface TodoRow {
  task: Task
  isOverdue: boolean
  meta: string
  isDone: boolean
}

interface TodoGroup {
  key: 'late' | 'today' | 'done'
  label: string
  /** Warna chip label; null = grup tanpa label (Hari ini). */
  tone: 'late' | 'done' | null
  rows: TodoRow[]
  /** Jumlah sebelum dilipat; label grup tetap menghitung semua. */
  total: number
}

/** Progres dari SELURUH to-do hari ini, bukan cuma baris yang sedang tampil. */
const doneCount = computed(() => items.filter(({ task }) => task.done).length)
const pct = computed(() => (items.length ? Math.round((doneCount.value / items.length) * 100) : 0))
/** Tanpa deadline → tanpa jam; deadline hari sebelumnya ikut tanggalnya. */
function deadlineMeta(deadline: number | null): string {
  if (deadline === null) return ''
  const time = formatHourMinute(deadline)
  return toIsoDate(new Date(deadline)) < today ? `${dayMonth(deadline)} · ${time}` : time
}

const rows = computed<TodoRow[]>(() =>
  items.map(({ task, isOverdue }) => ({
    task,
    isOverdue,
    meta: deadlineMeta(task.deadline),
    isDone: task.done,
  })),
)

/**
 * Design `todoGroups`: terlambat dulu, lalu yang belum selesai (tanpa label), selesai paling bawah
 * dengan label + jumlah. Murni presentasi dari props, urutan data tidak diubah.
 */
const groups = computed<TodoGroup[]>(() => {
  const late = rows.value.filter((row) => !row.isDone && row.isOverdue)
  const todayRows = rows.value.filter((row) => !row.isDone && !row.isOverdue)
  const done = rows.value.filter((row) => row.isDone)
  const all: TodoGroup[] = [
    {
      key: 'late',
      label: t('daily.todo.group.late'),
      tone: 'late',
      rows: late,
      total: late.length,
    },
    { key: 'today', label: '', tone: null, rows: todayRows, total: todayRows.length },
    {
      key: 'done',
      label: t('daily.todo.group.done'),
      tone: 'done',
      rows: done,
      total: done.length,
    },
  ]
  return all.filter((group) => group.rows.length > 0)
})

/** Daftar panjang dilipat seperti Prioritas (PRD F12), bukan dipotong diam-diam. */
const hiddenCount = computed(() => Math.max(0, items.length - TODAY_TASK_LIMIT))
const visibleRows = computed(() =>
  isExpanded.value ? rows.value : rows.value.slice(0, TODAY_TASK_LIMIT),
)
/** Grup tetap tampil, tetapi hanya baris yang lolos lipatan. */
const visibleGroups = computed(() => {
  const shown = new Set(visibleRows.value.map((row) => row.task.id))
  return groups.value
    .map((group) => ({ ...group, rows: group.rows.filter((row) => shown.has(row.task.id)) }))
    .filter((group) => group.rows.length > 0)
})

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
      bar-color="var(--icon-todo)"
      :meta="t('daily.meta', { done: doneCount, total: items.length })"
    />
    <div id="daily-todo-list" class="list">
      <div v-for="group in visibleGroups" :key="group.key" class="group">
        <p v-if="group.label" class="group-head">
          <span class="group-label" :class="group.tone">{{ group.label }}</span>
          <span class="group-count">{{ group.total }}</span>
        </p>
        <TodoLine
          v-for="row in group.rows"
          :key="row.task.id"
          :task="row.task"
          :meta="row.meta"
          :is-overdue="row.isOverdue"
          is-daily
          can-edit
          @toggle="emit('toggle', row.task.id)"
          @focus="emit('focus', $event)"
          @edit="emit('edit', row.task.id)"
        />
      </div>
    </div>
    <p v-if="!items.length" class="empty">{{ $t('daily.todo.empty') }}</p>
    <Button
      v-if="hiddenCount"
      variant="dashed"
      size="xs"
      class="more"
      aria-controls="daily-todo-list"
      :aria-expanded="isExpanded"
      @click="isExpanded = !isExpanded"
    >
      {{ isExpanded ? $t('daily.todo.less') : $t('daily.todo.more', { n: hiddenCount }) }}
    </Button>
    <form class="add" @submit.prevent="submit">
      <span class="plus" aria-hidden="true">+</span>
      <Input
        v-model="draft"
        variant="bare"
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

.group {
  padding-top: 12px;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 4px;
}

.group-label {
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  font-weight: var(--fw-strong);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* Warna grup mengikuti token prioritas (design: Terlambat = urgent, Selesai = low). */
.group-label.late {
  background: var(--prio-urgent-bg);
  color: var(--prio-urgent-fg);
}

.group-label.done {
  background: var(--prio-low-bg);
  color: var(--prio-low-fg);
}

.group-count {
  font-weight: var(--fw-strong);
  font-size: 11.5px;
  color: var(--mute-3);
}

.more {
  align-self: flex-start;
  margin-top: 8px;
}

.empty {
  padding: 8px 0;
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; paragraf mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-body);
  color: var(--mute);
}

.add {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  padding: 4px 14px;
  border: var(--border-thin) dashed var(--dash);
  border-radius: var(--radius-pill);
}

.add:hover {
  border-color: var(--dash-2);
}

/* Bidang input global tidak pakai outline saat fokus, jadi wadah ini yang menandakannya (a11y). */
.add:focus-within {
  border-color: var(--outline);
  border-style: solid;
}

.plus {
  width: 22px;
  text-align: center;
  font-weight: var(--fw-strong);
  font-size: 18px;
  color: var(--accent);
}

.add-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; input mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: 18px;
  line-height: 32px;
}
</style>
