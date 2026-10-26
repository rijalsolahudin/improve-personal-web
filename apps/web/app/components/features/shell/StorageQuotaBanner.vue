<script setup lang="ts">
/**
 * Banner kuota penuh di shell (task #108).
 *
 * Muncul hanya setelah ada tulisan yang gagal karena `QuotaExceededError` - bukan saat pemakaian
 * mendekati batas (itu tugas kartu Penyimpanan, yang bersifat informatif). Isinya sengaja pendek:
 * apa yang terjadi, jalan keluar (backup), dan tombol tutup. Input user tidak dihapus di sini;
 * masing-masing fitur tetap mempertahankan draf/form seperti sebelumnya.
 */
const { t } = useI18n()
const { isBlocked, dismiss } = useStorageQuotaAlert()
</script>

<template>
  <div v-if="isBlocked" class="quota" role="alert">
    <p class="text">{{ t('storageQuota.message') }}</p>
    <div class="actions">
      <NuxtLink class="backup" to="/app/import-export">{{ t('storageQuota.backup') }}</NuxtLink>
      <button type="button" class="dismiss" @click="dismiss">
        {{ t('storageQuota.dismiss') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.quota {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
  margin: 0 0 var(--space-6, 0.5rem);
  padding: 0.5rem 0.75rem;
  border: 1px solid #e9b7ae;
  border-radius: 0.6rem;
  background: #ffe1da;
  color: #8f1f30;
  font-size: 0.85rem;
}

.text {
  margin: 0;
  flex: 1 1 18rem;
}

.actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.backup,
.dismiss {
  color: inherit;
  font-size: 0.85rem;
}

.dismiss {
  padding: 0.1rem 0.5rem;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
}
</style>
