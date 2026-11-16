<script setup lang="ts">
import { TASK_TITLE_MAX } from '~/utils/tasks'
import { PRIORITY_VISIBLE_COUNT, type PriorityTask } from '~/utils/dailyRoutine'

/**
 * Prioritas hari ini (PRD F12): Penting & Mendesak + urgent, tanpa batas; daftar panjang dilipat.
 *
 * Tambah prioritas lewat tombol "+ Tambah" di kepala (seperti panel Kalender), bukan baris input
 * yang selalu terlihat: input baru muncul setelah tombol ditekan, lalu tetap terbuka untuk isian
 * berikutnya sampai Esc atau ditinggal kosong.
 */
const { priorities, now } = defineProps<{ priorities: readonly PriorityTask[]; now: number }>()
const emit = defineEmits<{
  toggle: [id: string]
  focus: [title: string]
  edit: [id: string]
  add: [title: string]
}>()

const draft = ref('')
const isAdding = ref(false)
const addForm = useTemplateRef<HTMLFormElement>('addForm')

async function startAdding(): Promise<void> {
  isAdding.value = true
  await nextTick()
  addForm.value?.querySelector('input')?.focus()
}

function stopAdding(): void {
  draft.value = ''
  isAdding.value = false
}

function submit(): void {
  const title = draft.value.trim()
  if (!title) return
  emit('add', title)
  draft.value = ''
}

/** Ditinggal kosong = batal; yang sudah diketik tidak dibuang hanya karena fokus pindah. */
function onBlur(): void {
  if (!draft.value.trim()) stopAdding()
}

const isExpanded = ref(false)
const hiddenCount = computed(() => Math.max(0, priorities.length - PRIORITY_VISIBLE_COUNT))
const visible = computed(() =>
  isExpanded.value ? priorities : priorities.slice(0, PRIORITY_VISIBLE_COUNT),
)
</script>

<template>
  <section class="prio" aria-labelledby="daily-prio-title">
    <div class="head">
      <div class="title-row">
        <AppIcon icon="target" color="--icon-countdown" :size="38" />
        <h2 id="daily-prio-title" class="title">{{ $t('daily.prio.title') }}</h2>
      </div>
      <div class="actions">
        <NuxtLink
          :to="getFeature('eisenhower').path"
          class="link"
          :title="$t('daily.prio.linkHint')"
        >
          <span class="link-dot" aria-hidden="true" />{{ $t('daily.prio.link') }}
        </NuxtLink>
        <Button
          variant="ghost"
          size="xs"
          class="add-btn"
          :aria-expanded="isAdding"
          aria-controls="daily-prio-add"
          @click="startAdding"
        >
          {{ $t('daily.prio.addButton') }}
        </Button>
      </div>
    </div>

    <ol v-if="priorities.length" id="daily-prio-list" class="list">
      <DailyPriorityRow
        v-for="(item, index) in visible"
        :key="item.task.id"
        :item="item"
        :index="index"
        :now="now"
        @toggle="emit('toggle', item.task.id)"
        @focus="emit('focus', $event)"
        @edit="emit('edit', item.task.id)"
      />
    </ol>
    <p v-else class="empty">{{ $t('daily.prio.empty') }}</p>

    <Button
      v-if="hiddenCount"
      variant="dashed"
      size="xs"
      class="more"
      aria-controls="daily-prio-list"
      :aria-expanded="isExpanded"
      @click="isExpanded = !isExpanded"
    >
      {{ isExpanded ? $t('daily.prio.less') : $t('daily.prio.more', { n: hiddenCount }) }}
    </Button>

    <form v-if="isAdding" id="daily-prio-add" ref="addForm" class="add" @submit.prevent="submit">
      <Input
        v-model="draft"
        variant="bare"
        class="add-input"
        :maxlength="TASK_TITLE_MAX"
        :placeholder="$t('daily.prio.add')"
        :aria-label="$t('daily.prio.addLabel')"
        @keydown.esc="stopAdding"
        @blur="onBlur"
      />
    </form>
  </section>
</template>

<style scoped>
.prio {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-10);
  padding: 0 2px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: var(--space-10);
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-h2);
  line-height: 1.1;
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--space-14);
}

.link {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  font-weight: var(--fw-strong);
  font-size: var(--fs-caption);
  white-space: nowrap;
}

.link-dot {
  width: 9px;
  height: 9px;
  border-radius: calc(3px * var(--rk));
  background: var(--icon-countdown);
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
  margin: 0;
  padding: 0;
  list-style: none;
}

.empty {
  padding: var(--space-14) var(--space-16);
  border: var(--border-thin) dashed var(--dash);
  border-radius: calc(20px * var(--rk));
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; paragraf mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-body);
  color: var(--mute);
}

.more {
  align-self: flex-start;
}
.add-btn {
  white-space: nowrap;
}

/* Bentuk sama dengan kartu prioritas: isian baru terlihat seperti baris yang akan muncul. */
.add {
  display: flex;
  padding: var(--space-6) var(--space-16);
  border: var(--border) solid var(--outline);
  border-radius: calc(18px * var(--rk));
  background: var(--paper);
}

/* Indikator fokus di wadah, bukan ring persegi input di dalamnya. */
.add:focus-within {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

.add-input:focus-visible {
  outline: none;
}

.add-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  font-weight: var(--fw-strong);
  font-size: var(--fs-15);
  line-height: 36px;
}
</style>
