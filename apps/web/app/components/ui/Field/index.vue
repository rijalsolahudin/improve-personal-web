<script setup lang="ts">
import { FIELD_ID_KEY } from '~/utils/field'

/**
 * Pembungkus kolom form: label huruf kapital kecil di atas kontrol.
 *
 * Satu kontrol (default): label menjadi `<label for>` dan id-nya dibagikan ke `Input` di dalam slot.
 * `isGroup`: untuk sekumpulan tombol (warna, emoji, hari) - label menamai `role="group"`.
 * Slot `action` untuk tautan kecil di kanan label (mis. "Pakai jam"); sengaja di luar `<label>`
 * supaya klik label tidak memicu tombol itu.
 */
const { label, isGroup = false } = defineProps<{
  label: string
  isGroup?: boolean
}>()

const id = useId()
const labelId = `${id}-label`

if (!isGroup) provide(FIELD_ID_KEY, id)
</script>

<template>
  <div
    class="field"
    :role="isGroup ? 'group' : undefined"
    :aria-labelledby="isGroup ? labelId : undefined"
  >
    <div class="head">
      <span v-if="isGroup" :id="labelId" class="label">{{ label }}</span>
      <label v-else :id="labelId" :for="id" class="label">{{ label }}</label>
      <slot name="action" />
    </div>
    <slot />
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.label {
  font-weight: var(--fw-strong);
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mute-2);
}
</style>
