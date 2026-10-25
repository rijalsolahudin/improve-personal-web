import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetSchedulesHydrationForTest } from '~/composables/useSchedules'
import type { JournalDay } from '~/utils/journal'
import type { Memo, MoodByDate } from '~/utils/memo'
import type { Schedule } from '~/utils/schedule'

import MemoPage from './memo.vue'

/**
 * QA T11 - halaman Journal (PRD F8): 4 bagian harian, chip `@jadwal` + jadwal terhapus, isi jurnal
 * dirender aman (tanpa HTML mentah), satu isian per tanggal, Diary Book, dan pencarian lokal.
 *
 * Data disemai lewat `useState` yang sama dengan yang dibaca halaman/composable - bukan dengan
 * mem-mock composable internal - supaya yang diuji adalah jalur data yang benar-benar dipakai.
 */

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn(async () => {}) }))
mockNuxtImport('navigateTo', () => navigateToMock)

/** Rabu, 10 September 2025, 10:00 waktu perangkat. */
const NOW = new Date(2025, 8, 10, 10, 0, 0).getTime()
const TODAY = '2025-09-10'
const YESTERDAY = '2025-09-09'
const LAST_WEEK = '2025-09-03'

const KELAS: Schedule = {
  id: 'sched-kelas',
  title: 'Kelas AWS',
  color: 0,
  start: TODAY,
  time: '09:00',
  dur: 90,
  allDay: false,
  rec: { type: 'once' },
  ends: { type: 'never' },
  exceptions: [],
  goalId: null,
}

const memo = (overrides: Partial<Memo> = {}): Memo => ({
  id: 'memo',
  date: TODAY,
  createdAt: new Date(2025, 8, 10, 20, 0).getTime(),
  title: '',
  text: '',
  feelings: [],
  paper: 'krem',
  ...overrides,
})

const DAY: JournalDay = {
  affirm: 'Aku cukup. Aku bisa pelan-pelan.',
  reflect: 'Belajar sabar sama proses.',
  feelingNote: 'Capek tapi lega.',
  grat: ['Kopi pagi'],
  sad: ['Rapat molor'],
  better: ['Tidur lebih awal'],
}

let mounted: VueWrapper | null = null

interface MemoStore {
  memos: Memo[]
  moods: MoodByDate
}

function seed(memos: Memo[], moods: MoodByDate = {}, days: Record<string, JournalDay> = {}): void {
  useState<number>('now').value = NOW
  useState<Schedule[]>('schedules').value = [KELAS]
  useState('goals').value = []
  useState<MemoStore>('memos').value = { memos, moods }
  useState<Record<string, JournalDay>>('journal-days').value = days
  useState<string>('memo-selected').value = TODAY
  useState('memo-draft').value = { title: '', text: '', feelings: [] }
  useState('calendar-selected').value = TODAY
  useState('calendar-anchor').value = TODAY
}

async function mountPage(): Promise<VueWrapper> {
  const wrapper = await mountSuspended(MemoPage)
  await flushPromises()
  return wrapper
}

const entries = (wrapper: VueWrapper) => wrapper.findAll('.pages > .entry')
const dateButtons = (wrapper: VueWrapper) => wrapper.findAll('.strip .date')
const button = (wrapper: VueWrapper, label: string) =>
  wrapper.findAll('button').find((item) => item.text() === label)

beforeEach(() => {
  resetSchedulesHydrationForTest()
  navigateToMock.mockClear()
})

afterEach(async () => {
  mounted?.unmount()
  mounted = null
  await flushPromises()
})

