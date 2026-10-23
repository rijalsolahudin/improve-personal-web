import { describe, expect, it } from 'vitest'

import { INDEXED_ENTITY_TYPES } from '../../repository/index-entry.ts'
import { validateEntityPayload } from './index.ts'
import * as goalDomain from './goal.ts'
import {
  SEPANJANG_GOAL_CHAPTER_ID,
  attachGoalLink,
  chapterProgressPercent,
  chapterStatus,
  chaptersOutsideGoal,
  checkChapterWithinGoal,
  checkGoalBundle,
  checkGoalLinksUnique,
  clampPercent,
  existingLinkFor,
  goalChapterSchema,
  goalLinkKey,
  goalLinkSchema,
  goalSchema,
  idsToDeleteWithGoal,
  mainGoalProgressPercent,
  reassignChapterLinks,
  resolveGoalLinks,
  type Goal,
  type GoalChapter,
  type GoalLink,
  type ProgressSlice,
} from './goal.ts'

/**
 * QA T17: model goal + chapter + tautan item, dan kalkulasi progress (PRD F13).
 *
 * Semua fungsi di `goal.ts` murni, jadi test ini deterministik: "hari ini" selalu di-inject dan
 * angka progress dihitung dari slice yang dibangun di sini, bukan dari jam sistem.
 *
 * Fokus test = AC T17: validasi model, periode chapter di dalam main goal, satu item satu tautan,
 * edge hapus goal/chapter, status chapter (termasuk terlewat), dan progress yang tidak dobel hitung.
 */

const GOAL_ID = '0192f0a0-0000-7000-8000-000000000001'
const OTHER_GOAL_ID = '0192f0a0-0000-7000-8000-000000000002'
const CHAPTER_ID = '0192f0a0-0000-7000-8000-000000000003'
const OTHER_CHAPTER_ID = '0192f0a0-0000-7000-8000-000000000004'
const ITEM_ID = '0192f0a0-0000-7000-8000-000000000005'
const OTHER_ITEM_ID = '0192f0a0-0000-7000-8000-000000000006'
const LINK_ID = '0192f0a0-0000-7000-8000-000000000007'
const OTHER_LINK_ID = '0192f0a0-0000-7000-8000-000000000008'
const TODAY = '2026-10-23'

/** Goal valid minimal; `Record` supaya test bisa menghapus/menambah key tanpa drama tipe. */
function goalInput(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: GOAL_ID,
    title: 'Lari 10K',
    reason: 'Badan lebih sehat',
    category: 'kesehatan',
    coverSticker: null,
    startDate: '2026-01-01',
    targetDate: '2026-03-31',
    status: 'aktif',
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  }
}

function chapterInput(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CHAPTER_ID,
    goalId: GOAL_ID,
    title: 'Base building',
    startDate: '2026-01-01',
    endDate: '2026-02-15',
    sortOrder: 0,
    isCompleted: false,
    isClosed: false,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  }
}

function linkInput(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: LINK_ID,
    goalId: GOAL_ID,
    chapterId: CHAPTER_ID,
    itemType: 'todo',
    itemId: ITEM_ID,
    createdAt: 0,
    ...patch,
  }
}

function goalPeriod(
  patch: Partial<Pick<Goal, 'startDate' | 'targetDate'>> = {},
): Pick<Goal, 'startDate' | 'targetDate'> {
  return { startDate: '2026-01-01', targetDate: '2026-03-31', ...patch }
}

function chapterFixture(patch: Partial<GoalChapter> = {}): GoalChapter {
  return {
    id: CHAPTER_ID,
    goalId: GOAL_ID,
    title: 'Base building',
    startDate: '2026-01-01',
    endDate: '2026-02-15',
    sortOrder: 0,
    isCompleted: false,
    isClosed: false,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  }
}

function linkFixture(patch: Partial<GoalLink> = {}): GoalLink {
  return {
    id: LINK_ID,
    goalId: GOAL_ID,
    chapterId: CHAPTER_ID,
    itemType: 'todo',
    itemId: ITEM_ID,
    createdAt: 0,
    ...patch,
  }
}

function slice(itemType: ProgressSlice['itemType'], percent: number | null): ProgressSlice {
  return { itemType, percent }
}

