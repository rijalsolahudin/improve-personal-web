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
        </span>
        <span class="sub">{{ sub }}</span>
      </span>
      <span class="progress">
        <span class="pct">{{ progress }}%</span>
        <span class="bar" aria-hidden="true"><span :style="{ width: `${progress}%` }" /></span>
      </span>
      <span class="caret" :class="{ open: isOpen }" aria-hidden="true">
        <Icon name="chevron-down" :size="18" />
      </span>
    </button>

    <div v-if="isOpen" :id="bodyId">
      <div v-if="status === 'terlewat'" class="review">
        <div class="review-text">
          <p class="review-title">{{ $t('goals.review.title', { n: progress }) }}</p>
          <p class="review-sub">{{ $t('goals.review.sub') }}</p>
        </div>
        <div class="review-actions">
          <Button variant="primary" size="sm" @click="emit('review', 'extend')">
            {{ $t('goals.review.extend') }}
          </Button>
          <Button variant="paper" size="sm" @click="emit('review', 'shift')">
            {{ $t('goals.review.shift') }}
          </Button>
          <Button variant="paper" size="sm" @click="emit('review', 'close')">
            {{ $t('goals.review.close') }}
          </Button>
        </div>
      </div>
      <ul class="items">
        <li
          v-for="item in items"
          :key="item.id"
          class="item"
          :class="{ done: item.kind === 'task' && item.done }"
        >
          <Checkbox
            v-if="item.kind === 'task'"
            size="md"
            :checked="item.done"
            :label="$t('goals.toggleTask', { title: item.title })"
            @toggle="emit('toggle-item', item.id)"
          />
          <span v-else class="marker" aria-hidden="true">
            <span class="dot" />
          </span>
          <span class="item-text">
            <span class="item-title">{{ item.title }}</span>
            <span class="item-meta">
              <GoalChip :tone="ITEM_TONE[item.kind]">{{ $t(`goals.kind.${item.kind}`) }}</GoalChip>
              <span class="item-meta-text">{{ item.meta }}</span>
            </span>
          </span>
          <span v-if="item.kind !== 'task'" class="rate">
            {{ itemProgress(item) === null ? '–' : `${itemProgress(item)}%` }}
          </span>
        </li>
        <li v-if="!items.length" class="item empty">{{ $t('goals.noItems') }}</li>
      </ul>
      <div v-if="markLabel" class="mark">
        <Button variant="outline" size="sm" @click="emit('mark')">{{ markLabel }}</Button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.section {
  padding: var(--space-18) var(--space-22);
  border: var(--border) solid var(--line);
  border-radius: calc(28px * var(--rk));
  background: var(--paper);
}

.section.terlewat {
  border-color: var(--danger);
}

.head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-14);
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
  background: var(--chip);
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-18);
}

.selesai .badge {
  background: var(--ink);
  color: var(--paper);
}

.terlewat .badge {
  background: var(--danger);
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
  gap: var(--space-8);
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-19);
  line-height: 1.2;
}

.sub {
  font-weight: var(--fw-body);
  font-size: var(--fs-13);
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
  font-size: var(--fs-display-18);
  line-height: 1;
}

.bar {
  display: block;
  height: 8px;
  margin-top: var(--space-6);
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
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  color: var(--mute);
  transition: transform var(--dur) var(--ease);
}

.caret.open {
  transform: rotate(180deg);
}

.review {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-14);
  margin-top: var(--space-14);
  padding: var(--space-14) var(--space-16);
  border: var(--border-thin) solid var(--danger);
  border-radius: calc(20px * var(--rk));
}

.review-text {
  flex: 1;
  min-width: 200px;
}

.review-title {
  font-weight: var(--fw-strong);
  font-size: var(--fs-15);
  color: var(--danger);
}

.review-sub {
  font-weight: var(--fw-body);
  font-size: var(--fs-13);
  color: var(--mute);
}

.review-actions {
  --btn-accent: var(--danger);
  --btn-ink: var(--danger);

  display: flex;
  flex-wrap: wrap;
  gap: var(--space-6);
}

.items {
  margin: var(--space-10) 0 0;
  padding: 0;
  list-style: none;
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  padding: var(--space-10) var(--space-4);
  border-top: var(--border-thin) dashed var(--line-2);
}

.item.empty {
  font-weight: var(--fw-body);
  font-size: var(--fs-14);
  color: var(--mute);
}

/* Kolom tanda kiri selebar checkbox (22px) supaya judul item task & habit/jadwal sejajar. */
.marker {
  width: 22px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--mute-2);
}

.item-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.item-title {
  font-weight: var(--fw-strong);
  font-size: var(--fs-15);
  line-height: 1.3;
}

.done .item-title {
  text-decoration: line-through;
  /* `--mute-3` >= 5,38:1 di `--paper`; opacity 0.55 hanya ~3,2:1 (QA #62). */
  color: var(--mute-3);
}

/* Chip jenis pindah ke baris meta di bawah judul (design v2), bukan kolom tetap di kiri. */
.item-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-8);
}

.item-meta :deep(.chip) {
  padding: 1px var(--space-8);
}

.item-meta-text {
  font-weight: var(--fw-body);
  font-size: var(--fs-13);
  color: var(--mute);
}

.rate {
  font-weight: var(--fw-strong);
  font-size: var(--fs-14);
  color: var(--ink);
}

.mark {
  --btn-line: var(--goal-tint);
  --btn-ink: var(--goal-text);

  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-8);
}
</style>