describe('T11 4 bagian harian', () => {
  it('perasaan + mood, afirmasi, refleksi (3 daftar), dan diary tampil terisi', async () => {
    seed([memo({ text: 'Hari ini belajar IAM.' })], { [TODAY]: 4 }, { [TODAY]: DAY })
    mounted = await mountPage()

    // 1. Perasaan: mood 5 skala + cerita.
    expect(mounted.find('[data-anchor="journal-feeling"]').exists()).toBe(true)
    expect(mounted.findAll('.moods .mood')).toHaveLength(5)
    expect(mounted.find('.moods .mood[aria-pressed="true"]').text()).toContain('😄')
    expect((mounted.find('textarea.note').element as HTMLTextAreaElement).value).toBe(
      'Capek tapi lega.',
    )

    // 3. Afirmasi.
    expect(mounted.find('[data-anchor="journal-affirm"]').exists()).toBe(true)
    expect((mounted.find('textarea.affirm').element as HTMLTextAreaElement).value).toBe(DAY.affirm)

    // 4. Refleksi: teks + tiga daftar (syukur / sedih / bisa lebih baik).
    expect(mounted.find('[data-anchor="journal-reflect"]').exists()).toBe(true)
    expect((mounted.find('textarea.reflect').element as HTMLTextAreaElement).value).toBe(
      DAY.reflect,
    )
    expect(mounted.find('[data-anchor="journal-lists"]').exists()).toBe(true)
    const listTitles = mounted
      .findAll('[data-anchor="journal-lists"] h3.head')
      .map((item) => item.text())
    expect(listTitles).toEqual([
      'Hari ini bersyukur karena…',
      'Yang bikin sedih',
      'Yang bisa lebih baik',
    ])
    const rowValues = mounted
      .findAll('[data-anchor="journal-lists"] .row input')
      .map((item) => (item.element as HTMLInputElement).value)
      .filter(Boolean)
    expect(rowValues).toEqual(['Kopi pagi', 'Rapat molor', 'Tidur lebih awal'])

    // 5. Diary (editor bebas + entri tersimpan).
    expect(mounted.find('[data-anchor="memo-editor"]').exists()).toBe(true)
    expect(mounted.find('section.sheet textarea.paper').exists()).toBe(true)
    expect(entries(mounted)).toHaveLength(1)
    expect(mounted.find('.entry .body').text()).toContain('Hari ini belajar IAM.')
  })

  it('mood satu per tanggal: klik mood menyimpan untuk tanggal itu saja', async () => {
    seed([], {}, {})
    mounted = await mountPage()

    const mood = mounted.findAll('.moods .mood')[1]
    if (!mood) throw new Error('tombol mood tidak ada')
    await mood.trigger('click')
    await flushPromises()

    expect(useState<MemoStore>('memos').value.moods[TODAY]).toBe(1)
    expect(useState<MemoStore>('memos').value.moods[YESTERDAY]).toBeUndefined()
  })
})

describe('T11 mention @jadwal', () => {
  it('mention tampil sebagai chip dan klik membuka kalender di tanggal jurnal', async () => {
    seed([memo({ text: 'Pagi ikut @[sched-kelas] seru.' })], {}, {})
    mounted = await mountPage()

    const chip = mounted.find('.entry .body button.mention')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toBe('@Kelas AWS')

    await chip.trigger('click')
    await flushPromises()

    expect(navigateToMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock).toHaveBeenCalledWith('/app/kalender')
    expect(useState<string>('calendar-selected').value).toBe(TODAY)
    expect(useState<string>('calendar-anchor').value).toBe(TODAY)
  })

  it('ketik @ menawarkan jadwal sekitar tanggal, dipilih jadi token lalu tampil sebagai chip', async () => {
    seed([], {}, {})
    mounted = await mountPage()

    const paper = mounted.find('section.sheet textarea.paper')
    await paper.setValue('Pagi ikut @kel')
    await flushPromises()

    const option = mounted.find('.suggest-item')
    expect(option.exists()).toBe(true)
    expect(option.text()).toContain('Kelas AWS')

    await option.trigger('click')
    await flushPromises()
    expect((paper.element as HTMLTextAreaElement).value).toBe('Pagi ikut @[sched-kelas] ')

    const save = button(mounted, 'Simpan ke jurnal')
    if (!save) throw new Error('tombol simpan tidak ada')
    await save.trigger('click')
    await flushPromises()

    const chip = mounted.find('.entry .body button.mention')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toBe('@Kelas AWS')
  })

  it('jadwal yang sudah dihapus jadi teks "jadwal dihapus" tanpa error & tanpa navigasi', async () => {
    seed(
      [
        memo({ text: 'Ketemu di @[sched-hilang] ternyata batal.' }),
        memo({ id: 'lain', text: '@[sched-kelas]' }),
      ],
      {},
      {},
    )
    mounted = await mountPage()

    const deleted = mounted.find('.entry .body .mention.deleted')
    expect(deleted.exists()).toBe(true)
    expect(deleted.text()).toBe('@jadwal dihapus')
    expect(deleted.element.tagName).not.toBe('BUTTON')

    await deleted.trigger('click')
    await flushPromises()
    expect(navigateToMock).not.toHaveBeenCalled()

    // Entri lain tetap tampil normal: satu mention yatim tidak mematikan halaman.
    expect(entries(mounted)).toHaveLength(2)
    expect(mounted.find('.entry .body button.mention').text()).toBe('@Kelas AWS')
  })
})

