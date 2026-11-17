<script setup lang="ts">
import { isOverdue, type Task } from '~/utils/tasks'

/** Panel "Belum masuk matrix": sumber drag, juga zona drop untuk mengeluarkan dari matrix. */
const { tasks, now, isOver, draggingId } = defineProps<{
  tasks: Task[]
  now: number
  isOver: boolean
  draggingId: string | null
}>()
const emit = defineEmits<{ drag: [event: PointerEvent, id: string] }>()

const formatTimeLeft = useTimeLeft()
</script>

<template>
  <aside
    class="pool"
    :class="{ over: isOver }"
    data-drop-zone="pool"
    data-anchor="eisenhower-pool"
    data-anchor-kind="content"
    aria-labelledby="eisenhower-pool-title"
  >
    <h2 id="eisenhower-pool-title" class="title">{{ $t('eisenhower.poolTitle') }}</h2>
    <p class="hint">{{ $t('eisenhower.poolHint') }}</p>
    <ul class="items">
      <li
        v-for="task in tasks"
        :key="task.id"
        class="item"
        :class="{ dragging: task.id === draggingId }"
        :data-drop-item="task.id"
        @pointerdown="emit('drag', $event, task.id)"
      >
        <span
          class="dot"
          :style="{ background: `var(--prio-${task.priority}-fg)` }"
          aria-hidden="true"
        />
        <span class="text">
          <span class="item-title">{{ task.title }}</span>
          <span class="left" :class="{ overdue: isOverdue(task, now) }">
            {{ formatTimeLeft(task.deadline, now) }}
          </span>
        </span>
        <span class="grip" data-drag-handle aria-hidden="true">⋮⋮</span>
      </li>
      <li v-if="!tasks.length" class="empty">{{ $t('eisenhower.poolEmpty') }}</li>
    </ul>
  </aside>
</template>

<style scoped>
.pool {
  flex: 1 1 260px;
  min-width: 240px;
  max-width: 340px;
  padding: var(--space-18);
  border: var(--border-thin) solid var(--line);
  border-radius: calc(28px * var(--rk));
  background: var(--paper);
}

.pool.over {
  border: var(--border-thin) dashed var(--accent);
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-19);
}

.hint {
  margin-bottom: var(--space-10);
  font-weight: var(--fw-body);
  font-size: var(--fs-13);
  color: var(--mute);
}

.items {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  margin: 0;
  padding: 0;
  list-style: none;
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-10);
  padding: var(--space-10) var(--space-12);
  border-radius: calc(14px * var(--rk));
  background: var(--alt);
  cursor: grab;
  user-select: none;
}

.item.dragging {
  /* Lihat EisenhowerCard: 0.7 menjaga `--ink` >= 4,73:1 di `--alt` saat kartu diseret. */
  opacity: 0.7;
}

.dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
}

.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.item-title {
  font-weight: var(--fw-strong);
  font-size: var(--fs-14);
}

.left {
  font-weight: var(--fw-body);
  font-size: var(--fs-12);
  color: var(--mute);
}

.left.overdue {
  color: var(--danger);
}

.grip {
  padding: var(--space-4) 2px;
  color: var(--mute-3);
  font-weight: var(--fw-strong);
  cursor: grab;
  touch-action: none;
}

.empty {
  font-weight: var(--fw-body);
  font-size: var(--fs-14);
  color: var(--mute);
}

@media (max-width: 599px) {
  .pool {
    max-width: none;
  }
}
</style>
