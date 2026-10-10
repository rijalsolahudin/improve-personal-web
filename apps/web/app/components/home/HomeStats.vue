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
    <div class="tile tile-soft">
      <span class="icon" aria-hidden="true"><span class="flame" /></span>
      <span class="value">{{ streak }}</span>
      <span class="label">
        <span class="long">{{ $t('home.stats.streakLong') }}</span>
        <span class="short">{{ $t('home.stats.streakShort') }}</span>
      </span>
    </div>
    <div class="tile tile-paper">
      <span class="icon" aria-hidden="true"><span class="focus-ring" /></span>
      <span class="value value-deep">
        {{ focusMinutes }}<span class="unit">{{ $t('home.stats.minutes') }}</span>
      </span>
      <span class="label">{{ $t('home.stats.focus') }}</span>
    </div>
    <div class="tile tile-primary">
      <span class="icon" aria-hidden="true">
        <span
          class="task-ring"
          :style="{ background: `conic-gradient(var(--accent) ${tasksPercent}%, var(--paper) 0)` }"
        >
          <span class="task-hole" />
        </span>
      </span>
      <span class="value value-deep">{{ tasksDone }}/{{ tasksTotal }}</span>
      <span class="label label-deeper">{{ $t('home.stats.tasks') }}</span>
    </div>
  </section>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(10px, 1.4vw, 18px);
}

/* Ukuran ikut lebar tile (container query) - sama seperti design desktop & mobile. */
.tile {
  container-type: inline-size;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(6px, 3.4cqi, 14px);
  padding: clamp(14px, 7cqi, 28px) clamp(14px, 7.5cqi, 30px);
  border-radius: clamp(20px, 4vw, 28px);
}

.tile-soft {
  background: var(--soft);
}

.tile-paper {
  background: var(--paper);
  border: var(--border) solid var(--line);
}

.tile-primary {
  background: var(--primary);
}

.icon {
  height: clamp(24px, 12cqi, 42px);
  display: flex;
  align-items: center;
}

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

.value {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(24px, 14cqi, 54px);
  line-height: 1;
  white-space: nowrap;
}

.value-deep {
  color: var(--deeper);
}

.unit {
  margin-left: 4px;
  font-size: 0.5em;
}

.label {
  font-weight: 800;
  font-size: clamp(13px, 5.6cqi, 19px);
  line-height: 1.25;
  color: var(--deep);
  text-wrap: pretty;
}

.label-deeper {
  color: var(--deeper);
}

.short {
  display: none;
}

@container (max-width: 110px) {
  .long {
    display: none;
  }

  .short {
    display: inline;
  }
}
</style>