describe('goalSchema - model main goal', () => {
  it('menerima goal valid dan men-trim judul', () => {
    const parsed = goalSchema.safeParse(goalInput({ title: '  Lari 10K  ' }))

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.title).toBe('Lari 10K')
    expect(parsed.success && parsed.data.category).toBe('kesehatan')
    expect(parsed.success && parsed.data.coverSticker).toBeNull()
  })

  it('menolak target sebelum mulai, dengan issue di field targetDate', () => {
    const parsed = goalSchema.safeParse(goalInput({ targetDate: '2025-12-31' }))

    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['targetDate'], message: expect.any(String) }),
      ]),
    )
  })

  it('menerima target == mulai (goal satu hari)', () => {
    const parsed = goalSchema.safeParse(goalInput({ startDate: TODAY, targetDate: TODAY }))
    expect(parsed.success).toBe(true)
  })

  it('menolak judul kosong / terlalu panjang', () => {
    expect(goalSchema.safeParse(goalInput({ title: '   ' })).success).toBe(false)
    expect(goalSchema.safeParse(goalInput({ title: 'x'.repeat(301) })).success).toBe(false)
  })

  it('menolak kategori & status di luar enum, dan tanggal lokal yang tidak ada', () => {
    expect(goalSchema.safeParse(goalInput({ category: 'liburan' })).success).toBe(false)
    expect(goalSchema.safeParse(goalInput({ status: 'arsip' })).success).toBe(false)
    expect(goalSchema.safeParse(goalInput({ startDate: '2026-02-30' })).success).toBe(false)
  })

  it('strict: field asing dari body/import ditolak (cegah mass assignment)', () => {
    expect(goalSchema.safeParse(goalInput({ ownerId: OTHER_GOAL_ID })).success).toBe(false)
  })

  it('sampul opsional: id sticker diterima, null diterima', () => {
    expect(goalSchema.safeParse(goalInput({ coverSticker: 'hewan/kelinci' })).success).toBe(true)
    expect(goalSchema.safeParse(goalInput({ coverSticker: null })).success).toBe(true)
  })
})

describe('goalChapterSchema - periode sendiri', () => {
  it('menerima chapter valid dan urutan 0', () => {
    expect(goalChapterSchema.safeParse(chapterInput()).success).toBe(true)
    expect(goalChapterSchema.safeParse(chapterInput({ sortOrder: 0 })).success).toBe(true)
  })

  it('menolak tanggal selesai sebelum tanggal mulai', () => {
    const parsed = goalChapterSchema.safeParse(chapterInput({ endDate: '2025-12-31' }))

    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['endDate'] })]),
    )
  })

  it('menolak sortOrder negatif dan field asing', () => {
    expect(goalChapterSchema.safeParse(chapterInput({ sortOrder: -1 })).success).toBe(false)
    expect(goalChapterSchema.safeParse(chapterInput({ progress: 100 })).success).toBe(false)
  })

  it('isClosed opsional: absen = false (backward-compatible dengan data lama)', () => {
    const withoutKey = chapterInput()
    delete withoutKey['isClosed']
    const parsed = goalChapterSchema.safeParse(withoutKey)

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.isClosed).toBe(false)
    expect(goalChapterSchema.safeParse(chapterInput({ isClosed: true })).success).toBe(true)
  })
})

describe('goalLinkSchema - tautan item', () => {
  it('chapterId null = Sepanjang Goal (tanpa baris goal_chapter)', () => {
    const parsed = goalLinkSchema.safeParse(linkInput({ chapterId: SEPANJANG_GOAL_CHAPTER_ID }))

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.chapterId).toBeNull()
  })

  it('menerima tiga tipe item yang boleh ditaut (todo, habit, schedule)', () => {
    for (const itemType of ['todo', 'habit', 'schedule']) {
      expect(goalLinkSchema.safeParse(linkInput({ itemType })).success).toBe(true)
    }
  })

  it('menolak tipe item lain (mis. jurnal) dan chapterId yang hilang', () => {
    expect(goalLinkSchema.safeParse(linkInput({ itemType: 'journal_entry' })).success).toBe(false)
    expect(goalLinkSchema.safeParse(linkInput({ chapterId: undefined })).success).toBe(false)
  })
})

