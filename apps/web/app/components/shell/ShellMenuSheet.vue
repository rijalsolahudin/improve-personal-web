<script setup lang="ts">
const emit = defineEmits<{ close: [] }>()

const route = useRoute()
const groups = (['utama', 'rencana', 'fokus'] as const).map((group) => ({
  group,
  items: featuresInGroup(group),
}))
</script>

<template>
  <Sheet id="shell-menu" :title="$t('shell.menu')" @close="emit('close')">
    <div class="groups">
      <section v-for="{ group, items } in groups" :key="group" class="group">
        <h3 class="group-title">{{ $t(`shell.group.${group}`) }}</h3>
        <div class="grid">
          <NuxtLink
            v-for="feature in items"
            :key="feature.id"
            :to="feature.path"
            class="item"
            :aria-current="route.path === feature.path ? 'page' : undefined"
            @click="emit('close')"
          >
            <AppIcon :glyph="feature.glyph" :color="feature.color" :size="38" />
            <span class="label">{{ $t(`feature.${feature.id}.label`) }}</span>
          </NuxtLink>
        </div>
      </section>
    </div>
  </Sheet>
</template>

<style scoped>
.groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
