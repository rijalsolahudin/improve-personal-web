<script setup lang="ts">
import type { StyleFamily, StyleName } from '@improve-personal/tokens'

import { familyOf, styleGroups, stylePreview } from '~/utils/appearancePreview'

/**
 * Pemilih gaya: tab keluarga (Cute / Klasik) lalu kartu gaya dengan preview mini. Tab dibuka di
 * keluarga gaya yang sedang aktif, supaya user langsung melihat pilihannya sendiri.
 */
const { active } = defineProps<{ active: StyleName }>()
const emit = defineEmits<{ select: [style: StyleName] }>()

const { t } = useI18n()

const groups = styleGroups()
const family = ref<StyleFamily>(familyOf(active))

const familyOptions = computed(() =>
  groups.map((group) => ({ value: group.family, label: t(`appearance.family.${group.family}`) })),
)
const cards = computed(() =>
  (groups.find((group) => group.family === family.value)?.styles ?? []).map((name) => ({
    name,
    preview: stylePreview(name),
    isOn: name === active,
  })),
)
</script>

<template>
  <div class="picker">
    <Segmented
      v-model="family"
      class="families"
      is-equal
      size="sm"
      :options="familyOptions"
      :label="$t('appearance.style')"
    />
    <div class="styles" :class="`styles-${family}`">
      <button
        v-for="card in cards"
        :key="card.name"
        type="button"
        class="style"
        :class="{ on: card.isOn }"
        :aria-pressed="card.isOn"
        @click="emit('select', card.name)"
      >
        <span class="stage" :class="{ patterned: card.preview.isPatterned }" aria-hidden="true">
          <span
            class="mock"
            :style="{
              borderRadius: card.preview.borderRadius,
              border: card.preview.border,
              boxShadow: card.preview.boxShadow,
            }"
          >
            <span
              class="glyph"
              :style="{ fontFamily: card.preview.fontFamily, fontWeight: card.preview.fontWeight }"
            >
              Aa
            </span>
            <span class="bar" :style="{ borderRadius: card.preview.borderRadius }" />
          </span>
        </span>
        <span class="style-name" :style="{ fontFamily: card.preview.fontFamily }">
          {{ $t(`uiStyle.${card.name}.label`) }}
        </span>
        <span class="style-desc">{{ $t(`uiStyle.${card.name}.desc`) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
}

.styles {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-8);
}

/* Tiga gaya Cute muat sebaris: dibandingkan berdampingan, bedanya justru paling halus. */
.styles-cute {
  grid-template-columns: repeat(3, 1fr);
}

.style {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: var(--space-6) var(--space-6) var(--space-10);
  border: calc(1.5px * var(--bk)) solid var(--line);
  border-radius: calc(14px * var(--rk));
  background: transparent;
  color: var(--ink);
  text-align: left;
}

.style:hover {
  background: var(--hover);
}

.style.on {
  border-color: var(--accent);
  background: var(--soft);
  color: var(--deeper);
}

.stage {
  display: grid;
  place-items: center;
  height: 56px;
  margin-bottom: var(--space-4);
  border-radius: calc(10px * var(--rk));
  background: var(--bg);
}

.stage.patterned {
  background-image:
    linear-gradient(var(--dash) 1px, transparent 1px),
    linear-gradient(90deg, var(--dash) 1px, transparent 1px);
  background-size: 10px 10px;
}

.mock {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 64%;
  padding: 6px 8px;
  background: var(--paper);
}

.glyph {
  font-size: var(--fs-16);
  line-height: 1;
  color: var(--ink);
}

.bar {
  width: 70%;
  height: 5px;
  background: var(--accent);
}

.style-name {
  padding: 0 var(--space-4);
  font-weight: var(--fw-body);
  font-size: var(--fs-15);
  line-height: 1.1;
}

.style-desc {
  padding: 0 var(--space-4);
  font-weight: var(--fw-medium);
  font-size: var(--fs-11);
  line-height: 1.3;
  /* `--mute-2` >= 6,97:1 di `--paper`, >= 5,33:1 di `--soft` (gaya terpilih) - QA #62. */
  color: var(--mute-2);
}
</style>
