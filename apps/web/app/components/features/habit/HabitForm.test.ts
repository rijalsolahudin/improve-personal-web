import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetHabitsHydrationForTest } from '~/composables/useHabits'
import { resetLocalDataSessionForTest } from '~/composables/useLocalData'
import type { Habit } from '~/utils/habits'

import { TEST_USER_A, signIn } from '../../../../tests/nuxt/local-session'
import HabitForm from './HabitForm.vue'

/**
 * Form habit: menyimpan MENUNGGU tulisan ke penyimpanan selesai, jadi form hanya boleh tertutup kalau
 * tulisannya berhasil (QA F6 - dulu form tertutup seolah sukses lalu habit hilang setelah reload).
 *
 * Kondisi gagal dibuat EKSPLISIT di test ini: penyimpanan lokal milik akun uji tidak bisa dibuka
 * (perangkat terkunci / storage tidak tersedia), sehingga `useLocalData.ensure()` mengembalikan `null`
 * dan setiap tulis dilaporkan gagal. Sebelumnya test ini mengandalkan keadaan kebetulan "tidak ada sesi
 * auth" - hasilnya bergantung timing request sesi dan gagal saat file dijalankan sendiri (Ergonio #86).
 * Semua jalur gagal (simpan/arsip/hapus) memakai satu sesi yang sama; jalur sukses diuji di
 * `useHabits.qa.test.ts` dengan sesi memori.
 */
const EXISTING_ID = '018f2c4e-0000-7000-8000-0000000000aa'

const EXISTING: Habit = {
  id: EXISTING_ID,
  name: 'Jalan pagi',
  icon: 'walking',
  sticker: null,
  color: 0,
  days: null,
  target: 1,
  goalId: null,
  isArchived: false,
}

/**
 * Pembuka penyimpanan lokal yang SELALU gagal.
 *
 * Di-mock di batas penyimpanan (bukan composable internal): sesi data lokal memang tidak bisa dibuka,
 * jadi `save`/`remove`/`setArchived` harus melaporkan gagal - bukan seolah sukses.
 */
const openSession = vi.hoisted(() => vi.fn())

vi.mock('~/utils/storage/session', () => ({
  LocalKeyMissingError: class LocalKeyMissingError extends Error {},
  openLocalDataSession: openSession,
}))

let mounted: VueWrapper | null = null

function seedHabits(habits: readonly Habit[]): void {
  useState<Habit[]>('habits').value = [...habits]
}

/** Tombol berdasarkan teksnya: satu-satunya cara membedakan aksi di baris aksi form. */
function findButton(wrapper: VueWrapper, label: string) {
  return wrapper.findAll('button').find((candidate) => candidate.text() === label)
}

function buttonWith(wrapper: VueWrapper, label: string) {
  const button = findButton(wrapper, label)
  if (!button) throw new Error(`tombol "${label}" tidak ada`)
  return button
}

function alertText(wrapper: VueWrapper): string {
  const alert = wrapper.find('[role="alert"]')
  return alert.exists() ? alert.text() : ''
}

/**
 * Tunggu pesan gagal benar-benar mendarat.
 *
 * `waitFor` berhenti begitu pesannya tampil (tanpa delay tetap), jadi test tetap cepat sekaligus tidak
 * rapuh terhadap jumlah microtask antrean tulis.
 */
async function expectWriteError(wrapper: VueWrapper, text: string): Promise<void> {
  await vi.waitFor(() => expect(alertText(wrapper)).toBe(text))
}

beforeEach(() => {
  clearNuxtState([
    'habits',
    'habitsCheckIns',
    'habitsStatus',
    'habitsError',
    'localData',
    'auth-session',
    'auth-session-pending',
    'auth-session-error',
  ])
  resetHabitsHydrationForTest()
  resetLocalDataSessionForTest()
  openSession.mockReset()
  openSession.mockRejectedValue(new Error('penyimpanan tidak bisa dibuka'))
  signIn(TEST_USER_A)
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
  resetLocalDataSessionForTest()
})

describe('form habit', () => {
  it('simpan gagal: form tetap terbuka, error tampil, dan tidak ada emit sukses', async () => {
    mounted = await mountSuspended(HabitForm, { props: { habitId: null } })

    await mounted.find('input').setValue('Lari pagi')
    await mounted.find('form').trigger('submit')
    await expectWriteError(mounted, 'Gagal menyimpan. Coba lagi.')

    expect(mounted.find('form').exists()).toBe(true)
    expect(mounted.emitted('saved')).toBeUndefined()
    expect(mounted.emitted('close')).toBeUndefined()
    // Tulisan yang gagal tidak boleh meninggalkan habit "hantu" di daftar.
    expect(useState<Habit[]>('habits').value).toEqual([])
  })

  it('nama kosong: pesan validasi tampil dan form tidak tertutup', async () => {
    mounted = await mountSuspended(HabitForm, { props: { habitId: null } })

    await mounted.find('form').trigger('submit')
    await flushPromises()

    expect(alertText(mounted)).toBe('Nama habit wajib diisi.')
    expect(mounted.emitted('saved')).toBeUndefined()
    expect(mounted.find('form').exists()).toBe(true)
  })

  it('tombol Arsipkan hanya untuk habit yang sudah ada', async () => {
    mounted = await mountSuspended(HabitForm, { props: { habitId: null } })
    expect(findButton(mounted, 'Arsipkan habit')).toBeUndefined()
    mounted.unmount()

    seedHabits([EXISTING])
    mounted = await mountSuspended(HabitForm, { props: { habitId: EXISTING_ID } })

    // Bisa dibalik dari daftar arsip, jadi arsip cukup satu klik - tanpa langkah konfirmasi.
    expect(buttonWith(mounted, 'Arsipkan habit').exists()).toBe(true)
  })

  it('arsip gagal: form tetap terbuka dan user diberi tahu', async () => {
    seedHabits([EXISTING])
    mounted = await mountSuspended(HabitForm, { props: { habitId: EXISTING_ID } })

    await buttonWith(mounted, 'Arsipkan habit').trigger('click')
    await expectWriteError(mounted, 'Gagal mengarsipkan. Coba lagi.')

    expect(mounted.emitted('close')).toBeUndefined()
    expect(useState<Habit[]>('habits').value[0]?.isArchived).toBe(false)
  })

  it('hapus gagal: form tidak tertutup, habit masih ada, dan user diberi tahu', async () => {
    seedHabits([EXISTING])
    mounted = await mountSuspended(HabitForm, { props: { habitId: EXISTING_ID } })

    await buttonWith(mounted, 'Hapus habit').trigger('click')
    await buttonWith(mounted, 'Yakin hapus? Riwayat ikut hilang').trigger('click')
    await expectWriteError(mounted, 'Gagal menghapus. Coba lagi.')

    expect(mounted.emitted('close')).toBeUndefined()
    expect(useState<Habit[]>('habits').value.map((habit) => habit.id)).toEqual([EXISTING_ID])
  })
})