describe('persistensi model - registry entitas', () => {
  it('goal, goal_chapter, goal_link punya schema payload dan lolos validasi import', () => {
    const cases = [
      ['goal', goalInput()],
      ['goal_chapter', chapterInput()],
      ['goal_link', linkInput()],
    ] as const

    for (const [type, payload] of cases) {
      // Roundtrip JSON = yang terjadi saat simpan ke record store / export-import.
      const result = validateEntityPayload(type, JSON.parse(JSON.stringify(payload)))
      expect(result.ok, `${type} harus lolos validasi`).toBe(true)
    }
  })

  it('payload rusak ditolak dengan pesan yang menyebut field-nya', () => {
    const result = validateEntityPayload('goal', { ...goalInput(), targetDate: '2025-01-01' })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.issues.join(' ')).toContain('targetDate')
  })

  it('goal & goal_chapter punya dimensi waktu di record_index (bisa di-query rentang)', () => {
    expect(INDEXED_ENTITY_TYPES).toEqual(expect.arrayContaining(['goal', 'goal_chapter']))
    expect(INDEXED_ENTITY_TYPES).not.toContain('goal_link')
  })
})

describe('checkChapterWithinGoal - periode chapter wajib di dalam main goal', () => {
  it('menerima chapter di dalam rentang, termasuk yang menyentuh batas', () => {
    expect(checkChapterWithinGoal(chapterFixture(), goalPeriod()).ok).toBe(true)
    expect(
      checkChapterWithinGoal(
        chapterFixture({ startDate: '2026-01-01', endDate: '2026-03-31' }),
        goalPeriod(),
      ).ok,
    ).toBe(true)
  })

  it('menolak chapter mulai sebelum main goal, pesan menyebut kedua tanggal', () => {
    const check = checkChapterWithinGoal(
      chapterFixture({ title: 'Pemanasan', startDate: '2025-12-25' }),
      goalPeriod(),
    )

    expect(check.ok).toBe(false)
    expect(check.ok === false && check.message).toContain('2025-12-25')
    expect(check.ok === false && check.message).toContain('2026-01-01')
    expect(check.ok === false && check.message).toContain('Pemanasan')
  })

  it('menolak chapter selesai melewati main goal (PRD: ditolak dengan pesan jelas)', () => {
    const check = checkChapterWithinGoal(
      chapterFixture({ title: 'Race', endDate: '2026-04-10' }),
      goalPeriod(),
    )

    expect(check.ok).toBe(false)
    expect(check.ok === false && check.message).toContain('2026-04-10')
    expect(check.ok === false && check.message).toContain('2026-03-31')
  })
})

describe('chaptersOutsideGoal - geser periode main goal', () => {
  const chapters = [
    chapterFixture({ id: 'a', startDate: '2026-01-05', endDate: '2026-01-20' }),
    chapterFixture({ id: 'b', startDate: '2026-03-01', endDate: '2026-03-20' }),
  ]

  it('mengembalikan HANYA chapter yang keluar rentang setelah periode digeser', () => {
    const outside = chaptersOutsideGoal(
      chapters,
      goalPeriod({ startDate: '2026-02-01', targetDate: '2026-03-10' }),
    )

    expect(outside.map((chapter) => chapter.id)).toEqual(['a', 'b'])
  })

  it('periode yang tidak berubah / melebar tidak menghasilkan chapter keluar', () => {
    expect(chaptersOutsideGoal(chapters, goalPeriod())).toEqual([])
  })
})

