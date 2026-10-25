<script setup lang="ts">
import { PRIORITY_VISIBLE_COUNT, type PriorityTask } from '~/utils/dailyRoutine'

/** Prioritas hari ini (PRD F12): Penting & Mendesak + urgent, tanpa batas; daftar panjang dilipat. */
const { priorities, now } = defineProps<{ priorities: readonly PriorityTask[]; now: number }>()
const emit = defineEmits<{ toggle: [id: string]; focus: [title: string]; edit: [id: string] }>()

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
  </section>
</template>

<style scoped>
.prio {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 2px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
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
  gap: 6px;
  font-weight: var(--fw-strong);
  font-size: 12.5px;
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
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.empty {
  padding: 14px 16px;
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
</style>
