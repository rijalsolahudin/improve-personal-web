<script setup lang="ts">
import { themes as themeTokens, type ThemeName } from '@improve-personal/tokens'

import type { SegmentedOption } from '~/components/ui/Segmented/index.vue'
import { greetingPeriod } from '~/utils/time'

const { now, scheduleCount, openTaskCount } = defineProps<{
  now: number
  scheduleCount: number
  openTaskCount: number
}>()

const { t } = useI18n()
const { longDate, shortDate } = useDateFormat()
const { theme, themes, setTheme, cycleTheme } = useColorTheme()

const greeting = computed(() => t(`home.greeting.${greetingPeriod(new Date(now).getHours())}`))
const summary = computed(() =>
  t('home.summary', { date: longDate(now), schedules: scheduleCount, tasks: openTaskCount }),
)
const themeOptions = computed<SegmentedOption<ThemeName>[]>(() =>
  themes.map((name) => ({
    value: name,
    label: t(`theme.${name}`),
    swatch: themeTokens[name].primary,
  })),
)
const selectedTheme = computed({ get: () => theme.value, set: setTheme })
</script>

<template>
  <header class="header">
    <div class="titles">
      <p class="date-short">{{ shortDate(now) }}</p>
      <h1 class="greeting">
        <span class="wide">{{ $t('home.greetingWide', { greeting }) }}</span>
        <span class="narrow">{{ $t('home.greetingNarrow', { greeting }) }}</span>
      </h1>
      <p class="summary">{{ summary }}</p>
    </div>
    <div class="actions">
      <Segmented
        v-model="selectedTheme"
        class="wide-flex"
        :options="themeOptions"
        :label="$t('theme.label')"
        framed
      />
      <button
        type="button"
        class="theme-cycle narrow-flex"
        :aria-label="$t('theme.cycle', { theme: $t(`theme.${theme}`) })"
        @click="cycleTheme"
      >
        <span class="theme-dot" aria-hidden="true" />
      </button>
      <span class="bell" role="img" :aria-label="$t('home.notifications')">
        <span class="bell-shape" aria-hidden="true" />
      </span>
    </div>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px 20px;
}

.greeting {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--fs-h1-desktop);
  line-height: 1.1;
}

.summary {
  margin-top: 4px;
  font-weight: 700;
  font-size: 16px;
  color: var(--mute);
}

.date-short,
.narrow,
.narrow-flex {
  display: none;
}

.actions {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  max-width: 100%;
}

.bell {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
  background: var(--bell);
  border: var(--border-thick) solid var(--paper);
  box-shadow: 0 0 0 2px var(--bell-ring);
}

.bell-shape {
  width: 18px;
  height: 20px;
  border: var(--border) solid var(--ink);
  border-radius: 9px 9px 3px 3px;
}

.theme-cycle {
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: var(--radius-btn-sq);
  background: var(--paper);
  border: var(--border) solid var(--ink);
}

.theme-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--primary);
  border: 2px solid var(--ink);
}

@media (max-width: 599px) {
  .header {
    flex-wrap: nowrap;
    gap: 12px;
  }

  .titles {
    min-width: 0;
  }

  .date-short {
    display: block;
    font-weight: 700;
    font-size: 14px;
    color: var(--mute);
  }

  .greeting {
    font-size: var(--fs-h1);
    line-height: var(--lh-tight);
  }

  .wide,
  .actions .wide-flex,
  .summary {
    display: none;
  }

  .narrow {
    display: inline;
  }

  .narrow-flex {
    display: flex;
  }

  .actions {
    flex-wrap: nowrap;
    gap: 8px;
    flex-shrink: 0;
  }

  .bell {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-btn-sq);
    border-width: var(--border);
  }

  .bell-shape {
    width: 15px;
    height: 17px;
    border-radius: 8px 8px 3px 3px;
  }
}
</style>
