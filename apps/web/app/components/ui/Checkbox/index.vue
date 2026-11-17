<script setup lang="ts">
const {
  checked,
  label,
  size = 'lg',
} = defineProps<{
  checked: boolean
  label: string
  /** lg = 26px (default halaman lain), md = 22px (baris Daily), sm = 16px (baris rapat timeline). */
  size?: 'lg' | 'md' | 'sm'
}>()

const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    role="checkbox"
    class="checkbox"
    :class="`size-${size}`"
    :aria-checked="checked"
    :aria-label="label"
    @click.stop="emit('toggle')"
  >
    <Icon v-if="checked" name="check" :stroke="3" class="mark" />
  </button>
</template>

<style scoped>
.checkbox {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: var(--radius-check);
  border: var(--border) solid var(--outline);
  background: var(--paper);
  color: var(--paper);
  font-weight: var(--fw-strong);
  font-size: var(--fs-15);
}

.checkbox.size-md {
  width: 22px;
  height: 22px;
  border-radius: calc(8px * var(--rk)) calc(8px * var(--rk)) calc(8px * var(--rk))
    calc(3px * var(--rk));
  font-size: var(--fs-12);
}

.checkbox.size-sm {
  width: 16px;
  height: 16px;
  border-width: var(--border-thin);
  border-radius: calc(5px * var(--rk)) calc(5px * var(--rk)) calc(5px * var(--rk))
    calc(2px * var(--rk));
  font-size: var(--fs-11);
}

.checkbox[aria-checked='true'] {
  background: var(--success);
}

/*
 * Design: tanda centang "dicap" - muncul kecil & miring, sedikit melewati ukuran asli,
 * lalu diam. Hanya visual; tidak mengubah `aria-checked` atau tinggi kotak.
 */
/* Ikon mengikuti font-size varian (lg/md/sm), jadi ukurannya ikut skala checkbox. */
.mark {
  width: 1em;
  height: 1em;
  display: inline-block;
  animation: check-stamp 0.28s cubic-bezier(0.3, 1.3, 0.5, 1) both;
}

@keyframes check-stamp {
  from {
    opacity: 0;
    transform: scale(0.55) rotate(-10deg);
  }

  60% {
    opacity: 1;
    transform: scale(1.12) rotate(3deg);
  }

  to {
    transform: none;
  }
}
</style>
