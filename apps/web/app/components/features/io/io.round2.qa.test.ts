import {
  BACKUP_MAX_BYTES,
  BACKUP_PLAINTEXT_WARNING,
  BackupExportLimitError,
  DEFAULT_USER_PREFS,
  buildBackupDocument,
  emptyDataCount,
  serializeBackup,
  type BackupDocument,
  type BackupRecordInput,
} from '@improve-personal/core'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import BackupExportCard from './BackupExportCard.vue'
import BackupImportCard from './BackupImportCard.vue'

/**
 * Verifikasi QA putaran 2 (task #26, T12) - perilaku kunci di level UI, ditulis ulang independen dari
 * test developer supaya hasil "lulus" tidak bergantung pada satu set test yang sama.
 *
 * Yang dibuktikan: (a) peringatan plaintext tampil sebelum tombol export, (b) berkas kebesaran
 * ditolak tanpa dibaca, (c) preview memakai `dataCount` dan berkas dengan angka tidak konsisten
 * ditolak, (d) "ganti semua" tidak bisa dijalankan tanpa konfirmasi, (f) `BackupExportLimitError`
 * tampil apa adanya.
 */

const NOW = 1_700_000_000_000
const DOC_MISMATCH_MESSAGE =
  'Jumlah data di berkas tidak cocok dengan isinya. Berkas mungkin rusak atau sudah diubah.'

const mocks = vi.hoisted(() => ({
  createBackupFile: vi.fn(),
  downloadTextFile: vi.fn(),
  applyBackupDocument: vi.fn(),
  ensure: vi.fn(),
}))

vi.mock('~/utils/io/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/io/export')>()),
  createBackupFile: mocks.createBackupFile,
}))

vi.mock('~/utils/download', () => ({ downloadTextFile: mocks.downloadTextFile }))

vi.mock('~/utils/io/import', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/io/import')>()),
  applyBackupDocument: mocks.applyBackupDocument,
}))

vi.mock('~/composables/useLocalData', () => ({
  useLocalData: () => ({ ensure: mocks.ensure }),
}))