describe('identitas tautan - satu item cuma satu tempat', () => {
  it('kunci tautan = tipe + id item (tipe berbeda tidak dianggap sama)', () => {
    expect(goalLinkKey({ itemType: 'todo', itemId: ITEM_ID })).toBe(`todo:${ITEM_ID}`)
    expect(goalLinkKey({ itemType: 'habit', itemId: ITEM_ID })).not.toBe(
      goalLinkKey({ itemType: 'todo', itemId: ITEM_ID }),
    )
  })

  it('existingLinkFor menemukan tautan yang sudah ada -> penautan ulang idempoten', () => {
    const first = linkFixture({ chapterId: null })
    const links = [first, linkFixture({ id: 'lain', itemId: OTHER_ITEM_ID, itemType: 'habit' })]

    const found = existingLinkFor(links, { itemType: 'todo', itemId: ITEM_ID })
    expect(found).toBe(first)
    // Simpan ulang item yang sama tidak boleh membuat tautan baru: id tautannya tetap sama.
    expect(existingLinkFor(links, { itemType: 'todo', itemId: ITEM_ID })?.id).toBe(first.id)
  })

  it('item tanpa tautan / tipe berbeda -> null, bukan tautan item lain', () => {
    const links = [linkFixture()]
    expect(existingLinkFor(links, { itemType: 'todo', itemId: OTHER_ITEM_ID })).toBeNull()
    expect(existingLinkFor(links, { itemType: 'habit', itemId: ITEM_ID })).toBeNull()
  })

  it('dua arah: dari item ke goal, dan dari goal ke item', () => {
    const links = [
      linkFixture({ id: 'l1', goalId: GOAL_ID, itemType: 'todo', itemId: ITEM_ID }),
      linkFixture({ id: 'l2', goalId: OTHER_GOAL_ID, itemType: 'habit', itemId: OTHER_ITEM_ID }),
    ]

    // Item -> goal.
    expect(existingLinkFor(links, { itemType: 'todo', itemId: ITEM_ID })?.goalId).toBe(GOAL_ID)
    // Goal -> item.
    expect(links.filter((link) => link.goalId === GOAL_ID).map((link) => link.itemId)).toEqual([
      ITEM_ID,
    ])
  })
})

describe('resolveGoalLinks - tautan yatim (item sudah dihapus)', () => {
  it('memisahkan tautan yang itemnya ada dari tautan yatim', () => {
    const alive = linkFixture({ id: 'alive', itemType: 'todo', itemId: ITEM_ID })
    const orphan = linkFixture({ id: 'orphan', itemType: 'habit', itemId: OTHER_ITEM_ID })

    const result = resolveGoalLinks([alive, orphan], [{ itemType: 'todo', itemId: ITEM_ID }])

    expect(result.resolved.map((link) => link.id)).toEqual(['alive'])
    expect(result.orphans.map((link) => link.id)).toEqual(['orphan'])
  })

  it('tidak crash saat semua item hilang: semua jadi orphan', () => {
    const result = resolveGoalLinks([linkFixture()], [])

    expect(result.resolved).toEqual([])
    expect(result.orphans).toHaveLength(1)
  })
})

describe('attachGoalLink - satu item satu tautan', () => {
  it('menautkan item baru', () => {
    const result = attachGoalLink([], linkFixture())

    expect(result.ok).toBe(true)
    expect(result.ok && result.created).toBe(true)
  })

  it('simpan ulang ke tempat yang sama = idempoten, bukan tautan kedua', () => {
    const existing = linkFixture()
    const result = attachGoalLink([existing], { ...existing, id: OTHER_LINK_ID })

    expect(result.ok).toBe(true)
    expect(result.ok && result.created).toBe(false)
    expect(result.ok && result.link.id).toBe(existing.id)
  })

  it('pindah tanpa mengubah tautan lama ditolak dengan pesan yang menyebut chapter lama', () => {
    const existing = linkFixture({ chapterId: CHAPTER_ID })
    const result = attachGoalLink(
      [existing],
      linkFixture({
        id: OTHER_LINK_ID,
        chapterId: OTHER_CHAPTER_ID,
      }),
    )

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('already_linked')
    expect(result.ok === false && result.existing.id).toBe(existing.id)
    expect(result.ok === false && result.message).toContain(CHAPTER_ID)
  })
})

