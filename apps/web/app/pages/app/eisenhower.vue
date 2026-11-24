<script setup lang="ts">
import {
  QUADRANTS,
  tasksInQuadrant,
  unsortedTasks,
  type Quadrant,
} from '@improve-personal/core/planner'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.eisenhower.label') })

const now = useNow()
const { tasks, toggle, move, setQuadrant, clearDoneQuadrants } = useTasks()
const { focusOn } = useFocusTarget()

const isQuadrant = (zone: string): zone is Quadrant =>
  (QUADRANTS as readonly string[]).includes(zone)

// Zona "pool" = keluarkan dari matrix; zona kuadran = pindah/reorder di kuadran itu.
const { draggingId, overZone, start } = useZoneDrag((taskId, zone, index) => {
  move(taskId, isQuadrant(zone) ? zone : null, index)
})

const quadrants = computed(() =>
  QUADRANTS.map((quadrant) => ({ quadrant, tasks: tasksInQuadrant(tasks.value, quadrant) })),
)
const pool = computed(() => unsortedTasks(tasks.value))
</script>

<template>
  <div class="eisenhower">
    <header class="header" data-anchor="header" data-anchor-kind="header">
      <div>
        <h1 class="title">{{ $t('feature.eisenhower.label') }}</h1>
        <p class="summary">{{ $t('eisenhower.summary') }}</p>
      </div>
      <Button variant="outline" @click="clearDoneQuadrants">
        {{ $t('eisenhower.clearDone') }}
      </Button>
    </header>
    <div class="layout">
      <div class="matrix">
        <EisenhowerQuadrant
          v-for="item in quadrants"
          :key="item.quadrant"
          :quadrant="item.quadrant"
          :tasks="item.tasks"
          :pool="pool"
          :now="now"
          :is-over="overZone === item.quadrant"
          :dragging-id="draggingId"
          @toggle="toggle"
          @remove="(id) => setQuadrant(id, null)"
          @add="(id) => setQuadrant(id, item.quadrant)"
          @focus="focusOn"
          @drag="start"
        />
      </div>
      <EisenhowerPool
        :tasks="pool"
        :now="now"
        :is-over="overZone === 'pool'"
        :dragging-id="draggingId"
        @drag="start"
      />
    </div>
  </div>
</template>

<style scoped>
.eisenhower {
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

/* Design: CTA header padding 0 18 (primitif Button md 0 20). */
.header > .btn {
  padding: 0 var(--space-18);
}

.layout {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-20);
}

.matrix {
  flex: 999 1 560px;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: minmax(260px, auto);
  gap: var(--space-16);
}

@media (max-width: 599px) {
  .title {
    font-size: var(--fs-display-28);
  }

  .matrix {
    flex-basis: 100%;
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: auto;
  }
}
</style>