function idFor(n: number): string {
  return `018f2c4e-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
}

function todoPayload(id: string): Record<string, unknown> {
  return {
    id,
    title: `task ${id.slice(-2)}`,
    note: null,
    deadlineAt: null,
    priority: 'low',
    isDone: false,
    completedAt: null,
    scheduleId: null,
    scheduleOccurrenceAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function prefsPayload(id: string): Record<string, unknown> {
  return { id, ...DEFAULT_USER_PREFS, updatedAt: NOW }
}

/** Berkas valid: 2 task + 1 preferensi (3 record) - angka preview harus berasal dari `dataCount`. */
function validDocument(): BackupDocument {
  const records: BackupRecordInput[] = [
    {
      id: idFor(1),
      type: 'todo',
      hlc: `${NOW}-1-sumber`,
      deleted: false,
      data: todoPayload(idFor(1)),
    },
    {
      id: idFor(2),
      type: 'todo',
      hlc: `${NOW}-2-sumber`,
      deleted: false,
      data: todoPayload(idFor(2)),
    },
    {
      id: idFor(3),
      type: 'user_prefs',
      hlc: `${NOW}-3-sumber`,
      deleted: false,
      data: prefsPayload(idFor(3)),
    },
  ]

  return buildBackupDocument({ records, exportedAtMs: NOW })
}

function fileLike(content: string, size = content.length): File {
  return {
    name: 'improve-personal-backup-2023-11-14.json',
    size,
    text: async () => content,
  } as unknown as File
}

async function chooseFile(wrapper: VueWrapper, file: File): Promise<void> {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
  await wrapper.vm.$nextTick()
}

function buttonWithText(wrapper: VueWrapper, text: string) {
  const button = wrapper.findAll('button').find((item) => item.text().startsWith(text))
  if (button === undefined) throw new Error(`tombol "${text}" tidak ada`)
  return button
}

let mounted: VueWrapper | null = null

async function mount(component: Parameters<typeof mountSuspended>[0]): Promise<VueWrapper> {
  mounted = await mountSuspended(component)
  return mounted
}

beforeEach(() => {
  mocks.createBackupFile.mockReset()
  mocks.downloadTextFile.mockReset()
  mocks.applyBackupDocument.mockReset()
  mocks.ensure.mockReset()
  mocks.ensure.mockResolvedValue({ clock: { nowMs: () => NOW } })
})

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('(a) peringatan plaintext sebelum export', () => {
  it('tampil tanpa interaksi apa pun dan mendahului tombol unduh', async () => {
    const wrapper = await mount(BackupExportCard)

    const warning = wrapper.find('[role="note"]')
    expect(warning.exists()).toBe(true)
    expect(warning.text()).toBe(BACKUP_PLAINTEXT_WARNING)

    const html = wrapper.html()
    expect(html.indexOf(warning.text())).toBeLessThan(html.indexOf('Unduh berkas backup'))

    // Belum ada berkas yang disusun/diunduh sebelum user menekan tombol.
    expect(mocks.createBackupFile).not.toHaveBeenCalled()
    expect(mocks.downloadTextFile).not.toHaveBeenCalled()
  })
})

describe('(f) BackupExportLimitError ditampilkan apa adanya', () => {
  it('pesan error core tampil utuh dan tidak ada berkas yang diunduh', async () => {
    const limitError = new BackupExportLimitError('records', 50_001, 50_000)
    mocks.createBackupFile.mockRejectedValue(limitError)

    const wrapper = await mount(BackupExportCard)
    await buttonWithText(wrapper, 'Unduh berkas backup').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toBe(limitError.message)
    expect(wrapper.find('[role="alert"]').text()).toContain('50001 data')
    expect(mocks.downloadTextFile).not.toHaveBeenCalled()
  })
})

describe('(b) berkas di atas batas ditolak tanpa dibaca', () => {
  it('File.text() tidak pernah dipanggil untuk berkas > BACKUP_MAX_BYTES', async () => {
    const text = vi.fn(async () => serializeBackup(validDocument()))
    const oversized = { name: 'besar.json', size: BACKUP_MAX_BYTES + 1, text } as unknown as File

    const wrapper = await mount(BackupImportCard)
    await chooseFile(wrapper, oversized)

    expect(text).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').text()).toContain('tidak dibaca sama sekali')
    expect(wrapper.find('.preview').exists()).toBe(false)
    expect(buttonWithText(wrapper, 'Import data').attributes('disabled')).toBeDefined()
  })
})

describe('(c) preview memakai dataCount berkas', () => {
  it('menampilkan jumlah per tipe dari dataCount (2 task, 1 preferensi)', async () => {
    const wrapper = await mount(BackupImportCard)
    await chooseFile(wrapper, fileLike(serializeBackup(validDocument())))

    const preview = wrapper.find('.preview')
    expect(preview.exists()).toBe(true)
    expect(preview.text()).toContain('3 data')
    expect(preview.text()).toContain('task')
    expect(preview.text()).toContain('2')
    expect(preview.text()).toContain('preferensi')
    expect(preview.text()).toContain('1')
  })

  it('berkas dengan dataCount tidak konsisten ditolak dan tidak menampilkan preview', async () => {
    const document = validDocument()
    const tampered: BackupDocument = {
      ...document,
      dataCount: { ...document.dataCount, user_prefs: 41 },
    }

    const wrapper = await mount(BackupImportCard)
    await chooseFile(wrapper, fileLike(JSON.stringify(tampered)))

    expect(wrapper.find('[role="alert"]').text()).toContain(DOC_MISMATCH_MESSAGE)
    expect(wrapper.find('.preview').exists()).toBe(false)
    expect(buttonWithText(wrapper, 'Import data').attributes('disabled')).toBeDefined()
  })
})

describe('(d) "ganti semua" wajib konfirmasi', () => {
  it('tombol import mati sampai konfirmasi dicentang; tanpa centang tidak ada penulisan', async () => {
    mocks.applyBackupDocument.mockResolvedValue({
      mode: 'replace-all',
      written: 3,
      skipped: 0,
      perType: emptyDataCount(),
      outboxRows: 3,
    })

    const wrapper = await mount(BackupImportCard)
    await chooseFile(wrapper, fileLike(serializeBackup(validDocument())))

    await buttonWithText(wrapper, 'Ganti semua').trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Yakin hapus semua data sekarang dan import file?')
    expect(buttonWithText(wrapper, 'Import data').attributes('disabled')).toBeDefined()

    await buttonWithText(wrapper, 'Import data').trigger('click')
    await flushPromises()
    expect(mocks.applyBackupDocument).not.toHaveBeenCalled()

    await wrapper.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    await buttonWithText(wrapper, 'Import data').trigger('click')
    await flushPromises()

    expect(mocks.applyBackupDocument).toHaveBeenCalledTimes(1)
    expect(mocks.applyBackupDocument.mock.calls[0]?.[0]).toMatchObject({ mode: 'replace-all' })
  })
})
