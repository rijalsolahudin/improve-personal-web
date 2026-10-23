import { BackupExportLimitError, BACKUP_PLAINTEXT_WARNING } from '@improve-personal/core'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BackupDocument } from '@improve-personal/core'

import BackupExportCard from './BackupExportCard.vue'

/**
 * Kartu Export (PRD F10): peringatan plaintext harus dibaca SEBELUM tombol export ditekan, dan
 * penolakan batas ukuran harus tampil apa adanya - bukan dinaikkan diam-diam.
 *
 * Batas sesi & penyusunan berkas dimock di batasnya (`useLocalData` + `createBackupFile`):
 * penyusunan berkas sungguhan diuji di `utils/io/export.test.ts`, jadi test ini fokus ke perilaku UI.
 */

const NOW = 1_700_000_000_000

const mocks = vi.hoisted(() => ({
  createBackupFile: vi.fn(),
  downloadTextFile: vi.fn(),
  ensure: vi.fn(),
}))

vi.mock('~/utils/io/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/io/export')>()),
  createBackupFile: mocks.createBackupFile,
}))

vi.mock('~/utils/download', () => ({ downloadTextFile: mocks.downloadTextFile }))

vi.mock('~/composables/useLocalData', () => ({
  useLocalData: () => ({ ensure: mocks.ensure }),
}))

let mounted: VueWrapper | null = null

async function mount(): Promise<VueWrapper> {
  mounted = await mountSuspended(BackupExportCard)
  return mounted
}

async function settle(): Promise<void> {
  await flushPromises()
  await nextTick()
}

beforeEach(() => {
  mocks.createBackupFile.mockReset()
  mocks.downloadTextFile.mockReset()
  mocks.ensure.mockReset()
  mocks.ensure.mockResolvedValue({ clock: { nowMs: () => NOW } })
})

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('kartu export', () => {
  it('menampilkan peringatan plaintext SEBELUM tombol export bisa ditekan', async () => {
    const wrapper = await mount()

    const warning = wrapper.find('[role="note"]')
    expect(warning.text()).toBe(BACKUP_PLAINTEXT_WARNING)
    expect(warning.text()).toContain('tidak terenkripsi')

    // Posisi di DOM: peringatan mendahului tombol, jadi tidak mungkin terlewat setelah berkas diunduh.
    const html = wrapper.html()
    expect(html.indexOf(BACKUP_PLAINTEXT_WARNING)).toBeLessThan(html.indexOf('Unduh berkas backup'))

    expect(mocks.createBackupFile).not.toHaveBeenCalled()
    expect(mocks.downloadTextFile).not.toHaveBeenCalled()
  })

  it('menampilkan pesan BackupExportLimitError apa adanya dan tidak mengunduh berkas', async () => {
    const limitError = new BackupExportLimitError('bytes', 40_066_087, 33_554_432)
    mocks.createBackupFile.mockRejectedValue(limitError)

    const wrapper = await mount()
    await wrapper.find('button').trigger('click')
    await settle()

    expect(wrapper.find('[role="alert"]').text()).toBe(limitError.message)
    expect(wrapper.find('[role="alert"]').text()).toContain('melebihi batas')
    expect(mocks.downloadTextFile).not.toHaveBeenCalled()

    // Bukan jalan buntu: tombol hidup lagi supaya user bisa mencoba setelah ruang/data dibereskan.
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('mengunduh berkas dengan nama dari helper core dan mengumumkan jumlah datanya', async () => {
    const document = { records: [{}, {}, {}] } as unknown as BackupDocument
    mocks.createBackupFile.mockResolvedValue({
      name: 'improve-personal-backup-2023-11-14.json',
      text: '{"format":"ip-backup"}',
      document,
    })

    const wrapper = await mount()
    await wrapper.find('button').trigger('click')
    await settle()

    expect(mocks.downloadTextFile).toHaveBeenCalledWith(
      'improve-personal-backup-2023-11-14.json',
      '{"format":"ip-backup"}',
      'application/json',
    )
    expect(wrapper.find('[role="status"]').text()).toContain('3 data')
  })
})
