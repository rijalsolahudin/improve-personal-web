<script setup lang="ts">
/**
 * Penjelasan singkat E2EE untuk onboarding passkey.
 *
 * Urutannya sengaja berupa rantai sebab-akibat (terenkripsi -> kunci cuma di perangkat -> butuh cadangan),
 * supaya user paham KENAPA dialognya tidak bisa dilewati, bukan sekadar disuruh.
 */
const POINTS = ['encrypted', 'ownKey', 'passkey'] as const
</script>

<template>
  <ol class="points">
    <li v-for="(point, index) in POINTS" :key="point" class="point">
      <span class="step" aria-hidden="true">{{ index + 1 }}</span>
      <div>
        <p class="point-title">{{ $t(`account.passkeyOnboarding.e2ee.${point}.title`) }}</p>
        <p class="point-body">{{ $t(`account.passkeyOnboarding.e2ee.${point}.body`) }}</p>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.points {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  margin: 0;
  padding: var(--space-10);
  list-style: none;
  background: var(--surface-inset);
  border-radius: var(--radius-card);
}

.point {
  display: flex;
  gap: var(--space-7);
  align-items: flex-start;
}

.step {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--text-on-accent);
  font-weight: var(--fw-strong);
  font-size: var(--fs-body-sm);
}

.point-title {
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
}

.point-body {
  margin-top: var(--space-1);
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
}
</style>
