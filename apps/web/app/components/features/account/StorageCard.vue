<script setup lang="ts">
/**
 * Kartu "Penyimpanan" di halaman Akun (task #107).
 *
 * Menjawab dua pertanyaan user yang tidak kelihatan dari UI mana pun sebelumnya: berapa ruang
 * terpakai, dan apakah browser boleh menghapus data ini sendiri. Angka datang dari
 * `navigator.storage.estimate()`; status dari `persisted()` (lihat `utils/storage/durability.ts`).
 */
import { compactTombstones } from '~/utils/storage/compaction'

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
  refresh,
} = useStorageDurability()

const localData = useLocalData()
const cleaning = ref(false)
const cleaned = ref<number | null>(null)

/**
 * `current()` membaca variabel modul non-reaktif (`opened`), jadi ia TIDAK boleh dipakai untuk
 * memutuskan render: pada reload halaman Akun sesi dibuka setelah mount dan tombol tidak akan pernah
 * muncul (QA #109). Status `ready` di `useState` adalah sinyal reaktif yang benar.
 */
const canCompact = computed(() => localData.state.value.status === 'ready')

/**
 * Buang tombstone lokal >90 hari yang sudah terkirim (task #109). Batasnya sama dengan retensi
 * server; tombolnya hanya muncul kalau sesi data lokal sudah terbuka (adaptor tersedia).
 */
async function cleanTombstones(): Promise<void> {
  const session = localData.current()
  if (!session || cleaning.value) return

  cleaning.value = true
  try {
    cleaned.value = await compactTombstones(session.storage)
    await refresh()
  } finally {
    cleaning.value = false
  }
}

const protectionLabel = computed(() => {
  if (persisted.value === null) return t('account.storage.protectionUnknown')
  return persisted.value ? t('account.storage.protectionOn') : t('account.storage.protectionOff')
})
</script>

<template>
  <article class="card">
    <header class="card-head">
      <h2 class="card-title">{{ t('account.storage.title') }}</h2>
      <span
        v-if="isSupported"
        :class="['badge', persisted === true ? 'ok' : persisted === false ? 'warn' : 'muted']"
        :title="t('account.storage.protectionLabel')"
      >
        {{ t('account.storage.protectionLabel') }} {{ protectionLabel }}
      </span>
    </header>

    <template v-if="isSupported">
      <div class="usage">
        <p v-if="ratio !== null" class="usage-value">
          {{
            t('account.storage.usageValue', {
              used: formattedUsage,
              total: formattedQuota,
              pct: percent,
            })
          }}
        </p>
        <p v-else class="hint">{{ t('account.storage.usageUnknown') }}</p>
        <ProgressBar
          v-if="ratio !== null"
          :pct="percent"
          :color="isLow ? 'var(--danger)' : 'var(--accent)'"
          :height="8"
        />
      </div>

      <p v-if="persisted === false" class="hint">{{ t('account.storage.unprotectedHint') }}</p>
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
        <Button
          v-if="canCompact"
          variant="outline"
          size="sm"
          :title="t('account.storage.compactHint')"
          :disabled="busy || cleaning"
          @click="cleanTombstones"
        >
          {{ t('account.storage.compact') }}
        </Button>
        <NuxtLink class="backup-link" to="/app/import-export">
          {{ t('account.storage.backup') }}
        </NuxtLink>
      </div>

      <p v-if="cleaned !== null" class="hint" role="status">
        {{
          cleaned > 0
            ? t('account.storage.compactDone', { n: cleaned })
            : t('account.storage.compactNone')
        }}
      </p>
    </template>

    <p v-else class="hint">{{ t('account.storage.unsupported') }}</p>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  padding: var(--space-10);
  background: var(--surface-card);
  border: var(--border) solid var(--outline);
  border-radius: var(--radius-card);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
}

.card-title {
  font-family: var(--font-display);
  font-weight: var(--fw-display);
  font-size: var(--fs-h3);
}

.usage {
  display: grid;
  gap: var(--space-4);
}

.usage-value {
  font-weight: var(--fw-strong);
  font-size: var(--fs-body);
}

.badge {
  padding: var(--space-1) var(--space-5);
  border-radius: var(--radius-pill);
  font-size: var(--fs-caption);
  white-space: nowrap;
}

.badge.ok {
  background: var(--success-soft);
  color: var(--success);
}

.badge.warn {
  background: var(--prio-medium-bg);
  color: var(--prio-medium-fg);
}

.badge.muted {
  background: var(--chip);
  color: var(--mute-2);
}

.hint {
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
}

.warning {
  padding: var(--space-5) var(--space-8);
  border-radius: var(--radius-inner);
  background: var(--prio-medium-bg);
  color: var(--prio-medium-fg);
  font-size: var(--fs-body-sm);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-6);
}

.backup-link {
  color: var(--accent);
  font-weight: var(--fw-strong);
  font-size: var(--fs-caption);
}
</style>
