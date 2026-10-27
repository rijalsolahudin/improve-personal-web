/**
 * `sync/` - engine sync (ARCHITECTURE.md §9, PRD F15, AC T21).
 *
 * Isinya:
 * - `hlc.ts`      : generator HLC (jam fisik dari `Clock`, counter, tie-break deviceId)
 * - `merge.ts`    : keputusan LWW - satu tempat, dipakai push/pull/import
 * - `blob-origin.ts`: tabel keputusan (prefix, KID) blob remote - murni, kripto lewat callback
 * - `outbox.ts`   : penyusunan baris outbox + penulisan record dalam satu transaksi
 * - `push.ts`     : batch ≤ `SYNC_MAX_BATCH`, status `applied|stale|rejected`
 * - `pull.ts`     : pull delta berhalaman dari cursor + reset saat `SYNC_RESET_REQUIRED`
 * - `status.ts`   : status yang dibaca UI (`synced|pending|offline|error`)
 * - `schedule.ts` : KAPAN sync dijalankan (fungsi murni; timer-nya milik adapter)
 *
 * Tidak ada timer, jaringan, atau storage di dalam keputusan-keputusannya: `HttpClient`,
 * `StorageAdapter`, dan `Clock` datang dari luar, jadi seluruh alur dua perangkat bisa diuji tanpa
 * menunggu waktu nyata.
 */

export {
  createHlcGenerator,
  minimalSuccessorHlc,
  type HlcGenerator,
  type HlcGeneratorOptions,
  type SuccessorHlcResult,
} from './hlc.ts'

export {
  classifyBlobPrefix,
  hasRecordBlobMagic,
  isAuthenticatedV2Local,
  isV1DowngradeOfV2,
  isWellFormedV2CiphertextLength,
  kidOwnerOf,
  peekBlobPrefix,
  resolveBlobVerdict,
  type BlobKeyIdentity,
  type BlobOrigin,
  type BlobPrefix,
  type BlobRejectReason,
  type BlobVerdict,
  type KidOwner,
  type OpenOutcome,
  type ResolveBlobInput,
} from './blob-origin.ts'

export {
  decideMerge,
  pickWinner,
  type DecideMergeOptions,
  type MergeAction,
  type MergeDecision,
  type MergeReason,
  type RecordVersion,
} from './merge.ts'

export {
  buildRecordWrite,
  commitLocalWrite,
  outboxRowFor,
  pullOutboxId,
  syncOpFor,
  type BuildRecordWriteInput,
} from './outbox.ts'

export {
  SYNC_DEBOUNCE_MS,
  SYNC_FOREGROUND_INTERVAL_MS,
  SYNC_TRIGGERS,
  dueSyncTriggers,
  shouldPullNow,
  syncDebounceRemainingMs,
  type SyncScheduleInput,
  type SyncTrigger,
} from './schedule.ts'

export { deriveSyncStatus, readSyncStatus, type SyncStatusInput } from './status.ts'

export {
  OUTBOX_ERROR_INVALID_RESPONSE,
  OUTBOX_ERROR_MISSING_RESULT,
  OUTBOX_ERROR_RECORD_MISSING,
  OUTBOX_ERROR_REJECTED,
  pushOutbox,
  type PushOutboxInput,
  type PushSummary,
} from './push.ts'

export {
  SYNC_PULL_MAX_PAGES_DEFAULT,
  SYNC_RESET_REQUIRED_CODE,
  buildPullUrl,
  pullDelta,
  type PullDeltaInput,
  type PullSummary,
} from './pull.ts'