describe('T11 keamanan render isi jurnal', () => {
  it('HTML/script dari isi jurnal dirender sebagai teks, tidak menjadi elemen', async () => {
    seed(
      [
        memo({
          id: 'xss',
          title: '<img src=x onerror="window.__pwned=1">',
          text: '<script>window.__pwned=2</script> <b>tebal</b> @[sched-kelas]',
        }),
      ],
      {},
      {},
    )
    mounted = await mountPage()

    const entry = mounted.find('.entry')
    expect(entry.find('img').exists()).toBe(false)
    expect(entry.find('script').exists()).toBe(false)
    expect(entry.find('b').exists()).toBe(false)
    // Teks mentah tetap terbaca apa adanya (di-escape Vue, bukan dihapus).
    expect(entry.find('.title').text()).toContain('<img src=x')
    expect(entry.find('.body').text()).toContain('<script>window.__pwned=2</script>')
    expect(entry.find('.body').text()).toContain('<b>tebal</b>')
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('komponen jurnal & memo tidak memakai v-html/innerHTML/eval untuk data user', () => {
    const directories = ['app/components/features/journal', 'app/components/features/memo']
    const files: string[] = [join(process.cwd(), 'app/pages/app/memo.vue')]
    for (const directory of directories) {
      const absolute = join(process.cwd(), directory)
      for (const name of readdirSync(absolute)) {
        if (/\.(vue|ts)$/.test(name)) files.push(join(absolute, name))
      }
    }

    const offenders = files.filter((file) =>
      /v-html|innerHTML|new Function|\beval\(/.test(readFileSync(file, 'utf8')),
    )
    expect(offenders).toEqual([])
  })
})

describe('T11 satu isian per tanggal', () => {
  it('isi bagian harian disimpan per tanggal dan ditulis ulang (update), bukan menumpuk', async () => {
    seed([], { [YESTERDAY]: 2 }, {})
    mounted = await mountPage()

    const note = mounted.find('textarea.affirm')
    await note.setValue('Cukup')
    await flushPromises()
    await note.setValue('Cukup hari ini')
    await flushPromises()

    const days = useState<Record<string, JournalDay>>('journal-days').value
    expect(Object.keys(days)).toEqual([TODAY])
    expect(days[TODAY]?.affirm).toBe('Cukup hari ini')

    // Pindah tanggal lalu isi: tanggal lain punya isian sendiri, hari ini tetap satu.
    const other = dateButtons(mounted)[1]
    if (!other) throw new Error('tombol tanggal kedua tidak ada')
    await other.trigger('click')
    await flushPromises()
    await mounted.find('textarea.affirm').setValue('Hari lain')
    await flushPromises()
    expect(Object.keys(useState<Record<string, JournalDay>>('journal-days').value).sort()).toEqual(
      [TODAY, YESTERDAY].sort(),
    )

    // Balik ke hari ini: isian sebelumnya muncul lagi (bukan entri duplikat).
    const back = dateButtons(mounted)[0]
    if (!back) throw new Error('tombol tanggal pertama tidak ada')
    await back.trigger('click')
    await flushPromises()
    expect((mounted.find('textarea.affirm').element as HTMLTextAreaElement).value).toBe(
      'Cukup hari ini',
    )
  })

  it('satu kali simpan diary membuat satu halaman jurnal', async () => {
    seed([], {}, {})
    mounted = await mountPage()

    await mounted.find('section.sheet textarea.paper').setValue('Hari ini tenang.')
    await flushPromises()
    const save = button(mounted, 'Simpan ke jurnal')
    if (!save) throw new Error('tombol simpan tidak ada')
    await save.trigger('click')
    await flushPromises()

    expect(entries(mounted)).toHaveLength(1)
    expect(mounted.find('.entry .body').text()).toContain('Hari ini tenang.')
  })

  // BUG T11-01 (PRD F8 "satu jurnal per tanggal, bukan banyak entri"): menyimpan diary dua kali
  // pada tanggal yang sama menambah halaman baru, bukan memperbarui halaman tanggal itu.
  it('simpan ulang diary di tanggal yang sama = update, bukan halaman duplikat', async () => {
    seed([], {}, {})
    mounted = await mountPage()

    await mounted.find('section.sheet textarea.paper').setValue('Draf pertama.')
    await flushPromises()
    const save = button(mounted, 'Simpan ke jurnal')
    if (!save) throw new Error('tombol simpan tidak ada')
    await save.trigger('click')
    await flushPromises()

    await mounted.find('section.sheet textarea.paper').setValue('Draf kedua, setelah diedit.')
    await flushPromises()
    await save.trigger('click')
    await flushPromises()

    expect(entries(mounted)).toHaveLength(1)
  })
})

describe('T11 Diary Book & pencarian lokal', () => {
  it('riwayat tanggal unik, terbaru dulu, tanpa tanggal masa depan', async () => {
    seed(
      [
        memo({ id: 'a', date: TODAY, text: 'hari ini' }),
        memo({ id: 'b', date: LAST_WEEK, text: 'pekan lalu' }),
        memo({ id: 'c', date: LAST_WEEK, text: 'pekan lalu kedua' }),
        memo({ id: 'd', date: '2025-09-20', text: 'besok lusa' }),
      ],
      { [YESTERDAY]: 2 },
      {},
    )
    mounted = await mountPage()

    expect(dateButtons(mounted).map((item) => item.attributes('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ])
    expect(dateButtons(mounted)[0]?.text()).toContain('Hari ini')
    // Tanggal masa depan (20 Sep) tidak masuk daftar.
    expect(mounted.find('.strip').text()).not.toContain('20')
    expect(mounted.find('.strip').text()).toContain('Belum ada memo')
  })

  it('pencarian menyaring judul, teks (termasuk judul jadwal mention), dan perasaan tanpa jaringan', async () => {
    seed(
      [
        memo({
          id: 'a',
          title: 'Minggu santai',
          text: 'Pagi ikut @[sched-kelas]',
          feelings: ['capek'],
        }),
        memo({ id: 'b', title: 'Review', text: 'Baca buku', feelings: ['semangat'] }),
      ],
      {},
      {},
    )
    mounted = await mountPage()

    // Judul.
    await mounted.find('input.search').setValue('minggu')
    await flushPromises()
    expect(entries(mounted).map((item) => item.find('.title').text())).toEqual(['Minggu santai'])

    // Perasaan (case-insensitive).
    await mounted.find('input.search').setValue('CAPEK')
    await flushPromises()
    expect(entries(mounted)).toHaveLength(1)

    // Teks mention: yang dicari adalah judul jadwalnya, bukan id internal.
    await mounted.find('input.search').setValue('kelas aws')
    await flushPromises()
    expect(entries(mounted)).toHaveLength(1)
    await mounted.find('input.search').setValue('sched-kelas')
    await flushPromises()
    expect(entries(mounted)).toHaveLength(0)

    // Tidak ada hasil: daftar tanggal kosong dengan pesan, bukan error.
    await mounted.find('input.search').setValue('tidak ada')
    await flushPromises()
    expect(entries(mounted)).toHaveLength(0)
    expect(mounted.find('.strip').text()).toContain('Nggak ketemu halaman dengan kata itu.')

    // Hapus kata kunci: semua kembali.
    await mounted.find('input.search').setValue('')
    await flushPromises()
    expect(entries(mounted)).toHaveLength(2)
  })

  it('fitur jurnal tidak memanggil jaringan (pencarian & daftar sepenuhnya lokal)', () => {
    const files = [
      'app/pages/app/memo.vue',
      'app/composables/useMemos.ts',
      'app/composables/useMemoDraft.ts',
      'app/composables/useJournalDay.ts',
      'app/utils/memo.ts',
      'app/utils/journal.ts',
    ]
    const offenders = files.filter((file) =>
      /(?:^|[^$\w])\$?fetch\s*\(|useFetch|useAsyncData/.test(
        readFileSync(join(process.cwd(), file), 'utf8'),
      ),
    )
    expect(offenders).toEqual([])
  })

  it('menyaring 2.000 memo tetap di bawah budget INP (filter lokal murah)', async () => {
    const many = Array.from({ length: 2000 }, (_, index) =>
      memo({ id: `m${index}`, title: `Hari ${index}`, text: `Catatan nomor ${index}` }),
    )
    seed(many, {}, {})
    mounted = await mountPage()

    const started = performance.now()
    await mounted.find('input.search').setValue('nomor 1999')
    await flushPromises()
    const elapsed = performance.now() - started

    expect(entries(mounted)).toHaveLength(1)
    // Budget longgar: yang dijaga adalah tidak ada pekerjaan jaringan/IO di jalur pencarian.
    expect(elapsed).toBeLessThan(500)
  })
})
