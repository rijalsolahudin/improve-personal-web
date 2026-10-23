import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { KEY_SLOTS } from '@improve-personal/contracts'
import { describe, expect, it } from 'vitest'

import { MIN_PASSPHRASE_LENGTH } from '~/utils/account/encrypted-backup'
import { BACKUP_CODE_PREFIX } from '~/utils/account/backup-code'
import { MASTER_KEY_BYTES } from '~/utils/crypto/master-key'
import { RECOVERY_WORD_COUNT } from '~/utils/crypto/recovery'
import { RECOVERY_LOCK_MS, RECOVERY_MAX_ATTEMPTS } from '~/utils/crypto/recovery-guard'

import { getFeature } from './features'
import { GUIDE_BACKUP, GUIDE_FAQ, GUIDE_FEATURES, GUIDE_SECURITY } from './guide'

/**
 * QA T15 (F9): klaim di halaman Panduan harus sama dengan perilaku kode, bukan cuma enak dibaca.
 *
 * Halaman Panduan adalah satu-satunya tempat user "diajari" soal kunci, pemulihan, dan status fitur.
 * Kalau angka atau janjinya menyimpang dari kode, user salah mengambil keputusan (mis. tidak menyimpan
 * kode pemulihan karena mengira passkey selalu cukup). Karena itu test ini membandingkan copy dengan
 * konstanta asli, bukan dengan string yang disalin ulang ke test.
 *
 * Angka yang diuji sengaja hanya yang benar-benar dipakai user: jumlah kata recovery, prefiks kode,
 * panjang minimum kata sandi, jumlah percobaan sebelum layar terkunci, dan slot kunci yang boleh ada
 * di server.
 */

const SECURITY_TEXT = [
  GUIDE_SECURITY.lead,
  ...GUIDE_SECURITY.layers.map((layer) => `${layer.title} ${layer.body}`),
  ...GUIDE_SECURITY.recoverySteps,
  GUIDE_SECURITY.lost,
  GUIDE_SECURITY.soon,
].join('\n')

const ALL_COPY = [
  ...GUIDE_FEATURES.map((feature) => `${feature.summary} ${feature.tips.join(' ')}`),
  ...GUIDE_FAQ.map((item) => `${item.question} ${item.answer}`),
  ...GUIDE_BACKUP.blocks.map((block) => `${block.title} ${block.body}`),
  ...GUIDE_SECURITY.layers.map((layer) => layer.body),
].join('\n')

describe('isi panduan sesuai kode saat ini', () => {
  it('kunci utama dijelaskan sebagai kunci 32 byte', () => {
    const mainKey = GUIDE_SECURITY.layers.find((layer) => /kunci utama/i.test(layer.title))
    expect(mainKey).toBeDefined()
    expect(mainKey?.body).toContain(`${MASTER_KEY_BYTES} byte`)
  })

  it('kode pemulihan menyebut jumlah kata & prefiks yang benar', () => {
    expect(SECURITY_TEXT).toContain(`${RECOVERY_WORD_COUNT} kata`)
    expect(SECURITY_TEXT).toContain(BACKUP_CODE_PREFIX)
    expect(BACKUP_CODE_PREFIX).toBe('iprk1.')
  })

  it('berkas terenkripsi menyebut panjang kata sandi minimum yang ditegakkan kode', () => {
    expect(SECURITY_TEXT).toContain(`${MIN_PASSPHRASE_LENGTH} karakter`)
  })

  it('layar pemulihan menyebut 5 percobaan & kunci 5 menit sesuai guard perangkat', () => {
    expect(RECOVERY_MAX_ATTEMPTS).toBe(5)
    // Copy boleh memakai angka atau kata bilangan; yang penting jumlahnya sama dengan guard.
    expect(SECURITY_TEXT).toMatch(new RegExp(`(5|lima) kode salah`, 'i'))
    expect(SECURITY_TEXT).toContain(`${RECOVERY_LOCK_MS / 60_000} menit`)
  })

  it('klaim "server tidak menyimpan kode pemulihan" konsisten dengan slot kunci server', () => {
    // Satu-satunya envelope yang boleh ada di server adalah passkey (ADR 11).
    expect([...KEY_SLOTS]).toEqual(['passkey'])
    expect(KEY_SLOTS as readonly string[]).not.toContain('recovery')
    expect(SECURITY_TEXT).toMatch(/server tidak menyimpan kode/i)
  })

  it('pemulihan lewat perangkat baru menyebut OTP bukan pembuka kunci & QR masih belum ada', () => {
    const [firstStep] = GUIDE_SECURITY.recoverySteps
    expect(firstStep).toMatch(/login/i)
    expect(firstStep).toMatch(/bukan membuka data/i)
    expect(GUIDE_SECURITY.soon).toMatch(/QR/i)
    expect(GUIDE_SECURITY.soon).toMatch(/belum/i)
  })

  it('menyatakan jujur bahwa semua pembuka hilang = data tidak bisa dipulihkan', () => {
    expect(GUIDE_SECURITY.lost).toMatch(/tidak bisa dipulihkan/i)
    expect(GUIDE_SECURITY.lost).toMatch(/tidak ada pintu belakang/i)
  })

  it('FAQ memuat topik wajib PRD F9: OTP vs passkey, server buta, dan backup', () => {
    const questions = GUIDE_FAQ.map((item) => item.question.toLowerCase()).join('\n')
    expect(questions).toMatch(/otp dan passkey/)
    expect(questions).toMatch(/server bisa baca/)
    expect(questions).toMatch(/lupa kode pemulihan/)
    expect(ALL_COPY).toMatch(/enkripsi/i)
    expect(ALL_COPY).toMatch(/backup/i)
  })
})

