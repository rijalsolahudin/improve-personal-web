<script setup lang="ts">
import { BACKUP_PASSWORD_MIN_LENGTH, checkBackupPassword } from '@improve-personal/core'

import type { SegmentedOption } from '~/components/ui/Segmented/index.vue'
import type { DriveSchedule } from '~/utils/drive/config-store'

/**
 * Kartu "Backup ke Google Drive" (PRD F15, T29).
 *
 * Belum tersambung: kata sandi backup + jadwal -> "Sambungkan Google Drive" (popup izin Google).
 * Tersambung: status "Backup terakhir", jadwal, "Backup sekarang", "Putuskan".
 *
 * Kata sandi hanya hidup di kartu ini sampai kunci diturunkan, lalu dikosongkan.
 */
const drive = useDriveBackup()
const { dateTime } = useDateFormat()

onMounted(() => {
  void drive.load()
})

const password = ref('')
const confirmation = ref('')
const schedule = ref<DriveSchedule>('weekly')
const isTouched = ref(false)

const scheduleOptions: SegmentedOption<DriveSchedule>[] = [
  { value: 'daily', label: 'Harian' },
  { value: 'weekly', label: 'Mingguan' },
]

const issues = computed(() => checkBackupPassword(password.value, confirmation.value))
const issueMessage = computed(() => {
  if (!isTouched.value) return null
  if (issues.value.includes('TOO_SHORT')) {
    return `Kata sandi minimal ${BACKUP_PASSWORD_MIN_LENGTH} karakter.`
  }
  if (issues.value.includes('MISMATCH')) return 'Ketik ulang belum sama.'
  return null
})

const lastBackupLabel = computed(() => {
  const at = drive.config.value?.lastBackupAtMs ?? null
  return at === null ? 'belum pernah' : dateTime(at)
})

const connectedSchedule = computed({
  get: () => drive.config.value?.schedule ?? 'weekly',
  set: (value: DriveSchedule) => void drive.setSchedule(value),
})

function connect(): void {
  isTouched.value = true
  if (issues.value.length > 0) return
  // Dipanggil langsung di handler klik: popup izin Google dibuka sebelum `await` pertama.
  const value = password.value
  password.value = ''
  confirmation.value = ''
  isTouched.value = false
  void drive.connect(value, schedule.value)
}
</script>

<template>
  <Card class="drive-card">
    <h2 class="card-title">Backup ke Google Drive</h2>

    <p v-if="!drive.isAvailable.value" class="hint">
      Backup ke Google Drive belum diaktifkan di server ini. Pakai backup berkas terenkripsi dulu.
    </p>

    <template v-else-if="drive.isConnected.value">
      <p class="hint">
        Backup terakhir: <strong>{{ lastBackupLabel }}</strong
        >. Berkas dienkripsi di perangkat ini sebelum diunggah; 5 versi terakhir disimpan.
      </p>
      <p v-if="drive.isDue.value" class="due">
        Jadwal backup sudah lewat. Tekan "Backup sekarang" - izin Google hanya berlaku selama tab
        ini terbuka, jadi backup terjadwal butuh satu ketukan.
      </p>
      <Segmented
        v-model="connectedSchedule"
        :options="scheduleOptions"
        label="Jadwal backup"
        framed
      />
      <div class="actions">
        <Button variant="primary" :disabled="drive.isBusy.value" @click="drive.backupNow">
          {{ drive.isBusy.value ? 'Mengunggah…' : 'Backup sekarang' }}
        </Button>
        <Button variant="ghost" :disabled="drive.isBusy.value" @click="drive.disconnect">
          Putuskan
        </Button>
      </div>
    </template>

    <form v-else class="form" @submit.prevent="connect">
      <p class="hint">
        Backup otomatis dikirim langsung dari perangkat ini ke Drive kamu - tidak lewat server kami.
        Isinya terenkripsi dengan kata sandi backup; app hanya bisa melihat berkas buatannya
        sendiri.
      </p>
      <Field label="Kata sandi backup">
        <PasswordInput id="drive-password" v-model="password" autocomplete="new-password" />
      </Field>
      <Field label="Ketik ulang kata sandi">
        <PasswordInput
          id="drive-password-confirm"
          v-model="confirmation"
          autocomplete="new-password"
        />
      </Field>
      <Segmented v-model="schedule" :options="scheduleOptions" label="Jadwal backup" framed />
      <p v-if="issueMessage" class="error" role="alert">{{ issueMessage }}</p>
      <Button type="submit" variant="primary" :disabled="drive.isBusy.value">
        {{ drive.isBusy.value ? 'Menyambungkan…' : 'Sambungkan Google Drive' }}
      </Button>
    </form>

    <p v-if="drive.status.value" class="status" role="status" aria-live="polite">
      {{ drive.status.value }}
    </p>
    <p v-if="drive.error.value" class="error" role="alert" aria-live="assertive">
      {{ drive.error.value }}
    </p>
  </Card>
</template>

<style scoped>
.drive-card,
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
}

.drive-card {
  padding: var(--space-16);
}

.card-title {
  font-size: var(--fs-h2);
}

.hint,
.status {
  color: var(--text-muted);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

.due {
  padding: var(--space-10) var(--space-16);
  border-radius: var(--radius-inner);
  background: var(--prio-medium-bg);
  color: var(--prio-medium-fg);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-8);
}

.error {
  color: var(--danger);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}
</style>
