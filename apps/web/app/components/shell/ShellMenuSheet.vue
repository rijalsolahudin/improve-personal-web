<script setup lang="ts">
const emit = defineEmits<{ close: [] }>()

const route = useRoute()
const panel = useTemplateRef<HTMLElement>('panel')
const groups = (['utama', 'rencana', 'fokus', 'lainnya'] as const).map((group) => ({
  group,
  items: featuresInGroup(group),
}))

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  panel.value?.querySelector<HTMLElement>('a')?.focus()
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="scrim" aria-hidden="true" @click="emit('close')" />
  <div
    id="shell-menu"
    ref="panel"
    class="panel"
    role="dialog"
    aria-modal="true"
    :aria-label="$t('shell.menu')"
  >
    <section v-for="{ group, items } in groups" :key="group" class="group">
      <h2 class="group-title">{{ $t(`shell.group.${group}`) }}</h2>
      <div class="grid">
        <NuxtLink
          v-for="feature in items"
          :key="feature.id"
          :to="feature.path"
          class="item"
          :aria-current="route.path === feature.path ? 'page' : undefined"
          @click="emit('close')"
        >
          <UiAppIcon :glyph="feature.glyph" :color="feature.color" :size="38" />
          <span class="label">{{ $t(`feature.${feature.id}.label`) }}</span>
        </NuxtLink>
      </div>
    </section>
  </div>
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
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 14px 10px;
  background: var(--paper);
  border: var(--border-thick) solid var(--ink);
  border-radius: 28px;
  box-shadow: 0 8px 0 rgba(47, 42, 36, 0.15);
}

.group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-title {
  font-weight: 800;
  font-size: var(--fs-eyebrow);
  letter-spacing: var(--tracking-group);
  text-transform: uppercase;
  color: var(--mute-3);
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 2px 8px;
  border-radius: 18px;
  border: var(--border) solid transparent;
  color: var(--ink);
}

.item:hover {
  background: var(--hover);
  color: var(--ink);
}

.item[aria-current='page'] {
  background: var(--soft);
  border-color: var(--ink);
}

.label {
  font-weight: 800;
  font-size: 11px;
  line-height: 1.15;
  text-align: center;
}
</style>
