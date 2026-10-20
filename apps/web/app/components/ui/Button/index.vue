<script setup lang="ts">
const {
  variant = 'primary',
  size = 'md',
  chunky = false,
  block = false,
  disabled = false,
  type = 'button',
} = defineProps<{
  /**
   * primary = pill accent; outline = paper bergaris tinta; soft = chip; dashed = affor "+";
   * ghost = teks accent; danger = aksi hapus; ink = pill tinta gelap; paper = pill kertas tanpa
   * garis (di atas latar berwarna); chip = pill kecil latar chip (aksi sekunder di baris, mis.
   * "▶ Fokus"); link / link-danger = teks tanpa padding/tinggi minimum.
   *
   * Warna bisa diikat ke tema pemanggil lewat custom property yang diwarisi:
   * `--btn-accent` (latar primary), `--btn-ink` (teks paper/outline), `--btn-line` (garis outline).
   */
  variant?:
    | 'primary'
    | 'outline'
    | 'soft'
    | 'dashed'
    | 'ghost'
    | 'danger'
    | 'ink'
    | 'paper'
    | 'chip'
    | 'link'
    | 'link-danger'
  /** xs = pill rapat di dalam baris/kartu. */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Garis 3px + drop keras, khusus CTA hero. */
  chunky?: boolean
  block?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>()
</script>

<template>
  <button
    :type="type"
    class="btn"
    :class="[`btn-${variant}`, `btn-${size}`, { chunky, block }]"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-sizing: border-box;
  border: none;
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-weight: var(--fw-strong);
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.btn-xs {
  min-height: 26px;
  padding: 0 10px;
  font-size: 12px;
}

.btn-sm {
  min-height: 36px;
  padding: 0 14px;
  font-size: 13px;
}

.btn-md {
  min-height: 44px;
  padding: 0 20px;
  font-size: 15px;
}

.btn-lg {
  min-height: 56px;
  padding: 0 28px;
  font-size: 18px;
}

.btn-primary {
  background: var(--btn-accent, var(--accent));
  color: var(--paper);
}

.btn-outline {
  background: var(--paper);
  color: var(--btn-ink, var(--ink));
  border: var(--border) solid var(--btn-line, var(--outline));
}

.btn-ink {
  background: var(--ink);
  color: var(--paper);
}

.btn-paper {
  background: var(--paper);
  color: var(--btn-ink, var(--ink-2));
}

.btn-chip {
  background: var(--chip);
  color: var(--deep);
}

.btn-chip:hover {
  background: var(--hover);
}

.btn-soft {
  background: var(--chip);
  color: var(--ink);
}

.btn-danger {
  background: transparent;
  color: var(--danger);
  border: var(--border-thin) solid #f3a99a;
}

.btn-dashed {
  background: var(--paper);
  color: var(--ink);
  border: var(--border) dashed var(--dash-2);
}

.btn-ghost {
  background: transparent;
  color: var(--accent);
}

.btn.btn-link,
.btn.btn-link-danger {
  min-height: 0;
  padding: 0;
  background: none;
  color: var(--btn-ink, var(--accent));
  font-size: 13px;
}

.btn.btn-link-danger {
  color: var(--danger);
}

.chunky {
  border: var(--border-thick) solid var(--outline);
  box-shadow: var(--shadow-press);
}

.block {
  width: 100%;
}
</style>
