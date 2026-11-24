<script setup lang="ts">
import type { Task } from '@improve-personal/core/planner'

/** To-do yang tertaut ke jadwal, tampil di dalam kartu jadwal timeline (design). */
const { tasks } = defineProps<{ tasks: readonly Task[] }>()
const emit = defineEmits<{ toggle: [id: string]; focus: [title: string] }>()
</script>

<template>
  <ul class="todos">
    <li v-for="task in tasks" :key="task.id">
      <TodoLine
        :task="task"
        is-dense
        @toggle="emit('toggle', task.id)"
        @focus="emit('focus', $event)"
      />
    </li>
  </ul>
</template>

<style scoped>
.todos {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  flex-shrink: 1;
  min-height: 0;
  overflow: hidden;
  margin: 2px var(--space-32) var(--space-6) var(--space-8);
  padding: 3px var(--space-10);
  border-radius: calc(8px * var(--rk));
  background: var(--paper);
  list-style: none;
}

/* Garis pemisah per baris to-do; baris terakhir tanpa garis. */
.todos > li:last-child :deep(.line) {
  border-bottom: 0;
}
</style>
