<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.home.label') })

const daily = useDailyRoutine()
const { focusOn: focus } = useFocusTarget()
/** Task yang sedang diedit; `null` = form tertutup. */
const editing = ref<string | null>(null)

const weather = computed({ get: () => daily.weather.value, set: daily.setWeather })
const next = computed(() => {
  const value = daily.nextSchedule.value
  return value
    ? {
        title: value.occurrence.schedule.title,
        start: value.occurrence.start,
        minutesUntil: value.minutesUntil,
      }
    : null
})
</script>

<template>
  <div class="daily">
    <DailyHeader
      v-model:weather="weather"
      data-anchor="header"
      data-anchor-kind="header"
      :now="daily.now.value"
      :focus-minutes="daily.focusMinutes.value"
      :habits="daily.habitProgress.value"
      :schedule-count="daily.scheduleCount.value"
      :progress="daily.progress.value"
    />
    <DailyNowStrip
      data-anchor="daily-now"
      data-anchor-kind="content"
      :current="daily.currentBlock.value"
      :next="next"
      @toggle-item="daily.toggleRoutineItem"
    />
    <DailyGoalReviewCard />
    <div class="columns">
      <div class="side">
        <DailyPriorityList
          class="prio"
          data-anchor="daily-prio"
          data-anchor-kind="content"
          :priorities="daily.priorities.value"
          :now="daily.now.value"
          @toggle="daily.toggleTask"
          @focus="focus"
          @edit="editing = $event"
        />
        <DailyTodoCard
          class="todo"
          data-anchor="daily-todo"
          data-anchor-kind="content"
          :items="daily.todayList.value"
          :today="daily.today.value"
          @toggle="daily.toggleTask"
          @focus="focus"
          @edit="editing = $event"
          @add="daily.addTodayTask"
        />
        <DailyHabitCard
          class="habit"
          data-anchor="daily-habit"
          data-anchor-kind="content"
          :habits="daily.habitsToday.value"
          :progress="daily.habitProgress.value"
          @toggle="daily.toggleHabit"
          @focus="focus"
        />
      </div>
      <DailySchedule
        class="schedule"
        data-anchor="daily-schedule"
        data-anchor-kind="content"
        :today="daily.today.value"
        :now="daily.now.value"
        :done="daily.schedulesDone.value"
        :total="daily.scheduleCount.value"
        @focus="focus"
      />
    </div>
    <LazyTodoForm v-if="editing" :task-id="editing" @close="editing = null" />
  </div>
</template>

<style scoped>
.daily {
  display: flex;
  flex-direction: column;
  gap: 26px;
  padding-bottom: 80px;
}

/* PRD F12: desktop = kolom widget + kalender hari ini di kolom lebar. */
.columns {
  display: grid;
  grid-template-columns: minmax(340px, 1fr) minmax(0, 1.35fr);
  align-items: start;
  gap: 32px;
}

.side {
  position: sticky;
  top: 20px;
  /* Di atas kolom tetangga: sticker yang ditempel di dalam panel boleh menjorok keluar. */
  z-index: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

@media (max-width: 1099px) {
  .columns {
    grid-template-columns: minmax(0, 1fr);
  }

  /* Urutan HP/tablet (PRD F12): Prioritas → To-do → Jadwal → Habit. */
  .side {
    display: contents;
  }

  .prio {
    order: 1;
  }

  .todo {
    order: 2;
  }

  .schedule {
    order: 3;
  }

  .habit {
    order: 4;
  }
}
</style>
