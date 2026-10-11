<script setup lang="ts">
import type { SegmentedOption } from '~/components/ui/Segmented/index.vue'
import type { HomeTask } from '~/composables/home/types'
import { PRIORITIES, TASK_TITLE_MAX, type Priority } from '~/utils/tasks'

const { tasks, now } = defineProps<{ tasks: HomeTask[]; now: number }>()

const formatTimeLeft = useTimeLeft()
const emit = defineEmits<{
  toggle: [id: string]
  add: [title: string, priority: Priority]
}>()

const { t } = useI18n()
const draft = ref('')
const priority = ref<Priority>('urgent')
const priorityOptions = computed<SegmentedOption<Priority>[]>(() =>
  PRIORITIES.map((value) => ({ value, label: t(`priority.${value}`) })),
)

function submit(): void {
  if (!draft.value.trim()) return
  emit('add', draft.value, priority.value)
  draft.value = ''
}
</script>

<template>
  <section class="card" aria-labelledby="home-todo-title">
    <SectionHeader :title="$t('home.todo.title')" title-id="home-todo-title">
      <template #action>
        <NuxtLink :to="getFeature('to-do').path" class="link">
          <span class="wide">{{ $t('home.todo.seeAll') }}</span>
          <span class="narrow">{{ $t('home.all') }}</span>
        </NuxtLink>
      </template>
    </SectionHeader>

    <ul v-if="tasks.length" class="list">
      <TaskRow
        v-for="task in tasks"
        :key="task.id"
        :title="task.title"
        :priority="task.priority"
        :done="task.done"
        :meta="task.done ? $t('time.done') : formatTimeLeft(task.deadline, now)"
        :overdue="!task.done && task.deadline !== null && task.deadline < now"
        @toggle="emit('toggle', task.id)"
      />
    </ul>
    <p v-else class="empty">{{ $t('home.todo.empty') }}</p>

    <form class="quick-add" @submit.prevent="submit">
      <label class="visually-hidden" for="home-quick-add">{{ $t('home.todo.addLabel') }}</label>
      <input
        id="home-quick-add"
        v-model="draft"
        class="input"
        type="text"
        size="1"
        :maxlength="TASK_TITLE_MAX"
        :placeholder="$t('home.todo.placeholder')"
        autocomplete="off"
      />
      <Segmented v-model="priority" :options="priorityOptions" :label="$t('priority.label')" />
      <Button type="submit" variant="primary">{{ $t('home.todo.add') }}</Button>
    </form>
  </section>
</template>

<style scoped>
.card {
  padding: 26px 28px;
  background: var(--paper);
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-panel);
}

.link {
  font-weight: 800;
  font-size: var(--fs-body);
}

.narrow {
  display: none;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.empty {
  font-weight: 700;
  color: var(--mute);
}

.quick-add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.input {
  flex: 1 1 220px;
  min-width: 0;
  padding: 12px 18px;
  border: var(--border) solid var(--ink);
  border-radius: var(--radius-pill);
  background: var(--paper);
  font-weight: 700;
  font-size: var(--fs-body-lg);
  outline: none;
}

@media (max-width: 599px) {
  .card {
    padding: 16px;
    border-radius: var(--radius-sticker);
  }

  .link {
    font-size: var(--fs-caption);
  }

  .wide {
    display: none;
  }

  .narrow {
    display: inline;
  }

  .list {
    gap: 6px;
  }
}
</style>
