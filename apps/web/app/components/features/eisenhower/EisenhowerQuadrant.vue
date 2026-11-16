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
      <!-- Design v2: penanda kuadran = titik warna, bukan kotak ikon. Judul `<h2>` tetap
           satu-satunya teks penanda, jadi titik ini dekoratif (`aria-hidden`). -->
      <span class="quad-dot" aria-hidden="true" />
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
  gap: var(--space-10);
  padding: var(--space-18);
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
  gap: var(--space-12);
}

/* Titik warna kuadran (design v2): 12px bulat, warna solid kuadran. */
.quad-dot {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  border-radius: var(--radius-pill);
  background: var(--q-solid);
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
  font-size: var(--fs-display-20);
  line-height: 1.1;
}

.sub {
  font-weight: var(--fw-strong);
  font-size: var(--fs-12);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--q-text);
}

.count {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-22);
  color: var(--q-text);
}

.cards,
.picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
  margin: 0;
  padding: 0;
  list-style: none;
}

.add {
  padding: var(--space-10);
  border: var(--border) dashed color-mix(in srgb, var(--q-text) 33%, transparent);
  border-radius: var(--radius-btn-sq);
  background: none;
  color: var(--q-text);
  font-weight: var(--fw-strong);
  font-size: var(--fs-14);
}

.picker {
  gap: 2px;
  padding: var(--space-8);
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-row);
  background: var(--paper);
}

.pick {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-8) var(--space-10);
  border: none;
  border-radius: var(--radius-inner);
  background: none;
  font-weight: var(--fw-strong);
  font-size: var(--fs-14);
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
  font-size: var(--fs-12);
  color: var(--mute);
}

.pick-empty {
  padding: var(--space-8) var(--space-10);
  font-weight: var(--fw-body);
  font-size: var(--fs-13);
  color: var(--mute);
}
</style>
