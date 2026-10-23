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
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyBackupDocument } from '~/utils/io/import'

import BackupImportCard from './BackupImportCard.vue'

/**
 * Re-QA #55 (verifikasi BUG-55-A hilang di level UI) - ditulis independen.
 *
 * `~/utils/io/import` TIDAK di-mock: kartu memakai `applyBackupDocument` asli di atas adapter memori
 * core, jadi "data tidak tersentuh" dibuktikan dari isi penyimpanan dan jumlah `wipe()`, bukan dari
 * "mock tidak dipanggil".
 *
 * Semua interaksi memakai elemen DOM asli (`HTMLElement.click()`), bukan hanya memeriksa prop:
 * tombol yang `disabled` harus benar-benar tidak bisa dipakai.
 */

const NOW = 1_700_000_000_000
const OLD_IDS = [101, 102, 103] as const
const FILE_IDS = [1, 2] as const

const mocks = vi.hoisted(() => ({ ensure: vi.fn() }))

vi.mock('~/composables/useLocalData', () => ({ useLocalData: () => ({ ensure: mocks.ensure }) }))

function idFor(n: number): string {
  return `018f2c4e-0000-7000-8000-${n.toString(16).padStart(12, '0')}`
}

function recordsFor(ids: readonly number[]): BackupRecordInput[] {
  return ids.map((n) => ({
    id: idFor(n),
    type: 'user_prefs',
    hlc: `${NOW}-${n}-sumber`,
    deleted: false,
    data: { id: idFor(n), ...DEFAULT_USER_PREFS, updatedAt: NOW },
  }))
}

function documentText(ids: readonly number[]): string {
  return serializeBackup(buildBackupDocument({ records: recordsFor(ids), exportedAtMs: NOW }))
}

type Harness = {
  readonly session: {
    readonly storage: StorageAdapter
    readonly provider: CryptoProvider
    readonly dataKey: SecureKeyMaterial
    readonly hlc: ReturnType<typeof createHlcGenerator>
    readonly clock: ReturnType<typeof createManualClock>
  }
  readonly counters: { wipe: number }
}

function createHarness(): Harness {
  const clock = createManualClock(NOW)
  const memory = createMemoryStorage({ clock })
  const counters = { wipe: 0 }

  const storage: StorageAdapter = {
    ...memory,
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

async function seedOldData(harness: Harness): Promise<void> {
  await applyBackupDocument({
    target: harness.session,
    document: buildBackupDocument({ records: recordsFor(OLD_IDS), exportedAtMs: NOW }),
    mode: 'merge',
    nowMs: NOW,
  })
  harness.counters.wipe = 0
}

async function hasRecord(harness: Harness, id: string): Promise<boolean> {
  return (await harness.session.storage.getRecord(id)) !== null
}

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

function buttonByText(wrapper: VueWrapper, text: string): DOMWrapper<Element> {
  const found = wrapper.findAll('button').find((button) => button.text() === text)
  if (found === undefined) throw new Error(`tombol "${text}" tidak ditemukan`)
  return found
}

function importButton(wrapper: VueWrapper): DOMWrapper<Element> {
  const found = wrapper.findAll('button').find((button) => button.text().includes('Import data'))
  if (found === undefined) throw new Error('tombol import tidak ditemukan')
  return found
}

function nativeDisabled(wrapper: VueWrapper, text: string): boolean {
  const element = buttonByText(wrapper, text).element
  return element instanceof HTMLButtonElement ? element.disabled : false
}

async function uploadFile(wrapper: VueWrapper, content: string): Promise<void> {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    value: [{ name: 'backup.json', size: content.length, text: async () => content }],
    configurable: true,
  })
  await input.trigger('change')
  await flushPromises()
}

let mounted: VueWrapper | null = null

async function mountCard(harness: Harness): Promise<VueWrapper> {
  mocks.ensure.mockResolvedValue(harness.session)
  mounted = await mountSuspended(BackupImportCard)
  await uploadFile(mounted, documentText(FILE_IDS))
  expect(mounted.text()).toContain('2 data')
  return mounted
}

