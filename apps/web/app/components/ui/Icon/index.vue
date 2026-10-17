<script setup lang="ts">
import { iconElements, type IconName } from '~/utils/icons'

/** Ikon garis dekoratif; teks pendamping yang membawa makna, jadi selalu aria-hidden. */
const {
  name,
  size = 18,
  stroke = 2,
  isFilled = false,
} = defineProps<{
  name: IconName
  size?: number
  stroke?: number
  /** Isi bentuk dengan warna garis (mis. pip habit yang sudah tercapai). */
  isFilled?: boolean
}>()

const elements = computed(() => iconElements(name))
</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="isFilled ? 'currentColor' : 'none'"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <component
      :is="element.tag"
      v-for="element in elements"
      :key="element.key"
      v-bind="element.attrs"
    />
  </svg>
</template>

<style scoped>
.icon {
  flex-shrink: 0;
  display: block;
}
</style>
