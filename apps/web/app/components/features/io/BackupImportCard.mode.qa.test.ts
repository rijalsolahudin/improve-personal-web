import {
  DEFAULT_USER_PREFS,
  buildBackupDocument,
  emptyDataCount,
  serializeBackup,
  type BackupRecordInput,
} from '@improve-personal/core'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BackupImportCard from './BackupImportCard.vue'

/**
 * Regresi BUG-55-A di level UI (QA #55): selama `applyImport` berjalan, tombol mode harus mati
 * seperti input berkas & checkbox konfirmasi - dan kalaupun mode berubah lewat jalur programatik,
 * import tetap memakai keputusan yang sudah dikunci (mode "gabung").
 *
 * Yang diuji hanya jalur yang benar-benar bisa diklik: input berkas, `Segmented` mode, dan checkbox
 * konfirmasi.
 */

const NOW = 1_700_000_000_000

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

function idFor(n: number): string {
  return `018f2c4e-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
}

function documentText(ids: readonly number[]): string {
  const records: BackupRecordInput[] = ids.map((n) => ({
    id: idFor(n),
    type: 'user_prefs',
    hlc: `${NOW}-${n}-sumber`,
    deleted: false,
    data: { id: idFor(n), ...DEFAULT_USER_PREFS, updatedAt: NOW },
  }))
  return serializeBackup(buildBackupDocument({ records, exportedAtMs: NOW }))
}

const RESULT = {
  mode: 'merge' as const,
  written: 2,
  skipped: 0,
  perType: emptyDataCount(),
  outboxRows: 2,
}

beforeEach(() => {
  mocks.applyBackupDocument.mockReset()
  mocks.ensure.mockReset()
  mocks.applyBackupDocument.mockResolvedValue(RESULT)
})

describe('BackupImportCard - mode saat import berjalan', () => {
  it('"Ganti semua" tidak bisa dipilih selagi import berjalan (tanpa konfirmasi)', async () => {
    const wrapper = await mountSuspended(BackupImportCard)

    const content = documentText([1, 2])
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [{ name: 'a.json', size: content.length, text: async () => content }],
      configurable: true,
    })
    await input.trigger('change')
    await flushPromises()
    expect(wrapper.text()).toContain('2 data')

    let releaseEnsure: () => void = () => {}
    mocks.ensure.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseEnsure = () => resolve({ clock: { nowMs: () => NOW } })
        }),
    )

    const importButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Import data'))
    expect(importButton).toBeDefined()
    await importButton?.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Mengimpor')

    const replaceButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Ganti semua')
    expect(replaceButton).toBeDefined()

    // Selagi "Mengimpor…" tombol mode harus mati, sama seperti input berkas & checkbox konfirmasi.
    expect(replaceButton?.attributes('disabled')).toBeDefined()
    await replaceButton?.trigger('click')

    releaseEnsure()
    await flushPromises()

    expect(mocks.applyBackupDocument).toHaveBeenCalledTimes(1)
    expect(mocks.applyBackupDocument.mock.calls[0]?.[0]).toMatchObject({ mode: 'merge' })
  })
})
