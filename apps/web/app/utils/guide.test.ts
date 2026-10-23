import { describe, expect, it } from 'vitest'

import { APP_HOME_PATH, FEATURES, getFeature } from './features'
import {
  GUIDE_BACKUP,
  GUIDE_FAQ,
  GUIDE_FEATURES,
  GUIDE_GROUPS,
  GUIDE_SECURITY,
  guideAnchor,
  guideFeaturesInGroup,
  type GuideStatus,
} from './guide'

const STATUSES: readonly GuideStatus[] = ['ready', 'via', 'partial', 'soon']
const FEATURE_PATHS = new Set([APP_HOME_PATH, ...FEATURES.map((feature) => feature.path)])

describe('isi panduan', () => {
  it('mencakup F1–F16 tepat sekali', () => {
    const codes = GUIDE_FEATURES.map((feature) => Number(feature.code.slice(1))).sort(
      (a, b) => a - b,
    )
    expect(codes).toEqual(Array.from({ length: 16 }, (_, index) => index + 1))
  })

  it('id, anchor, dan judul unik', () => {
    const ids = GUIDE_FEATURES.map((feature) => feature.id)
    const anchors = GUIDE_FEATURES.map((feature) => guideAnchor(feature.id))
    const titles = GUIDE_FEATURES.map((feature) => feature.title)
    for (const values of [ids, anchors, titles]) expect(new Set(values).size).toBe(values.length)
  })

  it('tiap grup terisi dan urutan grup dihormati', () => {
    for (const group of GUIDE_GROUPS) expect(guideFeaturesInGroup(group).length).toBeGreaterThan(0)

    const ordered = GUIDE_GROUPS.flatMap((group) => guideFeaturesInGroup(group))
    expect(ordered.map((feature) => feature.id)).toEqual(
      GUIDE_FEATURES.map((feature) => feature.id),
    )
  })

  it('link hanya menunjuk halaman aplikasi yang terdaftar', () => {
    for (const feature of GUIDE_FEATURES) {
      if (feature.href === undefined) continue
      expect(FEATURE_PATHS.has(feature.href)).toBe(true)
    }
  })

  it('status valid, ringkasan terisi, dan tips cukup untuk dibaca', () => {
    for (const feature of GUIDE_FEATURES) {
      expect(STATUSES).toContain(feature.status)
      expect(feature.summary.trim().length).toBeGreaterThan(40)
      expect(feature.tips.length).toBeGreaterThanOrEqual(2)
      expect(feature.tips.length).toBeLessThanOrEqual(4)
      for (const tip of feature.tips) expect(tip.trim().length).toBeGreaterThan(20)
    }
  })

  it('bagian keamanan dan backup tidak kosong', () => {
    expect(GUIDE_SECURITY.layers).toHaveLength(4)
    expect(GUIDE_SECURITY.knows.length).toBeGreaterThan(0)
    expect(GUIDE_SECURITY.notKnows.length).toBeGreaterThan(0)
    expect(GUIDE_SECURITY.recoverySteps.length).toBeGreaterThan(1)
    expect(GUIDE_BACKUP.blocks.length).toBeGreaterThan(1)
    expect(GUIDE_FAQ.length).toBeGreaterThanOrEqual(8)
    expect(new Set(GUIDE_FAQ.map((item) => item.question)).size).toBe(GUIDE_FAQ.length)
  })
})

/**
 * Regresi copy T15: status di Panduan harus mengikuti kode yang benar-benar ada.
 *
 * Ini bukan duplikasi test QA - QA mengunci F10/backup/FAQ secara eksplisit. Di sini yang dikunci
 * adalah klaim yang pernah menyimpang dan mudah terulang saat fitur bergerak: fitur yang sudah jalan
 * tidak boleh berstatus "segera", dan copy tidak boleh menjanjikan perilaku yang belum ada.
 */
