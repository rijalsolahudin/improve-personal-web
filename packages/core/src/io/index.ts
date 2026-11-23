/**
 * `io/` - import & export JSON (PRD F10, AC T12), berkas backup terenkripsi (F15, T27), dan migrasi
 * versi skema (ARCHITECTURE.md §4).
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

export {
  BACKUP_KDF_LIMITS,
  BACKUP_PASSWORD_MIN_LENGTH,
  BACKUP_SALT_BYTES,
  ENCRYPTED_BACKUP_CHUNK_BYTES,
  ENCRYPTED_BACKUP_EXTENSION,
  ENCRYPTED_BACKUP_FORMAT,
  ENCRYPTED_BACKUP_REJECTIONS,
  ENCRYPTED_BACKUP_VERSION,
  EncryptedBackupError,
  backupPasswordStrength,
  checkBackupPassword,
  describeEncryptedBackupRejection,
  ENCRYPTED_BACKUP_HEADER_MAX_BYTES,
  ENCRYPTED_BACKUP_PREFIX,
  encryptedBackupFileName,
  encryptedBackupHeaderSchema,
  parseEncryptedBackupHeader,
  serializeEncryptedBackupHeader,
  type BackupKdfParams,
  type BackupPasswordIssue,
  type BackupPasswordStrength,
  type EncryptedBackupHeader,
  type EncryptedBackupRejection,
} from './encrypted-backup.ts'
