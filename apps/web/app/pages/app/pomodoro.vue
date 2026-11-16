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
  gap: var(--space-20);
  padding-bottom: var(--space-80);
}

.title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-display-36);
  line-height: 1.1;
}

.summary {
  margin-top: var(--space-4);
  font-weight: var(--fw-body);
  font-size: var(--fs-16);
  color: var(--mute);
}

.notice {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  padding: var(--space-14) var(--space-18);
  border-radius: calc(20px * var(--rk));
  background: var(--ink);
  color: var(--paper);
  font-weight: var(--fw-strong);
}

.notice-text {
  flex: 1;
}

.notice {
  --btn-ink: var(--primary);
}

/* "Tutup" design: seukuran teks banner (16px), bukan 13px seperti link kecil Button. */
.notice :deep(.btn.dismiss) {
  font-size: var(--fs-16);
}

.layout {
  container-type: inline-size;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-20);
}

.rail {
  flex: 1 1 300px;
  min-width: 0;
}

.side {
  display: flex;
  flex-direction: column;
  gap: var(--space-16);
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
    margin: calc(-1 * var(--space-6));
    padding: var(--space-6);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
}

@media (max-width: 599px) {
  .title {
    font-size: var(--fs-display-28);
  }
}
</style>
