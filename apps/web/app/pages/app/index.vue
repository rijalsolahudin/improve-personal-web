<script setup lang="ts">
import { formatHourMinute } from '~/utils/time'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.home.label') })

const {
  now,
  nextSchedule,
  scheduleToday,
  stats,
  tasks,
  todayTasks,
  habits,
  habitsDone,
  goal,
  countdowns,
  memosToday,
  toggleTask,
  addTask,
  toggleHabit,
  saveMemo,
} = useHomeDashboard()
const pomodoro = usePomodoro()

const openTasks = computed(() => tasks.value.filter((task) => !task.done))
const pomodoroTargets = computed(() => [
  {
    id: 'schedule' as const,
    options: scheduleToday.value.map((item) => ({
      id: item.id,
      label: item.title,
      meta: formatHourMinute(item.startsAt),
      dot: 'var(--icon-todo)',
    })),
  },
  {
    id: 'task' as const,
    options: openTasks.value.map((task) => ({
      id: task.id,
      label: task.title,
      meta: t(`priority.${task.priority}`),
      dot: `var(--prio-${task.priority}-fg)`,
    })),
  },
])

function focusOnNextSchedule(): void {
  if (nextSchedule.value) pomodoro.setTarget(nextSchedule.value.title)
  pomodoro.start()
}
</script>

<template>
  <div class="home">
    <HomeHeader
      data-anchor="header"
      data-anchor-kind="header"
      :now="now"
      :schedule-count="scheduleToday.length"
      :open-task-count="openTasks.length"
    />
    <HomeWidgetGrid>
      <template #jadwal>
        <HomeNextSchedule :schedule="nextSchedule" :now="now" @focus="focusOnNextSchedule" />
      </template>
      <template #stats>
        <HomeStats
          :streak="stats.productiveStreak"
          :focus-minutes="stats.focusMinutes"
          :tasks-done="stats.tasksDone"
          :tasks-total="stats.tasksTotal"
          :tasks-percent="stats.tasksPercent"
        />
      </template>
      <template #todo>
        <HomeTodoCard :tasks="todayTasks" :now="now" @toggle="toggleTask" @add="addTask" />
      </template>
      <template #pomo>
        <HomePomodoroCard :target-groups="pomodoroTargets" />
      </template>
      <template #habit>
        <HomeHabitCard :habits="habits" :done-count="habitsDone" @toggle="toggleHabit" />
      </template>
      <template #goal>
        <HomeGoalCard v-if="goal" :goal="goal" />
      </template>
      <template #countdown>
        <HomeCountdownStrip :countdowns="countdowns" />
      </template>
      <template #memo>
        <HomeMemoCard :pages-today="memosToday.length" @save="saveMemo" />
      </template>
    </HomeWidgetGrid>
    <HomeLayoutControls />
  </div>
</template>

<style scoped>
/* Jarak antar widget diatur grid (padding bawah tiap sel); ruang bawah untuk FAB. */
.home {
  display: flex;
  flex-direction: column;
  gap: var(--gap-desktop);
  padding-bottom: 80px;
  container-type: inline-size;
}

@media (max-width: 599px) {
  .home {
    gap: var(--gap-mobile);
    padding-bottom: 56px;
  }
}
</style>
