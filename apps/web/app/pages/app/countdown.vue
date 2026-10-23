<script setup lang="ts">
import { COUNTDOWN_TITLE_MAX, groupCountdowns } from '~/utils/countdown'
import { isIsoDate } from '~/utils/time'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.countdown.label') })

const now = useNow()
const { countdowns, toggleArchive } = useCountdowns()

const groups = computed(() => groupCountdowns(countdowns.value, now.value))
const hero = computed(() => groups.value.upcoming[0] ?? null)
const upcoming = computed(() => groups.value.upcoming.slice(1))
const past = computed(() => groups.value.past)
const archived = computed(() => groups.value.archived)
const showArchive = ref(false)

/** `undefined` = form tertutup; `null` = momen baru. */
const editing = ref<string | null | undefined>(undefined)

/**
 * Prefill dari halaman Goal ("Buat countdown"): judul + tanggal target. Nilai query tidak
 * dipercaya; panjang judul dipotong dan tanggal harus ISO supaya form tetap valid.
 */
const route = useRoute()
const initial = computed(() => {
  const title = typeof route.query.title === 'string' ? route.query.title : ''
  const date = typeof route.query.date === 'string' ? route.query.date : ''
  if (!title && !date) return null
  return {
    ...(title ? { title: title.slice(0, COUNTDOWN_TITLE_MAX) } : {}),
    ...(isIsoDate(date) ? { date } : {}),
  }
})

const summary = computed(() =>
  hero.value
    ? t('countdown.summaryNext', {
        count: groups.value.upcoming.length,
        title: hero.value.countdown.title,
      })
    : t('countdown.summary', { count: groups.value.upcoming.length }),
)

function openEdit(id: string): void {
  editing.value = id
}
</script>

<template>
  <div class="countdown">
    <header class="header" data-anchor="header" data-anchor-kind="header">
      <div>
        <h1 class="title">{{ $t('feature.countdown.label') }}</h1>
        <p class="summary">{{ summary }}</p>
      </div>
      <Button variant="primary" @click="editing = null">+ {{ $t('countdown.new') }}</Button>
    </header>

    <CountdownHero
      v-if="hero"
      data-anchor="countdown-hero"
      data-anchor-kind="content"
      :view="hero"
      :now="now"
      @edit="openEdit(hero.countdown.id)"
    />

    <section class="group" data-anchor="countdown-upcoming" data-anchor-kind="content">
      <h2 class="group-title">{{ $t('countdown.upcomingTitle') }}</h2>
      <div v-if="upcoming.length" class="grid">
        <CountdownListCard
          v-for="view in upcoming"
          :key="view.countdown.id"
          :view="view"
          :now="now"
          @edit="openEdit(view.countdown.id)"
          @archive="toggleArchive(view.countdown.id)"
        />
      </div>
      <p v-else-if="!hero" class="empty">{{ $t('countdown.emptyUpcoming') }}</p>
    </section>

    <section
      v-if="past.length"
      class="group"
      data-anchor="countdown-past"
      data-anchor-kind="content"
    >
      <h2 class="group-title">{{ $t('countdown.pastTitle') }}</h2>
      <div class="grid">
        <CountdownListCard
          v-for="view in past"
          :key="view.countdown.id"
          :view="view"
          :now="now"
          @edit="openEdit(view.countdown.id)"
          @archive="toggleArchive(view.countdown.id)"
        />
      </div>
    </section>

    <div v-if="archived.length" class="archive">
      <Button variant="link" class="archive-toggle" @click="showArchive = !showArchive">
        {{
          $t(showArchive ? 'countdown.hideArchive' : 'countdown.showArchive', {
            n: archived.length,
          })
        }}
      </Button>
      <div v-if="showArchive" class="grid">
        <CountdownListCard
          v-for="view in archived"
          :key="view.countdown.id"
          :view="view"
          :now="now"
          @edit="openEdit(view.countdown.id)"
          @archive="toggleArchive(view.countdown.id)"
        />
      </div>
    </div>

    <CountdownForm
      v-if="editing !== undefined"
      :countdown-id="editing"
      :initial="editing === null ? initial : null"
      @close="editing = undefined"
      @saved="editing = undefined"
    />
  </div>
</template>

<style scoped>
.countdown {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding-bottom: 80px;
}

.header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 36px;
  line-height: 1.1;
}

.summary {
  margin-top: 4px;
  font-weight: var(--fw-body);
  font-size: 16px;
  color: var(--mute);
}

.group-title {
  margin-bottom: 12px;
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: 22px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
  gap: 14px;
}

.empty {
  padding: 22px;
  border: var(--border) dashed var(--dash-2);
  border-radius: var(--radius-hero);
  text-align: center;
  font-weight: var(--fw-body);
  color: var(--mute);
}

.archive .grid {
  margin-top: 12px;
}

@media (max-width: 599px) {
  .title {
    font-size: 28px;
  }
}
</style>
