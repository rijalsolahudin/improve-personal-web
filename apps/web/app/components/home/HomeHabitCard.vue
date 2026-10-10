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
    <div class="head">
      <h2 id="home-habit-title" class="heading">{{ $t('home.habit.title') }}</h2>
      <NuxtLink :to="getFeature('habit').path" class="count">
        <span class="wide">{{
          $t('home.habit.done', { done: doneCount, total: habits.length })
        }}</span>
        <span class="narrow">
          {{ $t('home.habit.doneShort', { done: doneCount, total: habits.length }) }}
        </span>
      </NuxtLink>
    </div>
    <div class="tiles">
      <button
        v-for="habit in habits"
        :key="habit.id"
        type="button"
        class="tile"
        :class="{ done: habit.done }"
        :aria-pressed="habit.done"
        @click="emit('toggle', habit.id)"
      >
        <span
          class="mark"
          :style="{ background: habit.done ? habit.color : 'var(--icon-off)' }"
          aria-hidden="true"
        >
          {{ habit.done ? '✓' : '' }}
        </span>
        <span class="text">
          <span class="name">{{ habit.name }}</span>
          <span class="streak">
            <span class="wide">{{ $t('home.habit.streak', { n: habit.streakNow }) }}</span>
            <span class="narrow">{{ $t('home.habit.streakShort', { n: habit.streakNow }) }}</span>
          </span>
        </span>
      </button>
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

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 14px;
}

.heading {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 22px;
  white-space: nowrap;
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

.tile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: var(--border-thin) solid transparent;
  border-radius: 20px;
  background: var(--alt);
  text-align: left;
}

.tile.done {
  background: var(--success-soft);
  border-color: var(--success-line);
}

.mark {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-inner);
  color: var(--paper);
  font-weight: 800;
}

.text {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.name {
  font-weight: 800;
  font-size: var(--fs-body);
  line-height: 1.2;
}

.streak {
  font-weight: 700;
  font-size: var(--fs-caption);
  color: var(--mute);
}

@media (max-width: 599px) {
  .card {
    padding: 0;
    background: none;
    border: none;
  }

  .head {
    align-items: baseline;
    margin-bottom: 10px;
  }

  .heading {
    font-size: var(--fs-h2);
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

  .tile {
    width: 104px;
    flex-shrink: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    border-radius: var(--radius-card);
  }

  .mark {
    width: 38px;
    height: 38px;
    border-radius: var(--radius-leaf);
    font-size: 17px;
  }

  .text {
    gap: 8px;
  }

  .name {
    font-size: var(--fs-body-sm);
  }

  .streak {
    font-size: var(--fs-meta);
  }
}
</style>
