<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.pomodoro.label') })

const now = useNow()
const pomodoro = usePomodoro()

const summary = computed(() => {
  const day = new Date(now.value).toDateString()
  const sessions = pomodoro.history.value.filter(
    (session) => session.status === 'selesai' && new Date(session.endedAt).toDateString() === day,
  ).length
  return t('pomodoro.summary', { sessions, minutes: pomodoro.focusMinutesToday.value })
})
</script>

<template>
  <div class="pomodoro">
    <header class="header" data-anchor="header" data-anchor-kind="header">
      <h1 class="title">{{ $t('feature.pomodoro.label') }}</h1>
      <p class="summary">{{ summary }}</p>
    </header>
    <div v-if="pomodoro.notice.value" class="notice" role="status">
      <span class="bell" aria-hidden="true">🔔</span>
      <span class="notice-text">{{ $t(`pomodoro.notice.${pomodoro.notice.value}`) }}</span>
      <Button variant="link" class="dismiss" @click="pomodoro.dismissNotice">
        {{ $t('common.close') }}
      </Button>
    </div>
    <div class="layout">
      <PomodoroTimer />
      <!-- Rail sticky terpisah dari kolom yang di-scroll: sticker di atasnya tidak terpotong. -->
      <div class="rail">
        <div class="side">
          <PomodoroSettings />
          <PomodoroHistory />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pomodoro {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 80px;
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

.notice {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-radius: calc(20px * var(--rk));
  background: var(--ink);
  color: var(--paper);
  font-weight: var(--fw-strong);
}

.bell {
  font-size: 20px;
}

.notice-text {
  flex: 1;
}

.notice {
  --btn-ink: var(--primary);
}

/* "Tutup" design: seukuran teks banner (16px), bukan 13px seperti link kecil Button. */
.notice :deep(.btn.dismiss) {
  font-size: 16px;
}

.layout {
  container-type: inline-size;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 20px;
}

.rail {
  flex: 1 1 300px;
  min-width: 0;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/*
 * Pengaturan & riwayat ikut sticky (design), hanya kalau berdampingan dengan timer
 * (timer 480 + gap 20 + kolom 300). Padding/margin negatif = lebar ring fokus.
 */
@container (min-width: 800px) {
  .rail {
    position: sticky;
    top: var(--gap-desktop);
    /* Di atas kolom tetangga: sticker yang ditempel di dalam panel boleh menjorok keluar. */
    z-index: 1;
  }

  .side {
    max-height: calc(100vh - 2 * var(--gap-desktop) + 12px);
    margin: -6px;
    padding: 6px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
}

@media (max-width: 599px) {
  .title {
    font-size: 28px;
  }
}
</style>
