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
  padding: 18px;
  border: 2px solid var(--line);
  border-radius: 28px;
  background: var(--paper);
}

.pool.over {
  border: 2px dashed var(--accent);
}

.title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 19px;
}

.hint {
  margin-bottom: 10px;
  font-weight: 700;
  font-size: 13px;
  color: var(--mute);
}

.items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--alt);
  cursor: grab;
  user-select: none;
}

.item.dragging {
  opacity: 0.35;
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
  font-weight: 800;
  font-size: 14px;
}

.left {
  font-weight: 700;
  font-size: 12px;
  color: var(--mute);
}

.left.overdue {
  color: #c2381a;
}

.grip {
  padding: 4px 2px;
  color: var(--mute-3);
  font-weight: 800;
  cursor: grab;
  touch-action: none;
}

.empty {
  font-weight: 700;
  font-size: 14px;
  color: var(--mute);
}

@media (max-width: 599px) {
  .pool {
    max-width: none;
  }
}
</style>
