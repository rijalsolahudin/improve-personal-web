<script setup lang="ts">
/**
 * Kartu "Penyimpanan" di halaman Akun (task #107).
 *
 * Menjawab dua pertanyaan user yang tidak kelihatan dari UI mana pun sebelumnya: berapa ruang
 * terpakai, dan apakah browser boleh menghapus data ini sendiri. Angka datang dari
 * `navigator.storage.estimate()`; status dari `persisted()` (lihat `utils/storage/durability.ts`).
 */
const { t } = useI18n()

const {
  persisted,
  isSupported,
  isLow,
  busy,
  ratio,
  percent,
  formattedUsage,
  formattedQuota,
  protect,
} = useStorageDurability()

const protectionLabel = computed(() => {
  if (persisted.value === null) return t('account.storage.protectionUnknown')
  return persisted.value ? t('account.storage.protectionOn') : t('account.storage.protectionOff')
})
</script>

<template>
  <article class="card">
    <h2 class="card-title">{{ t('account.storage.title') }}</h2>

    <template v-if="isSupported">
      <p class="row">
        <span class="label">{{ t('account.storage.usageLabel') }}</span>
        <span v-if="ratio !== null">
          {{
            t('account.storage.usageValue', {
              used: formattedUsage,
              total: formattedQuota,
              pct: percent,
            })
          }}
        </span>
        <span v-else class="muted">{{ t('account.storage.usageUnknown') }}</span>
      </p>

      <ProgressBar
        v-if="ratio !== null"
        :pct="percent"
        :color="isLow ? 'var(--danger, #b0283e)' : 'var(--accent, #2f6f4e)'"
        :height="8"
      />

      <p class="row">
        <span class="label">{{ t('account.storage.protectionLabel') }}</span>
        <span
          :class="['badge', persisted === true ? 'ok' : persisted === false ? 'warn' : 'muted']"
        >
          {{ protectionLabel }}
        </span>
      </p>

      <p class="hint">
        {{ persisted ? t('account.storage.protectedHint') : t('account.storage.unprotectedHint') }}
      </p>

      <p v-if="isLow" class="warning" role="status">{{ t('account.storage.nearFull') }}</p>

      <div class="actions">
        <Button
          v-if="persisted === false"
          variant="outline"
          size="sm"
          :disabled="busy"
          @click="protect"
        >
          {{ t('account.storage.protect') }}
        </Button>
        <NuxtLink class="backup-link" to="/app/import-export">
          {{ t('account.storage.backup') }}
        </NuxtLink>
      </div>
    </template>

    <p v-else class="hint">{{ t('account.storage.unsupported') }}</p>
  </article>
</template>

<style scoped>
.card {
  padding: 1rem;
  border: 1px solid #e6ded1;
  border-radius: 0.8rem;
  background: #fffdf8;
}

.card-title {
  margin: 0 0 0.6rem;
  font-size: 1rem;
}

.row {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  margin: 0.2rem 0;
  flex-wrap: wrap;
}

.label {
  min-width: 9rem;
}

.muted {
  color: var(--mute-2, #6b5e4b);
}

.badge {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
}

.badge.ok {
  background: #dff2e3;
  color: #1d6b34;
}

.badge.warn {
  background: #fff0c8;
  color: #8a5a00;
}

.badge.muted {
  background: #efe8db;
  color: #6b5e4b;
}

.hint {
  margin: 0.4rem 0;
  font-size: 0.85rem;
  opacity: 0.8;
}

.warning {
  margin: 0.5rem 0;
  padding: 0.4rem 0.6rem;
  border-radius: 0.5rem;
  background: #fff0c8;
  color: #8a5a00;
  font-size: 0.85rem;
}

.actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 0.6rem;
}

.backup-link {
  font-size: 0.85rem;
  color: inherit;
}
</style>
