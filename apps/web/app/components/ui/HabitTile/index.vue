<script setup lang="ts">
const {
  name,
  color = 'var(--icon-todo)',
  streakLabel,
  done = false,
} = defineProps<{
  name: string
  /** Warna habit, tampil hanya saat selesai. */
  color?: string
  streakLabel: string
  done?: boolean
}>()

defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    class="tile"
    :class="{ done }"
    :aria-pressed="done"
    @click="$emit('toggle')"
  >
    <span class="mark" :style="{ background: done ? color : 'var(--icon-off)' }" aria-hidden="true">
      {{ done ? '✓' : '' }}
    </span>
    <span class="text">
      <span class="name">{{ name }}</span>
      <span class="streak">{{ streakLabel }}</span>
    </span>
  </button>
</template>

<style scoped>
.tile {
  display: flex;
  align-items: center;
  gap: var(--space-10);
  padding: var(--space-12);
  border: var(--border-thin) solid transparent;
  border-radius: calc(20px * var(--rk));
  background: var(--alt);
  text-align: left;
}

.tile.done {
  background: var(--success-soft);
  border-color: var(--success-line);
}

.mark {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-inner);
  color: var(--paper);
  font-weight: var(--fw-strong);
}

.text {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.name {
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
  line-height: 1.2;
}

.streak {
  font-weight: var(--fw-body);
  font-size: var(--fs-caption);
  color: var(--mute);
}

@media (max-width: 599px) {
  .tile {
    width: 104px;
    flex-shrink: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-8);
    border-radius: var(--radius-card);
  }

  .mark {
    width: 38px;
    height: 38px;
    border-radius: var(--radius-leaf);
    font-size: var(--fs-17);
  }

  .text {
    gap: var(--space-8);
  }

  .name {
    font-size: var(--fs-body-sm);
  }

  .streak {
    font-size: var(--fs-meta);
  }
}
</style>
