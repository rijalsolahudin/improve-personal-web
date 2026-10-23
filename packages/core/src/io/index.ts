/**
 * `io/` - import & export JSON (PRD F10, AC T12) + migrasi versi skema (ARCHITECTURE.md §4).
 *
 * Berkas export adalah plaintext (bisa dibaca user), jadi dua hal wajib ada di setiap jalan:
 * peringatan yang jujur bahwa berkasnya tidak terenkripsi, dan penolakan tegas sebelum menulis apa
 * pun kalau berkasnya rusak atau versinya tidak dikenal.
 */

export {
  BACKUP_ENCRYPTED,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_MAX_BYTES,
  BACKUP_MAX_RECORDS,
  BACKUP_PLAINTEXT_WARNING,
  SUPPORTED_BACKUP_FORMAT_VERSIONS,
  BackupExportLimitError,
  backupDataCountSchema,
  backupDocumentSchema,
  backupFileName,
  backupRecordSchema,
  buildBackupDocument,
  describeDataCount,
  emptyDataCount,
  serializeBackup,
  type BackupDataCount,
  type BackupDocument,
  type BackupExportLimitKind,
  type BackupRecord,
  type BackupRecordInput,
  type BuildBackupInput,
  type BuildBackupOptions,
  type SerializeBackupOptions,
} from './backup.ts'

export {
  SCHEMA_MIGRATIONS,
  migrateRecords,
  type MigrationResult,
  type SchemaMigration,
} from './migrations.ts'

export {
  IMPORT_MODES,
  IMPORT_REJECTION_REASONS,
  BackupImportInvariantError,
  applyBackupImport,
  validateBackupText,
  type ApplyImportInput,
  type BackupValidation,
  type ImportApplyResult,
  type ImportMode,
  type ImportRejection,
  type ImportRejectionReason,
  type ValidateBackupOptions,
} from './import.ts'
