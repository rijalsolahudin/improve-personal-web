<script setup lang="ts">
import { TASK_TITLE_MAX } from '~/utils/tasks'
import { PRIORITY_VISIBLE_COUNT, type PriorityTask } from '~/utils/dailyRoutine'

/** Prioritas hari ini (PRD F12): Penting & Mendesak + urgent, tanpa batas; daftar panjang dilipat. */
const { priorities, now } = defineProps<{ priorities: readonly PriorityTask[]; now: number }>()
const emit = defineEmits<{
  toggle: [id: string]
  focus: [title: string]
  edit: [id: string]
  add: [title: string]
}>()

const draft = ref('')

function submit(): void {
  const title = draft.value.trim()
  if (!title) return
  emit('add', title)
  draft.value = ''
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
      <NuxtLink :to="getFeature('eisenhower').path" class="link" :title="$t('daily.prio.linkHint')">
        <span class="link-dot" aria-hidden="true" />{{ $t('daily.prio.link') }}
      </NuxtLink>
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

    <form class="add" @submit.prevent="submit">
      <span class="plus" aria-hidden="true">+</span>
      <Input
        v-model="draft"
        variant="bare"
        class="add-input"
        :maxlength="TASK_TITLE_MAX"
        :placeholder="$t('daily.prio.add')"
        :aria-label="$t('daily.prio.addLabel')"
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
.add {
  display: flex;
  /* Baseline, bukan center: tiap gaya memasangkan font `+` dan font tulisan tangan yang posisi
     glyph-nya di line box berbeda (Special Elite duduk tinggi), jadi center membuat `+` turun. */
  align-items: baseline;
  gap: var(--space-12);
  padding: var(--space-4) var(--space-14);
  border: var(--border-thin) dashed var(--dash);
  border-radius: var(--radius-pill);
}

.add:hover {
  border-color: var(--dash-2);
}

/* Wadah pill yang menandai fokus (a11y), bukan <input> di dalamnya. */
.add:focus-within {
  border-color: var(--outline);
  border-style: solid;
}

/* Indikator fokus sudah di `.add:focus-within`; ring input persegi di dalam pill dimatikan. */
.add-input:focus-visible {
  outline: none;
}

.plus {
  width: 22px;
  text-align: center;
  font-weight: var(--fw-strong);
  font-size: var(--fs-18);
  color: var(--accent);
}

.add-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  font-family: var(--font-hand);
  /* Patrick Hand hanya punya weight 400; input mewarisi `--fw-body` (700) → faux-bold. */
  font-weight: 400;
  font-size: var(--fs-hand-18);
  line-height: 32px;
}
</style>
