<script setup lang="ts">
import { TASK_TITLE_MAX } from '~/utils/tasks'

/**
 * Task tertaut di modal jadwal. Task yang sudah tertaut bisa dicentang langsung; judul baru
 * ditampung di `pending` dan baru dibuat saat jadwal disimpan, karena jadwal baru belum punya id.
 */
const { scheduleId } = defineProps<{ scheduleId: string | null }>()
const pending = defineModel<string[]>('pending', { required: true })
/** Teks di kolom yang belum dikonfirmasi; form induk ikut menyimpannya saat jadwal disimpan. */
const title = defineModel<string>('title', { required: true })

const { tasks, toggle } = useTasks()
const linked = computed(() =>
  scheduleId === null ? [] : tasks.value.filter((task) => task.scheduleId === scheduleId),
)

function addPending(): void {
  const value = title.value.trim()
  if (!value) return
  pending.value = [...pending.value, value]
  title.value = ''
}

function removePending(index: number): void {
  pending.value = pending.value.filter((_, i) => i !== index)
}
</script>

<template>
  <Field :label="$t('calendar.linkedTasks')" is-group>
    <ul v-if="linked.length || pending.length" class="list">
      <li v-for="task in linked" :key="task.id" class="item" :class="{ done: task.done }">
        <Checkbox
          :checked="task.done"
          size="sm"
          :label="$t('common.toggleDone', { title: task.title })"
          @toggle="toggle(task.id)"
        />
        <span class="name">{{ task.title }}</span>
      </li>
      <!-- Judul pending boleh kembar, jadi key memakai posisi + judul. -->
      <li v-for="(item, index) in pending" :key="`${index}-${item}`" class="item">
        <span class="bullet" aria-hidden="true">+</span>
        <span class="name">{{ item }}</span>
        <button
          type="button"
          class="remove"
          :aria-label="$t('calendar.form.linkedRemove', { title: item })"
          @click="removePending(index)"
        >
          ×
        </button>
      </li>
    </ul>
    <div class="add">
      <Input
        v-model="title"
        class="add-input"
        :maxlength="TASK_TITLE_MAX"
        :placeholder="$t('calendar.form.linkedPlaceholder')"
        :aria-label="$t('calendar.form.linkedPlaceholder')"
        @keydown.enter.prevent="addPending"
      />
      <Button variant="soft" :disabled="!title.trim()" @click="addPending">
        {{ $t('calendar.form.linkedAdd') }}
      </Button>
    </div>
  </Field>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: var(--fw-strong);
  font-size: 14px;
}

.name {
  flex: 1;
  min-width: 0;
}

.done .name {
  text-decoration: line-through;
  opacity: 0.55;
}

.bullet {
  width: 20px;
  text-align: center;
  color: var(--mute-3);
}

.remove {
  padding: 0 6px;
  border: none;
  background: none;
  font-size: 18px;
  line-height: 1;
  color: var(--mute);
}

.remove:hover {
  color: var(--accent);
}

.add {
  display: flex;
  gap: 8px;
}

.add-input {
  flex: 1;
  min-width: 0;
}
</style>
