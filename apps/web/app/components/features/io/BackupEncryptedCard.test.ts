import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import BackupEncryptedCard from './BackupEncryptedCard.vue'

/**
 * Kartu backup terenkripsi (PRD F15). Yang dibuktikan: berkas tidak dibuat sebelum kata sandi lolos
 * aturan (>= 12 karakter, ketik ulang sama), konsekuensi kehilangan data tertulis di kartu, dan kata
 * sandi dikosongkan setelah berkas jadi. Enkripsi sungguhan diuji di `utils/io/export.test.ts`.
 */

const NOW = 1_700_000_000_000

const mocks = vi.hoisted(() => ({
  createEncryptedBackupFile: vi.fn(),
  downloadFile: vi.fn(),
  ensure: vi.fn(),
}))

vi.mock('~/utils/io/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/io/export')>()),
  createEncryptedBackupFile: mocks.createEncryptedBackupFile,
}))

vi.mock('~/utils/download', () => ({ downloadFile: mocks.downloadFile }))

vi.mock('~/composables/useLocalData', () => ({
  useLocalData: () => ({ ensure: mocks.ensure }),
}))

let mounted: VueWrapper | null = null

async function mount(): Promise<VueWrapper> {
  mounted = await mountSuspended(BackupEncryptedCard)
  return mounted
}

async function fill(wrapper: VueWrapper, password: string, confirmation: string): Promise<void> {
  await wrapper.find('#backup-password').setValue(password)
  await wrapper.find('#backup-password-confirm').setValue(confirmation)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  mocks.createEncryptedBackupFile.mockReset()
  mocks.downloadFile.mockReset()
  mocks.ensure.mockReset()
  mocks.ensure.mockResolvedValue({ clock: { nowMs: () => NOW } })
})

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('kartu backup terenkripsi', () => {
  it('menulis konsekuensi kehilangan data sebelum tombol unduh', async () => {
    const wrapper = await mount()
    const note = wrapper.find('[role="note"]').text()

    expect(note).toContain('data hilang permanen')
    expect(note).toContain('Lupa kata sandi backup')
  })

  it('kata sandi < 12 karakter atau ketik ulang beda: tidak membuat berkas', async () => {
    const wrapper = await mount()

    await fill(wrapper, 'pendek', 'pendek')
    expect(wrapper.find('[role="alert"]').text()).toContain('minimal 12')

    await fill(wrapper, 'cukup-panjang-123', 'cukup-panjang-124')
    expect(wrapper.find('[role="alert"]').text()).toContain('belum sama')

    expect(mocks.createEncryptedBackupFile).not.toHaveBeenCalled()
    expect(mocks.downloadFile).not.toHaveBeenCalled()
  })

  it('kata sandi valid: unduh .ipbackup lalu kosongkan kolom kata sandi', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    mocks.createEncryptedBackupFile.mockResolvedValue({
      name: 'improve-personal-backup-2023-11-14.ipbackup',
      bytes,
      recordCount: 4,
    })

    const wrapper = await mount()
    await fill(wrapper, 'Kucing-makan-ikan-7', 'Kucing-makan-ikan-7')

    expect(mocks.createEncryptedBackupFile).toHaveBeenCalledWith(
      expect.objectContaining({ key: { password: 'Kucing-makan-ikan-7' } }),
    )
    expect(mocks.downloadFile).toHaveBeenCalledWith(
      'improve-personal-backup-2023-11-14.ipbackup',
      bytes,
      'application/octet-stream',
    )
    expect(wrapper.find('[role="status"]').text()).toContain('4 data, terenkripsi')
    expect((wrapper.find('#backup-password').element as HTMLInputElement).value).toBe('')
  })
})
