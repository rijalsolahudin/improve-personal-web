<script setup lang="ts">
import {
  CHAPTER_TONE,
  ITEM_TONE,
  itemProgress,
  type ChapterStatus,
  type GoalItem,
} from '~/utils/goals'

/** Satu blok di detail goal: "Sepanjang goal" (`status` null) atau chapter bernomor. */
const {
  badge,
  title,
  sub,
  status = null,
  progress,
  items,
  isOpen,
  markLabel = null,
} = defineProps<{
  badge: string
  title: string
  sub: string
  status?: ChapterStatus | null
  progress: number
  items: GoalItem[]
  isOpen: boolean
  /** Label tombol tandai/batalkan selesai; null = tombol disembunyikan. */
  markLabel?: string | null
}>()

const emit = defineEmits<{
  toggle: []
  'toggle-item': [itemId: string]
  review: [action: 'extend' | 'shift' | 'close']
  mark: []
}>()

const bodyId = useId()
</script>

<template>
  <section class="section" :class="status ?? 'along'">
    <button
      type="button"
      class="head"
      :aria-expanded="isOpen"
      :aria-controls="bodyId"
      @click="emit('toggle')"
    >
      <span class="badge" aria-hidden="true">{{ badge }}</span>
      <span class="text">
        <span class="title-row">
          <span class="title">{{ title }}</span>
          <GoalChip v-if="status" :tone="CHAPTER_TONE[status]">
            {{ $t(`goals.chapterStatus.${status}`) }}
          </GoalChip>
          <GoalChip v-else tone="sand">{{ $t('goals.always') }}</GoalChip>
        </span>
        <span class="sub">{{ sub }}</span>
      </span>
      <span class="progress">
        <span class="pct">{{ progress }}%</span>
        <span class="bar" aria-hidden="true"><span :style="{ width: `${progress}%` }" /></span>
      </span>
      <span class="caret" aria-hidden="true">{{ isOpen ? '▴' : '▾' }}</span>
    </button>

    <div v-if="isOpen" :id="bodyId">
      <div v-if="status === 'terlewat'" class="review">
        <div class="review-text">
          <p class="review-title">{{ $t('goals.review.title', { n: progress }) }}</p>
          <p class="review-sub">{{ $t('goals.review.sub') }}</p>
        </div>
        <div class="review-actions">
          <button type="button" class="solid" @click="emit('review', 'extend')">
            {{ $t('goals.review.extend') }}
          </button>
          <button type="button" @click="emit('review', 'shift')">
            {{ $t('goals.review.shift') }}
          </button>
          <button type="button" @click="emit('review', 'close')">
            {{ $t('goals.review.close') }}
          </button>
        </div>
      </div>
      <ul class="items">
        <li
          v-for="item in items"
          :key="item.id"
          class="item"
          :class="{ done: item.kind === 'task' && item.done }"
        >
          <GoalChip class="kind" :tone="ITEM_TONE[item.kind]">{{
            $t(`goals.kind.${item.kind}`)
          }}</GoalChip>
          <span class="item-text">
            <span class="item-title">{{ item.title }}</span>
            <span class="item-meta">{{ item.meta }}</span>
          </span>
          <Checkbox
            v-if="item.kind === 'task'"
            :checked="item.done"
            :label="$t('goals.toggleTask', { title: item.title })"
            @toggle="emit('toggle-item', item.id)"
          />
          <span v-else class="rate" :class="item.kind">{{ itemProgress(item) }}%</span>
        </li>
        <li v-if="!items.length" class="item empty">{{ $t('goals.noItems') }}</li>
      </ul>
      <div v-if="markLabel" class="mark">
        <button type="button" @click="emit('mark')">{{ markLabel }}</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.section {
  padding: 18px 22px;
  border: var(--border) solid var(--line);
  border-radius: calc(28px * var(--rk));
  background: var(--paper);
}

.section.berjalan {
  border-color: var(--goal-solid);
}

.section.terlewat {
  border-color: #f3a99a;
}

.head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
}

.badge {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-leaf);
  background: #f2e4cc;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 18px;
}

.selesai .badge {
  background: var(--goal-solid);
  color: var(--paper);
}

.terlewat .badge {
  background: #e2445c;
  color: var(--paper);
}

.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 19px;
  line-height: 1.2;
}

.sub {
  font-weight: var(--fw-body);
  font-size: 13px;
  color: var(--mute);
}

.progress {
  width: clamp(70px, 18%, 140px);
  flex-shrink: 0;
}

.pct {
  display: block;
  text-align: right;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 18px;
  line-height: 1;
}

.bar {
  display: block;
  height: 8px;
  margin-top: 6px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--chip);
}

.bar > span {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--goal-solid);
}

.caret {
  width: 20px;
  text-align: center;
  font-weight: var(--fw-strong);
  font-size: 14px;
  color: var(--mute);
}

.review {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 14px;
  padding: 14px 16px;
  border-radius: calc(20px * var(--rk));
  background: #ffe9e3;
}

.review-text {
  flex: 1;
  min-width: 200px;
}

.review-title {
  font-weight: var(--fw-strong);
  font-size: 15px;
  color: #9a2a14;
}

.review-sub {
  font-weight: var(--fw-body);
  font-size: 13px;
  color: #a8573f;
}

.review-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.review-actions button {
  padding: 9px 14px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--paper);
  color: #c2381a;
  font-weight: var(--fw-strong);
  font-size: 13px;
}

.review-actions .solid {
  background: #c2381a;
  color: var(--paper);
}

.items {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 4px;
  border-top: var(--border-thin) dashed var(--line-2);
}

.item.empty {
  font-weight: var(--fw-body);
  font-size: 14px;
  color: var(--mute);
}

.kind {
  width: 62px;
  flex-shrink: 0;
  text-align: center;
}

.item-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.item-title {
  font-weight: var(--fw-strong);
  font-size: 15px;
}

.done .item-title {
  text-decoration: line-through;
  opacity: 0.55;
}

.item-meta {
  font-weight: var(--fw-body);
  font-size: 12px;
  color: var(--mute);
}

.rate {
  font-weight: var(--fw-strong);
  font-size: 14px;
}

.rate.habit {
  color: #2e6a26;
}

.rate.jadwal {
  color: #8a5a00;
}

.mark {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.mark button {
  padding: 8px 16px;
  border: var(--border-thin) solid var(--goal-tint);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--goal-text);
  font-weight: var(--fw-strong);
  font-size: 13px;
}
</style>
