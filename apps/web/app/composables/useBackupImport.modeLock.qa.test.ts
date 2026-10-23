import {
  DEFAULT_USER_PREFS,
  buildBackupDocument,
  createHlcGenerator,
  createManualClock,
  createMemoryStorage,
  serializeBackup,
  type BackupRecordInput,
  type CryptoProvider,
  type SecureKeyMaterial,
  type StorageAdapter,
} from '@improve-personal/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { applyBackupDocument } from '~/utils/io/import'

import { useBackupImport } from './useBackupImport'

/**
 * Re-QA #55 (verifikasi BUG-55-A hilang) - ditulis independen dari test developer.
 *
 * Beda penting dengan `useBackupImport.mode.qa.test.ts`: modul `~/utils/io/import` TIDAK di-mock.
 * Yang dipakai adalah `applyBackupDocument` asli di atas adapter memori core + provider plaintext,
 * jadi assertion "data tidak tersentuh" mengukur efek nyata (`wipe()` + isi tabel), bukan sekadar
 * "fungsi palsu tidak dipanggil".
 *
 * Data lama (3 record) sengaja diberi id yang TIDAK ada di berkas import. Kalau import berjalan
 * sebagai `replace-all`, record lama hilang; kalau berjalan sebagai `merge`, record lama tetap ada.
 * Itulah pembeda yang dibuktikan di tiap skenario.
 */

const NOW = 1_700_000_000_000
const EXPORTED_A = NOW + 100_000
const EXPORTED_B = NOW + 200_000

const OLD_IDS = [101, 102, 103] as const
const FILE_IDS = [1, 2] as const
const FILE_A_IDS = [11, 12, 13] as const
const FILE_B_IDS = [21, 22] as const

const mocks = vi.hoisted(() => ({ ensure: vi.fn() }))

vi.mock('./useLocalData', () => ({ useLocalData: () => ({ ensure: mocks.ensure }) }))

