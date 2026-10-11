<script setup lang="ts">
import type { HomeHabit } from '~/composables/home/types'

const { habits, doneCount } = defineProps<{
  habits: (HomeHabit & { streakNow: number })[]
  doneCount: number
}>()
const emit = defineEmits<{ toggle: [id: string] }>()
</script>

<template>
  <section class="card" aria-labelledby="home-habit-title">
    <SectionHeader :title="$t('home.habit.title')" title-id="home-habit-title">
      <template #action>
        <NuxtLink :to="getFeature('habit').path" class="count">
          <span class="wide">{{
            $t('home.habit.done', { done: doneCount, total: habits.length })
          }}</span>
          <span class="narrow">
            {{ $t('home.habit.doneShort', { done: doneCount, total: habits.length }) }}
          </span>
        </NuxtLink>
      </template>
    </SectionHeader>
    <div class="tiles">
      <HabitTile
        v-for="habit in habits"
        :key="habit.id"
        :name="habit.name"
        :color="habit.color"
        :streak-label="$t('home.habit.streak', { n: habit.streakNow })"
        :done="habit.done"
        @toggle="emit('toggle', habit.id)"
      />
    </div>
  </section>
</template>

<style scoped>
.card {
  padding: 24px 26px;
  background: var(--paper);
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-panel);
}

.count {
  font-weight: 800;
  font-size: var(--fs-body-sm);
  color: var(--mute);
}

.count:hover {
  color: var(--accent);
}

.narrow {
  display: none;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

@media (max-width: 599px) {
  .card {
    padding: 0;
    background: none;
    border: none;
  }

  .count {
    font-size: var(--fs-caption);
    color: var(--accent);
  }

  .wide {
    display: none;
  }

  .narrow {
    display: inline;
  }

  .tiles {
    display: flex;
    overflow-x: auto;
    margin: 0 -16px;
    padding: 0 16px 4px;
  }
}
</style>
