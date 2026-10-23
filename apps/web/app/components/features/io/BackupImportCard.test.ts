import {
  BACKUP_MAX_BYTES,
  BackupImportInvariantError,
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

import BackupImportCard from './BackupImportCard.vue'

/**
 * Kartu Import (PRD F10). Yang dibuktikan di sini adalah janji yang menyangkut data user:
 *
 * 1. berkas kebesaran ditolak dari `File.size` TANPA dibaca (`text()` tidak dipanggil);
 * 2. preview memakai `dataCount` hasil validasi core, dan berkas dengan angka tidak konsisten ditolak
 *    dengan pesan yang bisa ditindaklanjuti;
 * 3. mode "ganti semua" tidak bisa dijalankan sebelum user mencentang konfirmasi;
 * 4. kegagalan invarian & jumlah data tertulis tampil di UI.
 *
 * `applyBackupDocument` di-mock (penulisan sungguhan diuji di `utils/io/import.test.ts`); validasi
 * berkas memakai `validateBackupText` asli, karena justru itu yang menentukan isi preview.
 */

const EXPORTED_AT = 1_700_000_000_000

const mocks = vi.hoisted(() => ({
  applyBackupDocument: vi.fn(),
  ensure: vi.fn(),
}))

vi.mock('~/utils/io/import', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/io/import')>()),
  applyBackupDocument: mocks.applyBackupDocument,
}))

vi.mock('~/composables/useLocalData', () => ({
  useLocalData: () => ({ ensure: mocks.ensure }),
}))