describe('status & klaim mengikuti kode', () => {
  it('Import / Export siap dipakai dan mengarah ke halamannya', () => {
    const feature = GUIDE_FEATURES.find((item) => item.code === 'F10')
    expect(feature).toBeDefined()
    expect(feature?.status).toBe('ready')
    expect(feature?.href).toBe(getFeature('import-export').path)
    expect(`${feature?.summary} ${feature?.tips.join(' ')}`).toMatch(/gabung/i)
    expect(`${feature?.summary} ${feature?.tips.join(' ')}`).toMatch(/ganti semua/i)
  })

  it('Daily mengklaim perilaku yang sudah diperbaiki: deadline hari ini & daftar dilipat', () => {
    const feature = GUIDE_FEATURES.find((item) => item.code === 'F12')
    const copy = `${feature?.summary} ${feature?.tips.join(' ')}`
    // Quick add memakai deadline akhir hari (PRD F12) dan daftar panjang dilipat di "Lihat N lagi".
    expect(feature?.status).toBe('ready')
    expect(copy).toMatch(/quick add/i)
    expect(copy).toMatch(/deadline akhir hari ini/i)
    expect(copy).toMatch(/Lihat N lagi/i)
    // Copy lama tidak boleh kembali: itu menandakan panduan menjelaskan bug yang sudah hilang.
    expect(copy).not.toMatch(/belum otomatis diberi deadline/i)
    expect(copy).not.toMatch(/sampai perbaikan selesai/i)
    expect(copy).not.toMatch(/hilang dari daftar setelah reload/i)
  })

  it('Journal mengajari kedua pemicu mention: @ untuk jadwal dan # untuk goal', () => {
    const feature = GUIDE_FEATURES.find((item) => item.code === 'F8')
    const tips = feature?.tips.join(' ') ?? ''
    expect(tips).toMatch(/tulis @/i)

    // Parser & picker `#goal` sudah ada (`utils/memo.ts`, `MemoEditor.vue`), jadi panduan wajib
    // menyebutnya. Kalau `#` dihapus dari copy, panduan tertinggal dari fitur.
    const goalTip = feature?.tips.find((tip) => tip.includes('#')) ?? ''
    expect(goalTip).toMatch(/goal/i)
  })

  it('Journal siap dipakai: isi jurnal dan mood tersimpan terenkripsi, bukan cuma sesi', () => {
    const feature = GUIDE_FEATURES.find((item) => item.code === 'F8')
    const copy = `${feature?.summary} ${feature?.tips.join(' ')}`
    expect(feature?.status).toBe('ready')
    expect(copy).toMatch(/tersimpan/i)
    expect(copy).toMatch(/terenkripsi/i)
    expect(copy).toMatch(/mood/i)
    // Klaim lama tidak boleh kembali: jurnal sudah persist, bukan in-memory.
    expect(copy).not.toMatch(/selama sesi/i)
    expect(copy).not.toMatch(/belum tersimpan/i)
    expect(copy).not.toMatch(/belum permanen/i)
  })

  it('Goals siap dipakai: tersimpan terenkripsi dan progres otomatis', () => {
    const feature = GUIDE_FEATURES.find((item) => item.code === 'F13')
    const copy = `${feature?.summary} ${feature?.tips.join(' ')}`
    expect(feature?.status).toBe('ready')
    expect(copy).toMatch(/tersimpan/i)
    expect(copy).toMatch(/terenkripsi/i)
    expect(copy).toMatch(/progres/i)
    // Klaim lama tidak boleh kembali: goal sudah persist, bukan in-memory.
    expect(copy).not.toMatch(/belum tersimpan/i)
    expect(copy).not.toMatch(/selama sesi/i)
    expect(copy).not.toMatch(/masih disiapkan/i)
  })

  it('FAQ memisahkan Journal (masih sesi) dari Goals (sudah tersimpan)', () => {
    const reloadFaq = GUIDE_FAQ.find((item) => /reload/i.test(item.question))
    expect(reloadFaq).toBeDefined()
    expect(reloadFaq?.answer).toMatch(/jurnal/i)
    expect(reloadFaq?.answer).toMatch(/terenkripsi/i)
    expect(reloadFaq?.answer).not.toMatch(/goal[^.]*hilang/i)
  })

  it('Kalender menyebut penanda goal/chapter dan memo, bukan "tiga lapis data"', () => {
    const feature = GUIDE_FEATURES.find((item) => item.code === 'F6')
    const copy = `${feature?.summary} ${feature?.tips.join(' ')}`
    expect(copy).toMatch(/goal/i)
    expect(copy).toMatch(/memo/i)
    expect(copy).not.toMatch(/tiga lapis/i)
  })

  it('Akun menyebut QR, hapus akun, dan indikator sync tanpa mengklaim sync otomatis', () => {
    const feature = GUIDE_FEATURES.find((item) => item.code === 'F15')
    const copy = `${feature?.summary} ${feature?.tips.join(' ')}`
    expect(feature?.status).toBe('partial')
    expect(copy).toMatch(/QR/)
    expect(copy).toMatch(/hapus akun/i)
    expect(copy).toMatch(/indikator/i)
    // Engine push/pull belum ada: jangan mengklaim data sudah berpindah sendiri.
    expect(copy).not.toMatch(/sudah tersinkron otomatis/i)
    expect(copy).not.toMatch(/sync otomatis sudah/i)
  })

  it('badge "partial" memakai label yang dibaca user', () => {
    expect(GUIDE_COPY.status.partial).toBe('Sebagian')
  })

  it('tidak mengklaim menu Jadwal atau Sticker ada di navigasi', () => {
    const schedule = GUIDE_FEATURES.find((item) => item.code === 'F1')
    expect(schedule?.summary).toMatch(/tidak punya menu/i)

    const faq = GUIDE_FAQ.filter((item) => /sticker/i.test(item.question))
    expect(faq.length).toBeGreaterThan(0)
    for (const item of faq) {
      expect(item.answer).toMatch(/tidak punya menu/i)
      expect(item.answer).not.toMatch(/menu[^.]*sudah ada/i)
    }
  })
})