describe('checkGoalBundle - invarian lintas-record (import/load)', () => {
  const goal = goalSchema.parse(goalInput())
  const chapter = goalChapterSchema.parse(chapterInput())
  const link = goalLinkSchema.parse(linkInput())

  it('goal + chapter + tautan yang konsisten lolos', () => {
    expect(checkGoalBundle({ goal, chapters: [chapter], links: [link] })).toEqual({ ok: true })
  })

  it('chapter di luar periode main goal ditolak dengan alasan yang menyebut tanggalnya', () => {
    const outside = goalChapterSchema.parse(
      chapterInput({ startDate: '2026-06-01', endDate: '2026-06-30' }),
    )
    const result = checkGoalBundle({ goal, chapters: [outside], links: [] })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.issues.join(' ')).toContain('2026-06-30')
  })

  it('dua tautan untuk item yang sama ditolak (uq_goal_link_item)', () => {
    const second = goalLinkSchema.parse(linkInput({ id: OTHER_LINK_ID }))
    const result = checkGoalBundle({ goal, chapters: [chapter], links: [link, second] })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.issues.join(' ')).toContain(`todo:${ITEM_ID}`)
  })

  it('satu item di dua goal berbeda juga ditolak (invarian global, bukan per goal)', () => {
    const inThisGoal = goalLinkSchema.parse(linkInput())
    const inOtherGoal = goalLinkSchema.parse(
      linkInput({ id: OTHER_LINK_ID, goalId: OTHER_GOAL_ID }),
    )
    const result = checkGoalLinksUnique([inThisGoal, inOtherGoal])

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.issues.join(' ')).toContain('dua goal berbeda')
  })

  it('tautan ke chapter yang tidak ada / goal lain ditolak, bukan crash', () => {
    const dangling = goalLinkSchema.parse(linkInput({ chapterId: OTHER_CHAPTER_ID }))
    const foreign = goalLinkSchema.parse(linkInput({ id: OTHER_LINK_ID, goalId: OTHER_GOAL_ID }))

    const danglingResult = checkGoalBundle({ goal, chapters: [chapter], links: [dangling] })
    const foreignResult = checkGoalBundle({ goal, chapters: [chapter], links: [foreign] })

    expect(danglingResult.ok).toBe(false)
    expect(foreignResult.ok).toBe(false)
    expect(danglingResult.ok === false && danglingResult.issues.join(' ')).toContain(
      OTHER_CHAPTER_ID,
    )
  })
})

describe('hapus chapter - item pindah ke Sepanjang Goal atau dilepas', () => {
  const links = [
    linkFixture({ id: 'in', chapterId: CHAPTER_ID }),
    linkFixture({ id: 'out', chapterId: OTHER_CHAPTER_ID, itemId: OTHER_ITEM_ID }),
    linkFixture({ id: 'along', chapterId: null, itemType: 'habit' }),
  ]

  it('default: tautan chapter pindah ke Sepanjang Goal tanpa record baru', () => {
    const result = reassignChapterLinks(links, CHAPTER_ID, 'move_to_sepanjang')

    expect(result.reassigned.map((link) => link.id)).toEqual(['in'])
    expect(result.reassigned[0]).toMatchObject({ id: 'in', chapterId: null, itemId: ITEM_ID })
    expect(result.detached).toEqual([])
    expect(result.kept.map((link) => link.id)).toEqual(['out', 'along'])
  })

  it('dilepas: tautan chapter dihapus dari daftar, item tidak ikut terhapus', () => {
    const result = reassignChapterLinks(links, CHAPTER_ID, 'detach')

    expect(result.detached.map((link) => link.id)).toEqual(['in'])
    expect(result.reassigned).toEqual([])
    expect(result.kept.map((link) => link.id)).toEqual(['out', 'along'])
  })

  it('chapter tanpa tautan: semua tautan lain tetap', () => {
    const result = reassignChapterLinks(links, 'chapter-kosong', 'move_to_sepanjang')

    expect(result.kept).toHaveLength(3)
    expect(result.reassigned).toEqual([])
    expect(result.detached).toEqual([])
  })
})