function idFor(n: number): string {
  return `018f2c4e-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
}

function recordsFor(ids: readonly number[], hlcAtMs: number): BackupRecordInput[] {
  return ids.map((n) => ({
    id: idFor(n),
    type: 'user_prefs',
    hlc: `${hlcAtMs}-${n}-sumber`,
    deleted: false,
    data: { id: idFor(n), ...DEFAULT_USER_PREFS, updatedAt: NOW },
  }))
}

function documentText(ids: readonly number[], exportedAtMs: number): string {
  return serializeBackup(buildBackupDocument({ records: recordsFor(ids, NOW), exportedAtMs }))
}

function fileWith(name: string, content: string): File {
  return { name, size: content.length, text: async () => content } as unknown as File
}

/** Berkas yang pembacaannya ditahan sampai test memanggil `resolve()`. */
function deferredFile(name: string, content: string): { file: File; resolve: () => void } {
  let settle: (text: string) => void = () => {}
  const text = new Promise<string>((resolve) => {
    settle = resolve
  })

  return {
    file: { name, size: content.length, text: () => text } as unknown as File,
    resolve: () => settle(content),
  }
}

type Harness = {
  readonly session: {
    readonly storage: StorageAdapter
    readonly provider: CryptoProvider
    readonly dataKey: SecureKeyMaterial
    readonly hlc: ReturnType<typeof createHlcGenerator>
    readonly clock: ReturnType<typeof createManualClock>
  }
  readonly counters: { wipe: number; transactions: number }
}

/** Sesi lokal nyata: adapter memori core, bukan mock - supaya `wipe()` benar-benar terjadi. */
function createHarness(): Harness {
  const clock = createManualClock(NOW)
  const memory = createMemoryStorage({ clock })
  const counters = { wipe: 0, transactions: 0 }

  const storage: StorageAdapter = {
    ...memory,
    runTransaction: (label, fn) => {
      counters.transactions += 1
      return memory.runTransaction(label, fn)
    },
    wipe: async () => {
      counters.wipe += 1
      await memory.wipe()
    },
  }

  const provider: CryptoProvider = {
    sealRecord: async ({ plaintext }) => plaintext,
    openRecord: async ({ blob }) => blob,
  }
  const dataKey: SecureKeyMaterial = { kind: 'test', handle: null }
  const hlc = createHlcGenerator({ deviceId: 'qa55', clock })

  return { session: { storage, provider, dataKey, hlc, clock }, counters }
}

/** Isi 3 record lama lewat jalur tulis yang sama dengan import, lalu nolkan penghitung. */
async function seedOldData(harness: Harness): Promise<void> {
  await applyBackupDocument({
    target: harness.session,
    document: buildBackupDocument({ records: recordsFor(OLD_IDS, NOW), exportedAtMs: NOW }),
    mode: 'merge',
    nowMs: NOW,
  })
  harness.counters.wipe = 0
  harness.counters.transactions = 0
}

async function hasRecord(harness: Harness, id: string): Promise<boolean> {
  return (await harness.session.storage.getRecord(id)) !== null
}

/** Tahan `localData.ensure()` supaya jendela "Mengimpor…" bisa dikendalikan test. */
function holdEnsure(harness: Harness): { release: () => void } {
  let release: () => void = () => {}
  mocks.ensure.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(harness.session)
      }),
  )

  return { release: () => release() }
}

beforeEach(() => {
  mocks.ensure.mockReset()
})

describe('QA #55 - BUG-55-A: keputusan mode dikunci saat import berjalan (adapter nyata)', () => {
  it('(a) mode merge mulai diimport lalu diubah ke replace-all (+dicentang) saat "Mengimpor…": eksekusi tetap merge dan data lama utuh', async () => {
    const harness = createHarness()
    await seedOldData(harness)
    mocks.ensure.mockResolvedValue(harness.session)

    const io = useBackupImport()
    await io.selectFile(fileWith('backup.json', documentText(FILE_IDS, EXPORTED_A)))
    expect(io.mode.value).toBe('merge')

    const gate = holdEnsure(harness)
    const pending = io.applyImport()
    expect(io.isBusy.value).toBe(true)
    // Selama busy, tombol import ditahan (klik kedua diabaikan) dan keputusan mode sudah dikunci.
    expect(io.canApply.value).toBe(false)

    // Setara klik "Ganti semua" + mencentang konfirmasi selagi "Mengimpor…". Konfirmasi sengaja
    // ikut diubah supaya yang diuji benar-benar snapshot, bukan kebetulan `isConfirmed` masih false.
    io.mode.value = 'replace-all'
    io.isReplaceConfirmed.value = true

    gate.release()
    await pending

    expect(harness.counters.wipe).toBe(0)
    for (const n of OLD_IDS) expect(await hasRecord(harness, idFor(n))).toBe(true)
    for (const n of FILE_IDS) expect(await hasRecord(harness, idFor(n))).toBe(true)
    expect(io.status.value).toContain('Import selesai')
    expect(io.status.value).not.toContain('Semua data diganti')
    expect(io.error.value).toBeNull()
    expect(io.isBusy.value).toBe(false)
  })

  it('(b) replace-all tanpa centang ditolak dengan pesan jelas: wipe tidak dipanggil, record lama & baru tidak tersentuh', async () => {
    const harness = createHarness()
    await seedOldData(harness)
    mocks.ensure.mockResolvedValue(harness.session)

    const io = useBackupImport()
    await io.selectFile(fileWith('backup.json', documentText(FILE_IDS, EXPORTED_A)))

    io.mode.value = 'replace-all'
    expect(io.isReplaceConfirmed.value).toBe(false)
    expect(io.canApply.value).toBe(false)

    await io.applyImport()

    expect(harness.counters.wipe).toBe(0)
    expect(harness.counters.transactions).toBe(0)
    for (const n of OLD_IDS) expect(await hasRecord(harness, idFor(n))).toBe(true)
    for (const n of FILE_IDS) expect(await hasRecord(harness, idFor(n))).toBe(false)

    expect(io.error.value).toContain('belum dikonfirmasi')
    expect(io.error.value).toContain('tidak ada data yang diubah')
    expect(io.status.value).toBeNull()
    expect(io.isBusy.value).toBe(false)

    // Pilihan tidak dibuang: user bisa mencentang konfirmasi lalu mencoba lagi.
    expect(io.fileName.value).toBe('backup.json')
    expect(io.preview.value?.totalRecords).toBe(2)
  })

  it('(c) replace-all dengan centang tetap jalan: wipe sekali, hanya isi berkas yang tersisa', async () => {
    const harness = createHarness()
    await seedOldData(harness)
    mocks.ensure.mockResolvedValue(harness.session)

    const io = useBackupImport()
    await io.selectFile(fileWith('backup.json', documentText(FILE_IDS, EXPORTED_A)))

    io.mode.value = 'replace-all'
    io.isReplaceConfirmed.value = true
    expect(io.canApply.value).toBe(true)

    await io.applyImport()

    expect(harness.counters.wipe).toBe(1)
    expect(io.status.value).toContain('Semua data diganti')
    expect(io.status.value).toContain('2 data masuk')
    expect(io.error.value).toBeNull()
    expect(io.isBusy.value).toBe(false)

    for (const n of OLD_IDS) expect(await hasRecord(harness, idFor(n))).toBe(false)
    for (const n of FILE_IDS) expect(await hasRecord(harness, idFor(n))).toBe(true)

    // Sukses mengosongkan pilihan, jadi berkas yang sama tidak ter-import dua kali tanpa sengaja.
    expect(io.fileName.value).toBeNull()
    expect(io.preview.value).toBeNull()
    expect(io.canApply.value).toBe(false)
  })

  it('(d) double submit menulis persis sekali (jumlah transaksi sama dengan satu submit)', async () => {
    const single = createHarness()
    await seedOldData(single)
    mocks.ensure.mockResolvedValue(single.session)
    const singleIo = useBackupImport()
    await singleIo.selectFile(fileWith('backup.json', documentText(FILE_IDS, EXPORTED_A)))
    await singleIo.applyImport()

    const double = createHarness()
    await seedOldData(double)
    mocks.ensure.mockReset()
    mocks.ensure.mockResolvedValue(double.session)
    const doubleIo = useBackupImport()
    await doubleIo.selectFile(fileWith('backup.json', documentText(FILE_IDS, EXPORTED_A)))
    await Promise.all([doubleIo.applyImport(), doubleIo.applyImport()])

    expect(double.counters.transactions).toBe(single.counters.transactions)
    expect(double.counters.wipe).toBe(single.counters.wipe)
    for (const n of FILE_IDS) expect(await hasRecord(double, idFor(n))).toBe(true)
    expect(doubleIo.status.value).toBe(singleIo.status.value)
  })

  it('(e) race A/B tetap benar dan hanya berkas terakhir yang ditulis (data lama tidak terhapus)', async () => {
    const harness = createHarness()
    await seedOldData(harness)
    mocks.ensure.mockResolvedValue(harness.session)

    const io = useBackupImport()
    const a = deferredFile('a.json', documentText(FILE_A_IDS, EXPORTED_A))

    const pendingA = io.selectFile(a.file)
    await io.selectFile(fileWith('b.json', documentText(FILE_B_IDS, EXPORTED_B)))

    expect(io.fileName.value).toBe('b.json')
    expect(io.preview.value?.exportedAtMs).toBe(EXPORTED_B)
    expect(io.preview.value?.totalRecords).toBe(2)

    a.resolve()
    await pendingA

    // Hasil A yang selesai belakangan tidak boleh menimpa state B.
    expect(io.fileName.value).toBe('b.json')
    expect(io.preview.value?.exportedAtMs).toBe(EXPORTED_B)
    expect(io.preview.value?.totalRecords).toBe(2)

    await io.applyImport()

    expect(harness.counters.wipe).toBe(0)
    for (const n of OLD_IDS) expect(await hasRecord(harness, idFor(n))).toBe(true)
    for (const n of FILE_B_IDS) expect(await hasRecord(harness, idFor(n))).toBe(true)
    for (const n of FILE_A_IDS) expect(await hasRecord(harness, idFor(n))).toBe(false)
  })
})
