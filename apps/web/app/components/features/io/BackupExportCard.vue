<script setup lang="ts">
import { BACKUP_PLAINTEXT_WARNING } from '@improve-personal/core'

import { downloadTextFile } from '~/utils/download'

/**
 * Kartu "Export" (PRD F10).
 *
 * Peringatan plaintext SELALU terlihat, bukan dialog yang muncul setelah tombol ditekan: berkas ini
 * berisi seluruh data user dalam bentuk terbaca, dan user perlu tahu itu sebelum memutuskan
 * menyimpannya di mana. `BACKUP_PLAINTEXT_WARNING` ditampilkan apa adanya supaya kalimat yang diuji
 * di core adalah kalimat yang dibaca user.
 *
 * Batas ukuran TIDAK dilemahkan di UI: kalau core menolak karena berkasnya akan melebihi batas import,
 * pesannya ditampilkan apa adanya dan batasnya tidak dinaikkan - backup yang tidak bisa dipulihkan
 * lebih buruk daripada tidak ada backup.
 */
const { isBusy, error, status, exportBackup } = useBackupExport()

async function download(): Promise<void> {
  const file = await exportBackup()
  if (file === null) return

  downloadTextFile(file.name, file.text, 'application/json')
}
</script>

<template>
  <Card class="export-card">
    <h2 class="card-title">Export data</h2>
    <p class="hint">
      Menyimpan semua data akun ini (jadwal, task, habit, jurnal, goal, countdown, dan lainnya) ke
      satu berkas JSON yang bisa dibuka sendiri.
    </p>

    <p class="warning" role="note">{{ BACKUP_PLAINTEXT_WARNING }}</p>

    <Button variant="primary" :disabled="isBusy" @click="download">
      {{ isBusy ? 'Menyiapkan berkas…' : 'Unduh berkas backup' }}
    </Button>

    <p v-if="status" class="status" role="status" aria-live="polite">{{ status }}</p>
    <p v-if="error" class="error" role="alert" aria-live="assertive">{{ error }}</p>
  </Card>
</template>

<style scoped>
.export-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-8);
}

.card-title {
  font-size: var(--fs-h2);
}

.hint {
  color: var(--text-muted);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

.warning {
  padding: var(--space-5) var(--space-8);
  border-radius: var(--radius-inner);
  background: var(--prio-medium-bg);
  color: var(--prio-medium-fg);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

.status {
  color: var(--text-muted);
  font-size: var(--fs-caption);
}

.error {
  color: var(--danger);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}
</style>
