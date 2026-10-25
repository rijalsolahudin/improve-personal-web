<script setup lang="ts">
import { QUADRANT_STYLE, type Quadrant, type Task } from '~/utils/tasks'

const { quadrant, tasks, pool, now, isOver, draggingId } = defineProps<{
  quadrant: Quadrant
  tasks: Task[]
  /** Task yang belum masuk matrix (pilihan "+ Tambah dari to-do"). */
  pool: Task[]
  now: number
  isOver: boolean
  draggingId: string | null
}>()
const emit = defineEmits<{
  toggle: [id: string]
  remove: [id: string]
  add: [id: string]
  focus: [title: string]
  drag: [event: PointerEvent, id: string]
}>()

const formatTimeLeft = useTimeLeft()
const style = computed(() => QUADRANT_STYLE[quadrant])
const isPicking = ref(false)
const pickerId = useId()

function add(id: string): void {
  emit('add', id)
  isPicking.value = false
}
</script>

<template>
  <section
    class="quadrant"
    :class="{ over: isOver }"
    :data-drop-zone="quadrant"
    :data-anchor="`eisenhower-${quadrant}`"
    data-anchor-kind="content"
    :style="{ '--q-bg': style.bg, '--q-solid': style.solid, '--q-text': style.text }"
    :aria-labelledby="`${pickerId}-title`"
  >
    <header class="head">
      <span class="tile" aria-hidden="true"
        ><span>{{ style.glyph }}</span></span
      >
      <span class="titles">
        <h2 :id="`${pickerId}-title`" class="title">{{ $t(`eisenhower.quadrant.${quadrant}`) }}</h2>
        <span class="sub">{{ $t(`eisenhower.sub.${quadrant}`) }}</span>
      </span>
      <span class="count">{{ tasks.length }}</span>
    </header>
    <ul v-if="tasks.length" class="cards">
      <!-- `v-if` bukan kosmetik: `<ul>` kosong tetap jadi flex item, jadi jarak header→"Tambah"
           dobel (10+10) dibanding design yang tidak merender daftar kosong. -->
      <EisenhowerCard
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        :now="now"
        :is-dragging="task.id === draggingId"
        @pointerdown="(event: PointerEvent) => emit('drag', event, task.id)"
        @toggle="emit('toggle', task.id)"
        @remove="emit('remove', task.id)"
        @focus="(title: string) => emit('focus', title)"
      />
    </ul>
    <button
      type="button"
      class="add"
      :aria-expanded="isPicking"
      :aria-controls="pickerId"
      @click="isPicking = !isPicking"
    >
      + {{ $t('eisenhower.addFromTodo') }}
    </button>
    <ul v-if="isPicking" :id="pickerId" class="picker">
      <li v-for="task in pool" :key="task.id">
        <button type="button" class="pick" @click="add(task.id)">
          <span
            class="dot"
            :style="{ background: `var(--prio-${task.priority}-fg)` }"
            aria-hidden="true"
          />
          <span class="pick-title">{{ task.title }}</span>
          <span class="pick-left">{{ formatTimeLeft(task.deadline, now) }}</span>
        </button>
      </li>
      <li v-if="!pool.length" class="pick-empty">{{ $t('eisenhower.poolAllIn') }}</li>
    </ul>
  </section>
</template>

<style scoped>
.quadrant {
  min-height: 260px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  border: var(--border-thick) dashed transparent;
  border-radius: calc(28px * var(--rk));
  background: var(--q-bg);
}

.quadrant.over {
  border-color: var(--q-text);
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tile {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-leaf);
  background: var(--q-solid);
  box-shadow: inset 0 calc(-3px * var(--bev)) 0 rgb(0 0 0 / 0.14);
}

.tile > span {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--border-thin) solid var(--outline);
  border-radius: calc(7px * var(--rk));
  background: var(--paper);
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 12px;
  transform: rotate(calc(-6deg * var(--bev)));
}

.titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 20px;
  line-height: 1.1;
}

.sub {
  font-weight: var(--fw-strong);
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--q-text);
}

.count {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 22px;
  color: var(--q-text);
}

.cards,
.picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.add {
  padding: 10px;
  border: var(--border) dashed color-mix(in srgb, var(--q-text) 33%, transparent);
  border-radius: var(--radius-btn-sq);
  background: none;
  color: var(--q-text);
  font-weight: var(--fw-strong);
  font-size: 14px;
}

.picker {
  gap: 2px;
  padding: 8px;
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-row);
  background: var(--paper);
}

.pick {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: none;
  border-radius: var(--radius-inner);
  background: none;
  font-weight: var(--fw-strong);
  font-size: 14px;
  text-align: left;
}

.pick:hover {
  background: var(--alt);
}

.dot {
  width: 9px;
  height: 9px;
  flex-shrink: 0;
  border-radius: 50%;
}

.pick-title {
  flex: 1;
  min-width: 0;
}

.pick-left {
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--mute);
}

.pick-empty {
  padding: 8px 10px;
  font-weight: var(--fw-body);
  font-size: 13px;
  color: var(--mute);
}
</style>
