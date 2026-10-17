<script setup lang="ts">
const { open = true, title = undefined } = defineProps<{
  open?: boolean
  title?: string
}>()

defineOptions({ inheritAttrs: false })

const emit = defineEmits<{ close: [] }>()

const panel = useTemplateRef<HTMLElement>('panel')

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  panel.value?.querySelector<HTMLElement>('a, button, input')?.focus()
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <template v-if="open">
    <div class="scrim" aria-hidden="true" @click="emit('close')" />
    <section
      ref="panel"
      v-bind="$attrs"
      class="panel"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <span class="grabber" aria-hidden="true" />
      <h2 v-if="title" class="title">{{ title }}</h2>
      <slot />
    </section>
  </template>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 96;
  background: var(--scrim);
}

.panel {
  position: fixed;
  left: 10px;
  right: 10px;
  bottom: 96px;
  z-index: 97;
  max-height: 70vh;
  overflow-y: auto;
  padding: 14px 14px 10px;
  background: var(--paper);
  border: var(--border-thick) solid var(--outline);
  border-radius: calc(28px * var(--rk));
  box-shadow: 0 8px 0 rgba(47, 42, 36, 0.15);
}

.grabber {
  display: block;
  width: 44px;
  height: 5px;
  margin: 0 auto 14px;
  border-radius: var(--radius-pill);
  background: var(--dash);
}

.title {
  margin-bottom: 12px;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 22px;
}
</style>
