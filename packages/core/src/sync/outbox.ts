import type { RecordIndexEntry, SealedRecord, SyncOp } from '../domain/envelope.ts'
import type { OutboxRow, RecordWrite, StorageAdapter } from '../ports.ts'

/**
 * Penyusunan baris outbox + penulisan record lokal (ARCHITECTURE.md §5 "Record + outbox dalam SATU
 * transaksi").
 *
 * Kenapa bantuan ini ada di core, bukan di adapter: bentuk `RecordWrite` sudah ditentukan `ports.ts`,
 * tapi memutuskan `op` (`put`/`delete`) dan merakit barisnya adalah aturan domain - dan aturan itu
 * harus sama di web & native. Adapter tetap yang menjamin atomisitasnya.
 */

export type BuildRecordWriteInput = {
  readonly sealed: SealedRecord
  /** Entri `record_index` yang ditulis bersama; `null` kalau entitas tidak punya dimensi waktu. */
  readonly index: RecordIndexEntry | null
  readonly op: SyncOp
  readonly outbox: {
    readonly id: string
    readonly queuedAtMs: number
  }
}

export function buildRecordWrite(input: BuildRecordWriteInput): RecordWrite {
  return {
    sealed: {
      id: input.sealed.id,
      hlc: input.sealed.hlc,
      deleted: input.sealed.deleted,
      blob: input.sealed.blob,
    },
    index: input.index,
    op: input.op,
    outbox: { id: input.outbox.id, queuedAtMs: input.outbox.queuedAtMs },
  }
}

/**
 * `op` outbox yang benar untuk sebuah record.
 *
 * Tombstone tetap dikirim sebagai `delete` supaya perangkat lain tahu record itu dihapus - bukan
 * dihilangkan diam-diam (ARCHITECTURE.md §9).
 */
export function syncOpFor(sealed: Pick<SealedRecord, 'deleted'>): SyncOp {
  return sealed.deleted ? 'delete' : 'put'
}

/**
 * Tulis record + baris outbox-nya dalam SATU transaksi.
 *
 * Ini satu-satunya jalur tulis lokal di core. Kalau ada kode yang memanggil `tx.putRecord` sendiri,
 * dia wajib punya alasan kuat - `putRecord` tanpa transaksi = record yang tidak pernah terkirim.
 */
export async function commitLocalWrite(input: {
  readonly storage: StorageAdapter
  readonly write: RecordWrite
  readonly label?: string
}): Promise<void> {
  await input.storage.runTransaction(input.label ?? 'record.write', async (tx) => {
    await tx.putRecord(input.write)
  })
}

/**
 * Id baris outbox untuk record yang DITERAPKAN dari pull.
 *
 * Record hasil pull tidak boleh dikirim balik ke server, sedangkan `TransactionContext.putRecord`
 * selalu menulis baris outbox. Jalan yang dipakai: tulis dengan id turunan ini, lalu buang barisnya
 * di transaksi yang sama (`sync/pull.ts`) - jadi barisnya tidak pernah bertahan.
 *
 * Sengaja BUKAN uuid acak (core tidak punya randomness, dan randomness di sini justru merugikan:
 * id turunan membuat baris ini gampang dikenali di log adapter). Juga sengaja TIDAK memakai
 * `recordId` sebagai id, supaya baris outbox lokal yang masih menunggu untuk record yang sama tidak
 * ikut terbuang: kalau versi server menang, baris lokal itu nanti selesai sendiri sebagai `stale`
 * saat push berikutnya (protokol `applied|stale|rejected` di `packages/contracts`).
 */
export function pullOutboxId(recordId: string, hlc: string): string {
  return `sync-pull:${recordId}:${hlc}`
}

/** Bentuk baris outbox dari `RecordWrite` - dipakai test & adapter yang butuh barisnya saja. */
export function outboxRowFor(write: RecordWrite): OutboxRow {
  return {
    id: write.outbox.id,
    recordId: write.sealed.id,
    op: write.op,
    queuedAtMs: write.outbox.queuedAtMs,
    attempts: 0,
    lastError: null,
  }
}
