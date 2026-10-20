<script setup lang="ts">
const { active = false, variant = 'filter' } = defineProps<{
  active?: boolean
  /**
   * filter = filter list bergaris tinta; soft = pick polos (tinta saat aktif);
   * pick = pilihan bergaris tipis, aktif bergaris tinta + latar `--chip-tint` (default soft);
   *   latar & garis saat tidak aktif bisa diganti lewat `--chip-bg` / `--chip-line`;
   * choice = pilihan polos latar chip, aktif accent (angka/hari di baris pengulangan).
   */
  variant?: 'filter' | 'soft' | 'pick' | 'choice'
}>()
</script>

<template>
  <button
    type="button"
    class="chip"
    :class="[`chip-${variant}`, { active }]"
    :aria-pressed="active"
  >
    <slot />
  </button>
</template>

<style scoped>
.chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-weight: var(--fw-strong);
  white-space: nowrap;
}

.chip-filter {
  min-height: 38px;
  padding: 0 14px;
  font-size: 14px;
  border: var(--border) solid var(--line);
  background: var(--paper);
  color: var(--mute-2);
}

.chip-filter.active {
  border-color: var(--outline);
  background: var(--accent);
  color: var(--paper);
}

.chip-soft {
  min-height: 36px;
  padding: 0 12px;
  font-size: 13px;
  border: none;
  background: var(--alt);
  color: var(--ink);
}

.chip-pick {
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  font-size: 13px;
  border: var(--border-thin) solid var(--chip-line, var(--line));
  background: var(--chip-bg, var(--paper));
  color: var(--ink);
}

.chip-pick.active {
  border-color: var(--outline);
  background: var(--chip-tint, var(--soft));
}

.chip-choice {
  justify-content: center;
  min-width: 28px;
  min-height: 36px;
  padding: 0 14px;
  font-size: 14px;
  border: none;
  background: var(--chip);
  color: var(--mute-2);
}

.chip-choice.active {
  background: var(--accent);
  color: var(--paper);
}

.chip-soft.active {
  background: var(--ink);
  color: var(--paper);
}
</style>