function recordIdFor(n: number): string {
  return `018f2c4e-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
}

function prefsRecords(count: number): BackupRecordInput[] {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1
    const id = recordIdFor(n)
    return {
      id,
      type: 'user_prefs',
      hlc: `${EXPORTED_AT}-${n}-sourcedevice`,
      deleted: false,
      data: { id, ...DEFAULT_USER_PREFS, updatedAt: EXPORTED_AT },
    }
  })
}

function backupDocument(count = 2): BackupDocument {
  return buildBackupDocument({ records: prefsRecords(count), exportedAtMs: EXPORTED_AT })
}

/** `File` tiruan: `readBackupFileText` hanya butuh `name`/`size`/`text`. */
function jsonFile(content: string, name = 'improve-personal-backup-2023-11-14.json'): File {
  return { name, size: content.length, text: async () => content } as unknown as File
}

let mounted: VueWrapper | null = null

async function mount(): Promise<VueWrapper> {
  mounted = await mountSuspended(BackupImportCard)
  return mounted
}

async function settle(): Promise<void> {
  await flushPromises()
  await nextTick()
}

async function chooseFile(wrapper: VueWrapper, file: File): Promise<void> {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await settle()
}

function importButton(wrapper: VueWrapper) {
  const button = wrapper.findAll('button').find((item) => item.text().startsWith('Import data'))
  if (button === undefined) throw new Error('tombol import tidak ada')
  return button
}

function modeButton(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find((item) => item.text() === label)
  if (button === undefined) throw new Error(`tombol mode "${label}" tidak ada`)
  return button
}

beforeEach(() => {
  mocks.applyBackupDocument.mockReset()
  mocks.ensure.mockReset()
  mocks.ensure.mockResolvedValue({ clock: { nowMs: () => EXPORTED_AT } })
})

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('kartu import', () => {
  it('menolak berkas di atas batas TANPA membaca isinya', async () => {
    const text = vi.fn(async () => serializeBackup(backupDocument()))
    const oversized = { name: 'besar.json', size: BACKUP_MAX_BYTES + 1, text } as unknown as File

    const wrapper = await mount()
    await chooseFile(wrapper, oversized)

    expect(text).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').text()).toContain('terlalu besar')
    expect(wrapper.find('.preview').exists()).toBe(false)
    expect(importButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('menampilkan preview dari dataCount berkas dan mengaktifkan import mode gabung', async () => {
    const wrapper = await mount()
    await chooseFile(wrapper, jsonFile(serializeBackup(backupDocument(2))))

    const preview = wrapper.find('.preview').text()
    expect(preview).toContain('2 data')
    expect(preview).toContain('preferensi')
    expect(preview).toContain('export')
    expect(wrapper.find('.file-name').text()).toContain('improve-personal-backup-2023-11-14.json')

    expect(importButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('mode "ganti semua" butuh konfirmasi eksplisit sebelum import bisa dijalankan', async () => {
    mocks.applyBackupDocument.mockResolvedValue({
      mode: 'replace-all',
      written: 2,
      skipped: 0,
      perType: emptyDataCount(),
      outboxRows: 2,
    })

    const wrapper = await mount()
    await chooseFile(wrapper, jsonFile(serializeBackup(backupDocument(2))))

    await modeButton(wrapper, 'Ganti semua').trigger('click')
    await settle()

    expect(wrapper.text()).toContain('Yakin hapus semua data sekarang dan import file?')
    expect(importButton(wrapper).attributes('disabled')).toBeDefined()

    await importButton(wrapper).trigger('click')
    await settle()
    expect(mocks.applyBackupDocument).not.toHaveBeenCalled()

    await wrapper.find('input[type="checkbox"]').setValue(true)
    await settle()
    expect(importButton(wrapper).attributes('disabled')).toBeUndefined()

    await importButton(wrapper).trigger('click')
    await settle()

    expect(mocks.applyBackupDocument).toHaveBeenCalledTimes(1)
    expect(mocks.applyBackupDocument.mock.calls[0]?.[0]).toMatchObject({
      mode: 'replace-all',
      nowMs: EXPORTED_AT,
    })
  })

  it('menolak berkas dengan dataCount tidak konsisten dan menjelaskan sebabnya', async () => {
    const document = backupDocument(2)
    const tampered: BackupDocument = {
      ...document,
      dataCount: { ...document.dataCount, user_prefs: 99 },
    }

    const wrapper = await mount()
    await chooseFile(wrapper, jsonFile(JSON.stringify(tampered)))

    const alert = wrapper.find('[role="alert"]').text()
    expect(alert).toContain('tidak cocok dengan isinya')
    expect(alert).toContain('angka yang salah')
    expect(wrapper.find('.preview').exists()).toBe(false)
    expect(importButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('menampilkan BackupImportInvariantError sebagai pesan yang bisa dipahami', async () => {
    mocks.applyBackupDocument.mockRejectedValue(
      new BackupImportInvariantError(['todo/abc: dataCount.todo tertulis 99']),
    )

    const wrapper = await mount()
    await chooseFile(wrapper, jsonFile(serializeBackup(backupDocument(2))))
    await importButton(wrapper).trigger('click')
    await settle()

    const alert = wrapper.find('[role="alert"]').text()
    expect(alert).toContain('tidak lolos pemeriksaan akhir')
    expect(alert).toContain('tidak diubah')
    expect(alert).not.toContain('invarian')
  })

  it('menampilkan jumlah data yang benar-benar tertulis setelah import selesai', async () => {
    mocks.applyBackupDocument.mockResolvedValue({
      mode: 'merge',
      written: 2,
      skipped: 0,
      perType: emptyDataCount(),
      outboxRows: 2,
    })

    const wrapper = await mount()
    await chooseFile(wrapper, jsonFile(serializeBackup(backupDocument(2))))
    await importButton(wrapper).trigger('click')
    await settle()

    expect(wrapper.find('[role="status"]').text()).toBe('Import selesai, 2 data masuk.')

    // Berkas yang sama tidak boleh ter-import dua kali tanpa sengaja.
    expect(wrapper.find('.preview').exists()).toBe(false)
    expect(importButton(wrapper).attributes('disabled')).toBeDefined()
  })
})
