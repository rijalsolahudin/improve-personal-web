<script setup lang="ts">
import { BACKUP_MAX_BYTES, type ImportMode } from '@improve-personal/core'

import type { SegmentedOption } from '~/components/ui/Segmented/index.vue'
import { formatByteSize } from '~/utils/io/preview'

/**
 * Kartu "Import" (PRD F10): pilih berkas → validasi → preview → pilih mode → konfirmasi → tulis.
 *
 * Yang tidak boleh dilanggar di sini:
 * - Isi berkas TIDAK pernah dirender sebagai HTML - hanya angka ringkasan dan nama berkas.
 * - Tombol import mati sampai berkas lolos validasi, dan di mode "ganti semua" sampai user
 *   mencentang konfirmasi. Aturan yang sama dikunci di composable: `mode` + konfirmasi disalin
 *   sebelum import menulis, jadi perubahan state di tengah import tidak mengubah keputusan.
 * - Selama `isBusy`, input berkas, mode, dan checkbox konfirmasi sama-sama mati.
 * - Setiap status/kegagalan diumumkan lewat `aria-live`, karena perubahan terjadi setelah user memilih
 *   berkas - bukan setelah klik tombol yang jelas terlihat.
 */
const { dayMonthYear } = useDateFormat()
const {
  isBusy,
  error,
  status,
  fileName,
  preview,
  mode,
  isReplaceConfirmed,
  canApply,
  selectFile,
  applyImport,
} = useBackupImport()

const maxFileSize = formatByteSize(BACKUP_MAX_BYTES)

const modeOptions = computed<SegmentedOption<ImportMode>[]>(() => [
  // Selagi import berjalan, keputusan mode sudah dikunci di composable. Tombolnya dimatikan juga
  // supaya user tidak mengira perubahan mode akan memengaruhi import yang sedang menulis.
  { value: 'merge', label: 'Gabung', disabled: isBusy.value },
  { value: 'replace-all', label: 'Ganti semua', disabled: isBusy.value },
])

const isReplaceMode = computed(() => mode.value === 'replace-all')
const exportedOn = computed(() =>
  preview.value === null ? '' : dayMonthYear(preview.value.exportedAtMs),
)

async function onChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  // Nilai input dikosongkan supaya memilih berkas yang SAMA dua kali tetap memicu `change`.
  input.value = ''

  if (file === undefined) return
  await selectFile(file)
}
</script>

<template>
  <Card class="import-card">
    <h2 class="card-title">Import data</h2>
    <p id="backup-import-hint" class="hint">
      Pilih berkas backup JSON hasil Export. Berkasnya diperiksa dulu; data yang ada tidak diubah
      sebelum kamu menekan tombol import. Maksimal {{ maxFileSize }}.
    </p>

    <label class="label" for="backup-file">Berkas backup</label>
    <input
      id="backup-file"
      type="file"
      accept="application/json,.json"
      aria-describedby="backup-import-hint"
      :disabled="isBusy"
      @change="onChange"
    />
    <p v-if="fileName" class="hint file-name">Dipilih: {{ fileName }}</p>

    <section v-if="preview" class="preview" aria-labelledby="backup-preview-title">
      <h3 id="backup-preview-title">Isi berkas</h3>
      <p class="hint">
        {{ preview.totalRecords }} data · export {{ exportedOn }}
        <template v-if="preview.migratedFrom !== null">
          · dimigrasikan dari versi {{ preview.migratedFrom }}
        </template>
      </p>

      <ul v-if="preview.rows.length > 0" class="rows">
        <li v-for="row in preview.rows" :key="row.type" class="row">
          <span>{{ row.label }}</span>
          <span class="count">{{ row.count }}</span>
        </li>
      </ul>
      <p v-else class="hint">Berkas ini tidak berisi data, jadi tidak bisa diimpor.</p>

      <Segmented v-model="mode" :options="modeOptions" label="Mode import" framed />

      <div v-if="isReplaceMode" class="confirm">
        <p class="warning">Yakin hapus semua data sekarang dan import file?</p>
        <label class="confirm-row">
          <input v-model="isReplaceConfirmed" type="checkbox" :disabled="isBusy" />
          <span>
            Saya mengerti semua data di perangkat ini akan dihapus dan diganti isi berkas backup.
          </span>
        </label>
      </div>
    </section>

    <Button variant="primary" :disabled="!canApply" @click="applyImport">
      {{ isBusy ? 'Mengimpor…' : 'Import data' }}
    </Button>

    <p v-if="status" class="status" role="status" aria-live="polite">{{ status }}</p>
    <p v-if="error" class="error" role="alert" aria-live="assertive">{{ error }}</p>
  </Card>
</template>

<style scoped>
.import-card {
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

.label {
  font-weight: var(--fw-medium);
  font-size: var(--fs-body-sm);
}

.file-name {
  word-break: break-all;
}

.preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-6);
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-inner);
}

.rows {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--fs-body-sm);
}

.row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
}

.count {
  font-weight: var(--fw-strong);
}

.warning {
  padding: var(--space-5) var(--space-8);
  border-radius: var(--radius-inner);
  background: var(--prio-urgent-bg);
  color: var(--prio-urgent-fg);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

.confirm {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.confirm-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
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
