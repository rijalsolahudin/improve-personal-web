<script setup lang="ts">
import {
  countByFilter,
  isOverdue,
  matchesFilter,
  sortTasks,
  type TaskFilter,
  type TaskSort,
} from '@improve-personal/core/planner'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.to-do.label') })

const now = useNow()
const { tasks, toggle } = useTasks()
const { focusOn } = useFocusTarget()

/**
 * Daftar dirender bertahap: DOM tidak boleh tumbuh sebanyak isi database.
 * Perpindahan filter/urutan mengembalikan lipatan ke awal supaya hasil baru tidak "melenyapkan"
 * baris yang sudah dimuat sebelumnya.
 */
const PAGE_SIZE = 100

/** Filter & urutan bertahan selama sesi (pindah halaman), bukan disimpan permanen. */
const filter = useState<TaskFilter>('todo-filter', () => 'semua')
const sort = useState<TaskSort>('todo-sort', () => 'deadline')
/** `undefined` = form tertutup; `null` = task baru. */
const editing = ref<string | null | undefined>(undefined)
const shownCount = ref(PAGE_SIZE)

const counts = computed(() => countByFilter(tasks.value, now.value))
const visible = computed(() =>
  sortTasks(
    tasks.value.filter((task) => matchesFilter(task, filter.value, now.value)),
    sort.value,
  ),
)
const shown = computed(() => visible.value.slice(0, shownCount.value))
const hiddenCount = computed(() => Math.max(0, visible.value.length - shown.value.length))

watch([filter, sort], () => {
  shownCount.value = PAGE_SIZE
})

const summary = computed(() =>
  t('todo.summary', {
    active: counts.value.semua,
    late: tasks.value.filter((task) => isOverdue(task, now.value)).length,
  }),
)
</script>

<template>
  <div class="todo">
    <header class="header" data-anchor="header" data-anchor-kind="header">
      <div>
        <h1 class="title">{{ $t('feature.to-do.label') }}</h1>
        <p class="summary">{{ summary }}</p>
      </div>
      <Button variant="primary" @click="editing = null">+ {{ $t('todo.new') }}</Button>
    </header>

    <TodoQuickAdd />
    <TodoToolbar v-model:filter="filter" v-model:sort="sort" :counts="counts" />

    <section
      class="list"
      data-anchor="todo-list"
      data-anchor-kind="content"
      :aria-label="$t('todo.listLabel')"
    >
      <ul v-if="shown.length" id="todo-rows" class="rows">
        <TodoRow
          v-for="task in shown"
          :key="task.id"
          :task="task"
          :now="now"
          @toggle="toggle(task.id)"
          @edit="editing = task.id"
          @focus="focusOn"
        />
      </ul>
      <p v-else class="empty">{{ $t('todo.empty') }}</p>
      <Button
        v-if="hiddenCount"
        variant="dashed"
        size="xs"
        class="more"
        aria-controls="todo-rows"
        @click="shownCount += PAGE_SIZE"
      >
        {{ $t('todo.more', { n: hiddenCount }) }}
      </Button>
    </section>

    <TodoForm v-if="editing !== undefined" :task-id="editing" @close="editing = undefined" />
  </div>
</template>

<style scoped>
.todo {
  display: flex;
  flex-direction: column;
  gap: var(--space-20);
  padding-bottom: var(--space-80);
}

.header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-16);
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-36);
  line-height: 1.1;
}

.summary {
  margin-top: var(--space-4);
  font-weight: var(--fw-body);
  font-size: var(--fs-16);
  color: var(--mute);
}

.list {
  padding: var(--space-8) var(--space-18);
  border: var(--border-thin) solid var(--line);
  border-radius: calc(28px * var(--rk));
  background: var(--paper);
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.more {
  margin: var(--space-10) 0;
}

.empty {
  padding: var(--space-28);
  text-align: center;
  font-weight: var(--fw-body);
  color: var(--mute);
}

@media (max-width: 599px) {
  .title {
    font-size: var(--fs-display-28);
  }

  .list {
    padding: var(--space-4) var(--space-14);
  }
}
</style>
