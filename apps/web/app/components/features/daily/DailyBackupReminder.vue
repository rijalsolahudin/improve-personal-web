<script setup lang="ts">
/**
 * Layar awal + pengingat backup di Daily (PRD F15 "Onboarding" & "Pengingat").
 *
 * Perangkat kosong yang belum memilih jalur melihat sambutan dengan dua pilihan: "Pulihkan dari
 * backup" (ke halaman Backup & Pulihkan) atau "Mulai baru". Jalur "Pindahan via QR" menyusul
 * bersama fitur transfer (T31), jadi belum ditampilkan.
 *
 * Pengingat backup muncul saat belum pernah backup atau backup terakhir > 7 hari; "Nanti saja"
 * menunda sehari, tidak ada tombol tutup permanen.
 *
 * Versi tegas (`urgent`) saat browser menolak penyimpanan permanen: browser boleh menghapus data app
 * ini kapan saja ruangnya dibutuhkan, jadi ajakannya ditambah "pasang app".
 */
const drive = useDriveBackup()
const reminder = useBackupReminder({ isDriveDue: drive.isDue })

onMounted(() => {
  void reminder.load()
  void drive.load()
})

const isWelcome = computed(() => reminder.level.value === 'welcome')

const message = computed(() => {
  if (reminder.level.value === 'drive') return 'Waktunya backup ke Google Drive.'
  const days = reminder.daysSince.value
  return days === null
    ? 'Kamu belum pernah backup. Data hanya ada di perangkat ini.'
    : `Backup terakhir ${days} hari lalu.`
})
</script>

<template>
  <aside
    v-if="reminder.level.value !== 'none'"
    class="reminder"
    :class="reminder.level.value"
    role="status"
    aria-live="polite"
  >
    <template v-if="isWelcome">
      <Icon name="smile" class="icon" />
      <div class="body">
        <p class="title">Selamat datang! Perangkat ini masih kosong.</p>
        <p class="hint">
          Punya backup dari perangkat lain? Pulihkan dulu supaya datamu ikut. Data hanya tersimpan
          di perangkat ini - HP hilang tanpa backup = data hilang.
        </p>
      </div>
      <div class="actions">
        <NuxtLink class="primary" to="/app/import-export" @click="reminder.finishOnboarding">
          Pulihkan dari backup
        </NuxtLink>
        <button type="button" class="later" @click="reminder.finishOnboarding">Mulai baru</button>
      </div>
    </template>
    <template v-else>
      <Icon name="cloud-upload" class="icon" />
      <div class="body">
        <p class="title">{{ message }}</p>
        <p class="hint">
          <template v-if="reminder.level.value === 'drive'">
            Izin Google tidak disimpan di perangkat, jadi backup terjadwal butuh satu ketukan.
          </template>
          <template v-else-if="reminder.level.value === 'urgent'">
            Browser ini belum mengizinkan penyimpanan permanen, jadi datanya bisa dihapus saat ruang
            penuh. Backup sekarang, lalu pasang app ini (menu browser → Install / Tambahkan ke layar
            utama) supaya lebih aman.
          </template>
          <template v-else>
            HP hilang atau data browser terhapus tanpa backup = data hilang permanen.
          </template>
        </p>
      </div>
      <div class="actions">
        <button
          v-if="reminder.level.value === 'drive'"
          type="button"
          class="primary"
          :disabled="drive.isBusy.value"
          @click="drive.backupNow"
        >
          {{ drive.isBusy.value ? 'Mengunggah…' : 'Backup ke Drive' }}
        </button>
        <NuxtLink v-else class="primary" to="/app/import-export">Backup sekarang</NuxtLink>
        <button type="button" class="later" @click="reminder.snooze">Nanti saja</button>
      </div>
      <p v-if="reminder.level.value === 'drive' && drive.error.value" class="error" role="alert">
        {{ drive.error.value }}
      </p>
    </template>
  </aside>
</template>

<style scoped>
.reminder {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-12);
  padding: var(--space-12) var(--space-16);
  border: var(--border-thin) solid var(--line);
  border-radius: var(--radius-card);
  background: var(--prio-medium-bg);
  color: var(--prio-medium-fg);
}

.reminder.welcome {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.reminder.urgent {
  background: var(--prio-urgent-bg);
  color: var(--prio-urgent-fg);
}

.icon {
  flex: none;
  font-size: 1.4rem;
}

.body {
  flex: 1 1 16rem;
  min-width: 0;
}

.title {
  font-weight: var(--fw-strong);
}

.hint {
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.primary {
  border: 0;
  font: inherit;
  cursor: pointer;
  padding: var(--space-6) var(--space-14);
  border-radius: var(--radius-pill);
  background: var(--accent);
  color: var(--text-on-accent);
  font-weight: var(--fw-medium);
  text-decoration: none;
}

.error {
  flex-basis: 100%;
  font-size: var(--fs-caption);
}

.later {
  padding: var(--space-6) var(--space-10);
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
</style>
