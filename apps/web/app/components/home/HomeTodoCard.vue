<script setup lang="ts">
import type { SegmentedOption } from '~/components/ui/UiSegmented.vue'
import type { HomeTask } from '~/composables/home/types'
import { PRIORITIES, TASK_TITLE_MAX, type Priority } from '~/utils/tasks'

const { tasks, now } = defineProps<{ tasks: HomeTask[]; now: number }>()
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
    <div class="head">
      <h2 id="home-todo-title" class="heading">{{ $t('home.todo.title') }}</h2>
      <NuxtLink :to="getFeature('to-do').path" class="link">
        <span class="wide">{{ $t('home.todo.seeAll') }}</span>
        <span class="narrow">{{ $t('home.all') }}</span>
      </NuxtLink>
    </div>

    <ul v-if="tasks.length" class="list">
      <HomeTaskRow
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        :now="now"
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
      <UiSegmented v-model="priority" :options="priorityOptions" :label="$t('priority.label')" />
      <button type="submit" class="add-btn">{{ $t('home.todo.add') }}</button>
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

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.heading {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 22px;
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

.input:focus-visible {
  box-shadow: 0 0 0 4px var(--soft);
}

.add-btn {
  padding: 13px 22px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--paper);
  font-weight: 800;
  font-size: var(--fs-body-lg);
}

@media (max-width: 599px) {
  .card {
    padding: 16px;
    border-radius: var(--radius-sticker);
  }

  .head {
    align-items: baseline;
    margin-bottom: 8px;
  }

  .heading {
    font-size: var(--fs-h2);
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