beforeEach(() => {
  mocks.ensure.mockReset()
})

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('BackupImportCard - mode terkunci selama import berjalan (adapter nyata)', () => {
  it('(a+f) saat "Mengimpor…" tombol mode benar-benar disabled: klik native tidak mengubah mode, eksekusi tetap merge', async () => {
    const harness = createHarness()
    await seedOldData(harness)
    const wrapper = await mountCard(harness)

    const elementBefore = buttonByText(wrapper, 'Ganti semua').element as HTMLButtonElement
    expect(elementBefore.disabled).toBe(false)

    const gate = holdEnsure(harness)
    const importElement = importButton(wrapper).element as HTMLButtonElement
    importElement.click()
    await flushPromises()
    expect(wrapper.text()).toContain('Mengimpor')

    // 1. Status disabled nyata di DOM (properti, bukan cuma atribut/prop).
    const replaceElement = buttonByText(wrapper, 'Ganti semua').element as HTMLButtonElement
    const mergeElement = buttonByText(wrapper, 'Gabung').element as HTMLButtonElement
    expect(replaceElement.disabled).toBe(true)
    expect(mergeElement.disabled).toBe(true)
    expect(buttonByText(wrapper, 'Ganti semua').attributes('disabled')).toBeDefined()
    expect(importElement.disabled).toBe(true)
    expect((wrapper.find('input[type="file"]').element as HTMLInputElement).disabled).toBe(true)

    // 2. Klik native pada tombol disabled tidak mengubah pilihan mode.
    expect(buttonByText(wrapper, 'Gabung').attributes('aria-pressed')).toBe('true')
    expect(buttonByText(wrapper, 'Ganti semua').attributes('aria-pressed')).toBe('false')
    replaceElement.click()
    await flushPromises()
    expect(buttonByText(wrapper, 'Ganti semua').attributes('aria-pressed')).toBe('false')
    expect(buttonByText(wrapper, 'Gabung').attributes('aria-pressed')).toBe('true')
    // Blok konfirmasi "ganti semua" tidak muncul, jadi tidak ada jalan ke replace-all tanpa centang.
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)

    gate.release()
    await flushPromises()

    // 3. Eksekusi nyata: merge - data lama & isi berkas sama-sama ada, tidak ada wipe.
    expect(harness.counters.wipe).toBe(0)
    for (const n of OLD_IDS) expect(await hasRecord(harness, idFor(n))).toBe(true)
    for (const n of FILE_IDS) expect(await hasRecord(harness, idFor(n))).toBe(true)
    expect(wrapper.text()).toContain('Import selesai')
    expect(wrapper.text()).not.toContain('Semua data diganti')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('(b+c) replace-all tanpa centang tidak bisa dieksekusi & data utuh; setelah dicentang tetap berjalan penuh', async () => {
    const harness = createHarness()
    await seedOldData(harness)
    const wrapper = await mountCard(harness)

    await buttonByText(wrapper, 'Ganti semua').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Yakin hapus semua data sekarang')
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true)

    // Tombol import benar-benar mati: klik native tidak menulis apa pun dan tidak memunculkan error.
    const importElement = importButton(wrapper).element as HTMLButtonElement
    expect(importElement.disabled).toBe(true)
    importElement.click()
    await flushPromises()

    expect(harness.counters.wipe).toBe(0)
    for (const n of OLD_IDS) expect(await hasRecord(harness, idFor(n))).toBe(true)
    for (const n of FILE_IDS) expect(await hasRecord(harness, idFor(n))).toBe(false)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    // Pilihan masih ada: user tinggal mencentang konfirmasi.
    expect(wrapper.text()).toContain('2 data')

    await wrapper.find('input[type="checkbox"]').setValue(true)
    expect(importButton(wrapper).element instanceof HTMLButtonElement).toBe(true)
    expect((importButton(wrapper).element as HTMLButtonElement).disabled).toBe(false)

    await importButton(wrapper).trigger('click')
    await flushPromises()

    expect(harness.counters.wipe).toBe(1)
    for (const n of OLD_IDS) expect(await hasRecord(harness, idFor(n))).toBe(false)
    for (const n of FILE_IDS) expect(await hasRecord(harness, idFor(n))).toBe(true)
    expect(wrapper.text()).toContain('Semua data diganti')
    expect(wrapper.text()).toContain('2 data masuk')
    // Sukses membersihkan pilihan: nama berkas & preview hilang, tombol import mati lagi.
    expect(wrapper.text()).not.toContain('Dipilih:')
    expect(wrapper.find('.preview').exists()).toBe(false)
    expect((importButton(wrapper).element as HTMLButtonElement).disabled).toBe(true)
  })

  it('(f) jalur gagal: tombol mode hidup lagi setelah import selesai (disabled tidak nyangkut) dan tidak ada data ditulis', async () => {
    const harness = createHarness()
    await seedOldData(harness)
    const wrapper = await mountCard(harness)

    let releaseEnsure: () => void = () => {}
    mocks.ensure.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseEnsure = () => resolve(null)
        }),
    )

    const importElement = importButton(wrapper).element as HTMLButtonElement
    importElement.click()
    await flushPromises()
    expect(wrapper.text()).toContain('Mengimpor')
    expect(nativeDisabled(wrapper, 'Ganti semua')).toBe(true)

    releaseEnsure()
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Data lokal belum bisa dibuka')
    expect(nativeDisabled(wrapper, 'Ganti semua')).toBe(false)
    expect(nativeDisabled(wrapper, 'Gabung')).toBe(false)
    expect(harness.counters.wipe).toBe(0)
    for (const n of OLD_IDS) expect(await hasRecord(harness, idFor(n))).toBe(true)
    for (const n of FILE_IDS) expect(await hasRecord(harness, idFor(n))).toBe(false)
  })

  it('(d) double submit di mode replace-all tetap satu kali tulis', async () => {
    const harness = createHarness()
    await seedOldData(harness)
    const wrapper = await mountCard(harness)

    await buttonByText(wrapper, 'Ganti semua').trigger('click')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await flushPromises()

    const importElement = importButton(wrapper).element as HTMLButtonElement
    expect(importElement.disabled).toBe(false)
    // Dua klik dalam tick yang sama: klik kedua terjadi sebelum Vue sempat men-disable tombol,
    // jadi yang menahan adalah guard `isBusy` di composable.
    importElement.click()
    importElement.click()
    await flushPromises()

    expect(harness.counters.wipe).toBe(1)
    expect(wrapper.text().split('Import selesai').length - 1).toBe(1)
    for (const n of FILE_IDS) expect(await hasRecord(harness, idFor(n))).toBe(true)
  })
})
