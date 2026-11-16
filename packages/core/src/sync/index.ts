/**
 * `sync/` - versi record lokal (ARCHITECTURE.md §9). Sejak ADR 15 tidak ada sync jaringan; yang
 * tersisa dipakai import/transfer "gabung" dan penulisan record lokal.
 *
 * Isinya:
 * - `hlc.ts`      : generator HLC (jam fisik dari `Clock`, counter, tie-break deviceId)
 * - `merge.ts`    : keputusan LWW - satu tempat, dipakai import (dan transfer, T30)
 * - `outbox.ts`   : penulisan record + index dalam satu transaksi (baris outbox dihapus di #160)
 */

export {
  createHlcGenerator,
  minimalSuccessorHlc,
  type HlcGenerator,
  type HlcGeneratorOptions,
  type SuccessorHlcResult,
} from './hlc.ts'

export {
  decideMerge,
  pickWinner,
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
