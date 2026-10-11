<script setup lang="ts">
import { END_OF_DAY, TASK_TITLE_MAX, deadlineFrom, type Priority } from '~/utils/tasks'

/** Tambah task cepat: judul + tanggal opsional (deadline 23:59) + prioritas. */
const { add } = useTasks()
const title = ref('')
const date = ref('')
const priority = ref<Priority>('medium')

function submit(): void {
  const deadline = date.value ? deadlineFrom(date.value, END_OF_DAY) : null
  if (add(title.value, priority.value, deadline)) title.value = ''
}
</script>

<template>
  <form
    class="quick dot-grid"
    data-anchor="todo-quick"
    data-anchor-kind="content"
    @submit.prevent="submit"
  >
    <input
      v-model="title"
      class="field title"
      :maxlength="TASK_TITLE_MAX"
      :placeholder="$t('todo.quickPlaceholder')"
      :aria-label="$t('todo.quickLabel')"
    />
    <input v-model="date" class="field date" type="date" :aria-label="$t('todo.quickDate')" />
    <TodoPriorityPicker v-model="priority" :label="$t('priority.label')" />
    <Button type="submit" variant="primary">{{ $t('todo.add') }}</Button>
  </form>
</template>

<style scoped>
.quick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 18px 20px;
  border-radius: 28px;
  background-color: var(--primary);
  background-size: 20px 20px;
}

.field {
  min-width: 0;
  padding: 11px 14px;
  border: 2.5px solid var(--ink);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-weight: 700;
  font-size: 15px;
  outline: none;
}

.title {
  flex: 1 1 220px;
}

.date {
  flex: 0 0 auto;
  padding: 10px 14px;
}
</style>
