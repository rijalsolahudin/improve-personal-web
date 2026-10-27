import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocalDataState } from '~/composables/useLocalData'
import { resetLocalDataSessionForTest, useLocalData } from '~/composables/useLocalData'
import type { LocalDataSession } from '~/utils/storage/session'
import { SYNC_STATE_EVENT } from '~/utils/sync/events'
import {
  QUARANTINE_STORAGE_KEY,
  QUARANTINE_TTL_MS,
  clearQuarantineForTest,
  isQuarantined,
  quarantineRecord,
} from '~/utils/sync/quarantine'
import { registerSyncReloader, resetSyncReloadersForTest } from '~/utils/sync/refresh'

import ShellSyncStatus from './ShellSyncStatus.vue'

import { TEST_USER_A, createMemoryLocalSession, signIn } from '../../../../tests/nuxt/local-session'
// Klaim identitas kunci (`PUT /v1/keys/identity`) berjalan sebelum `ready`; jaringan dimock di batas.
mockNuxtImport('$fetch', () => async () => ({
  data: {
    kid: 'LBaTVGaXKfW710NOCIXptA',
    claimedAt: '2026-10-27T00:00:00.000Z',
    claimedByDeviceLabel: null,
  },
}))

/**
 * Pemulihan record terkarantina dari sisi UI.
 *
 * Yang dijaga: aksi user ("Coba buka ulang") dan jalur otomatis saat halaman dibuka sama-sama
 * MEMBANGUN ULANG `record_index` dari blob lokal - bukan sekadar membersihkan karantina lalu berharap
 * server mengirim ulang record yang cursor-nya sudah lewat. Tanpa index baru, record tetap tidak
 * tampil sampai halaman dimuat ulang.
 */

const requestSyncNow = vi.hoisted(() => vi.fn())

vi.mock('~/utils/sync/controller', () => ({
  requestSyncNow,
  startSync: vi.fn(() => vi.fn()),
  stopSync: vi.fn(),
}))

const openSession = vi.hoisted(() => vi.fn())

vi.mock('~/utils/storage/session', () => ({
  LocalKeyMissingError: class LocalKeyMissingError extends Error {},
  openLocalDataSession: openSession,
}))

const ID_RECOVERED = '018f2c4e-0000-7000-8000-0000000000e1'
const ID_STILL_BLOCKED = '018f2c4e-0000-7000-8000-0000000000e2'
const NOW_MS = 1_700_000_000_000

const IDLE_STATE: LocalDataState = {
  status: 'idle',
  isFreshKey: false,
  deviceId: null,
  userId: null,
  error: null,
}

function todoData(id: string): unknown {
  return {
    id,
    title: 'Tugas yang dulu tidak bisa dibuka',
    note: null,
    deadlineAt: NOW_MS,
    priority: 'medium',
    isDone: false,
    completedAt: null,
    scheduleId: null,
    scheduleOccurrenceAt: null,
    createdAt: NOW_MS - 1_000,
    updatedAt: NOW_MS - 1_000,
  }
}

/**
 * Tulis record seperti hasil pull yang dulu gagal di-index: blob ada di `record`, baris `record_index`
 * tidak ada, dan baris outbox sudah bersih (server sudah punya record ini).
 */
async function seedWithoutIndex(session: LocalDataSession, id: string): Promise<void> {
  await session.writer.write({
    type: 'todo',
    id,
    data: (recordId) => todoData(recordId),
    index: { rangeStartMs: NOW_MS, rangeEndMs: NOW_MS },
  })

  await session.storage.runTransaction('seed.keep', async (tx) => {
    await tx.putRecordIndex(id, null)
  })

  const queued = await session.storage.listOutbox(50)
  await session.storage.deleteOutboxRows(queued.map((row) => row.id))
}

/** Karantina kedaluwarsa: `quarantineRecord` selalu memakai waktu sekarang. */
function quarantineAsDue(recordId: string): void {
  localStorage.setItem(
    QUARANTINE_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      owners: {
        [TEST_USER_A]: [{ atMs: Date.now() - QUARANTINE_TTL_MS - 60_000, ids: [recordId] }],
      },
    }),
  )
}

async function isIndexed(session: LocalDataSession, recordId: string): Promise<boolean> {
  const rows = await session.storage.queryByRange({
    entityTypes: ['todo'],
    fromMs: NOW_MS - 60_000,
    toMs: NOW_MS + 60_000,
  })

  return rows.some((row) => row.id === recordId)
}

function open(): LocalDataSession {
  const session = useLocalData().current()
  if (session === null) throw new Error('sesi data lokal harus terbuka')

  return session
}

let mounted: VueWrapper | null = null

async function mountSyncStatus(): Promise<VueWrapper> {
  mounted = await mountSuspended(ShellSyncStatus)
  await flushPromises()
  return mounted
}