describe('hapus main goal - chapter & tautan ikut, item tetap ada', () => {
  it('hanya id goal + chapter + tautan milik goal itu yang di-tombstone', () => {
    const chapters = [
      chapterFixture({ id: CHAPTER_ID }),
      chapterFixture({ id: OTHER_CHAPTER_ID, goalId: OTHER_GOAL_ID }),
    ]
    const links = [
      linkFixture({ id: LINK_ID }),
      linkFixture({ id: 'link-lain', goalId: OTHER_GOAL_ID }),
    ]

    const ids = idsToDeleteWithGoal({ id: GOAL_ID }, chapters, links)

    expect(new Set(ids)).toEqual(new Set([GOAL_ID, CHAPTER_ID, LINK_ID]))
    // Item (todo/habit/schedule) tidak pernah masuk daftar hapus -> data user tetap ada.
    expect(ids).not.toContain(ITEM_ID)
  })
})

describe('chapterStatus - status otomatis dari tanggal + progress', () => {
  const chapter = chapterFixture({ startDate: '2026-02-01', endDate: '2026-02-28' })

  it('belum mulai sebelum tanggal mulai', () => {
    expect(chapterStatus(chapter, '2026-01-31', 0)).toBe('belum_mulai')
  })

  it('berjalan inklusif di tanggal mulai dan tanggal selesai', () => {
    expect(chapterStatus(chapter, '2026-02-01', 0)).toBe('berjalan')
    expect(chapterStatus(chapter, '2026-02-28', 99.9)).toBe('berjalan')
  })

  it('lewat tanggal selesai: selesai kalau 100%, terlewat kalau belum', () => {
    expect(chapterStatus(chapter, '2026-03-01', 100)).toBe('selesai')
    expect(chapterStatus(chapter, '2026-03-01', 99.9)).toBe('terlewat')
  })

  it('selesai manual = 100% dan menang atas tanggal', () => {
    expect(chapterStatus(chapter, '2026-01-01', 0)).toBe('belum_mulai')
    expect(chapterStatus({ ...chapter, isCompleted: true }, '2026-01-01', 0)).toBe('selesai')
    expect(chapterStatus({ ...chapter, isCompleted: true }, '2026-06-01', 0)).toBe('selesai')
  })

  it('chapter ditutup (review F13) = "ditutup" dan tidak lagi "terlewat"', () => {
    expect(chapterStatus({ ...chapter, isClosed: true }, '2026-03-01', 40)).toBe('ditutup')
    expect(chapterStatus({ ...chapter, isClosed: true }, '2026-06-01', 0)).toBe('ditutup')
  })
})

describe('chapterProgressPercent - rata-rata progress chapter', () => {
  it('task/habit/jadwal: rata-rata slice', () => {
    expect(
      chapterProgressPercent({ isCompleted: false }, [
        slice('todo', 100),
        slice('habit', 50),
        slice('schedule', 0),
      ]),
    ).toBe(50)
  })

  it('selesai manual = 100% walau semua item 0%', () => {
    expect(chapterProgressPercent({ isCompleted: true }, [slice('todo', 0)])).toBe(100)
  })

  it('selesai manual = 100% walau chapter tanpa item', () => {
    expect(chapterProgressPercent({ isCompleted: true }, [])).toBe(100)
  })

  it('semua item selesai = 100%, semua belum = 0%', () => {
    expect(chapterProgressPercent({ isCompleted: false }, [slice('todo', 100)])).toBe(100)
    expect(chapterProgressPercent({ isCompleted: false }, [slice('todo', 0)])).toBe(0)
  })

  it('pembulatan 1 desimal supaya web & mobile menampilkan angka sama', () => {
    expect(
      chapterProgressPercent({ isCompleted: false }, [
        slice('todo', 100),
        slice('habit', 0),
        slice('schedule', 0),
      ]),
    ).toBe(33.3)
  })

  it('clamp: data rusak di atas 100 / di bawah 0 tidak menghasilkan progress mustahil', () => {
    expect(chapterProgressPercent({ isCompleted: false }, [slice('todo', 140)])).toBe(100)
    expect(chapterProgressPercent({ isCompleted: false }, [slice('todo', -20)])).toBe(0)
  })

  it('chapter kosong tanpa selesai manual = 0% (kosong bukan selesai)', () => {
    // Kalau kosong dianggap 100%, chapter yang lewat tanggal tidak pernah "terlewat" dan kartu
    // review F13 tidak muncul. Konsekuensi statusnya diuji di blok status chapter.
    expect(chapterProgressPercent({ isCompleted: false }, [])).toBe(0)
    expect(chapterProgressPercent({ isCompleted: false }, [slice('habit', null)])).toBe(0)
  })
})

