<script setup lang="ts">
const { streak, focusMinutes, tasksDone, tasksTotal, tasksPercent } = defineProps<{
  streak: number
  focusMinutes: number
  tasksDone: number
  tasksTotal: number
  tasksPercent: number
}>()
</script>

<template>
  <section class="stats" :aria-label="$t('home.stats.label')">
    <StatTile tone="soft" :value="streak" :label="$t('home.stats.streakLong')">
      <template #icon>
        <span class="flame" />
      </template>
    </StatTile>
    <StatTile
      tone="paper"
      :value="focusMinutes"
      :unit="$t('home.stats.minutes')"
      :label="$t('home.stats.focus')"
    >
      <template #icon>
        <span class="focus-ring" />
      </template>
    </StatTile>
    <StatTile
      tone="primary"
      :value="`${tasksDone}/${tasksTotal}`"
      :label="$t('home.stats.tasks')"
    >
      <template #icon>
        <span
          class="task-ring"
          :style="{ background: `conic-gradient(var(--accent) ${tasksPercent}%, var(--paper) 0)` }"
        >
          <span class="task-hole" />
        </span>
      </template>
    </StatTile>
  </section>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(10px, 1.4vw, 18px);
}

/* Ukuran ikut lebar tile (container query) - sama seperti design desktop & mobile. */
.flame {
  width: clamp(13px, 6cqi, 20px);
  aspect-ratio: 7 / 9;
  background: var(--streak);
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
}

.focus-ring {
  width: clamp(15px, 7cqi, 24px);
  aspect-ratio: 1;
  border: 3px solid var(--accent);
  border-radius: 50%;
}

.task-ring {
  height: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.task-hole {
  width: 62%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--primary);
}
</style>
