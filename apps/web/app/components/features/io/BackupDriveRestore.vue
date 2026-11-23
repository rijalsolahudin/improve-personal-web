<script setup lang="ts">
import type { DriveFile } from '~/utils/drive/api'
import { formatByteSize } from '~/utils/io/preview'

/**
 * "Pulihkan dari Google Drive" di kartu Pulihkan (PRD F15): izin Google -> daftar versi -> pilih ->
 * berkas `.ipbackup` diserahkan ke alur import yang sama (kata sandi, preview, gabung/ganti semua).
 * Bisa dipakai di perangkat baru yang belum pernah menyambung Drive.
 */
const emit = defineEmits<{ picked: [name: string, bytes: Uint8Array] }>()

const drive = useDriveBackup()
const { dateTime } = useDateFormat()

const versions = shallowRef<DriveFile[] | null>(null)

async function showVersions(): Promise<void> {
  versions.value = await drive.listVersions()
}

async function pick(file: DriveFile): Promise<void> {
  const bytes = await drive.downloadVersion(file)
  if (bytes === null) return
  versions.value = null
  emit('picked', file.name, bytes)
}
</script>

<template>
  <section
    v-if="drive.isAvailable.value"
    class="drive-restore"
    aria-labelledby="drive-restore-title"
  >
    <h3 id="drive-restore-title" class="title">Atau dari Google Drive</h3>
    <Button variant="ghost" :disabled="drive.isBusy.value" @click="showVersions">
      {{ drive.isBusy.value ? 'Memuat…' : 'Pilih backup di Google Drive' }}
    </Button>
    <ul v-if="versions && versions.length > 0" class="versions">
      <li v-for="file in versions" :key="file.id">
        <button type="button" class="version" :disabled="drive.isBusy.value" @click="pick(file)">
          <span>{{ dateTime(file.createdTimeMs) }}</span>
          <span class="size">{{ formatByteSize(file.sizeBytes) }}</span>
        </button>
      </li>
    </ul>
    <p v-if="drive.status.value" class="hint" role="status">{{ drive.status.value }}</p>
    <p v-if="drive.error.value" class="error" role="alert">{{ drive.error.value }}</p>
  </section>
</template>

<style scoped>
.drive-restore {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  padding-top: var(--space-10);
  border-top: var(--border-thin) dashed var(--line);
}

.title {
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-medium);
}

.versions {
  display: grid;
  gap: var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.version {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-8) var(--space-12);
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-inner);
  background: none;
  color: inherit;
  font: inherit;
  font-size: var(--fs-body-sm);
  cursor: pointer;
}

.size,
.hint {
  color: var(--text-muted);
  font-size: var(--fs-caption);
}

.error {
  color: var(--danger);
  font-size: var(--fs-caption);
}
</style>
