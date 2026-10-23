<script setup lang="ts">
import BackupExportCard from '~/components/features/io/BackupExportCard.vue'
import BackupImportCard from '~/components/features/io/BackupImportCard.vue'

/**
 * Halaman "Import & Export" (PRD F10, task T12 UI).
 *
 * Halaman ini tipis dengan sengaja: seluruh perilaku ada di `useBackupExport`/`useBackupImport` dan
 * `utils/io/*`, supaya alur export/import bisa diuji tanpa memasang halaman.
 *
 * Data yang diekspor adalah data LOKAL milik akun yang sedang login (IndexedDB terenkripsi). Berkas
 * hasil export adalah plaintext - peringatannya ada di kartu Export, bukan disembunyikan di dokumentasi.
 */
definePageMeta({ layout: 'dashboard' })

const { t } = useI18n()
useHead({ title: () => t('feature.import-export.label') })

const localData = useLocalData()

// Dibuka lebih awal supaya kegagalan kunci (perangkat terkunci / data tidak terbaca) terlihat sebelum
// user memilih berkas, bukan setelah menekan tombol.
onMounted(() => {
  void localData.ensure()
})

const localStatus = computed(() => localData.state.value.status)

const unavailableMessage = computed(() => {
  if (localStatus.value === 'locked') {
    return 'Kunci perangkat ini belum terbuka, jadi data belum bisa dibaca atau ditulis. Pulihkan dulu lewat halaman Akun, lalu kembali ke sini.'
  }
  if (localStatus.value === 'error') {
    return `Data lokal tidak bisa dibuka: ${localData.state.value.error ?? 'sebab tidak diketahui'}.`
  }
  return null
})
</script>

<template>
  <div class="io">
    <header class="hero">
      <h1 class="title">{{ $t('feature.import-export.label') }}</h1>
      <p class="lead">
        Simpan seluruh data ke satu berkas, atau pulihkan dari berkas backup yang pernah kamu unduh.
      </p>
    </header>

    <p v-if="unavailableMessage" class="notice" role="status" aria-live="polite">
      {{ unavailableMessage }}
    </p>

    <BackupExportCard />
    <BackupImportCard />
  </div>
</template>

<style scoped>
.io {
  display: grid;
  gap: 1rem;
  max-width: 46rem;
}

.hero {
  display: grid;
  gap: 0.35rem;
}

.title {
  margin: 0;
  font-size: 1.4rem;
}

.lead {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.8;
}

.notice {
  margin: 0;
  padding: 0.6rem 0.8rem;
  border-radius: 0.6rem;
  background: var(--prio-medium-bg);
  color: var(--prio-medium-fg);
  font-size: 0.85rem;
}
</style>