describe('status fitur jujur terhadap kode', () => {
  /**
   * F10 sudah punya halaman, composable, dan lulus QA T12: user benar-benar bisa mengunduh berkas
   * backup lalu memulihkannya. Panduan yang masih menulis "belum tersedia" membuat user tidak mencari
   * fitur yang justru menyelamatkan datanya.
   */
  it('Import / Export tidak dilabeli "soon" karena halamannya sudah jalan', () => {
    const importExport = GUIDE_FEATURES.find((feature) => feature.code === 'F10')
    expect(importExport).toBeDefined()
    expect(importExport?.status).not.toBe('soon')
    expect(importExport?.href).toBe(getFeature('import-export').path)
    expect(importExport?.summary).not.toMatch(/belum tersedia/i)
  })

  it('bagian backup tidak menyebut export/import sebagai "segera"', () => {
    const exportBlock = GUIDE_BACKUP.blocks.find((block) => /export/i.test(block.title))
    expect(exportBlock).toBeDefined()
    expect(exportBlock?.title).not.toMatch(/segera/i)
    expect(exportBlock?.body).not.toMatch(/belum tersedia/i)
  })

  it('tidak ada FAQ yang mengklaim export/import belum tersedia', () => {
    const exportFaq = GUIDE_FAQ.filter((item) => /export/i.test(item.answer))
    expect(exportFaq.length).toBeGreaterThan(0)
    for (const item of exportFaq) {
      expect(item.answer).not.toMatch(/belum tersedia/i)
      expect(item.answer).not.toMatch(/segera/i)
    }
  })
})

describe('keamanan konten panduan (XSS)', () => {
  // `process.cwd()` = akar paket `apps/web` saat test dijalankan lewat script paket / vitest.
  const guideDir = join(process.cwd(), 'app/components/features/guide')
  const sources = [
    join(process.cwd(), 'app/pages/app/panduan.vue'),
    join(process.cwd(), 'app/utils/guide.ts'),
    ...readdirSync(guideDir)
      .filter((file) => file.endsWith('.vue'))
      .map((file) => join(guideDir, file)),
  ]

  it('tidak ada v-html / innerHTML / eval di halaman panduan', () => {
    for (const file of sources) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/v-html/)
      expect(source, file).not.toMatch(/innerHTML/)
      expect(source, file).not.toMatch(/\beval\(/)
      expect(source, file).not.toMatch(/new Function/)
    }
  })

  it('copy panduan tidak memuat markup yang berharap dirender sebagai HTML', () => {
    for (const text of Object.values(GUIDE_COPY)) {
      if (typeof text !== 'string') continue
      expect(text).not.toMatch(/<[a-z][^>]*>/i)
    }

    expect(ALL_COPY).not.toMatch(/<script/i)
    expect(ALL_COPY).not.toMatch(/javascript:/i)
  })
})
