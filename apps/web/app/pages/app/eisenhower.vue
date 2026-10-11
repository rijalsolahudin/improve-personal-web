<script setup lang="ts">
import { QUADRANTS, tasksInQuadrant, unsortedTasks, type Quadrant } from '~/utils/tasks'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.eisenhower.label') })

const now = useNow()
const { tasks, toggle, setQuadrant, clearDoneQuadrants } = useTasks()

const isQuadrant = (zone: string): zone is Quadrant =>
  (QUADRANTS as readonly string[]).includes(zone)

// Zona "pool" = keluarkan dari matrix; zona kuadran = pindah ke kuadran itu.
const { draggingId, overZone, start } = useZoneDrag((taskId, zone) => {
  setQuadrant(taskId, isQuadrant(zone) ? zone : null)
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
  font-weight: 800;
  font-size: 36px;
  line-height: 1.1;
}

.summary {
  margin-top: 4px;
  font-weight: 700;
  font-size: 16px;
  color: var(--mute);
}

.layout {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 20px;
}

.matrix {
  flex: 999 1 560px;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: minmax(260px, auto);
  gap: 16px;
}

@media (max-width: 599px) {
  .title {
    font-size: 28px;
  }

  .matrix {
    flex-basis: 100%;
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: auto;
  }
}
</style>
