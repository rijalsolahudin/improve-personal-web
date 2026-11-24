<script setup lang="ts">
import {
  END_OF_DAY,
  TASK_TITLE_MAX,
  deadlineFrom,
  type Priority,
} from '@improve-personal/core/planner'

/** Tambah task cepat: judul + tanggal opsional (deadline 23:59) + prioritas. */
const { add } = useTasks()
const title = ref('')
const date = ref('')
const priority = ref<Priority>('medium')

function submit(): void {
  const deadline = date.value ? deadlineFrom(date.value, END_OF_DAY) : null
  if (add(title.value, priority.value, deadline) !== null) title.value = ''
}
</script>

<template>
  <form
    class="quick dot-grid"
    data-anchor="todo-quick"
    data-anchor-kind="content"
    @submit.prevent="submit"
  >
    <Input
      v-model="title"
      class="title"
      shape="pill"
      :maxlength="TASK_TITLE_MAX"
      :placeholder="$t('todo.quickPlaceholder')"
      :aria-label="$t('todo.quickLabel')"
    />
    <Input
      v-model="date"
      class="date"
      shape="pill"
      type="date"
      :aria-label="$t('todo.quickDate')"
    />
    <TodoPriorityPicker v-model="priority" :label="$t('priority.label')" />
    <Button type="submit" variant="primary" class="submit">{{ $t('todo.add') }}</Button>
  </form>
</template>

<style scoped>
.quick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-10);
  padding: var(--space-18) var(--space-20);
  border-radius: calc(28px * var(--rk));
  background-color: var(--primary);
  background-size: 20px 20px;
}

.title {
  flex: 1 1 220px;
}

.date {
  flex: 0 0 auto;
}

/* Design quick add: kolom tanggal & tombol Tambah lebih ringkas/pendek dari default Input/Button
   (tanggal 10px, tombol 46px). Awalan `.quick` supaya menang atas style komponen. */
.quick .date {
  padding: var(--space-10) var(--space-14);
}

.quick .submit {
  min-height: 46px;
}
</style>
