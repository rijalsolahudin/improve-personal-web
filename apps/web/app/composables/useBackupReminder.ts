import {
  BACKUP_LAST_AT_KEY,
  BACKUP_SNOOZE_MS,
  BACKUP_SNOOZE_UNTIL_KEY,
  ONBOARDED_AT_KEY,
  backupReminderLevel,
  daysSinceBackup,
  hasOwnContent,
  readTimestamp,
  writeTimestamp,
} from '~/utils/io/backup-reminder'
import { isStoragePersisted, storageManager } from '~/utils/storage/durability'

import { useLocalData } from './useLocalData'

/**
 * Status "backup terakhir" + pengingat Daily (PRD F15).
 *
 * `lastBackupAtMs` ada di `useState` supaya kartu Daily, halaman backup, dan backup Drive melihat
 * angka yang sama tanpa membaca ulang localStorage. Nilainya cuma timestamp - aman ikut payload.
 * Dibaca dari localStorage saat `load()` di client; di SSR semuanya `null` (pengingat tidak dirender).
 */
export type UseBackupReminderOptions = {
  /** Status jadwal Drive (dari `useDriveBackup`); dioper supaya dua composable tidak saling impor. */
  readonly isDriveDue?: Ref<boolean>
}

export function useBackupReminder(options: UseBackupReminderOptions = {}) {
  const lastBackupAtMs = useState<number | null>('backupLastAt', () => null)
  const snoozedUntilMs = useState<number | null>('backupSnoozeUntil', () => null)
  const isPersisted = useState<boolean | null>('backupPersisted', () => null)
  const isLoaded = useState('backupReminderLoaded', () => false)
  const needsOnboarding = useState('backupNeedsOnboarding', () => false)
  const nowMs = ref(0)

  async function load(): Promise<void> {
    if (!import.meta.client) return
    nowMs.value = Date.now()
    lastBackupAtMs.value = readTimestamp(BACKUP_LAST_AT_KEY)
    snoozedUntilMs.value = readTimestamp(BACKUP_SNOOZE_UNTIL_KEY)
    isLoaded.value = true
    isPersisted.value = await isStoragePersisted(storageManager())

    // Layar awal hanya untuk perangkat yang BENAR-BENAR kosong: user lama tidak perlu ditawari
    // "Mulai baru". Pemilihan jalur dicatat sekali; setelah itu yang tersisa pengingat biasa.
    if (readTimestamp(ONBOARDED_AT_KEY) !== null) return
    const session = await useLocalData().ensure()
    needsOnboarding.value = session !== null && !(await hasOwnContent(session.storage))
  }

  /** User memilih jalur di layar awal ("Mulai baru" atau "Pulihkan"). */
  function finishOnboarding(): void {
    needsOnboarding.value = false
    writeTimestamp(ONBOARDED_AT_KEY, Date.now())
  }

  /** Dipanggil setelah berkas/Drive backup benar-benar jadi. */
  function markBackedUp(atMs: number): void {
    lastBackupAtMs.value = atMs
    writeTimestamp(BACKUP_LAST_AT_KEY, atMs)
  }

  function snooze(): void {
    const until = Date.now() + BACKUP_SNOOZE_MS
    snoozedUntilMs.value = until
    writeTimestamp(BACKUP_SNOOZE_UNTIL_KEY, until)
  }

  const level = computed(() =>
    isLoaded.value
      ? backupReminderLevel({
          lastBackupAtMs: lastBackupAtMs.value,
          snoozedUntilMs: snoozedUntilMs.value,
          nowMs: nowMs.value,
          isPersisted: isPersisted.value,
          needsOnboarding: needsOnboarding.value,
          isDriveDue: options.isDriveDue?.value ?? false,
        })
      : 'none',
  )

  return {
    level,
    lastBackupAtMs: computed(() => lastBackupAtMs.value),
    daysSince: computed(() => daysSinceBackup(lastBackupAtMs.value, nowMs.value || Date.now())),
    load,
    markBackedUp,
    snooze,
    finishOnboarding,
  }
}