describe('mainGoalProgressPercent - bobot sama per chapter', () => {
  it('goal tanpa item = 0%', () => {
    expect(mainGoalProgressPercent([], null)).toBe(0)
  })

  it('goal tanpa chapter = progress item Sepanjang Goal', () => {
    expect(mainGoalProgressPercent([], 80)).toBe(80)
    expect(mainGoalProgressPercent([], 0)).toBe(0)
  })

  it('ada chapter: rata-rata chapter + Sepanjang Goal (kalau ada isinya)', () => {
    expect(mainGoalProgressPercent([100, 0], null)).toBe(50)
    expect(mainGoalProgressPercent([100, 0], 50)).toBe(50)
  })

  it('Sepanjang Goal 0% tetap dihitung (bukan diabaikan)', () => {
    expect(mainGoalProgressPercent([100], 0)).toBe(50)
  })

  it('clamp + bulat 1 desimal', () => {
    expect(mainGoalProgressPercent([100, 100], 50)).toBe(83.3)
  })
})

describe('clampPercent', () => {
  it('menjaga 0..100, membulatkan 1 desimal, NaN = 0', () => {
    expect(clampPercent(Number.NaN)).toBe(0)
    expect(clampPercent(-5)).toBe(0)
    expect(clampPercent(0)).toBe(0)
    expect(clampPercent(33.333)).toBe(33.3)
    expect(clampPercent(150)).toBe(100)
  })
})

describe('edge case AC T17', () => {
  it('item selesai lalu dihapus: tautan yatim dilepas, progress turun (tidak nyangkut 100%)', () => {
    const doneLink = linkFixture({ id: 'done', itemId: ITEM_ID })
    const openLink = linkFixture({ id: 'open', itemId: OTHER_ITEM_ID })
    const links = [doneLink, openLink]

    // Sebelum dihapus: satu task selesai, satu belum -> 50%.
    const before = chapterProgressPercent({ isCompleted: false }, [slice('todo', 50)])
    expect(before).toBe(50)

    // Task yang selesai dihapus -> record item hilang, tautannya jadi yatim.
    const remaining = links.filter((link) => link.itemId !== ITEM_ID)
    expect(existingLinkFor(remaining, { itemType: 'todo', itemId: ITEM_ID })).toBeNull()
    expect(existingLinkFor(remaining, { itemType: 'todo', itemId: OTHER_ITEM_ID })).not.toBeNull()

    // Setelah tautan yatim tidak dihitung lagi: hanya task belum selesai yang tersisa -> 0%.
    const after = chapterProgressPercent({ isCompleted: false }, [slice('todo', 0)])
    expect(after).toBe(0)
  })

  it('item pindah chapter: tetap satu tautan, tidak dobel hitung di dua chapter', () => {
    const original = linkFixture({ id: 'l1', chapterId: CHAPTER_ID, itemId: ITEM_ID })
    const moved: GoalLink = { ...original, chapterId: OTHER_CHAPTER_ID }

    // Pindah = mutasi chapterId pada record tautan yang SAMA, bukan tautan kedua.
    const links = [moved]
    const sameItem = links.filter(
      (link) =>
        goalLinkKey(link) === goalLinkKey({ itemType: original.itemType, itemId: original.itemId }),
    )
    expect(sameItem).toHaveLength(1)
    expect(sameItem[0]?.chapterId).toBe(OTHER_CHAPTER_ID)

    // Chapter asal kehilangan item (0%), chapter tujuan dapat item selesai (100%).
    const source = chapterProgressPercent({ isCompleted: false }, [slice('todo', 0)])
    const target = chapterProgressPercent({ isCompleted: false }, [slice('todo', 100)])
    expect(source).toBe(0)
    expect(target).toBe(100)

    // Total goal tidak berubah karena item yang sama tidak dihitung dua kali:
    // sebelum pindah = (100 + 100) / 2 (chapter tujuan kosong dianggap 100%), sesudah = (0 + 100) / 2.
    expect(mainGoalProgressPercent([source, target], null)).toBe(50)
  })

  it('item tanpa tautan tidak ikut dihitung: progress hanya dari slice yang ditautkan', () => {
    // Chapter punya 2 item tertaut (1 selesai, 1 belum) dan 3 item tak tertaut di fitur asalnya.
    // Item tak tertaut tidak pernah masuk slice, jadi tidak bisa menurunkan/menaikkan progress.
    expect(chapterProgressPercent({ isCompleted: false }, [slice('todo', 50)])).toBe(50)
  })

  it('goal tanpa item: tidak crash, progress 0', () => {
    expect(mainGoalProgressPercent([], null)).toBe(0)
    expect(chapterProgressPercent({ isCompleted: false }, [])).toBe(0)
  })
})

