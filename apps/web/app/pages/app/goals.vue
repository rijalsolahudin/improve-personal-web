<script setup lang="ts">
import type { GoalCategoryFilter, GoalStatusFilter } from '~/components/goal/GoalFilters.vue'

definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.goals.label') })

const route = useRoute()
const router = useRouter()
const { goals, today, setCover } = useGoals()
const { rememberSticker } = useDeco()

const status = ref<GoalStatusFilter>('aktif')
const category = ref<GoalCategoryFilter>('semua')
/** `null` = form tertutup; `{ id: null }` = goal baru. */
const form = ref<{ id: string | null } | null>(null)
const isPickingCover = ref(false)

const filtered = computed(() =>
  goals.value.filter(
    (goal) =>
      (status.value === 'semua' || goal.status === status.value) &&
      (category.value === 'semua' || goal.category === category.value),
  ),
)

// Goal terpilih ada di URL (`?id=`) supaya bisa dibuka langsung, mis. dari Home.
const selected = computed(() => {
  const id = route.query.id
  return filtered.value.find((goal) => goal.id === id) ?? filtered.value[0]
})

/** Di bawah lebar ini daftar & detail bertumpuk, jadi detail perlu di-scroll ke layar. */
const STACKED_QUERY = '(max-width: 859px)'
const detail = useTemplateRef<{ $el: HTMLElement }>('detail')

async function select(id: string): Promise<void> {
  await router.replace({ query: { ...route.query, id } })
  if (!window.matchMedia(STACKED_QUERY).matches) return
  await nextTick()
  detail.value?.$el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const summary = computed(() =>
  t('goals.summary', {
    active: goals.value.filter((goal) => goal.status === 'aktif').length,
    done: goals.value.filter((goal) => goal.status === 'selesai').length,
  }),
)

function onSaved(id: string): void {
  form.value = null
  // Goal baru/teredit harus kelihatan: buka semua filter lalu pilih goal itu.
  status.value = 'semua'
  category.value = 'semua'
  select(id)
}

function onCoverChosen(sid: string): void {
  if (selected.value) setCover(selected.value.id, sid)
  rememberSticker(sid)
  isPickingCover.value = false
}

function onCoverCleared(): void {
  if (selected.value) setCover(selected.value.id, null)
  isPickingCover.value = false
}
</script>

<template>
  <div class="goals">
    <header class="header" data-anchor="header" data-anchor-kind="header">
      <div>
        <h1 class="title">{{ $t('feature.goals.label') }}</h1>
        <p class="summary">{{ summary }}</p>
      </div>
      <Button variant="primary" @click="form = { id: null }">+ {{ $t('goals.new') }}</Button>
    </header>

    <GoalFilters v-model:status="status" v-model:category="category" />

    <div class="layout">
      <div class="list">
        <GoalListCard
          v-for="goal in filtered"
          :key="goal.id"
          :goal="goal"
          :today="today"
          :is-selected="goal.id === selected?.id"
          @select="select(goal.id)"
        />
        <p v-if="!filtered.length" class="empty">{{ $t('goals.empty') }}</p>
      </div>
      <GoalDetail
        v-if="selected"
        ref="detail"
        :key="selected.id"
        :goal="selected"
        :today="today"
        data-anchor="goal-detail"
        data-anchor-kind="content"
        @edit="form = { id: selected.id }"
        @pick-cover="isPickingCover = true"
      />
    </div>

    <GoalForm
      v-if="form"
      :goal-id="form.id"
      @close="form = null"
      @saved="onSaved"
      @deleted="form = null"
    />
    <LazyDecoPicker
      v-if="isPickingCover && selected"
      :title="$t('goals.coverTitle')"
      :current="selected.cover"
      :clear-label="selected.cover ? $t('goals.removeCover') : null"
      @choose="onCoverChosen"
      @clear="onCoverCleared"
      @close="isPickingCover = false"
    />
  </div>
</template>

<style scoped>
.goals {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-bottom: 80px;
}

.header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}

.title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 36px;
  line-height: 1.1;
}

.summary {
  margin-top: 4px;
  font-weight: 700;
  font-size: 16px;
  color: var(--mute);
}

.layout {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 24px;
}

.list {
  flex: 1 1 260px;
  min-width: 240px;
  max-width: 340px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty {
  padding: 24px;
  border: 2.5px dashed var(--dash-2);
  border-radius: 26px;
  text-align: center;
  font-weight: 700;
  color: var(--mute);
}

@media (max-width: 599px) {
  .goals {
    gap: 18px;
  }

  .title {
    font-size: 28px;
  }

  .list {
    max-width: none;
  }
}
</style>
