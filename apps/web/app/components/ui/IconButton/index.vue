<script setup lang="ts">
const {
  size = 44,
  tone = 'paper',
  title = undefined,
  radius = undefined,
  type = 'button',
} = defineProps<{
  /** 44 = header mobile, 52 = kontrol timer, 56 = bell desktop. */
  size?: number
  tone?: 'paper' | 'soft' | 'chip' | 'bell' | 'plain' | 'bare' | 'danger'
  title?: string
  /** Override radius sudut (px). */
  radius?: number
  type?: 'button' | 'submit'
}>()

const style = computed(() => ({
  '--ib-size': `${size}px`,
  '--ib-radius': `${radius ?? (size >= 52 ? 18 : 16)}px`,
  '--ib-font': `${Math.round(size * 0.42)}px`,
}))
</script>

<template>
  <button
    :type="type"
    class="icon-btn"
    :class="`tone-${tone}`"
    :title="title"
    :aria-label="title"
    :style="style"
  >
    <slot />
  </button>
</template>

<style scoped>
.icon-btn {
  width: var(--ib-size);
  height: var(--ib-size);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-sizing: border-box;
  border: var(--border) solid var(--outline);
  border-radius: var(--ib-radius);
  font-family: var(--font-body);
  font-weight: var(--fw-strong);
  font-size: var(--ib-font);
  color: var(--ink);
}

.icon-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.tone-paper {
  background: var(--paper);
}

.tone-soft {
  background: var(--soft);
}

.tone-chip {
  background: var(--chip);
}

.tone-bell {
  background: var(--bell);
  border-color: var(--paper);
  box-shadow: 0 0 0 2px var(--bell-ring);
}

.tone-plain {
  border: none;
  background: var(--chip);
}

.tone-bare {
  border: none;
  background: var(--paper);
}

.tone-danger {
  border: none;
  background: #ffe1da;
  color: #c2381a;
}
</style>