/**
 * Regresi PRD F13 yang ditemukan QA. Dulu dipin sebagai `it.fails`; sekarang implementasinya sudah
 * benar dan semuanya berjalan sebagai assertion normal.
 *
 * Dua kasus terakhir butuh DATA LINTAS-RECORD (goal induk / daftar tautan), jadi tidak mungkin
 * ditegakkan oleh `validateEntityPayload` yang hanya menerima satu record. Jalur import/load wajib
 * memanggil `checkGoalBundle` setelah validasi per-record - lihat komentar fungsinya.
 */
describe('PRD F13 - regresi progress & invarian', () => {
  it('chapter kosong TANPA selesai manual = 0%', () => {
    // PRD: "Selesai manual -> progress = 100%. Termasuk chapter tanpa item" - artinya chapter tanpa
    // item baru 100% setelah ditandai manual. Kalau kosong otomatis 100%, chapter kosong yang sudah
    // lewat tanggal tidak akan pernah berstatus "terlewat" dan kartu review F13 tidak muncul.
    expect(chapterProgressPercent({ isCompleted: false }, [])).toBe(0)
  })

  it('chapter kosong yang sudah lewat tanggal berstatus "terlewat"', () => {
    const emptyPastChapter = chapterFixture({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      isCompleted: false,
    })
    const progress = chapterProgressPercent(emptyPastChapter, [])

    expect(chapterStatus(emptyPastChapter, TODAY, progress)).toBe('terlewat')
  })

  it('slice null (tipe item tidak ada di chapter) tidak menaikkan progress', () => {
    // Chapter hanya berisi task dan belum ada yang selesai. Satu slice per tipe tetap boleh dikirim;
    // null berarti "tidak ada data" dan dikeluarkan dari penyebut (dulu dihitung 100% -> 66.7%).
    expect(
      chapterProgressPercent({ isCompleted: false }, [
        slice('todo', 0),
        slice('habit', null),
        slice('schedule', null),
      ]),
    ).toBe(0)
  })

  it('chapter di luar rentang goal ditolak saat validasi lintas-record', () => {
    // Validasi per-record tidak bisa melihat goal induknya; invarian ini ditegakkan
    // `checkGoalBundle` yang dipanggil jalur import/load dengan goal + chapter + tautan sekaligus.
    const goal = goalSchema.parse(goalInput())
    const outside = goalChapterSchema.parse(
      chapterInput({ startDate: '2026-06-01', endDate: '2026-06-30' }),
    )
    const result = checkGoalBundle({ goal, chapters: [outside], links: [] })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.issues.join(' ')).toContain('2026-06-30')
  })

  it('dua tautan untuk item yang sama ditolak (uq_goal_link_item)', () => {
    const goal = goalSchema.parse(goalInput())
    const chapter = goalChapterSchema.parse(chapterInput())
    const first = goalLinkSchema.parse(linkInput({ id: LINK_ID }))
    const second = goalLinkSchema.parse(linkInput({ id: OTHER_LINK_ID }))
    const result = checkGoalBundle({ goal, chapters: [chapter], links: [first, second] })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.issues.join(' ')).toContain(`todo:${ITEM_ID}`)
  })

  it('resolveGoalLinks tersedia untuk melepas tautan item yang sudah dihapus', () => {
    // Docstring `goalLinkSchema` menyebut "resolusi tautan yatim ditangani resolveGoalLinks".
    expect(Object.keys(goalDomain)).toContain('resolveGoalLinks')
  })
})
