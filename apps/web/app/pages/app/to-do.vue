<script setup lang="ts">
import {
  countByFilter,
  isOverdue,
  matchesFilter,
  sortTasks,
  type TaskFilter,
  type TaskSort,
} from '~/utils/tasks'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.to-do.label') })

const now = useNow()
const { tasks, toggle } = useTasks()

// Filter & urutan bertahan selama sesi (pindah halaman), bukan disimpan permanen.
const filter = useState<TaskFilter>('todo-filter', () => 'semua')
const sort = useState<TaskSort>('todo-sort', () => 'deadline')
/** `undefined` = form tertutup; `null` = task baru. */
const editing = ref<string | null | undefined>(undefined)

const counts = computed(() => countByFilter(tasks.value, now.value))
const visible = computed(() =>
  sortTasks(
    tasks.value.filter((task) => matchesFilter(task, filter.value, now.value)),
    sort.value,
  ),
)
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
      <ul v-if="visible.length" class="rows">
        <TodoRow
          v-for="task in visible"
          :key="task.id"
          :task="task"
          :now="now"
          @toggle="toggle(task.id)"
          @edit="editing = task.id"
        />
      </ul>
      <p v-else class="empty">{{ $t('todo.empty') }}</p>
    </section>

    <TodoForm v-if="editing !== undefined" :task-id="editing" @close="editing = undefined" />
  </div>
</template>

<style scoped>
.todo {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 80px;
}

.header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 36px;
  line-height: 1.1;
}

.summary {
  margin-top: 4px;
  font-weight: var(--fw-body);
  font-size: 16px;
  color: var(--mute);
}

.list {
  padding: 8px 18px;
  border: var(--border-thin) solid var(--line);
  border-radius: calc(28px * var(--rk));
  background: var(--paper);
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.empty {
  padding: 28px;
  text-align: center;
  font-weight: var(--fw-body);
  color: var(--mute);
}

@media (max-width: 599px) {
  .title {
    font-size: 28px;
  }

  .list {
    padding: 4px 14px;
  }
}
</style>