beforeEach(async () => {
  clearNuxtState(['localData', 'auth-session', 'auth-session-pending', 'auth-session-error', 'now'])
  useState<LocalDataState>('localData').value = { ...IDLE_STATE }
  resetLocalDataSessionForTest()
  resetSyncReloadersForTest()
  clearQuarantineForTest()
  requestSyncNow.mockReset()

  openSession.mockReset()
  openSession.mockResolvedValue(createMemoryLocalSession(TEST_USER_A))

  signIn(TEST_USER_A)
  const opened = await useLocalData().ensure()
  expect(opened?.userId).toBe(TEST_USER_A)
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  resetSyncReloadersForTest()
  resetLocalDataSessionForTest()
  clearQuarantineForTest()
  await flushPromises()
})

describe('tombol "Coba buka ulang" membangun ulang index', () => {
  it('record kembali muncul di query index, tanpa menambah outbox, lalu satu siklus diminta', async () => {
    const session = open()
    await seedWithoutIndex(session, ID_RECOVERED)
    quarantineRecord(TEST_USER_A, ID_RECOVERED)

    const reloaded = vi.fn(async () => undefined)
    registerSyncReloader('tasks', reloaded)

    const wrapper = await mountSyncStatus()
    await vi.waitFor(() => expect(wrapper.find('button.blocked-retry').exists()).toBe(true))

    expect(await isIndexed(session, ID_RECOVERED)).toBe(false)
    expect(await session.storage.countOutbox()).toBe(0)

    await wrapper.get('button.blocked-retry').trigger('click')
    await flushPromises()

    await vi.waitFor(() => expect(wrapper.find('button.blocked-retry').exists()).toBe(false))
    expect(await isIndexed(session, ID_RECOVERED)).toBe(true)
    expect(isQuarantined(TEST_USER_A, ID_RECOVERED)).toBe(false)
    // Index yang dibangun ulang bukan perubahan data: tidak ada push baru yang dibuat.
    expect(await session.storage.countOutbox()).toBe(0)
    expect(requestSyncNow).toHaveBeenCalledTimes(1)
    // Store yang ter-hydrate dimuat ulang, jadi record pulih langsung terlihat tanpa reload halaman.
    await vi.waitFor(() => expect(reloaded).toHaveBeenCalledTimes(1))
  })
})

describe('percobaan ulang otomatis saat halaman dibuka', () => {
  it('karantina yang SELURUHNYA sudah kedaluwarsa tetap dipulihkan tanpa aksi user', async () => {
    const session = open()
    await seedWithoutIndex(session, ID_RECOVERED)
    // Tanpa ini, gerbang `blockedCount` akan 0 dan record tidak pernah dicoba lagi: ia tidak lagi
    // menghalangi pull, tetapi juga tidak tampil karena server tidak akan mengirimnya ulang.
    quarantineAsDue(ID_RECOVERED)

    const wrapper = await mountSyncStatus()

    await vi.waitFor(async () => expect(await isIndexed(session, ID_RECOVERED)).toBe(true))
    expect(isQuarantined(TEST_USER_A, ID_RECOVERED)).toBe(false)
    await vi.waitFor(() => expect(wrapper.text()).not.toContain('tidak bisa dibuka'))
    expect(requestSyncNow).not.toHaveBeenCalled()
  })

  it('hanya menyentuh karantina kedaluwarsa, sekali per mount, dan jumlahnya ikut turun', async () => {
    const session = open()
    await seedWithoutIndex(session, ID_RECOVERED)
    quarantineAsDue(ID_RECOVERED)
    // Satu entri yang masih BARU: gerbang `blockedCount > 0` butuh angka ini, dan reindex `dueOnly`
    // tidak boleh menyentuhnya.
    quarantineRecord(TEST_USER_A, ID_STILL_BLOCKED)

    const reloaded = vi.fn(async () => undefined)
    registerSyncReloader('tasks', reloaded)

    const wrapper = await mountSyncStatus()

    // `blockedCount` = sisa yang benar-benar masih terkarantina setelah reindex otomatis.
    await vi.waitFor(() => expect(wrapper.text()).toContain('1 data tidak bisa dibuka'))
    await vi.waitFor(async () => expect(await isIndexed(session, ID_RECOVERED)).toBe(true))

    expect(isQuarantined(TEST_USER_A, ID_RECOVERED)).toBe(false)
    expect(isQuarantined(TEST_USER_A, ID_STILL_BLOCKED)).toBe(true)
    expect(await isIndexed(session, ID_STILL_BLOCKED)).toBe(false)

    // Event berikutnya tidak menjalankan percobaan yang sama lagi, dan tidak meminta siklus sendiri.
    window.dispatchEvent(new Event(SYNC_STATE_EVENT))
    window.dispatchEvent(new Event(SYNC_STATE_EVENT))
    await flushPromises()

    expect(reloaded).toHaveBeenCalledTimes(1)
    expect(requestSyncNow).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('1 data tidak bisa dibuka')
  })
})
